# Foretera — App Store Connect → TestFlight, step by step

A do-it-yourself walkthrough to get Foretera in front of beta testers. Written
for where you are **right now**: the production build (#4, store distribution) is
processing on EAS; your iOS Distribution Certificate + provisioning profile are
set up (you did the Apple login tonight). This guide is just the ASC + TestFlight
clicking — the part only you can do.

| Fact | Value |
|---|---|
| App name | **Foretera** |
| Bundle ID | `com.bryanbabb.quell` |
| Apple Team | `R8R2L8WM46` (Bryan Babb — Individual) |
| EAS project | `@true-forecast/quell` |
| Backend | `match-play-api.bryan-babb1.workers.dev` (live) |
| This build | production / **store** distribution, version `0.1.0`, build #4 |

**The two fastest paths:**
- **Internal testing** (up to 100 testers, **no Apple review**, live in minutes) — do this first to get yourself + a handful of friends testing tonight/tomorrow.
- **External testing** (up to 10,000 testers, needs a one-time **Beta App Review** ~24h) — do this for real volume.

---

## STEP 0 — The one real prerequisite: a privacy policy URL

Apple **requires** a public privacy-policy URL before you can create the app
record. Fastest options: a free GitHub Pages page, a public Notion page, or a
Google Doc published to the web. Plain language, must cover:
- What you collect: **email** (account), **profile photo**, **handicap index**,
  **match/score data**, and a device push token.
- You do **not** sell data; it's used only to run the app.
- How to delete an account: **in the app, Settings → Delete account** (it's
  built — Apple checks for this).
- A contact email.

Ask me and I'll draft the full text for you to paste. Save the URL — you need it
in Step 2.

---

## STEP 1 — Create the app record in App Store Connect

1. Go to **appstoreconnect.apple.com** → sign in.
2. **My Apps** → the blue **＋** (top-left) → **New App**.
3. Fill the dialog:
   - **Platforms:** ✅ iOS
   - **Name:** `Foretera` — if it's taken, use `Foretera Golf` (this is only the
     store listing name; the home-screen name stays "Foretera").
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** select **com.bryanbabb.quell** from the dropdown. *(If it's
     not in the list, it'll appear after EAS finishes uploading the build, or you
     can register it at developer.apple.com → Identifiers. It should already
     exist from your builds.)*
   - **SKU:** `foretera` (any unique string; users never see it)
   - **User Access:** Full Access
4. **Create.**

You don't need the full marketing listing (screenshots, description) to run
**TestFlight** — only for a public App Store release later. Skip the "1.0
Prepare for Submission" page for now.

---

## STEP 2 — App information & privacy (do once)

In your app → left sidebar:

1. **App Information** (under "General"):
   - **Category:** Primary `Sports` (Secondary optional, e.g. `Lifestyle`).
   - **Content Rights:** "Does not contain third-party content."
   - **Privacy Policy URL:** paste the URL from Step 0.
2. **App Privacy** (left sidebar, "App Privacy" — the privacy "nutrition label").
   Click **Get Started / Edit** and declare honestly:
   - **Contact Info → Email Address:** Yes — used for App Functionality, linked
     to identity, **not** used for tracking.
   - **User Content → Photos** (profile pic) and **Other User Content**
     (scores/matches): Yes — App Functionality, linked to identity, not tracking.
   - **Identifiers → User ID:** Yes — App Functionality, not tracking.
   - **Diagnostics:** if you want to count the error logs, declare Crash/Perf
     data; simplest is to say No here since logs aren't a third-party SDK.
   - Answer **"No"** to "used to track users" throughout — you don't run ads or
     share data with data brokers.
3. **Age Rating** (under App Information → Age Rating → Edit): answer the
   questionnaire. **Important — Foretera is NOT a gambling app:** when it asks
   about "Contests," "Gambling," or "Simulated Gambling," answer **No**. Stakes
   in the app are a display-only string; no money moves through the app. This
   yields a **4+** or **9+** rating. (Getting this wrong is a common rejection.)

---

## STEP 3 — Get build #4 into App Store Connect

The EAS build produces the binary but does **not** auto-upload. Two ways to push
it to ASC — pick one:

### Option A (recommended, one-time setup, then I can do all future submits): ASC API key
1. ASC → **Users and Access** (top nav) → **Integrations** tab → **App Store
   Connect API** → **＋** to generate a key.
   - **Name:** `EAS Submit`; **Access:** `App Manager`.
   - **Download** the `.p8` file — **you only get it once.** Note the **Key ID**
     and the **Issuer ID** (shown on that page).
2. Hand me the `.p8` path + Key ID + Issuer ID (I store the key **outside git**),
   and I'll run `eas submit` for you — now and for every future build, fully
   automated.

### Option B (do it yourself in a terminal): interactive submit
In a **real terminal window** (not through me — same Apple-login reason as the
build):
```
cd C:\Projects\Quell\app
npx eas-cli submit --platform ios --profile production
```
Pick the latest build when prompted, log into Apple, and it uploads.

### Option C (fully manual): Transporter
Download the build's `.ipa` from the EAS build page, open Apple's free
**Transporter** Mac app, drag the `.ipa` in, and deliver. (Only if A/B fail.)

After upload, the build shows in **TestFlight → iOS builds** as **"Processing"**
for ~5–15 minutes, then becomes available.

---

## STEP 4 — Export compliance (encryption)

When the build finishes processing, TestFlight may ask an **export compliance**
question. Foretera's `app.json` already declares
`ITSAppUsesNonExemptEncryption: false`, so this should auto-answer. If it does
ask: your app only uses standard HTTPS/TLS → choose the answer that means
**"no non-exempt encryption"** (exempt). No paperwork needed.

---

## STEP 5 — Internal testing (fastest — do this first)

Up to **100 internal testers**, **no Apple review**, available within minutes.

1. App → **TestFlight** tab.
2. **Test Information** (left, required once): fill **Beta App Description**
   ("Head-to-head golf match play — post a match, settle the score"), your
   **Feedback Email**, and **What to Test** (e.g. "Post a match, accept one,
   enter scores, watch the reveal, try a same-group live match").
3. **Internal Testing** (left) → your group (or **＋** to create one, e.g.
   "Team").
   - Internal testers must first exist under **Users and Access** with any role
     (add them by Apple ID email there; they accept the ASC invite).
   - Back in the group, **add** those people and **assign build #4**.
4. They get a TestFlight email → install the **TestFlight** app from the App
   Store → accept → install Foretera. Done — they're testing.

*This is the path to test tonight/tomorrow with yourself + a few people, no
waiting on Apple.*

---

## STEP 6 — External testing (for real volume — up to 10,000)

Needs a one-time **Beta App Review** (usually ~24h, lighter than full App
Review). Do this once you want a crowd.

1. **TestFlight** → **External Testing** → **＋** to create a group (e.g.
   "Beta").
2. **Add the build** (#4) to the group. This triggers the **"What to Test"** +
   **Beta App Review Information** form. Fill it carefully — see the gotchas
   below; this is where betas get rejected.
3. Add testers by **email**, or enable the **Public Link** (a shareable URL —
   the easiest way to get volume; anyone with the link can join up to your cap).
4. **Submit for Beta App Review.** When approved, testers can install.

---

## ⚠️ Foretera-specific review gotchas (read before Step 6)

These are the things that get *this* app bounced:

1. **Provide a demo account** in Beta App Review Information. Reviewers must sign
   in. Create a Clerk test user (e.g. `review@foretera.app` / a password) and put
   the credentials in the review notes.
   - **The email-code trap:** Foretera uses Clerk email verification. On a
     reviewer's fresh device that can block sign-in. **Fix:** in the **Clerk
     Dashboard → that demo user**, toggle **"Bypass Client Trust"** (or disable
     the second factor for that one user). This clears the new-device
     verification without weakening security for everyone. *(We hit and solved
     this exact issue on TrueForecast.)*
2. **State plainly it is NOT gambling.** In the review notes write: *"Foretera is
   a scorecard and match-discovery tool. 'Stakes' shown in the app are a
   display-only label for context between friends; the app never processes
   payments and no money moves through it. All settlement happens off-platform."*
3. **Account deletion exists** — it's in **Settings → Delete account** (Apple
   5.1.1(v) requires it; it's built, just know where it is if they ask).
4. **"Ready to Submit" ≠ submitted.** After filling everything, you must click
   the explicit **Submit for Review** button. A saved form sits in limbo
   otherwise. *(Also a lesson from TrueForecast.)*

---

## STEP 7 — Invite & go

- **Internal:** testers already have it (Step 5).
- **External:** share the **Public Link** (or they get email invites) once Beta
  Review approves. They install via the TestFlight app.
- New builds: each time I run a new production build + submit, testers get the
  update automatically in TestFlight (internal instantly; external may re-review
  if it's a major change).

---

## What I can do vs. what's yours

| Task | Who |
|---|---|
| Run the production build | **Done** (build #4 baking) — future ones I run **if** you set up the ASC API key (Step 3A) |
| `eas submit` to upload to ASC | Me (with the ASC API key) — or you, Step 3B |
| Create the app record, app privacy, age rating | **You** (Step 1–2) |
| TestFlight test info, groups, testers, submit for review | **You** (Step 5–7) |
| Draft the privacy policy text / review notes / demo-user setup steps | Me — just ask |
| Swap to a production Clerk instance before scaling testers | You create it → I wire the key |

**Bottom line tonight:** the binary is building. The only thing blocking
*internal* testing is the app record (Step 1) + getting the build uploaded
(Step 3). Do those and you + a few testers are live with zero Apple wait.
External/volume needs the Beta App Review (Step 6) with the demo account + the
not-gambling note.
