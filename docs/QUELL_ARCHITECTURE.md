# FORETERA — Architecture (as built)

_Living document — updated on every meaningful push (see changelog at the
bottom). Repo `bryanbabb1-bit/Quell`; internal codename "quell" survives in the
bundle id, slug, and folder names. The original pre-build plan (Node + Postgres
+ Firebase + scorecard OCR) is in git history; what follows is what actually
runs._

---

## 1. What Foretera is

A golf head-to-head **match-play network**: post an open match (course, date,
format, handicap window) → another member accepts → both enter scores privately
→ a server-enforced hidden lock keeps each card sealed until both are in → the
engine settles the match net (WHS) and the players watch a hole-by-hole
**reveal**. Around that loop: a per-course **club board** (open invites, live
matches, finals, club pulse), career **records** (rivalries, course form,
milestones, leaderboards), match-scoped **messaging** (text + GIFs), and the
**club network** layer that monetizes it (see `UX_CLUB_NETWORK_STRATEGY.md`
and `PRICING.md`).

Positioning: an exclusive golf network (Black + Gold "Members" brand), NOT a
scorecard app — and explicitly NOT a wagering service. Stakes are display-only;
no money ever moves through the app.

## 2. Stack

| Layer | Tech | Notes |
|---|---|---|
| App | Expo / React Native, Expo Router, TypeScript | One codebase, both stores; EAS builds; OTA for JS |
| Animation | Reanimated + Gesture Handler | Swipe deck, reveal choreography, celebrations |
| State | Zustand stores (`app/store/`) | user, courses (session-cached), favorites, results badge, theme |
| Auth | Clerk (`@clerk/clerk-expo` + `@clerk/backend`) | JWT verified at the edge; token refresh + 401 retry in `lib/api.ts` |
| API | Cloudflare Worker (`api/src/index.ts`) | Route modules in `api/src/routes/` |
| Data | Cloudflare D1 (SQLite) | System of record; migrations in `api/migrations/` |
| Files | Cloudflare R2 (`quell-photos`) | Profile photos via `POST /photo` |
| Push | Expo Push | Token registered on `users`; never returned to clients |
| GIFs | Giphy (proxied) | `GET /gifs` keeps the key server-side |
| Cron | Workers scheduled (hourly) | Score reminders → forfeit; reminder state on `matches` |

Why: near-zero cost when idle, automatic scale when busy — the right shape for
a club that's loud on Saturday and silent on Tuesday.

## 3. Data model (D1, migrations 0001–0014)

- **users** — identity, Handicap Index (manual, GHIN-ready) + `handicap_updated_at`,
  photo, `home_course_id`, timezone, push token (write-only; clients get `push_enabled`).
- **clubs** *(0014 — the monetization object)* — name, crest_url, primary_color,
  contact, **`status: network | prospect`**, joined_at. 1:1 with courses today;
  multi-course clubs merge by repointing `courses.club_id`.
- **courses → tees → holes** — real USGA data (CR/Slope/par per tee incl.
  front/back splits, per-hole par + stroke index). Imported from GolfCourseAPI
  (`scripts/import_courses.mjs`); 11 KC-metro courses seeded.
- **matches** — creator/opponent, status
  (`open|pending|accepted|in_progress|completed|declined|cancelled|expired`),
  course/tee **per player** (`tee_id` / `opponent_tee_id`), date/time, format
  (`front_nine|back_nine|eighteen`), `visibility (private|public)`, stakes
  (display only), hcp window, **handicap snapshots** (creator at post, opponent
  at accept), scorecard ids, result, `match_progression` JSON, scoring-started
  stamps, reminder/forfeit/nudge stamps.
- **scorecards** — hole-by-hole gross per player (`[{hole, gross}]`), unique per
  (match, player).
- **messages** — match-scoped, text or `gif_url` (allowlisted Giphy CDN).
- **favorites / blocks / reports** — social graph + safety; blocks filter both
  directions everywhere (discovery, feed, challenges, accept).

## 4. Invariants the server enforces

1. **Hidden-entry lock** — no API response contains the opponent's card until
   both scorecards exist; the reveal endpoint refuses until `status='completed'`.
2. **Handicap snapshots** — locked onto the match row at post/accept; profile
   changes never rewrite a settled match. Null snapshot ⇒ scratch (0.0).
3. **Per-player tees** — each side's Course Handicap and stroke allocation come
   from THEIR tee (`(HI × Slope/113) + (CR − Par)`, strokes by that tee's SI
   order; nine-hole matches use the nine's segment ratings).
4. **Full-round settle** — the engine plays all holes (true gross totals) but
   locks result/`final_delta` at the closeout hole ("3 & 2").
4a. **Live scoring is gated to `playing_together`** — same-group players already
   see each other's cards, so hole-by-hole live scoring + spectating spoils
   nothing. **Apart matches never expose live scores** (the hidden-card lock
   holds; only no-score presence + the 👁 follower count is public). The
   `/matches/:id/live` endpoint enforces this.
5. **Guarded transitions** — status changes are conditional UPDATEs
   (`WHERE status IN (...)`), so races (double-accept, cancel-vs-settle,
   cron-vs-player) can't stomp a terminal state.
6. **Privacy projections** — non-participants get display-safe match rows
   (no handicaps/stakes/progression/scorecard ids); public+completed matches
   are the deliberate spectator surface (reveal + scorecard).
7. **Not a betting app** — stakes are a display string end to end.

## 5. Surfaces (5-tab navigation)

| Tab | What it is |
|---|---|
| **Discovery** | Swipe deck of compatible open matches (handicap-window filtered, home-course soft preference) — *action* |
| **Feed** | The club's room: course switcher, gold **Foretera Club** badge (network clubs), club pulse strip, "Looking for a game" open invites with **accept-in-place**, date-browsable Now Playing / Final Results — *community* |
| **My Matches** | The caller's matches across all states |
| **Record** | Career page: W–L–H hero, streaks/bests, milestones, rivalries (+ rematch), course form, recent results, favorites, Home/Global leaderboard |
| **Profile** | Identity, index, home club; **Settings lives behind the header menu (hamburger), not a tab** |

Detail stack: match detail, score entry, reveal (participant + spectator
modes), shared scorecard, player profile, messages, create/challenge (modal),
onboarding, settings.

## 6. Club network layer (the business)

`clubs.status` drives everything (strategy doc A1 + A2 + A3 — **shipped**):
- `network` → the value tier: **monthly champions** (three crowns per club —
  `won`/`played`/`win_pct`; live current-month derivation + a `0 7 1 * *` cron
  that freezes the prior month into `club_champions` and pushes winners;
  `api/src/lib/champions.ts`), a **staff pulse dashboard** (in-app, gated to
  `club_staff`: weekly engagement, 8-week trend, new/returning, churn watch,
  demand — all derived from matches at the club's course; `lib/dashboard.ts`),
  and **club identity** (crest upload → R2, club color, pinned note). Plus the
  gold crest masthead + champions strip on the board.
- `prospect` → the **demand engine** is live: members at a prospect club see a
  dismissible "ask your pro" card on their HOME board only (14-day local
  snooze). "Tell your pro" records a per-member signal (`club_interest`,
  unique per club+user — counts people, not taps) then opens a share sheet
  with a forwardable pitch. "Claim it" opens the staff pager
  (`app/(app)/club-claim.tsx`): perks, pricing, and the live demand count
  ("N members here have asked") with a mailto CTA — the Stripe checkout
  replaces the mailto when billing lands (A4). Club billing stays OFF-app
  (B2B SaaS — no app-store cut); pricing in `PRICING.md` ($149/mo ·
  $1,490/yr · founders $990/yr).
- API: `GET /clubs/:id` (summary + interest_count + pinned_message),
  `POST /clubs/:id/interest`, `GET /clubs/:id/champions?month=` (live or frozen),
  `GET /clubs/:id/dashboard` (staff-gated), `POST /clubs/:id/crest` (staff,
  R2), `PATCH /clubs/:id` (staff: color/pinned). `/me` carries `staff_club_id`.
- Tables: `club_staff` (who manages a club — seeded manually until claim
  auto-provisions), `club_champions` (frozen monthly crowns). Staff dashboard
  uses "golfers who've played here" as the member proxy (no roster exists).

## 7. Ops & conventions

- **Deploy:** `npx wrangler deploy` from `api/` (Worker
  `match-play-api.bryan-babb1.workers.dev`). App JS ships by reload/OTA; icon,
  splash, and native modules need an EAS build.
- **Migrations:** local via `wrangler d1 migrations apply match-play --local`;
  **remote via `wrangler d1 execute --remote --file=...`** — the remote
  migrations tracker is out of sync; never `migrations apply --remote`.
  Changing an enum CHECK requires a full table rebuild (see 0012).
- **Seeds:** `api/seeds/` (idempotent, `DELETE … LIKE` first).
  `scripts/gen_big_seed.mjs` builds the 52-match network demo (8 clubs, all
  lifecycle states, real tees + pars, scratch-settle progressions). Generate
  via `cmd /c "node … > file"` (PowerShell `>` writes UTF-16, which wrangler
  rejects).
- **QA:** `powershell -File qa.ps1` (api tsc + vitest engine suite + app tsc) on
  every push, plus the testing agents in `.claude/agents/` per the matrix in
  `AGENTS.md` (release-qa always; contract-checker on API changes;
  engine-tester on scoring changes; ux-auditor on screen changes).
- **Hard-won client rules:** never top-level-import a native module in a route
  file (drops the route/boot); Clerk `getToken` never in effect deps (use a
  ref); no stacked iOS Modals; theme tokens only (no hex in screens).
- **Brand assets:** `store-assets/generate_black_gold.ps1` regenerates
  icon/splash/adaptive + store images from the F-pin mark (champagne→bronze on
  `#0C0C0E`).

## 8. Roadmap pointers

Sequenced in `UX_CLUB_NETWORK_STRATEGY.md`: A2 prospect prompt → A3 club payoff
→ A4 claim path → B1 cold-start liquidity → B4 Feed/Discovery sharpening → B5
rematch on the reveal. Plus: reveal premium redesign (Phase 2), reschedule flow
(decisions locked), photo-verification trust layer (the original Quell OCR) as
a later anti-cheat option, GHIN auto-lookup.

---

## Changelog (meaningful pushes)

| Date | HEAD | What changed |
|---|---|---|
| 2026-06-14 | (this push) | **Pre-beta hardening** (`SCALABILITY_REVIEW.md`): verified remote D1 has all 0014–0019 indexes; added `idx_matches_course_status` (migration 0020 — the leaderboard/champions/dashboard/pulse index); `client_logs` 30-day retention in the hourly cron. Bottom line: stack is fine for 50–500 beta testers; gamecast polling cache is the pre-live-event item |
| 2026-06-14 | `0cff1ea` | **Live gamecast redesign** (migration 0019): `buildGamecast` (per-hole to-par, momentum, live win-prob, play-by-play; 30 engine tests); either player keeps the card (`live-score` both sides) + end-of-round mutual `confirm` before settle; spectator `cheer` reactions + follower avatars; Ryder-Cup `sideA`/`sideB` red/blue theme tokens; `live.tsx` rewritten (hero, current-hole spotlight, play-by-play feed, scorecard grid, win-prob bar, floating cheers) |
| 2026-06-14 | `fac3134` | Fixes: text-string crash (0/1 flag in JSX `&&`), "live now"=in_progress only, client error log (migration 0018 `client_logs` + `/logs` + `lib/logger.ts`), tee-time `TimeWheel` (JS-only, same-group only), live-demo seed |
| 2026-06-14 | `1f72838` | **Live & Together** (migration 0017): `matches.playing_together` + `match_followers`. P1 enrichedMatch() fix (no more Creator/You flash) + My Matches result line (seen-gated) + tee-time/same-group create. P2 follow/👁 watcher count. P3 live scoring for same-group matches (`computeRunning`, `routes/live.ts` live-score/live, `match/[id]/live.tsx`, settles live). P4 reveal revamp: ESPN win-probability graph (`winProbabilitySeries` DP, `win_prob` in progression), birdie-or-better flourish. 27 engine tests. |
| 2026-06-13 | `7639c55` | **Network value tier (A3)**: monthly champions (migration 0016 `club_champions` + `lib/champions.ts` + month-end cron), staff pulse dashboard (`lib/dashboard.ts`, `club_staff` gating, engagement/churn/demand), club identity (crest upload, color, pinned note); in-app champions strip + hall-of-fame + staff dashboard screens; `staff_club_id` on `/me` |
| 2026-06-12 | `d66f437` | **A2 demand engine**: `club_interest` (migration 0015) + `/clubs/:id` + `/clubs/:id/interest`; prospect "ask your pro" card on home boards (share flow, 14-day snooze); claim pager screen with live demand count + pricing; feed course-picker clear fix |
| 2026-06-12 | `2afb2aa` | **Spectator broadcast mode** on the reveal (named deltas, per-player colors `live`/`liveAlt`, neutral backdrop, legend — no more creator-POV for bystanders); **club masthead** on the Feed (crest/monogram, network lockup, gold-trimmed pulse); first agent-gated release (release-qa PASS + ux-audit findings fixed pre-push) |
| 2026-06-12 | `d7a7847` | Tabs 6→5 (Settings behind the header menu); testing agents (`.claude/agents/` + `AGENTS.md`); `PRICING.md`; white paper v1.1; this doc rewritten as-built |
| 2026-06-12 | `e5da0db` | **Clubs model (A1)** — migration 0014, network/prospect flag, gold badge; accept-from-feed; 52-match seed across 8 clubs; Black + Gold icon/splash/store assets |
| 2026-06-12 | `bb2bccf` | Feed → club board (open invites + pulse); Record → career page (rivals, course form, milestones, bests) |
| 2026-06-10 | `c57a2e6` | Black + Gold "Members" rebrand; member-card discovery; home-course soft preference |
| 2026-06-10 | `12e2880` | Full-review fix batch: status CHECK rebuild (0012), blocks/reports, account deletion, security projections |
| earlier | — | See git history: per-player tees (0009), visibility + course feed (0011), GIFs (0010), forfeit cron (0008), real course data, Clerk/R2/push foundations |
