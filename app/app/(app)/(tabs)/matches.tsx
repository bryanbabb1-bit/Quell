import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { useApi } from '@/lib/useApi';
import type { Match } from '@/types';
import { MATCH_TYPE_LABELS } from '@/types';
import { colors, spacing, radius, typography } from '@/constants/theme';
import { formatPlayWhen, STATUS_LABELS } from '@/lib/format';

const STATUS_TINT: Record<string, string> = {
  open: colors.muted,
  accepted: colors.fairway,
  in_progress: colors.fairway,
  completed: colors.ink,
  declined: colors.flagRed,
  cancelled: colors.flagRed,
};

export default function MyMatchesScreen() {
  const api = useApi();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.fairway} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={matches}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.fairway} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{error ?? 'No matches yet'}</Text>
            <Text style={styles.emptyHint}>{error ? 'Pull to retry.' : 'Post a match or accept one from Discovery.'}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => router.push(`/(app)/match/${item.id}`)} activeOpacity={0.8}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.course}>{item.course_name}</Text>
              <Text style={styles.sub}>
                {formatPlayWhen(item.play_date, item.play_time)} · {MATCH_TYPE_LABELS[item.match_type]}
              </Text>
            </View>
            <View style={[styles.badge, { borderColor: STATUS_TINT[item.status] ?? colors.muted }]}>
              <Text style={[styles.badgeText, { color: STATUS_TINT[item.status] ?? colors.muted }]}>
                {STATUS_LABELS[item.status]}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.xl * 2 },
  emptyTitle: { ...typography.heading, color: colors.muted },
  emptyHint: { ...typography.caption, textAlign: 'center', maxWidth: 260 },
});
