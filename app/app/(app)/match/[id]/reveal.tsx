import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useResultsStore } from '@/store/useResultsStore';
import { useColors } from '@/store/useThemeStore';
import type { RevealResponse, HoleResult } from '@/types';
import { deltaLabel } from '@/lib/format';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

const STEP_MS = 1600; // slow, deliberate pace between holes

type Outcome = 'win' | 'loss' | 'tie';

export default function RevealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const markSeen = useResultsStore((s) => s.markSeen);

  const [data, setData] = useState<RevealResponse | null>(null);
  const [parByHole, setParByHole] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [reveal, holes] = await Promise.all([api.getReveal(id), api.getMatchHoles(id).catch(() => null)]);
      setData(reveal);
      if (holes) {
        const map: Record<number, number | null> = {};
        for (const h of holes.holes) map[h.hole] = h.par;
        setParByHole(map);
      }
      if (reveal.progression) markSeen(id); // result viewed → clears the badge
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the reveal.');
    } finally {
      setLoading(false);
    }
  }, [api, id, markSeen]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const meIsCreator = !!data && data.match.creator_id === userId;
  const theirName = data ? (meIsCreator ? data.opponent_name : data.creator_name) : 'Opponent';
  const holes: HoleResult[] = data?.progression?.holes ?? [];
  const finished = step >= holes.length && holes.length > 0;

  const myDeltaAt = useCallback(
    (h: HoleResult) => (meIsCreator ? h.creator_delta : -h.creator_delta),
    [meIsCreator]
  );

  // Auto-advance one hole at a time.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading || !holes.length || finished) return;
    timer.current = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [loading, holes.length, finished, step]);

  const myDelta = step > 0 ? myDeltaAt(holes[Math.min(step, holes.length) - 1]) : 0;
  const current = step > 0 ? holes[step - 1] : null;

  const outcome: Outcome | null = useMemo(() => {
    const p = data?.progression;
    if (!p) return null;
    if (p.final_result === 'tie') return 'tie';
    return (p.final_result === 'creator_wins') === meIsCreator ? 'win' : 'loss';
  }, [data, meIsCreator]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.fairway} size="large" /></View>;
  }

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
    return (
      <View style={styles.center}>
        <Ionicons name="golf-outline" size={40} color={colors.muted} />
        <Text style={styles.lockedText}>Both cards are in, but this match has no course data to score against.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Back to match</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Climbing scoreline */}
        <View style={styles.statusWrap}>
          <Text style={styles.statusCaption}>{finished ? 'Final' : `Through ${step} of ${holes.length}`}</Text>
          <Animated.Text key={`status-${step}`} entering={FadeIn.duration(350)} style={[styles.statusBig, deltaColor(myDelta, colors)]}>
            {deltaLabel(myDelta)}
          </Animated.Text>
        </View>

        {/* Hole-by-hole pip strip */}
        <View style={styles.pips}>
          {holes.map((h, i) => {
            const revealed = i < step;
            const iWon = h.winner === (meIsCreator ? 'creator' : 'opponent');
            const halve = h.winner === 'tie';
            return (
              <View
                key={h.hole}
                style={[
                  styles.pip,
                  !revealed && styles.pipPending,
                  revealed && (halve ? styles.pipHalve : iWon ? styles.pipWin : styles.pipLoss),
                  revealed && i === step - 1 && styles.pipCurrent,
                ]}
              >
                <Text style={[styles.pipText, revealed && !halve && styles.pipTextOn]}>{h.hole}</Text>
              </View>
            );
          })}
        </View>

        {/* Current hole — what each player took (gross), and the net after any pop */}
        {current && !finished && (
          <Animated.View key={`hole-${step}`} entering={FadeInDown.duration(400)} style={styles.holeCard}>
            <Text style={styles.holeCardTitle}>
              Hole {current.hole}{parByHole[current.hole] != null ? ` · Par ${parByHole[current.hole]}` : ''}
            </Text>
            <View style={styles.holeCardRow}>
              <HoleSide
                label="You"
                gross={meIsCreator ? current.creator_gross : current.opponent_gross}
                net={meIsCreator ? current.creator_net : current.opponent_net}
                strokes={meIsCreator ? current.creator_strokes : current.opponent_strokes}
                won={current.winner === (meIsCreator ? 'creator' : 'opponent')}
              />
              <View style={styles.vsCol}><Text style={styles.vs}>vs</Text></View>
              <HoleSide
                label={theirName}
                gross={meIsCreator ? current.opponent_gross : current.creator_gross}
                net={meIsCreator ? current.opponent_net : current.creator_net}
                strokes={meIsCreator ? current.opponent_strokes : current.creator_strokes}
                won={current.winner === (meIsCreator ? 'opponent' : 'creator')}
              />
            </View>
            <Text style={styles.holeCardOutcome}>
              {current.winner === 'tie'
                ? 'Hole halved'
                : current.winner === (meIsCreator ? 'creator' : 'opponent')
                ? 'You win the hole'
                : `${theirName} wins the hole`}
            </Text>
          </Animated.View>
        )}

        {/* Final banner */}
        {finished && outcome && (
          <Animated.View entering={FadeIn.duration(500)} style={[styles.banner, bannerStyle(outcome, colors)]}>
            <Text style={[styles.bannerTitle, bannerTextColor(outcome, colors)]}>{bannerTitle(outcome)}</Text>
            {outcome !== 'tie' && <Text style={styles.bannerScore}>{data.progression.final_delta}</Text>}
            {data.progression.decided_on_hole != null && (
              <Text style={styles.bannerSub}>Closed out on hole {data.progression.decided_on_hole}</Text>
            )}
            <Text style={styles.bannerTotals}>
              Gross: You {meIsCreator ? data.creator_scorecard.total_gross : data.opponent_scorecard.total_gross}
              {`  ·  ${theirName} `}
              {meIsCreator ? data.opponent_scorecard.total_gross : data.creator_scorecard.total_gross}
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!finished ? (
          <TouchableOpacity style={styles.skipBtn} onPress={() => setStep(holes.length)}>
            <Text style={styles.skipText}>Skip to result</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep(0)}>
              <Ionicons name="refresh" size={18} color={colors.fairway} />
              <Text style={styles.secondaryText}>Replay</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.replace(`/(app)/match/${id}/scorecard`)}>
              <Ionicons name="grid-outline" size={18} color={colors.fairway} />
              <Text style={styles.secondaryText}>Scorecard</Text>
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

function HoleSide({ label, gross, net, strokes, won }: {
  label: string; gross: number; net: number; strokes: number; won: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.side}>
      <Text style={styles.sideLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.sideGross, won && styles.sideWon]}>{gross}</Text>
      {strokes > 0 ? (
        <View style={styles.netRow}>
          <Text style={[styles.netText, won && styles.sideWon]}>net {net}</Text>
          <View style={styles.dots}>
            {Array.from({ length: strokes }).map((_, i) => <View key={i} style={styles.dot} />)}
          </View>
        </View>
      ) : (
        <Text style={styles.netMuted}>no stroke</Text>
      )}
    </View>
  );
}

function deltaColor(delta: number, colors: Palette) {
  if (delta > 0) return { color: colors.fairway };
  if (delta < 0) return { color: colors.flagRed };
  return { color: colors.muted };
}
function bannerTitle(o: Outcome): string {
  return o === 'win' ? 'You win' : o === 'loss' ? 'You lost' : 'All Square';
}
function bannerTextColor(o: Outcome, colors: Palette) {
  if (o === 'win') return { color: colors.fairway };
  if (o === 'loss') return { color: colors.flagRed };
  return { color: colors.ink };
}
function bannerStyle(o: Outcome, colors: Palette) {
  if (o === 'win') return { borderColor: colors.fairway, backgroundColor: '#EAF5EE' };
  if (o === 'loss') return { borderColor: colors.flagRed, backgroundColor: '#FBEAEA' };
  return { borderColor: colors.border, backgroundColor: colors.sand };
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  statusWrap: {
    alignItems: 'center', paddingVertical: spacing.lg, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  statusCaption: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusBig: { ...typography.title, fontSize: 40, marginTop: spacing.xs },
  pips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' },
  pip: {
    width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  pipPending: { opacity: 0.4 },
  pipWin: { backgroundColor: colors.fairway, borderColor: colors.fairway },
  pipLoss: { backgroundColor: colors.flagRed, borderColor: colors.flagRed },
  pipHalve: { backgroundColor: colors.sand, borderColor: colors.border },
  pipCurrent: { transform: [{ scale: 1.18 }] },
  pipText: { ...typography.caption, fontSize: 12, color: colors.muted },
  pipTextOn: { color: colors.surface, fontWeight: '700' },
  holeCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md,
  },
  holeCardTitle: { ...typography.heading, fontSize: 18, textAlign: 'center' },
  holeCardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  vsCol: { width: 30, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.lg },
  vs: { ...typography.caption, color: colors.muted },
  side: { flex: 1, alignItems: 'center', gap: 2 },
  sideLabel: { ...typography.caption, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  sideGross: { ...typography.title, fontSize: 44, color: colors.ink, lineHeight: 48 },
  sideWon: { color: colors.fairway },
  netRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  netText: { ...typography.bodySemiBold, color: colors.ink },
  netMuted: { ...typography.caption, color: colors.muted },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.fairway },
  holeCardOutcome: { ...typography.bodySemiBold, textAlign: 'center', color: colors.ink },
  banner: {
    alignItems: 'center', borderWidth: 2, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs,
  },
  bannerTitle: { ...typography.title, fontSize: 34 },
  bannerScore: { ...typography.heading, fontSize: 24, color: colors.ink },
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
}
