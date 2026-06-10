import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { now } from '../lib/id';

// Starred "common opponents".
//   GET    /favorites            list the caller's favorites (with names + index)
//   POST   /favorites/:userId    star a player
//   DELETE /favorites/:userId    unstar a player
export async function handleFavorites(
  request: Request,
  auth: AuthContext,
  env: Env,
  segments: string[],
): Promise<Response> {
  const target = segments[1];
  const method = request.method;

  if (!target) {
    if (method !== 'GET') return error('Method not allowed', 405);
    const { results } = await env.DB.prepare(
      `SELECT f.favorite_user_id AS user_id, u.first_name, u.last_name, u.handicap, u.profile_photo_url
         FROM favorites f JOIN users u ON u.id = f.favorite_user_id
        WHERE f.user_id = ?
        ORDER BY u.first_name, u.last_name`
    ).bind(auth.userId).all<Record<string, any>>();
    const favorites = (results ?? []).map((r) => ({
      user_id: r.user_id,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || 'A golfer',
      handicap: r.handicap,
      photo_url: r.profile_photo_url ?? null,
    }));
    return json({ favorites });
  }

  if (target === auth.userId) return error('You cannot favorite yourself', 400);

  if (method === 'POST') {
    const exists = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(target).first();
    if (!exists) return error('Unknown user', 404);
    await env.DB.prepare(
      'INSERT OR IGNORE INTO favorites (user_id, favorite_user_id, created_at) VALUES (?, ?, ?)'
    ).bind(auth.userId, target, now()).run();
    return json({ ok: true, favorited: true });
  }
  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND favorite_user_id = ?')
      .bind(auth.userId, target).run();
    return json({ ok: true, favorited: false });
  }
  return error('Method not allowed', 405);
}
