import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import type { Match, HolesSetup } from '@/types';
import { MATCH_TYPE_LABELS } from '@/types';
import { spacing, radius, typography, type Palette } from '@/constants/theme';
import { formatHandicap, formatPlayWhen, STATUS_LABELS } from '@/lib/format';

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [match, setMatch] = useState<Match | null>(null);
  const [hsetup, setHsetup] = useState<HolesSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const m = await api.getMatch(id);
      setMatch(m);
      // Pull the computed course handicaps for this tee/segment (participants only).
      if (m.creator_id === userId || m.opponent_id === userId) {
        api.getMatchHoles(id).then(setHsetup).catch(() => {});
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not load this match.');
    } finally {
      setLoading(false);
    }
  }, [api, id, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // While a match is live, poll so it flips to "Reveal ready" on its own the
  // moment the opponent submits — no manual refresh needed.
  useEffect(() => {
    const s = match?.status;
    if (s !== 'accepted' && s !== 'in_progress') return;
    const t = setInterval(() => { load(); }, 5000);
    return () => clearInterval(t);
  }, [match?.status, load]);

  const act = async (fn: () => Promise<Match>, confirmLabel: string) => {
    Alert.alert(confirmLabel, 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes', style: 'destructive', onPress: async () => {
          setActing(true);
          try { setMatch(await fn()); } catch (e: any) { Alert.alert('Failed', e?.message ?? 'Try again.'); }
          finally { setActing(false); }
        },
      },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.fairway} size="large" /></View>;
  if (error || !match) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error ?? 'Match not found.'}</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const isCreator = match.creator_id === userId;
  const isOpponent = match.opponent_id === userId;
  const isParticipant = isCreator || isOpponent;
  const mySubmitted = isCreator ? !!match.creator_scorecard_id : !!match.opponent_scorecard_id;
  const oppSubmitted = isCreator ? !!match.opponent_scorecard_id : !!match.creator_scorecard_id;
  const scoringStage =
    match.status === 'accepted' || match.status === 'in_progress' || match.status === 'completed';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.course}>{match.course_name}</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>{STATUS_LABELS[match.status]}</Text></View>
      </View>
      <Text style={styles.sub}>{match.tee_color} tees · {MATCH_TYPE_LABELS[match.match_type]}</Text>

      <View style={styles.card}>
        <Row icon="calendar-outline" label="When" value={formatPlayWhen(match.play_date)} />
        <Row icon="people-outline" label="Wants handicap" value={`${match.hcp_range_min}–${match.hcp_range_max}`} />
      </View>

      {match.opponent_id && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Players</Text>
          <Row
            icon="person-outline"
            label={`${match.creator_name ?? 'Creator'}${isCreator ? ' (You)' : ''}`}
            value={withCourseHcp(match.creator_handicap, hsetup?.creator_course_handicap)}
          />
          <Row
            icon="person-outline"
            label={`${match.opponent_name ?? 'Opponent'}${isOpponent ? ' (You)' : ''}`}
            value={withCourseHcp(match.opponent_handicap, hsetup?.opponent_course_handicap)}
          />
          {hsetup?.creator_course_handicap != null && (
            <Text style={styles.note}>
              Index → Course Handicap for {match.tee_color} tees, {MATCH_TYPE_LABELS[match.match_type]}.
              Strokes are given on the difference.
            </Text>
          )}
        </View>
      )}

      {isParticipant && hsetup?.has_course_data && (
        <PopsPreview
          hsetup={hsetup}
          creatorName={`${match.creator_name ?? 'Creator'}${isCreator ? ' (You)' : ''}`}
          opponentName={`${match.opponent_name ?? 'Opponent'}${isOpponent ? ' (You)' : ''}`}
        />
      )}

      {isParticipant && scoringStage && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scores</Text>

          {match.status === 'completed' ? (
            <>
              <Text style={styles.note}>Both cards are in. See how it played out hole by hole.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(`/(app)/match/${match.id}/reveal`)}>
                <Ionicons name="trophy-outline" size={18} color={colors.surface} />
                <Text style={styles.primaryText}>View the reveal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/(app)/match/${match.id}/scorecard`)}>
                <Text style={styles.secondaryText}>Head-to-head scorecard</Text>
              </TouchableOpacity>
            </>
          ) : !mySubmitted ? (
            <>
              <Text style={styles.note}>Enter your hole-by-hole gross scores. They stay hidden until your opponent submits too.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(`/(app)/match/${match.id}/score`)}>
                <Ionicons name="create-outline" size={18} color={colors.surface} />
                <Text style={styles.primaryText}>Enter your scores</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.statusRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.fairway} />
                <Text style={styles.statusText}>
                  Submitted{oppSubmitted ? '' : ` — waiting on the ${isCreator ? 'opponent' : 'creator'} to finish.`}
                </Text>
              </View>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/(app)/match/${match.id}/score`)}>
                <Text style={styles.secondaryText}>Edit my scores</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        {isParticipant && (match.status === 'accepted' || match.status === 'in_progress') && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(`/(app)/match/${match.id}/messages`)}>
            <Ionicons name="chatbubble-outline" size={18} color={colors.onAccent} />
            <Text style={styles.primaryText}>Message {(isCreator ? match.opponent_name : match.creator_name) ?? (isCreator ? 'opponent' : 'creator')}</Text>
          </TouchableOpacity>
        )}
        {isCreator && (match.status === 'open' || match.status === 'accepted') && (
          <TouchableOpacity style={styles.dangerBtn} disabled={acting} onPress={() => act(() => api.cancelMatch(match.id), 'Cancel match')}>
            <Text style={styles.dangerText}>Cancel match</Text>
          </TouchableOpacity>
        )}
        {isOpponent && match.status === 'accepted' && (
          <TouchableOpacity style={styles.dangerBtn} disabled={acting} onPress={() => act(() => api.declineMatch(match.id), 'Back out of match')}>
            <Text style={styles.dangerText}>Back out</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

// "8.4 · CH 9" — the player's Index and the computed Course Handicap for this match.
function withCourseHcp(index: number | null, courseHcp: number | null | undefined): string {
  const idx = formatHandicap(index);
  return courseHcp != null ? `${idx}  ·  CH ${courseHcp}` : idx;
}

// Scorecard-style preview of where each player receives handicap strokes. Frozen
// name column + horizontally-scrolling holes so it reads like a real card. Data
// comes from getMatchHoles (no scores revealed — safe before play).
const POP_ROW_H = 30;
const POP_CELL_W = 30;

function PopsPreview({ hsetup, creatorName, opponentName }: {
  hsetup: HolesSetup; creatorName: string; opponentName: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { holes, creator_strokes, opponent_strokes } = hsetup;
  const cSum = creator_strokes.reduce((a, b) => a + b, 0);
  const oSum = opponent_strokes.reduce((a, b) => a + b, 0);

  if (cSum === 0 && oSum === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pops — where strokes fall</Text>
        <Text style={styles.note}>Even match — neither player gets a stroke.</Text>
      </View>
    );
  }

  const dotRow = (strokes: number[]) => (
    <View style={styles.popRow}>
      {holes.map((h, i) => (
        <View key={h.hole} style={styles.popCell}>
          {strokes[i] > 0
            ? <Text style={styles.popDot}>{'●'.repeat(strokes[i])}</Text>
            : <Text style={styles.popEmpty}>·</Text>}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Pops — where strokes fall</Text>
      <Text style={styles.note}>● = a stroke received on that hole, given on the hardest holes by stroke index.</Text>

      <View style={styles.popWrap}>
        {/* Frozen name column */}
        <View>
          <View style={[styles.popRow, styles.popLabelCell]}><Text style={styles.popHeadLabel}>Hole</Text></View>
          <View style={[styles.popRow, styles.popLabelCell]}><Text style={styles.popSiLabel}>SI</Text></View>
          <View style={[styles.popRow, styles.popLabelCell]}>
            <Text style={styles.popName} numberOfLines={1}>{creatorName}</Text>
            <Text style={styles.popCount}>{cSum}</Text>
          </View>
          <View style={[styles.popRow, styles.popLabelCell]}>
            <Text style={styles.popName} numberOfLines={1}>{opponentName}</Text>
            <Text style={styles.popCount}>{oSum}</Text>
          </View>
        </View>

        {/* Scrolling holes */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.popRow}>
              {holes.map((h) => <View key={h.hole} style={styles.popCell}><Text style={styles.popHead}>{h.hole}</Text></View>)}
            </View>
            <View style={styles.popRow}>
              {holes.map((h) => <View key={h.hole} style={styles.popCell}><Text style={styles.popSi}>{h.stroke_index ?? '–'}</Text></View>)}
            </View>
            {dotRow(creator_strokes)}
            {dotRow(opponent_strokes)}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function Row({ icon, label, value }: { icon: any; label: string; value: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.paper },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  course: { ...typography.title, fontSize: 24, flexShrink: 1 },
  sub: { ...typography.caption, marginBottom: spacing.sm },
  badge: { borderWidth: 1, borderColor: colors.fairway, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.fairway },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, marginTop: spacing.sm },
  cardTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { ...typography.body, color: colors.muted, flex: 1 },
  rowValue: { ...typography.bodySemiBold },
  note: { ...typography.caption, color: colors.muted },
  primaryBtn: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...typography.bodySemiBold, color: colors.surface },
  secondaryBtn: { borderWidth: 1, borderColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryText: { ...typography.bodySemiBold, color: colors.fairway },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { ...typography.body, color: colors.ink, flex: 1 },
  dangerBtn: { borderWidth: 1, borderColor: colors.flagRed, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  dangerText: { ...typography.bodySemiBold, color: colors.flagRed },
  errText: { ...typography.body, color: colors.muted },
  link: { ...typography.bodySemiBold, color: colors.fairway },
  // Pops preview grid
  popWrap: { flexDirection: 'row', marginTop: spacing.xs },
  popRow: { flexDirection: 'row', height: POP_ROW_H, alignItems: 'center' },
  popLabelCell: { width: 132, paddingRight: spacing.sm, gap: spacing.xs },
  popCell: { width: POP_CELL_W, alignItems: 'center', justifyContent: 'center' },
  popHeadLabel: { ...typography.caption, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  popSiLabel: { ...typography.caption, color: colors.muted, fontSize: 11 },
  popHead: { ...typography.bodySemiBold, fontSize: 13, color: colors.muted },
  popSi: { ...typography.caption, fontSize: 11, color: colors.muted },
  popName: { ...typography.bodySemiBold, fontSize: 13, flex: 1 },
  popCount: { ...typography.bodySemiBold, fontSize: 13, color: colors.accent },
  popDot: { color: colors.accent, fontSize: 11, letterSpacing: -2 },
  popEmpty: { color: colors.border },
  });
}
