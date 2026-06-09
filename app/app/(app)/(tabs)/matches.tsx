import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { useArchiveStore } from '@/store/useArchiveStore';
import { SkeletonCard, EmptyState, ErrorState } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import type { Match } from '@/types';
import { MATCH_TYPE_LABELS } from '@/types';
import { spacing, radius, typography, type Palette } from '@/constants/theme';
import { formatPlayWhen, STATUS_LABELS } from '@/lib/format';

// Matches that can be archived out of the list (the record keeps them).
const TERMINAL = ['completed', 'cancelled', 'declined'];

const statusTint = (c: Palette): Record<string, string> => ({
  open: c.muted,
  accepted: c.accent,
  in_progress: c.accent,
  completed: c.text,
  declined: c.loss,
  cancelled: c.loss,
});

export default function MyMatchesScreen() {
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tint = useMemo(() => statusTint(colors), [colors]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const archived = useArchiveStore((s) => s.archived);
  const toggleArchive = useArchiveStore((s) => s.toggle);
  const hydrateArchive = useArchiveStore((s) => s.hydrate);
  useEffect(() => { hydrateArchive(); }, [hydrateArchive]);

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
  const visible = useMemo(
    () => matches.filter((m) => (showArchived ? archivedSet.has(m.id) : !archivedSet.has(m.id))),
    [matches, archivedSet, showArchived],
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
          archivedCount > 0 ? (
            <TouchableOpacity style={styles.archiveToggle} onPress={() => { haptics.select(); setShowArchived((v) => !v); }}>
              <Ionicons name={showArchived ? 'arrow-back' : 'archive-outline'} size={15} color={colors.muted} />
              <Text style={styles.archiveToggleText}>{showArchived ? 'Back to active matches' : `View archived (${archivedCount})`}</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          error
            ? <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />
            : showArchived
              ? <EmptyState icon="archive-outline" title="Nothing archived" message="Long-press a finished match to archive it." />
              : <EmptyState icon="list-outline" title="No matches yet" message="Post a match or accept one from Discovery." actionLabel="Post a match" onAction={() => router.push('/(app)/create')} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/(app)/match/${item.id}`)}
            onLongPress={() => onLongPress(item)}
            delayLongPress={350}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.course}>{item.course_name}</Text>
              <Text style={styles.sub}>
                {formatPlayWhen(item.play_date)} · {MATCH_TYPE_LABELS[item.match_type]}
              </Text>
            </View>
            <View style={[styles.badge, { borderColor: tint[item.status] ?? colors.muted }]}>
              <Text style={[styles.badgeText, { color: tint[item.status] ?? colors.muted }]}>
                {STATUS_LABELS[item.status]}
              </Text>
            </View>
          </TouchableOpacity>
        )}
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
    badgeText: { fontSize: 12, fontWeight: '700' },
    archiveToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.xs },
    archiveToggleText: { ...typography.caption, color: colors.muted },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.xl * 2 },
    emptyTitle: { ...typography.heading, color: colors.muted },
    emptyHint: { ...typography.caption, textAlign: 'center', maxWidth: 260 },
  });
}
