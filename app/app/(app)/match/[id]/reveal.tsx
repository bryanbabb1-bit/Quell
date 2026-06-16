import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, useWindowDimensions, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeInUp, useSharedValue, useAnimatedStyle, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useResultsStore } from '@/store/useResultsStore';
import { Confetti } from '@/components/ui';
import { useCountUp } from '@/components/motion';
import { WinSmash } from '@/components/WinSmash';
import { haptics } from '@/lib/haptics';
import type { RevealResponse, HoleResult } from '@/types';
import { deltaLabel } from '@/lib/format';
import { spacing, radius, makeType, fonts, cinematicColors, type Palette } from '@/constants/theme';

const STEP_MS = 2500; // hybrid auto-advance pace

type Outcome = 'win' | 'loss' | 'tie';

export default function RevealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const api = useApi();
  const colors = cinematicColors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const markSeen = useResultsStore((s) => s.markSeen);

  const [data, setData] = useState<RevealResponse | null>(null);
  const [parByHole, setParByHole] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState(1);   // 1..holes.length = hole currently shown
  const [done, setDone] = useState(false); // past the last hole → final + stats
  const [paused, setPaused] = useState(false);
  const [smashSeen, setSmashSeen] = useState(false); // win-smash overlay plays once
  // Milestone: current win streak, fetched once the Settle finishes on a win.
  const [streak, setStreak] = useState<number | null>(null);

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
      setSmashSeen(false);
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

  // Spectators (public-feed viewers who aren't in the match) anchor to the
  // creator's side and see a neutral, named result — no "You", no win-smash, no
  // confetti. Participants see their own perspective as before.
  const meIsParticipant = !!data && (data.match.creator_id === userId || data.match.opponent_id === userId);
  const isSpectator = !!data && !meIsParticipant;
  const meIsCreator = !!data && (isSpectator || data.match.creator_id === userId);
  const mySide: 'creator' | 'opponent' = meIsCreator ? 'creator' : 'opponent';
  const theirName = data ? (meIsCreator ? data.opponent_name : data.creator_name) : 'Opponent';
  const myName = data ? (meIsCreator ? data.creator_name : data.opponent_name) : 'You';
  const holes: HoleResult[] = data?.progression?.holes ?? [];

  // BROADCAST mode for spectators: neither player is "you", so neither owns
  // win-green — and neither may borrow accent (brand chrome) or gold (prestige).
  // Creator = live (steel blue), opponent = liveAlt (heather); deltas/headlines
  // carry names, the backdrop stays neutral.
  const creatorFirst = (data?.creator_name ?? '').split(' ')[0] || 'Creator';
  const opponentFirst = (data?.opponent_name ?? '').split(' ')[0] || 'Opponent';
  const sideColor = (side: 'creator' | 'opponent') => (side === 'creator' ? colors.live : colors.liveAlt);
  const sideGlow = (side: 'creator' | 'opponent') => (side === 'creator' ? colors.liveGlow : colors.liveAltGlow);
  // "Marcus 2 Up" / "All Square" — the running delta as a broadcast caption.
  const broadcastDelta = (creatorDelta: number): string => {
    if (creatorDelta === 0) return 'All Square';
    return creatorDelta > 0 ? `${creatorFirst} ${creatorDelta} Up` : `${opponentFirst} ${-creatorDelta} Up`;
  };

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

  // Haptic CHOREOGRAPHY — the hand should feel the story before the eyes read
  // it. Per hole: light tick (halve/lost), medium (you win it). Overrides, in
  // priority order: the closeout hole SLAMS (heavy), a lead flip THUNKS (heavy),
  // reaching all-square from behind/ahead taps medium.
  const lastTick = useRef(0);
  useEffect(() => {
    if (loading || done || !current) return;
    if (lastTick.current === step) return;
    lastTick.current = step;
    const prev = holes[step - 2]; // undefined on hole 1
    const prevDelta = prev?.creator_delta ?? 0;
    const curDelta = current.creator_delta;
    const isCloseout = data?.progression?.decided_on_hole === current.hole;
    const leadFlip = prevDelta !== 0 && curDelta !== 0 && Math.sign(prevDelta) !== Math.sign(curDelta);
    const backToSquare = prevDelta !== 0 && curDelta === 0;
    // A natural birdie-or-better is its own beat — it should feel like a moment.
    const par = parByHole[current.hole];
    const birdie = par != null && (current.creator_gross < par || current.opponent_gross < par);
    if (isCloseout) haptics.heavy();
    else if (leadFlip) haptics.heavy();
    else if (birdie) haptics.heavy();
    else if (backToSquare) haptics.medium();
    // "Your hole" emphasis is a participant feeling — spectators get the drama
    // beats (above) and a light tick otherwise.
    else if (!isSpectator && current.winner === mySide) haptics.medium();
    else haptics.light();
  }, [step, current, done, loading, mySide, holes, data]);

  // Fetch the streak once the Settle lands on a win (participants only) — fuels
  // the milestone banner. Best-effort.
  useEffect(() => {
    if (!done || outcome !== 'win' || isSpectator || streak !== null) return;
    api.getMyRecord()
      .then((r) => setStreak(r.current_streak.type === 'win' ? r.current_streak.count : 0))
      .catch(() => setStreak(0));
  }, [done, outcome, isSpectator, streak, api]);

  // Win celebration when we reach the final screen.
  const celebrated = useRef(false);
  useEffect(() => {
    if (done && outcome === 'win' && !isSpectator && !celebrated.current) {
      celebrated.current = true;
      haptics.success();
    }
    if (!done) celebrated.current = false;
  }, [done, outcome, isSpectator]);

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
  const replay = () => { setStep(1); setDone(false); setPaused(false); setSmashSeen(false); };

  const shareResult = async () => {
    const p = data?.progression;
    if (!p) return;
    if (isSpectator) {
      // Neutral, third-person share for a feed spectator.
      const line = outcome === 'tie'
        ? `${myName} and ${theirName} halved their match`
        : `${outcome === 'win' ? myName : theirName} beat ${outcome === 'win' ? theirName : myName} ${p.final_delta}`;
      try { await Share.share({ message: `${line} at ${data!.match.course_name} — Foretera` }); } catch { /* dismissed */ }
      return;
    }
    const phrase = outcome === 'win' ? `beat ${theirName} ${p.final_delta}`
      : outcome === 'loss' ? `lost to ${theirName} ${p.final_delta}`
      : `halved my match with ${theirName}`;
    try { await Share.share({ message: `I ${phrase} at ${data!.match.course_name} — Foretera` }); } catch { /* dismissed */ }
  };

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

  // Spectators get a neutral backdrop — the green/red wash is a rooting
  // interest the viewer doesn't have.
  const grad = isSpectator ? gradientFor(null, colors)
    : gradientFor(done ? outcome : (myDelta > 0 ? 'win' : myDelta < 0 ? 'loss' : 'tie'), colors);

  return (
    <View style={styles.flex}>
      <StatusBar style="light" />
      <LinearGradient colors={grad} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />
      {done && outcome === 'win' && !isSpectator && <Confetti />}

      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable hitSlop={12} onPress={() => router.back()} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close the reveal">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.topCaption}>{done ? 'Final' : `Hole ${current?.hole ?? ''} · ${step}/${holes.length}`}</Text>
          {!done ? (
            <Pressable hitSlop={12} onPress={() => setPaused((p) => !p)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={paused ? 'Resume the reveal' : 'Pause the reveal'}>
              <Ionicons name={paused ? 'play' : 'pause'} size={24} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable hitSlop={12} onPress={shareResult} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Share the result">
              <Ionicons name="share-outline" size={24} color={colors.text} />
            </Pressable>
          )}
        </View>

        {/* Scoreline — participants see their own delta in win/loss colors;
            spectators see a named broadcast caption in player colors. */}
        <View style={styles.scoreline}>
          <Animated.Text
            key={`d-${done ? 'f' : step}`} entering={FadeIn.duration(300)}
            style={[styles.scoreBig, isSpectator
              ? { color: myDelta > 0 ? sideColor('creator') : myDelta < 0 ? sideColor('opponent') : colors.halve }
              : deltaColor(myDelta, colors)]}
          >
            {done && outcome
              ? (isSpectator ? spectatorHeadline(outcome, myName, theirName) : finalHeadline(outcome))
              : (isSpectator ? broadcastDelta(current?.creator_delta ?? 0) : deltaLabel(myDelta))}
          </Animated.Text>
          {done && outcome !== 'tie' && (
            <Text style={styles.finalDelta}>{data.progression.final_delta}</Text>
          )}
          {isSpectator && (
            <View style={styles.legend}>
              <View style={[styles.legendDot, { backgroundColor: colors.live }]} />
              <Text style={styles.legendText}>{creatorFirst}</Text>
              <View style={[styles.legendDot, { backgroundColor: colors.liveAlt }]} />
              <Text style={styles.legendText}>{opponentFirst}</Text>
            </View>
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
              // Spectators: chips wear the WINNING PLAYER's broadcast color
              // (legend above), not the viewer-POV win/loss coding.
              const spectChip = isSpectator && revealed && !halve
                ? { backgroundColor: sideColor(h.winner as 'creator' | 'opponent'), borderColor: sideColor(h.winner as 'creator' | 'opponent') }
                : null;
              return (
                <Pressable key={h.hole} onPress={() => goTo(i + 1)} style={[
                  styles.chip,
                  revealed && (halve ? styles.chipHalve : isSpectator ? spectChip : iWon ? styles.chipWin : styles.chipLoss),
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
                  name={myName} you={!isSpectator}
                  gross={meIsCreator ? current.creator_gross : current.opponent_gross}
                  net={meIsCreator ? current.creator_net : current.opponent_net}
                  strokes={meIsCreator ? current.creator_strokes : current.opponent_strokes}
                  won={current.winner === mySide}
                  wonColor={isSpectator ? sideColor('creator') : undefined}
                  wonGlow={isSpectator ? sideGlow('creator') : undefined}
                  stepKey={step}
                />
                <View style={styles.vsCol}><Text style={styles.vs}>vs</Text></View>
                <HoleSide
                  name={theirName}
                  gross={meIsCreator ? current.opponent_gross : current.creator_gross}
                  net={meIsCreator ? current.opponent_net : current.creator_net}
                  strokes={meIsCreator ? current.opponent_strokes : current.creator_strokes}
                  won={current.winner === (meIsCreator ? 'opponent' : 'creator')}
                  wonColor={isSpectator ? sideColor('opponent') : undefined}
                  wonGlow={isSpectator ? sideGlow('opponent') : undefined}
                  stepKey={step}
                />
              </View>
              <Text style={[styles.holeOutcome, isSpectator
                ? { color: current.winner === 'tie' ? colors.halve : sideColor(current.winner as 'creator' | 'opponent') }
                : holeOutcomeColor(current, mySide, colors)]}>
                {current.winner === 'tie' ? 'Hole halved'
                  : current.winner === mySide ? (isSpectator ? `${myName} wins the hole` : 'You win the hole')
                  : `${theirName} wins the hole`}
              </Text>
              {/* Birdie-or-better flourish — a natural gross under par lands. */}
              {(() => {
                const par = parByHole[current.hole];
                if (par == null) return null;
                const cL = subParLabel(current.creator_gross, par);
                const oL = subParLabel(current.opponent_gross, par);
                const best = !cL && !oL ? null
                  : !oL || (cL && current.creator_gross <= current.opponent_gross)
                    ? { label: cL!, who: meIsCreator ? myName : theirName }
                    : { label: oL!, who: meIsCreator ? theirName : myName };
                if (!best) return null;
                return (
                  <Animated.View key={`bird-${step}`} entering={FadeInUp.duration(360)} style={styles.birdie}>
                    <Ionicons name="sparkles" size={16} color={colors.gold} />
                    <Text style={styles.birdieText}>{best.label} — {best.who.split(' ')[0]}</Text>
                  </Animated.View>
                );
              })()}
              <Text style={styles.tapHint}>Tap to advance · tap a hole above to revisit</Text>
            </Animated.View>
          </Pressable>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.finalScroll} showsVerticalScrollIndicator={false}>
            {!isSpectator && outcome === 'win' && (streak ?? 0) >= 3 && (
              <Animated.View entering={FadeInUp.duration(420)} style={styles.milestone}>
                <Ionicons name="flame" size={22} color={colors.gold} />
                <View style={styles.milestoneMid}>
                  <Text style={styles.milestoneTitle}>{streak} straight wins</Text>
                  <Text style={styles.milestoneSub}>Your longest active run — keep it going.</Text>
                </View>
                <Pressable hitSlop={10} onPress={shareResult} accessibilityRole="button" accessibilityLabel="Share your streak">
                  <Ionicons name="share-outline" size={20} color={colors.gold} />
                </Pressable>
              </Animated.View>
            )}
            <DramaCard holes={holes} decidedOn={data.progression.decided_on_hole} colors={colors} styles={styles} />
            {data.progression.win_prob && data.progression.win_prob.length > 1 && (
              <WinProbGraph
                series={data.progression.win_prob} meIsCreator={meIsCreator} isSpectator={isSpectator}
                myName={myName} theirName={theirName} colors={colors} styles={styles}
              />
            )}
            <RoundStats
              holes={holes} parByHole={parByHole} mySide={mySide} isSpectator={isSpectator}
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

      {done && outcome === 'win' && !smashSeen && !isSpectator && data.progression && (
        <WinSmash
          winnerName={myName}
          winnerPhoto={meIsCreator ? data.creator_photo_url : data.opponent_photo_url}
          loserName={theirName}
          loserPhoto={meIsCreator ? data.opponent_photo_url : data.creator_photo_url}
          delta={data.progression.final_delta}
          youWon
          onDone={() => setSmashSeen(true)}
        />
      )}
    </View>
  );
}

function HoleSide({ name, gross, net, strokes, won, you, wonColor, wonGlow, stepKey }: {
  name: string; gross: number; net: number; strokes: number; won: boolean; you?: boolean;
  // Broadcast override (spectators): the player's color instead of win-green.
  wonColor?: string; wonGlow?: string; stepKey: number;
}) {
  const colors = cinematicColors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const shown = useCountUp(gross, { from: 0, resetKey: stepKey });
  const wonWrap = won && (wonColor ? { borderColor: wonColor, backgroundColor: wonGlow } : styles.sideWonWrap);
  const wonText = won && (wonColor ? { color: wonColor } : styles.sideWonText);
  // In broadcast mode (wonColor present) stroke dots go neutral — accent dots
  // inside a player-colored card would read as the other player's mark.
  const dotTint = wonColor ? { backgroundColor: colors.muted } : null;
  return (
    <View style={[styles.side, wonWrap]}>
      <Text style={styles.sideLabel} numberOfLines={1}>{you ? 'You' : name}</Text>
      <Text style={[styles.sideGross, wonText]}>{shown}</Text>
      {strokes > 0 ? (
        <View style={styles.netRow}>
          <Text style={[styles.netText, wonText]}>net {net}</Text>
          <View style={styles.dots}>
            {Array.from({ length: strokes }).map((_, i) => <View key={i} style={[styles.dot, dotTint]} />)}
          </View>
        </View>
      ) : (
        <Text style={styles.netMuted}>no stroke</Text>
      )}
    </View>
  );
}

// ── How it unfolded ──────────────────────────────────────────────────────────
// Factual match-story stats straight from the progression — no editorializing.
// A genuinely wild match (3+ lead changes AND decided at the very end) earns a
// gold border; the data speaks for itself.
function storyFor(holes: HoleResult[], decidedOn: number | null): {
  leadChanges: number; squareHoles: number; decidedLine: string; classic: boolean;
} {
  let leadChanges = 0, squareHoles = 0;
  let prev = 0;
  let leader: number = 0; // sign of the current leader, 0 = nobody yet
  for (const h of holes) {
    const d = h.creator_delta;
    // Count a return to all square only when a lead was erased.
    if (d === 0 && prev !== 0) squareHoles++;
    const s = Math.sign(d);
    if (s !== 0 && leader !== 0 && s !== leader) leadChanges++;
    if (s !== 0) leader = s;
    prev = d;
  }
  const total = holes.length;
  const wentDistance = decidedOn == null || decidedOn >= total;
  const decidedLine = decidedOn != null && decidedOn < total
    ? `Closed out on hole ${decidedOn}`
    : Math.abs(prev) === 0 ? 'All square after the last hole' : 'Decided on the final hole';
  const classic = leadChanges >= 3 && wentDistance && Math.abs(prev) <= 1;
  return { leadChanges, squareHoles, decidedLine, classic };
}

function DramaCard({ holes, decidedOn, colors, styles }: {
  holes: HoleResult[]; decidedOn: number | null; colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  const s = useMemo(() => storyFor(holes, decidedOn), [holes, decidedOn]);
  if (holes.length === 0) return null; // forfeit/empty progression — no story to tell
  return (
    <Animated.View entering={FadeIn.duration(420)} style={[styles.dramaCard, s.classic && styles.dramaClassic]}>
      <Ionicons name={s.classic ? 'trophy' : 'analytics-outline'} size={18} color={s.classic ? colors.gold : colors.muted} />
      <View style={styles.dramaMid}>
        <Text style={styles.dramaVerdict}>How it unfolded</Text>
        <Text style={styles.dramaDetail}>
          {s.leadChanges} lead {s.leadChanges === 1 ? 'change' : 'changes'}
          {s.squareHoles > 0 ? ` · back to all square ${s.squareHoles}×` : ''} · {s.decidedLine.toLowerCase()}
        </Text>
      </View>
    </Animated.View>
  );
}

function RoundStats({ holes, parByHole, mySide, isSpectator, myName, theirName, myGross, theirGross, decidedOn, colors, styles }: {
  holes: HoleResult[]; parByHole: Record<number, number | null>; mySide: 'creator' | 'opponent'; isSpectator: boolean;
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
          {/* Spectators read named columns in broadcast colors, not Won/Lost. */}
          <StatCell label={isSpectator ? (myName.split(' ')[0] || 'Creator') : 'Won'} value={won} tone={isSpectator ? 'live' : 'accent'} styles={styles} />
          <StatCell label={isSpectator ? (theirName.split(' ')[0] || 'Opponent') : 'Lost'} value={lost} tone={isSpectator ? 'brand' : 'loss'} styles={styles} />
          <StatCell label="Halved" value={halved} tone="muted" styles={styles} />
        </View>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>{isSpectator ? `${myName.split(' ')[0] || 'Creator'}'s card` : 'Your card'}</Text>
        <View style={styles.statRow}>
          <StatCell label="Birdies+" value={eagles + birdies} tone="accent" styles={styles} />
          <StatCell label="Pars" value={pars} tone="text" styles={styles} />
          <StatCell label="Bogeys" value={bogeys} tone="text" styles={styles} />
          <StatCell label="Doubles+" value={doubles} tone="loss" styles={styles} />
        </View>
        <View style={styles.statsLine}>
          <Text style={styles.statsLineLabel}>Gross</Text>
          <Text style={styles.statsLineVal}>{myName.split(' ')[0] || 'You'} {myGross}  ·  {theirName.split(' ')[0] || 'Opponent'} {theirGross}</Text>
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
  label: string; value: number; tone: 'accent' | 'loss' | 'muted' | 'text' | 'live' | 'brand'; styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, styles[`tone_${tone}` as const]]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// A natural gross under par → the celebration word. Null at par or worse.
function subParLabel(gross: number, par: number): string | null {
  const under = par - gross;
  if (under <= 0) return null;
  if (under === 1) return 'Birdie';
  if (under === 2) return 'Eagle';
  if (under === 3) return 'Albatross';
  return 'Hole-out'; // 4+ under (e.g. ace on a par 5)
}

// ESPN-style win-probability area. Each column is split: the creator's share
// (live blue) from the bottom, the opponent's (accent) on top — the boundary
// traces the win-prob curve across the round. Oriented to the viewer's side so
// a participant watches THEIR line climb.
function WinProbGraph({ series, meIsCreator, isSpectator, myName, theirName, colors, styles }: {
  series: number[]; meIsCreator: boolean; isSpectator: boolean;
  myName: string; theirName: string; colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  // Viewer perspective: a participant sees their own probability rise.
  const mine = meIsCreator ? series : series.map((p) => 100 - p);
  // Match the established broadcast palette: spectator creator=live, opponent=
  // liveAlt; a participant sees their own win green vs loss red.
  const myColor = isSpectator ? colors.live : colors.win;
  const theirColor = isSpectator ? colors.liveAlt : colors.loss;
  const end = mine[mine.length - 1];
  const lead = end >= 50 ? myName : theirName;
  return (
    <Animated.View entering={FadeIn.duration(450)} style={styles.wpCard}>
      <Text style={styles.wpTitle}>Win probability</Text>
      <View style={styles.wpGraph}>
        {/* 50% reference line */}
        <View style={styles.wpMidline} pointerEvents="none" />
        {mine.map((p, i) => (
          <View key={i} style={styles.wpCol}>
            <View style={{ flex: Math.max(0, 100 - p), backgroundColor: theirColor, opacity: 0.55 }} />
            <View style={{ flex: Math.max(0, p), backgroundColor: myColor }} />
          </View>
        ))}
      </View>
      <Text style={styles.wpCaption}>
        {isSpectator ? `${lead.split(' ')[0]} was most likely to win` : end >= 50 ? 'You were favored down the stretch' : 'You fought from behind'}
      </Text>
    </Animated.View>
  );
}

function finalHeadline(o: Outcome): string {
  return o === 'win' ? 'You win' : o === 'loss' ? 'You lost' : 'All Square';
}
// Neutral headline for a spectator (mySide is anchored to the creator, so a
// 'win' outcome means the creator — myName — won).
function spectatorHeadline(o: Outcome, creatorName: string, opponentName: string): string {
  if (o === 'tie') return 'All Square';
  return `${o === 'win' ? creatorName : opponentName} wins`;
}
function deltaColor(delta: number, c: Palette) {
  if (delta > 0) return { color: c.win };
  if (delta < 0) return { color: c.loss };
  return { color: c.halve };
}
function holeOutcomeColor(h: HoleResult, mySide: 'creator' | 'opponent', c: Palette) {
  if (h.winner === 'tie') return { color: c.halve };
  return { color: h.winner === mySide ? c.win : c.loss };
}
function gradientFor(o: Outcome | null, c: Palette): readonly [string, string, string] {
  if (o === 'win') return [c.winGlow, c.bg, c.bg];
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
    chipWin: { backgroundColor: c.win, borderColor: c.win },
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
    sideWonWrap: { borderColor: c.win, backgroundColor: c.winGlow },
    sideLabel: { ...t.overline, color: c.muted },
    sideGross: { ...t.scoreBig, fontSize: 64, color: c.text },
    sideWonText: { color: c.win },
    netRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    netText: { ...t.bodySemiBold, color: c.text },
    netMuted: { ...t.caption, color: c.muted },
    dots: { flexDirection: 'row', gap: 3 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent },
    holeOutcome: { ...t.subheading, textAlign: 'center' },
    birdie: {
      flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6,
      backgroundColor: c.goldGlow, borderWidth: 1, borderColor: c.gold,
      borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4,
    },
    birdieText: { ...t.bodySemiBold, color: c.gold, fontSize: 14 },
    tapHint: { ...t.caption, color: c.muted, textAlign: 'center' },
    // Win-probability graph
    wpCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
    wpTitle: { ...t.overline, color: c.muted },
    wpGraph: { flexDirection: 'row', height: 88, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.bg },
    wpCol: { flex: 1, flexDirection: 'column' },
    wpMidline: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: c.border, zIndex: 1 },
    wpCaption: { ...t.caption, color: c.muted, textAlign: 'center' },
    finalScroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
    statsWrap: { gap: spacing.md },
    decided: { ...t.body, color: c.muted, textAlign: 'center' },
    // Milestone banner — championship gold, reserved for streaks/belts.
    milestone: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: c.goldGlow, borderWidth: 1, borderColor: c.gold,
      borderRadius: radius.lg, padding: spacing.md,
    },
    milestoneMid: { flex: 1, gap: 2 },
    milestoneTitle: { ...t.heading, color: c.gold },
    milestoneSub: { ...t.caption, color: c.muted },
    // Drama meter — the match's story in one verdict line.
    dramaCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      borderRadius: radius.lg, padding: spacing.md,
    },
    dramaClassic: { borderColor: c.gold, backgroundColor: c.goldGlow },
    dramaMid: { flex: 1, gap: 2 },
    dramaVerdict: { ...t.heading },
    dramaDetail: { ...t.caption, color: c.muted },
    statsCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
    statsTitle: { ...t.overline, color: c.muted },
    statRow: { flexDirection: 'row', justifyContent: 'space-between' },
    statCell: { flex: 1, alignItems: 'center', gap: 2 },
    statValue: { ...t.scoreBig, fontSize: 32 },
    statLabel: { ...t.overline, color: c.muted, fontSize: 11 },
    tone_accent: { color: c.win }, // "Won" / "Birdies+" stats — good = green
    tone_loss: { color: c.loss },
    tone_muted: { color: c.muted },
    tone_text: { color: c.text },
    tone_live: { color: c.live },   // broadcast: creator's column
    tone_brand: { color: c.accent },// broadcast: opponent's column
    legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    legendDot: { width: 9, height: 9, borderRadius: 5 },
    legendText: { ...t.caption, color: c.muted, marginRight: spacing.sm },
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
