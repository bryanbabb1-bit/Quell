import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json } from '../lib/response';

// GET /leaderboard — global standings by wins across all completed matches.
// Derived live from `matches` (no clubs/standings table yet — per-club boards
// land when the clubs concept does). Fine at beta scale; revisit with a
// materialized standings table if the match volume grows large.
export async function handleLeaderboard(auth: AuthContext, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT creator_id, opponent_id, result FROM matches
      WHERE status = 'completed' AND result IS NOT NULL AND opponent_id IS NOT NULL`
  ).all<{ creator_id: string; opponent_id: string; result: string }>();

  type Tally = { wins: number; losses: number; ties: number };
  const tally = new Map<string, Tally>();
  const bump = (id: string, key: keyof Tally) => {
    const t = tally.get(id) ?? { wins: 0, losses: 0, ties: 0 };
    t[key]++;
    tally.set(id, t);
  };

  for (const m of results ?? []) {
    if (m.result === 'tie') { bump(m.creator_id, 'ties'); bump(m.opponent_id, 'ties'); }
    else if (m.result === 'creator_wins') { bump(m.creator_id, 'wins'); bump(m.opponent_id, 'losses'); }
    else if (m.result === 'opponent_wins') { bump(m.opponent_id, 'wins'); bump(m.creator_id, 'losses'); }
  }

  if (tally.size === 0) return json({ entries: [] });

  // Names for everyone on the board.
  const ids = [...tally.keys()];
  const placeholders = ids.map(() => '?').join(',');
  const { results: users } = await env.DB.prepare(
    `SELECT id, first_name, last_name FROM users WHERE id IN (${placeholders})`
  ).bind(...ids).all<{ id: string; first_name: string | null; last_name: string | null }>();
  const nameById = new Map((users ?? []).map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'A golfer']));

  const entries = ids.map((id) => {
    const t = tally.get(id)!;
    const played = t.wins + t.losses + t.ties;
    const decided = t.wins + t.losses;
    return {
      user_id: id,
      name: nameById.get(id) ?? 'A golfer',
      wins: t.wins, losses: t.losses, ties: t.ties, played,
      win_pct: decided > 0 ? Math.round((t.wins / decided) * 100) : 0,
      is_me: id === auth.userId,
    };
  });

  // Most wins first, then win %, then fewest losses.
  entries.sort((a, b) => b.wins - a.wins || b.win_pct - a.win_pct || a.losses - b.losses);

  return json({ entries: entries.slice(0, 50) });
}
