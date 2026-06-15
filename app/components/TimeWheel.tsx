import { useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useColors } from '@/store/useThemeStore';
import { haptics } from '@/lib/haptics';
import { spacing, radius, fonts, type Palette } from '@/constants/theme';

// A JS-only scroll-snap time wheel (no native DateTimePicker dependency, so it
// works on the current dev build). Three columns — hour / minute / AM-PM — each
// snaps to the centered row. Emits "HH:MM" (24h). Minutes step by 5 so any
// course's tee-time structure is settable without preset assumptions.
const ITEM_H = 40;
const VISIBLE = 3;                       // odd; the middle row is the selection
const PAD = ITEM_H * Math.floor(VISIBLE / 2);

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);   // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55
const PERIODS = ['AM', 'PM'];

function to24(h12: number, min: number, period: string): string {
  let h = h12 % 12;
  if (period === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
function from24(v: string | null): { h12: number; min: number; period: string } {
  if (!v || !/^\d{2}:\d{2}$/.test(v)) return { h12: 8, min: 0, period: 'AM' };
  const [h, m] = v.split(':').map(Number);
  return {
    h12: h % 12 === 0 ? 12 : h % 12,
    min: (Math.round(m / 5) * 5) % 60,
    period: h >= 12 ? 'PM' : 'AM',
  };
}

export function TimeWheel({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { h12, min, period } = from24(value);

  const emit = (nh: number, nm: number, np: string) => onChange(to24(nh, nm, np));

  return (
    <View style={styles.wrap}>
      {/* Center selection band */}
      <View style={styles.band} pointerEvents="none" />
      <View style={styles.cols}>
        <Column data={HOURS} index={HOURS.indexOf(h12)} fmt={(n) => String(n)} colors={colors} styles={styles}
          onSelect={(i) => emit(HOURS[i], min, period)} />
        <Text style={styles.colon}>:</Text>
        <Column data={MINUTES} index={MINUTES.indexOf(min)} fmt={(n) => String(n).padStart(2, '0')} colors={colors} styles={styles}
          onSelect={(i) => emit(h12, MINUTES[i], period)} />
        <Column data={PERIODS} index={PERIODS.indexOf(period)} fmt={(s) => String(s)} colors={colors} styles={styles}
          onSelect={(i) => emit(h12, min, PERIODS[i])} />
      </View>
    </View>
  );
}

function Column<T>({ data, index, fmt, onSelect, colors, styles }: {
  data: T[]; index: number; fmt: (v: T) => string; onSelect: (i: number) => void;
  colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  const ref = useRef<ScrollView>(null);
  const lastRef = useRef(index);
  // Position the column on its current value once (and when the value changes
  // from outside, e.g. a reset).
  useEffect(() => {
    const t = setTimeout(() => ref.current?.scrollTo({ y: Math.max(0, index) * ITEM_H, animated: false }), 0);
    return () => clearTimeout(t);
  }, [index]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(data.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_H)));
    if (i !== lastRef.current) { lastRef.current = i; haptics.select(); onSelect(i); }
  };

  return (
    <ScrollView
      ref={ref}
      style={styles.col}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      contentContainerStyle={{ paddingVertical: PAD }}
      onMomentumScrollEnd={onEnd}
    >
      {data.map((d, i) => (
        <View key={i} style={styles.item}>
          <Text style={[styles.itemText, i === index && styles.itemTextSel]}>{fmt(d)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: {
      height: ITEM_H * VISIBLE, justifyContent: 'center',
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md,
      overflow: 'hidden',
    },
    band: {
      position: 'absolute', left: spacing.md, right: spacing.md, top: PAD, height: ITEM_H,
      borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.accent,
      backgroundColor: c.accentGlow, borderRadius: radius.sm,
    },
    cols: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    col: { width: 64, height: ITEM_H * VISIBLE },
    colon: { fontFamily: fonts.displayXBold, fontSize: 22, color: c.muted, marginBottom: 2 },
    item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
    itemText: { fontFamily: fonts.bodyMed, fontSize: 20, color: c.muted, fontVariant: ['tabular-nums'] },
    itemTextSel: { fontFamily: fonts.displayXBold, color: c.text },
  });
}
