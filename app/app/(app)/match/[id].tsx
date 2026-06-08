import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import type { Match } from '@/types';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setMatch(await api.getMatch(id));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load this match.');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

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
        <Row icon="calendar-outline" label="When" value={formatPlayWhen(match.play_date, match.play_time)} />
        <Row icon="people-outline" label="Wants handicap" value={`${match.hcp_range_min}–${match.hcp_range_max}`} />
        {match.stakes != null && <Row icon="cash-outline" label="Stakes (context only)" value={`$${match.stakes}`} />}
      </View>

      {match.opponent_id && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Players</Text>
          <Row icon="person-outline" label={isCreator ? 'You (creator)' : 'Creator'} value={formatHandicap(match.creator_handicap)} />
          <Row icon="person-outline" label={isOpponent ? 'You (opponent)' : 'Opponent'} value={formatHandicap(match.opponent_handicap)} />
        </View>
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
            <Ionicons name="chatbubble-outline" size={18} color={colors.surface} />
            <Text style={styles.primaryText}>Message {isCreator ? 'opponent' : 'creator'}</Text>
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
  });
}
