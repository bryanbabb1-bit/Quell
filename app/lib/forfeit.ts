// Forfeit policy — MUST mirror api/src/routes/reminders.ts. A missing score
// forfeits the match at 7pm LOCAL the day AFTER the play date (1-day window).
export const FORFEIT_HOUR = 19;

// The forfeit deadline for a match as a local Date (device TZ ≈ the player's).
export function forfeitDeadline(playDate: string): Date {
  const [y, m, d] = playDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d, FORFEIT_HOUR, 0, 0, 0); // play day, 7pm local
  dt.setDate(dt.getDate() + 1);                            // → next day, 7pm local
  return dt;
}

// Local YYYY-MM-DD (for "has the play date passed?" comparisons against play_date).
export function todayLocalISO(): string {
  return new Date().toLocaleDateString('en-CA'); // en-CA renders as ISO
}

// A match is in the pre-forfeit window when it's an APART match (live/together
// rounds resolve through live scoring), the play date has passed, and the cards
// aren't both in yet.
export function isPendingForfeit(m: {
  status: string; play_date: string; playing_together?: number | null;
  creator_scorecard_id?: string | null; opponent_scorecard_id?: string | null;
}): boolean {
  if (m.playing_together) return false;
  if (m.status !== 'accepted' && m.status !== 'in_progress') return false;
  if (m.play_date > todayLocalISO()) return false;
  return !(m.creator_scorecard_id && m.opponent_scorecard_id);
}
