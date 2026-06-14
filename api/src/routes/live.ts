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

// POST /matches/:id/live-score { hole, gross } — post ONE hole as you play.
// Only on a PLAYING-TOGETHER match (where live scores spoil nothing). Upserts
// the single hole into the caller's card; when both rounds are complete, settles.
async function liveScore(auth: AuthContext, env: Env, matchId: string, request: Request): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  const isCreator = match.creator_id === auth.userId;
  const isOpponent = match.opponent_id === auth.userId;
  if (!isCreator && !isOpponent) return error('Not your match', 403);
  if (!match.playing_together) return error('Live scoring is only for same-group matches', 409);
  if (match.status !== 'accepted' && match.status !== 'in_progress') {
    return error(`Cannot live-score a ${match.status} match`, 409);
  }

  const range = holeRange(match.match_type);
  const body = await parseBody(request);
  const hole = Number(body.hole);
  const gross = Number(body.gross);
  if (!Number.isInteger(hole) || hole < range.min || hole > range.max) return error('Hole out of range', 400);
  if (!Number.isInteger(gross) || gross < 1 || gross > 15) return error('Score must be 1–15', 400);

  // Merge the one hole into the caller's existing card (or start a new one).
  const col = isCreator ? 'creator_scorecard_id' : 'opponent_scorecard_id';
  const existing = await env.DB.prepare('SELECT id, hole_scores FROM scorecards WHERE match_id = ? AND player_id = ?')
    .bind(matchId, auth.userId).first<{ id: string; hole_scores: string }>();
  const map = new Map<number, number>();
  if (existing) { try { for (const e of JSON.parse(existing.hole_scores)) map.set(e.hole, e.gross); } catch { /* reset */ } }
  map.set(hole, gross);
  const scores = [...map.entries()].map(([h, g]) => ({ hole: h, gross: g })).sort((a, b) => a.hole - b.hole);
  const total = scores.reduce((s, e) => s + e.gross, 0);
  const ts = now();
  const cardId = existing?.id ?? newId();
  await env.DB.prepare(
    `INSERT INTO scorecards (id, match_id, player_id, hole_scores, total_gross, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(match_id, player_id) DO UPDATE SET
       hole_scores = excluded.hole_scores, total_gross = excluded.total_gross, submitted_at = excluded.submitted_at`
  ).bind(cardId, matchId, auth.userId, JSON.stringify(scores), total, ts).run();

  await env.DB.prepare(
    `UPDATE matches SET ${col} = ?,
        status = CASE WHEN status = 'accepted' THEN 'in_progress' ELSE status END,
        updated_at = ? WHERE id = ?`
  ).bind(cardId, ts, matchId).run();

  // Settle only when BOTH rounds are fully entered (every hole by both) —
  // a partial card would compute a bogus result. computeLiveState counts holes
  // both have posted; holes_played === count means the round is complete.
  const fresh = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Record<string, any>>();
  if (fresh && fresh.status !== 'completed') {
    const running = await computeLiveState(env, fresh);
    if (running && running.holes_played === range.count) await settle(env, fresh);
  }
  const state = await buildLiveState(env, matchId, auth.userId);
  return json(state);
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

// Assemble the live payload: running tally (if visible) + presence + names.
async function buildLiveState(env: Env, matchId: string, viewerId: string, includeScores = true): Promise<Record<string, any>> {
  const match = await env.DB.prepare(
    `SELECT m.*, cu.first_name AS cf, cu.last_name AS cl, cu.profile_photo_url AS cp,
            ou.first_name AS of, ou.last_name AS ol, ou.profile_photo_url AS op
       FROM matches m JOIN users cu ON cu.id = m.creator_id
       LEFT JOIN users ou ON ou.id = m.opponent_id WHERE m.id = ?`
  ).bind(matchId).first<Record<string, any>>();
  const nm = (f: any, l: any, fb: string) => [f, l].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim() || fb;
  const fc = await env.DB.prepare('SELECT COUNT(*) AS n FROM match_followers WHERE match_id = ?').bind(matchId).first<{ n: number }>();

  const showScores = includeScores && !!match?.playing_together;
  const running = showScores ? await computeLiveState(env, match) : null;

  // The viewer's own posted holes (participants) — so the entry UI knows which
  // hole is next. Empty for spectators.
  let your_holes: number[] = [];
  const isParticipant = match?.creator_id === viewerId || match?.opponent_id === viewerId;
  const myCardId = match?.creator_id === viewerId ? match?.creator_scorecard_id
    : match?.opponent_id === viewerId ? match?.opponent_scorecard_id : null;
  if (isParticipant && myCardId) {
    const card = await env.DB.prepare('SELECT hole_scores FROM scorecards WHERE id = ?').bind(myCardId).first<{ hole_scores: string }>();
    if (card) { try { your_holes = JSON.parse(card.hole_scores).map((e: any) => e.hole); } catch { /* ignore */ } }
  }

  return {
    match_id: matchId,
    status: match?.status ?? null,
    playing_together: match?.playing_together ?? 0,
    follower_count: fc?.n ?? 0,
    creator_name: nm(match?.cf, match?.cl, 'A golfer'),
    opponent_name: match?.opponent_id ? nm(match?.of, match?.ol, 'Opponent') : null,
    creator_photo_url: match?.cp ?? null,
    opponent_photo_url: match?.op ?? null,
    viewer_is_creator: match?.creator_id === viewerId,
    viewer_is_participant: isParticipant,
    your_holes,
    match_type: match?.match_type ?? null,
    completed: match?.status === 'completed',
    running, // null for apart matches / spectators of apart matches / no course
  };
}
