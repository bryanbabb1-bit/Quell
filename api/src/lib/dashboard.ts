import type { Env } from '../types';
import { monthKey } from '../lib/date';

// The staff Pulse Dashboard's data — the ROI artifact a club pays for. Every
// metric is derived from matches PLAYED AT the club (course_name → the club's
// course) plus the demand signals. We have no membership roster, so "members"
// = golfers who've played here at least once; that proxy is honest and is
// itself the sellable number ("31 golfers played your club this month").

export interface DashboardPlayer {
  user_id: string;
  name: string;
  photo_url: string | null;
}

export interface ClubDashboard {
  course_name: string;
  this_week: { matches: number; players: number };
  last_week: { matches: number; players: number };
  trend: { week: string; matches: number }[];        // 8 weeks, oldest → newest
  month_matches: number;
  active_this_month: number;
  new_this_month: number;
  returning_this_month: number;
  most_active: (DashboardPlayer & { matches: number })[];
  churn: { count: number; players: (DashboardPlayer & { last_played: string })[] };
  live_now: number;
  open_invites: number;
  demand: { total: number; last_30d: number };
}

const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function buildDashboard(env: Env, clubId: string, courseName: string): Promise<ClubDashboard> {
  const todayMs = Date.parse(ymd(Date.now()) + 'T00:00:00Z');
  const month = monthKey();

  // One pull of the club's completed-match history → aggregate in JS (cheap at
  // beta scale; revisit with materialized rollups if volume explodes).
  const { results: rows } = await env.DB.prepare(
    `SELECT creator_id, opponent_id, play_date FROM matches
      WHERE status = 'completed' AND opponent_id IS NOT NULL AND course_name = ?`
  ).bind(courseName).all<{ creator_id: string; opponent_id: string; play_date: string }>();

  // Per-player: every date they played, and a running match count.
  const playDates = new Map<string, string[]>();
  const addPlay = (id: string, d: string) => {
    const arr = playDates.get(id) ?? [];
    arr.push(d); playDates.set(id, arr);
  };
  let weekMatches = 0, lastWeekMatches = 0, monthMatches = 0;
  const weekPlayers = new Set<string>(), lastWeekPlayers = new Set<string>();
  const trendBuckets: number[] = new Array(8).fill(0);

  for (const m of rows ?? []) {
    addPlay(m.creator_id, m.play_date);
    addPlay(m.opponent_id, m.play_date);
    const ageDays = Math.floor((todayMs - Date.parse(m.play_date + 'T00:00:00Z')) / DAY);
    if (ageDays >= 0 && ageDays < 7) { weekMatches++; weekPlayers.add(m.creator_id); weekPlayers.add(m.opponent_id); }
    else if (ageDays >= 7 && ageDays < 14) { lastWeekMatches++; lastWeekPlayers.add(m.creator_id); lastWeekPlayers.add(m.opponent_id); }
    if (ageDays >= 0 && ageDays < 56) trendBuckets[7 - Math.floor(ageDays / 7)]++;
    if (m.play_date.slice(0, 7) === month) monthMatches++;
  }

  // This month: active / new / returning + most active.
  const monthCount = new Map<string, number>();
  const activeThisMonth = new Set<string>();
  for (const [id, dates] of playDates) {
    const n = dates.filter((d) => d.slice(0, 7) === month).length;
    if (n > 0) { activeThisMonth.add(id); monthCount.set(id, n); }
  }
  let newThisMonth = 0;
  for (const id of activeThisMonth) {
    const first = playDates.get(id)!.reduce((a, b) => (a < b ? a : b));
    if (first.slice(0, 7) === month) newThisMonth++;
  }

  // Churn watch: last played 30–90 days ago (lapsing, not yet gone).
  const churn: (DashboardPlayer & { last_played: string })[] = [];
  for (const [id, dates] of playDates) {
    const last = dates.reduce((a, b) => (a > b ? a : b));
    const ageDays = Math.floor((todayMs - Date.parse(last + 'T00:00:00Z')) / DAY);
    if (ageDays >= 30 && ageDays <= 90) churn.push({ user_id: id, name: '', photo_url: null, last_played: last });
  }
  churn.sort((a, b) => b.last_played.localeCompare(a.last_played));

  // Most active this month (top 5).
  const topActive = [...monthCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Live + open right now.
  const [live, open, demandTotal, demandRecent] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM matches WHERE course_name = ? AND status IN ('accepted','in_progress') AND play_date = ?`).bind(courseName, ymd(todayMs)).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM matches WHERE course_name = ? AND status = 'open' AND play_date >= ?`).bind(courseName, ymd(todayMs)).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM club_interest WHERE club_id = ?`).bind(clubId).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM club_interest WHERE club_id = ? AND created_at >= ?`).bind(clubId, new Date(todayMs - 30 * DAY).toISOString()).first<{ n: number }>(),
  ]);

  // Hydrate the names we actually surface (most-active + churn list, capped).
  const churnTop = churn.slice(0, 12);
  const needIds = [...new Set([...topActive.map((t) => t[0]), ...churnTop.map((c) => c.user_id)])];
  const nameById = new Map<string, string>(), photoById = new Map<string, string | null>();
  if (needIds.length) {
    const ph = needIds.map(() => '?').join(',');
    const { results: us } = await env.DB.prepare(
      `SELECT id, first_name, last_name, profile_photo_url FROM users WHERE id IN (${ph})`
    ).bind(...needIds).all<{ id: string; first_name: string | null; last_name: string | null; profile_photo_url: string | null }>();
    for (const u of us ?? []) {
      nameById.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'A golfer');
      photoById.set(u.id, u.profile_photo_url ?? null);
    }
  }

  return {
    course_name: courseName,
    this_week: { matches: weekMatches, players: weekPlayers.size },
    last_week: { matches: lastWeekMatches, players: lastWeekPlayers.size },
    trend: trendBuckets.map((matches, i) => ({ week: `${8 - i}w`, matches })),
    month_matches: monthMatches,
    active_this_month: activeThisMonth.size,
    new_this_month: newThisMonth,
    returning_this_month: activeThisMonth.size - newThisMonth,
    most_active: topActive.map(([id, matches]) => ({ user_id: id, name: nameById.get(id) ?? 'A golfer', photo_url: photoById.get(id) ?? null, matches })),
    churn: { count: churn.length, players: churnTop.map((c) => ({ ...c, name: nameById.get(c.user_id) ?? 'A golfer', photo_url: photoById.get(c.user_id) ?? null })) },
    live_now: live?.n ?? 0,
    open_invites: open?.n ?? 0,
    demand: { total: demandTotal?.n ?? 0, last_30d: demandRecent?.n ?? 0 },
  };
}
