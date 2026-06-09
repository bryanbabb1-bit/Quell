import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { SkeletonCard, Avatar } from '@/components/ui';
import type { MyRecord, LeaderboardEntry, Outcome } from '@/types';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

export default function RecordScreen() {
  const api = useApi();
  const { userId } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [record, setRecord] = useState<MyRecord | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [rec, lb] = await Promise.all([api.getMyRecord(), api.getLeaderboard()]);
      setRecord(rec);
      setBoard(lb.entries);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your record.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

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

        {/* Record summary */}
        <View style={styles.statRow}>
          <Stat label="Won" value={record?.wins ?? 0} accent={colors.fairway} />
          <Stat label="Lost" value={record?.losses ?? 0} accent={colors.flagRed} />
          <Stat label="Halved" value={record?.ties ?? 0} accent={colors.muted} />
        </View>
        <View style={styles.subRow}>
          <Text style={styles.subItem}>{record?.played ?? 0} played</Text>
          <Text style={styles.subDot}>·</Text>
          <Text style={styles.subItem}>{record?.win_pct ?? 0}% win rate</Text>
        </View>

        <View style={styles.streakCard}>
          <Ionicons
            name={streak?.type === 'win' ? 'flame' : streak?.type === 'loss' ? 'snow-outline' : 'remove-outline'}
            size={20}
            color={streak?.type === 'win' ? colors.fairway : streak?.type === 'loss' ? colors.flagRed : colors.muted}
          />
          <Text style={styles.streakLabel}>Current streak</Text>
          <Text style={styles.streakValue}>{streakText}</Text>
        </View>

        {/* Recent results */}
        <Text style={styles.sectionTitle}>Recent results</Text>
        {record && record.recent.length > 0 ? (
          <View style={styles.card}>
            {record.recent.map((r, i) => (
              <TouchableOpacity
                key={r.match_id}
                style={[styles.resultRow, i > 0 && styles.rowDivider]}
                onPress={() => router.push(`/(app)/match/${r.match_id}`)}
              >
                <OutcomeChip outcome={r.outcome} />
                <Avatar name={r.opponent_name} size={32} />
                <View style={styles.resultMid}>
                  <Text style={styles.vsName}>vs {r.opponent_name}</Text>
                  <Text style={styles.resultCourse}>{r.course_name}</Text>
                </View>
                {r.final_delta && <Text style={styles.resultDelta}>{r.final_delta}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyNote}>No completed matches yet. Win one and it shows up here.</Text>
        )}

        {/* Leaderboard */}
        <Text style={styles.sectionTitle}>Leaderboard</Text>
        {board.length > 0 ? (
          <View style={styles.card}>
            <View style={[styles.lbRow, styles.lbHead]}>
              <Text style={[styles.lbRank, styles.lbHeadText]}>#</Text>
              <Text style={[styles.lbName, styles.lbHeadText]}>Player</Text>
              <Text style={[styles.lbWl, styles.lbHeadText]}>W–L–H</Text>
              <Text style={[styles.lbPct, styles.lbHeadText]}>Win%</Text>
            </View>
            {board.map((e, i) => (
              <View key={e.user_id} style={[styles.lbRow, styles.rowDivider, e.is_me && styles.lbMine]}>
                <Text style={styles.lbRank}>{i + 1}</Text>
                <Avatar name={e.name} size={26} />
                <Text style={[styles.lbName, e.is_me && styles.lbMineText]} numberOfLines={1}>
                  {e.is_me ? 'You' : e.name}
                </Text>
                <Text style={styles.lbWl}>{e.wins}–{e.losses}–{e.ties}</Text>
                <Text style={styles.lbPct}>{e.win_pct}%</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyNote}>No completed matches across the club yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  statRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.lg },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.title, fontSize: 34 },
  statLabel: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  subRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  subItem: { ...typography.body, color: colors.muted },
  subDot: { color: colors.muted },
  streakCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  streakLabel: { ...typography.body, color: colors.muted, flex: 1 },
  streakValue: { ...typography.bodySemiBold },
  sectionTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  resultMid: { flex: 1 },
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
