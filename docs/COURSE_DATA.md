# Seeding real course data

> ✅ **DONE (2026-06-09):** 11 KC-metro courses imported with REAL par, stroke
> index, and USGA CR/Slope (Prairie Highlands, Ironhorse, Falcon Ridge, Sycamore
> Ridge, Shadow Glen, Deer Creek, Tomahawk Hills, Canyon Farms, The National of
> KC, Tiffany Greens, Shoal Creek). Source = **GolfCourseAPI** via
> `api/scripts/import_courses.mjs` → `seeds/real_courses.sql` (applied
> local+remote). The API key lives in the `GOLF_COURSE_API_KEY` Windows User env
> var (never committed). To add more courses: append names to `QUERIES` in the
> script and re-run `node scripts/import_courses.mjs`, then
> `wrangler d1 execute match-play --remote --file=seeds/real_courses.sql`.
> Free tier is rate-limited — the script throttles (1.8s) + retries on 429.


Quell scores against real `courses → tees → holes` rows (par + stroke index per
hole, plus course rating / slope / par per tee, with front-9 and back-9 splits
for 9-hole handicapping). Today the catalog has only the placeholder
`Sample Links` course; everything else is free-text. This doc is the plan to
replace that with real, public data.

## What we need per tee (matches the D1 schema)
- `par` per hole (1..18) and a complete **stroke index** 1..18
- per-tee `course_rating`, `slope_rating`, `par`
- `front_course_rating / front_slope_rating / front_par` and the `back_*` trio
  (so the engine handicaps a front-9 or back-9 match correctly)

## Public sources (researched 2026-06-09)
- **GolfCourseAPI** — `golfcourseapi.com` — *the only fully free* golf-course API
  (~30k courses, sign up with an email for a key; paid tiers $9.99 / $24.99).
  Good for par + ratings; **verify it returns per-hole stroke index** before
  relying on it (see caveat).
- **iGolf Connect** — ~38k courses, 150+ countries; par + handicap + slope/rating.
  Paid/licensed.
- **Golf Intelligence**, **golfapi.io**, **SportsFirst** — paid course-data APIs
  with scorecards, tee sets, slope/rating, GPS.

### ⚠️ Caveat — the two fields most often missing/unofficial
1. **Stroke index (hole handicap 1..18)** is the weakest field across these
   APIs. When an API lacks it, pull it from the course's **printed scorecard**
   (course website / pro shop) — it's printed on every card.
2. **Course Rating & Slope** are official **USGA** values. The authoritative US
   source is the USGA Course Rating database / GHIN course lookup (ties into the
   GPA program we already plan to pursue for handicap data — see project memory).

## Recommended approach
1. **Bootstrap free:** get a GolfCourseAPI key; fetch the courses in our beta
   region (Prairie Highlands first).
2. **Fill gaps:** take stroke index (and verify CR/Slope) from each course's
   official scorecard / USGA lookup.
3. **Importer script:** a small Node/worker script that fetches a course from the
   API + merges verified SI, then emits an idempotent `seeds/<course>.sql`
   (`INSERT OR IGNORE` into courses/tees/holes, same shape as
   `seeds/sample_course.sql`). Run `wrangler d1 execute --remote --file=...`.
4. The create-match **course/tee picker** (now built) reads `GET /courses` +
   `GET /courses/:id`, so seeded courses appear automatically — no app change.

## Prairie Highlands (beta course) — TODO
Get the real card (par + SI per tee, CR/Slope) from the GolfCourseAPI entry +
the printed scorecard, then replace the placeholder seed. Until then, the seeded
named courses use **standard par-72 / typical SI** as stand-ins (clearly marked).
