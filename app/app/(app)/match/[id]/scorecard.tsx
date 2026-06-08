import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import type { RevealResponse, HoleResult, HoleInfo } from '@/types';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

const CELL = 40;
const LABEL_W = 104;
const ROW_H = 44;

type Col = { kind: 'hole'; h: HoleResult } | { kind: 'out' } | { kind: 'in' } | { kind: 'tot' };

export default function ScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [data, setData] = useState<RevealResponse | null>(null);
  const [parByHole, setParByHole] = useState<Record<number, number | null>>({});
  const [siByHole, setSiByHole] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lock to landscape for the head-to-head grid; restore portrait on exit.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [reveal, holes] = await Promise.all([api.getReveal(id), api.getMatchHoles(id).catch(() => null)]);
      setData(reveal);
      if (holes) {
        const p: Record<number, number | null> = {};
        const s: Record<number, number | null> = {};
        for (const h of holes.holes) { p[h.hole] = h.par; s[h.hole] = h.stroke_index; }
        setParByHole(p); setSiByHole(s);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the scorecard.');
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.fairway} size="large" /></View>;
  if (error || !data || !data.progression) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error ?? 'No scored card to show yet.'}</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Back</Text></TouchableOpacity>
      </View>
    );
  }

  const meIsCreator = data.match.creator_id === userId;
  const holes = data.progression.holes;
  const youName = 'You';
  const themName = meIsCreator ? data.opponent_name : data.creator_name;

  // Per-player accessors (you first).
  const youGross = (h: HoleResult) => (meIsCreator ? h.creator_gross : h.opponent_gross);
  const youStrokes = (h: HoleResult) => (meIsCreator ? h.creator_strokes : h.opponent_strokes);
  const themGross = (h: HoleResult) => (meIsCreator ? h.opponent_gross : h.creator_gross);
  const themStrokes = (h: HoleResult) => (meIsCreator ? h.opponent_strokes : h.creator_strokes);
  const youWon = (h: HoleResult) => h.winner === (meIsCreator ? 'creator' : 'opponent');
  const themWon = (h: HoleResult) => h.winner === (meIsCreator ? 'opponent' : 'creator');

  const hasFront = holes.some((h) => h.hole <= 9);
  const hasBack = holes.some((h) => h.hole >= 10);
  const front = holes.filter((h) => h.hole <= 9);
  const back = holes.filter((h) => h.hole >= 10);

  // Build the column layout with OUT/IN/TOT breaks.
  const cols: Col[] = [];
  if (hasFront && hasBack) {
    front.forEach((h) => cols.push({ kind: 'hole', h }));
    cols.push({ kind: 'out' });
    back.forEach((h) => cols.push({ kind: 'hole', h }));
    cols.push({ kind: 'in' });
    cols.push({ kind: 'tot' });
  } else {
    holes.forEach((h) => cols.push({ kind: 'hole', h }));
    cols.push({ kind: 'tot' });
  }

  const sum = (arr: HoleResult[], f: (h: HoleResult) => number) => arr.reduce((a, h) => a + f(h), 0);
  const parSum = (arr: HoleResult[]) => arr.reduce((a, h) => a + (parByHole[h.hole] ?? 0), 0);

  const headerCell = (c: Col, i: number) => {
    if (c.kind === 'hole') return <Cell key={i} text={String(c.h.hole)} head />;
    return <Cell key={i} text={c.kind.toUpperCase()} head accent />;
  };
  const parCell = (c: Col, i: number) => {
    if (c.kind === 'hole') return <Cell key={i} text={parByHole[c.h.hole] != null ? String(parByHole[c.h.hole]) : '–'} />;
    const v = c.kind === 'out' ? parSum(front) : c.kind === 'in' ? parSum(back) : parSum(holes);
    return <Cell key={i} text={String(v)} accent />;
  };
  const siCell = (c: Col, i: number) => {
    if (c.kind === 'hole') return <Cell key={i} text={siByHole[c.h.hole] != null ? String(siByHole[c.h.hole]) : '–'} dim />;
    return <Cell key={i} text="" accent />;
  };
  const playerCell = (
    c: Col, i: number,
    gross: (h: HoleResult) => number, strokes: (h: HoleResult) => number, won: (h: HoleResult) => boolean
  ) => {
    if (c.kind === 'hole') {
      return (
        <View key={i} style={[styles.cell, won(c.h) && styles.cellWon]}>
          {strokes(c.h) > 0 && <View style={styles.strokeDot} />}
          <Text style={[styles.cellText, won(c.h) && styles.cellTextWon]}>{gross(c.h)}</Text>
        </View>
      );
    }
    const v = c.kind === 'out' ? sum(front, gross) : c.kind === 'in' ? sum(back, gross) : sum(holes, gross);
    return <Cell key={i} text={String(v)} accent bold />;
  };

  return (
    <View style={styles.flex}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.fairway} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{data.match.course_name} · {data.match.tee_color}</Text>
        <Text style={styles.resultText}>{data.progression.final_delta}</Text>
      </View>

      <View style={styles.gridRow}>
        {/* Fixed label column */}
        <View style={styles.labelCol}>
          <Cell text="Hole" label head />
          <Cell text="Par" label />
          <Cell text="S.I." label dim />
          <Cell text={youName} label bold />
          <Cell text={themName} label bold />
        </View>

        {/* Scrolling grid */}
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.grid}>
          <View>
            <View style={styles.row}>{cols.map(headerCell)}</View>
            <View style={styles.row}>{cols.map(parCell)}</View>
            <View style={styles.row}>{cols.map(siCell)}</View>
            <View style={styles.row}>{cols.map((c, i) => playerCell(c, i, youGross, youStrokes, youWon))}</View>
            <View style={styles.row}>{cols.map((c, i) => playerCell(c, i, themGross, themStrokes, themWon))}</View>
          </View>
        </ScrollView>
      </View>

      <Text style={styles.legend}>
        Highlighted = won the hole (net).  Dot = a handicap stroke received on that hole.
      </Text>
    </View>
  );
}

function Cell({ text, head, accent, dim, bold, label }: {
  text: string; head?: boolean; accent?: boolean; dim?: boolean; bold?: boolean; label?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.cell, label && styles.labelCell, head && styles.headCell, accent && styles.accentCell]}>
      <Text
        style={[
          styles.cellText,
          head && styles.headText,
          dim && styles.dimText,
          bold && styles.boldText,
          label && styles.labelText,
        ]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.paper },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { ...typography.bodySemiBold, color: colors.fairway },
  title: { ...typography.bodySemiBold, flex: 1 },
  resultText: { ...typography.bodySemiBold, color: colors.fairway },
  gridRow: { flexDirection: 'row', paddingLeft: spacing.sm },
  labelCol: { width: LABEL_W },
  grid: { paddingRight: spacing.md },
  row: { flexDirection: 'row' },
  cell: {
    width: CELL, height: ROW_H, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface,
  },
  labelCell: { width: LABEL_W, alignItems: 'flex-start', paddingHorizontal: spacing.sm },
  headCell: { backgroundColor: colors.fairway },
  accentCell: { backgroundColor: colors.sand },
  cellWon: { backgroundColor: '#EAF5EE' },
  cellText: { ...typography.body, fontSize: 15, color: colors.ink },
  headText: { color: colors.surface, fontWeight: '700' },
  dimText: { color: colors.muted, fontSize: 12 },
  boldText: { fontWeight: '700' },
  labelText: { fontSize: 13 },
  cellTextWon: { color: colors.fairway, fontWeight: '700' },
  strokeDot: { position: 'absolute', top: 4, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.fairway },
  legend: { ...typography.caption, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  errText: { ...typography.body, color: colors.muted },
  link: { ...typography.bodySemiBold, color: colors.fairway },
  });
}
