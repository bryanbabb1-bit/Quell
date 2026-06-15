import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { newId, now } from '../lib/id';
import { parseBody } from '../lib/validate';
import { holeRange, settle, computeLiveState } from './scorecards';

// Live spectating + scoring (routed from index.ts under /matches/:id/...).
//   POST   /matches/:id/follow    spectate a match (INSERT OR IGNORE)
//   DELETE /matches/:id/follow    stop watching
//   POST   /matches/:id/live-score  post ONE hole (playing-together only)  [P3]
//   GET    /matches/:id/live        running state / presence               [P3]
//
// Presence (the 👁 follower count) is safe for ANY match — it carries no score
// data. Live SCORING is gated to playing_together matches (those two players
// already see each other's cards, so live scoring spoils nothing); apart
// matches keep the sealed hidden-card reveal.
export async function handleLive(
  request: Request,
  auth: AuthContext,
  env: Env,
  segments: string[]
): Promise<Response> {
  const matchId = segments[1];
  const action = segments[2];
  if (!matchId) return error('Match id required', 400);

  if (action === 'follow') return follow(request, auth, env, matchId);
  if (action === 'live-score' && request.method === 'POST') return liveScore(auth, env, matchId, request);
  if (action === 'confirm' && request.method === 'POST') return confirmCard(auth, env, matchId);
  if (action === 'cheer' && request.method === 'POST') return cheer(auth, env, matchId, request);
  if (action === 'reactors' && request.method === 'GET') return reactors(auth, env, matchId);
  if (action === 'live' && request.method === 'GET') return liveState(auth, env, matchId);
  return error('Not found', 404);
}

async function follow(request: Request, auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT visibility, creator_id, opponent_id FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  // You can watch a public match, or any match you're a participant in.
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  if (match.visibility !== 'public' && !isParticipant) return error('Not your match', 403);

  if (request.method === 'POST') {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO match_followers (id, match_id, user_id, created_at) VALUES (?, ?, ?, ?)'
    ).bind(newId(), matchId, auth.userId, now()).run();
  } else if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM match_followers WHERE match_id = ? AND user_id = ?')
      .bind(matchId, auth.userId).run();
  } else {
    return error('Method not allowed', 405);
  }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM match_followers WHERE match_id = ?')
    .bind(matchId).first<{ n: number }>();
  return json({ following: request.method === 'POST', count: n?.n ?? 0 });
}

// POST /matches/:id/live-score { hole, creator_gross?, opponent_gross? } — post a
// hole as you play. On a PLAYING-TOGETHER match either participant may set EITHER
// side (one person can keep both cards). The match no longer auto-settles; once
// both rounds are full it waits for each player to CONFIRM the card.
async function liveScore(auth: AuthContext, env: Env, matchId: string, request: Request): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  if (!isParticipant) return error('Not your match', 403);
  if (!match.playing_together) return error('Live scoring is only for same-group matches', 409);
  if (match.status !== 'accepted' && match.status !== 'in_progress') {
    return error(`Cannot live-score a ${match.status} match`, 409);
  }

  const range = holeRange(match.match_type);
  const body = await parseBody(request);
  const hole = Number(body.hole);
  if (!Number.isInteger(hole) || hole < range.min || hole > range.max) return error('Hole out of range', 400);

  // Either/both sides. At least one gross must be present and valid.
  const sides: { who: 'creator' | 'opponent'; gross: number }[] = [];
  for (const [key, who] of [['creator_gross', 'creator'], ['opponent_gross', 'opponent']] as const) {
    if (body[key] === undefined || body[key] === null) continue;
    const g = Number(body[key]);
    if (!Number.isInteger(g) || g < 1 || g > 15) return error(`${who} score must be 1–15`, 400);
    sides.push({ who, gross: g });
  }
  if (sides.length === 0) return error('Provide creator_gross and/or opponent_gross', 400);
  if (match.creator_id == null && sides.some((s) => s.who === 'creator')) return error('No creator', 400);
  if (match.opponent_id == null && sides.some((s) => s.who === 'opponent')) return error('No opponent yet', 409);

  const ts = now();
  for (const { who, gross } of sides) {
    const playerId = who === 'creator' ? match.creator_id : match.opponent_id;
    const col = who === 'creator' ? 'creator_scorecard_id' : 'opponent_scorecard_id';
    const existing = await env.DB.prepare('SELECT id, hole_scores FROM scorecards WHERE match_id = ? AND player_id = ?')
      .bind(matchId, playerId).first<{ id: string; hole_scores: string }>();
    const map = new Map<number, number>();
    if (existing) { try { for (const e of JSON.parse(existing.hole_scores)) map.set(e.hole, e.gross); } catch { /* reset */ } }
    map.set(hole, gross);
    const scores = [...map.entries()].map(([h, g]) => ({ hole: h, gross: g })).sort((a, b) => a.hole - b.hole);
    const totalGross = scores.reduce((s, e) => s + e.gross, 0);
    const cardId = existing?.id ?? newId();
    await env.DB.prepare(
      `INSERT INTO scorecards (id, match_id, player_id, hole_scores, total_gross, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(match_id, player_id) DO UPDATE SET
         hole_scores = excluded.hole_scores, total_gross = excluded.total_gross, submitted_at = excluded.submitted_at`
    ).bind(cardId, matchId, playerId, JSON.stringify(scores), totalGross, ts).run();
    await env.DB.prepare(`UPDATE matches SET ${col} = ?, updated_at = ? WHERE id = ?`).bind(cardId, ts, matchId).run();
  }

  // accepted → in_progress on first entry; any edit clears confirmations (the
  // card changed, so both must re-attest).
  await env.DB.prepare(
    `UPDATE matches SET status = CASE WHEN status = 'accepted' THEN 'in_progress' ELSE status END,
        creator_confirmed = 0, opponent_confirmed = 0, updated_at = ? WHERE id = ?`
  ).bind(ts, matchId).run();

  return json(await buildLiveState(env, matchId, auth.userId));
}

// POST /matches/:id/confirm — a participant attests the final card. When BOTH
// have confirmed (and the round is complete) the match settles → reveal.
async function confirmCard(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  const isCreator = match.creator_id === auth.userId;
  const isOpponent = match.opponent_id === auth.userId;
  if (!isCreator && !isOpponent) return error('Not your match', 403);
  if (match.status !== 'in_progress') return error(`Cannot confirm a ${match.status} match`, 409);

  // Only confirmable once the round is actually complete for both.
  const range = holeRange(match.match_type);
  const gc = await computeLiveState(env, match);
  if (!gc || gc.holes_played !== range.count) return error('Round is not complete yet', 409);

  const col = isCreator ? 'creator_confirmed' : 'opponent_confirmed';
  await env.DB.prepare(`UPDATE matches SET ${col} = 1, updated_at = ? WHERE id = ?`).bind(now(), matchId).run();

  const fresh = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Record<string, any>>();
  if (fresh?.creator_confirmed && fresh?.opponent_confirmed && fresh.status !== 'completed') {
    await settle(env, fresh);
  }
  return json(await buildLiveState(env, matchId, auth.userId));
}

const CHEER_KINDS = ['fire', 'clap', 'flag', 'shock'] as const;
const CHEER_SET = new Set<string>(CHEER_KINDS);
const fullName = (f: any, l: any, fb: string) => [f, l].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim() || fb;

// POST /matches/:id/cheer { kind } — a spectator (or player) reaction, now a
// TOGGLE: tapping again removes your reaction (one per person per kind, enforced
// by the unique index). Count per kind = distinct people. Returns the fresh
// tallies + the caller's active reactions so the client can reconcile.
async function cheer(auth: AuthContext, env: Env, matchId: string, request: Request): Promise<Response> {
  const match = await env.DB.prepare('SELECT visibility, creator_id, opponent_id FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  if (match.visibility !== 'public' && !isParticipant) return error('Not your match', 403);
  const body = await parseBody(request);
  const kind = String(body.kind ?? '');
  if (!CHEER_SET.has(kind)) return error('Unknown reaction', 400);

  const existing = await env.DB.prepare('SELECT id FROM match_reactions WHERE match_id = ? AND user_id = ? AND kind = ?')
    .bind(matchId, auth.userId, kind).first();
  let reacted: boolean;
  if (existing) {
    await env.DB.prepare('DELETE FROM match_reactions WHERE match_id = ? AND user_id = ? AND kind = ?')
      .bind(matchId, auth.userId, kind).run();
    reacted = false;
  } else {
    await env.DB.prepare('INSERT OR IGNORE INTO match_reactions (id, match_id, user_id, kind, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(newId(), matchId, auth.userId, kind, now()).run();
    reacted = true;
  }

  const [agg, mine] = await Promise.all([
    env.DB.prepare('SELECT kind, COUNT(*) AS n FROM match_reactions WHERE match_id = ? GROUP BY kind').bind(matchId).all<{ kind: string; n: number }>(),
    env.DB.prepare('SELECT kind FROM match_reactions WHERE match_id = ? AND user_id = ?').bind(matchId, auth.userId).all<{ kind: string }>(),
  ]);
  return json({
    reacted,
    reactions: Object.fromEntries((agg.results ?? []).map((r) => [r.kind, r.n])),
    your_reactions: (mine.results ?? []).map((r) => r.kind),
  });
}

// GET /matches/:id/reactors — who reacted, grouped by kind. PARTICIPANT-ONLY
// (it names people; spectators just see counts). Powers the long-press sheet.
async function reactors(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT creator_id, opponent_id FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  if (!isParticipant) return error('Only players can see who reacted', 403);

  const { results } = await env.DB.prepare(
    `SELECT r.kind AS kind, u.first_name AS f, u.last_name AS l, u.profile_photo_url AS p
       FROM match_reactions r JOIN users u ON u.id = r.user_id
      WHERE r.match_id = ? ORDER BY r.created_at DESC`
  ).bind(matchId).all<Record<string, any>>();
  const byKind: Record<string, { name: string; photo_url: string | null }[]> = { fire: [], clap: [], flag: [], shock: [] };
  for (const row of results ?? []) {
    (byKind[row.kind] ??= []).push({ name: fullName(row.f, row.l, 'A golfer'), photo_url: row.p ?? null });
  }
  return json({ reactors: byKind });
}

// GET /matches/:id/live — the running state. Participants always; spectators
// only on a PUBLIC, playing-together match (apart matches never expose live
// scores — presence only).
async function liveState(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT visibility, creator_id, opponent_id, playing_together, status FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  const canSeeScores = match.playing_together && (isParticipant || match.visibility === 'public');
  if (!isParticipant && match.visibility !== 'public') return error('Not your match', 403);
  return json(await buildLiveState(env, matchId, auth.userId, canSeeScores));
}

// Assemble the live gamecast payload: rich running state + presence + names +
// follower avatars + reaction tallies + confirmation state.
async function buildLiveState(env: Env, matchId: string, viewerId: string, includeScores = true): Promise<Record<string, any>> {
  const match = await env.DB.prepare(
    `SELECT m.*, cu.first_name AS cf, cu.last_name AS cl, cu.profile_photo_url AS cp,
            ou.first_name AS of, ou.last_name AS ol, ou.profile_photo_url AS op
       FROM matches m JOIN users cu ON cu.id = m.creator_id
       LEFT JOIN users ou ON ou.id = m.opponent_id WHERE m.id = ?`
  ).bind(matchId).first<Record<string, any>>();
  const nm = (f: any, l: any, fb: string) => [f, l].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim() || fb;

  const showScores = includeScores && !!match?.playing_together;
  const [followers, reactions, running] = await Promise.all([
    // A few follower faces for the avatar stack + the total count.
    env.DB.prepare(
      `SELECT u.id, u.first_name AS f, u.last_name AS l, u.profile_photo_url AS p
         FROM match_followers mf JOIN users u ON u.id = mf.user_id
        WHERE mf.match_id = ? ORDER BY mf.created_at DESC LIMIT 8`
    ).bind(matchId).all<Record<string, any>>(),
    env.DB.prepare('SELECT kind, COUNT(*) AS n FROM match_reactions WHERE match_id = ? GROUP BY kind').bind(matchId).all<{ kind: string; n: number }>(),
    showScores ? computeLiveState(env, match) : Promise.resolve(null),
  ]);
  const fcRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM match_followers WHERE match_id = ?').bind(matchId).first<{ n: number }>();
  const myReact = await env.DB.prepare('SELECT kind FROM match_reactions WHERE match_id = ? AND user_id = ?').bind(matchId, viewerId).all<{ kind: string }>();

  // Viewer's own posted holes (participants) → the entry UI's next hole.
  let your_holes: number[] = [];
  const isParticipant = match?.creator_id === viewerId || match?.opponent_id === viewerId;
  const myCardId = match?.creator_id === viewerId ? match?.creator_scorecard_id
    : match?.opponent_id === viewerId ? match?.opponent_scorecard_id : null;
  if (isParticipant && myCardId) {
    const card = await env.DB.prepare('SELECT hole_scores FROM scorecards WHERE id = ?').bind(myCardId).first<{ hole_scores: string }>();
    if (card) { try { your_holes = JSON.parse(card.hole_scores).map((e: any) => e.hole); } catch { /* ignore */ } }
  }

  const range = match?.match_type ? holeRange(match.match_type) : null;
  const roundComplete = !!running && !!range && running.holes_played === range.count;
  const awaiting_confirmation = roundComplete && match?.status === 'in_progress'
    && !(match?.creator_confirmed && match?.opponent_confirmed);

  return {
    match_id: matchId,
    status: match?.status ?? null,
    playing_together: match?.playing_together ?? 0,
    follower_count: fcRow?.n ?? 0,
    followers: (followers.results ?? []).map((u) => ({ name: nm(u.f, u.l, 'A golfer'), photo_url: u.p ?? null })),
    reactions: Object.fromEntries((reactions.results ?? []).map((r) => [r.kind, r.n])),
    your_reactions: (myReact.results ?? []).map((r) => r.kind),
    creator_name: nm(match?.cf, match?.cl, 'A golfer'),
    opponent_name: match?.opponent_id ? nm(match?.of, match?.ol, 'Opponent') : null,
    creator_photo_url: match?.cp ?? null,
    opponent_photo_url: match?.op ?? null,
    viewer_is_creator: match?.creator_id === viewerId,
    viewer_is_participant: isParticipant,
    your_holes,
    match_type: match?.match_type ?? null,
    creator_confirmed: !!match?.creator_confirmed,
    opponent_confirmed: !!match?.opponent_confirmed,
    round_complete: roundComplete,
    awaiting_confirmation,
    completed: match?.status === 'completed',
    running, // the Gamecast (null for apart / spectator-of-apart / no course)
  };
}
