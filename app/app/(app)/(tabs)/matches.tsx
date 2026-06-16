import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView,
  RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { useArchiveStore } from '@/store/useArchiveStore';
import { useResultsStore } from '@/store/useResultsStore';
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { ForfeitClock } from '@/components/ForfeitClock';
import { isPendingForfeit } from '@/lib/forfeit';
import { haptics } from '@/lib/haptics';
import type { Match } from '@/types';
import { MATCH_TYPE_LABELS } from '@/types';
import { spacing, radius, typography, fonts, type Palette } from '@/constants/theme';
import { formatPlayWhen, STATUS_LABELS } from '@/lib/format';

// Matches that can be archived out of the list (the record keeps them).
const TERMINAL = ['completed', 'cancelled', 'declined', 'expired'];

// Filter chips for the active list — by where the match is in its life.
const CATS: { k: string; label: string; test: (m: Match) => boolean }[] = [
  { k: 'all', label: 'All', test: () => true },
  { k: 'pending', label: 'Challenges', test: (m) => m.status === 'pending' },
  { k: 'upcoming', label: 'Upcoming', test: (m) => m.status === 'open' || m.status === 'accepted' },
  { k: 'live', label: 'Live', test: (m) => m.status === 'in_progress' },
  { k: 'final', label: 'Final', test: (m) => m.status === 'completed' },
];

const statusTint = (c: Palette): Record<string, string> => ({
  open: c.muted,
  pending: c.accent,
  accepted: c.accent,
  in_progress: c.accent,
  completed: c.text,
  declined: c.loss,
  cancelled: c.loss,
  expired: c.muted,
});

// The other player's name relative to the viewer (null for open matches).
function opponentOf(m: Match, userId: string | null | undefined): string | null {
  if (!m.opponent_id) return null;
  return (m.creator_id === userId ? m.opponent_name : m.creator_name) ?? null;
}

// The trailing chip on a match row. Completed matches show the RESULT once the
// player has watched the reveal ("Won 3 & 2" / "Lost 2 & 1" / "Halved"); before
// that, an accent "Reveal ready" prompt that doesn't spoil it. Everything else
// shows the status badge.
function renderTrailing(
  m: Match, userId: string | null | undefined, seen: string[],
  colors: Palette, styles: ReturnType<typeof makeStyles>,
) {
  if (m.status === 'completed') {
    if (m.is_forfeit) {
      const won = m.outcome === 'win';
      return (
        <View style={[styles.resultChip, { backgroundColor: won ? colors.winGlow : colors.lossGlow }]}>
          <Text style={[styles.resultText, { color: won ? colors.win : colors.loss }]}>{won ? 'Won' : 'Lost'} · forfeit</Text>
        </View>
      );
    }
    if (!seen.includes(m.id)) {
      return (
        <View style={[styles.resultChip, { backgroundColor: colors.accentGlow }]}>
          <Ionicons name="play-circle" size={13} color={colors.accent} />
          <Text style={[styles.resultText, { color: colors.accent }]}>Reveal ready</Text>
        </View>
      );
    }
    const o = m.outcome;
    const tone = o === 'win' ? colors.win : o === 'loss' ? colors.loss : colors.halve;
    const glow = o === 'win' ? colors.winGlow : o === 'loss' ? colors.lossGlow : colors.halveGlow;
    const label = o === 'tie' ? `Halved${m.final_delta ? ` ${m.final_delta}` : ''}`
      : `${o === 'win' ? 'Won' : 'Lost'}${m.final_delta ? ` ${m.final_delta}` : ''}`;
    return (
      <View style={[styles.resultChip, { backgroundColor: glow }]}>
        <Text style={[styles.resultText, { color: tone }]} numberOfLines={1}>{label}</Text>
      </View>
    );
  }
  const tint: Record<string, string> = statusTint(colors);
  return (
    <View style={[styles.badge, { borderColor: tint[m.status] ?? colors.muted }]}>
      <Text style={[styles.badgeText, { color: tint[m.status] ?? colors.muted }]}>{STATUS_LABELS[m.status]}</Text>
    </View>
  );
}

// For a pending-forfeit match, the card countdown's label + tone from the
// viewer's perspective (you posted → they're on the clock, and vice versa).
function forfeitClockProps(
  m: Match, userId: string | null | undefined,
): { label: string; tone: 'wait' | 'act' } | null {
  if (!isPendingForfeit(m)) return null;
  const amCreator = m.creator_id === userId;
  const mySub = amCreator ? !!m.creator_scorecard_id : !!m.opponent_scorecard_id;
  const theirSub = amCreator ? !!m.opponent_scorecard_id : !!m.creator_scorecard_id;
  if (mySub && !theirSub) return { label: 'They forfeit in', tone: 'wait' };
  if (!mySub && theirSub) return { label: 'You forfeit in', tone: 'act' };
  return { label: 'Expires in', tone: 'act' };
}

export default function MyMatchesScreen() {
  const api = useApi();
  const { userId } = useAuth();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState('all');

  const archived = useArchiveStore((s) => s.archived);
  const toggleArchive = useArchiveStore((s) => s.toggle);
  const hydrateArchive = useArchiveStore((s) => s.hydrate);
  useEffect(() => { hydrateArchive(); }, [hydrateArchive]);

  // Whether the player has watched a match's reveal yet — gates the result line
  // so the list never spoils a result they haven't seen unfold.
  const seen = useResultsStore((s) => s.seen);
  const hydrateSeen = useResultsStore((s) => s.hydrate);
  useEffect(() => { hydrateSeen(); }, [hydrateSeen]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { matches } = await api.myMatches();
      setMatches(matches);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your matches.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const archivedSet = useMemo(() => new Set(archived), [archived]);
  const cat = useMemo(() => CATS.find((c) => c.k === filter) ?? CATS[0], [filter]);
  const visible = useMemo(
    // Archive split first; the status filter applies only to the ACTIVE list.
    () => matches.filter((m) => (showArchived ? archivedSet.has(m.id) : !archivedSet.has(m.id) && cat.test(m))),
    [matches, archivedSet, showArchived, cat],
  );
  const archivedCount = useMemo(
    () => matches.filter((m) => archivedSet.has(m.id)).length,
    [matches, archivedSet],
  );

  // Long-press to archive a finished match (or restore an archived one).
  const onLongPress = (m: Match) => {
    const isArchived = archivedSet.has(m.id);
    if (isArchived) {
      Alert.alert('Restore match', 'Move this back into My Matches?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => { haptics.medium(); toggleArchive(m.id); } },
      ]);
    } else if (TERMINAL.includes(m.status)) {
      Alert.alert('Archive match', 'Hide this from My Matches? It stays in your record.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => { haptics.medium(); toggleArchive(m.id); } },
      ]);
    } else {
      Alert.alert('Still active', 'Only finished matches can be archived.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.list}><SkeletonCard /><SkeletonCard /><SkeletonCard /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={visible}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        ListHeaderComponent={
          <>
            {!showArchived && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {CATS.map((cIt) => {
                  const active = filter === cIt.k;
                  return (
                    <TouchableOpacity key={cIt.k} onPress={() => { haptics.select(); setFilter(cIt.k); }} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{cIt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {archivedCount > 0 && (
              <TouchableOpacity style={styles.archiveToggle} onPress={() => { haptics.select(); setShowArchived((v) => !v); }}>
                <Ionicons name={showArchived ? 'arrow-back' : 'archive-outline'} size={15} color={colors.muted} />
                <Text style={styles.archiveToggleText}>{showArchived ? 'Back to active matches' : `View archived (${archivedCount})`}</Text>
              </TouchableOpacity>
            )}
          </>
        }
        ListEmptyComponent={
          error
            ? <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />
            : showArchived
              ? <EmptyState icon="archive-outline" title="Nothing archived" message="Long-press a finished match to archive it." />
              : filter !== 'all'
                ? <EmptyState icon="filter-outline" title={`No ${cat.label.toLowerCase()} matches`} message="Try a different filter above." />
                : <EmptyState icon="list-outline" title="No matches yet" message="Post a match or accept one from Discovery." actionLabel="Post a match" onAction={() => router.push('/(app)/create')} />
        }
        renderItem={({ item }) => {
          const fc = forfeitClockProps(item, userId);
          return (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/(app)/match/${item.id}`)}
            onLongPress={() => onLongPress(item)}
            delayLongPress={350}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.course}>
                {opponentOf(item, userId) ? `vs ${opponentOf(item, userId)}` : item.course_name}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {opponentOf(item, userId)
                  ? `${item.course_name} · ${formatPlayWhen(item.play_date)}`
                  : `Open · ${formatPlayWhen(item.play_date)} · ${MATCH_TYPE_LABELS[item.match_type]}`}
              </Text>
              {fc && <ForfeitClock playDate={item.play_date} label={fc.label} tone={fc.tone} />}
            </View>
            {renderTrailing(item, userId, seen, colors, styles)}
          </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.paper },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
    list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: radius.md, padding: spacing.md,
    },
    course: { ...typography.bodySemiBold },
    sub: { ...typography.caption },
    badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    badgeText: { fontSize: 12, fontFamily: fonts.bodyBold },
    resultChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, maxWidth: 130 },
    resultText: { ...typography.caption, fontSize: 12, fontFamily: fonts.bodyBold, fontVariant: ['tabular-nums'] },
    archiveToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.xs },
    archiveToggleText: { ...typography.caption, color: colors.muted },
    filterRow: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.md },
    chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.accentGlow, borderColor: colors.accent },
    chipText: { ...typography.caption, color: colors.muted, fontFamily: fonts.bodySemi },
    chipTextActive: { color: colors.accent },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.xl * 2 },
    emptyTitle: { ...typography.heading, color: colors.muted },
    emptyHint: { ...typography.caption, textAlign: 'center', maxWidth: 260 },
  });
}
