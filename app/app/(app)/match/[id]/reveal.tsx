import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, useSharedValue, useAnimatedStyle, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useResultsStore } from '@/store/useResultsStore';
import { useColors } from '@/store/useThemeStore';
import { Confetti } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import type { RevealResponse, HoleResult } from '@/types';
import { deltaLabel } from '@/lib/format';
import { spacing, radius, makeType, fonts, type Palette } from '@/constants/theme';

const STEP_MS = 2500; // hybrid auto-advance pace

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

  const [step, setStep] = useState(1);   // 1..holes.length = hole currently shown
  const [done, setDone] = useState(false); // past the last hole → final + stats
  const [paused, setPaused] = useState(false);

  const { width: winW } = useWindowDimensions();
  const railRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [reveal, holes] = await Promise.all([api.getReveal(id), api.getMatchHoles(id).catch(() => null)]);
      setData(reveal);
      setStep(1);
      setDone(false);
      setPaused(false);
      if (holes) {
        const map: Record<number, number | null> = {};
        for (const h of holes.holes) map[h.hole] = h.par;
        setParByHole(map);
      }
      if (reveal.progression) markSeen(id);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the reveal.');
    } finally {
      setLoading(false);
    }
  }, [api, id, markSeen]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const meIsCreator = !!data && data.match.creator_id === userId;
  const mySide: 'creator' | 'opponent' = meIsCreator ? 'creator' : 'opponent';
  const theirName = data ? (meIsCreator ? data.opponent_name : data.creator_name) : 'Opponent';
  const myName = data ? (meIsCreator ? data.creator_name : data.opponent_name) : 'You';
  const holes: HoleResult[] = data?.progression?.holes ?? [];

  const myDeltaAt = useCallback(
    (h: HoleResult) => (meIsCreator ? h.creator_delta : -h.creator_delta),
    [meIsCreator]
  );

  const current = holes[step - 1] ?? null;
  const myDelta = done
    ? (holes.length ? myDeltaAt(holes[holes.length - 1]) : 0)
    : (current ? myDeltaAt(current) : 0);

  const outcome: Outcome | null = useMemo(() => {
    const p = data?.progression;
    if (!p) return null;
    if (p.final_result === 'tie') return 'tie';
    return (p.final_result === 'creator_wins') === meIsCreator ? 'win' : 'loss';
  }, [data, meIsCreator]);

  // ── Hybrid pacing: auto-advance with a per-hole progress bar; pause stops it;
  // tapping the stage or a timeline chip scrubs and resets the timer. ──────────
  const progress = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loading || !holes.length || done) return;
    if (paused) { cancelAnimation(progress); return; }
    // restart the bar for this hole
    progress.value = 0;
    progress.value = withTiming(1, { duration: STEP_MS, easing: Easing.linear });
    timer.current = setTimeout(() => {
      if (step < holes.length) setStep((s) => s + 1);
      else setDone(true);
    }, STEP_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [loading, holes.length, done, paused, step, progress]);

  // Per-hole haptic tick (and a stronger tap when the viewer wins the hole).
  const lastTick = useRef(0);
  useEffect(() => {
    if (loading || done || !current) return;
    if (lastTick.current === step) return;
    lastTick.current = step;
    if (current.winner === mySide) haptics.medium();
    else haptics.light();
  }, [step, current, done, loading, mySide]);

  // Win celebration when we reach the final screen.
  const celebrated = useRef(false);
  useEffect(() => {
    if (done && outcome === 'win' && !celebrated.current) {
      celebrated.current = true;
      haptics.success();
    }
    if (!done) celebrated.current = false;
  }, [done, outcome]);

  // Auto-scroll the timeline so the active hole stays in view as it progresses.
  useEffect(() => {
    if (!holes.length) return;
    const stride = 34 + spacing.xs; // chip width + rail gap
    const idx = done ? holes.length - 1 : step - 1;
    const x = Math.max(0, idx * stride - winW / 2 + stride / 2 + spacing.lg);
    const r = requestAnimationFrame(() => railRef.current?.scrollTo({ x, animated: true }));
    return () => cancelAnimationFrame(r);
  }, [step, done, holes.length, winW]);

  const goTo = (s: number) => {
    haptics.select();
    setDone(false);
    setStep(Math.max(1, Math.min(holes.length, s)));
  };
  const stageTap = () => {
    if (done) return;
    if (step < holes.length) setStep((s) => s + 1);
    else setDone(true);
  };
  const finish = () => { setStep(holes.length); setDone(true); };
  const replay = () => { setStep(1); setDone(false); setPaused(false); };

  // ── Loading / locked / no-course states ─────────────────────────────────────
  if (loading) {
    return <SafeAreaView style={styles.centerSafe}><ActivityIndicator color={colors.accent} size="large" /></SafeAreaView>;
  }
  if (error || !data) {
    return (
      <SafeAreaView style={styles.centerSafe}>
        <Ionicons name="lock-closed-outline" size={40} color={colors.muted} />
        <Text style={styles.lockedText}>{error ?? 'The reveal is not ready yet.'}</Text>
        <Pressable onPress={load}><Text style={styles.link}>Check again</Text></Pressable>
        <Pressable onPress={() => router.back()}><Text style={styles.linkMuted}>Back to match</Text></Pressable>
      </SafeAreaView>
    );
  }
  if (!data.progression) {
    return (
      <SafeAreaView style={styles.centerSafe}>
        <Ionicons name="golf-outline" size={40} color={colors.muted} />
        <Text style={styles.lockedText}>Both cards are in, but this match has no course data to score against.</Text>
        <Pressable onPress={() => router.back()}><Text style={styles.link}>Back to match</Text></Pressable>
      </SafeAreaView>
    );
  }

  const grad = gradientFor(done ? outcome : (myDelta > 0 ? 'win' : myDelta < 0 ? 'loss' : 'tie'), colors);

  return (
    <View style={styles.flex}>
      <LinearGradient colors={grad} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />
      {done && outcome === 'win' && <Confetti />}

      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable hitSlop={12} onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.topCaption}>{done ? 'Final' : `Hole ${current?.hole ?? ''} · ${step}/${holes.length}`}</Text>
          {!done ? (
            <Pressable hitSlop={12} onPress={() => setPaused((p) => !p)} style={styles.iconBtn}>
              <Ionicons name={paused ? 'play' : 'pause'} size={24} color={colors.text} />
            </Pressable>
          ) : <View style={styles.iconBtn} />}
        </View>

        {/* Scoreline */}
        <View style={styles.scoreline}>
          <Animated.Text key={`d-${done ? 'f' : step}`} entering={FadeIn.duration(300)} style={[styles.scoreBig, deltaColor(myDelta, colors)]}>
            {done && outcome ? finalHeadline(outcome) : deltaLabel(myDelta)}
          </Animated.Text>
          {done && outcome !== 'tie' && (
            <Text style={styles.finalDelta}>{data.progression.final_delta}</Text>
          )}
        </View>

        {/* Timeline rail — tap a hole to scrub */}
        <View style={styles.railWrap}>
          <ScrollView ref={railRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {holes.map((h, i) => {
              const revealed = done || i < step;
              const isCurrent = !done && i === step - 1;
              const iWon = h.winner === mySide;
              const halve = h.winner === 'tie';
              return (
                <Pressable key={h.hole} onPress={() => goTo(i + 1)} style={[
                  styles.chip,
                  revealed && (halve ? styles.chipHalve : iWon ? styles.chipWin : styles.chipLoss),
                  !revealed && styles.chipPending,
                  isCurrent && styles.chipCurrent,
                ]}>
                  <Text style={[styles.chipText, revealed && !halve && styles.chipTextOn]}>{h.hole}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {!done && (
            <View style={styles.progressTrack}><Animated.View style={[styles.progressFill, progressStyle]} /></View>
          )}
        </View>

        {/* Center stage */}
        {!done && current ? (
          <Pressable style={styles.stage} onPress={stageTap}>
            <Animated.View key={`hole-${step}`} entering={FadeInUp.duration(380)} style={styles.stageInner}>
              <Text style={styles.holeTitle}>
                Hole {current.hole}{parByHole[current.hole] != null ? `  ·  Par ${parByHole[current.hole]}` : ''}
              </Text>
              <View style={styles.matchup}>
                <HoleSide
                  name={myName} you
                  gross={meIsCreator ? current.creator_gross : current.opponent_gross}
                  net={meIsCreator ? current.creator_net : current.opponent_net}
                  strokes={meIsCreator ? current.creator_strokes : current.opponent_strokes}
                  won={current.winner === mySide}
                  stepKey={step}
                />
                <View style={styles.vsCol}><Text style={styles.vs}>vs</Text></View>
                <HoleSide
                  name={theirName}
                  gross={meIsCreator ? current.opponent_gross : current.creator_gross}
                  net={meIsCreator ? current.opponent_net : current.creator_net}
                  strokes={meIsCreator ? current.opponent_strokes : current.creator_strokes}
                  won={current.winner === (meIsCreator ? 'opponent' : 'creator')}
                  stepKey={step}
                />
              </View>
              <Text style={[styles.holeOutcome, holeOutcomeColor(current, mySide, colors)]}>
                {current.winner === 'tie' ? 'Hole halved'
                  : current.winner === mySide ? 'You win the hole'
                  : `${theirName} wins the hole`}
              </Text>
              <Text style={styles.tapHint}>Tap to advance · tap a hole above to revisit</Text>
            </Animated.View>
          </Pressable>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.finalScroll} showsVerticalScrollIndicator={false}>
            <RoundStats
              holes={holes} parByHole={parByHole} mySide={mySide}
              myName={myName} theirName={theirName}
              myGross={meIsCreator ? data.creator_scorecard.total_gross : data.opponent_scorecard.total_gross}
              theirGross={meIsCreator ? data.opponent_scorecard.total_gross : data.creator_scorecard.total_gross}
              decidedOn={data.progression.decided_on_hole}
              colors={colors} styles={styles}
            />
          </ScrollView>
        )}

        {/* Footer controls */}
        <View style={styles.footer}>
          {!done ? (
            <Pressable style={styles.skipBtn} onPress={finish}>
              <Text style={styles.skipText}>Skip to result</Text>
            </Pressable>
          ) : (
            <View style={styles.footerRow}>
              <Pressable style={styles.secondaryBtn} onPress={replay}>
                <Ionicons name="refresh" size={18} color={colors.accent} />
                <Text style={styles.secondaryText}>Replay</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => router.replace(`/(app)/match/${id}/scorecard`)}>
                <Ionicons name="grid-outline" size={18} color={colors.accent} />
                <Text style={styles.secondaryText}>Scorecard</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
                <Text style={styles.primaryText}>Done</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// Count-up the gross as the hole appears.
function useCountUp(target: number, key: number): number {
  const [n, setN] = useState(target);
  useEffect(() => {
    let raf: number;
    const from = 0, dur = 420, start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      setN(Math.round(from + (target - from) * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [key, target]);
  return n;
}

function HoleSide({ name, gross, net, strokes, won, you, stepKey }: {
  name: string; gross: number; net: number; strokes: number; won: boolean; you?: boolean; stepKey: number;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shown = useCountUp(gross, stepKey);
  return (
    <View style={[styles.side, won && styles.sideWonWrap]}>
      <Text style={styles.sideLabel} numberOfLines={1}>{you ? 'You' : name}</Text>
      <Text style={[styles.sideGross, won && styles.sideWonText]}>{shown}</Text>
      {strokes > 0 ? (
        <View style={styles.netRow}>
          <Text style={[styles.netText, won && styles.sideWonText]}>net {net}</Text>
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

function RoundStats({ holes, parByHole, mySide, myName, theirName, myGross, theirGross, decidedOn, colors, styles }: {
  holes: HoleResult[]; parByHole: Record<number, number | null>; mySide: 'creator' | 'opponent';
  myName: string; theirName: string; myGross: number; theirGross: number; decidedOn: number | null;
  colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  const grossOf = (h: HoleResult) => (mySide === 'creator' ? h.creator_gross : h.opponent_gross);
  let won = 0, lost = 0, halved = 0;
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0;
  let best: { hole: number; rel: number } | null = null;
  let worst: { hole: number; rel: number } | null = null;
  for (const h of holes) {
    if (h.winner === mySide) won++; else if (h.winner === 'tie') halved++; else lost++;
    const par = parByHole[h.hole];
    if (par != null) {
      const rel = grossOf(h) - par;
      if (rel <= -2) eagles++; else if (rel === -1) birdies++; else if (rel === 0) pars++;
      else if (rel === 1) bogeys++; else doubles++;
      if (best == null || rel < best.rel) best = { hole: h.hole, rel };
      if (worst == null || rel > worst.rel) worst = { hole: h.hole, rel };
    }
  }
  const relText = (r: number) => (r === 0 ? 'E' : r > 0 ? `+${r}` : `${r}`);

  return (
    <Animated.View entering={FadeIn.duration(450)} style={styles.statsWrap}>
      {decidedOn != null && <Text style={styles.decided}>Closed out on hole {decidedOn}</Text>}

      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Holes</Text>
        <View style={styles.statRow}>
          <StatCell label="Won" value={won} tone="accent" styles={styles} />
          <StatCell label="Lost" value={lost} tone="loss" styles={styles} />
          <StatCell label="Halved" value={halved} tone="muted" styles={styles} />
        </View>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Your card</Text>
        <View style={styles.statRow}>
          <StatCell label="Birdies+" value={eagles + birdies} tone="accent" styles={styles} />
          <StatCell label="Pars" value={pars} tone="text" styles={styles} />
          <StatCell label="Bogeys" value={bogeys} tone="text" styles={styles} />
          <StatCell label="Doubles+" value={doubles} tone="loss" styles={styles} />
        </View>
        <View style={styles.statsLine}>
          <Text style={styles.statsLineLabel}>Gross</Text>
          <Text style={styles.statsLineVal}>{myName.split(' ')[0] || 'You'} {myGross}  ·  {theirName.split(' ')[0]} {theirGross}</Text>
        </View>
        {best && (
          <View style={styles.statsLine}>
            <Text style={styles.statsLineLabel}>Best hole</Text>
            <Text style={styles.statsLineVal}>#{best.hole} ({relText(best.rel)})</Text>
          </View>
        )}
        {worst && worst.rel > 0 && (
          <View style={styles.statsLine}>
            <Text style={styles.statsLineLabel}>Toughest</Text>
            <Text style={styles.statsLineVal}>#{worst.hole} ({relText(worst.rel)})</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function StatCell({ label, value, tone, styles }: {
  label: string; value: number; tone: 'accent' | 'loss' | 'muted' | 'text'; styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, styles[`tone_${tone}` as const]]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function finalHeadline(o: Outcome): string {
  return o === 'win' ? 'You win' : o === 'loss' ? 'You lost' : 'All Square';
}
function deltaColor(delta: number, c: Palette) {
  if (delta > 0) return { color: c.accent };
  if (delta < 0) return { color: c.loss };
  return { color: c.halve };
}
function holeOutcomeColor(h: HoleResult, mySide: 'creator' | 'opponent', c: Palette) {
  if (h.winner === 'tie') return { color: c.halve };
  return { color: h.winner === mySide ? c.accent : c.loss };
}
function gradientFor(o: Outcome | null, c: Palette): readonly [string, string, string] {
  if (o === 'win') return [c.accentGlow, c.bg, c.bg];
  if (o === 'loss') return [c.lossGlow, c.bg, c.bg];
  return [c.surface, c.bg, c.bg];
}

function makeStyles(c: Palette) {
  const t = makeType(c);
  return StyleSheet.create({
    flex: { flex: 1 },
    centerSafe: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg, backgroundColor: c.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    topCaption: { ...t.overline, color: c.muted },
    scoreline: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.md },
    scoreBig: { ...t.scoreBig, fontSize: 52, textAlign: 'center' },
    finalDelta: { ...t.heading, color: c.text, marginTop: spacing.xs },
    railWrap: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    rail: { gap: spacing.xs, paddingVertical: spacing.xs },
    chip: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    chipPending: { opacity: 0.4 },
    chipWin: { backgroundColor: c.accent, borderColor: c.accent },
    chipLoss: { backgroundColor: c.loss, borderColor: c.loss },
    chipHalve: { backgroundColor: c.halveGlow, borderColor: c.halve },
    chipCurrent: { transform: [{ scale: 1.15 }], borderColor: c.text },
    chipText: { ...t.caption, fontSize: 12, color: c.muted },
    chipTextOn: { color: c.bg, fontFamily: fonts.bodyBold },
    progressTrack: { height: 3, borderRadius: 2, backgroundColor: c.surfaceRaised, overflow: 'hidden' },
    progressFill: { height: 3, backgroundColor: c.accent },
    stage: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
    stageInner: { gap: spacing.lg, alignItems: 'center' },
    holeTitle: { ...t.heading, textAlign: 'center' },
    matchup: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
    vsCol: { width: 36, alignItems: 'center' },
    vs: { ...t.overline, color: c.muted },
    side: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'transparent' },
    sideWonWrap: { borderColor: c.accent, backgroundColor: c.accentGlow },
    sideLabel: { ...t.overline, color: c.muted },
    sideGross: { ...t.scoreBig, fontSize: 64, color: c.text },
    sideWonText: { color: c.accent },
    netRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    netText: { ...t.bodySemiBold, color: c.text },
    netMuted: { ...t.caption, color: c.muted },
    dots: { flexDirection: 'row', gap: 3 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent },
    holeOutcome: { ...t.subheading, textAlign: 'center' },
    tapHint: { ...t.caption, color: c.muted, textAlign: 'center' },
    finalScroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
    statsWrap: { gap: spacing.md },
    decided: { ...t.body, color: c.muted, textAlign: 'center' },
    statsCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
    statsTitle: { ...t.overline, color: c.muted },
    statRow: { flexDirection: 'row', justifyContent: 'space-between' },
    statCell: { flex: 1, alignItems: 'center', gap: 2 },
    statValue: { ...t.scoreBig, fontSize: 32 },
    statLabel: { ...t.overline, color: c.muted, fontSize: 11 },
    tone_accent: { color: c.accent },
    tone_loss: { color: c.loss },
    tone_muted: { color: c.muted },
    tone_text: { color: c.text },
    statsLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm },
    statsLineLabel: { ...t.caption, color: c.muted },
    statsLineVal: { ...t.bodySemiBold, color: c.text },
    footer: { padding: spacing.lg, gap: spacing.sm },
    footerRow: { flexDirection: 'row', gap: spacing.sm },
    skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
    skipText: { ...t.bodySemiBold, color: c.muted },
    primaryBtn: { flex: 1, backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
    primaryText: { ...t.bodySemiBold, color: c.onAccent },
    secondaryBtn: { flex: 1, flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderColor: c.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { ...t.bodySemiBold, color: c.accent },
    lockedText: { ...t.body, color: c.muted, textAlign: 'center' },
    link: { ...t.bodySemiBold, color: c.accent },
    linkMuted: { ...t.body, color: c.muted },
  });
}
