import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { now, newId } from '../lib/id';

// POST /photo — upload a profile photo (raw image bytes in the body). Stores it
// in R2, points users.profile_photo_url at the public serve URL, returns { url }.
export async function handleUploadPhoto(auth: AuthContext, env: Env, request: Request): Promise<Response> {
  // Allowlist + normalize: never store the raw header (it can carry parameters),
  // and never store a type we wouldn't serve as an image.
  const ALLOWED: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const rawCt = (request.headers.get('Content-Type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
  const ext = ALLOWED[rawCt];
  if (!ext) return error('Expected image/jpeg, image/png, or image/webp', 400);
  const body = await request.arrayBuffer();
  if (!body || body.byteLength === 0) return error('Empty image', 400);
  if (body.byteLength > 5 * 1024 * 1024) return error('Image too large (max 5MB)', 413);

  const key = `${auth.userId}/${newId()}.${ext}`;
  await env.PHOTOS.put(key, body, { httpMetadata: { contentType: rawCt } });

  const photoUrl = `${new URL(request.url).origin}/photos/${key}`;
  await env.DB.prepare('UPDATE users SET profile_photo_url = ?, updated_at = ? WHERE id = ?')
    .bind(photoUrl, now(), auth.userId).run();
  return json({ url: photoUrl });
}

// GET /photos/:key... — public image serve from R2 (no auth, so <Image> loads).
export async function servePhoto(env: Env, segments: string[]): Promise<Response> {
  const key = segments.slice(1).join('/');
  if (!key) return new Response('Not found', { status: 404 });
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', obj.httpEtag);
  return new Response(obj.body, { headers });
}
