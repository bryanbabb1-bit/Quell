import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import type { Match, HoleEntry } from '@/types';
import { holeRangeFor, MATCH_TYPE_LABELS } from '@/types';
import { colors, spacing, radius, typography } from '@/constants/theme';

const MIN_SCORE = 1;
const MAX_SCORE = 15;
const DEFAULT_SCORE = 4; // sensible baseline; the running total keeps mistakes visible

export default function ScoreEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const api = useApi();

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scores, setScores] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const m = await api.getMatch(id);
      setMatch(m);
      const range = holeRangeFor(m.match_type);
      const init: Record<number, number> = {};
      for (let h = range.min; h <= range.max; h++) init[h] = DEFAULT_SCORE;
      setScores(init);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load this match.');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const holes = useMemo(() => {
    if (!match) return [];
    const range = holeRangeFor(match.match_type);
    return Array.from({ length: range.count }, (_, i) => range.min + i);
  }, [match]);

  const total = useMemo(
    () => holes.reduce((sum, h) => sum + (scores[h] ?? 0), 0),
    [holes, scores]
  );

  const bump = (hole: number, delta: number) => {
    setScores((prev) => {
      const next = Math.min(MAX_SCORE, Math.max(MIN_SCORE, (prev[hole] ?? DEFAULT_SCORE) + delta));
      return { ...prev, [hole]: next };
    });
  };

  const submit = async () => {
    if (!match || submitting) return;
    const hole_scores: HoleEntry[] = holes.map((h) => ({ hole: h, gross: scores[h] ?? DEFAULT_SCORE }));
    setSubmitting(true);
    try {
      const res = await api.submitScorecard(match.id, hole_scores);
      if (res.status === 'completed') {
        // Both cards are in — straight to the reveal (replace so Back returns to detail).
        router.replace(`/(app)/match/${match.id}/reveal`);
      } else {
        Alert.alert(
          'Scores submitted',
          "Your card is locked in and hidden. We'll reveal the result once your opponent submits.",
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (e: any) {
      Alert.alert('Could not submit', e?.message ?? 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.fairway} size="large" /></View>;
  }
  if (error || !match) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error ?? 'Match not found.'}</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const alreadySubmitted = match.creator_id === userId
    ? !!match.creator_scorecard_id
    : !!match.opponent_scorecard_id;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{match.course_name}</Text>
        <Text style={styles.sub}>{match.tee_color} tees · {MATCH_TYPE_LABELS[match.match_type]}</Text>

        {alreadySubmitted && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={colors.fairway} />
            <Text style={styles.noticeText}>
              You've already submitted. Re-entering will overwrite your card.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          {holes.map((h) => (
            <View key={h} style={styles.holeRow}>
              <Text style={styles.holeLabel}>Hole {h}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => bump(h, -1)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="remove" size={22} color={colors.fairway} />
                </TouchableOpacity>
                <Text style={styles.score}>{scores[h] ?? DEFAULT_SCORE}</Text>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => bump(h, +1)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="add" size={22} color={colors.fairway} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total (gross)</Text>
          <Text style={styles.totalValue}>{total}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitDisabled]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color={colors.surface} size="small" />
            : <Text style={styles.submitText}>Submit scores</Text>}
        </TouchableOpacity>
        <Text style={styles.footNote}>Hidden from your opponent until you both submit.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  title: { ...typography.title, fontSize: 24 },
  sub: { ...typography.caption, marginBottom: spacing.sm },
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.sand, borderRadius: radius.md, padding: spacing.md,
  },
  noticeText: { ...typography.caption, color: colors.ink, flex: 1 },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, marginTop: spacing.sm,
  },
  holeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  holeLabel: { ...typography.bodySemiBold },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.fairway,
    alignItems: 'center', justifyContent: 'center',
  },
  score: { ...typography.title, fontSize: 22, minWidth: 32, textAlign: 'center' },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  totalLabel: { ...typography.body, color: colors.muted },
  totalValue: { ...typography.title, fontSize: 26, color: colors.fairway },
  footer: {
    padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surface, gap: spacing.xs,
  },
  submitBtn: {
    backgroundColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { ...typography.bodySemiBold, color: colors.surface },
  footNote: { ...typography.caption, textAlign: 'center' },
  errText: { ...typography.body, color: colors.muted },
  link: { ...typography.bodySemiBold, color: colors.fairway },
});
