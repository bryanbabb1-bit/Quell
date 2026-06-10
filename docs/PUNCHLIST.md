# Quell — Punch List (what's next)

_Last updated: 2026-06-10 (late). HEAD = `4852f5c`. Worker = `27298767`. 18 scoring tests green._

Running "what we need to do" list. Top = active/next; bottom = Bryan's own
non-blocking to-dos and the parking lot.

---

## 🔴 Do first (next session)

1. **Confirm the Profile tab is back.** Fixed in `4852f5c` — `profile.tsx` was
   top-level importing the native `expo-image-picker`, which crashed the route on the
   current dev client and dropped the tab from the navigator. A **full reload** of the
   dev client should bring it back (shake → Reload, or `r` in Metro). If it's still
   gone → grab the red Metro error and we chase it.

2. **Fresh EAS build from HEAD** — the gating item now. It bakes in the native modules
   the current dev client is missing:
   - `expo-image-picker` → profile photo upload (and kills the whole "tab vanishes /
     needs latest build" class of problems)
   - `expo-notifications` → push notifications
   In `app/`: `eas build --profile development --platform ios` → **Yes** to "set up Push
   Notifications?" → reuse cert/provisioning → install on iPhone, trust the cert. One
   build covers all remaining JS work.

3. **Smoke-test per-player tees on device** (shipped `e180449`):
   - Accept a match → match detail → **"Change your tees"** → pick a different tee.
   - Confirm each player's tee shows, strokes update, and the reveal settles correctly.
     (Engine + 18 tests already cover the math.)

## 🟡 Design polish (Bryan: "not impressed enough yet")

4. **Keep pushing the full-bleed Discovery cards.** Structure now matches the
   Tinder/Bumble mockups (full-bleed photo, handicap pill, name over scrim, chips,
   X/flag/heart bar). Next: **vibrancy + motion** — richer color, a more "reveal-grade"
   rendering on swipe, depth/animation. Real creator photos will make these sing
   (needs build #2 so people can upload).

5. **Pick a color mode, then lock it.** Settings → Appearance has 4 live palettes:
   Tournament Green (default) / Augusta Pine / Broadcast Electric / Carbon Luxe. Once
   Bryan chooses, lock it in + remove the picker.

## 🟢 Follow-ups (nice-to-have, not blocking)

6. **Reveal / scorecard: show each player's tee** (rounds out per-player tees — result
   math is already correct; display only).
7. Real/seeded creator photos for the demo cards (or just rely on uploads post-build #2).

---

## Bryan's own to-dos (off-platform)

- [ ] Buy domains **quell.golf**, **quellgolf.com**, and the **@quellgolf** handles.
- [ ] Rename the Clerk app display name → **Quell** (cosmetic).
- [ ] USGA **GPA** outreach (GHIN handicap-data access — long-lead; Claude can draft the email).
- [ ] Verify real **Prairie Highlands** scorecard data (we have GolfCourseAPI data for
      11 KC courses; spot-check stroke index / ratings against the physical card).

## Parking lot (researched, deferred)

- Image-based share card for the reveal (needs `react-native-view-shot` = native dep).
- Server-side archive (cross-device) for finished matches (currently local secure-store).
- Multi-club / per-club leaderboards (needs a `clubs` table).
- Photo/OCR scorecard verification (the original "Marker" idea — post-V1).
- 9-hole handicap allocation uses a documented half-difference approximation — revisit
  for exact WHS 9-hole course handicap if it matters in play.
