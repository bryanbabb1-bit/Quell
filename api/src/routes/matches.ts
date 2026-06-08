import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { error } from '../lib/response';

// Match lifecycle + discovery. Implemented in Phase 2 (build-order steps 3–4):
//   GET    /matches              discovery feed — open matches compatible with
//                                the caller's handicap (hcp_range_min/max),
//                                excluding the caller's own posts.
//   POST   /matches              create an `open` match.
//   GET    /matches/:id          full match (subject to the hidden-card lock).
//   POST   /matches/:id/accept   open -> accepted; SNAPSHOT both handicaps here.
//   POST   /matches/:id/decline  open -> declined.
//   POST   /matches/:id/cancel   open/accepted -> cancelled (creator only).
//
// All transitions are guarded by the state machine in MATCH_STATUSES and must
// verify the caller is a participant.
export async function handleMatches(
  _request: Request,
  _auth: AuthContext,
  _env: Env,
  _segments: string[]
): Promise<Response> {
  return error('matches: not implemented yet (Phase 2)', 501);
}
