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
  if ('handicap' in body) { fields.push('handicap = ?'); values.push(optionalNumber(body.handicap, 'handicap')); }
  if ('profile_photo_url' in body) { fields.push('profile_photo_url = ?'); values.push(optionalString(body.profile_photo_url, 'profile_photo_url', 1024)); }

  if (fields.length === 0) return error('No fields to update', 400);

  fields.push('updated_at = ?');
  values.push(now());
  values.push(auth.userId);

  await env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.userId).first();
  return json(user);
}
