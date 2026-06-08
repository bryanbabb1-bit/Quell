# Match Play

Golf match discovery + scorecard-verification app for club members. Evolves the
**Marker** scorecard-photo OCR engine into a matchmaking platform: post an open
match (stake, handicap range, course, tees, date/time), an opponent swipes to
accept, both play independently, photograph their scorecards, and the app reads
both cards, applies handicaps, and reveals the winner hole-by-hole.

> **Not a betting app.** The app never touches money. Stakes are displayed for
> context only; all settlement happens off-platform.

## Status
Early build. See [`docs/MATCH_PLAY_ARCHITECTURE.md`](docs/MATCH_PLAY_ARCHITECTURE.md)
for the full architecture & planning doc — start there.

## Stack
- **Mobile:** React Native (Expo), Clerk auth, Reanimated
- **Backend:** Node + Express
- **Data:** PostgreSQL (system of record); realtime/messaging vendor TBD
- **OCR:** client-side scorecard reader + server-side validation

## Structure
```
mobile/    # React Native app
backend/   # Node + Express API
docs/      # architecture & specs
```
