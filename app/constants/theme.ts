// Match Play design tokens. Spacing/radius/typography are fixed; COLORS are
// themeable — several palettes the user can toggle in Settings. Palettes share
// the text/border neutrals (so type stays readable everywhere) and vary the
// brand + background hues. The default palette equals the original look, so any
// screen still reading the static `colors` export renders unchanged.

export interface Palette {
  fairway: string;       // primary / brand
  fairwayDark: string;   // primary pressed / dark
  flagRed: string;       // danger / loss / decline
  sand: string;          // soft accent surface
  paper: string;         // app background
  surface: string;       // cards
  ink: string;           // primary text
  muted: string;         // secondary text
  border: string;
}

// Shared neutrals across every palette.
const INK = '#1A1A1A';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const SURFACE = '#FFFFFF';
const FLAG = '#D64545';

export const PALETTES: { id: string; name: string; colors: Palette }[] = [
  {
    id: 'fairway', name: 'Fairway Green',
    colors: { fairway: '#2E7D4F', fairwayDark: '#1F5A38', flagRed: FLAG, sand: '#E8E2D0', paper: '#FAFAF7', surface: SURFACE, ink: INK, muted: MUTED, border: BORDER },
  },
  {
    id: 'twilight', name: 'Twilight Indigo',
    colors: { fairway: '#4F46E5', fairwayDark: '#3730A3', flagRed: FLAG, sand: '#E7E8F7', paper: '#F5F5FC', surface: SURFACE, ink: INK, muted: MUTED, border: '#E3E3F0' },
  },
  {
    id: 'sunset', name: 'Sunset Clay',
    colors: { fairway: '#DD6B3D', fairwayDark: '#B2491F', flagRed: '#C2403B', sand: '#F5E5D8', paper: '#FCF8F4', surface: SURFACE, ink: INK, muted: MUTED, border: '#EEE3D8' },
  },
  {
    id: 'ocean', name: 'Ocean Teal',
    colors: { fairway: '#0E7C86', fairwayDark: '#095962', flagRed: FLAG, sand: '#DCECEE', paper: '#F2F9FA', surface: SURFACE, ink: INK, muted: MUTED, border: '#DCE8EA' },
  },
];

export const DEFAULT_PALETTE_ID = 'fairway';

export function getPalette(id: string | null | undefined): Palette {
  return (PALETTES.find((p) => p.id === id)?.colors) ?? PALETTES[0].colors;
}

// Back-compat static export (default palette). Screens not yet themed still work.
export const colors = getPalette(DEFAULT_PALETTE_ID);

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.ink },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.ink },
  bodySemiBold: { fontSize: 16, fontWeight: '600' as const, color: colors.ink },
  caption: { fontSize: 13, fontWeight: '400' as const, color: colors.muted },
} as const;
