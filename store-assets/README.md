# Foretera — Store assets

Black + Gold "Members" brand: rich black `#0C0C0E`, champagne gold ramp
`#EBCF8E → #A7803A` (matches `app/constants/theme.ts`). Regenerate any time
with `powershell -ExecutionPolicy Bypass -File store-assets\generate_black_gold.ps1`
(recolors `app/assets/*` in place and rebuilds the three store files).
See `docs/RELEASE.md` for exactly where each goes.

| File | Size | Use |
|---|---|---|
| `ios-app-store-icon-1024.png` | 1024×1024, **no alpha** | App Store marketing icon (usually auto-pulled from the build; upload if ASC asks) |
| `android-play-icon-512.png` | 512×512 | Play Console → Store listing → **App icon** (required) |
| `android-feature-graphic-1024x500.png` | 1024×500 | Play Console → Store listing → **Feature graphic** (required) |

The in-app icon / splash / Android adaptive icon live in `app/assets/`
(`icon.png`, `splash.png`, `adaptive-icon.png`) and are wired in `app.json`.

**Screenshots are not here** — take those from the running app (see RELEASE.md).
