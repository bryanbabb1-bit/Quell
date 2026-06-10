import type { MatchStatus } from '@/types';

export function formatHandicap(h: number | null | undefined): string {
  if (h == null) return 'No index';
  // Plus handicaps (better than scratch) render as "+2.1".
  return h < 0 ? `+${Math.abs(h).toFixed(1)}` : h.toFixed(1);
}

// Parse a typed Handicap Index. Golf convention: a "+1.2" handicap is BETTER
// than scratch and is stored NEGATIVE (-1.2); a plain "8.4" is stored positive.
// Returns null for blank/non-numeric. Does NOT range-check — the caller decides.
export function parseHandicapInput(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const value = t.startsWith('+') ? -Number(t.slice(1)) : Number(t);
  return Number.isFinite(value) ? value : null;
}

// "Sat, Jun 14" from a YYYY-MM-DD. Match "when" is a date only — no tee time.
// (Second arg kept for call-site compatibility; intentionally ignored.)
export function formatPlayWhen(date: string, _time?: string | null): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Handicap-index freshness ────────────────────────────────────────────────
// The index is locked onto a match at post/accept; we nudge the user to confirm
// it when it's unset or older than this window.
export const INDEX_STALE_DAYS = 14;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

// Prompt to confirm the index when it's missing or stale.
export function isIndexStale(handicap: number | null | undefined, updatedAt: string | null | undefined): boolean {
  if (handicap == null) return true;
  const d = daysSince(updatedAt);
  return d == null || d > INDEX_STALE_DAYS;
}

// "Updated today" / "Updated 9 days ago" / "Not set yet".
export function indexAgeLabel(handicap: number | null | undefined, updatedAt: string | null | undefined): string {
  if (handicap == null) return 'Not set yet';
  const d = daysSince(updatedAt);
  if (d == null) return 'Last updated a while ago';
  if (d <= 0) return 'Updated today';
  if (d === 1) return 'Updated yesterday';
  return `Updated ${d} days ago`;
}

// Match-play scoreline from a signed holes-up delta (viewer's perspective).
export function deltaLabel(delta: number): string {
  if (delta === 0) return 'All Square';
  return delta > 0 ? `${delta} Up` : `${Math.abs(delta)} Down`;
}

export const STATUS_LABELS: Record<MatchStatus, string> = {
  open: 'Open',
  pending: 'Challenge',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
};
