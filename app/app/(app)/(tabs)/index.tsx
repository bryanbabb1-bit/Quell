import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useApi } from '@/lib/useApi';
import { useUserStore } from '@/store/useUserStore';
import { useColors } from '@/store/useThemeStore';
import { ConfirmIndexSheet } from '@/components/ConfirmIndexSheet';
import { MatchDeck } from '@/components/MatchDeck';
import { AcceptCelebration } from '@/components/AcceptCelebration';
import { DiscoveryFilters, DEFAULT_FILTERS, isFiltered, type DiscoveryFilterState } from '@/components/DiscoveryFilters';
import { ErrorState, SkeletonCard } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import type { DiscoveryMatch } from '@/types';
import { spacing, radius, elevation, makeType, type Palette } from '@/constants/theme';
import { isIndexStale } from '@/lib/format';

const COACH_KEY = 'mp_coach_seen';

export default function DiscoveryScreen() {
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [matches, setMatches] = useState<DiscoveryMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useUserStore((s) => s.user);
  const [showCoach, setShowCoach] = useState(false);
  const [pendingAccept, setPendingAccept] = useState<DiscoveryMatch | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [filters, setFilters] = useState<DiscoveryFilterState>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const load = useCallback(async (f?: DiscoveryFilterState) => {
    try {
      setError(null);
      const { matches } = await api.discover(f ?? filtersRef.current);
      setMatches(matches);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load matches.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const applyFilters = (f: DiscoveryFilterState) => {
    setFilters(f);
    setShowFilters(false);
    setLoading(true);
    load(f);
  };

  const doAccept = async (m: DiscoveryMatch) => {
    try {
      await api.acceptMatch(m.id);
      setCelebrate(m.id); // play the flourish, then navigate (see onDone)
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

  // First-run swipe coachmark (shown once, persisted).
  useEffect(() => {
    SecureStore.getItemAsync(COACH_KEY).then((v) => { if (!v) setShowCoach(true); }).catch(() => {});
  }, []);
  const dismissCoach = () => { setShowCoach(false); SecureStore.setItemAsync(COACH_KEY, '1').catch(() => {}); };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loadingWrap}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ErrorState message={error} onRetry={() => load()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <LinearGradient
        colors={[colors.accentGlow, colors.bg, colors.bg]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <MatchDeck
        matches={matches}
        onAccept={requestAccept}
        onPass={() => { /* pass is local — the deck advances itself */ }}
        onReload={() => load()}
      />

      <TouchableOpacity style={styles.filterBtn} onPress={() => { haptics.light(); setShowFilters(true); }} activeOpacity={0.85}>
        <Ionicons name="options-outline" size={22} color={colors.text} />
        {isFiltered(filters) && <View style={styles.filterDot} />}
      </TouchableOpacity>

      <TouchableOpacity style={styles.fab} onPress={() => { haptics.light(); router.push('/(app)/create'); }} activeOpacity={0.9}>
        <Ionicons name="add" size={28} color={colors.onAccent} />
      </TouchableOpacity>

      <DiscoveryFilters
        visible={showFilters}
        value={filters}
        onApply={applyFilters}
        onClose={() => setShowFilters(false)}
      />

      {showCoach && matches.length > 0 && (
        <Pressable style={styles.coach} onPress={dismissCoach}>
          <View style={styles.coachCard}>
            <Text style={styles.coachTitle}>Find your match</Text>
            <View style={styles.coachRow}>
              <View style={styles.coachItem}>
                <Ionicons name="arrow-back" size={22} color={colors.loss} />
                <Text style={styles.coachText}>Swipe left to pass</Text>
              </View>
              <View style={styles.coachItem}>
                <Ionicons name="arrow-forward" size={22} color={colors.accent} />
                <Text style={styles.coachText}>Swipe right to accept</Text>
              </View>
            </View>
            <Text style={styles.coachHint}>Tap the + to post your own.</Text>
            <View style={styles.coachBtn}><Text style={styles.coachBtnText}>Got it</Text></View>
          </View>
        </Pressable>
      )}

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

function makeStyles(colors: Palette) {
  const t = makeType(colors);
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loadingWrap: { flex: 1, padding: spacing.lg, gap: spacing.md, justifyContent: 'center' },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    ...elevation.floating,
  },
  filterBtn: {
    position: 'absolute', right: spacing.lg, top: spacing.md,
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    ...elevation.card,
  },
  filterDot: { position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.surface },
  coach: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  coachCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, alignItems: 'center', alignSelf: 'stretch', ...elevation.sheet },
  coachTitle: { ...t.heading, textAlign: 'center' },
  coachRow: { flexDirection: 'row', gap: spacing.lg, justifyContent: 'center' },
  coachItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  coachText: { ...t.caption, color: colors.text, textAlign: 'center' },
  coachHint: { ...t.caption, color: colors.muted, textAlign: 'center' },
  coachBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.xs },
  coachBtnText: { ...t.bodySemiBold, color: colors.onAccent },
  });
}
