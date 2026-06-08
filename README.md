# Match Play

Golf match discovery + scorecard-verification app for club members. Evolves the
**Marker** scorecard-photo OCR engine into a matchmaking platform: post an open
match (stake, handicap range, course, tees, date/time), an opponent swipes to
accept, both play independently, photograph their scorecards, and the app reads
both cards, applies handicaps, and reveals the winner hole-by-hole.

> **Not a betting app.** The app never touches money. Stakes are displayed for
> context only; all settlement happens off-platform.

## Status — Phase 1 complete
Monorepo scaffold, full D1 schema (users / matches / scorecards / messages),
and a working Clerk auth shell (sign-in → `/me` upsert). `matches`,
`scorecards`, and `messages` routes are wired with documented contracts and
`501` stubs — their logic is the next phases (discovery, hidden-card lock,
match determination). See [`docs/MATCH_PLAY_ARCHITECTURE.md`](docs/MATCH_PLAY_ARCHITECTURE.md)
for the full plan and [`docs/SETUP.md`](docs/SETUP.md) to run it locally.

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
