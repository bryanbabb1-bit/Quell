import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { useCourses } from '@/store/useCourseStore';
import { useUserStore } from '@/store/useUserStore';
import { CourseSelect } from '@/components/CourseSelect';
import { ConfirmIndexSheet } from '@/components/ConfirmIndexSheet';
import { AcceptCelebration } from '@/components/AcceptCelebration';
import { Avatar, EmptyState } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { formatHandicap } from '@/lib/format';
import { MATCH_TYPE_LABELS } from '@/types';
import type { CourseFeedMatch, CourseSummary, OpenInvite, CoursePulse, ClubSummary } from '@/types';
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
  const [open, setOpen] = useState<OpenInvite[]>([]);
  const [pulse, setPulse] = useState<CoursePulse | null>(null);
  const [club, setClub] = useState<ClubSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [showAllOpen, setShowAllOpen] = useState(false);
  // Accept-from-feed (same choreography as the Discovery deck): confirm the
  // index first — it's locked onto the match — then accept + celebrate.
  const [pendingAccept, setPendingAccept] = useState<OpenInvite | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);

  // Default the feed to the player's home course (once the catalog resolves).
  const { courses, load: loadCourses } = useCourses();
  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => {
    const hid = user?.home_course_id;
    if (!hid || course || !courses) return;
    const n = courses.find((x) => x.id === hid)?.name ?? null;
    if (n) setCourse(n);
  }, [user, courses, course]);

  const load = useCallback(async () => {
    if (!course) { setLoading(false); return; }
    try {
      setError(null);
      const r = await api.courseFeed(course, date, isoToday());
      setRows(r.matches);
      setOpen(r.open ?? []);
      setPulse(r.pulse ?? null);
      setClub(r.club ?? null);
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
  // Matches can only be posted 14 days out — navigating past that is dead air.
  const maxDate = shiftIso(isoToday(), 14);
  const atMax = date >= maxDate;
  const visibleOpen = showAllOpen ? open : open.slice(0, 4);

  const onPickCourse = (c: CourseSummary | null) => {
    setCourse(c?.name ?? null);
    setSwitching(false);
  };

  const doAccept = async (iv: OpenInvite) => {
    try {
      await api.acceptMatch(iv.id);
      setCelebrate(iv.id); // flourish, then navigate (see onDone)
    } catch (e: any) {
      // Most common failure: someone else just claimed it. Refresh the board.
      Alert.alert('Could not accept', e?.message ?? 'Please try again.');
      load();
    }
  };

  const confirmIndexAndAccept = async (index: number) => {
    setSheetBusy(true);
    try {
      const updated = await api.updateMe({ handicap: index });
      useUserStore.setState({ user: updated });
      const iv = pendingAccept;
      setPendingAccept(null);
      if (iv) await doAccept(iv);
    } catch (e: any) {
      Alert.alert('Could not save your index', e?.message ?? 'Please try again.');
    } finally {
      setSheetBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Course header + switcher */}
      <View style={styles.courseHeader}>
        <TouchableOpacity style={styles.courseTitleRow} activeOpacity={0.7} onPress={() => { haptics.select(); setSwitching((s) => !s); }}>
          <Ionicons name="golf-outline" size={18} color={colors.live} />
          <Text style={styles.courseTitle} numberOfLines={1}>{course ?? 'Pick a course'}</Text>
          <Ionicons name={switching ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
        </TouchableOpacity>
        {club?.status === 'network' && (
          <View style={styles.networkBadge}>
            <Ionicons name="shield-checkmark" size={12} color={colors.gold} />
            <Text style={styles.networkBadgeText}>Foretera Club</Text>
          </View>
        )}
      </View>
      {(switching || !course) && (
        <View style={styles.switcher}>
          <CourseSelect valueName={course} onSelect={onPickCourse} placeholder="Search a course…" />
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {/* ── Club pulse — the course's weekly heartbeat ── */}
        {course && pulse && (
          <View style={styles.pulseCard}>
            <View style={styles.pulseCell}>
              <Text style={styles.pulseNum}>{pulse.week_matches}</Text>
              <Text style={styles.pulseLabel}>matches this week</Text>
            </View>
            <View style={styles.pulseDivider} />
            <View style={styles.pulseCell}>
              <Text style={styles.pulseNum}>{pulse.week_players}</Text>
              <Text style={styles.pulseLabel}>players active</Text>
            </View>
            <View style={styles.pulseDivider} />
            <View style={styles.pulseCell}>
              <View style={styles.pulseLiveRow}>
                {pulse.live_now > 0 && <View style={styles.liveDot} />}
                <Text style={[styles.pulseNum, pulse.live_now > 0 && { color: colors.live }]}>{pulse.live_now}</Text>
              </View>
              <Text style={styles.pulseLabel}>live now</Text>
            </View>
          </View>
        )}

        {/* ── Looking for a game — the open network at this course ── */}
        {course && (
          <>
            <View style={styles.sectionHead}>
              <Ionicons name="people-outline" size={14} color={colors.accent} style={{ marginTop: spacing.sm }} />
              <Text style={styles.sectionTitle}>Looking for a game</Text>
              {open.length > 0 && (
                <View style={styles.countBadge}><Text style={styles.countBadgeText}>{open.length}</Text></View>
              )}
            </View>
            {open.length > 0 ? (
              <View style={styles.card}>
                {visibleOpen.map((iv, i) => (
                  <InviteRow
                    key={iv.id} iv={iv} divider={i > 0} colors={colors} styles={styles}
                    onAccept={() => { haptics.select(); setPendingAccept(iv); }}
                  />
                ))}
                {open.length > 4 && (
                  <TouchableOpacity
                    style={[styles.moreRow, styles.rowDivider]}
                    onPress={() => { haptics.select(); setShowAllOpen((s) => !s); }}
                  >
                    <Text style={styles.moreText}>{showAllOpen ? 'Show fewer' : `Show all ${open.length} invites`}</Text>
                    <Ionicons name={showAllOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.openEmpty}>
                <Text style={styles.openEmptyText}>No one's posted an open match yet. Put one up and the club will see it here.</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.postBtn}
              activeOpacity={0.8}
              onPress={() => { haptics.select(); router.push('/(app)/create'); }}
            >
              <Ionicons name="add-circle-outline" size={16} color={colors.onAccent} />
              <Text style={styles.postBtnText}>Post a match</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Around the club — the browsed day's public activity ── */}
        {course && (
          <View style={styles.dateBar}>
            <TouchableOpacity
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              onPress={() => { haptics.select(); setDate((d) => shiftIso(d, -1)); }}
            >
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
            <TouchableOpacity
              hitSlop={10}
              disabled={atMax}
              accessibilityRole="button"
              accessibilityLabel="Next day"
              onPress={() => { haptics.select(); setDate((d) => shiftIso(d, 1)); }}
            >
              <Ionicons name="chevron-forward" size={22} color={atMax ? colors.border : colors.text} />
            </TouchableOpacity>
          </View>
        )}

        {!loading && course && rows.length === 0 && !error && (
          <EmptyState
            icon="newspaper-outline"
            title={`Quiet day at ${course?.split(' ')[0] ?? 'this course'}`}
            message={`No public matches ${onToday ? 'today' : 'on this day'}. Post one as Public and it shows here.`}
          />
        )}

        {live.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <View style={[styles.liveDot, { marginTop: spacing.sm }]} />
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

      <ConfirmIndexSheet
        visible={!!pendingAccept}
        handicap={user?.handicap ?? null}
        updatedAt={user?.handicap_updated_at ?? null}
        actionLabel="Accept match"
        busy={sheetBusy}
        onCancel={() => setPendingAccept(null)}
        onConfirm={confirmIndexAndAccept}
      />

      {celebrate ? (
        <AcceptCelebration onDone={() => { const id = celebrate; setCelebrate(null); router.push(`/(app)/match/${id}`); }} />
      ) : null}
    </SafeAreaView>
  );
}

// One open invite — a member of the network asking for a game. The Accept pill
// runs the confirm-index → accept flow; the card body opens the match detail.
function InviteRow({ iv, divider, colors, styles, onAccept }: {
  iv: OpenInvite; divider: boolean; colors: Palette; styles: ReturnType<typeof makeStyles>;
  onAccept: () => void;
}) {
  const time = timeLabel(iv.play_time);
  const when = [dateLabel(iv.play_date), time].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity
      style={[styles.inviteRow, divider && styles.rowDivider]}
      activeOpacity={0.7}
      onPress={() => { haptics.select(); router.push(`/(app)/match/${iv.id}`); }}
    >
      <Avatar name={iv.creator_name} size={40} photoUrl={iv.creator_photo_url} />
      <View style={styles.inviteMid}>
        <View style={styles.inviteNameRow}>
          <Text style={styles.inviteName} numberOfLines={1}>{iv.creator_name}</Text>
          {iv.creator_handicap_index != null && (
            <Text style={styles.inviteIndex}>{formatHandicap(iv.creator_handicap_index)}</Text>
          )}
        </View>
        <Text style={styles.inviteMeta} numberOfLines={1}>
          {when} · {MATCH_TYPE_LABELS[iv.match_type]}
        </Text>
        <View style={styles.invitePillRow}>
          <View style={styles.invitePill}>
            <Text style={styles.invitePillText}>Index {iv.hcp_range_min}–{iv.hcp_range_max}</Text>
          </View>
          {iv.is_mine && <Text style={styles.mineTag}>Your post</Text>}
        </View>
      </View>
      {!iv.is_mine && (
        <TouchableOpacity style={styles.acceptBtn} activeOpacity={0.8} onPress={onAccept} hitSlop={6}>
          <Ionicons name="flash" size={13} color={colors.onAccent} />
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
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
      marginTop: spacing.md, paddingTop: spacing.sm,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    dateMid: { alignItems: 'center', gap: 2 },
    dateText: { ...typography.bodySemiBold, color: colors.text },
    todayLink: { ...typography.caption, color: colors.accent },
    container: { padding: spacing.lg, gap: spacing.md },
    error: { ...typography.caption, color: colors.flagRed, textAlign: 'center' },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    sectionTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    // Club pulse strip
    pulseCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.surface, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border,
      paddingVertical: spacing.md,
    },
    pulseCell: { flex: 1, alignItems: 'center', gap: 2 },
    pulseDivider: { width: 1, height: 28, backgroundColor: colors.border },
    pulseNum: { ...typography.heading, fontSize: 22, color: colors.text },
    pulseLiveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pulseLabel: { ...typography.caption, fontSize: 11, color: colors.muted },
    countBadge: {
      marginTop: spacing.sm, backgroundColor: colors.accentGlow, borderRadius: radius.pill,
      paddingHorizontal: 8, paddingVertical: 1, minWidth: 20, alignItems: 'center',
    },
    countBadgeText: { ...typography.caption, fontSize: 11, color: colors.accent, fontWeight: '700' },
    // Open invites
    inviteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    inviteMid: { flex: 1, gap: 2 },
    inviteNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    inviteName: { ...typography.bodySemiBold, flexShrink: 1 },
    inviteIndex: { ...typography.caption, color: colors.muted },
    inviteMeta: { ...typography.caption, color: colors.muted },
    invitePillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
    invitePill: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    invitePillText: { ...typography.caption, fontSize: 11, color: colors.muted },
    acceptBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: colors.accent, borderRadius: radius.pill,
      paddingHorizontal: spacing.md, paddingVertical: 6,
    },
    acceptBtnText: { ...typography.caption, fontSize: 12, color: colors.onAccent, fontWeight: '700' },
    networkBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
      backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.gold,
      borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2,
      marginTop: spacing.xs, marginLeft: 26,
    },
    networkBadgeText: { ...typography.caption, fontSize: 11, color: colors.gold, fontWeight: '700' },
    moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
    moreText: { ...typography.caption, color: colors.accent, fontWeight: '600' },
    openEmpty: {
      backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1,
      borderColor: colors.border, borderStyle: 'dashed', padding: spacing.md,
    },
    openEmptyText: { ...typography.caption, color: colors.muted, textAlign: 'center' },
    postBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: colors.accent, borderRadius: radius.pill,
      paddingVertical: spacing.sm + 2, marginTop: spacing.xs,
    },
    postBtnText: { ...typography.bodySemiBold, fontSize: 14, color: colors.onAccent },
    // Day activity rows
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    players: { flex: 1, gap: 4 },
    playerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    playerName: { ...typography.bodySemiBold, flex: 1 },
    vs: { ...typography.caption, color: colors.muted, marginLeft: 34 },
    rowRight: { alignItems: 'flex-end', gap: 4, maxWidth: 130 },
    resultText: { ...typography.bodySemiBold, color: colors.ink, textAlign: 'right' },
    statusChip: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    statusChipLive: { backgroundColor: colors.live },
    statusChipText: { ...typography.caption, color: colors.muted },
    statusChipTextLive: { color: colors.scheme === 'dark' ? colors.bg : '#FFFFFF', fontWeight: '700' },
    meta: { ...typography.caption, color: colors.muted, textAlign: 'right' },
    mineTag: { ...typography.caption, color: colors.live, fontSize: 11 },
  });
}
