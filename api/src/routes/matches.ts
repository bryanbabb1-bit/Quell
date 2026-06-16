import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { MATCH_TYPES, VISIBILITIES } from '../types';
import { json, error } from '../lib/response';
import { sendPush } from '../lib/push';
import { newId, now } from '../lib/id';
import {
  parseBody, requireString, optionalString, requireEnum,
  requireInt, optionalNumber, requireDate, optionalTime,
} from '../lib/validate';

// Match lifecycle + discovery (build-order steps 3–4).
//   GET    /matches              discovery feed (open, compatible, not mine)
//   POST   /matches              create an `open` match
//   GET    /matches/mine         the caller's matches (created or opponent)
//   GET    /matches/:id          one match (participant, or any open match)
//   POST   /matches/:id/accept   open -> accepted; SNAPSHOTS both handicaps
//   POST   /matches/:id/cancel   creator cancels open/accepted -> cancelled
//   POST   /matches/:id/decline  opponent backs out of accepted -> declined
//   GET    /matches/feed         course feed (public matches at a course/day)
//   POST   /matches/:id/visibility  creator flips private/public (pre-scorecard)
//
// The hidden-card lock (Phase 3) lives on the scorecard sub-resource, not here.
export async function handleMatches(
  request: Request,
  auth: AuthContext,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const second = segments[1]; // 'mine' | <matchId> | undefined
  const action = segments[2]; // 'accept' | 'cancel' | 'decline' | undefined

  if (!second) {
    if (method === 'GET') return discover(auth, env, request);
    if (method === 'POST') return create(auth, request, env);
    return error('Method not allowed', 405);
  }

  if (second === 'mine' && method === 'GET') {
    return listMine(auth, env);
  }

  if (second === 'feed' && method === 'GET') {
    return courseFeed(auth, env, request);
  }

  const matchId = second;

  if (!action) {
    if (method === 'GET') return getOne(auth, env, matchId);
    return error('Method not allowed', 405);
  }

  if (action === 'tees' && method === 'GET') return matchTees(auth, env, matchId);
  if (action === 'tee' && method === 'POST') return setTee(auth, env, matchId, request);

  if (method === 'POST') {
    if (action === 'visibility') return setVisibility(auth, env, matchId, request);
    if (action === 'scoring-started') return scoringStarted(auth, env, matchId);
    if (action === 'nudge') return nudge(auth, env, matchId);
    if (action === 'accept') return accept(auth, env, matchId);
    if (action === 'cancel') return cancel(auth, env, matchId);
    if (action === 'decline') return decline(auth, env, matchId);
  }
  return error('Not found', 404);
}

// ── Discovery ────────────────────────────────────────────────────────────────
// Open matches the caller could accept: not their own, upcoming, and whose
// creator-set handicap window contains the caller's index. When the caller has
// no handicap set yet, the range filter is skipped (onboarding will set it).
async function discover(auth: AuthContext, env: Env, request: Request): Promise<Response> {
  const me = await env.DB.prepare('SELECT handicap, home_course_id FROM users WHERE id = ?')
    .bind(auth.userId).first<{ handicap: number | null; home_course_id: string | null }>();
  // Floor on the caller's LOCAL today (passed as ?from) so a match posted for
  // "today" doesn't drop off in the evening when the Worker's UTC clock has
  // already rolled to tomorrow. Fall back to the server's UTC date.
  const fromParam = new URL(request.url).searchParams.get('from');
  const today = (fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)) ? fromParam : now().slice(0, 10);

  // Optional search params (the Discovery filter sheet sets these):
  //   match_type=front_nine|back_nine|eighteen   course=<substring>
  //   all=1  → browse everything: ignore the handicap window AND the home-course
  //            default. Otherwise the feed defaults to the player's home course.
  const url = new URL(request.url);
  const qpType = url.searchParams.get('match_type');
  const qpCourse = (url.searchParams.get('course') ?? '').trim();
  const showAll = url.searchParams.get('all') === '1';
  // Optional upper bound on the play date (the "When" filter range, e.g. only
  // matches in the next 7 days). Must be a YYYY-MM-DD string.
  const qpUntil = url.searchParams.get('until');
  const untilDate = qpUntil && /^\d{4}-\d{2}-\d{2}$/.test(qpUntil) ? qpUntil : null;

  let sql =
    `SELECT m.*, u.first_name AS creator_first_name, u.last_name AS creator_last_name,
            u.handicap AS creator_handicap_index, u.profile_photo_url AS creator_photo_url
       FROM matches m JOIN users u ON u.id = m.creator_id
      WHERE m.status = 'open' AND m.creator_id != ? AND m.play_date >= ?
        AND m.creator_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
        AND m.creator_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)`;
  const binds: unknown[] = [auth.userId, today, auth.userId, auth.userId];

  // The handicap window is the CREATOR's preference, not an eligibility gate —
  // accept() doesn't enforce it (a lower-handicap player can accept and give
  // strokes; that's normal match play). So it's a SOFT sort, not a hard filter:
  // matches whose window includes you lead, the rest still show. (It used to
  // hard-filter, which silently emptied an explicit course search for anyone
  // whose index fell outside the posted ranges — the confusing "no results, but
  // toggling Favorites reveals a match" bug.)
  const softHcp = me?.handicap != null && !showAll;

  if (qpType && (MATCH_TYPES as readonly string[]).includes(qpType)) {
    sql += ' AND m.match_type = ?';
    binds.push(qpType);
  }
  // Play style: same group (playing_together) vs separate rounds. Literal, no bind.
  const qpStyle = url.searchParams.get('play_style');
  if (qpStyle === 'together') sql += ' AND m.playing_together = 1';
  else if (qpStyle === 'apart') sql += ' AND m.playing_together = 0';
  if (untilDate) {
    sql += ' AND m.play_date <= ?';
    binds.push(untilDate);
  }
  // Specific days the player can play (the "When" multi-select). Validated dates,
  // capped so a hostile caller can't blow out the bind-parameter budget.
  const qpDays = (url.searchParams.get('days') ?? '').split(',').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).slice(0, 14);
  if (qpDays.length) {
    sql += ` AND m.play_date IN (${qpDays.map(() => '?').join(',')})`;
    binds.push(...qpDays);
  }
  // Course: an explicit search is a hard filter. The home course is only a
  // SOFT preference — home-course matches sort first, everything else follows.
  let homePref: string | null = null;
  if (qpCourse) {
    sql += ' AND m.course_name LIKE ?';
    binds.push(`%${qpCourse}%`);
  } else if (!showAll && me?.home_course_id) {
    const home = await env.DB.prepare('SELECT name FROM courses WHERE id = ?')
      .bind(me.home_course_id).first<{ name: string }>();
    homePref = home?.name ?? null;
  }

  // ORDER BY: handicap-compatible first, then home course, then soonest. The
  // ORDER BY binds come AFTER every WHERE bind, in the order the terms appear.
  const orderTerms: string[] = [];
  const orderBinds: unknown[] = [];
  if (softHcp) {
    orderTerms.push('CASE WHEN ? BETWEEN m.hcp_range_min AND m.hcp_range_max THEN 0 ELSE 1 END');
    orderBinds.push(me!.handicap);
  }
  if (homePref) {
    orderTerms.push('CASE WHEN m.course_name = ? THEN 0 ELSE 1 END');
    orderBinds.push(homePref);
  }
  orderTerms.push('m.play_date ASC', 'm.created_at DESC');
  sql += ' ORDER BY ' + orderTerms.join(', ') + ' LIMIT 100';
  binds.push(...orderBinds);

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ matches: results });
}

// ── Create ───────────────────────────────────────────────────────────────────
async function create(auth: AuthContext, request: Request, env: Env): Promise<Response> {
  const body = await parseBody(request);

  // Optional structured tee link. When present, it's what the engine uses to
  // settle the match; course_name/tee_color are still stored for display. When
  // omitted (the current free-text create flow has no course picker yet), default
  // to a tee from the catalog so the match is still scorable — otherwise it could
  // never settle. Drops out cleanly once a real course/tee picker exists.
  let tee_id = optionalString(body.tee_id, 'tee_id', 32);
  if (tee_id) {
    const tee = await env.DB.prepare('SELECT id FROM tees WHERE id = ?').bind(tee_id).first();
    if (!tee) return error('Unknown tee_id', 400);
  } else {
    const fallback = await env.DB.prepare('SELECT id FROM tees ORDER BY id LIMIT 1').first<{ id: string }>();
    tee_id = fallback?.id ?? null;
  }

  const course_name = requireString(body.course_name, 'course_name');
  const tee_color = requireString(body.tee_color, 'tee_color', 32);
  const play_date = requireDate(body.play_date, 'play_date');
  const play_time = optionalTime(body.play_time, 'play_time');
  const match_type = requireEnum(body.match_type, MATCH_TYPES, 'match_type');
  const stakes = optionalNumber(body.stakes, 'stakes'); // DISPLAY ONLY
  const hcp_range_min = requireInt(body.hcp_range_min, 'hcp_range_min');
  const hcp_range_max = requireInt(body.hcp_range_max, 'hcp_range_max');
  if (hcp_range_min > hcp_range_max) {
    return error('hcp_range_min must be <= hcp_range_max', 400);
  }
  // Realistic WHS bounds — also stops a -9999..9999 range that would match every
  // player in discovery.
  if (hcp_range_min < -10 || hcp_range_max > 54) {
    return error('Handicap range must be between -10 and 54', 400);
  }

  // Cap how many unresolved posts one player can have — bounds challenge/post
  // spam beyond the global rate limit.
  const openCount = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM matches WHERE creator_id = ? AND status IN ('open','pending')`
  ).bind(auth.userId).first<{ n: number }>();
  if ((openCount?.n ?? 0) >= 10) {
    return error('You already have 10 open matches — cancel one first', 429);
  }

  // Visibility (optional; defaults to private). Public matches surface in the
  // course feed once they're being played.
  const visibility = (body.visibility === undefined || body.visibility === null)
    ? 'private'
    : requireEnum(body.visibility, VISIBILITIES, 'visibility');

  // Playing together (same group) vs apart (the default — the novel premise).
  // Gates live scoring later. Coerced to 0/1.
  const playing_together = body.playing_together === true || body.playing_together === 1 ? 1 : 0;

  // Direct challenge: when opponent_id is present the match is pre-addressed to
  // one player and starts as 'pending' (they accept/decline) instead of 'open'.
  const opponent_id = optionalString(body.opponent_id, 'opponent_id', 64);
  let status = 'open';
  if (opponent_id) {
    if (opponent_id === auth.userId) return error('You cannot challenge yourself', 400);
    const opp = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(opponent_id).first();
    if (!opp) return error('Unknown opponent', 400);
    // A block in either direction kills direct challenges.
    const blocked = await env.DB.prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
    ).bind(auth.userId, opponent_id, opponent_id, auth.userId).first();
    if (blocked) return error('You cannot challenge this player', 403);
    status = 'pending';
  }

  // Lock the creator's Handicap Index onto the match at post time (the app
  // nudges them to confirm/refresh it first). The opponent's is locked at accept.
  const creator = await env.DB.prepare('SELECT first_name, handicap FROM users WHERE id = ?')
    .bind(auth.userId).first<{ first_name: string | null; handicap: number | null }>();

  const id = newId();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO matches
       (id, creator_id, opponent_id, status, course_name, tee_color, tee_id, play_date, play_time,
        match_type, stakes, hcp_range_min, hcp_range_max, creator_handicap, visibility, playing_together, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, auth.userId, opponent_id ?? null, status, course_name, tee_color, tee_id, play_date, play_time,
    match_type, stakes, hcp_range_min, hcp_range_max, creator?.handicap ?? null, visibility, playing_together, ts, ts
  ).run();

  if (opponent_id) {
    const who = creator?.first_name?.trim() || 'Someone';
    await sendPush(env, opponent_id, `${who} challenged you to a match`, `${course_name} · tap to accept or decline.`, { matchId: id });
  }

  const match = await enrichedMatch(env, id);
  return json(match, 201);
}

// Fetch a match with derived display names + photos (the shape a participant
// expects). Mutation endpoints return THIS so the client never flashes a
// "Creator/Opponent" placeholder while waiting for the next poll to refetch.
async function enrichedMatch(env: Env, matchId: string): Promise<Record<string, any> | null> {
  const m = await env.DB.prepare(
    `SELECT m.*,
            cu.first_name AS creator_first_name, cu.last_name AS creator_last_name, cu.profile_photo_url AS creator_photo_url,
            ou.first_name AS opponent_first_name, ou.last_name AS opponent_last_name, ou.profile_photo_url AS opponent_photo_url
       FROM matches m
       JOIN users cu ON cu.id = m.creator_id
       LEFT JOIN users ou ON ou.id = m.opponent_id
      WHERE m.id = ?`
  ).bind(matchId).first<Record<string, any>>();
  if (!m) return null;
  const nm = (f: unknown, l: unknown): string | null => {
    const n = [f, l].filter((s) => typeof s === 'string' && (s as string).trim()).join(' ').trim();
    return n || null;
  };
  m.creator_name = nm(m.creator_first_name, m.creator_last_name) ?? 'A golfer';
  m.opponent_name = m.opponent_id ? (nm(m.opponent_first_name, m.opponent_last_name) ?? 'Opponent') : null;
  return m;
}

// ── Mine ─────────────────────────────────────────────────────────────────────
async function listMine(auth: AuthContext, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT m.*,
            cu.first_name AS creator_first_name, cu.last_name AS creator_last_name,
            ou.first_name AS opponent_first_name, ou.last_name AS opponent_last_name
       FROM matches m
       JOIN users cu ON cu.id = m.creator_id
       LEFT JOIN users ou ON ou.id = m.opponent_id
      WHERE m.creator_id = ? OR m.opponent_id = ?
      ORDER BY m.play_date DESC, m.created_at DESC LIMIT 200`
  ).bind(auth.userId, auth.userId).all<Record<string, any>>();

  const name = (f: unknown, l: unknown): string | null => {
    const n = [f, l].filter((s) => typeof s === 'string' && (s as string).trim()).join(' ').trim();
    return n || null;
  };
  const matches = (results ?? []).map((m) => {
    // Viewer-perspective outcome + scoreline, so the list can show "Won 3 & 2"
    // (the client still gates it behind "have you seen the reveal" to avoid
    // spoilers). A completed match missing a card was a forfeit.
    let outcome: 'win' | 'loss' | 'tie' | null = null;
    let final_delta: string | null = null;
    const is_forfeit = m.status === 'completed' && (!m.creator_scorecard_id || !m.opponent_scorecard_id);
    if (m.status === 'completed' && m.result) {
      const amCreator = m.creator_id === auth.userId;
      outcome = m.result === 'tie' ? 'tie' : (m.result === 'creator_wins') === amCreator ? 'win' : 'loss';
      try { final_delta = m.match_progression ? JSON.parse(m.match_progression).final_delta ?? null : null; } catch { /* ignore */ }
    }
    return {
      ...m,
      creator_name: name(m.creator_first_name, m.creator_last_name) ?? 'A golfer',
      opponent_name: m.opponent_id ? (name(m.opponent_first_name, m.opponent_last_name) ?? 'Opponent') : null,
      outcome, final_delta, is_forfeit,
    };
  });
  return json({ matches });
}

// ── Get one ──────────────────────────────────────────────────────────────────
async function getOne(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare(
    `SELECT m.*,
            cu.first_name AS creator_first_name, cu.last_name AS creator_last_name, cu.profile_photo_url AS creator_photo_url,
            ou.first_name AS opponent_first_name, ou.last_name AS opponent_last_name, ou.profile_photo_url AS opponent_photo_url
       FROM matches m
       JOIN users cu ON cu.id = m.creator_id
       LEFT JOIN users ou ON ou.id = m.opponent_id
      WHERE m.id = ?`,
  ).bind(matchId).first<Record<string, unknown>>();
  if (!match) return error('Match not found', 404);

  // Visible if the caller is a participant, an open match anyone could accept, or
  // a public match (surfaced via the course feed — players + result, read-only).
  // (Scorecard contents are gated separately in Phase 3.)
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  if (!isParticipant && match.status !== 'open' && match.visibility !== 'public') {
    return error('Match not found', 404);
  }

  // Non-participants get a display-safe projection: no handicap indexes, no
  // stakes, no hole-by-hole progression, no scorecard ids. (The reveal endpoint
  // separately serves public COMPLETED matches in full — that's the deliberate
  // spectator surface; this guards casual detail reads.)
  if (!isParticipant) {
    for (const k of ['creator_handicap', 'opponent_handicap', 'stakes', 'match_progression',
                     'creator_scorecard_id', 'opponent_scorecard_id', 'score_reminder_at',
                     'forfeit_warning_at', 'nudge_last_sent_at', 'creator_scoring_at',
                     'opponent_scoring_at'] as const) {
      match[k] = null;
    }
  }

  // Derived display names so the client can label the Players card with real
  // names instead of "creator/opponent".
  const fullName = (f: unknown, l: unknown): string | null => {
    const name = [f, l].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim();
    return name || null;
  };
  match.creator_name = fullName(match.creator_first_name, match.creator_last_name) ?? 'A golfer';
  match.opponent_name = match.opponent_id
    ? fullName(match.opponent_first_name, match.opponent_last_name) ?? 'Opponent'
    : null;

  return json(match);
}

// ── Accept ───────────────────────────────────────────────────────────────────
// First eligible golfer to accept claims the open match. The OPPONENT's index is
// snapshotted here; the CREATOR's was locked at post time (COALESCE keeps it,
// falling back to the creator's current index for legacy matches). Locking both
// pre-round means a later index change can't rewrite a settled match, and the
// index can't be gamed at score entry. Course adjustment happens at settle time.
async function accept(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  if (match.creator_id === auth.userId) return error('You cannot accept your own match', 400);

  // 'open' = first eligible golfer claims it; 'pending' = a direct challenge only
  // the targeted opponent can accept.
  const isOpen = match.status === 'open';
  const isMyChallenge = match.status === 'pending' && match.opponent_id === auth.userId;
  if (!isOpen && !isMyChallenge) return error('This match can no longer be accepted', 409);

  // A block in either direction means these two never get matched.
  const blocked = await env.DB.prepare(
    'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
  ).bind(auth.userId, match.creator_id, match.creator_id, auth.userId).first();
  if (blocked) return error('This match can no longer be accepted', 409);

  const [creator, opponent] = await Promise.all([
    env.DB.prepare('SELECT handicap FROM users WHERE id = ?').bind(match.creator_id).first<{ handicap: number | null }>(),
    env.DB.prepare('SELECT handicap FROM users WHERE id = ?').bind(auth.userId).first<{ handicap: number | null }>(),
  ]);

  const ts = now();
  // The opponent defaults to the creator's tee (same as the prior single-tee
  // behavior); they can switch to their own tee from the match screen before
  // they score (POST /matches/:id/tee).
  const ot = match.tee_id ?? null;
  const otc = match.tee_color ?? null;
  // Conditional UPDATE guards a race (two golfers accepting the same open match);
  // only the first whose status still matches wins.
  const res = isOpen
    ? await env.DB.prepare(
        `UPDATE matches SET opponent_id = ?, status = 'accepted',
            opponent_tee_id = ?, opponent_tee_color = ?,
            creator_handicap = COALESCE(creator_handicap, ?), opponent_handicap = ?, updated_at = ?
          WHERE id = ? AND status = 'open'`
      ).bind(auth.userId, ot, otc, creator?.handicap ?? null, opponent?.handicap ?? null, ts, matchId).run()
    : await env.DB.prepare(
        `UPDATE matches SET status = 'accepted',
            opponent_tee_id = ?, opponent_tee_color = ?,
            creator_handicap = COALESCE(creator_handicap, ?), opponent_handicap = ?, updated_at = ?
          WHERE id = ? AND status = 'pending' AND opponent_id = ?`
      ).bind(ot, otc, creator?.handicap ?? null, opponent?.handicap ?? null, ts, matchId, auth.userId).run();

  if (!res.meta.changes) return error('This match can no longer be accepted', 409);

  // Tell the creator their challenge was accepted.
  if (isMyChallenge) {
    const me = await env.DB.prepare('SELECT first_name FROM users WHERE id = ?').bind(auth.userId).first<{ first_name: string | null }>();
    await sendPush(env, match.creator_id, `${me?.first_name?.trim() || 'Your challenge'} accepted`, 'Your match is on — enter your scores after you play.', { matchId });
  }

  return json(await enrichedMatch(env, matchId));
}

// ── Tees on a match's course ─────────────────────────────────────────────────
// GET /matches/:id/tees — the tees available on this match's course (resolved
// via the creator's tee → course), so a participant can switch to their own tee.
async function matchTees(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT creator_id, opponent_id, tee_id FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  if (match.creator_id !== auth.userId && match.opponent_id !== auth.userId) {
    return error('Not your match', 403);
  }
  if (!match.tee_id) return json({ tees: [] });

  const tee = await env.DB.prepare('SELECT course_id FROM tees WHERE id = ?').bind(match.tee_id).first<{ course_id: string }>();
  if (!tee) return json({ tees: [] });
  const { results } = await env.DB.prepare(
    'SELECT * FROM tees WHERE course_id = ? ORDER BY course_rating DESC'
  ).bind(tee.course_id).all();
  return json({ tees: results });
}

// ── Pick your tee ────────────────────────────────────────────────────────────
// POST /matches/:id/tee { tee_id } — set the tee YOU play (creator → tee_id,
// opponent → opponent_tee_id). Allowed only before you've submitted your card,
// and only to a tee on the same course. Each player's course handicap + strokes
// are recomputed from their own tee at settle.
async function setTee(auth: AuthContext, env: Env, matchId: string, request: Request): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  const isCreator = match.creator_id === auth.userId;
  const isOpponent = match.opponent_id === auth.userId;
  if (!isCreator && !isOpponent) return error('Not your match', 403);
  if (match.status !== 'accepted' && match.status !== 'in_progress') {
    return error(`Cannot change tees on a ${match.status} match`, 409);
  }
  // Can't change your tee once your scores are in — it would move your strokes
  // after the fact.
  const myCard = isCreator ? match.creator_scorecard_id : match.opponent_scorecard_id;
  if (myCard) return error('You already entered scores — tees are locked', 409);

  // A match with no linked tee has no course to validate against — refuse rather
  // than let someone attach a tee from an arbitrary course.
  if (!match.tee_id) return error('This match has no course linked — tees cannot be changed', 409);

  const body = await parseBody(request);
  const teeId = requireString(body.tee_id, 'tee_id', 32);
  const tee = await env.DB.prepare('SELECT id, name, course_id FROM tees WHERE id = ?')
    .bind(teeId).first<{ id: string; name: string; course_id: string }>();
  if (!tee) return error('Unknown tee_id', 400);

  // Must be a tee on THIS match's course.
  const baseTee = await env.DB.prepare('SELECT course_id FROM tees WHERE id = ?')
    .bind(match.tee_id).first<{ course_id: string }>();
  if (baseTee && baseTee.course_id !== tee.course_id) {
    return error('That tee is on a different course', 400);
  }

  const ts = now();
  if (isCreator) {
    await env.DB.prepare('UPDATE matches SET tee_id = ?, tee_color = ?, updated_at = ? WHERE id = ?')
      .bind(tee.id, tee.name, ts, matchId).run();
  } else {
    await env.DB.prepare('UPDATE matches SET opponent_tee_id = ?, opponent_tee_color = ?, updated_at = ? WHERE id = ?')
      .bind(tee.id, tee.name, ts, matchId).run();
  }
  return json(await enrichedMatch(env, matchId));
}

// ── Nudge (remind the other player to enter their scores) ────────────────────
// POST /matches/:id/nudge — push the OTHER player a reminder to post their card.
// Only on a live match, only if that player hasn't already submitted.
async function nudge(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  const isCreator = match.creator_id === auth.userId;
  const isOpponent = match.opponent_id === auth.userId;
  if (!isCreator && !isOpponent) return error('Not your match', 403);
  if (match.status !== 'accepted' && match.status !== 'in_progress') {
    return error(`Cannot nudge on a ${match.status} match`, 409);
  }
  const targetId = (isCreator ? match.opponent_id : match.creator_id) as string | null;
  if (!targetId) return error('No opponent to nudge', 400);
  // No point nudging someone who already posted their card.
  const targetSubmitted = isCreator ? !!match.opponent_scorecard_id : !!match.creator_scorecard_id;
  if (targetSubmitted) return json({ ok: false, reason: 'already_submitted' });

  // One nudge per hour per match — bounds push spam.
  if (match.nudge_last_sent_at && Date.now() - Date.parse(match.nudge_last_sent_at) < 3_600_000) {
    return json({ ok: false, reason: 'cooldown' });
  }
  // Stamp BEFORE pushing so a crash mid-push can't re-arm the nudge.
  await env.DB.prepare('UPDATE matches SET nudge_last_sent_at = ? WHERE id = ?')
    .bind(now(), matchId).run();

  const me = await env.DB.prepare('SELECT first_name FROM users WHERE id = ?')
    .bind(auth.userId).first<{ first_name: string | null }>();
  const who = me?.first_name?.trim() || 'Your opponent';
  await sendPush(env, targetId, 'Your move', `${who} is waiting on your scores — open Foretera to enter them.`, { matchId });
  return json({ ok: true });
}

// ── Cancel (creator) ─────────────────────────────────────────────────────────
async function cancel(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  if (match.creator_id !== auth.userId) return error('Only the creator can cancel', 403);
  if (match.status !== 'open' && match.status !== 'accepted' && match.status !== 'pending') {
    return error(`Cannot cancel a ${match.status} match`, 409);
  }
  // Once anyone's card is in the result is forming — cancelling would orphan a
  // submitted round.
  if (match.creator_scorecard_id || match.opponent_scorecard_id) {
    return error('Scores are in — the match can no longer be cancelled', 409);
  }
  const ok = await setStatus(env, matchId, 'cancelled', ['open', 'accepted', 'pending']);
  if (!ok) return error('This match just changed — reload and try again', 409);
  // The opponent agreed to play — tell them it's off.
  if (match.opponent_id && match.status === 'accepted') {
    const me = await env.DB.prepare('SELECT first_name FROM users WHERE id = ?')
      .bind(auth.userId).first<{ first_name: string | null }>();
    await sendPush(env, match.opponent_id, 'Match cancelled',
      `${me?.first_name?.trim() || 'Your opponent'} cancelled your match at ${match.course_name}.`, { matchId });
  }
  return json(await enrichedMatch(env, matchId));
}

// ── Decline (opponent backs out of an accepted match) ────────────────────────
async function decline(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  if (!isParticipant) return error('Not your match', 403);
  // Back out of an accepted match (opponent only — the creator cancels instead),
  // or decline a direct challenge addressed to you.
  const okAccepted = match.status === 'accepted' && match.opponent_id === auth.userId;
  const okChallenge = match.status === 'pending' && match.opponent_id === auth.userId;
  if (!okAccepted && !okChallenge) return error(`Cannot decline a ${match.status} match`, 409);
  const ok = await setStatus(env, matchId, 'declined', ['accepted', 'pending']);
  if (!ok) return error('This match just changed — reload and try again', 409);
  // Tell the creator their match/challenge was declined.
  const me = await env.DB.prepare('SELECT first_name FROM users WHERE id = ?')
    .bind(auth.userId).first<{ first_name: string | null }>();
  await sendPush(env, match.creator_id, okChallenge ? 'Challenge declined' : 'Opponent backed out',
    `${me?.first_name?.trim() || 'Your opponent'} ${okChallenge ? 'declined your challenge' : 'backed out of your match'} at ${match.course_name}.`, { matchId });
  return json(await enrichedMatch(env, matchId));
}

// ── Scoring started (pre-Settle tension) ─────────────────────────────────────
// POST /matches/:id/scoring-started — fire-and-forget stamp when a participant
// opens score entry, so the other player's screen can show "X is entering
// scores…". Display-only.
async function scoringStarted(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT creator_id, opponent_id, status FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  const isCreator = match.creator_id === auth.userId;
  const isOpponent = match.opponent_id === auth.userId;
  if (!isCreator && !isOpponent) return error('Not your match', 403);
  if (match.status !== 'accepted' && match.status !== 'in_progress') return json({ ok: false });
  const col = isCreator ? 'creator_scoring_at' : 'opponent_scoring_at';
  await env.DB.prepare(`UPDATE matches SET ${col} = ? WHERE id = ?`).bind(now(), matchId).run();
  return json({ ok: true });
}

// ── Visibility (creator flips private/public) ────────────────────────────────
// POST /matches/:id/visibility { visibility } — creator only. Allowed until a
// scorecard is in (you can't retroactively expose a result mid-play), and never
// on a finished/cancelled match.
async function setVisibility(auth: AuthContext, env: Env, matchId: string, request: Request): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  if (match.creator_id !== auth.userId) return error('Only the creator can change visibility', 403);

  const open = match.status === 'open' || match.status === 'pending' ||
    match.status === 'accepted' || match.status === 'in_progress';
  if (!open) return error(`Cannot change visibility on a ${match.status} match`, 409);
  // Once either card is in, the result is forming — lock visibility so it can't
  // be flipped after play has started.
  if (match.creator_scorecard_id || match.opponent_scorecard_id) {
    return error('Scores are in — visibility is locked', 409);
  }

  const body = await parseBody(request);
  const visibility = requireEnum(body.visibility, VISIBILITIES, 'visibility');
  await env.DB.prepare('UPDATE matches SET visibility = ?, updated_at = ? WHERE id = ?')
    .bind(visibility, now(), matchId).run();
  return json(await enrichedMatch(env, matchId));
}

// ── Course feed ──────────────────────────────────────────────────────────────
// GET /matches/feed?course=<name>&date=<YYYY-MM-DD>&today=<YYYY-MM-DD> — the
// course's community board:
//   matches  the selected DAY's public activity (live + completed)
//   open     upcoming open invites at the course — players looking for a game.
//            Anchored on the caller's local `today`, independent of the browsed
//            day, so the board never looks dead while invites are out.
//   pulse    aggregate club activity (this week / live now / open invites) —
//            counts only, no identities, so private matches can contribute.
// Private matches never appear as rows; open matches are inherently
// discoverable (the deck already shows them to any eligible player).
async function courseFeed(auth: AuthContext, env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const course = (url.searchParams.get('course') ?? '').trim();
  if (!course) return error('course is required', 400);
  const dateParam = url.searchParams.get('date');
  const date = (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) ? dateParam : now().slice(0, 10);
  // The caller's LOCAL today (same reasoning as discovery's ?from): open invites
  // for "today" must not vanish in the evening when UTC has rolled over.
  const todayParam = url.searchParams.get('today');
  const today = (todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam)) ? todayParam : now().slice(0, 10);

  const { results } = await env.DB.prepare(
    `SELECT m.id, m.course_name, m.play_date, m.play_time, m.match_type, m.status,
            m.result, m.match_progression, m.creator_id, m.opponent_id, m.playing_together,
            m.creator_handicap, m.opponent_handicap,
            (SELECT COUNT(*) FROM match_followers mf WHERE mf.match_id = m.id) AS follower_count,
            cu.first_name AS creator_first_name, cu.last_name AS creator_last_name,
            cu.profile_photo_url AS creator_photo_url,
            ou.first_name AS opponent_first_name, ou.last_name AS opponent_last_name,
            ou.profile_photo_url AS opponent_photo_url,
            (SELECT COUNT(*) FROM match_reactions r WHERE r.match_id = m.id AND r.kind = 'fire') AS cheer_count
       FROM matches m
       JOIN users cu ON cu.id = m.creator_id
       LEFT JOIN users ou ON ou.id = m.opponent_id
      WHERE m.visibility = 'public' AND m.course_name = ? AND m.play_date = ?
        AND m.status IN ('accepted', 'in_progress', 'completed')
        AND m.creator_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
        AND (m.opponent_id IS NULL OR m.opponent_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?))
      ORDER BY (m.status = 'completed') ASC, m.play_time ASC, m.created_at ASC
      LIMIT 100`
  ).bind(course, date, auth.userId, auth.userId).all<Record<string, any>>();

  const name = (f: unknown, l: unknown): string | null => {
    const n = [f, l].filter((s) => typeof s === 'string' && (s as string).trim()).join(' ').trim();
    return n || null;
  };
  const rows = (results ?? []).map((m) => {
    // Surface just the final delta string ("3 & 2") for completed matches; never
    // the full hole-by-hole progression in the feed.
    let final_delta: string | null = null;
    if (m.status === 'completed' && m.match_progression) {
      try { final_delta = JSON.parse(m.match_progression)?.final_delta ?? null; } catch { /* ignore */ }
    }
    return {
      id: m.id,
      course_name: m.course_name,
      play_date: m.play_date,
      play_time: m.play_time,
      match_type: m.match_type,
      status: m.status,
      result: m.result,
      final_delta,
      creator_id: m.creator_id,
      opponent_id: m.opponent_id,
      creator_name: name(m.creator_first_name, m.creator_last_name) ?? 'A golfer',
      opponent_name: name(m.opponent_first_name, m.opponent_last_name) ?? 'Opponent',
      creator_photo_url: m.creator_photo_url ?? null,
      opponent_photo_url: m.opponent_photo_url ?? null,
      creator_handicap_index: m.creator_handicap ?? null,
      opponent_handicap_index: m.opponent_handicap ?? null,
      playing_together: m.playing_together ?? 0,
      follower_count: m.follower_count ?? 0,
      cheer_count: m.cheer_count ?? 0,
      viewer_cheered: false, // filled below for the caller
      is_following: false, // filled below for the caller
      // Whether the viewer is one of the two players (so the client can label it).
      is_mine: m.creator_id === auth.userId || m.opponent_id === auth.userId,
    };
  });

  // Mark which live rows the caller already follows (so the Follow control shows
  // the right state on load). One small lookup over just the visible rows.
  const liveIds = rows.filter((r) => r.status !== 'completed').map((r) => r.id);
  if (liveIds.length) {
    const ph = liveIds.map(() => '?').join(',');
    const { results: follows } = await env.DB.prepare(
      `SELECT match_id FROM match_followers WHERE user_id = ? AND match_id IN (${ph})`
    ).bind(auth.userId, ...liveIds).all<{ match_id: string }>();
    const set = new Set((follows ?? []).map((f) => f.match_id));
    for (const r of rows) if (set.has(r.id)) r.is_following = true;
  }

  // Mark which rows the caller has already cheered (kudos = a 🔥 reaction).
  const allIds = rows.map((r) => r.id);
  if (allIds.length) {
    const ph2 = allIds.map(() => '?').join(',');
    const { results: ch } = await env.DB.prepare(
      `SELECT DISTINCT match_id FROM match_reactions WHERE user_id = ? AND kind = 'fire' AND match_id IN (${ph2})`
    ).bind(auth.userId, ...allIds).all<{ match_id: string }>();
    const cset = new Set((ch ?? []).map((c) => c.match_id));
    for (const r of rows) if (cset.has(r.id)) r.viewer_cheered = true;
  }

  // Open invites — players at this course looking for a game, today onward.
  // Blocked players are invisible in both directions (same rule as discovery).
  // No handicap-window filter here: the board shows the whole network; the
  // accept endpoint still enforces eligibility.
  const { results: openRows } = await env.DB.prepare(
    `SELECT m.id, m.play_date, m.play_time, m.match_type, m.stakes, m.playing_together,
            m.hcp_range_min, m.hcp_range_max, m.creator_id,
            u.first_name AS creator_first_name, u.last_name AS creator_last_name,
            u.profile_photo_url AS creator_photo_url, u.handicap AS creator_handicap_index
       FROM matches m JOIN users u ON u.id = m.creator_id
      WHERE m.status = 'open' AND m.course_name = ? AND m.play_date >= ?
        AND m.creator_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
        AND m.creator_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
      ORDER BY m.play_date ASC, m.play_time IS NULL, m.play_time ASC, m.created_at DESC
      LIMIT 25`
  ).bind(course, today, auth.userId, auth.userId).all<Record<string, any>>();

  const open = (openRows ?? []).map((m) => ({
    id: m.id,
    play_date: m.play_date,
    play_time: m.play_time,
    match_type: m.match_type,
    stakes: m.stakes ?? null,
    hcp_range_min: m.hcp_range_min,
    hcp_range_max: m.hcp_range_max,
    creator_id: m.creator_id,
    creator_name: name(m.creator_first_name, m.creator_last_name) ?? 'A golfer',
    creator_photo_url: m.creator_photo_url ?? null,
    creator_handicap_index: m.creator_handicap_index ?? null,
    playing_together: m.playing_together ?? 0,
    is_mine: m.creator_id === auth.userId,
  }));

  // The club behind this course — drives the network badge today, the A2
  // join-the-network prompt and A3 branded board next. Null when the course
  // isn't in the catalog (free-text course names).
  const clubPromise = env.DB.prepare(
    `SELECT cl.id, cl.name, cl.status, cl.crest_url, cl.primary_color, cl.pinned_message, cl.link_url,
            (SELECT COUNT(*) FROM club_interest ci WHERE ci.club_id = cl.id) AS interest_count
       FROM courses co JOIN clubs cl ON cl.id = co.club_id
      WHERE co.name = ? LIMIT 1`
  ).bind(course).first<Record<string, unknown>>();

  // Club pulse — anonymous aggregates over a rolling 7-day window ending today.
  // Includes private matches (counts leak no identities) so the numbers reflect
  // real club volume.
  const [week, liveNow] = await Promise.all([
    env.DB.prepare(
      `SELECT creator_id, opponent_id FROM matches
        WHERE course_name = ? AND status IN ('accepted','in_progress','completed')
          AND play_date BETWEEN date(?, '-6 days') AND ?`
    ).bind(course, today, today).all<{ creator_id: string; opponent_id: string | null }>(),
    env.DB.prepare(
      // "Live now" = a WATCHABLE live match: public + in_progress + same-group
      // (live scoring). A private match can't be watched; an apart match has
      // sealed cards (nothing to follow) — neither is "live" to a spectator, so
      // counting them just misleads ("2 live now" with nothing on the feed).
      `SELECT COUNT(*) AS n FROM matches
        WHERE course_name = ? AND status = 'in_progress'
          AND visibility = 'public' AND playing_together = 1 AND play_date = ?`
    ).bind(course, today).first<{ n: number }>(),
  ]);
  const weekPlayers = new Set<string>();
  for (const m of week.results ?? []) {
    weekPlayers.add(m.creator_id);
    if (m.opponent_id) weekPlayers.add(m.opponent_id);
  }
  const pulse = {
    week_matches: (week.results ?? []).length,
    week_players: weekPlayers.size,
    live_now: liveNow?.n ?? 0,
    open_count: open.length,
  };

  const club = await clubPromise.catch(() => null);

  return json({ matches: rows, open, pulse, club: club ?? null });
}

// Guarded transition: only fires while the row is still in one of
// `fromStatuses`, so a racing settle/cancel/decline can't stomp a terminal
// state. Returns whether the transition actually happened.
async function setStatus(env: Env, matchId: string, status: string, fromStatuses: string[]): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE matches SET status = ?, updated_at = ? WHERE id = ? AND status IN (${fromStatuses.map(() => '?').join(',')})`
  ).bind(status, now(), matchId, ...fromStatuses).run();
  return (res.meta.changes ?? 0) > 0;
}
