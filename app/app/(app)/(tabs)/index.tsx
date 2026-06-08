import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useUserStore } from '@/store/useUserStore';
import { ConfirmIndexSheet } from '@/components/ConfirmIndexSheet';
import { MatchDeck } from '@/components/MatchDeck';
import type { DiscoveryMatch } from '@/types';
import { colors, spacing, radius, typography } from '@/constants/theme';
import { isIndexStale } from '@/lib/format';

export default function DiscoveryScreen() {
  const api = useApi();
  const [matches, setMatches] = useState<DiscoveryMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useUserStore((s) => s.user);
  const [pendingAccept, setPendingAccept] = useState<DiscoveryMatch | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const { matches } = await api.discover();
      setMatches(matches);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load matches.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doAccept = async (m: DiscoveryMatch) => {
    try {
      await api.acceptMatch(m.id);
      router.push(`/(app)/match/${m.id}`);
    } catch (e: any) {
      Alert.alert('Could not accept', e?.message ?? 'Please try again.');
    }
  };

  // Swipe-right / accept: confirm a stale index first, then accept.
  const requestAccept = (m: DiscoveryMatch) => {
    if (user && isIndexStale(user.handicap, user.handicap_updated_at)) setPendingAccept(m);
    else doAccept(m);
  };

  const confirmIndexAndAccept = async (index: number) => {
    setSheetBusy(true);
    try {
      const updated = await api.updateMe({ handicap: index });
      useUserStore.setState({ user: updated });
      const m = pendingAccept;
      setPendingAccept(null);
      if (m) await doAccept(m);
    } catch (e: any) {
      Alert.alert('Could not save your index', e?.message ?? 'Please try again.');
    } finally {
      setSheetBusy(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.fairway} size="large" /></View>;
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
          <Text style={styles.errTitle}>{error}</Text>
          <TouchableOpacity style={styles.reloadBtn} onPress={load}>
            <Ionicons name="refresh" size={18} color={colors.fairway} />
            <Text style={styles.reloadText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <MatchDeck
        matches={matches}
        onAccept={requestAccept}
        onPass={() => { /* pass is local — the deck advances itself */ }}
        onReload={load}
      />

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/(app)/create')} activeOpacity={0.9}>
        <Ionicons name="add" size={28} color={colors.surface} />
      </TouchableOpacity>

      <ConfirmIndexSheet
        visible={!!pendingAccept}
        handicap={user?.handicap ?? null}
        updatedAt={user?.handicap_updated_at ?? null}
        actionLabel="Accept match"
        busy={sheetBusy}
        onCancel={() => setPendingAccept(null)}
        onConfirm={confirmIndexAndAccept}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.paper },
  errTitle: { ...typography.heading, color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.lg },
  reloadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.fairway, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  reloadText: { ...typography.bodySemiBold, color: colors.fairway },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.fairway,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
});
