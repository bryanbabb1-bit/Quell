import { View, StyleSheet, type ViewProps } from 'react-native';
import { useColors } from '@/store/useThemeStore';
import { elevation, radius, spacing, type Palette } from '@/constants/theme';

interface CardProps extends ViewProps {
  /** raised = lighter surface + shadow; flat = plain surface + hairline. */
  variant?: 'flat' | 'raised';
  /** Tint the border/background with the accent glow (e.g. a win card). */
  glow?: 'accent' | 'loss' | null;
  padded?: boolean;
}

// Standard surface container. Cards carry a hairline border (the primary
// separation on dark) and optionally a soft shadow when raised.
export function Card({ variant = 'flat', glow = null, padded = true, style, ...rest }: CardProps) {
  const c = useColors();
  const styles = makeStyles(c);
  return (
    <View
      style={[
        styles.base,
        variant === 'raised' ? styles.raised : styles.flat,
        padded && styles.padded,
        glow === 'accent' && styles.glowAccent,
        glow === 'loss' && styles.glowLoss,
        style,
      ]}
      {...rest}
    />
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    base: { borderRadius: radius.lg, borderWidth: 1, borderColor: c.border },
    flat: { backgroundColor: c.surface },
    raised: { backgroundColor: c.surfaceRaised, ...elevation.card },
    padded: { padding: spacing.lg },
    glowAccent: { borderColor: c.accent, backgroundColor: c.accentGlow },
    glowLoss: { borderColor: c.loss, backgroundColor: c.lossGlow },
  });
}
