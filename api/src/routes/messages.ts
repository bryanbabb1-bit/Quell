import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { newId, now } from '../lib/id';
import { parseBody, requireString, optionalString } from '../lib/validate';

// In-app messaging, scoped to a match (build-order step 5). D1 is the durable
// record; the realtime-delivery vendor (Firestore vs. a Cloudflare-native
// option) is the deferred "decide during build" call — the client polls
// GET for now, and that swaps to a live subscription later without an API
// change. Push notifications are a later add.
//   GET  /matches/:id/messages   thread history (participants only)
//   POST /matches/:id/messages   send a message (participants only)
export async function handleMessages(
  request: Request,
  auth: AuthContext,
  env: Env,
  segments: string[]
): Promise<Response> {
  const matchId = segments[1];
  if (!matchId) return error('Match id required', 400);

  // Only the two participants may read or post. Fetch once, authorize, reuse.
  const match = await env.DB.prepare(
    'SELECT creator_id, opponent_id FROM matches WHERE id = ?'
  ).bind(matchId).first<{ creator_id: string; opponent_id: string | null }>();
  if (!match) return error('Match not found', 404);
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  if (!isParticipant) return error('Not your match', 403);

  if (request.method === 'GET') return listMessages(auth, env, matchId);
  if (request.method === 'POST') return sendMessage(auth, env, matchId, request);
  return error('Method not allowed', 405);
}

async function listMessages(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM messages WHERE match_id = ? ORDER BY created_at ASC LIMIT 500'
  ).bind(matchId).all();

  // Mark the other party's messages as read now that the caller has fetched
  // the thread (best-effort; a failure here shouldn't fail the read).
  await env.DB.prepare(
    'UPDATE messages SET read = 1 WHERE match_id = ? AND sender_id != ? AND read = 0'
  ).bind(matchId, auth.userId).run().catch(() => {});

  return json({ messages: results });
}

async function sendMessage(auth: AuthContext, env: Env, matchId: string, request: Request): Promise<Response> {
  const body = await parseBody(request);
  // A message is either text or a GIF (a Giphy CDN url). Allowlist the host —
  // an arbitrary URL here gets rendered by the other player's client.
  const gifUrl = optionalString(body.gif_url, 'gif_url', 1024);
  if (gifUrl) {
    let host = '';
    try { host = new URL(gifUrl).hostname; } catch { /* fall through to reject */ }
    if (!/^media\d*\.giphy\.com$/.test(host) || !gifUrl.startsWith('https://')) {
      return error('gif_url must be a Giphy CDN URL', 400);
    }
  }
  const text = gifUrl ? (optionalString(body.body, 'body', 2000) ?? '') : requireString(body.body, 'body', 2000);

  const id = newId();
  const ts = now();
  await env.DB.prepare(
    'INSERT INTO messages (id, match_id, sender_id, body, gif_url, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  ).bind(id, matchId, auth.userId, text, gifUrl ?? null, ts).run();

  const message = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first();
  return json(message, 201);
}
