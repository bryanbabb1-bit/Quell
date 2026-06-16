# Foretera — ASC copy-paste cheat sheet (every box, word for word)

Use this alongside `ASC_TESTFLIGHT_GUIDE.md`. Where you see a **code block**, copy
it verbatim. Where you see "click X," do exactly that.

**Your Privacy Policy URL (already live — test it in a browser):**
```
https://match-play-api.bryan-babb1.workers.dev/privacy
```

---

## ① New App dialog  (My Apps → ＋ → New App)

- **Platforms:** check ☑ **iOS**
- **Name:**
```
Foretera
```
  *(If it says the name is taken, use this instead — only the store name changes, your home-screen name stays "Foretera"):*
```
Foretera Golf
```
- **Primary Language:** **English (U.S.)**
- **Bundle ID:** pick **com.bryanbabb.quell** from the dropdown.
- **SKU:**
```
foretera
```
- **User Access:** **Full Access** → click **Create**.

---

## ② App Information  (left sidebar → General → App Information)

- **Subtitle** (optional, 30 char max):
```
Head-to-head golf match play
```
- **Category → Primary:** **Sports**
- **Category → Secondary:** **Lifestyle** *(optional — fine to leave blank)*
- **Content Rights:** select **"No, it does not contain, show, or access third-party content."**
- **Privacy Policy URL:** paste:
```
https://match-play-api.bryan-babb1.workers.dev/privacy
```
Click **Save** (top right).

---

## ③ App Privacy  (left sidebar → App Privacy → Get Started / Edit)

First question: **"Do you or your third-party partners collect data from this app?"** → **Yes**.

Then add each data type below. For **every** one, the answers are the same pattern:
**Used for → App Functionality only**, **Linked to the user → Yes**, **Used for tracking → No.**

Add these data types (click **＋ Add** / the category, check the item):

1. **Contact Info → Email Address**
   - Used for: ☑ **App Functionality** (nothing else)
   - Linked to identity: **Yes**
   - Used for tracking: **No**
2. **User Content → Photos or Videos**  *(your profile photo)*
   - App Functionality · Linked: **Yes** · Tracking: **No**
3. **User Content → Other User Content**  *(scores, matches, messages)*
   - App Functionality · Linked: **Yes** · Tracking: **No**
4. **Identifiers → User ID**
   - App Functionality · Linked: **Yes** · Tracking: **No**
5. **Diagnostics → Other Diagnostic Data**  *(error logs that keep the app stable)*
   - Used for: ☑ **App Functionality**
   - Linked to identity: **No**
   - Used for tracking: **No**

> You do **not** run ads or share data with brokers, so answer **No** to "tracking"
> everywhere. (Do **not** add Location, Financial Info, Health, Contacts, Browsing,
> or Purchases — Foretera collects none of those.)

Click **Publish**.

---

## ④ Age Rating  (App Information → Age Rating → Edit / Set Up)

Answer the questionnaire. The ones that matter for *this* app:

- **Gambling / Contests / Simulated Gambling:** **No / None.**
  *(Critical — "stakes" in the app are a display-only label; no money moves through it. Getting this wrong is the #1 rejection.)*
- **Violence, Sexual Content, Nudity, Profanity, Horror, Drugs/Alcohol, Mature Themes:** **None.**
- **Medical/Treatment Info:** **No.**
- **Unrestricted Web Access:** **No.**
- **User-Generated Content / messaging:** **Yes — and it's moderated.** Foretera has
  1:1 in-match messaging (text + GIFs) between matched players, with **Block and
  Report** built in. If it asks how you moderate, the answer is: *users can block
  and report other users in-app.* (This typically lands the rating at **12+**, which is fine.)

Save. The computed rating (likely **12+**, possibly **17+** if Apple weighs the GIF
search heavily) is normal for a social app.

---

## ⑤ TestFlight → Test Information  (TestFlight tab → Test Information, left)

- **Beta App Description:**
```
Foretera is a head-to-head golf match-play and community app. Post a match or find one near you, accept it, enter your scores, and watch the result reveal hole by hole. Play a "same group" match for live scoring, or apart for a sealed reveal. Follow your club's board, cheer on friends, and track your record.
```
- **Feedback Email:**
```
bryan.babb1@gmail.com
```
- **Marketing URL** (optional — leave blank or use the privacy host):
```
https://match-play-api.bryan-babb1.workers.dev/privacy
```
- **Privacy Policy URL:**
```
https://match-play-api.bryan-babb1.workers.dev/privacy
```
- **What to Test** (per-build, shows to testers):
```
Sign up, set your name + handicap, and post a match. Accept a match from Discovery (swipe). Enter scores and watch the reveal. Try a "same group" live match to see live scoring + cheers. Check the Feed, your Record, and your club board. Tell us anything that feels slow, confusing, or broken.
```

---

## ⑥ Export Compliance  (asked once when the build finishes processing)

When TestFlight asks about encryption, choose the answer that means **"only uses
standard encryption (HTTPS/TLS) — exempt."** Concretely: if it asks *"Does your app
use encryption?"* → **Yes**; then *"Does it qualify for the exemption?"* → **Yes**
(standard HTTPS). No documents needed. *(The app already declares
`ITSAppUsesNonExemptEncryption: false`, so it may not even ask.)*

---

## ⑦ Internal testing (do this FIRST — no Apple review, live in minutes)

1. **Users and Access** (top nav) → add each tester by **Apple ID email** (any role) → they accept the emailed invite.
2. **TestFlight → Internal Testing → ＋** → name the group:
```
Team
```
3. **Add** those people to the group → **Add Build** → pick your latest build.
4. They install the **TestFlight** app from the App Store → open the invite → install Foretera.

---

## ⑧ External testing — Beta App Review Information  (only for public/volume)

TestFlight → **External Testing** → ＋ group (name it `Beta`) → **Add Build** →
fill the **Beta App Review Information**:

- **Sign-in required:** **Yes** → provide the demo account:
  - First create it: in the **Clerk Dashboard**, add a user
    `bryan.babb1+review@gmail.com` with a password you choose, then open that user
    and toggle **"Bypass Client Trust"** (so the reviewer's device doesn't get
    blocked on the email code).
  - **Username/Email:**
```
bryan.babb1+review@gmail.com
```
  - **Password:** *(whatever you set in Clerk)*
- **Review Notes** — paste:
```
Foretera is a scorecard and match-discovery tool for golfers. "Stakes" shown in the app are a display-only label for friendly context — the app never processes payments and no money moves through it. All settlement happens off-platform; this is NOT a gambling app.

Demo account is provided above (Bypass Client Trust is enabled on it, so no email code is needed). To test: sign in, post a match or accept one from Discovery (swipe a card right), enter scores, and view the result reveal. In-match messaging includes Block and Report. Account deletion is in Settings → Delete account.
```
- **Contact Info:** your name + `bryan.babb1@gmail.com` + a phone number.
- Add testers by email, or turn on the **Public Link** for volume.
- Click **Submit for Beta App Review** (this is the explicit button — a saved form
  is NOT submitted until you click it).

---

### Order to actually do tonight
**①** create app → **②** app info + privacy URL → **③** app privacy → **④** age rating
→ get the build uploaded (`eas submit`, guide Step 3) → **⑤** internal testing. You're
live with yourself + friends, no Apple wait. Do **⑧** later for a crowd.

Ask me to draft anything else (a longer marketing description, screenshots copy, etc.).
