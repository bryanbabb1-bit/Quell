import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { error } from '../lib/response';

// In-app messaging, scoped to a match. Implemented in Phase 2 (build-order
// step 5). Postgres/D1 holds the durable record; the realtime delivery vendor
// (Firestore vs. a Cloudflare-native option) is the deferred "decide during
// build" call and is wired here once chosen.
//   GET  /matches/:id/messages   thread history (participants only).
//   POST /matches/:id/messages   send a message; triggers a push to the other
//                                participant.
export async function handleMessages(
  _request: Request,
  _auth: AuthContext,
  _env: Env,
  _segments: string[]
): Promise<Response> {
  return error('messages: not implemented yet (Phase 2)', 501);
}
