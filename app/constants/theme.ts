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
  // ── Semantic dark tokens (prefer these going forward) ──
  bg: string;            // app background (deepest)
  surface: string;       // cards / sheets
  surfaceRaised: string; // raised cards / inputs / pressed rows
  text: string;          // primary text
  muted: string;         // secondary text
  border: string;        // hairlines / dividers
  accent: string;        // brand / primary action / win
  accentDark: string;    // accent pressed
  accentGlow: string;    // translucent accent wash (win backgrounds, halos)
  loss: string;          // loss / danger / decline
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

// Shared dark canvas — identical across every palette.
const BG = '#0E1116';
const SURFACE = '#171B22';
const SURFACE_RAISED = '#1F242D';
const TEXT = '#F5F7FA';
const MUTED = '#8A94A6';
const BORDER = '#232A33';
const LOSS = '#FF5A5F';
const LOSS_GLOW = 'rgba(255,90,95,0.14)';
const HALVE = '#C2A878';
const HALVE_GLOW = 'rgba(194,168,120,0.14)';

// Build a full palette from just its accent family — the only thing that varies.
function makePalette(accent: string, accentDark: string, accentGlow: string, onAccent: string): Palette {
  return {
    bg: BG, surface: SURFACE, surfaceRaised: SURFACE_RAISED,
    text: TEXT, muted: MUTED, border: BORDER,
    accent, accentDark, accentGlow,
    loss: LOSS, lossGlow: LOSS_GLOW,
    halve: HALVE, halveGlow: HALVE_GLOW,
    onAccent,
    // legacy aliases
    fairway: accent, fairwayDark: accentDark, fairwaySoft: accentGlow,
    flagRed: LOSS, flagRedSoft: LOSS_GLOW, sand: HALVE,
    paper: BG, ink: TEXT,
  };
}

export const PALETTES: { id: string; name: string; colors: Palette }[] = [
  { id: 'fairway',  name: 'Tournament Green', colors: makePalette('#36E27D', '#1FB85F', 'rgba(54,226,125,0.14)', '#06231A') },
  { id: 'twilight', name: 'Twilight Indigo',  colors: makePalette('#7C83FF', '#5A60E0', 'rgba(124,131,255,0.16)', '#0B0E2A') },
  { id: 'sunset',   name: 'Sunset Clay',      colors: makePalette('#FF9A5A', '#E0743A', 'rgba(255,154,90,0.16)', '#2A1206') },
  { id: 'ocean',    name: 'Ocean Teal',       colors: makePalette('#2DD4D4', '#16AAAA', 'rgba(45,212,212,0.16)', '#04221F') },
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
export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displaySemi: 'SpaceGrotesk_600SemiBold',
  displayMed: 'SpaceGrotesk_500Medium',
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
    hero:         { fontFamily: fonts.display,     fontSize: 40, lineHeight: 44, letterSpacing: -0.8, color: c.text },
    title:        { fontFamily: fonts.display,     fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: c.text },
    heading:      { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: c.text },
    subheading:   { fontFamily: fonts.bodySemi,    fontSize: 17, lineHeight: 23, color: c.text },
    body:         { fontFamily: fonts.body,        fontSize: 16, lineHeight: 23, color: c.text },
    bodySemiBold: { fontFamily: fonts.bodySemi,    fontSize: 16, lineHeight: 23, color: c.text },
    label:        { fontFamily: fonts.bodyMed,     fontSize: 14, lineHeight: 19, color: c.text },
    caption:      { fontFamily: fonts.body,        fontSize: 13, lineHeight: 18, color: c.muted },
    overline:     { fontFamily: fonts.bodySemi,    fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: c.muted },
    score:        { fontFamily: fonts.bodyBold,    fontSize: 22, fontVariant: ['tabular-nums'] as const, color: c.text },
    scoreBig:     { fontFamily: fonts.display,     fontSize: 56, lineHeight: 60, letterSpacing: -1, fontVariant: ['tabular-nums'] as const, color: c.text },
  };
}

// Static typography ramp (default-palette colors). Existing screens spread these
// then override color with `c.ink`/`c.text`, so adding the Tournament font
// families here upgrades EVERY legacy screen to Space Grotesk / Inter at once
// without per-screen edits — the color override they already do makes the baked
// color here irrelevant. New code should prefer makeType(palette). Families are
// weight-specific (fontFamily wins over fontWeight on iOS), so no fontWeight.
export const typography = {
  title: { fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.5, color: colors.text },
  heading: { fontFamily: fonts.displaySemi, fontSize: 20, letterSpacing: -0.3, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 16, color: colors.text },
  bodySemiBold: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  caption: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
} as const;
