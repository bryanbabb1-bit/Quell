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
import { useFavorites } from '@/store/useFavoritesStore';
import { ConfirmIndexSheet } from '@/components/ConfirmIndexSheet';
import { MatchDeck } from '@/components/MatchDeck';
import { AcceptCelebration } from '@/components/AcceptCelebration';
import { DiscoveryFilters, DEFAULT_FILTERS, isFiltered, localTodayISO, type DiscoveryFilterState } from '@/components/DiscoveryFilters';
import { ErrorState, SkeletonCard } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import type { DiscoveryMatch } from '@/types';
import { spacing, radius, elevation, makeType, type Palette } from '@/constants/theme';

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
  const { ids: favIds, load: loadFavs } = useFavorites();
  const favRef = useRef(favIds);
  favRef.current = favIds;
  // Matches passed on this session. A refresh RECYCLES them — new matches
  // first, then the ones already seen — instead of dead-ending the deck.
  const passedRef = useRef<Set<string>>(new Set());
  const [deckReset, setDeckReset] = useState(0);

  useEffect(() => { loadFavs(); }, [loadFavs]);

  const load = useCallback(async (f?: DiscoveryFilterState) => {
    try {
      setError(null);
      const eff = f ?? filtersRef.current;
      const from = localTodayISO();          // floor: never show past matches
      const days = eff.dates;                // specific days the player can play
      // "Favorites only": pull the broader feed (ignore home-course/handicap
      // defaults) then keep just matches from players the user has starred.
      const { matches } = await api.discover(eff.starred ? { ...eff, from, days, all: true } : { ...eff, from, days });
      const list = eff.starred ? matches.filter((m) => favRef.current.includes(m.creator_id)) : matches;
      // Unseen matches lead; previously-passed ones recycle to the back.
      const fresh = list.filter((m) => !passedRef.current.has(m.id));
      const seen = list.filter((m) => passedRef.current.has(m.id));
      setMatches([...fresh, ...seen]);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load matches.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(useCallback(() => { load(); loadFavs(); }, [load, loadFavs]));

  // "Favorites only" filters against the favorited creator ids; re-run it when
  // those change (favorites loading, or a star toggle) so the deck reflects them.
  useEffect(() => {
    if (filtersRef.current.starred) load();
  }, [favIds, load]);

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

  // Swipe-right / accept: always confirm the index first (it's locked onto the
  // match on accept), then accept.
  const requestAccept = (m: DiscoveryMatch) => {
    setPendingAccept(m);
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
        resetSignal={deckReset}
        onAccept={requestAccept}
        onPass={(m) => { passedRef.current.add(m.id); }}
        onReload={() => {
          haptics.light();
          // Forget this session's passes so everything comes back around, fresh
          // posts first, and force the deck back to the top.
          passedRef.current = new Set();
          load();
          setDeckReset((k) => k + 1);
        }}
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
    position: 'absolute', left: spacing.lg, bottom: spacing.lg,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    ...elevation.floating,
  },
  filterDot: { position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.surface },
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
