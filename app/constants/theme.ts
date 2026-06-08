// Match Play palette — fairway greens + scorecard-paper neutrals. Single
// source of truth for colors/spacing so screens stay consistent.
export const colors = {
  fairway: '#2E7D4F',      // primary green
  fairwayDark: '#1F5A38',
  flagRed: '#D64545',      // accent (loss / decline / alerts)
  sand: '#E8E2D0',         // card / surface accents
  paper: '#FAFAF7',        // background (scorecard paper)
  surface: '#FFFFFF',
  ink: '#1A1A1A',          // primary text
  muted: '#6B7280',        // secondary text
  border: '#E5E7EB',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.ink },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.ink },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.ink },
  bodySemiBold: { fontSize: 16, fontWeight: '600' as const, color: colors.ink },
  caption: { fontSize: 13, fontWeight: '400' as const, color: colors.muted },
} as const;
