import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch } from 'react-native';
import { useColors } from '@/store/useThemeStore';
import { Button } from '@/components/ui';
import { CourseSelect } from '@/components/CourseSelect';
import { haptics } from '@/lib/haptics';
import { makeType, spacing, radius, type Palette } from '@/constants/theme';

export type DiscoveryFilterState = { match_type: string; course: string; all: boolean; starred: boolean; within: string };
export const DEFAULT_FILTERS: DiscoveryFilterState = { match_type: 'any', course: '', all: false, starred: false, within: 'any' };
export const isFiltered = (f: DiscoveryFilterState) =>
  f.match_type !== 'any' || f.course.trim() !== '' || f.all || f.starred || f.within !== 'any';

const p2 = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

// The player's LOCAL today (YYYY-MM-DD) — used as the discovery floor so a match
// posted for "today" doesn't vanish in the evening when the server's UTC clock
// has already rolled to tomorrow.
export function localTodayISO(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return isoDate(d);
}

// Map a "When" preset to an upper-bound play date (YYYY-MM-DD), or undefined for
// "any". Range is today → today + N days.
export function untilForWithin(within: string): string | undefined {
  if (!within || within === 'any') return undefined;
  const add = within === 'today' ? 0 : within === '3d' ? 3 : within === '7d' ? 7 : within === '14d' ? 14 : 0;
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + add);
  return isoDate(d);
}

const TYPE_OPTIONS = [
  { k: 'any', label: 'Any' },
  { k: 'front_nine', label: 'Front 9' },
  { k: 'back_nine', label: 'Back 9' },
  { k: 'eighteen', label: '18' },
];

const WHEN_OPTIONS = [
  { k: 'any', label: 'Any' },
  { k: 'today', label: 'Today' },
  { k: '3d', label: '3 days' },
  { k: '7d', label: '1 week' },
  { k: '14d', label: '2 weeks' },
];

// Bottom-sheet filter for the discovery feed. Overlay pattern (not RN Modal);
// keyboard-lifted for the course field.
export function DiscoveryFilters({ visible, value, onApply, onClose }: {
  visible: boolean;
  value: DiscoveryFilterState;
  onApply: (f: DiscoveryFilterState) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [local, setLocal] = useState<DiscoveryFilterState>(value);

  useEffect(() => { if (visible) setLocal(value); }, [visible, value]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Filter matches</Text>

          {/* Course first so its type-ahead sits above the keyboard (the sheet is
              bottom-anchored and not lifted, so the top fields stay on-screen). */}
          <CourseSelect
            label="Course"
            valueName={local.course || null}
            onSelect={(course) => setLocal((s) => ({ ...s, course: course?.name ?? '' }))}
            placeholder="Any course"
          />

          <Text style={styles.label}>Match type</Text>
          <View style={styles.seg}>
            {TYPE_OPTIONS.map((o) => {
              const active = local.match_type === o.k;
              return (
                <Pressable
                  key={o.k}
                  onPress={() => { haptics.select(); setLocal((s) => ({ ...s, match_type: o.k })); }}
                  style={[styles.segBtn, active && styles.segActive]}
                >
                  <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>When</Text>
          <View style={styles.seg}>
            {WHEN_OPTIONS.map((o) => {
              const active = local.within === o.k;
              return (
                <Pressable
                  key={o.k}
                  onPress={() => { haptics.select(); setLocal((s) => ({ ...s, within: o.k })); }}
                  style={[styles.segBtn, active && styles.segActive]}
                >
                  <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Saved only</Text>
              <Text style={styles.switchHint}>Just the matches you've starred to revisit</Text>
            </View>
            <Switch
              value={local.starred}
              onValueChange={(v) => { haptics.select(); setLocal((s) => ({ ...s, starred: v })); }}
              trackColor={{ true: c.accent, false: c.surfaceRaised }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Browse everything</Text>
              <Text style={styles.switchHint}>Ignore your home course and handicap range</Text>
            </View>
            <Switch
              value={local.all}
              onValueChange={(v) => { haptics.select(); setLocal((s) => ({ ...s, all: v })); }}
              trackColor={{ true: c.accent, false: c.surfaceRaised }}
              thumbColor="#FFFFFF"
            />
          </View>

          <Button title="Apply filters" onPress={() => onApply(local)} />
          <Pressable onPress={() => onApply(DEFAULT_FILTERS)} style={styles.reset}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: Palette) {
  const t = makeType(c);
  return StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
      borderWidth: 1, borderColor: c.border, padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: spacing.sm },
    title: { ...t.heading },
    label: { ...t.overline, color: c.muted, marginTop: spacing.sm },
    seg: { flexDirection: 'row', gap: spacing.sm },
    segBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised },
    segActive: { backgroundColor: c.accentGlow, borderColor: c.accent },
    segText: { ...t.label, color: c.text },
    segTextActive: { color: c.accent },
    input: {
      backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border, borderRadius: radius.md,
      paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16, color: c.text,
    },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm },
    switchLabel: { ...t.bodySemiBold },
    switchHint: { ...t.caption, color: c.muted },
    reset: { alignItems: 'center', paddingVertical: spacing.sm },
    resetText: { ...t.body, color: c.muted },
  });
}
