# MATCH PLAY — Architecture & Planning Document

**Handoff doc for build (Quad Code).** This captures every decision landed on so far. Start here.

---

## 1. Project Overview

Match Play is a golf match discovery and scorecard verification app for club members. It evolves the Marker scorecard photo engine into a matchmaking platform: the photo engine is the settlement layer, and a Tinder-style discovery + in-app messaging layer sits on top.

**Core thesis:** A golfer can post their name out there looking for a match — stake, handicap range, course, tees, date/time — and another member can swipe to accept. The two players do NOT need to be in the same group. They each play their round, each photograph their scorecard, and the app reads both cards, applies handicaps, and determines the winner with a hole-by-hole reveal animation.

**Trial path:** Start closed-beta with Bryan's group + Prairie Highlands regulars (Saturday rounds and men's league rounds where you're not paired with the person you want action against). If it sticks, it becomes Prairie's matchmaking / community-engagement tool, with a possible path to packaging for other clubs.

---

## 2. Strategic Positioning

This fits the side-hustle filter cleanly: Bryan is the customer, near-zero operating cost if it stalls, he owns the code, club-specific rather than consumer-viral. The defensible moat is the club's existing member network — not virality among strangers.

**Community angle:** Beyond side action, the matchmaking drives member engagement and helps new members find games and meet people. That's the pitch to Prairie management if/when the trial succeeds.

---

## 3. Hard Constraints & Rules

1. **NOT a betting app.** The app never touches money. It displays match results and stakes for context only. All settlement happens off-platform (Venmo/cash/text between players). This classification boundary is non-negotiable and drives multiple design decisions below.
2. **Cross-platform from day one.** iOS *and* Android, both stores. An iPhone user must be able to play against an Android user. No single-OS limitation. → React Native.
3. **Hidden scorecards.** Neither player can see the other's scorecard until BOTH have been submitted. This is core to fairness and must be enforced server-side.
4. **Scorecard photo engine must handle real-world variation:** rotated cards, gross vs. net, birdie circles, X's / strikethroughs, ambiguous digits, and side-game rows that must be IGNORED (skins, presses, etc.).
5. **Handicap range filtering.** Players set a +/- range around their own handicap (e.g., a 5 sets +5/-5 → will play anyone from scratch to a 10). Only compatible matches surface in discovery.
6. **In-app messaging.** Accept/decline and settlement coordination happen inside the app — cleaner than exposing phone numbers or email upfront.
7. **Validation & guidance layer.** Onboarding must (a) establish that this is a results/verification tool, not a wagering platform, and (b) teach users how to mark a scorecard so the engine reads it cleanly.

---

## 4. Tech Stack

### Frontend
- **React Native** (iOS + Android, shared logic) — reuses Marker React experience; clean path to both stores.
- Navigation: React Navigation (or Expo Router if going Expo-managed).
- Camera: Expo Camera / React Native Vision Camera for scorecard capture.
- Animation: **Reanimated** for the hole-by-hole match progression reveal (de-facto RN standard for complex animation).
- State: Zustand (lightweight) or Redux Toolkit.

### Backend
- **Node.js + Express** API.
- **PostgreSQL** for relational data (users, matches, scorecards, messages) — match settlement and the hidden-card lock need transactional integrity, so this is the system of record.
- **Firebase** for real-time messaging (Firestore) + push notifications (FCM for Android, APNs via FCM for iOS).
- Photo storage: Firebase Storage or AWS S3.

### Photo / OCR engine
- Client-side scorecard OCR reusing the Marker vision logic (ML Kit / TensorFlow.js).
- Server-side validation confirms integrity before results are computed and revealed.

### Hosting (kept lean — no prior preference to honor)
- Backend: Vercel (serverless Node) or a small VPS (DigitalOcean/Railway).
- Managed PostgreSQL: Supabase, Railway, or Neon.
- Real-time + push: Firebase.
- Start lean, scale only if it takes off.

> Note: Supabase is a viable single-vendor alternative (Postgres + auth + storage + realtime in one). Decision deferred — Postgres + Firebase split is the documented default, but consolidating on Supabase is worth a look during build if the Firebase/Postgres seam gets annoying.

---

## 5. Data Schema (PostgreSQL)

### users
| field | type | notes |
|---|---|---|
| id | UUID PK | |
| phone_number | text unique | auth + identity |
| email | text nullable | |
| first_name | text | |
| last_name | text | |
| handicap | float | GHIN; manual entry in V1 |
| profile_photo_url | text nullable | |
| created_at / updated_at | timestamptz | |

### matches
| field | type | notes |
|---|---|---|
| id | UUID PK | |
| creator_id | UUID FK → users | |
| opponent_id | UUID FK → users, nullable | null until accepted |
| status | enum | open, accepted, in_progress, completed, declined, cancelled |
| course_name | text | (course_id later) |
| tee_color | text | white/blue/black/etc. |
| play_date | date | |
| play_time | time nullable | |
| match_type | enum | front_nine, back_nine, eighteen |
| stakes | numeric nullable | DISPLAY ONLY — never processed |
| hcp_range_min | int | creator's +/- floor |
| hcp_range_max | int | creator's +/- ceiling |
| creator_scorecard_id | UUID FK → scorecards, nullable | |
| opponent_scorecard_id | UUID FK → scorecards, nullable | |
| result | enum nullable | creator_wins, opponent_wins, tie |
| match_progression | jsonb nullable | hole-by-hole deltas for animation |
| created_at / updated_at / completed_at | timestamptz | |

### scorecards
| field | type | notes |
|---|---|---|
| id | UUID PK | |
| match_id | UUID FK → matches | |
| player_id | UUID FK → users | |
| photo_url | text | |
| parsed_data | jsonb | gross per hole, raw OCR |
| net_scores | jsonb | computed with handicap |
| confidence | float | OCR confidence; low → manual review |
| submitted_at | timestamptz | |
| verified_at | timestamptz nullable | after server validation |

### messages
| field | type | notes |
|---|---|---|
| id | UUID PK | |
| match_id | UUID FK → matches | |
| sender_id | UUID FK → users | |
| body | text | |
| read | bool default false | |
| created_at | timestamptz | |

> Messaging is mirrored in Firestore for real-time delivery; Postgres holds the durable record.

---

## 6. The Hidden-Scorecard Lock (critical)

Enforced server-side, NOT client-side:

- When a player submits, store the scorecard but DO NOT return the opponent's card in any API response until `creator_scorecard_id` AND `opponent_scorecard_id` are both non-null and verified.
- Each player's "waiting" screen shows only: *"Your card is in. Waiting on [opponent]."*
- The reveal endpoint becomes available only once both cards are verified. At that point both cards + the computed `match_progression` are returned together.
- This prevents either side from seeing the other's score and back-solving what they need.

---

## 7. Match Determination Logic

**Handicap capture timing:** Both players' handicaps are snapshotted into the `matches` row at acceptance time, so a later handicap change can't retroactively alter a completed match.

**Strokes:** Difference between the two handicaps allocated across holes per standard stroke-index distribution (e.g., 5 vs. 12 → the 12 gets 7 strokes on the 7 hardest holes). Front/back nine matches scale the allocation to the nine being played.

**Scoring format:** Match play — compare NET score hole by hole; lower net wins the hole; tie carries the running delta. Final result expressed as "Wins 2 Up," "Even," etc.

**Gross vs. net:** OCR flags how the card is marked. If gross, the engine applies handicap to derive net. If net is already written, the engine validates rather than re-applies.

### match_progression JSON shape
```json
{
  "holes": [
    { "hole": 1, "creator_gross": 4, "creator_net": 4, "opponent_gross": 5, "opponent_net": 4, "winner": "tie", "cumulative": "Even" },
    { "hole": 2, "creator_gross": 5, "creator_net": 5, "opponent_gross": 4, "opponent_net": 4, "winner": "opponent", "cumulative": "1 Down" }
  ],
  "final_result": "opponent_wins",
  "final_delta": "2 Down"
}
```
`cumulative` is written from the match creator's perspective and drives the reveal animation labels.

---

## 8. Scorecard OCR & Validation

**Variations to handle:**
- Rotated photos → auto-rotate / orientation detection.
- Birdie circles, X's, strikethroughs → recognized as valid score markings.
- **Side-game rows ignored** → detect and skip rows labeled skins/press/bets; only the main score row counts.
- Ambiguous digits → if confidence < threshold, flag and prompt re-submission rather than guessing.

**Validation rules:**
- All 9 / 18 holes present.
- Per-hole score within sane bounds (≈0–13).
- Both cards from the same course.
- Submitted within 24h of `play_date` (prevents stale entries).
- On failure → clear error + re-shoot guidance, never a silent wrong result.

---

## 9. User Flows

### Onboarding
Phone sign-up (SMS verify) → name + handicap (manual GHIN entry V1) → optional photo → norms screen ("verification tool, not a wagering platform; settle outside the app") → Discovery.

### Create a match
Post a Match → course, date, time, tees → match type (F9 / B9 / 18) → stakes (display only) → handicap range +/- → public-to-club or invite link → posted as `open`.

### Discover & accept (swipe)
Discovery feed shows compatible open matches as cards: name, handicap, course, date/time, stakes, range. Swipe right = interested, left = skip. On mutual interest the in-app message thread opens; creator confirms → `accepted`. Either party can decline.

### Play & submit
`in_progress` → each player plays independently → Submit Scorecard → camera capture → "Waiting on opponent." Server runs validation on each card as it arrives.

### Reveal & animation
Once both cards verified → Result Reveal. Reanimated walks hole by hole showing each score and the running delta (Even → 1 Up → 2 Up …), then declares the winner. Result screen shows final result, both cards side by side, and a "Message Opponent" button pre-filled to coordinate settlement. → `completed`.

### Messaging
Available throughout the match lifecycle. Text chat scoped to a match, real-time via Firestore, push on new message / acceptance / opponent-submitted / result-ready.

---

## 10. Match State Machine

```
open ──accept──▶ accepted ──both ready──▶ in_progress ──both cards verified──▶ completed (result)
  │                  │
  └──cancel──▶ cancelled    └──decline──▶ declined
```

---

## 11. V1 Scope (MVP) — explicit cuts

1. Side games are detected only to be IGNORED — not scored.
2. Manual handicap entry; no GHIN API yet.
3. No ratings / Elo / reputation.
4. No payment processing (by design).
5. No calendar sync.
6. No leaderboards.
7. No hard club-membership gating (Prairie can gate later).

---

## 12. Roadmap (post-trial)

- GHIN API auto-lookup.
- Optional side-game tracking + settlement, if demand appears.
- Player ratings, win/loss history.
- Course-specific all-time leaderboards (Prairie).
- Calendar integration.
- Admin/moderation dashboard for Prairie.
- Engagement analytics (active players, popular times, new-member matchmaking).
- Multi-club packaging.

---

## 13. Project Structure

```
match-play/
├── mobile/                       # React Native
│   ├── src/
│   │   ├── screens/              # Home, CreateMatch, Discovery,
│   │   │                         #   ScorecardCapture, ResultReveal,
│   │   │                         #   Messaging, Profile
│   │   ├── components/           # MatchCard, HoleByHoleAnimation,
│   │   │                         #   ScorecardViewer, MessageThread
│   │   ├── hooks/                # useMatchDiscovery, useScorecardOCR, useMessaging
│   │   ├── services/             # api, firebaseConfig, photoEngine, auth
│   │   ├── store/                # matchStore, userStore
│   │   └── types/
│   └── app.json
│
├── backend/                      # Node + Express
│   ├── src/
│   │   ├── routes/               # auth, matches, users, scorecards, messages
│   │   ├── controllers/
│   │   ├── services/             # matchService (determination),
│   │   │                         #   scorecardService (OCR/validate),
│   │   │                         #   messageService, userService
│   │   ├── db/                   # schema.sql, migrations
│   │   ├── middleware/           # auth, errorHandler
│   │   └── config/               # database, firebase
│   └── server.ts
│
└── docs/
    ├── MATCH_PLAY_ARCHITECTURE.md   # this file
    ├── API_SPEC.md
    ├── SCORECARD_FORMATS.md          # visual guide to valid markings
    └── DEPLOYMENT.md
```

---

## 14. First Build Steps (suggested order for Quad)

1. Scaffold the monorepo (`mobile/` + `backend/`) and the Postgres schema + migrations.
2. Auth + user profile (phone sign-up, handicap).
3. Match CRUD + discovery feed with handicap-range filtering.
4. Swipe UI + accept/decline + match state machine.
5. In-app messaging (Firestore) + push.
6. Scorecard capture → OCR → server validation → **hidden-card lock**.
7. Match determination + `match_progression` generation.
8. Reveal animation (Reanimated).
9. Onboarding/norms + scorecard marking guide.
10. TestFlight + Play internal testing with the buddy group.

---

*End of handoff. Open this in Quad and start from Section 14.*
