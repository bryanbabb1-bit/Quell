import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { newId, now } from '../lib/id';

// Live spectating + scoring (routed from index.ts under /matches/:id/...).
//   POST   /matches/:id/follow    spectate a match (INSERT OR IGNORE)
//   DELETE /matches/:id/follow    stop watching
//   POST   /matches/:id/live-score  post ONE hole (playing-together only)  [P3]
//   GET    /matches/:id/live        running state / presence               [P3]
//
// Presence (the 👁 follower count) is safe for ANY match — it carries no score
// data. Live SCORING is gated to playing_together matches (those two players
// already see each other's cards, so live scoring spoils nothing); apart
// matches keep the sealed hidden-card reveal.
export async function handleLive(
  request: Request,
  auth: AuthContext,
  env: Env,
  segments: string[]
): Promise<Response> {
  const matchId = segments[1];
  const action = segments[2];
  if (!matchId) return error('Match id required', 400);

  if (action === 'follow') return follow(request, auth, env, matchId);
  return error('Not found', 404);
}

async function follow(request: Request, auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT visibility, creator_id, opponent_id FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  // You can watch a public match, or any match you're a participant in.
  const isParticipant = match.creator_id === auth.userId || match.opponent_id === auth.userId;
  if (match.visibility !== 'public' && !isParticipant) return error('Not your match', 403);

  if (request.method === 'POST') {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO match_followers (id, match_id, user_id, created_at) VALUES (?, ?, ?, ?)'
    ).bind(newId(), matchId, auth.userId, now()).run();
  } else if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM match_followers WHERE match_id = ? AND user_id = ?')
      .bind(matchId, auth.userId).run();
  } else {
    return error('Method not allowed', 405);
  }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM match_followers WHERE match_id = ?')
    .bind(matchId).first<{ n: number }>();
  return json({ following: request.method === 'POST', count: n?.n ?? 0 });
}
