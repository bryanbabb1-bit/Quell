# Foretera — Backend Stability & Scalability Review

_June 14, 2026 — done before the beta push. Bottom line: **the stack is fine to
put 50–500 beta testers on as-is.** Nothing on the hot path falls over at that
volume. The architecture is solid — guarded conditional UPDATEs on every state
transition, snapshotted handicaps, fail-open rate limiting, explicit column
projections, bounded `LIMIT` on every list query._

## Actioned this session (the cheap, high-value, safe wins)
- ✅ **Verified remote D1 has every index from migrations 0014–0019** — the
  out-of-sync migration tracker did NOT drop anything in prod.
- ✅ **Added `idx_matches_course_status (course_name, status, play_date)`**
  (migration 0020) — the single highest-leverage index. The leaderboard (by
  course), monthly champions, the staff dashboard, and the feed pulse all filter
  by (course_name, status); neither prior composite gave a clean prefix, so they
  scanned completed matches. Now index-driven.
- ✅ **`client_logs` 30-day retention sweep** folded into the hourly cron
  (`reminders.ts`) — prevents the append-only log table growing into the D1 size
  ceiling.

## 🔴 / 🟡 Before a public/live EVENT (not a beta blocker)
**Live gamecast polling cost** — `GET /matches/:id/live` polls every 8s per
viewer and runs ~10 uncached D1 reads (`live.ts buildLiveState` +
`scorecards.ts computeLiveState`: match+users, followers, reactions GROUP BY,
2× tee + 2× holes + 2× cards, follower count, viewer card). The tees+holes are
**immutable for a match** yet re-fetched every poll; the gamecast is identical
for every spectator (only a participant's `your_holes` differs). At ~50
spectators on one match that's ~60 queries/s of pure waste.
- **Fix (before any crowd):** cache the computed gamecast per match (Cache API /
  KV with a few-second TTL, invalidated on `live-score`/`confirm`); memoize
  tees+holes; serve spectators the cached blob with zero per-viewer queries.
  Optionally a `next_poll_ms` hint, then SSE/Durable Objects later.
- Amber for beta because 500 testers won't put 50 concurrent spectators on one
  match day one — but it's the one pattern that scales with *engagement*, not
  user count.

## 🟡 Fix-soon (clean up before low-thousands of users)
- **Materialized standings** — leaderboard/champions/dashboard aggregate in JS
  over a full pull of completed matches at a course. With the new index this is
  fast at beta scale (single-digit-thousands of rows), but a materialized
  standings/rollup table is the real fix past that. The code comments already
  acknowledge this.
- **Reactions write volume** — `cheer` inserts one row per tap (capped by the
  300/60s limiter). Aggregate client-side (send counts) or keep a running tally
  column; fold the GROUP BY into the gamecast cache.
- **`courseFeed` follower-count correlated subquery** (per row, ≤100) — fine
  with the index, but a materialized `follower_count` column would remove the
  N+1 shape.
- **Per-endpoint rate sub-limits** — the limiter is one global 300/60s bucket
  per user; a client could spend it all on `cheer`/`logs`/`live-score` writes.
  Consider tighter buckets on pure-write spam endpoints.

## 🟢 Correctly built (verified)
- Race conditions in accept/settle/confirm/cancel/decline/forfeit — all guarded
  conditional UPDATEs checking `meta.changes`. The strongest part of the code.
- Every `JSON.parse` of progression/cards is try/caught (one trusted-input
  exception in `grossFor`, server-written only).
- Fire-and-forget pushes swallow errors, never throw into the request path.
- Discovery (`LIMIT 100`), listMine (`LIMIT 200`), messages (`LIMIT 500`) all
  bounded + indexed. Reminder cron scoped to a 14-day active window. Champions
  cron iterates network clubs only. D1 writes are small single-row upserts
  partitioned by match — no hot-row contention.

## Pre-beta operational notes
- **Clerk is on the `pk_test_` instance** (eas.json env). Fine to start a beta;
  set up a production Clerk instance before scaling the tester count.
- Remote migrations are applied by hand (`wrangler d1 execute --file`), never
  `migrations apply --remote`. After each migration, spot-check the object
  exists remotely (done for 0014–0020).
