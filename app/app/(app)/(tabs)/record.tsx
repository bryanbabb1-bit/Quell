import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { useCourses } from '@/store/useCourseStore';
import { useUserStore } from '@/store/useUserStore';
import { useFavorites } from '@/store/useFavoritesStore';
import { SkeletonCard, Avatar } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { formatHandicap } from '@/lib/format';
import type { MyRecord, LeaderboardEntry, Outcome, Rival, CourseForm } from '@/types';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

export default function RecordScreen() {
  const api = useApi();
  const { userId } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const user = useUserStore((s) => s.user);
  const [record, setRecord] = useState<MyRecord | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'home' | 'global'>('global');
  const [homeName, setHomeName] = useState<string | null>(null);
  const { list: favorites, load: loadFavs, isFavorite, toggle: toggleFav } = useFavorites();
  useEffect(() => { loadFavs(); }, [loadFavs]);

  // Resolve the home course name and default the board to home-course standings.
  const { courses, load: loadCourses } = useCourses();
  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => {
    const hid = user?.home_course_id;
    if (!hid) { setHomeName(null); setScope('global'); return; }
    if (!courses) return;
    const n = courses.find((x) => x.id === hid)?.name ?? null;
    setHomeName(n);
    if (n) setScope('home');
  }, [user, courses]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const courseParam = scope === 'home' ? (homeName ?? undefined) : undefined;
      const [rec, lb] = await Promise.all([api.getMyRecord(), api.getLeaderboard(courseParam)]);
      setRecord(rec);
      setBoard(lb.entries);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your record.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, scope, homeName]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.container}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  const streak = record?.current_streak;
  const streakText =
    streak && streak.type !== 'none' && streak.count > 0
      ? `${streak.count} ${streak.type === 'win' ? 'win' : 'loss'}${streak.count > 1 ? 's' : ''} in a row`
      : '—';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.fairway} />}
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {/* ── HERO: the record as a broadcast graphic ── */}
        <View style={styles.hero}>
          <LinearGradient
            colors={[colors.surfaceRaised, colors.surface]}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.heroLabel}>Career record</Text>
          <View style={styles.heroTallyRow}>
            <View style={styles.heroTallyCol}>
              <Text style={[styles.heroNum, { color: colors.win }]}>{record?.wins ?? 0}</Text>
              <Text style={styles.heroNumLabel}>W</Text>
            </View>
            <Text style={styles.heroDash}>–</Text>
            <View style={styles.heroTallyCol}>
              <Text style={[styles.heroNum, { color: colors.loss }]}>{record?.losses ?? 0}</Text>
              <Text style={styles.heroNumLabel}>L</Text>
            </View>
            <Text style={styles.heroDash}>–</Text>
            <View style={styles.heroTallyCol}>
              <Text style={[styles.heroNum, { color: colors.muted }]}>{record?.ties ?? 0}</Text>
              <Text style={styles.heroNumLabel}>H</Text>
            </View>
          </View>

          {/* Win-rate bar */}
          <View style={styles.rateRow}>
            <View style={styles.rateTrack}>
              <View style={[styles.rateFill, { width: `${record?.win_pct ?? 0}%` }]} />
            </View>
            <Text style={styles.rateText}>{record?.win_pct ?? 0}%</Text>
          </View>

          <View style={styles.heroFootRow}>
            {/* Streak chip */}
            <View style={[styles.streakChip, streak?.type === 'win' && (streak?.count ?? 0) >= 3 && styles.streakChipHot]}>
              <Ionicons
                name={streak?.type === 'win' ? 'flame' : streak?.type === 'loss' ? 'trending-down' : 'remove-outline'}
                size={14}
                color={streak?.type === 'win' ? ((streak?.count ?? 0) >= 3 ? colors.gold : colors.win) : streak?.type === 'loss' ? colors.loss : colors.muted}
              />
              <Text style={styles.streakChipText}>{streakText === '—' ? 'No streak' : streakText}</Text>
            </View>
            {/* Form guide — last 5, newest first */}
            {record && record.recent.length > 0 && (
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Form</Text>
                {record.recent.slice(0, 5).map((r, i) => (
                  <View key={r.match_id} style={[styles.formChip,
                    r.outcome === 'win' ? { backgroundColor: colors.win } : r.outcome === 'loss' ? { backgroundColor: colors.loss } : { backgroundColor: colors.halve },
                    i === 0 && styles.formChipLatest]}>
                    <Text style={styles.formChipText}>{r.outcome === 'win' ? 'W' : r.outcome === 'loss' ? 'L' : 'H'}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Career bests — only once there's something to brag about */}
          {record && (record.played > 0) && (
            <View style={styles.bestsRow}>
              <View style={styles.bestCell}>
                <Text style={styles.bestNum}>{record.played}</Text>
                <Text style={styles.bestLabel}>Played</Text>
              </View>
              <View style={styles.bestDivider} />
              <View style={styles.bestCell}>
                <Text style={styles.bestNum}>{record.longest_win_streak ?? 0}</Text>
                <Text style={styles.bestLabel}>Best streak</Text>
              </View>
              <View style={styles.bestDivider} />
              <View style={styles.bestCell}>
                <Text style={styles.bestNum} numberOfLines={1}>{record.best_win?.final_delta ?? '—'}</Text>
                <Text style={styles.bestLabel}>Biggest win</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Milestones — earned in gold, the rest show what's next ── */}
        {record && record.played > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow}>
            {milestonesFor(record).map((b) => (
              <View key={b.key} style={[styles.badge, b.earned ? styles.badgeEarned : null]}>
                <Ionicons name={b.icon as any} size={14} color={b.earned ? colors.gold : colors.muted} />
                <Text style={[styles.badgeText, b.earned && styles.badgeTextEarned]}>{b.label}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── Rivalries — your most-played head-to-heads ── */}
        {record && (record.rivals?.length ?? 0) > 0 && (
          <>
            <Text style={styles.sectionTitle}>Rivalries</Text>
            <View style={styles.card}>
              {record.rivals!.map((r, i) => (
                <RivalRow key={r.user_id} rival={r} divider={i > 0} colors={colors} styles={styles} />
              ))}
            </View>
          </>
        )}

        {/* Recent results */}
        <Text style={styles.sectionTitle}>Recent results</Text>
        {record && record.recent.length > 0 ? (
          <View style={styles.card}>
            {record.recent.map((r, i) => (
              <TouchableOpacity
                key={r.match_id}
                style={[styles.resultRow, i > 0 && styles.rowDivider]}
                onPress={() => { haptics.select(); router.push(`/(app)/match/${r.match_id}`); }}
              >
                <OutcomeChip outcome={r.outcome} />
                <Avatar name={r.opponent_name} size={32} photoUrl={r.opponent_photo_url} />
                <View style={styles.resultMid}>
                  <Text style={styles.vsName}>vs {r.opponent_name}</Text>
                  <Text style={styles.resultCourse}>{r.course_name}</Text>
                </View>
                {r.final_delta && <Text style={styles.resultDelta}>{r.final_delta}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyNote}>No completed matches yet — your results will show here.</Text>
        )}

        {/* ── Course form — where you win ── */}
        {record && (record.courses?.length ?? 0) > 0 && (
          <>
            <Text style={styles.sectionTitle}>Course form</Text>
            <View style={styles.card}>
              {record.courses!.map((c, i) => <CourseFormRow key={c.course_name} c={c} divider={i > 0} colors={colors} styles={styles} />)}
            </View>
          </>
        )}

        {/* Favorites */}
        {favorites.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Favorites</Text>
            <View style={styles.card}>
              {favorites.map((f, i) => (
                <View key={f.user_id} style={[styles.favRow, i > 0 && styles.rowDivider]}>
                  <TouchableOpacity style={styles.favTap} activeOpacity={0.7} onPress={() => router.push(`/(app)/player/${f.user_id}`)}>
                    <Avatar name={f.name} size={32} photoUrl={f.photo_url} />
                    <View style={styles.favMid}>
                      <Text style={styles.vsName}>{f.name}</Text>
                      <Text style={styles.resultCourse}>Index {formatHandicap(f.handicap)}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.challengeBtn}
                    onPress={() => router.push(`/(app)/create?opponent_id=${f.user_id}&opponent_name=${encodeURIComponent(f.name)}`)}
                  >
                    <Ionicons name="flash" size={14} color={colors.onAccent} />
                    <Text style={styles.challengeBtnText}>Challenge</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Leaderboard */}
        <View style={styles.lbHeader}>
          <Text style={styles.sectionTitle}>Leaderboard</Text>
          {homeName ? (
            <View style={styles.scopeToggle}>
              <TouchableOpacity onPress={() => setScope('home')} style={[styles.scopeBtn, scope === 'home' && styles.scopeActive]}>
                <Text style={[styles.scopeText, scope === 'home' && styles.scopeTextActive]}>Home</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setScope('global')} style={[styles.scopeBtn, scope === 'global' && styles.scopeActive]}>
                <Text style={[styles.scopeText, scope === 'global' && styles.scopeTextActive]}>Global</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        {scope === 'home' && homeName ? <Text style={styles.scopeSub}>{homeName}</Text> : null}
        {board.length > 0 ? (
          <View style={styles.card}>
            <View style={[styles.lbRow, styles.lbHead]}>
              <Text style={[styles.lbRank, styles.lbHeadText]}>#</Text>
              <Text style={[styles.lbName, styles.lbHeadText]}>Player</Text>
              <Text style={[styles.lbWl, styles.lbHeadText]}>W–L–H</Text>
              <Text style={[styles.lbPct, styles.lbHeadText]}>Win%</Text>
            </View>
            {board.map((e, i) => (
              <TouchableOpacity
                key={e.user_id}
                style={[styles.lbRow, styles.rowDivider, e.is_me && styles.lbMine]}
                activeOpacity={0.7}
                disabled={e.is_me}
                onPress={() => { haptics.select(); router.push(`/(app)/player/${e.user_id}`); }}
              >
                <Text style={styles.lbRank}>{i + 1}</Text>
                <Avatar name={e.name} size={26} photoUrl={e.photo_url} />
                <Text style={[styles.lbName, e.is_me && styles.lbMineText]} numberOfLines={1}>
                  {e.is_me ? 'You' : e.name}
                </Text>
                <Text style={styles.lbWl}>{e.wins}–{e.losses}–{e.ties}</Text>
                <Text style={styles.lbPct}>{e.win_pct}%</Text>
                {e.is_me ? <View style={styles.lbStar} /> : (
                  <TouchableOpacity style={styles.lbStar} hitSlop={8} onPress={() => { haptics.select(); toggleFav(e.user_id, { name: e.name, handicap: null }); }}>
                    <Ionicons name={isFavorite(e.user_id) ? 'star' : 'star-outline'} size={16} color={isFavorite(e.user_id) ? colors.gold : colors.muted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyNote}>
            {scope === 'home' && homeName ? `No completed matches at ${homeName} yet.` : 'No completed matches across the club yet.'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Milestones — derived entirely from the record rollups; no extra requests.
function milestonesFor(record: MyRecord): { key: string; label: string; icon: string; earned: boolean }[] {
  const longest = record.longest_win_streak ?? 0;
  const bestMargin = Number(record.best_win?.final_delta?.match(/^(\d+)/)?.[1] ?? 0);
  const coursesPlayed = record.courses?.length ?? 0;
  return [
    { key: 'first_win', label: 'First win', icon: 'trophy-outline', earned: record.wins >= 1 },
    { key: 'five_wins', label: '5 wins', icon: 'ribbon-outline', earned: record.wins >= 5 },
    { key: 'regular', label: '10 played', icon: 'calendar-outline', earned: record.played >= 10 },
    { key: 'streak3', label: '3-win streak', icon: 'flame-outline', earned: longest >= 3 },
    { key: 'statement', label: 'Won by 4+', icon: 'flash-outline', earned: bestMargin >= 4 },
    { key: 'traveler', label: '3 courses', icon: 'map-outline', earned: coursesPlayed >= 3 },
  ];
}

// "You lead 3–1" / "Sam leads 2–1" / "All square 2–2", halves noted separately.
function rivalrySeriesLine(r: Rival): string {
  const first = r.name.split(' ')[0] || r.name;
  const base = r.wins > r.losses ? `You lead ${r.wins}–${r.losses}`
    : r.losses > r.wins ? `${first} leads ${r.losses}–${r.wins}`
    : `All square ${r.wins}–${r.losses}`;
  return r.ties > 0 ? `${base} · ${r.ties} halved` : base;
}

function RivalRow({ rival, divider, colors, styles }: {
  rival: Rival; divider: boolean; colors: ReturnType<typeof useColors>; styles: ReturnType<typeof makeStyles>;
}) {
  const leading = rival.wins > rival.losses;
  const trailing = rival.losses > rival.wins;
  return (
    <View style={[styles.favRow, divider && styles.rowDivider]}>
      <TouchableOpacity style={styles.favTap} activeOpacity={0.7} onPress={() => { haptics.select(); router.push(`/(app)/player/${rival.user_id}`); }}>
        <Avatar name={rival.name} size={36} photoUrl={rival.photo_url} />
        <View style={styles.favMid}>
          <Text style={styles.vsName}>{rival.name}</Text>
          <Text style={[styles.rivalSeries, leading && { color: colors.win }, trailing && { color: colors.loss }]}>
            {rivalrySeriesLine(rival)}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.challengeBtn}
        onPress={() => { haptics.select(); router.push(`/(app)/create?opponent_id=${rival.user_id}&opponent_name=${encodeURIComponent(rival.name)}`); }}
      >
        <Ionicons name="flash" size={14} color={colors.onAccent} />
        <Text style={styles.challengeBtnText}>Rematch</Text>
      </TouchableOpacity>
    </View>
  );
}

function CourseFormRow({ c, divider, colors, styles }: {
  c: CourseForm; divider: boolean; colors: ReturnType<typeof useColors>; styles: ReturnType<typeof makeStyles>;
}) {
  const decided = c.wins + c.losses;
  const pct = decided > 0 ? Math.round((c.wins / decided) * 100) : 0;
  return (
    <View style={[styles.courseRow, divider && styles.rowDivider]}>
      <View style={styles.courseMid}>
        <Text style={styles.vsName} numberOfLines={1}>{c.course_name}</Text>
        <View style={styles.courseBarTrack}>
          <View style={[styles.courseBarFill, { width: `${pct}%` }]} />
        </View>
      </View>
      <Text style={styles.courseWl}>{c.wins}–{c.losses}–{c.ties}</Text>
    </View>
  );
}

function OutcomeChip({ outcome }: { outcome: Outcome }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const map = {
    win: { t: 'W', bg: colors.accent, fg: colors.onAccent },
    loss: { t: 'L', bg: colors.loss, fg: colors.bg },
    tie: { t: 'H', bg: colors.halve, fg: colors.bg },
  }[outcome];
  return <View style={[styles.chip, { backgroundColor: map.bg }]}><Text style={[styles.chipText, { color: map.fg }]}>{map.t}</Text></View>;
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.md },
  error: { ...typography.caption, color: colors.flagRed, textAlign: 'center' },
  // Hero — the record as a broadcast graphic.
  hero: {
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: spacing.md, overflow: 'hidden',
  },
  heroLabel: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 1.2, color: colors.muted },
  heroTallyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  heroTallyCol: { alignItems: 'center', minWidth: 64 },
  heroNum: { ...typography.title, fontSize: 44, lineHeight: 50 },
  heroNumLabel: { ...typography.caption, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: colors.muted },
  heroDash: { ...typography.title, fontSize: 28, color: colors.border, marginBottom: 14 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rateTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 3, backgroundColor: colors.win },
  rateText: { ...typography.bodySemiBold, color: colors.text, minWidth: 40, textAlign: 'right' },
  heroFootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  streakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surfaceRaised, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  streakChipHot: { backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.gold },
  streakChipText: { ...typography.caption, color: colors.text, fontWeight: '700' },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  formLabel: { ...typography.caption, color: colors.muted, marginRight: 2 },
  // Career bests strip inside the hero
  bestsRow: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  bestCell: { flex: 1, alignItems: 'center', gap: 2 },
  bestDivider: { width: 1, height: 26, backgroundColor: colors.border },
  bestNum: { ...typography.bodySemiBold, fontSize: 18, color: colors.text },
  bestLabel: { ...typography.caption, fontSize: 11, color: colors.muted },
  // Milestone badges
  badgeRow: { gap: spacing.sm, paddingRight: spacing.lg },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  badgeEarned: { backgroundColor: colors.goldGlow, borderColor: colors.gold },
  badgeText: { ...typography.caption, fontSize: 12, color: colors.muted },
  badgeTextEarned: { color: colors.text, fontWeight: '700' },
  // Rivalries
  rivalSeries: { ...typography.caption, fontWeight: '600' },
  // Course form
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  courseMid: { flex: 1, gap: 6 },
  courseBarTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  courseBarFill: { height: '100%', borderRadius: 2, backgroundColor: colors.win },
  courseWl: { ...typography.bodySemiBold, color: colors.text, fontVariant: ['tabular-nums'] },
  formChip: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', opacity: 0.75 },
  formChipLatest: { opacity: 1, transform: [{ scale: 1.15 }] },
  formChipText: { ...typography.caption, fontSize: 11, color: colors.bg, fontWeight: '800' },
  sectionTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  lbHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  scopeToggle: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, padding: 2 },
  scopeBtn: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  scopeActive: { backgroundColor: colors.accent },
  scopeText: { ...typography.caption, color: colors.muted },
  scopeTextActive: { color: colors.onAccent, fontWeight: '700' },
  scopeSub: { ...typography.caption, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  resultMid: { flex: 1 },
  favRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  favTap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  favMid: { flex: 1 },
  lbStar: { width: 20, alignItems: 'center' },
  challengeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  challengeBtnText: { ...typography.caption, color: colors.onAccent, fontWeight: '700' },
  vsName: { ...typography.bodySemiBold },
  resultCourse: { ...typography.caption },
  resultDelta: { ...typography.bodySemiBold, color: colors.ink },
  chip: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  chipText: { ...typography.bodySemiBold, fontSize: 14 },
  emptyNote: { ...typography.caption, color: colors.muted },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.sm },
  lbHead: { backgroundColor: colors.paper },
  lbHeadText: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  lbMine: { backgroundColor: colors.fairwaySoft },
  lbMineText: { color: colors.fairway, fontWeight: '700' },
  lbRank: { width: 22, ...typography.bodySemiBold, color: colors.muted },
  lbName: { flex: 1, ...typography.body },
  lbWl: { width: 72, textAlign: 'center', ...typography.body },
  lbPct: { width: 48, textAlign: 'right', ...typography.bodySemiBold },
  });
}
