import type { Env } from '../types';
import { now } from '../lib/id';
import { sendPush } from '../lib/push';

// Scheduled (hourly cron) score-reminder + forfeit sweep. Policy:
//   • play day, after 7pm LOCAL, not submitted  → "post your score" reminder
//   • +1 day, not submitted                     → "you'll forfeit" warning
//   • +2 days, not submitted                    → FORFEIT:
//        - other player submitted → they win by forfeit (completed, no reveal)
//        - neither submitted      → match 'expired'
// Keeps the discovery/match feed from filling with matches that never finish.
const DEFAULT_TZ = 'America/Chicago';

function nowInTz(tz: string): { date: string; hour: number } {
  const d = new Date();
  try {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d); // YYYY-MM-DD
    const hp = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false })
      .formatToParts(d).find((p) => p.type === 'hour')?.value ?? '0';
    return { date, hour: parseInt(hp, 10) % 24 };
  } catch {
    return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
  }
}
const daysBetween = (fromYmd: string, toYmd: string) =>
  Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);

export async function runReminders(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

  // Retention: client_logs is append-only (every console.error from every
  // client). Trim anything older than 30 days each tick so it can't grow
  // unbounded into the D1 size ceiling. Best-effort — never block reminders.
  await env.DB.prepare(`DELETE FROM client_logs WHERE created_at < datetime('now','-30 days')`)
    .run().catch(() => {});

  const { results } = await env.DB.prepare(
    `SELECT m.id, m.course_name, m.play_date, m.creator_id, m.opponent_id,
            m.creator_scorecard_id, m.opponent_scorecard_id,
            m.score_reminder_at, m.forfeit_warning_at,
            cu.timezone AS creator_tz, ou.timezone AS opponent_tz
       FROM matches m
       JOIN users cu ON cu.id = m.creator_id
       LEFT JOIN users ou ON ou.id = m.opponent_id
      WHERE m.status IN ('accepted','in_progress') AND m.opponent_id IS NOT NULL
        AND m.play_date <= ? AND m.play_date >= ?`
  ).bind(today, since).all<Record<string, any>>();

  for (const m of results ?? []) {
    const creatorIn = !!m.creator_scorecard_id;
    const opponentIn = !!m.opponent_scorecard_id;
    if (creatorIn && opponentIn) continue; // will settle on its own

    const ref = nowInTz(m.creator_tz || DEFAULT_TZ);
    const daysSince = daysBetween(m.play_date, ref.date);
    const unsubmitted: string[] = [];
    if (!creatorIn) unsubmitted.push(m.creator_id);
    if (!opponentIn) unsubmitted.push(m.opponent_id);
    const course = m.course_name as string;

    // ── Forfeit (+2 days) ──
    // Guarded UPDATEs (status IN accepted/in_progress) + push only when the
    // write actually landed — overlapping cron invocations otherwise both read
    // the stale row and double-push the forfeit.
    if (daysSince >= 2) {
      if (creatorIn !== opponentIn) {
        const winnerId = creatorIn ? m.creator_id : m.opponent_id;
        const loserId = creatorIn ? m.opponent_id : m.creator_id;
        const result = creatorIn ? 'creator_wins' : 'opponent_wins';
        const res = await env.DB.prepare(
          `UPDATE matches SET status='completed', result=?, completed_at=?, updated_at=?
            WHERE id=? AND status IN ('accepted','in_progress')`
        ).bind(result, now(), now(), m.id).run();
        if ((res.meta.changes ?? 0) > 0) {
          await sendPush(env, winnerId, 'You won by forfeit', `Your opponent didn't submit their ${course} score in time.`, { matchId: m.id });
          await sendPush(env, loserId, 'You forfeited', `You didn't submit your ${course} score in time.`, { matchId: m.id });
        }
      } else {
        // neither submitted
        const res = await env.DB.prepare(
          `UPDATE matches SET status='expired', updated_at=? WHERE id=? AND status IN ('accepted','in_progress')`
        ).bind(now(), m.id).run();
        if ((res.meta.changes ?? 0) > 0) {
          for (const uid of unsubmitted) await sendPush(env, uid, 'Match expired', `Neither player submitted a score for ${course}.`, { matchId: m.id });
        }
      }
      continue;
    }

    // ── Warning (+1 day) ── (stamp BEFORE pushing: a duplicate stamp is
    // harmless, a missed stamp re-sends the warning every hour)
    if (daysSince === 1 && !m.forfeit_warning_at) {
      const res = await env.DB.prepare(
        `UPDATE matches SET forfeit_warning_at=? WHERE id=? AND forfeit_warning_at IS NULL`
      ).bind(now(), m.id).run();
      if ((res.meta.changes ?? 0) > 0) {
        for (const uid of unsubmitted) {
          await sendPush(env, uid, 'Submit or forfeit', `Enter your ${course} score by tomorrow or you'll forfeit the match.`, { matchId: m.id });
        }
      }
      continue;
    }

    // ── Reminder (play day, after 7pm local) ──
    if (daysSince === 0 && ref.hour >= 19 && !m.score_reminder_at) {
      const res = await env.DB.prepare(
        `UPDATE matches SET score_reminder_at=? WHERE id=? AND score_reminder_at IS NULL`
      ).bind(now(), m.id).run();
      if ((res.meta.changes ?? 0) > 0) {
        for (const uid of unsubmitted) {
          await sendPush(env, uid, 'Post your score', `Don't forget to enter your ${course} score from today's match.`, { matchId: m.id });
        }
      }
    }
  }
}
