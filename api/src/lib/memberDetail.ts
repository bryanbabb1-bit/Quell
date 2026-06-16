import type { Env } from '../types';
import type { DashboardPlayer } from './dashboard';

// A single member's engagement story, from the CLUB's point of view — not a
// scoreboard. Win/loss is deliberately absent: a club cares whether someone is
// woven into the community and trending up or down, not who beat whom. Every
// number derives from completed matches PLAYED AT the club involving this user,
// plus whether they're looking for a game right now. Staff-gated by the route.

const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type MemberStatus = 'new' | 'active' | 'cooling' | 'lapsed';

export interface ClubMemberDetail {
  user_id: string;
  name: string;
  photo_url: string | null;
  handicap: number | null;
  status: MemberStatus;
  headline: string;                                  // a plain-English read for staff
  member_since: string | null;                       // first play at this club (YYYY-MM-DD)
  total_matches: number;
  matches_30d: number;
  last_played: string | null;
  days_since: number | null;
  per_week: number;                                  // avg over the last 8 weeks (1 dp)
  trend: { week: string; matches: number }[];        // 8 weeks, oldest → newest
  momentum: 'rising' | 'steady' | 'cooling';
  partners_count: number;                            // unique opponents here = "members met"
  top_partners: (DashboardPlayer & { matches: number })[];
  looking_now: boolean;                              // has an open invite here today+
}

export async function buildMemberDetail(
  env: Env,
  courseName: string,
  userId: string
): Promise<ClubMemberDetail | null> {
  const todayMs = Date.parse(ymd(Date.now()) + 'T00:00:00Z');

  const u = await env.DB.prepare(
    'SELECT id, first_name, last_name, profile_photo_url, handicap FROM users WHERE id = ?'
  ).bind(userId).first<{ id: string; first_name: string | null; last_name: string | null; profile_photo_url: string | null; handicap: number | null }>();
  if (!u) return null;

  const { results: rows } = await env.DB.prepare(
    `SELECT creator_id, opponent_id, play_date FROM matches
      WHERE status = 'completed' AND opponent_id IS NOT NULL AND course_name = ?
        AND (creator_id = ? OR opponent_id = ?)`
  ).bind(courseName, userId, userId).all<{ creator_id: string; opponent_id: string; play_date: string }>();

  const dates: string[] = [];
  const partnerCount = new Map<string, number>();
  let total = 0, m30 = 0, last4 = 0, prev4 = 0;
  const trend: number[] = new Array(8).fill(0);

  for (const m of rows ?? []) {
    total++;
    dates.push(m.play_date);
    const partner = m.creator_id === userId ? m.opponent_id : m.creator_id;
    partnerCount.set(partner, (partnerCount.get(partner) ?? 0) + 1);
    const ageDays = Math.floor((todayMs - Date.parse(m.play_date + 'T00:00:00Z')) / DAY);
    if (ageDays >= 0 && ageDays < 30) m30++;
    if (ageDays >= 0 && ageDays < 56) trend[7 - Math.floor(ageDays / 7)]++;
    if (ageDays >= 0 && ageDays < 28) last4++;
    else if (ageDays >= 28 && ageDays < 56) prev4++;
  }

  const memberSince = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  const lastPlayed = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  const daysSince = lastPlayed ? Math.floor((todayMs - Date.parse(lastPlayed + 'T00:00:00Z')) / DAY) : null;
  const firstAge = memberSince ? Math.floor((todayMs - Date.parse(memberSince + 'T00:00:00Z')) / DAY) : null;

  let status: MemberStatus;
  if (daysSince == null) status = 'lapsed';
  else if (firstAge != null && firstAge < 30) status = 'new';
  else if (daysSince <= 30) status = 'active';
  else if (daysSince <= 90) status = 'cooling';
  else status = 'lapsed';

  const perWeek = Math.round((trend.reduce((a, b) => a + b, 0) / 8) * 10) / 10;
  const momentum: 'rising' | 'steady' | 'cooling' = last4 > prev4 ? 'rising' : last4 < prev4 ? 'cooling' : 'steady';

  const partnersCount = partnerCount.size;

  // Top playing partners — hydrate names/photos.
  const topPartnerIds = [...partnerCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const needIds = topPartnerIds.map((t) => t[0]);
  const nameById = new Map<string, string>(), photoById = new Map<string, string | null>();
  if (needIds.length) {
    const ph = needIds.map(() => '?').join(',');
    const { results: us } = await env.DB.prepare(
      `SELECT id, first_name, last_name, profile_photo_url FROM users WHERE id IN (${ph})`
    ).bind(...needIds).all<{ id: string; first_name: string | null; last_name: string | null; profile_photo_url: string | null }>();
    for (const p of us ?? []) {
      nameById.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'A golfer');
      photoById.set(p.id, p.profile_photo_url ?? null);
    }
  }
  const topPartners = topPartnerIds.map(([id, matches]) => ({
    user_id: id, name: nameById.get(id) ?? 'A golfer', photo_url: photoById.get(id) ?? null, matches,
  }));

  const looking = await env.DB.prepare(
    `SELECT 1 FROM matches WHERE course_name = ? AND creator_id = ? AND status = 'open' AND play_date >= ? LIMIT 1`
  ).bind(courseName, userId, ymd(todayMs)).first();

  return {
    user_id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'A golfer',
    photo_url: u.profile_photo_url ?? null,
    handicap: u.handicap ?? null,
    status,
    headline: headlineFor(status, total, m30, daysSince, momentum, partnersCount),
    member_since: memberSince,
    total_matches: total,
    matches_30d: m30,
    last_played: lastPlayed,
    days_since: daysSince,
    per_week: perWeek,
    trend: trend.map((matches, i) => ({ week: `${8 - i}w`, matches })),
    momentum,
    partners_count: partnersCount,
    top_partners: topPartners,
    looking_now: !!looking,
  };
}

// The one-line read staff act on. Engagement framing, never win/loss.
function headlineFor(
  status: MemberStatus, total: number, m30: number, daysSince: number | null,
  momentum: 'rising' | 'steady' | 'cooling', partners: number
): string {
  if (status === 'new') {
    // "new" = first match on Foretera here was recent — NOT a claim about club
    // tenure (they may be a 10-year member who just started logging here).
    return total >= 3 ? 'New to the board — off to a strong start.' : 'New to the board — first match here was recent.';
  }
  if (status === 'lapsed') {
    return `Lapsed — quiet ${daysSince ?? '90+'} days. Worth a personal nudge.`;
  }
  if (status === 'cooling') {
    return `Cooling off — last played ${daysSince} days ago.`;
  }
  // active
  if (momentum === 'rising') return `Regular and heating up — ${m30} in the last 30 days.`;
  if (partners <= 1 && total >= 3) return 'Active, but mostly plays the same partner — an intro could help.';
  return `Steady regular — well connected with ${partners} ${partners === 1 ? 'member' : 'members'} here.`;
}
