import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import Animated, { FadeInDown, FadeIn, ZoomIn } from 'react-native-reanimated';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import type { RevealResponse, HoleResult } from '@/types';
import { deltaLabel } from '@/lib/format';
import { colors, spacing, radius, typography } from '@/constants/theme';

const STEP_MS = 800; // pace between holes during the auto-reveal

type Outcome = 'win' | 'loss' | 'tie';

export default function RevealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const api = useApi();

  const [data, setData] = useState<RevealResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0); // number of holes revealed so far

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setData(await api.getReveal(id));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the reveal.');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const meIsCreator = !!data && data.match.creator_id === userId;
  const holes: HoleResult[] = data?.progression?.holes ?? [];
  const finished = step >= holes.length;

  // Auto-advance the reveal one hole at a time until the closeout.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading || !holes.length || finished) return;
    timer.current = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [loading, holes.length, finished, step]);

  // Running scoreline from MY perspective, up to the latest revealed hole.
  const myDelta = useMemo(() => {
    if (step === 0) return 0;
    const last = holes[Math.min(step, holes.length) - 1];
    if (!last) return 0;
    return meIsCreator ? last.creator_delta : -last.creator_delta;
  }, [step, holes, meIsCreator]);

  const outcome: Outcome | null = useMemo(() => {
    const p = data?.progression;
    if (!p) return null;
    if (p.final_result === 'tie') return 'tie';
    const creatorWon = p.final_result === 'creator_wins';
    return creatorWon === meIsCreator ? 'win' : 'loss';
  }, [data, meIsCreator]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.fairway} size="large" /></View>;
  }

  // Reveal is locked until both players submit — the API returns 409.
  if (error || !data) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={40} color={colors.muted} />
        <Text style={styles.lockedText}>{error ?? 'The reveal is not ready yet.'}</Text>
        <TouchableOpacity onPress={load}><Text style={styles.link}>Check again</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.linkMuted}>Back to match</Text></TouchableOpacity>
      </View>
    );
  }

  if (!data.progression) {
    // Both cards in, but no course/tee linked so the engine couldn't compute.
    return (
      <View style={styles.center}>
        <Ionicons name="golf-outline" size={40} color={colors.muted} />
        <Text style={styles.lockedText}>
          Both cards are in, but this match has no course data to score against yet.
        </Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Back to match</Text></TouchableOpacity>
      </View>
    );
  }

  const visible = holes.slice(0, step);

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Live scoreline header */}
        <View style={styles.scoreboard}>
          <Text style={styles.scoreboardLabel}>{finished ? 'Final' : 'Through ' + step}</Text>
          <Text style={[styles.scoreboardDelta, deltaColor(myDelta)]}>
            {deltaLabel(myDelta)}
          </Text>
        </View>

        {/* Hole-by-hole rows, each animating in as it's revealed */}
        {visible.map((h) => {
          const mine = meIsCreator
            ? { gross: h.creator_gross, net: h.creator_net, strokes: h.creator_strokes }
            : { gross: h.opponent_gross, net: h.opponent_net, strokes: h.opponent_strokes };
          const theirs = meIsCreator
            ? { gross: h.opponent_gross, net: h.opponent_net, strokes: h.opponent_strokes }
            : { gross: h.creator_gross, net: h.creator_net, strokes: h.creator_strokes };
          const iWon = h.winner === (meIsCreator ? 'creator' : 'opponent');
          const theyWon = h.winner === (meIsCreator ? 'opponent' : 'creator');
          const rowDelta = meIsCreator ? h.creator_delta : -h.creator_delta;

          return (
            <Animated.View key={h.hole} entering={FadeInDown.springify().damping(16)} style={styles.holeRow}>
              <View style={styles.holeBadge}><Text style={styles.holeBadgeText}>{h.hole}</Text></View>

              <PlayerCell label="You" net={mine.net} gross={mine.gross} strokes={mine.strokes} won={iWon} />
              <PlayerCell label="Them" net={theirs.net} gross={theirs.gross} strokes={theirs.strokes} won={theyWon} />

              <Text style={[styles.rowDelta, deltaColor(rowDelta)]}>{deltaLabel(rowDelta)}</Text>
            </Animated.View>
          );
        })}

        {/* Final result banner */}
        {finished && outcome && (
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.banner, bannerStyle(outcome)]}>
            <Text style={styles.bannerTitle}>{bannerTitle(outcome)}</Text>
            {outcome !== 'tie' && <Text style={styles.bannerScore}>{data.progression.final_delta}</Text>}
            {data.progression.decided_on_hole != null && (
              <Text style={styles.bannerSub}>Closed out on hole {data.progression.decided_on_hole}</Text>
            )}
            <Text style={styles.bannerTotals}>
              Gross {data.creator_scorecard.total_gross} – {data.opponent_scorecard.total_gross}
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      {/* Controls */}
      <View style={styles.footer}>
        {!finished ? (
          <Animated.View entering={FadeIn}>
            <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(holes.length)}>
              <Text style={styles.skipText}>Skip to result</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep(0)}>
              <Ionicons name="refresh" size={18} color={colors.fairway} />
              <Text style={styles.secondaryText}>Replay</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function PlayerCell({ label, net, gross, strokes, won }: {
  label: string; net: number; gross: number; strokes: number; won: boolean;
}) {
  return (
    <View style={styles.playerCell}>
      <Text style={styles.playerLabel}>{label}</Text>
      <Text style={[styles.playerNet, won && styles.playerNetWon]}>{net}</Text>
      <Text style={styles.playerGross}>
        gross {gross}{strokes > 0 ? ` · ${strokes}${strokes > 1 ? ' strokes' : ' stroke'}` : ''}
      </Text>
    </View>
  );
}

function deltaColor(delta: number) {
  if (delta > 0) return { color: colors.fairway };
  if (delta < 0) return { color: colors.flagRed };
  return { color: colors.muted };
}

function bannerTitle(o: Outcome): string {
  return o === 'win' ? 'You win! 🏌️' : o === 'loss' ? 'You lost' : 'All Square';
}
function bannerStyle(o: Outcome) {
  if (o === 'win') return { borderColor: colors.fairway, backgroundColor: '#EAF5EE' };
  if (o === 'loss') return { borderColor: colors.flagRed, backgroundColor: '#FBEAEA' };
  return { borderColor: colors.border, backgroundColor: colors.sand };
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  scoreboard: {
    alignItems: 'center', paddingVertical: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  scoreboardLabel: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreboardDelta: { ...typography.title, fontSize: 30 },
  holeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.sm,
  },
  holeBadge: {
    width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.fairway,
    alignItems: 'center', justifyContent: 'center',
  },
  holeBadgeText: { ...typography.bodySemiBold, color: colors.surface },
  playerCell: { flex: 1, alignItems: 'center' },
  playerLabel: { ...typography.caption, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  playerNet: { ...typography.title, fontSize: 22, color: colors.ink },
  playerNetWon: { color: colors.fairway },
  playerGross: { ...typography.caption, fontSize: 11 },
  rowDelta: { ...typography.bodySemiBold, minWidth: 64, textAlign: 'right' },
  banner: {
    alignItems: 'center', borderWidth: 2, borderRadius: radius.lg, padding: spacing.lg,
    marginTop: spacing.md, gap: spacing.xs,
  },
  bannerTitle: { ...typography.title, fontSize: 30 },
  bannerScore: { ...typography.heading, fontSize: 22, color: colors.ink },
  bannerSub: { ...typography.caption },
  bannerTotals: { ...typography.caption, marginTop: spacing.xs },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { ...typography.bodySemiBold, color: colors.muted },
  primaryBtn: { flex: 1, backgroundColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  primaryText: { ...typography.bodySemiBold, color: colors.surface },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderColor: colors.fairway,
    borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center',
  },
  secondaryText: { ...typography.bodySemiBold, color: colors.fairway },
  lockedText: { ...typography.body, color: colors.muted, textAlign: 'center' },
  link: { ...typography.bodySemiBold, color: colors.fairway },
  linkMuted: { ...typography.body, color: colors.muted },
});
