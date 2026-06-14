import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApi, type CreateMatchInput } from '@/lib/useApi';
import { useUserStore } from '@/store/useUserStore';
import { useColors } from '@/store/useThemeStore';
import { haptics } from '@/lib/haptics';
import { ConfirmIndexSheet } from '@/components/ConfirmIndexSheet';
import { CourseSelect } from '@/components/CourseSelect';
import { Ionicons } from '@expo/vector-icons';
import type { MatchType, CourseSummary, TeeSummary, Visibility } from '@/types';
import { MATCH_TYPE_LABELS } from '@/types';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

const TYPES: MatchType[] = ['front_nine', 'back_nine', 'eighteen'];

// Half-hour tee-time slots, 6:00 AM–4:00 PM, stored as "HH:MM" (24h).
const TEE_TIMES: string[] = (() => {
  const out: string[] = [];
  for (let h = 6; h <= 16; h++) for (const m of ['00', '30']) out.push(`${String(h).padStart(2, '0')}:${m}`);
  return out;
})();
function timeLabel(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

type Day = { iso: string; weekday: string; day: number; month: string };

// Next N days as pickable chips — no raw date typing.
function nextDays(n: number): Day[] {
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const out: Day[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const weekday = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString(undefined, { weekday: 'short' });
    out.push({ iso, weekday, day: d.getDate(), month: d.toLocaleDateString(undefined, { month: 'short' }) });
  }
  return out;
}

function isoToday(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CreateMatchScreen() {
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Direct-challenge mode: opponent pre-set via route params.
  const { opponent_id, opponent_name } = useLocalSearchParams<{ opponent_id?: string; opponent_name?: string }>();
  const isChallenge = !!opponent_id;
  const [courseName, setCourseName] = useState('');
  const [teeColor, setTeeColor] = useState('');
  const [teeId, setTeeId] = useState<string | null>(null);
  const [courseTees, setCourseTees] = useState<TeeSummary[]>([]);
  const [playDate, setPlayDate] = useState(isoToday());
  const days = useMemo(() => nextDays(14), []);
  const [matchType, setMatchType] = useState<MatchType>('eighteen');
  const [playTime, setPlayTime] = useState<string | null>(null);
  const [playingTogether, setPlayingTogether] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [hcpMin, setHcpMin] = useState('');
  const [hcpMax, setHcpMax] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const user = useUserStore((s) => s.user);
  const [pendingCreate, setPendingCreate] = useState<CreateMatchInput | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  // Picking a course loads its tees (default to the first). Course = type-ahead.
  const onSelectCourse = useCallback(async (course: CourseSummary | null) => {
    setTeeId(null); setTeeColor(''); setCourseTees([]);
    if (!course) { setCourseName(''); return; }
    setCourseName(course.name);
    try {
      const r = await api.getCourse(course.id);
      setCourseTees(r.tees);
      if (r.tees.length) { setTeeId(r.tees[0].id); setTeeColor(r.tees[0].name); }
    } catch { /* keep course name; user can switch to custom */ }
  }, [api]);

  // Default the course to the player's home course (once, unless challenging).
  const didDefault = useRef(false);
  useEffect(() => {
    if (didDefault.current || !user) return;
    didDefault.current = true;
    const hid = user.home_course_id;
    if (hid) api.getCourses().then((r) => { const c = r.courses.find((x) => x.id === hid); if (c) onSelectCourse(c); }).catch(() => {});
  }, [user, api, onSelectCourse]);

  // Validate the form and return the create payload, or null (after alerting).
  const buildPayload = (): CreateMatchInput | null => {
    if (!teeId || !courseName) {
      Alert.alert('Pick a course', 'Choose a course and tee for the match.'); return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(playDate)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD (e.g. 2026-06-14).'); return null;
    }
    // A direct challenge is targeted, so the handicap range is irrelevant —
    // default it wide. An open match still needs an explicit range.
    let min = 0, max = 54;
    if (!isChallenge) {
      min = parseInt(hcpMin, 10);
      max = parseInt(hcpMax, 10);
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        Alert.alert('Handicap range', 'Enter whole numbers for the min and max handicap.'); return null;
      }
      if (min > max) { Alert.alert('Handicap range', 'Min must be ≤ max.'); return null; }
    }

    return {
      course_name: courseName.trim(),
      tee_color: teeColor.trim(),
      tee_id: teeId,
      play_date: playDate,
      play_time: playTime,
      match_type: matchType,
      visibility,
      stakes: null,
      hcp_range_min: min,
      hcp_range_max: max,
      opponent_id: isChallenge ? opponent_id : null,
      playing_together: playingTogether,
    };
  };

  const doCreate = async (payload: CreateMatchInput) => {
    setSubmitting(true);
    try {
      const created = await api.createMatch(payload);
      // Land on the new match so it's obvious it posted (back would silently
      // drop them on Discovery with no confirmation).
      router.replace(`/(app)/match/${created.id}`);
    } catch (e: any) {
      Alert.alert('Could not post', e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // The creator's index is locked onto the match at post time — confirm/refresh
  // it first when it's unset or stale.
  // Always confirm the index before posting — it's locked onto the match, so the
  // player verifies it every time (the sheet pre-fills their current value).
  const submit = () => {
    const payload = buildPayload();
    if (!payload) return;
    setPendingCreate(payload);
  };

  const confirmIndexAndCreate = async (index: number) => {
    setSheetBusy(true);
    try {
      const updated = await api.updateMe({ handicap: index });
      useUserStore.setState({ user: updated });
      const payload = pendingCreate;
      setPendingCreate(null);
      if (payload) await doCreate(payload);
    } catch (e: any) {
      Alert.alert('Could not save your index', e?.message ?? 'Please try again.');
    } finally {
      setSheetBusy(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {isChallenge ? (
          <View style={styles.challengeBanner}>
            <Ionicons name="flash" size={18} color={colors.accent} />
            <Text style={styles.challengeText}>Challenging {opponent_name || 'a player'}</Text>
          </View>
        ) : null}

        <CourseSelect
          label="Course"
          valueName={courseName || null}
          onSelect={onSelectCourse}
          placeholder="Search your course…"
        />
        {courseTees.length > 0 ? (
          <View style={styles.field}>
            <Text style={styles.label}>Tees</Text>
            <View style={styles.teeWrap}>
              {courseTees.map((t) => {
                const active = teeId === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.teeBtn, active && styles.teeBtnActive]}
                    onPress={() => { haptics.select(); setTeeId(t.id); setTeeColor(t.name); }}
                  >
                    <Text style={[styles.teeName, active && styles.teeNameActive]}>{t.name}</Text>
                    <Text style={styles.teeSub}>{t.course_rating ?? '—'} / {t.slope_rating ?? '—'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow} keyboardShouldPersistTaps="handled">
            {days.map((d) => {
              const active = d.iso === playDate;
              return (
                <TouchableOpacity
                  key={d.iso}
                  onPress={() => { haptics.select(); setPlayDate(d.iso); }}
                  style={[styles.dateChip, active && styles.dateChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.dateWeekday, active && styles.dateTextActive]}>{d.weekday}</Text>
                  <Text style={[styles.dateDay, active && styles.dateTextActive]}>{d.day}</Text>
                  <Text style={[styles.dateMonth, active && styles.dateTextActive]}>{d.month}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Tee time</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow} keyboardShouldPersistTaps="handled">
            <TouchableOpacity
              onPress={() => { haptics.select(); setPlayTime(null); }}
              style={[styles.timeChip, playTime === null && styles.timeChipActive]}
              accessibilityRole="button" accessibilityState={{ selected: playTime === null }}
            >
              <Text style={[styles.timeText, playTime === null && styles.dateTextActive]}>Flexible</Text>
            </TouchableOpacity>
            {TEE_TIMES.map((t) => {
              const active = t === playTime;
              return (
                <TouchableOpacity
                  key={t} onPress={() => { haptics.select(); setPlayTime(t); }}
                  style={[styles.timeChip, active && styles.timeChipActive]}
                  accessibilityRole="button" accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.timeText, active && styles.dateTextActive]}>{timeLabel(t)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <Text style={styles.label}>How you'll play</Text>
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segBtn, styles.segRow, !playingTogether && styles.segBtnActive]}
            accessibilityRole="button" accessibilityState={{ selected: !playingTogether }}
            onPress={() => { haptics.select(); setPlayingTogether(false); }}
          >
            <Ionicons name="git-branch-outline" size={15} color={!playingTogether ? colors.surface : colors.muted} />
            <Text style={[styles.segText, !playingTogether && styles.segTextActive]}>Separate rounds</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, styles.segRow, playingTogether && styles.segBtnActive]}
            accessibilityRole="button" accessibilityState={{ selected: playingTogether }}
            onPress={() => { haptics.select(); setPlayingTogether(true); }}
          >
            <Ionicons name="people-outline" size={15} color={playingTogether ? colors.surface : colors.muted} />
            <Text style={[styles.segText, playingTogether && styles.segTextActive]}>Same group</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>
          {playingTogether
            ? 'You’ll play together — live scoring is on, and others can follow the match hole by hole.'
            : 'You’ll each play your own round; scores stay sealed until both are in, then the reveal.'}
        </Text>

        <Text style={styles.label}>Match type</Text>
        <View style={styles.segment}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.segBtn, matchType === t && styles.segBtnActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: matchType === t }}
              onPress={() => { haptics.select(); setMatchType(t); }}
            >
              <Text style={[styles.segText, matchType === t && styles.segTextActive]}>{MATCH_TYPE_LABELS[t]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Visibility</Text>
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segBtn, styles.segRow, visibility === 'private' && styles.segBtnActive]}
            onPress={() => { haptics.select(); setVisibility('private'); }}
          >
            <Ionicons name="lock-closed-outline" size={15} color={visibility === 'private' ? colors.surface : colors.muted} />
            <Text style={[styles.segText, visibility === 'private' && styles.segTextActive]}>Private</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, styles.segRow, visibility === 'public' && styles.segBtnActive]}
            onPress={() => { haptics.select(); setVisibility('public'); }}
          >
            <Ionicons name="earth-outline" size={15} color={visibility === 'public' ? colors.surface : colors.muted} />
            <Text style={[styles.segText, visibility === 'public' && styles.segTextActive]}>Public</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>
          {visibility === 'public'
            ? 'Shows in the course feed once you tee off — players, format, and result.'
            : 'Only you and your opponent can see this match.'}
        </Text>

        {!isChallenge ? (
          <>
            <Text style={styles.label}>Opponent handicap range</Text>
            <View style={styles.rowFields}>
              <View style={styles.flex}>
                <TextInput style={styles.input} value={hcpMin} onChangeText={setHcpMin} placeholder="Min" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={styles.flex}>
                <TextInput style={styles.input} value={hcpMax} onChangeText={setHcpMax} placeholder="Max" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
          </>
        ) : null}

        <TouchableOpacity style={styles.submit} onPress={submit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitText}>{isChallenge ? 'Send challenge' : 'Post Match'}</Text>}
        </TouchableOpacity>
      </ScrollView>

    <ConfirmIndexSheet
      visible={!!pendingCreate}
      handicap={user?.handicap ?? null}
      updatedAt={user?.handicap_updated_at ?? null}
      actionLabel={isChallenge ? 'Send challenge' : 'Post match'}
      busy={sheetBusy}
      onCancel={() => setPendingCreate(null)}
      onConfirm={confirmIndexAndCreate}
    />
    </View>
  );
}

function Field(props: {
  label: string; value: string; onChangeText: (s: string) => void;
  placeholder?: string; keyboardType?: any;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={props.keyboardType}
      />
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.paper },
  field: { gap: spacing.xs },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  label: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  challengeBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.accentGlow, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md, padding: spacing.md },
  challengeText: { ...typography.bodySemiBold, color: colors.accent },
  dateRow: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.md },
  dateChip: {
    width: 58, alignItems: 'center', paddingVertical: spacing.sm, gap: 2,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  dateChipActive: { backgroundColor: colors.accentGlow, borderColor: colors.accent },
  dateWeekday: { ...typography.caption, fontSize: 11, color: colors.muted, textTransform: 'uppercase' },
  dateDay: { ...typography.heading, fontSize: 20, color: colors.text },
  dateMonth: { ...typography.caption, fontSize: 11, color: colors.muted },
  dateTextActive: { color: colors.accent },
  timeChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  timeChipActive: { backgroundColor: colors.accentGlow, borderColor: colors.accent },
  timeText: { ...typography.bodySemiBold, fontSize: 14, color: colors.ink },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  modeActive: { backgroundColor: colors.accentGlow, borderColor: colors.accent },
  modeText: { ...typography.bodySemiBold, color: colors.ink },
  modeTextActive: { color: colors.accent },
  teeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  teeBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', minWidth: 78 },
  teeBtnActive: { backgroundColor: colors.accentGlow, borderColor: colors.accent },
  teeName: { ...typography.bodySemiBold, color: colors.ink },
  teeNameActive: { color: colors.accent },
  teeSub: { ...typography.caption, color: colors.muted, fontSize: 11 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: 16, color: colors.ink,
  },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.sm + 2, alignItems: 'center', backgroundColor: colors.surface },
  segBtnActive: { backgroundColor: colors.fairway, borderColor: colors.fairway },
  segRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segText: { ...typography.bodySemiBold, color: colors.ink },
  segTextActive: { color: colors.surface },
  note: { ...typography.caption, color: colors.muted },
  submit: { backgroundColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  submitText: { ...typography.bodySemiBold, color: colors.surface },
  });
}
