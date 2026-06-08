# V1 Revision — 2026-06-08

Decisions that supersede parts of `MATCH_PLAY_ARCHITECTURE.md`. The original
handoff doc stays as the north star; this records where V1 deliberately differs.

## 1. Backend stack — Cloudflare, not Express/Postgres
V1 reuses the TrueForecasting stack: **Cloudflare Workers + D1 (SQLite) +
`@clerk/backend`** on the API, **Expo Router + `@clerk/clerk-expo`** on mobile.
Postgres remains a fallback if the data model outgrows D1. (Supersedes §4/§13's
Node/Express + Postgres.)

## 2. Manual score entry replaces photo/OCR for V1
The scorecard **photo + OCR engine is cut from V1.** Instead: a clean manual
hole-by-hole score entry UI. This removes the hardest, riskiest component and
lets the core loop ship deterministically.

- The **hidden lock is preserved** — now a *hidden-entry* lock. Neither player
  sees the other's entered scores until BOTH have submitted. Enforced
  server-side. (§6 still applies, just to manual entries.)
- Photo capture returns later as the **verification / anti-cheat layer** ("Marker"
  reborn) — an upgrade, not a dependency. Manual entry is trust-based, which is
  fine for the closed buddy/Prairie beta.
- Schema impact: the `scorecards` table's photo/OCR fields (`photo_url`,
  `parsed_data`, `confidence`) give way to manual hole-by-hole gross scores.
  Since no DB is created yet, this is folded into `0001_init.sql` directly when
  Phase 3 is built — no throwaway migration.

## 3. National course model + course-adjusted handicaps (WHS)
Architect for a nationwide course database from the start.

**Data model (new):**
```
courses        id, name, club_id?, city, state, ...
tees           id, course_id, name (white/blue/black…), gender,
               course_rating (REAL), slope_rating (INT), par (INT)
holes          id, tee_id, hole_number (1–18), par (INT), stroke_index (1–18)
```
`users.handicap` is the **Handicap Index**. The engine course-adjusts it at
match time:

- **Course Handicap** = `Index × (Slope ÷ 113) + (Course Rating − Par)`
- **Strokes given** = difference between the two players' Course Handicaps,
  allocated by `stroke_index` (receiver gets a stroke on every hole with
  `stroke_index ≤ difference`; wraps for a 2nd stroke when difference > 18).
- **Net per hole** = gross − strokes received. Lower net wins the hole; running
  delta ("2 Up", "Even") drives the reveal.

**Sourcing (realism):** there is no clean public GHIN API (USGA/allied-assoc
authorization required) and no free nationwide stroke-index dataset to bulk
import. Pragmatic path:
1. **Seed Prairie Highlands** (all tees) now — closed beta is 100% Prairie.
2. **Add courses on-demand** — a course is created the first time a match is
   posted there, growing the DB organically.
3. **Bulk import** wired later if a good data source appears.
4. **GHIN index-pull** is a future integration; the schema is ready for it, and
   the math above is identical whether the index is entered manually or pulled.

## 4. Player records, hot streaks, per-club leaderboards (promoted into V1)
Originally a post-trial roadmap item (§12); now part of the V1 architecture as
the community/engagement hook for the Prairie pitch.

- **Wins / losses / streaks are derived from `matches`** (completed matches with
  a `result`). No denormalized stat columns yet — compute from queries; add a
  materialized summary only if it gets slow.
- New concept needed only for scoping: **clubs.**
```
clubs            id, name, ...
club_members     club_id, user_id, joined_at        (many-to-many)
```
  `courses.club_id` links a course to its club. Leaderboards = aggregate of
  completed matches scoped by club; "hot streak" = current consecutive-win run.

## Revised phase roadmap
- **Phase 1 ✅** — scaffold + D1 schema + Clerk auth shell.
- **Phase 2** — matches CRUD + discovery feed (handicap-range filter) +
  state machine (accept snapshots both course handicaps) + in-app messaging.
- **Phase 3** — course model (seed Prairie) + manual score-entry UI +
  hidden-entry lock + **determination engine** (course handicap → pops → net
  match-play result) + Reanimated reveal.
- **Phase 4** — player records + per-club leaderboards + hot streaks.
- **Later** — photo/OCR verification layer; GHIN index integration; bulk course
  import; multi-club packaging.
