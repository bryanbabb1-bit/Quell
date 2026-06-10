# Quell — Testing

## Automated sweep (run on every feature push, or when asked)

```
powershell -File qa.ps1          # API typecheck + 21 engine tests + app typecheck
powershell -File qa.ps1 -Full    # + an Expo bundle export (catches runtime import errors)
```

Exit 0 = clean. What it covers:
- **API typecheck** (`api/`, `tsc --noEmit`)
- **Engine unit tests** (`api/`, `vitest`) — `src/lib/scoring.ts`: course handicap (incl.
  plus handicaps), stroke allocation by stroke index, match-play hole-by-hole +
  closeouts, per-tee strokes, and the pops-from-difference rule.
- **App typecheck** (`app/`, `tsc --noEmit`)
- **(-Full) App bundle export** — proves the JS bundle resolves every import.

The automated layer can't click the UI. Use the manual checklist below for that.

## Handicap engine — what "correct" means (verified by tests)

- Each player's **Course Handicap** = `round(Index × Slope/113 + (Rating − Par))`,
  computed from **the tee THAT player is playing** (creator → `tee_id`,
  opponent → `opponent_tee_id`), and from the **segment** played (full 18, or the
  specific nine's rating/slope/par with the half index for a 9-hole match).
- **Pops** = the **difference** between the two course handicaps. The **lower**
  handicap plays off scratch; the **higher** handicap receives `(higher − lower)`
  strokes, allocated on the hardest holes first by **stroke index** (wrapping to a
  2nd stroke past 18). Each player's strokes use **their own tee's** stroke index.
- **Plus handicaps** (e.g. `+1.2`) are stored **negative** (`-1.2`) and flow through
  naturally: a plus golfer's course handicap goes negative, which increases the
  difference the field player receives. Input: typing `+1.2` is parsed to `-1.2`
  (`parseHandicapInput`); display shows `-1.2` as `+1.2` (`formatHandicap`).

## Manual smoke checklist (on device)

**Auth/profile**
- [ ] Sign in; Profile shows name/home course/index. Enter a **plus** index `+1.2`,
      save, reopen — it shows `+1.2` (not `1.2` or `-1.2`).
- [ ] Tap avatar → pick a photo → it uploads and shows on the card.

**Discovery**
- [ ] Cards: handicap pill readable, photo/gradient fills the card.
- [ ] Swipe left = PASS (red), right = ACCEPT (green), star = save.
- [ ] Filter (bottom-left): Course, Match type, **When** (Today/3d/1wk/2wk),
      **Saved only**, Browse everything — each changes the feed correctly.

**Match flow + tees**
- [ ] Post a match (your tee). Accept it on a 2nd account.
- [ ] Match detail → **Change your tees** → pick a different tee; both tees show.
- [ ] Enter scores on both sides → reveal unlocks only after BOTH submit.
- [ ] Strokes preview ("Strokes" card) matches the handicap difference.

**Results coloring (every theme)**
- [ ] Reveal + scorecard: wins are **green**, losses **red**, regardless of the
      Settings palette (try a light one like Coastal Club).

**Themes**
- [ ] Settings → Appearance: all palettes apply live; status bar stays visible on
      the light themes (Coastal/Linen/Daybreak).
