import type { Env } from '../types';
import type { DashboardPlayer } from './dashboard';

// Suggested intros — the club as matchmaker. We look for members who'd likely
// enjoy a game together but HAVEN'T played: similar handicap (a competitive net
// match), both currently active, with a bonus for pairing a newcomer with an
// established regular (the best onboarding moment). It's the "meet members"
// promise made concrete for the pro to act on. All derived from matches played
// AT the club. Staff-gated by the route.

const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
// Plus handicaps (better than scratch) are stored negative and read as "+2.0".
const fmtH = (h: number) => (h < 0 ? `+${Math.abs(h).toFixed(1)}` : h.toFixed(1));

export interface IntroPlayer extends DashboardPlayer { handicap: number | null; }
export interface IntroSuggestion { a: IntroPlayer; b: IntroPlayer; reason: string; }
export interface ClubIntros { suggestions: IntroSuggestion[]; }

export async function buildIntros(env: Env, courseName: string): Promise<ClubIntros> {
  const todayMs = Date.parse(ymd(Date.now()) + 'T00:00:00Z');

  const { results: rows } = await env.DB.prepare(
    `SELECT creator_id, opponent_id, play_date FROM matches
      WHERE status = 'completed' AND opponent_id IS NOT NULL AND course_name = ?`
  ).bind(courseName).all<{ creator_id: string; opponent_id: string; play_date: string }>();

  // Per-member activity + the set of pairs that have already met.
  const stats = new Map<string, { matches: number; first: string; last: string }>();
  const played = new Set<string>();
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const bump = (id: string, d: string) => {
    const s = stats.get(id);
    if (!s) stats.set(id, { matches: 1, first: d, last: d });
    else { s.matches++; if (d > s.last) s.last = d; if (d < s.first) s.first = d; }
  };
  for (const m of rows ?? []) {
    bump(m.creator_id, m.play_date);
    bump(m.opponent_id, m.play_date);
    played.add(pairKey(m.creator_id, m.opponent_id));
  }

  const ageDays = (d: string) => Math.floor((todayMs - Date.parse(d + 'T00:00:00Z')) / DAY);

  // Candidates: active within 90 days, capped to the 40 most-recent to bound the
  // O(n^2) pairing (plenty of headroom at beta scale).
  const candidates = [...stats.entries()]
    .filter(([, s]) => ageDays(s.last) <= 90)
    .sort((a, b) => b[1].last.localeCompare(a[1].last))
    .slice(0, 40)
    .map(([id]) => id);
  if (candidates.length < 2) return { suggestions: [] };

  // Hydrate names + handicaps for the candidate pool.
  const ph = candidates.map(() => '?').join(',');
  const { results: us } = await env.DB.prepare(
    `SELECT id, first_name, last_name, profile_photo_url, handicap FROM users WHERE id IN (${ph})`
  ).bind(...candidates).all<{ id: string; first_name: string | null; last_name: string | null; profile_photo_url: string | null; handicap: number | null }>();
  const info = new Map<string, IntroPlayer>();
  for (const u of us ?? []) {
    info.set(u.id, {
      user_id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'A golfer',
      photo_url: u.profile_photo_url ?? null,
      handicap: u.handicap ?? null,
    });
  }

  const isNewcomer = (id: string) => ageDays(stats.get(id)!.first) < 30;
  const isRecent = (id: string) => ageDays(stats.get(id)!.last) <= 30;

  // Score every un-played candidate pair.
  const scored: { a: string; b: string; score: number; reason: string }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const A = candidates[i], B = candidates[j];
      if (played.has(pairKey(A, B))) continue;
      const ia = info.get(A), ib = info.get(B);
      if (!ia || !ib) continue;

      let score = 0;
      if (ia.handicap != null && ib.handicap != null) {
        score += Math.max(0, 12 - Math.abs(ia.handicap - ib.handicap) * 1.5); // closer index → better match
      }
      score += Math.min(stats.get(A)!.matches, stats.get(B)!.matches);        // both engaged
      if (isRecent(A) && isRecent(B)) score += 4;                              // both warm right now
      const bridge = (isNewcomer(A) && stats.get(B)!.matches >= 4) || (isNewcomer(B) && stats.get(A)!.matches >= 4);
      if (bridge) score += 8;                                                  // newcomer ↔ regular = gold

      let reason: string;
      if (bridge) reason = 'Welcome intro — pair a newcomer with a regular';
      else if (ia.handicap != null && ib.handicap != null && Math.abs(ia.handicap - ib.handicap) <= 4)
        reason = `Even match · ${fmtH(ia.handicap)} & ${fmtH(ib.handicap)} index, never played`;
      else reason = 'Both regulars here — haven’t met yet';

      scored.push({ a: A, b: B, score, reason });
    }
  }
  scored.sort((x, y) => y.score - x.score);

  // Greedy diversify: cap each member to 2 appearances so the list isn't one
  // popular member paired with everyone.
  const appears = new Map<string, number>();
  const suggestions: IntroSuggestion[] = [];
  for (const p of scored) {
    if ((appears.get(p.a) ?? 0) >= 2 || (appears.get(p.b) ?? 0) >= 2) continue;
    suggestions.push({ a: info.get(p.a)!, b: info.get(p.b)!, reason: p.reason });
    appears.set(p.a, (appears.get(p.a) ?? 0) + 1);
    appears.set(p.b, (appears.get(p.b) ?? 0) + 1);
    if (suggestions.length >= 6) break;
  }
  return { suggestions };
}
