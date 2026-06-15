import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { Avatar } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import type { LiveState, Gamecast, GamecastEvent, GamecastHole, CheerKind } from '@/types';
import { spacing, radius, typography, fonts, type Palette } from '@/constants/theme';

// The live GAMECAST for a same-group match — built to be watched. Participants
// keep the card (either player can enter both sides) and confirm at the end;
// spectators follow the running match, play-by-play, win-prob, and scorecard,
// and toss cheers. Polls while live; hands to the reveal recap once settled.
const POLL_MS = 8000;
const CHEERS: { kind: CheerKind; emoji: string }[] = [
  { kind: 'fire', emoji: '🔥' }, { kind: 'clap', emoji: '👏' },
  { kind: 'flag', emoji: '⛳' }, { kind: 'shock', emoji: '😱' },
];

const toParStr = (n: number | null): string => (n == null ? '' : n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

export default function LiveMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<{ hole: number; creator: number; opponent: number } | null>(null);
  const [posting, setPosting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setError(null); setState(await api.getLive(id)); }
    catch (e: any) { setError(e?.message ?? 'Could not load the live match.'); }
    finally { setLoading(false); }
  }, [api, id]);

  const statusRef = useRef<string | null>(null);
  statusRef.current = state?.status ?? null;
  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(() => { if (statusRef.current !== 'completed') load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]));

  const r = state?.running ?? null;

  // Seed the entry steppers to the current hole (existing scores or par).
  useEffect(() => {
    if (!r || !state?.viewer_is_participant || state.awaiting_confirmation) { setEntry(null); return; }
    const h = r.current_hole;
    if (h == null) { setEntry(null); return; }
    setEntry((prev) => {
      if (prev?.hole === h) return prev;
      const gh = r.holes.find((x) => x.hole === h);
      const par = gh?.par ?? 4;
      return { hole: h, creator: gh?.creator_gross ?? par, opponent: gh?.opponent_gross ?? par };
    });
  }, [r?.current_hole, state?.viewer_is_participant, state?.awaiting_confirmation]);

  const postHole = async () => {
    if (!id || !entry || posting) return;
    setPosting(true);
    try {
      const next = await api.postLiveHole(id, entry.hole, { creator_gross: entry.creator, opponent_gross: entry.opponent });
      haptics.success();
      setState(next);
    } catch (e: any) { Alert.alert('Could not post', e?.message ?? 'Try again.'); }
    finally { setPosting(false); }
  };

  const confirm = async () => {
    if (!id || confirming) return;
    setConfirming(true);
    try { setState(await api.confirmCard(id)); haptics.success(); }
    catch (e: any) { Alert.alert('Could not confirm', e?.message ?? 'Try again.'); }
    finally { setConfirming(false); }
  };

  const onCheer = (kind: CheerKind) => {
    if (!id) return;
    haptics.select();
    setState((s) => s ? { ...s, reactions: { ...s.reactions, [kind]: (s.reactions[kind] ?? 0) + 1 } } : s);
    api.sendCheer(id, kind).catch(() => {});
  };

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></SafeAreaView>;
  if (error || !state) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="cellular-outline" size={36} color={colors.muted} />
        <Text style={styles.note}>{error ?? 'No live data.'}</Text>
        <TouchableOpacity onPress={load}><Text style={styles.link}>Try again</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  const cName = state.creator_name.split(' ')[0];
  const oName = (state.opponent_name ?? 'Opponent').split(' ')[0];
  const standing = !r || r.creator_delta === 0 ? 'ALL SQUARE'
    : r.creator_delta > 0 ? `${cName.toUpperCase()} ${r.creator_delta} UP` : `${oName.toUpperCase()} ${-r.creator_delta} UP`;
  const standingColor = !r || r.creator_delta === 0 ? colors.text : r.creator_delta > 0 ? colors.sideA : colors.sideB;
  const winPct = r && r.win_prob.length ? r.win_prob[r.win_prob.length - 1] : 50;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headRow}>
          {state.completed ? (
            <View style={styles.finalChip}><Text style={styles.finalChipText}>FINAL</Text></View>
          ) : state.awaiting_confirmation ? (
            <View style={styles.confChip}><Text style={styles.confChipText}>CONFIRMING</Text></View>
          ) : (
            <View style={styles.liveChip}><View style={styles.liveDot} /><Text style={styles.liveChipText}>LIVE</Text></View>
          )}
          <FollowerStack state={state} colors={colors} styles={styles} />
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <PlayerCol name={cName} photo={state.creator_photo_url} toPar={r?.creator_to_par ?? null}
            side={colors.sideA} leading={r?.leader === 'creator'} colors={colors} styles={styles} />
          <View style={styles.heroMid}>
            <Text style={[styles.standing, { color: standingColor }]} numberOfLines={1}>{standing}</Text>
            {r && <Text style={styles.thru}>{r.holes_played > 0 ? `Thru ${r.holes_played}` : 'Not started'}{r.holes_remaining > 0 ? ` · ${r.holes_remaining} to play` : ''}</Text>}
            {r?.momentum.side && r.momentum.won >= 2 && (
              <View style={styles.momentum}>
                <Ionicons name="flame" size={12} color={r.momentum.side === 'creator' ? colors.sideA : colors.sideB} />
                <Text style={styles.momentumText}>{(r.momentum.side === 'creator' ? cName : oName)} won {r.momentum.won} of last {r.momentum.of}</Text>
              </View>
            )}
          </View>
          <PlayerCol name={oName} photo={state.opponent_photo_url} toPar={r?.opponent_to_par ?? null}
            side={colors.sideB} leading={r?.leader === 'opponent'} colors={colors} styles={styles} />
        </View>

        {/* Win-probability bar */}
        {r && r.holes_played > 0 && !state.completed && (
          <View style={styles.winWrap}>
            <View style={styles.winBar}>
              <View style={{ flex: Math.max(0, winPct), backgroundColor: colors.sideA }} />
              <View style={{ flex: Math.max(0, 100 - winPct), backgroundColor: colors.sideB }} />
            </View>
            <Text style={styles.winLabel}>
              {winPct >= 50 ? `${cName} ${winPct}%` : `${oName} ${100 - winPct}%`} to win
            </Text>
          </View>
        )}

        {/* Awaiting confirmation OR current-hole spotlight + entry */}
        {state.awaiting_confirmation ? (
          <ConfirmPanel state={state} cName={cName} oName={oName} confirming={confirming} onConfirm={confirm} colors={colors} styles={styles} />
        ) : !state.completed && r && r.current_hole != null ? (
          <SpotlightAndEntry
            r={r} entry={entry} setEntry={setEntry} posting={posting} onPost={postHole}
            isParticipant={state.viewer_is_participant} cName={cName} oName={oName} colors={colors} styles={styles}
          />
        ) : null}

        {/* Play-by-play */}
        {r && r.events.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Play-by-play</Text>
            <View style={styles.card}>
              {[...r.events].reverse().slice(0, 14).map((e, i) => (
                <PlayByPlayRow key={`${e.hole}-${e.kind}-${i}`} e={e} holes={r.holes} cName={cName} oName={oName}
                  divider={i > 0} colors={colors} styles={styles} />
              ))}
            </View>
          </View>
        )}

        {/* Scorecard */}
        {r && r.holes_played > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Scorecard</Text>
            <ScoreGrid r={r} cName={cName} oName={oName} colors={colors} styles={styles} />
          </View>
        )}

        {/* Recap handoff */}
        {state.completed && (
          <TouchableOpacity style={styles.recapBtn} onPress={() => router.replace(`/(app)/match/${id}/reveal`)} accessibilityRole="button" accessibilityLabel="See the full recap">
            <Ionicons name="trophy-outline" size={18} color={colors.onAccent} />
            <Text style={styles.recapText}>See the full recap</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Cheers bar (spectators + players) */}
      {!state.completed && <CheerBar reactions={state.reactions} onCheer={onCheer} colors={colors} styles={styles} />}
    </SafeAreaView>
  );
}

function PlayerCol({ name, photo, toPar, side, leading, colors, styles }: {
  name: string; photo: string | null; toPar: number | null; side: string; leading: boolean;
  colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.playerCol}>
      <View style={[styles.avatarRing, { borderColor: side }, leading && styles.avatarRingLead]}>
        <Avatar name={name} size={50} photoUrl={photo} />
      </View>
      <Text style={styles.playerName} numberOfLines={1}>{name}</Text>
      <View style={styles.playerMetaRow}>
        <View style={[styles.sideDot, { backgroundColor: side }]} />
        {toPar != null && <Text style={[styles.toPar, toPar < 0 && { color: colors.gold }]}>{toParStr(toPar)}</Text>}
        {leading && <Ionicons name="caret-up" size={12} color={colors.gold} />}
      </View>
    </View>
  );
}

function FollowerStack({ state, colors, styles }: { state: LiveState; colors: Palette; styles: ReturnType<typeof makeStyles> }) {
  const faces = state.followers.slice(0, 4);
  if (state.follower_count === 0) return <Text style={styles.watchText}>Be the first to follow</Text>;
  return (
    <View style={styles.followers}>
      <View style={styles.faceStack}>
        {faces.map((f, i) => (
          <View key={i} style={[styles.face, { marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }]}>
            <Avatar name={f.name} size={24} photoUrl={f.photo_url} />
          </View>
        ))}
      </View>
      <Text style={styles.watchText}>{state.follower_count} following</Text>
    </View>
  );
}

function SpotlightAndEntry({ r, entry, setEntry, posting, onPost, isParticipant, cName, oName, colors, styles }: {
  r: Gamecast; entry: { hole: number; creator: number; opponent: number } | null;
  setEntry: (f: (p: any) => any) => void; posting: boolean; onPost: () => void; isParticipant: boolean;
  cName: string; oName: string; colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  const h = r.current_hole!;
  const gh = r.holes.find((x) => x.hole === h);
  const par = gh?.par ?? null;
  return (
    <View style={styles.spotlight}>
      <Text style={styles.spotHole}>HOLE {h}{par != null ? ` · PAR ${par}` : ''}</Text>
      {/* What's happened on it so far */}
      {gh && (gh.creator_gross != null || gh.opponent_gross != null) && (
        <Text style={styles.spotState}>
          {gh.creator_gross != null ? `${cName} made ${gh.creator_gross}. ` : `${cName} to play. `}
          {gh.opponent_gross != null ? `${oName} made ${gh.opponent_gross}.` : `${oName} to play.`}
        </Text>
      )}
      {isParticipant && entry && (
        <>
          <View style={styles.entryRow}>
            <Stepper label={cName} side={colors.sideA} value={entry.creator}
              onChange={(v) => setEntry((p) => p ? { ...p, creator: v } : p)} colors={colors} styles={styles} />
            <Stepper label={oName} side={colors.sideB} value={entry.opponent}
              onChange={(v) => setEntry((p) => p ? { ...p, opponent: v } : p)} colors={colors} styles={styles} />
          </View>
          <TouchableOpacity style={styles.postBtn} onPress={onPost} disabled={posting} accessibilityRole="button" accessibilityLabel={`Post hole ${h}`}>
            {posting ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.postText}>Post hole {h}</Text>}
          </TouchableOpacity>
          <Text style={styles.entryHint}>Whoever's keeping the card can log both scores.</Text>
        </>
      )}
    </View>
  );
}

function Stepper({ label, side, value, onChange, colors, styles }: {
  label: string; side: string; value: number; onChange: (v: number) => void; colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperHead}><View style={[styles.sideDot, { backgroundColor: side }]} /><Text style={styles.stepperLabel} numberOfLines={1}>{label}</Text></View>
      <View style={styles.stepperRow}>
        <TouchableOpacity style={styles.stepBtn} hitSlop={8} onPress={() => { haptics.select(); onChange(Math.max(1, value - 1)); }} accessibilityRole="button" accessibilityLabel={`${label} lower`}>
          <Ionicons name="remove" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.gross}>{value}</Text>
        <TouchableOpacity style={styles.stepBtn} hitSlop={8} onPress={() => { haptics.select(); onChange(Math.min(15, value + 1)); }} accessibilityRole="button" accessibilityLabel={`${label} raise`}>
          <Ionicons name="add" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ConfirmPanel({ state, cName, oName, confirming, onConfirm, colors, styles }: {
  state: LiveState; cName: string; oName: string; confirming: boolean; onConfirm: () => void;
  colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  const youConfirmed = state.viewer_is_creator ? state.creator_confirmed : state.opponent_confirmed;
  return (
    <View style={styles.confirmCard}>
      <Text style={styles.confirmTitle}>Round complete — confirm the card</Text>
      <Text style={styles.note}>Both players check the scorecard below, then confirm. Once you both do, the result is final.</Text>
      <View style={styles.confirmRow}>
        <ConfirmPill name={cName} done={state.creator_confirmed} colors={colors} styles={styles} />
        <ConfirmPill name={oName} done={state.opponent_confirmed} colors={colors} styles={styles} />
      </View>
      {state.viewer_is_participant && !youConfirmed && (
        <TouchableOpacity style={styles.postBtn} onPress={onConfirm} disabled={confirming} accessibilityRole="button" accessibilityLabel="Confirm the card">
          {confirming ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.postText}>Confirm the card</Text>}
        </TouchableOpacity>
      )}
      {state.viewer_is_participant && youConfirmed && <Text style={styles.entryHint}>You confirmed. Waiting on the other player.</Text>}
      {!state.viewer_is_participant && <Text style={styles.entryHint}>The players are confirming the card…</Text>}
    </View>
  );
}

function ConfirmPill({ name, done, colors, styles }: { name: string; done: boolean; colors: Palette; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={[styles.confirmPill, done && styles.confirmPillDone]}>
      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={done ? colors.win : colors.muted} />
      <Text style={[styles.confirmPillText, done && { color: colors.win }]}>{name}</Text>
    </View>
  );
}

function PlayByPlayRow({ e, holes, cName, oName, divider, colors, styles }: {
  e: GamecastEvent; holes: GamecastHole[]; cName: string; oName: string; divider: boolean;
  colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  const gh = holes.find((h) => h.hole === e.hole);
  const status = gh?.status_label ?? '';
  const sideName = e.side === 'creator' ? cName : e.side === 'opponent' ? oName : '';
  const scoreWord = e.score_name === 'eagle' ? 'eagle' : e.score_name === 'birdie' ? 'birdie'
    : e.score_name === 'par' ? 'par' : e.score_name === 'bogey' ? 'bogey' : e.score_name === 'double' ? 'double' : '';
  const isBird = e.score_name === 'birdie' || e.score_name === 'eagle';

  let icon: any = 'golf-outline'; let tint = colors.muted; let text = '';
  if (e.kind === 'lead_change') { icon = 'flash'; tint = colors.gold; text = `Lead change — ${sideName} goes ${status.replace(' Up', ' up')}`; }
  else if (e.kind === 'closeout') { icon = 'trophy'; tint = colors.gold; text = `${sideName} closes it out`; }
  else if (e.kind === 'halve') { icon = 'remove-outline'; tint = colors.muted; text = `Halved${scoreWord ? ` with ${scoreWord}s` : ''}`; }
  else { icon = isBird ? 'sparkles' : 'caret-up'; tint = isBird ? colors.gold : (e.side === 'creator' ? colors.sideA : colors.sideB); text = `${sideName} wins${scoreWord ? ` with ${scoreWord}` : ''} — ${status.toLowerCase()}`; }

  return (
    <View style={[styles.pbpRow, divider && styles.rowDivider]}>
      <View style={styles.pbpHole}><Text style={styles.pbpHoleText}>{e.hole}</Text></View>
      <Ionicons name={icon} size={15} color={tint} />
      <Text style={[styles.pbpText, isBird && { color: colors.gold }]} numberOfLines={2}>{text}</Text>
    </View>
  );
}

function ScoreGrid({ r, cName, oName, colors, styles }: {
  r: Gamecast; cName: string; oName: string; colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  const played = r.holes.filter((h) => h.winner != null);
  const cell = (gh: GamecastHole, who: 'creator' | 'opponent') => {
    const g = who === 'creator' ? gh.creator_gross : gh.opponent_gross;
    const tp = who === 'creator' ? gh.creator_to_par : gh.opponent_to_par;
    const won = gh.winner === who;
    return (
      <View key={gh.hole} style={[styles.gCell, won && styles.gCellWon]}>
        <Text style={[styles.gScore, tp != null && tp < 0 && { color: colors.gold }, won && styles.gScoreWon]}>{g ?? '–'}</Text>
      </View>
    );
  };
  return (
    <View style={styles.gridWrap}>
      <View style={styles.gridLabels}>
        <View style={styles.gRow}><Text style={styles.gLabel}>Hole</Text></View>
        <View style={styles.gRow}><Text style={styles.gLabel}>Par</Text></View>
        <View style={styles.gRow}><View style={[styles.sideDot, { backgroundColor: colors.sideA }]} /><Text style={styles.gLabelName} numberOfLines={1}>{cName}</Text></View>
        <View style={styles.gRow}><View style={[styles.sideDot, { backgroundColor: colors.sideB }]} /><Text style={styles.gLabelName} numberOfLines={1}>{oName}</Text></View>
        <View style={styles.gRow}><Text style={styles.gLabel}>Match</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.gRow}>{played.map((h) => <View key={h.hole} style={styles.gCell}><Text style={styles.gHead}>{h.hole}</Text></View>)}</View>
          <View style={styles.gRow}>{played.map((h) => <View key={h.hole} style={styles.gCell}><Text style={styles.gPar}>{h.par ?? '–'}</Text></View>)}</View>
          <View style={styles.gRow}>{played.map((h) => cell(h, 'creator'))}</View>
          <View style={styles.gRow}>{played.map((h) => cell(h, 'opponent'))}</View>
          <View style={styles.gRow}>{played.map((h) => (
            <View key={h.hole} style={styles.gCell}>
              <Text style={styles.gMatch}>{h.creator_delta === 0 ? 'AS' : `${Math.abs(h.creator_delta ?? 0)}${(h.creator_delta ?? 0) > 0 ? '↑' : '↓'}`}</Text>
            </View>
          ))}</View>
        </View>
      </ScrollView>
    </View>
  );
}

function CheerBar({ reactions, onCheer, colors, styles }: {
  reactions: Partial<Record<CheerKind, number>>; onCheer: (k: CheerKind) => void;
  colors: Palette; styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.cheerBar}>
      {CHEERS.map(({ kind, emoji }) => (
        <Floating key={kind} emoji={emoji} count={reactions[kind] ?? 0} onPress={() => onCheer(kind)} styles={styles} />
      ))}
    </View>
  );
}

function Floating({ emoji, count, onPress, styles }: { emoji: string; count: number; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  const y = useSharedValue(0);
  const op = useSharedValue(0);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: op.value }));
  const fire = () => {
    y.value = 0; op.value = 1;
    y.value = withTiming(-70, { duration: 900, easing: Easing.out(Easing.quad) });
    op.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 820 }));
  };
  return (
    <TouchableOpacity style={styles.cheerBtn} hitSlop={8} onPress={() => { fire(); onPress(); }} accessibilityRole="button" accessibilityLabel={`React ${emoji}`}>
      <Animated.Text style={[styles.cheerFloat, aStyle]}>{emoji}</Animated.Text>
      <Text style={styles.cheerEmoji}>{emoji}</Text>
      {count > 0 && <Text style={styles.cheerCount}>{count}</Text>}
    </TouchableOpacity>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: c.bg, padding: spacing.lg },
    container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 96 },
    note: { ...typography.caption, color: c.muted, textAlign: 'center' },
    link: { ...typography.bodySemiBold, color: c.accent },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    liveChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.sideA, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
    liveChipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#FFFFFF', letterSpacing: 0.5 },
    finalChip: { backgroundColor: c.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
    finalChipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: c.muted, letterSpacing: 0.5 },
    confChip: { backgroundColor: c.liveGlow, borderWidth: 1, borderColor: c.live, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3 },
    confChipText: { fontFamily: fonts.bodyBold, fontSize: 11, color: c.live, letterSpacing: 0.5 },
    followers: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    faceStack: { flexDirection: 'row' },
    face: { borderWidth: 2, borderColor: c.bg, borderRadius: 14 },
    watchText: { ...typography.caption, color: c.muted },
    // Hero
    hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
    playerCol: { alignItems: 'center', gap: 4, width: 92 },
    avatarRing: { borderWidth: 2, borderRadius: 30, padding: 2 },
    avatarRingLead: { borderWidth: 2.5 },
    playerName: { ...typography.bodySemiBold, fontSize: 14 },
    playerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sideDot: { width: 8, height: 8, borderRadius: 4 },
    toPar: { ...typography.caption, color: c.text, fontVariant: ['tabular-nums'] },
    heroMid: { flex: 1, alignItems: 'center', gap: 3 },
    standing: { fontFamily: fonts.displayXBold, fontSize: 24, letterSpacing: -0.5, textAlign: 'center' },
    thru: { ...typography.caption, color: c.muted },
    momentum: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    momentumText: { ...typography.caption, fontSize: 11, color: c.muted },
    // Win bar
    winWrap: { gap: 4 },
    winBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: c.surfaceRaised },
    winLabel: { ...typography.caption, fontSize: 11, color: c.muted, textAlign: 'center', fontVariant: ['tabular-nums'] },
    // Spotlight + entry
    spotlight: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, alignItems: 'center' },
    spotHole: { fontFamily: fonts.displayXBold, fontSize: 16, color: c.text, letterSpacing: 0.5 },
    spotState: { ...typography.caption, color: c.muted, textAlign: 'center' },
    entryRow: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch' },
    stepper: { flex: 1, alignItems: 'center', gap: spacing.xs },
    stepperHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    stepperLabel: { ...typography.caption, color: c.text, fontFamily: fonts.bodySemi },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
    gross: { fontFamily: fonts.displayXBold, fontSize: 32, color: c.text, minWidth: 40, textAlign: 'center', fontVariant: ['tabular-nums'] },
    postBtn: { alignSelf: 'stretch', backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xs },
    postText: { ...typography.bodySemiBold, color: c.onAccent },
    entryHint: { ...typography.caption, color: c.muted, textAlign: 'center' },
    // Confirm
    confirmCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.gold, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    confirmTitle: { ...typography.heading, fontSize: 18, color: c.text },
    confirmRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.xs },
    confirmPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, paddingVertical: spacing.sm },
    confirmPillDone: { borderColor: c.win, backgroundColor: c.winGlow },
    confirmPillText: { ...typography.bodySemiBold, color: c.muted },
    // Sections
    section: { gap: spacing.sm },
    sectionTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, color: c.text },
    card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    // Play-by-play
    pbpRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
    pbpHole: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
    pbpHoleText: { ...typography.caption, fontSize: 12, color: c.muted, fontFamily: fonts.bodySemi },
    pbpText: { ...typography.body, fontSize: 14, color: c.text, flex: 1 },
    // Scorecard grid
    gridWrap: { flexDirection: 'row', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, overflow: 'hidden' },
    gridLabels: { borderRightWidth: 1, borderRightColor: c.border },
    gRow: { flexDirection: 'row', height: 30, alignItems: 'center' },
    gLabel: { ...typography.caption, fontSize: 11, color: c.muted, width: 76, paddingLeft: spacing.sm },
    gLabelName: { ...typography.caption, fontSize: 12, color: c.text, width: 60, paddingLeft: 4 },
    gCell: { width: 30, alignItems: 'center', justifyContent: 'center' },
    gCellWon: { backgroundColor: c.surfaceRaised },
    gHead: { ...typography.caption, fontSize: 11, color: c.muted, fontFamily: fonts.bodySemi },
    gPar: { ...typography.caption, fontSize: 11, color: c.muted },
    gScore: { ...typography.body, fontSize: 13, color: c.text, fontVariant: ['tabular-nums'] },
    gScoreWon: { fontFamily: fonts.bodyBold },
    gMatch: { ...typography.caption, fontSize: 11, color: c.muted, fontVariant: ['tabular-nums'] },
    // Recap
    recapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.sm },
    recapText: { ...typography.bodySemiBold, color: c.onAccent },
    // Cheers
    cheerBar: { position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg, flexDirection: 'row', justifyContent: 'space-around', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, paddingVertical: spacing.sm, ...elevationFloating() },
    cheerBtn: { alignItems: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: spacing.sm },
    cheerEmoji: { fontSize: 22 },
    cheerCount: { ...typography.caption, color: c.muted, fontVariant: ['tabular-nums'] },
    cheerFloat: { position: 'absolute', top: -6, alignSelf: 'center', fontSize: 22 },
  });
}

// Inline floating-bar shadow (avoids importing elevation just for this).
function elevationFloating() {
  return { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 };
}
