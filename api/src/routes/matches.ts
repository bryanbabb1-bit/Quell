import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { MATCH_TYPES } from '../types';
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

  const matchId = second;

  if (!action) {
    if (method === 'GET') return getOne(auth, env, matchId);
    return error('Method not allowed', 405);
  }

  if (action === 'tees' && method === 'GET') return matchTees(auth, env, matchId);
  if (action === 'tee' && method === 'POST') return setTee(auth, env, matchId, request);

  if (method === 'POST') {
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
      WHERE m.status = 'open' AND m.creator_id != ? AND m.play_date >= ?`;
  const binds: unknown[] = [auth.userId, today];

  if (me?.handicap != null && !showAll) {
    sql += ' AND ? BETWEEN m.hcp_range_min AND m.hcp_range_max';
    binds.push(me.handicap);
  }
  if (qpType && (MATCH_TYPES as readonly string[]).includes(qpType)) {
    sql += ' AND m.match_type = ?';
    binds.push(qpType);
  }
  if (untilDate) {
    sql += ' AND m.play_date <= ?';
    binds.push(untilDate);
  }
  // Course: an explicit search wins; otherwise default to the home course
  // (unless the user asked to browse everything).
  if (qpCourse) {
    sql += ' AND m.course_name LIKE ?';
    binds.push(`%${qpCourse}%`);
  } else if (!showAll && me?.home_course_id) {
    const home = await env.DB.prepare('SELECT name FROM courses WHERE id = ?')
      .bind(me.home_course_id).first<{ name: string }>();
    if (home?.name) { sql += ' AND m.course_name = ?'; binds.push(home.name); }
  }
  sql += ' ORDER BY m.play_date ASC, m.created_at DESC LIMIT 100';

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

  // Direct challenge: when opponent_id is present the match is pre-addressed to
  // one player and starts as 'pending' (they accept/decline) instead of 'open'.
  const opponent_id = optionalString(body.opponent_id, 'opponent_id', 64);
  let status = 'open';
  if (opponent_id) {
    if (opponent_id === auth.userId) return error('You cannot challenge yourself', 400);
    const opp = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(opponent_id).first();
    if (!opp) return error('Unknown opponent', 400);
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
        match_type, stakes, hcp_range_min, hcp_range_max, creator_handicap, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, auth.userId, opponent_id ?? null, status, course_name, tee_color, tee_id, play_date, play_time,
    match_type, stakes, hcp_range_min, hcp_range_max, creator?.handicap ?? null, ts, ts
  ).run();

  if (opponent_id) {
    const who = creator?.first_name?.trim() || 'Someone';
    await sendPush(env, opponent_id, `${who} challenged you to a match`, `${course_name} · tap to accept or decline.`, { matchId: id });
  }

  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first();
  return json(match, 201);
}

// ── Mine ─────────────────────────────────────────────────────────────────────
async function listMine(auth: AuthContext, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM matches
      WHERE creator_id = ? OR opponent_id = ?
      ORDER BY play_date DESC, created_at DESC LIMIT 200`
  ).bind(auth.userId, auth.userId).all();
  return json({ matches: results });
}

// ── Get one ──────────────────────────────────────────────────────────────────
async function getOne(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare(
    `SELECT m.*,
            cu.first_name AS creator_first_name, cu.last_name AS creator_last_name,
            ou.first_name AS opponent_first_name, ou.last_name AS opponent_last_name
       FROM matches m
       JOIN users cu ON cu.id = m.creator_id
       LEFT JOIN users ou ON ou.id = m.opponent_id
      WHERE m.id = ?`,
  ).bind(matchId).first<Record<string, unknown>>();
  if (!match) return error('Match not found', 404);

  // Visible if the caller is a participant, or it's still an open match anyone
  // could accept. (Scorecard contents are gated separately in Phase 3.)
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  if (!isParticipant && match.status !== 'open') {
    return error('Match not found', 404);
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

  const updated = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
  return json(updated);
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
  const updated = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
  return json(updated);
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
  await setStatus(env, matchId, 'cancelled');
  const updated = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
  return json(updated);
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
  await setStatus(env, matchId, 'declined');
  const updated = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
  return json(updated);
}

async function setStatus(env: Env, matchId: string, status: string): Promise<void> {
  await env.DB.prepare('UPDATE matches SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, now(), matchId).run();
}
