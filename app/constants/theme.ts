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
  border: string;        // hairlines / dividers
  accent: string;        // brand / primary action
  accentDark: string;    // accent pressed
  accentGlow: string;    // translucent accent wash (halos)
  win: string;           // a WIN — fixed green on EVERY theme (scorecard/reveal)
  winGlow: string;       // translucent win wash
  loss: string;          // loss / danger / decline — fixed red on every theme
  lossGlow: string;      // translucent loss wash
  halve: string;         // halved hole / neutral result
  halveGlow: string;     // translucent halve wash
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

export const PALETTES: { id: string; name: string; colors: Palette }[] = [
  {
    // Tournament Green — DARK (default).
    id: 'fairway', name: 'Dark',
    colors: pal({
      scheme: 'dark',
      bg: '#12161E', surface: '#1B212B', surfaceRaised: '#272F3B',
      text: '#F7F9FC', muted: '#AAB4C3', border: '#2D3543',
      accent: '#36E27D', accentDark: '#1FB85F', accentGlow: 'rgba(54,226,125,0.14)', onAccent: '#06231A',
      win: '#36E27D', winGlow: 'rgba(54,226,125,0.16)',
      loss: '#FF5A5F', lossGlow: 'rgba(255,90,95,0.14)', halve: '#E6EAF0', halveGlow: 'rgba(230,234,240,0.10)',
    }),
  },
  {
    // Tournament Green — LIGHT. Same green brand on a clean, bright canvas.
    id: 'fairway-light', name: 'Light',
    colors: pal({
      scheme: 'light',
      bg: '#F3F7F3', surface: '#FFFFFF', surfaceRaised: '#E6EEE7',
      text: '#13231A', muted: '#5A6A60', border: '#D3DDD5',
      accent: '#1FAE5E', accentDark: '#178A49', accentGlow: 'rgba(31,174,94,0.12)', onAccent: '#FFFFFF',
      win: '#1B9E54', winGlow: 'rgba(27,158,84,0.14)',
      loss: '#D8433D', lossGlow: 'rgba(216,67,61,0.12)', halve: '#C4CDD2', halveGlow: 'rgba(196,205,210,0.5)',
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
