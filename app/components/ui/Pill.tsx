import { View, StyleSheet, type ViewStyle } from 'react-native';
import { useColors } from '@/store/useThemeStore';
import { radius, spacing, type Palette } from '@/constants/theme';
import { AppText } from './AppText';

type PillTone = 'neutral' | 'accent' | 'loss' | 'halve' | 'muted';

interface PillProps {
  label: string;
  tone?: PillTone;
  /** Filled (solid glow bg) vs outline (hairline only). */
  variant?: 'filled' | 'outline';
  style?: ViewStyle;
}

// Small rounded status label — match type, stakes, result, hcp range, etc.
export function Pill({ label, tone = 'neutral', variant = 'filled', style }: PillProps) {
  const c = useColors();
  const styles = makeStyles(c);
  const fg =
    tone === 'accent' ? c.accent :
    tone === 'loss' ? c.loss :
    tone === 'halve' ? c.halve :
    tone === 'muted' ? c.muted : c.text;
  const bg =
    tone === 'accent' ? c.accentGlow :
    tone === 'loss' ? c.lossGlow :
    tone === 'halve' ? c.halveGlow : c.surfaceRaised;

  return (
    <View
      style={[
        styles.base,
        variant === 'filled' ? { backgroundColor: bg } : { borderWidth: 1, borderColor: fg },
        style,
      ]}
    >
      <AppText variant="overline" color={fg} style={styles.text}>{label}</AppText>
    </View>
  );
}

function makeStyles(_c: Palette) {
  return StyleSheet.create({
    base: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
    text: { letterSpacing: 0.6 },
  });
}
