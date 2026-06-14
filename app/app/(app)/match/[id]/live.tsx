import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { Avatar } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { holeRangeFor } from '@/types';
import type { LiveState } from '@/types';
import { spacing, radius, typography, fonts, type Palette } from '@/constants/theme';

// The live match view for a PLAYING-TOGETHER match. Participants post each hole
// as they play and watch the running tally; spectators follow read-only. Polls
// while live; once settled, hands off to the reveal recap.
const POLL_MS = 8000;

export default function LiveMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryHole, setEntryHole] = useState<number | null>(null);
  const [entryGross, setEntryGross] = useState(4);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setState(await api.getLive(id));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the live match.');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  // Poll while the match is live; stop once it settles.
  const statusRef = useRef<string | null>(null);
  statusRef.current = state?.status ?? null;
  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(() => {
      if (statusRef.current !== 'completed') load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]));

  const range = state?.match_type ? holeRangeFor(state.match_type) : null;
  // The viewer's next un-posted hole (participants only).
  const nextHole = useMemo(() => {
    if (!range || !state?.viewer_is_participant) return null;
    const done = new Set(state.your_holes);
    for (let h = range.min; h <= range.max; h++) if (!done.has(h)) return h;
    return null; // all posted
  }, [range, state]);

  useEffect(() => { if (entryHole == null && nextHole != null) setEntryHole(nextHole); }, [nextHole, entryHole]);

  const postHole = async () => {
    if (!id || entryHole == null || posting) return;
    setPosting(true);
    try {
      const next = await api.postLiveHole(id, entryHole, entryGross);
      haptics.success();
      setState(next);
      setEntryHole(null); // recompute to the next hole
      setEntryGross(4);
    } catch (e: any) {
      setError(e?.message ?? 'Could not post the hole.');
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.live} size="large" /></SafeAreaView>;
  if (error || !state) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="cellular-outline" size={36} color={colors.muted} />
        <Text style={styles.note}>{error ?? 'No live data.'}</Text>
        <TouchableOpacity onPress={load}><Text style={styles.link}>Try again</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  const r = state.running;
  const cFirst = state.creator_name.split(' ')[0];
  const oFirst = (state.opponent_name ?? 'Opponent').split(' ')[0];
  // Running scoreline, player-named (creator perspective delta).
  const standing = !r || r.creator_delta === 0 ? 'All Square'
    : r.creator_delta > 0 ? `${cFirst} ${r.creator_delta} Up` : `${oFirst} ${-r.creator_delta} Up`;
  const standingColor = !r || r.creator_delta === 0 ? colors.halve : r.creator_delta > 0 ? colors.live : colors.liveAlt;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header: LIVE + watchers */}
        <View style={styles.headRow}>
          {state.completed ? (
            <View style={styles.finalChip}><Text style={styles.finalChipText}>FINAL</Text></View>
          ) : (
            <View style={styles.liveChip}><View style={styles.liveDot} /><Text style={styles.liveChipText}>LIVE</Text></View>
          )}
          <View style={styles.watchers}>
            <Ionicons name="eye" size={15} color={colors.muted} />
            <Text style={styles.watchText}>{state.follower_count} watching</Text>
          </View>
        </View>

        {/* Players */}
        <View style={styles.playersRow}>
          <View style={styles.playerCol}>
            <Avatar name={state.creator_name} size={52} photoUrl={state.creator_photo_url} />
            <Text style={styles.playerName} numberOfLines={1}>{cFirst}</Text>
            <View style={[styles.dot, { backgroundColor: colors.live }]} />
          </View>
          <View style={styles.standingCol}>
            <Text style={[styles.standing, { color: standingColor }]}>{standing}</Text>
            {r && <Text style={styles.thru}>{r.holes_played > 0 ? `Thru ${r.holes_played}` : 'Not started'}{r.holes_remaining > 0 ? ` · ${r.holes_remaining} to play` : ''}</Text>}
            {state.completed && r?.final_delta && <Text style={styles.finalDelta}>{r.final_delta}</Text>}
          </View>
          <View style={styles.playerCol}>
            <Avatar name={state.opponent_name ?? 'Opponent'} size={52} photoUrl={state.opponent_photo_url} />
            <Text style={styles.playerName} numberOfLines={1}>{oFirst}</Text>
            <View style={[styles.dot, { backgroundColor: colors.liveAlt }]} />
          </View>
        </View>

        {/* Hole-by-hole strip */}
        {r && r.holes.length > 0 && (
          <View style={styles.timeline}>
            {r.holes.map((h) => {
              const tone = h.winner === 'creator' ? colors.live : h.winner === 'opponent' ? colors.liveAlt : colors.surfaceRaised;
              const on = h.winner !== 'tie';
              return (
                <View key={h.hole} style={[styles.holeChip, { backgroundColor: tone }]}>
                  <Text style={[styles.holeChipNum, on && { color: colors.bg }]}>{h.hole}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Participant entry */}
        {!state.completed && state.viewer_is_participant && range && (
          nextHole == null ? (
            <View style={styles.entryCard}>
              <Ionicons name="checkmark-circle" size={20} color={colors.win} />
              <Text style={styles.entryDone}>Your round is in. Waiting on {state.viewer_is_creator ? oFirst : cFirst} to finish.</Text>
            </View>
          ) : (
            <View style={styles.entryCard}>
              <Text style={styles.entryTitle}>Your score · Hole {entryHole ?? nextHole}</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => { haptics.select(); setEntryGross((g) => Math.max(1, g - 1)); }} accessibilityRole="button" accessibilityLabel="Lower score">
                  <Ionicons name="remove" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.grossNum}>{entryGross}</Text>
                <TouchableOpacity style={styles.stepBtn} onPress={() => { haptics.select(); setEntryGross((g) => Math.min(15, g + 1)); }} accessibilityRole="button" accessibilityLabel="Raise score">
                  <Ionicons name="add" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.postBtn} onPress={postHole} disabled={posting} accessibilityRole="button" accessibilityLabel={`Post hole ${entryHole ?? nextHole}, score ${entryGross}`}>
                {posting ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.postText}>Post hole {entryHole ?? nextHole}</Text>}
              </TouchableOpacity>
            </View>
          )
        )}

        {/* Spectator note / completed handoff */}
        {!state.viewer_is_participant && !state.completed && (
          <Text style={styles.note}>Following live — updates every few seconds.</Text>
        )}
        {state.completed && (
          <TouchableOpacity style={styles.recapBtn} onPress={() => router.replace(`/(app)/match/${id}/reveal`)} accessibilityRole="button" accessibilityLabel="See the full recap">
            <Ionicons name="trophy-outline" size={18} color={colors.onAccent} />
            <Text style={styles.recapText}>See the full recap</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: c.bg, padding: spacing.lg },
    container: { padding: spacing.lg, gap: spacing.lg },
    note: { ...typography.caption, color: c.muted, textAlign: 'center' },
    link: { ...typography.bodySemiBold, color: c.live },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    liveChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.live, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.scheme === 'dark' ? c.bg : '#FFFFFF' },
    liveChipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: c.scheme === 'dark' ? c.bg : '#FFFFFF', letterSpacing: 0.5 },
    finalChip: { backgroundColor: c.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
    finalChipText: { fontFamily: fonts.bodyBold, fontSize: 12, color: c.muted, letterSpacing: 0.5 },
    watchers: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    watchText: { ...typography.caption, color: c.muted },
    playersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    playerCol: { alignItems: 'center', gap: 4, width: 80 },
    playerName: { ...typography.bodySemiBold, fontSize: 14 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    standingCol: { flex: 1, alignItems: 'center', gap: 2 },
    standing: { fontFamily: fonts.displayXBold, fontSize: 30, letterSpacing: -0.5, textAlign: 'center' },
    thru: { ...typography.caption, color: c.muted },
    finalDelta: { ...typography.heading, color: c.text },
    timeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
    holeChip: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    holeChipNum: { ...typography.caption, fontSize: 12, color: c.muted, fontFamily: fonts.bodySemi },
    entryCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
    entryTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, color: c.muted },
    entryDone: { ...typography.body, color: c.text, textAlign: 'center', flex: 1 },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
    stepBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
    grossNum: { fontFamily: fonts.displayXBold, fontSize: 48, color: c.text, minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
    postBtn: { alignSelf: 'stretch', backgroundColor: c.live, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
    postText: { ...typography.bodySemiBold, color: c.scheme === 'dark' ? c.bg : '#FFFFFF' },
    recapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: c.accent, borderRadius: radius.md, paddingVertical: spacing.md },
    recapText: { ...typography.bodySemiBold, color: c.onAccent },
  });
}
