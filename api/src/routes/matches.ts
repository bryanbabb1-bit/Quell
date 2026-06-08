import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { MATCH_TYPES } from '../types';
import { json, error } from '../lib/response';
import { newId, now } from '../lib/id';
import {
  parseBody, requireString, requireEnum,
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
    if (method === 'GET') return discover(auth, env);
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
async function discover(auth: AuthContext, env: Env): Promise<Response> {
  const me = await env.DB.prepare('SELECT handicap FROM users WHERE id = ?')
    .bind(auth.userId).first<{ handicap: number | null }>();
  const today = now().slice(0, 10);

  let sql =
    `SELECT m.*, u.first_name AS creator_first_name, u.last_name AS creator_last_name,
            u.handicap AS creator_handicap_index
       FROM matches m JOIN users u ON u.id = m.creator_id
      WHERE m.status = 'open' AND m.creator_id != ? AND m.play_date >= ?`;
  const binds: unknown[] = [auth.userId, today];

  if (me?.handicap != null) {
    sql += ' AND ? BETWEEN m.hcp_range_min AND m.hcp_range_max';
    binds.push(me.handicap);
  }
  sql += ' ORDER BY m.play_date ASC, m.created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ matches: results });
}

// ── Create ───────────────────────────────────────────────────────────────────
async function create(auth: AuthContext, request: Request, env: Env): Promise<Response> {
  const body = await parseBody(request);

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

  const id = newId();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO matches
       (id, creator_id, status, course_name, tee_color, play_date, play_time,
        match_type, stakes, hcp_range_min, hcp_range_max, created_at, updated_at)
     VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, auth.userId, course_name, tee_color, play_date, play_time,
    match_type, stakes, hcp_range_min, hcp_range_max, ts, ts
  ).run();

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
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, unknown>>();
  if (!match) return error('Match not found', 404);

  // Visible if the caller is a participant, or it's still an open match anyone
  // could accept. (Scorecard contents are gated separately in Phase 3.)
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  if (!isParticipant && match.status !== 'open') {
    return error('Match not found', 404);
  }
  return json(match);
}

// ── Accept ───────────────────────────────────────────────────────────────────
// First eligible golfer to accept claims the open match. Both handicap INDEXES
// are snapshotted here so a later index change can't rewrite a settled match;
// course adjustment happens at determination time (Phase 3).
async function accept(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  if (match.status !== 'open') return error('Match is no longer open', 409);
  if (match.creator_id === auth.userId) return error('You cannot accept your own match', 400);

  const [creator, opponent] = await Promise.all([
    env.DB.prepare('SELECT handicap FROM users WHERE id = ?').bind(match.creator_id).first<{ handicap: number | null }>(),
    env.DB.prepare('SELECT handicap FROM users WHERE id = ?').bind(auth.userId).first<{ handicap: number | null }>(),
  ]);

  const ts = now();
  // Conditional UPDATE guards against a race: two golfers accepting the same
  // open match at once — only the first (status still 'open') wins.
  const res = await env.DB.prepare(
    `UPDATE matches
        SET opponent_id = ?, status = 'accepted',
            creator_handicap = ?, opponent_handicap = ?, updated_at = ?
      WHERE id = ? AND status = 'open'`
  ).bind(
    auth.userId, creator?.handicap ?? null, opponent?.handicap ?? null, ts, matchId
  ).run();

  if (!res.meta.changes) return error('Match is no longer open', 409);

  const updated = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
  return json(updated);
}

// ── Cancel (creator) ─────────────────────────────────────────────────────────
async function cancel(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  if (match.creator_id !== auth.userId) return error('Only the creator can cancel', 403);
  if (match.status !== 'open' && match.status !== 'accepted') {
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
  if (match.status !== 'accepted') return error(`Cannot decline a ${match.status} match`, 409);
  await setStatus(env, matchId, 'declined');
  const updated = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
  return json(updated);
}

async function setStatus(env: Env, matchId: string, status: string): Promise<void> {
  await env.DB.prepare('UPDATE matches SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, now(), matchId).run();
}
