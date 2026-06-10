# Foretera — Release Guide (TestFlight + Google Play internal testing)

Step-by-step to get Foretera onto iOS TestFlight and Android internal testing.
**Bold = you do it (your logins).** _"Claude runs"_ = ask me and I'll run the command.

| Fact | Value |
|---|---|
| App name (stores) | **Foretera** |
| Bundle ID (iOS) / package (Android) | `com.bryanbabb.quell` (kept; users never see it) |
| EAS project | `@true-forecast/quell` (projectId `89031ab0-a5d3-4a44-acab-134069bd0f1e`) |
| Apple Team | `R8R2L8WM46` (Bryan Babb — Individual) |
| Backend | Cloudflare Worker `match-play-api.bryan-babb1.workers.dev` (live) |
| Marketing version | `0.1.0` (build numbers auto-increment in EAS) |

**Already done (by Claude):** app renamed to Foretera, icon/splash/adaptive icon
wired, eas.json build profiles (development / preview / production), store image
assets generated (see `/store-assets`).

---

## PART A — Prerequisites (do these once, in any order)

### A1. Apple Developer account — ✅ you already have it
Used for the dev builds (team R8R2L8WM46). Nothing to do.

### A2. Google Play Console account — **$25 one-time**
1. Go to **play.google.com/console** → sign in with your Google account.
2. Pay the **one-time $25** registration fee, accept the agreement.
3. Choose account type **Personal** (or Business). Verify identity if prompted
   (can take a few hours to a day — start this early).

### A3. Privacy policy URL — **required by BOTH stores**
You need a public URL. Easiest: a free **GitHub Pages** page or a public **Notion**
page. It should say, in plain language:
- What you collect: email (account), profile photo, handicap index, match/score data.
- You do **not** sell data; it's used only to run the app.
- How a user can delete their account (email you, or in-app later).
- Your contact email.
Save the URL — you'll paste it into both stores. (I can draft the text if you want.)

### A4. (Recommended, not required for internal beta) Production Clerk
eas.json currently ships the **test** Clerk key (`pk_test_…`). That works for a
small internal beta. For a real/public beta, create a Clerk **production** instance
and tell me — I'll swap in the `pk_live_…` key and set the matching secret on the
Worker. _(Skip for now if you just want internal testers.)_

### A5. Store images — ✅ generated, in `/store-assets`
| File | Where it goes |
|---|---|
| `ios-app-store-icon-1024.png` (1024×1024, no alpha) | App Store Connect — usually auto-pulled from the build; upload if it asks |
| `android-play-icon-512.png` (512×512) | Play Console → Store listing → **App icon** |
| `android-feature-graphic-1024x500.png` | Play Console → Store listing → **Feature graphic** |

**Screenshots** (you take these — I can't): run the app and screenshot 3–5 screens.
- iOS: at least one **6.7"** iPhone size (e.g. iPhone 15 Pro Max) — 1290×2796.
- Android: any phone screenshots, 2–8 of them.
Take them with the simulator or your phone; both stores let you upload PNG/JPG.

---

## PART B — iOS TestFlight

1. **Create the app in App Store Connect** (you):
   - **appstoreconnect.apple.com** → **My Apps** → **＋** → **New App**.
   - Platform **iOS**; Name **Foretera** (if taken, use **Foretera Golf** as the
     listing name — the home-screen name stays "Foretera"); Primary language English;
     Bundle ID **com.bryanbabb.quell** (pick it from the dropdown); SKU `foretera`;
     Full access.
2. **Build the production IPA** (Claude runs): in `app/`
   `eas build --profile production --platform ios`
   Reuses your distribution cert + provisioning, auto-increments the build number.
   ~10–20 min on EAS servers.
3. **Upload to App Store Connect** (Claude runs): `eas submit --profile production --platform ios`
   - First time it asks how to authenticate — easiest is an **App Store Connect API
     key**: ASC → **Users and Access** → **Integrations / Keys** → **＋** → role
     **App Manager** → download the `.p8` (you only get it once) + note the Key ID
     and Issuer ID. Give me those (or the path) and I'll wire it; the JSON/key is
     stored **outside git**.
4. **Add testers** (you): in App Store Connect → your app → **TestFlight** tab.
   - Wait ~5–15 min for the build to finish "Processing."
   - Fill **Test Information** (what to test + your email) — required.
   - **Internal Testing** → add testers by email (up to 100, **no review**, instant).
   - They install the **TestFlight** app from the App Store, accept your invite, done.
   - (External testers — up to 10,000 — need a quick one-time Beta App Review.)

---

## PART C — Android internal testing

1. **Create the app in Play Console** (you):
   - **play.google.com/console** → **Create app** → name **Foretera**, language,
     **App**, **Free**, accept the declarations.
2. **Fill the minimum store listing** (you): Play requires these before a release:
   - **Store listing**: short + full description (I can draft), upload
     `android-play-icon-512.png` (App icon) and `android-feature-graphic-1024x500.png`
     (Feature graphic), plus phone screenshots.
   - **Privacy policy** URL (from A3).
   - **App content**: Data safety form, content rating questionnaire, target audience,
     ads = No (unless you add them), etc.
3. **Build the AAB** (Claude runs): `eas build --profile production --platform android`
   - EAS generates + stores the upload keystore (you don't manage it). Produces an
     `.aab` (~10–20 min).
4. **Get a Play service account so I can submit** (you, one-time):
   - Play Console → **Setup → API access** → create/link a Google Cloud service
     account → grant it **Release to testing tracks** (Releases permission) →
     create a **JSON key** and download it.
   - Send me the JSON (I store it **outside git**); then **Claude runs**
     `eas submit --profile production --platform android`.
   - _Alternative (no service account):_ in Play Console → **Testing → Internal
     testing → Create release**, and **upload the `.aab` by hand** (I'll give you
     the file path/URL from the EAS build).
5. **Internal testing track** (you): **Testing → Internal testing** → create a
   release with the AAB → add testers (an email list or a Google Group) → **copy the
   opt-in link** and share it with testers. They open the link, become a tester, and
   install from the Play Store.

---

## PART D — Quick command reference (Claude runs these)

```
# iOS
cd app
eas build  --profile production --platform ios
eas submit --profile production --platform ios

# Android
eas build  --profile production --platform android
eas submit --profile production --platform android
```
Build numbers/version codes auto-increment (eas.json `autoIncrement` + remote
version source). The same Cloudflare backend serves both.

---

## PART E — Order of operations (fastest path)

1. **You:** start A2 (Play $25, identity verification — it's the slowest) + A3
   (privacy policy).
2. **You:** create the App Store Connect app (B1).
3. **Claude:** run the iOS production build (B2).
4. **You:** make the ASC API key (B3) → **Claude:** submit (B3).
5. **You:** add TestFlight testers (B4). ← iOS testers are now live.
6. In parallel, repeat for Android (Part C).

The only true blockers are **account setup + the privacy policy** (you) and the
**ASC API key / Play service account** (you). Everything else I can run.
