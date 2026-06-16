// Quell design tokens — "Modern Tournament" (dark, broadcast) language.
//
// The base is a single dark canvas (bg/surface/text/border neutrals) shared by
// every palette; the user-selectable palettes swap ONLY the accent family
// (Green / Indigo / Sunset / Teal). Win = accent, Loss = a fixed red, Halve =
// a warm neutral, so result coloring reads consistently across accents.
//
// Migration note: the original light theme named colors after golf
// (fairway/paper/ink/sand/flagRed). Those names are KEPT as aliases on every
// palette, mapped onto the new dark tokens, so existing `makeStyles(c)` screens
// render dark with zero edits while we migrate them to the semantic tokens and
// the `components/ui` primitives. New code should prefer the semantic names
// (bg/surface/text/accent/loss/…) and `makeType(c)` over the static `typography`.

export interface Palette {
  scheme: 'light' | 'dark'; // drives the status-bar icon color
  // ── Semantic tokens (prefer these going forward) ──
  bg: string;            // app background (deepest)
  surface: string;       // cards / sheets
  surfaceRaised: string; // raised cards / inputs / pressed rows
  text: string;          // primary text
  muted: string;         // secondary text
  border: string;        // subtle edge hairlines
  divider: string;       // in-group row separators (must read on `surface`)
  accent: string;        // brand / primary action
  accentDark: string;    // accent pressed
  accentGlow: string;    // translucent accent wash (halos)
  win: string;           // a WIN — fixed green on EVERY theme (scorecard/reveal)
  winGlow: string;       // translucent win wash
  loss: string;          // loss / danger / decline — fixed red on every theme
  lossGlow: string;      // translucent loss wash
  halve: string;         // halved hole / neutral result
  halveGlow: string;     // translucent halve wash
  gold: string;          // CHAMPIONSHIP gold — belts, streaks, milestones, favorites
  goldGlow: string;      // translucent gold wash
  live: string;          // COMMUNITY/broadcast — live matches, feed activity, messages
  liveGlow: string;      // translucent live wash
  liveAlt: string;       // broadcast SECOND player (spectator reveal) — must stay
  liveAltGlow: string;   //   distinct from accent/gold/win/loss on both palettes
  // Live GAMECAST two-side identity (Ryder-Cup red vs blue) — the two players in
  // a same-group live match. sideA = creator (red), sideB = opponent (blue).
  sideA: string;
  sideAGlow: string;
  sideB: string;
  sideBGlow: string;
  onAccent: string;      // text/icon on top of an accent fill

  // ── Legacy golf aliases (back-compat — point at the dark tokens above) ──
  fairway: string;       // → accent
  fairwayDark: string;   // → accentDark
  fairwaySoft: string;   // → accentGlow
  flagRed: string;       // → loss
  flagRedSoft: string;   // → lossGlow
  sand: string;          // → halve
  paper: string;         // → bg
  ink: string;           // → text
}

// A theme MODE = a full palette (distinct base + accent), not just an accent
// swap. Tournament Green is the fallback default; the others are the explore
// mockups. `pal()` fills the legacy golf-named aliases automatically.
type PalInput = Omit<Palette,
  'fairway' | 'fairwayDark' | 'fairwaySoft' | 'flagRed' | 'flagRedSoft' | 'sand' | 'paper' | 'ink'>;
function pal(p: PalInput): Palette {
  return {
    ...p,
    fairway: p.accent, fairwayDark: p.accentDark, fairwaySoft: p.accentGlow,
    flagRed: p.loss, flagRedSoft: p.lossGlow, sand: p.halve,
    paper: p.bg, ink: p.text,
  };
}

// ── "MEMBERS" — Black + Gold. ────────────────────────────────────────────────
// Private-club luxury: rich black, warm ivory, champagne gold, bronze. The
// positioning is "an exclusive golf network", not "a golf scorecard app" — so
// the brand color is CHAMPAGNE GOLD (every other golf app owns green). Green
// survives ONLY as the semantic win color (W = green, L = red, on any theme);
// community/live surfaces get a silvered steel-blue so they read as their own
// space. Think Centurion card, not GPS rangefinder.
export const PALETTES: { id: string; name: string; colors: Palette }[] = [
  {
    // Members — DARK (default). Rich black + ivory + champagne.
    id: 'fairway', name: 'Dark',
    colors: pal({
      scheme: 'dark',
      bg: '#0B0B0D', surface: '#151518', surfaceRaised: '#202026',
      text: '#F5F1E6', muted: '#A8A296', border: '#242429', divider: '#33333A',
      accent: '#D4B36A', accentDark: '#B6934B', accentGlow: 'rgba(212,179,106,0.13)', onAccent: '#16120A',
      win: '#46B17C', winGlow: 'rgba(70,177,124,0.14)',
      loss: '#D26A5C', lossGlow: 'rgba(210,106,92,0.13)', halve: '#BCB3A0', halveGlow: 'rgba(188,179,160,0.10)',
      gold: '#E8C87E', goldGlow: 'rgba(232,200,126,0.15)',
      live: '#8FB3CC', liveGlow: 'rgba(143,179,204,0.13)',
      liveAlt: '#B49BC9', liveAltGlow: 'rgba(180,155,201,0.14)',
      sideA: '#E25C54', sideAGlow: 'rgba(226,92,84,0.15)',
      sideB: '#4E93D6', sideBGlow: 'rgba(78,147,214,0.15)',
    }),
  },
  {
    // Members — LIGHT. The ivory membership card: warm white + bronze.
    id: 'fairway-light', name: 'Light',
    colors: pal({
      scheme: 'light',
      bg: '#F6F2E9', surface: '#FFFFFF', surfaceRaised: '#ECE6D8',
      text: '#191613', muted: '#6E6759', border: '#DCD5C3', divider: '#D8D0BE',
      accent: '#96772B', accentDark: '#7A6021', accentGlow: 'rgba(150,119,43,0.12)', onAccent: '#FFFFFF',
      win: '#1F7A4D', winGlow: 'rgba(31,122,77,0.12)',
      // halve must stay visible on the ivory canvas — a pale chip there fails
      // WCAG 3:1 for UI components.
      loss: '#B5483C', lossGlow: 'rgba(181,72,60,0.12)', halve: '#8B8470', halveGlow: 'rgba(139,132,112,0.26)',
      gold: '#8E6F1F', goldGlow: 'rgba(142,111,31,0.13)',
      live: '#3E6E8E', liveGlow: 'rgba(62,110,142,0.12)',
      liveAlt: '#75589B', liveAltGlow: 'rgba(117,88,155,0.12)',
      sideA: '#C0392B', sideAGlow: 'rgba(192,57,43,0.12)',
      sideB: '#2E6DA4', sideBGlow: 'rgba(46,109,164,0.12)',
    }),
  },
];

export const DEFAULT_PALETTE_ID = 'fairway';

export function getPalette(id: string | null | undefined): Palette {
  return (PALETTES.find((p) => p.id === id)?.colors) ?? PALETTES[0].colors;
}

// Back-compat static export (default palette). Screens not yet migrated still work.
export const colors = getPalette(DEFAULT_PALETTE_ID);

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 20, xl: 28, pill: 999 } as const;

// Font family keys — must match what `useFonts` loads in app/_layout.tsx.
// Display = Plus Jakarta Sans (modern, premium); body + numerals = Inter
// (tabular figures keep scorecards column-aligned).
export const fonts = {
  displayXBold: 'PlusJakartaSans_800ExtraBold',
  display: 'PlusJakartaSans_700Bold',
  displaySemi: 'PlusJakartaSans_600SemiBold',
  displayMed: 'PlusJakartaSans_500Medium',
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

// Subtle dark-mode elevation. On dark surfaces shadows read faintly; we pair a
// soft shadow with the border hairline that cards already carry.
export const elevation = {
  card: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  sheet: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  floating: { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;

// Full-bleed gradient stops keyed to match state, for the reveal backdrop and
// hero surfaces. Each returns [top, bottom] over the dark canvas.
export function gradients(c: Palette) {
  return {
    ahead:   [c.accentGlow, c.bg] as const,
    behind:  [c.lossGlow, c.bg] as const,
    neutral: [c.surface, c.bg] as const,
    hero:    [c.surfaceRaised, c.bg] as const,
  };
}

// Typography ramp with palette colors DECOUPLED from the font definitions.
// Screens call `const t = makeType(c)` inside makeStyles and spread `...t.heading`.
// Numerals use tabular-nums so scorecards/scores stay column-aligned.
export function makeType(c: Palette) {
  return {
    hero:         { fontFamily: fonts.displayXBold, fontSize: 40, lineHeight: 44, letterSpacing: -0.8, color: c.text },
    title:        { fontFamily: fonts.display,     fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: c.text },
    heading:      { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: c.text },
    subheading:   { fontFamily: fonts.bodySemi,    fontSize: 17, lineHeight: 23, color: c.text },
    body:         { fontFamily: fonts.body,        fontSize: 16, lineHeight: 23, color: c.text },
    bodySemiBold: { fontFamily: fonts.bodySemi,    fontSize: 16, lineHeight: 23, color: c.text },
    label:        { fontFamily: fonts.bodyMed,     fontSize: 14, lineHeight: 19, color: c.text },
    caption:      { fontFamily: fonts.body,        fontSize: 13, lineHeight: 18, color: c.muted },
    overline:     { fontFamily: fonts.bodySemi,    fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: c.muted },
    score:        { fontFamily: fonts.bodyBold,    fontSize: 22, fontVariant: ['tabular-nums'] as ('tabular-nums')[], color: c.text },
    scoreBig:     { fontFamily: fonts.displayXBold, fontSize: 56, lineHeight: 60, letterSpacing: -1, fontVariant: ['tabular-nums'] as ('tabular-nums')[], color: c.text },
  };
}

// Static typography ramp (default-palette colors). Existing screens spread these
// then override color with `c.ink`/`c.text`, so adding the Tournament font
// families here upgrades EVERY legacy screen to Space Grotesk / Inter at once
// without per-screen edits — the color override they already do makes the baked
// color here irrelevant. New code should prefer makeType(palette). Families are
// weight-specific (fontFamily wins over fontWeight on iOS), so no fontWeight.
// Mutable active-palette reference so the static `typography` (spread by many
// screens) resolves its color to the CURRENT theme — keeps light mode legible
// without a per-screen color override on every style. The theme store calls
// setTypographyPalette() whenever the palette changes; because makeStyles(colors)
// re-runs on that change, the spread re-reads these getters with the new color.
let activeColors: Palette = getPalette(DEFAULT_PALETTE_ID);
export function setTypographyPalette(c: Palette) { activeColors = c; }

export const typography = {
  title: { fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.5, get color() { return activeColors.text; } },
  heading: { fontFamily: fonts.displaySemi, fontSize: 20, letterSpacing: -0.3, get color() { return activeColors.text; } },
  body: { fontFamily: fonts.body, fontSize: 16, get color() { return activeColors.text; } },
  bodySemiBold: { fontFamily: fonts.bodySemi, fontSize: 16, get color() { return activeColors.text; } },
  caption: { fontFamily: fonts.body, fontSize: 13, get color() { return activeColors.muted; } },
};
