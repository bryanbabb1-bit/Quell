import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { now } from '../lib/id';
import { parseBody, optionalString, optionalNumber } from '../lib/validate';

// The profile shape the client gets. Explicit columns — never SELECT * — so a
// future internal column can't silently leak. The raw push token is write-only
// (a token alone lets anyone push to the device); the client only needs to know
// whether one is registered.
const ME_COLUMNS = `id, email, first_name, last_name, ghin_number, handicap,
  handicap_updated_at, profile_photo_url, home_course_id, timezone,
  (expo_push_token IS NOT NULL) AS push_enabled, created_at, updated_at`;

async function selectMe(env: Env, userId: string) {
  return env.DB.prepare(`SELECT ${ME_COLUMNS} FROM users WHERE id = ?`).bind(userId).first();
}

// GET /me — returns the current user's profile, lazily creating the row on
// first authenticated request (same upsert-on-read pattern as TrueForecast,
// so a freshly-signed-up Clerk user always has a backing row).
export async function handleGetMe(auth: AuthContext, env: Env): Promise<Response> {
  let user = await selectMe(env, auth.userId);
  if (!user) {
    const ts = now();
    await env.DB.prepare(
      'INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)'
    ).bind(auth.userId, auth.email, ts, ts).run();
    user = await selectMe(env, auth.userId);
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
  if ('profile_photo_url' in body) {
    // Only OUR uploaded photos — an arbitrary URL here gets rendered by every
    // other user's client (tracking pixel / junk injection). POST /photo is the
    // real write path; this accepts its output or a clear.
    const raw = optionalString(body.profile_photo_url, 'profile_photo_url', 1024);
    if (raw !== null && !raw.startsWith(`${new URL(request.url).origin}/photos/`)) {
      return error('profile_photo_url must be an uploaded photo', 400);
    }
    fields.push('profile_photo_url = ?'); values.push(raw);
  }
  if ('expo_push_token' in body) { fields.push('expo_push_token = ?'); values.push(optionalString(body.expo_push_token, 'expo_push_token', 256)); }
  if ('home_course_id' in body) { fields.push('home_course_id = ?'); values.push(optionalString(body.home_course_id, 'home_course_id', 64)); }
  if ('timezone' in body) { fields.push('timezone = ?'); values.push(optionalString(body.timezone, 'timezone', 64)); }

  if (fields.length === 0) return error('No fields to update', 400);

  fields.push('updated_at = ?');
  values.push(now());
  values.push(auth.userId);

  await env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  const user = await selectMe(env, auth.userId);
  return json(user);
}

// DELETE /me — full account deletion (App Store 5.1.1(v) requires it in-app).
// Deletes the Clerk user (kills all sessions), then scrubs our rows: profile,
// favorites (both directions), blocks, push token. Matches/scorecards STAY —
// results belong to both players — but with the users row gone every JOIN
// resolves the name to "A golfer", which is the anonymization.
export async function handleDeleteMe(auth: AuthContext, env: Env): Promise<Response> {
  // Clerk first: if this fails the account still works and the user can retry.
  const resp = await fetch(`https://api.clerk.com/v1/users/${auth.userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
  });
  // 404 = already gone from Clerk; treat as success so cleanup still runs.
  if (!resp.ok && resp.status !== 404) {
    console.error('Clerk user delete failed', resp.status, await resp.text().catch(() => ''));
    return error('Could not delete your account — try again', 502);
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM favorites WHERE user_id = ? OR favorite_user_id = ?').bind(auth.userId, auth.userId),
    env.DB.prepare('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?').bind(auth.userId, auth.userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(auth.userId),
  ]);
  return json({ deleted: true });
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
            cu.first_name AS creator_first, cu.last_name AS creator_last, cu.profile_photo_url AS creator_photo,
            ou.first_name AS opp_first, ou.last_name AS opp_last, ou.profile_photo_url AS opp_photo
       FROM matches m
       LEFT JOIN users cu ON cu.id = m.creator_id
       LEFT JOIN users ou ON ou.id = m.opponent_id
      WHERE m.status = 'completed' AND m.result IS NOT NULL
        AND (m.creator_id = ? OR m.opponent_id = ?)
      ORDER BY m.completed_at DESC`
  ).bind(auth.userId, auth.userId).all<Record<string, any>>();

  let wins = 0, losses = 0, ties = 0;
  // Rolled up alongside the per-match mapping: head-to-head tallies per
  // opponent (rivalries) and per course (course form).
  type Tally = { wins: number; losses: number; ties: number };
  const byOpponent = new Map<string, Tally & { name: string; photo_url: string | null; last_outcome: Outcome; last_at: string | null }>();
  const byCourse = new Map<string, Tally>();
  const bump = (t: Tally, o: Outcome) => {
    if (o === 'win') t.wins++; else if (o === 'loss') t.losses++; else t.ties++;
  };

  const recent = (results ?? []).map((m) => {
    const amCreator = m.creator_id === auth.userId;
    const outcome: Outcome = m.result === 'tie'
      ? 'tie'
      : (m.result === 'creator_wins') === amCreator ? 'win' : 'loss';
    if (outcome === 'win') wins++; else if (outcome === 'loss') losses++; else ties++;

    let final_delta: string | null = null;
    try { final_delta = m.match_progression ? JSON.parse(m.match_progression).final_delta ?? null : null; } catch { /* ignore */ }

    const opponent_id = (amCreator ? m.opponent_id : m.creator_id) as string | null;
    const opponent_name = amCreator
      ? fullName(m.opp_first, m.opp_last)
      : fullName(m.creator_first, m.creator_last);
    const opponent_photo_url = (amCreator ? m.opp_photo : m.creator_photo) ?? null;

    if (opponent_id) {
      // Rows arrive newest-first, so the first sighting IS the latest meeting.
      let r = byOpponent.get(opponent_id);
      if (!r) {
        r = { wins: 0, losses: 0, ties: 0, name: opponent_name, photo_url: opponent_photo_url, last_outcome: outcome, last_at: m.completed_at ?? null };
        byOpponent.set(opponent_id, r);
      }
      bump(r, outcome);
    }
    let c = byCourse.get(m.course_name);
    if (!c) { c = { wins: 0, losses: 0, ties: 0 }; byCourse.set(m.course_name, c); }
    bump(c, outcome);

    return { match_id: m.id, course_name: m.course_name, outcome, final_delta, completed_at: m.completed_at, opponent_name, opponent_photo_url };
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

  // Longest CAREER win streak (vs current_streak, which only looks at the top
  // of the list). Scan oldest→newest; ties and losses both break it.
  let longest_win_streak = 0;
  let run = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    run = recent[i].outcome === 'win' ? run + 1 : 0;
    if (run > longest_win_streak) longest_win_streak = run;
  }

  // Best win — the largest margin of victory. "N & M" outranks "N Up" at the
  // same N (closing it out early is the bigger statement); All Square never
  // appears on a win.
  const marginOf = (delta: string | null): [number, number] => {
    if (!delta) return [0, 0];
    const m = delta.match(/^(\d+)(?:\s*&\s*(\d+))?/);
    return m ? [Number(m[1]), Number(m[2] ?? 0)] : [0, 0];
  };
  let best_win: { match_id: string; opponent_name: string; course_name: string; final_delta: string | null; completed_at: string | null } | null = null;
  let bestMargin: [number, number] = [0, 0];
  for (const r of recent) {
    if (r.outcome !== 'win') continue;
    const m = marginOf(r.final_delta);
    if (!best_win || m[0] > bestMargin[0] || (m[0] === bestMargin[0] && m[1] > bestMargin[1])) {
      best_win = { match_id: r.match_id, opponent_name: r.opponent_name, course_name: r.course_name, final_delta: r.final_delta, completed_at: r.completed_at };
      bestMargin = m;
    }
  }

  // Rivalries — most-played opponents first, recency breaks ties.
  const rivals = [...byOpponent.entries()]
    .map(([user_id, r]) => ({
      user_id, name: r.name, photo_url: r.photo_url,
      wins: r.wins, losses: r.losses, ties: r.ties,
      played: r.wins + r.losses + r.ties,
      last_outcome: r.last_outcome, last_at: r.last_at,
    }))
    .sort((a, b) => b.played - a.played || (b.last_at ?? '').localeCompare(a.last_at ?? ''))
    .slice(0, 3);

  // Course form — most-played courses first.
  const courses = [...byCourse.entries()]
    .map(([course_name, t]) => ({ course_name, ...t, played: t.wins + t.losses + t.ties }))
    .sort((a, b) => b.played - a.played)
    .slice(0, 5);

  return json({
    played, wins, losses, ties, win_pct,
    current_streak: { type: streakType, count },
    longest_win_streak,
    best_win,
    rivals,
    courses,
    recent: recent.slice(0, 20),
  });
}
