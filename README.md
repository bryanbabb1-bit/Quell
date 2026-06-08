# Match Play

Golf match discovery + scorecard-verification app for club members. Evolves the
**Marker** scorecard-photo OCR engine into a matchmaking platform: post an open
match (stake, handicap range, course, tees, date/time), an opponent swipes to
accept, both play independently, photograph their scorecards, and the app reads
both cards, applies handicaps, and reveals the winner hole-by-hole.

> **Not a betting app.** The app never touches money. Stakes are displayed for
> context only; all settlement happens off-platform.

## Status — Phase 2 backend complete
- **Phase 1 ✅** — monorepo scaffold, D1 schema, Clerk auth shell (sign-in → `/me` upsert).
- **Phase 2 (backend) ✅** — `matches` CRUD + discovery feed (handicap-range
  filter) + accept/cancel/decline state machine (handicaps snapshot on accept)
  + durable in-app messaging; `ghin_number` added to the profile (GHIN-ready).
- **Next** — Phase 2 mobile screens (discovery swipe, create, match detail,
  messaging, profile), then Phase 3 (course model + manual score entry +
  hidden-entry lock + determination engine + reveal).

`scorecards` / `reveal` remain `501` stubs until Phase 3. See
[`docs/MATCH_PLAY_ARCHITECTURE.md`](docs/MATCH_PLAY_ARCHITECTURE.md) for the full
plan, [`docs/V1_REVISION.md`](docs/V1_REVISION.md) for the current V1 direction,
and [`docs/SETUP.md`](docs/SETUP.md) to run it locally.

## Stack
Reuses the proven [TrueForecasting](https://trueforecasting.app) architecture
rather than the Node/Express + Postgres in the original plan doc.

- **Mobile:** Expo (React Native) + Expo Router, Clerk auth, Reanimated
- **Backend:** Cloudflare Workers + D1 (SQLite), `@clerk/backend` JWT verification
- **Data:** D1 is the system of record; realtime messaging vendor TBD (decide during build)
- **OCR:** client-side scorecard reader + server-side validation (later phase)

## Structure
```
app/       # Expo (React Native) mobile app — Expo Router
api/       # Cloudflare Workers API + D1 migrations
docs/      # architecture & specs
```
