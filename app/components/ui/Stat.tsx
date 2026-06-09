import { View, StyleSheet } from 'react-native';
import { spacing } from '@/constants/theme';
import { AppText } from './AppText';

interface StatProps {
  value: string | number;
  label: string;
  tone?: 'default' | 'accent' | 'loss' | 'halve';
  align?: 'flex-start' | 'center';
}

// A big tabular value over a small uppercase label — record W/L/H, win%, streak.
export function Stat({ value, label, tone = 'default', align = 'center' }: StatProps) {
  const valueTone = tone === 'default' ? undefined : tone;
  return (
    <View style={[styles.wrap, { alignItems: align }]}>
      <AppText variant="scoreBig" tone={valueTone} style={styles.value}>{value}</AppText>
      <AppText variant="overline">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  value: { fontSize: 36, lineHeight: 40 },
});
