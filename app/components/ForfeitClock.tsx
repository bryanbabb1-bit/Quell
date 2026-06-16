import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/store/useThemeStore';
import { useTick } from '@/lib/useTick';
import { forfeitDeadline } from '@/lib/forfeit';
import { spacing, radius, fonts, makeType, type Palette } from '@/constants/theme';

function format(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return days > 0 ? `${days}d ${p(h)}:${p(m)}:${p(sec)}` : `${p(h)}:${p(m)}:${p(sec)}`;
}

// A live ticking countdown to a match's forfeit deadline.
//   tone 'wait' — you've posted, waiting on them (muted)
//   tone 'act'  — your turn, act now (accent → red under an hour)
// Renders nothing once the deadline passes (the cron has resolved it by then).
export function ForfeitClock({
  playDate, label, tone = 'wait', compact = false,
}: {
  playDate: string;
  label?: string;
  tone?: 'wait' | 'act';
  compact?: boolean;
}) {
  const colors = useColors();
  useTick(); // re-render every second
  const styles = makeStyles(colors);

  const remaining = forfeitDeadline(playDate).getTime() - Date.now();
  if (remaining <= 0) return null;

  const urgent = remaining < 3_600_000; // under an hour
  const color = urgent ? colors.loss : tone === 'act' ? colors.accent : colors.muted;
  const clock = format(remaining);

  if (compact) {
    return (
      <View style={[styles.chip, { backgroundColor: urgent ? colors.lossGlow : colors.surfaceRaised }]}>
        <Ionicons name="time-outline" size={11} color={color} />
        <Text style={[styles.chipText, { color }]} numberOfLines={1}>{clock}</Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Ionicons name="time-outline" size={14} color={color} />
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        {label ? `${label} ` : ''}<Text style={styles.mono}>{clock}</Text>
      </Text>
    </View>
  );
}

function makeStyles(colors: Palette) {
  const t = makeType(colors);
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    text: { ...t.caption, flexShrink: 1 },
    mono: { fontFamily: fonts.bodySemi, fontVariant: ['tabular-nums'] },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2,
    },
    chipText: { ...t.caption, fontSize: 12, fontFamily: fonts.bodySemi, fontVariant: ['tabular-nums'] },
  });
}
