import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { error } from '../lib/response';

// Scorecard submission, the HIDDEN-CARD LOCK, and the reveal. Implemented in
// Phase 3 (build-order steps 6–7):
//   POST /matches/:id/scorecard   submit + run OCR validation; store but DO NOT
//                                 expose the opponent's card.
//   GET  /matches/:id/reveal      available ONLY once BOTH scorecards are
//                                 verified — returns both cards + the computed
//                                 match_progression together.
//
// Lock invariant (enforced server-side, never client-side): no API response
// returns the opponent's scorecard until creator_scorecard_id AND
// opponent_scorecard_id are both non-null and verified.
export async function handleScorecards(
  _request: Request,
  _auth: AuthContext,
  _env: Env,
  _segments: string[]
): Promise<Response> {
  return error('scorecards: not implemented yet (Phase 3)', 501);
}
