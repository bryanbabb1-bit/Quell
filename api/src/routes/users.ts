import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { now } from '../lib/id';
import { parseBody, optionalString, optionalNumber } from '../lib/validate';

// GET /me — returns the current user's profile, lazily creating the row on
// first authenticated request (same upsert-on-read pattern as TrueForecast,
// so a freshly-signed-up Clerk user always has a backing row).
export async function handleGetMe(auth: AuthContext, env: Env): Promise<Response> {
  let user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.userId).first();
  if (!user) {
    const ts = now();
    await env.DB.prepare(
      'INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)'
    ).bind(auth.userId, auth.email, ts, ts).run();
    user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.userId).first();
  }
  return json(user);
}

// PATCH /me — update editable profile fields. Only the fields present in the
// body are touched, so a partial update never clobbers the rest.
export async function handleUpdateMe(auth: AuthContext, request: Request, env: Env): Promise<Response> {
  const body = await parseBody(request);
  const fields: string[] = [];
  const values: unknown[] = [];

  if ('first_name' in body) { fields.push('first_name = ?'); values.push(optionalString(body.first_name, 'first_name')); }
  if ('last_name' in body) { fields.push('last_name = ?'); values.push(optionalString(body.last_name, 'last_name')); }
  if ('ghin_number' in body) { fields.push('ghin_number = ?'); values.push(optionalString(body.ghin_number, 'ghin_number', 32)); }
  if ('handicap' in body) {
    fields.push('handicap = ?'); values.push(optionalNumber(body.handicap, 'handicap'));
    // Stamp when the index was last set so the app can detect a stale index.
    fields.push('handicap_updated_at = ?'); values.push(now());
  }
  if ('profile_photo_url' in body) { fields.push('profile_photo_url = ?'); values.push(optionalString(body.profile_photo_url, 'profile_photo_url', 1024)); }
  if ('expo_push_token' in body) { fields.push('expo_push_token = ?'); values.push(optionalString(body.expo_push_token, 'expo_push_token', 256)); }

  if (fields.length === 0) return error('No fields to update', 400);

  fields.push('updated_at = ?');
  values.push(now());
  values.push(auth.userId);

  await env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.userId).first();
  return json(user);
}

type Outcome = 'win' | 'loss' | 'tie';

function fullName(first: unknown, last: unknown, fallback = 'A golfer'): string {
  const n = [first, last].filter(Boolean).join(' ').trim();
  return n || fallback;
}

// GET /me/record — the caller's head-to-head record, current streak, and recent
// results, derived from completed matches (no separate stats table needed).
export async function handleGetMyRecord(auth: AuthContext, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.course_name, m.result, m.match_progression, m.completed_at,
            m.creator_id, m.opponent_id,
            cu.first_name AS creator_first, cu.last_name AS creator_last,
            ou.first_name AS opp_first, ou.last_name AS opp_last
       FROM matches m
       LEFT JOIN users cu ON cu.id = m.creator_id
       LEFT JOIN users ou ON ou.id = m.opponent_id
      WHERE m.status = 'completed' AND m.result IS NOT NULL
        AND (m.creator_id = ? OR m.opponent_id = ?)
      ORDER BY m.completed_at DESC`
  ).bind(auth.userId, auth.userId).all<Record<string, any>>();

  let wins = 0, losses = 0, ties = 0;
  const recent = (results ?? []).map((m) => {
    const amCreator = m.creator_id === auth.userId;
    const outcome: Outcome = m.result === 'tie'
      ? 'tie'
      : (m.result === 'creator_wins') === amCreator ? 'win' : 'loss';
    if (outcome === 'win') wins++; else if (outcome === 'loss') losses++; else ties++;

    let final_delta: string | null = null;
    try { final_delta = m.match_progression ? JSON.parse(m.match_progression).final_delta ?? null : null; } catch { /* ignore */ }

    const opponent_name = amCreator
      ? fullName(m.opp_first, m.opp_last)
      : fullName(m.creator_first, m.creator_last);

    return { match_id: m.id, course_name: m.course_name, outcome, final_delta, completed_at: m.completed_at, opponent_name };
  });

  const played = recent.length;
  const decided = wins + losses;
  const win_pct = decided > 0 ? Math.round((wins / decided) * 100) : 0;

  // Current streak: consecutive same W/L from the most recent result (a tie ends it).
  let streakType: Outcome | 'none' = 'none';
  let count = 0;
  for (const r of recent) {
    if (count === 0) {
      if (r.outcome === 'tie') break;
      streakType = r.outcome; count = 1;
    } else if (r.outcome === streakType) {
      count++;
    } else break;
  }

  return json({
    played, wins, losses, ties, win_pct,
    current_streak: { type: streakType, count },
    recent: recent.slice(0, 20),
  });
}
