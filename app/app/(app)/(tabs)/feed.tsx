import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { useUserStore } from '@/store/useUserStore';
import { CourseSelect } from '@/components/CourseSelect';
import { Avatar, EmptyState } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { MATCH_TYPE_LABELS } from '@/types';
import type { CourseFeedMatch, CourseSummary } from '@/types';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

// Local YYYY-MM-DD (the player's clock, not UTC) so "today" lines up with the
// feed's play_date filter.
function isoOn(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoToday(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return isoOn(d);
}
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + days);
  return isoOn(dt);
}
// "Today" / "Yesterday" / "Wed, Jun 11"
function dateLabel(iso: string): string {
  const today = isoToday();
  if (iso === today) return 'Today';
  if (iso === shiftIso(today, -1)) return 'Yesterday';
  if (iso === shiftIso(today, 1)) return 'Tomorrow';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
// "2:34 PM" from "HH:MM"
function timeLabel(t: string | null): string | null {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function FeedScreen() {
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const user = useUserStore((s) => s.user);

  const [course, setCourse] = useState<string | null>(null);
  const [date, setDate] = useState(isoToday());
  const [rows, setRows] = useState<CourseFeedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  // Default the feed to the player's home course (once it's resolved).
  useEffect(() => {
    const hid = user?.home_course_id;
    if (!hid || course) return;
    api.getCourses().then((r) => {
      const n = r.courses.find((x) => x.id === hid)?.name ?? null;
      if (n) setCourse(n);
    }).catch(() => {});
  }, [user, api, course]);

  const load = useCallback(async () => {
    if (!course) { setLoading(false); return; }
    try {
      setError(null);
      const r = await api.courseFeed(course, date);
      setRows(r.matches);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the feed.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, course, date]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const live = rows.filter((m) => m.status === 'accepted' || m.status === 'in_progress');
  const done = rows.filter((m) => m.status === 'completed');
  const onToday = date === isoToday();

  const onPickCourse = (c: CourseSummary | null) => {
    setCourse(c?.name ?? null);
    setSwitching(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Course header + switcher */}
      <View style={styles.courseHeader}>
        <TouchableOpacity style={styles.courseTitleRow} activeOpacity={0.7} onPress={() => { haptics.select(); setSwitching((s) => !s); }}>
          <Ionicons name="golf-outline" size={18} color={colors.accent} />
          <Text style={styles.courseTitle} numberOfLines={1}>{course ?? 'Pick a course'}</Text>
          <Ionicons name={switching ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
        </TouchableOpacity>
      </View>
      {(switching || !course) && (
        <View style={styles.switcher}>
          <CourseSelect valueName={course} onSelect={onPickCourse} placeholder="Search a course…" />
        </View>
      )}

      {/* Date navigator */}
      <View style={styles.dateBar}>
        <TouchableOpacity hitSlop={10} onPress={() => { haptics.select(); setDate((d) => shiftIso(d, -1)); }}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.dateMid}>
          <Text style={styles.dateText}>{dateLabel(date)}</Text>
          {!onToday && (
            <TouchableOpacity onPress={() => { haptics.select(); setDate(isoToday()); }}>
              <Text style={styles.todayLink}>Jump to today</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity hitSlop={10} onPress={() => { haptics.select(); setDate((d) => shiftIso(d, 1)); }}>
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {!loading && course && rows.length === 0 && !error && (
          <EmptyState
            icon="newspaper-outline"
            title="Nothing public yet"
            message={`No public matches at ${course} ${onToday ? 'today' : 'on this day'}. Set a match to Public and it shows here.`}
          />
        )}

        {live.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <View style={styles.liveDot} />
              <Text style={styles.sectionTitle}>Now playing</Text>
            </View>
            <View style={styles.card}>
              {live.map((m, i) => <FeedRow key={m.id} m={m} divider={i > 0} colors={colors} styles={styles} />)}
            </View>
          </>
        )}

        {done.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Final results</Text>
            <View style={styles.card}>
              {done.map((m, i) => <FeedRow key={m.id} m={m} divider={i > 0} colors={colors} styles={styles} />)}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FeedRow({ m, divider, colors, styles }: {
  m: CourseFeedMatch; divider: boolean; colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  const time = timeLabel(m.play_time);
  // Result line for a finished match (neutral, third-person).
  let resultText: string | null = null;
  if (m.status === 'completed') {
    if (m.result === 'tie') resultText = m.final_delta ? `Halved (${m.final_delta})` : 'Halved';
    else {
      const winner = m.result === 'creator_wins' ? m.creator_name : m.opponent_name;
      resultText = m.final_delta ? `${winner} won ${m.final_delta}` : `${winner} won`;
    }
  }
  return (
    <TouchableOpacity
      style={[styles.row, divider && styles.rowDivider]}
      activeOpacity={0.7}
      // Completed public matches → straight into the reveal (watch it play out, or
      // "Skip to result"). Live matches → the read-only match detail.
      onPress={() => router.push(m.status === 'completed' ? `/(app)/match/${m.id}/reveal` : `/(app)/match/${m.id}`)}
    >
      <View style={styles.players}>
        <View style={styles.playerLine}>
          <Avatar name={m.creator_name} size={26} photoUrl={m.creator_photo_url} />
          <Text style={styles.playerName} numberOfLines={1}>{m.creator_name}</Text>
        </View>
        <Text style={styles.vs}>vs</Text>
        <View style={styles.playerLine}>
          <Avatar name={m.opponent_name} size={26} photoUrl={m.opponent_photo_url} />
          <Text style={styles.playerName} numberOfLines={1}>{m.opponent_name}</Text>
        </View>
      </View>

      <View style={styles.rowRight}>
        {m.status === 'completed' ? (
          <Text style={styles.resultText} numberOfLines={2}>{resultText}</Text>
        ) : (
          <View style={[styles.statusChip, m.status === 'in_progress' && styles.statusChipLive]}>
            <Text style={[styles.statusChipText, m.status === 'in_progress' && styles.statusChipTextLive]}>
              {m.status === 'in_progress' ? 'In progress' : 'Scheduled'}
            </Text>
          </View>
        )}
        <Text style={styles.meta}>{[time, MATCH_TYPE_LABELS[m.match_type]].filter(Boolean).join(' · ')}</Text>
        {m.is_mine && <Text style={styles.mineTag}>Your match</Text>}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.paper },
    courseHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
    courseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    courseTitle: { ...typography.heading, fontSize: 20, color: colors.text, flex: 1 },
    switcher: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    dateBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    },
    dateMid: { alignItems: 'center', gap: 2 },
    dateText: { ...typography.bodySemiBold, color: colors.text },
    todayLink: { ...typography.caption, color: colors.accent },
    container: { padding: spacing.lg, gap: spacing.md },
    error: { ...typography.caption, color: colors.flagRed, textAlign: 'center' },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    sectionTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: spacing.sm },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    players: { flex: 1, gap: 4 },
    playerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    playerName: { ...typography.bodySemiBold, flex: 1 },
    vs: { ...typography.caption, color: colors.muted, marginLeft: 34 },
    rowRight: { alignItems: 'flex-end', gap: 4, maxWidth: 130 },
    resultText: { ...typography.bodySemiBold, color: colors.ink, textAlign: 'right' },
    statusChip: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    statusChipLive: { backgroundColor: colors.accent },
    statusChipText: { ...typography.caption, color: colors.muted },
    statusChipTextLive: { color: colors.onAccent, fontWeight: '700' },
    meta: { ...typography.caption, color: colors.muted, textAlign: 'right' },
    mineTag: { ...typography.caption, color: colors.accent, fontSize: 11 },
  });
}
