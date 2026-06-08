import type { MatchStatus } from '@/types';

export function formatHandicap(h: number | null | undefined): string {
  if (h == null) return 'No index';
  // Plus handicaps (better than scratch) render as "+2.1".
  return h < 0 ? `+${Math.abs(h).toFixed(1)}` : h.toFixed(1);
}

// "Sat, Jun 14 · 9:30 AM" from a YYYY-MM-DD (+ optional HH:MM).
export function formatPlayWhen(date: string, time: string | null | undefined): string {
  const d = new Date(date + 'T00:00:00');
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (!time) return day;
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${day} · ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Match-play scoreline from a signed holes-up delta (viewer's perspective).
export function deltaLabel(delta: number): string {
  if (delta === 0) return 'All Square';
  return delta > 0 ? `${delta} Up` : `${Math.abs(delta)} Down`;
}

export const STATUS_LABELS: Record<MatchStatus, string> = {
  open: 'Open',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};
