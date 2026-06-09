import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import { haptics } from '@/lib/haptics';
import type { Match, HoleEntry, HoleInfo } from '@/types';
import { holeRangeFor, MATCH_TYPE_LABELS } from '@/types';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

const MIN_SCORE = 1;
const MAX_SCORE = 15;
const FALLBACK_SCORE = 4; // used only when a hole has no par (no course data)

export default function ScoreEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [match, setMatch] = useState<Match | null>(null);
  const [holesInfo, setHolesInfo] = useState<HoleInfo[]>([]);
  const [myStrokes, setMyStrokes] = useState<number[]>([]);
  const [parTotal, setParTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scores, setScores] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [m, setup] = await Promise.all([api.getMatch(id), api.getMatchHoles(id)]);
      setMatch(m);
      setHolesInfo(setup.holes);
      setMyStrokes(setup.my_strokes);
      setParTotal(setup.par_total);
      // Start each hole at par (or a neutral baseline when there's no course data).
      const init: Record<number, number> = {};
      for (const h of setup.holes) init[h.hole] = h.par ?? FALLBACK_SCORE;
      setScores(init);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load this match.');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const bump = (hole: number, delta: number) => {
    haptics.select();
    setScores((prev) => {
      const base = prev[hole] ?? FALLBACK_SCORE;
      return { ...prev, [hole]: Math.min(MAX_SCORE, Math.max(MIN_SCORE, base + delta)) };
    });
  };

  const grossTotal = useMemo(
    () => holesInfo.reduce((s, h) => s + (scores[h.hole] ?? 0), 0),
    [holesInfo, scores]
  );
  const strokesTotal = useMemo(() => myStrokes.reduce((s, n) => s + n, 0), [myStrokes]);
  const toPar = parTotal != null ? grossTotal - parTotal : null;

  const submit = async () => {
    if (!match || submitting) return;
    const hole_scores: HoleEntry[] = holesInfo.map((h) => ({ hole: h.hole, gross: scores[h.hole] ?? FALLBACK_SCORE }));
    haptics.medium();
    setSubmitting(true);
    try {
      const res = await api.submitScorecard(match.id, hole_scores);
      if (res.status === 'completed') {
        haptics.success();
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

  // Split into nines for the scorecard look (a 9-hole match is just one section).
  const front = holesInfo.filter((h) => h.hole <= 9);
  const back = holesInfo.filter((h) => h.hole >= 10);
  const sections = [
    { title: front.length && back.length ? 'Front' : 'Holes', rows: front.length ? front : holesInfo },
    ...(front.length && back.length ? [{ title: 'Back', rows: back }] : []),
  ];

  return (
    <View style={styles.flex}>
      {/* Running total header */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Gross</Text>
          <Text style={styles.summaryValue}>{grossTotal}</Text>
        </View>
        {toPar != null && (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>To par</Text>
            <Text style={[styles.summaryValue, toParColor(toPar, colors)]}>{toParText(toPar)}</Text>
          </View>
        )}
        {strokesTotal > 0 && (
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Net</Text>
            <Text style={styles.summaryValue}>{grossTotal - strokesTotal}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{match.course_name}</Text>
        <Text style={styles.sub}>{match.tee_color} tees · {MATCH_TYPE_LABELS[match.match_type]}</Text>

        {alreadySubmitted && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={colors.fairway} />
            <Text style={styles.noticeText}>You've already submitted. Re-entering overwrites your card.</Text>
          </View>
        )}
        {strokesTotal > 0 && (
          <Text style={styles.strokeHint}>
            <Text style={styles.dot}>●</Text> = a handicap stroke you receive on that hole ({strokesTotal} total).
          </Text>
        )}

        {sections.map((section, si) => {
          const subtotal = section.rows.reduce((s, h) => s + (scores[h.hole] ?? 0), 0);
          return (
            <View key={si} style={styles.card}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionSub}>{subtotal}</Text>
              </View>
              {section.rows.map((h) => {
                const idx = holesInfo.findIndex((x) => x.hole === h.hole);
                const strokes = myStrokes[idx] ?? 0;
                const gross = scores[h.hole] ?? FALLBACK_SCORE;
                const diff = h.par != null ? gross - h.par : null;
                return (
                  <View key={h.hole} style={styles.holeRow}>
                    <View style={styles.holeMeta}>
                      <Text style={styles.holeLabel}>Hole {h.hole}</Text>
                      <Text style={styles.parLabel}>
                        {h.par != null ? `Par ${h.par}` : '—'}
                        {strokes > 0 ? '  ' : ''}
                        {strokes > 0 && <Text style={styles.dot}>{'●'.repeat(strokes)}</Text>}
                      </Text>
                    </View>

                    <View style={styles.stepper}>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => bump(h.hole, -1)} hitSlop={hit}>
                        <Ionicons name="remove" size={20} color={colors.fairway} />
                      </TouchableOpacity>
                      <Text style={styles.score}>{gross}</Text>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => bump(h.hole, +1)} hitSlop={hit}>
                        <Ionicons name="add" size={20} color={colors.fairway} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.toParWrap}>
                      {diff != null && (
                        <Text style={[styles.toParChip, toParColor(diff, colors)]}>{toParText(diff)}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
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

const hit = { top: 8, bottom: 8, left: 8, right: 8 };

function toParText(diff: number): string {
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}
function toParColor(diff: number, colors: Palette) {
  if (diff < 0) return { color: colors.fairway };   // under par
  if (diff === 0) return { color: colors.muted };    // even
  return { color: colors.flagRed };                  // over par
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.paper },
  summary: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingVertical: spacing.md, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { ...typography.caption, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { ...typography.title, fontSize: 24 },
  container: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  title: { ...typography.title, fontSize: 22 },
  sub: { ...typography.caption, marginBottom: spacing.xs },
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.sand, borderRadius: radius.md, padding: spacing.md,
  },
  noticeText: { ...typography.caption, color: colors.ink, flex: 1 },
  strokeHint: { ...typography.caption, color: colors.muted },
  dot: { color: colors.fairway },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingBottom: spacing.xs, marginTop: spacing.sm,
  },
  sectionHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sectionTitle: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.muted },
  sectionSub: { ...typography.bodySemiBold, color: colors.ink },
  holeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  holeMeta: { width: 96 },
  holeLabel: { ...typography.bodySemiBold },
  parLabel: { ...typography.caption, fontSize: 12 },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stepBtn: {
    width: 38, height: 38, borderRadius: radius.md, borderWidth: 1, borderColor: colors.fairway,
    alignItems: 'center', justifyContent: 'center',
  },
  score: { ...typography.title, fontSize: 22, minWidth: 30, textAlign: 'center' },
  toParWrap: { width: 44, alignItems: 'flex-end' },
  toParChip: { ...typography.bodySemiBold, fontSize: 15 },
  footer: {
    padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surface, gap: spacing.xs,
  },
  submitBtn: { backgroundColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  submitDisabled: { opacity: 0.7 },
  submitText: { ...typography.bodySemiBold, color: colors.surface },
  footNote: { ...typography.caption, textAlign: 'center' },
  errText: { ...typography.body, color: colors.muted },
  link: { ...typography.bodySemiBold, color: colors.fairway },
  });
}
