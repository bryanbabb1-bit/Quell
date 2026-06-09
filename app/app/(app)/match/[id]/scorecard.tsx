import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useColors } from '@/store/useThemeStore';
import type { RevealResponse, HoleResult } from '@/types';
import { spacing, radius, makeType, fonts, type Palette } from '@/constants/theme';

const CELL = 40;
const LABEL_W = 100;
const ROW_H = 42;

type Col = { kind: 'hole'; h: HoleResult } | { kind: 'out' } | { kind: 'in' } | { kind: 'tot' };
// vs-par shape: under par = circle, over par = square (golf scorecard convention).
type Mark = 'eagle' | 'birdie' | 'none' | 'bogey' | 'double';

export default function ScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width: W, height: H } = useWindowDimensions();

  const [data, setData] = useState<RevealResponse | null>(null);
  const [parByHole, setParByHole] = useState<Record<number, number | null>>({});
  const [siByHole, setSiByHole] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  if (error || !data || !data.progression) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{error ?? 'No scored card to show yet.'}</Text>
        <Pressable onPress={() => router.back()}><Text style={styles.link}>Back</Text></Pressable>
      </View>
    );
  }

  const meIsCreator = data.match.creator_id === userId;
  const holes = data.progression.holes;
  const themName = meIsCreator ? data.opponent_name : data.creator_name;

  const youGross = (h: HoleResult) => (meIsCreator ? h.creator_gross : h.opponent_gross);
  const youStrokes = (h: HoleResult) => (meIsCreator ? h.creator_strokes : h.opponent_strokes);
  const themGross = (h: HoleResult) => (meIsCreator ? h.opponent_gross : h.creator_gross);
  const themStrokes = (h: HoleResult) => (meIsCreator ? h.opponent_strokes : h.creator_strokes);
  const youWon = (h: HoleResult) => h.winner === (meIsCreator ? 'creator' : 'opponent');
  const themWon = (h: HoleResult) => h.winner === (meIsCreator ? 'opponent' : 'creator');

  const markFor = (h: HoleResult, gross: (x: HoleResult) => number): Mark => {
    const par = parByHole[h.hole];
    if (par == null) return 'none';
    const rel = gross(h) - par;
    if (rel <= -2) return 'eagle';
    if (rel === -1) return 'birdie';
    if (rel === 0) return 'none';
    if (rel === 1) return 'bogey';
    return 'double';
  };

  const hasFront = holes.some((h) => h.hole <= 9);
  const hasBack = holes.some((h) => h.hole >= 10);
  const front = holes.filter((h) => h.hole <= 9);
  const back = holes.filter((h) => h.hole >= 10);

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

  const headerCell = (col: Col, i: number) =>
    col.kind === 'hole'
      ? <Cell key={i} text={String(col.h.hole)} head />
      : <Cell key={i} text={col.kind.toUpperCase()} head accent />;

  const parCell = (col: Col, i: number) => {
    if (col.kind === 'hole') return <Cell key={i} text={parByHole[col.h.hole] != null ? String(parByHole[col.h.hole]) : '–'} />;
    const v = col.kind === 'out' ? parSum(front) : col.kind === 'in' ? parSum(back) : parSum(holes);
    return <Cell key={i} text={String(v)} accent />;
  };

  const siCell = (col: Col, i: number) =>
    col.kind === 'hole'
      ? <Cell key={i} text={siByHole[col.h.hole] != null ? String(siByHole[col.h.hole]) : '–'} dim />
      : <Cell key={i} text="" accent />;

  const playerCell = (
    col: Col, i: number,
    gross: (h: HoleResult) => number, strokes: (h: HoleResult) => number,
    won: (h: HoleResult) => boolean,
  ) => {
    if (col.kind === 'hole') {
      const mark = markFor(col.h, gross);
      return (
        <View key={i} style={[styles.cell, won(col.h) && styles.cellWon]}>
          {strokes(col.h) > 0 && <View style={styles.strokeDot} />}
          <View style={[styles.mark, markStyle(mark, colors)]}>
            <Text style={[styles.cellText, won(col.h) && styles.cellTextWon]}>{gross(col.h)}</Text>
          </View>
        </View>
      );
    }
    const v = col.kind === 'out' ? sum(front, gross) : col.kind === 'in' ? sum(back, gross) : sum(holes, gross);
    return <Cell key={i} text={String(v)} accent bold />;
  };

  return (
    <View style={styles.root}>
      {/* Software-rotated landscape canvas: the app stays portrait (so iOS never
          has to rotate — that was bricking it); the card is rotated 90° and the
          user turns the phone to read it. */}
      <View style={[styles.landscape, { width: H, height: W, left: (W - H) / 2, top: (H - W) / 2 }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{data.match.course_name} · {data.match.tee_color}</Text>
        <View style={styles.resultPill}><Text style={styles.resultText}>{data.progression.final_delta}</Text></View>
      </View>

      <View style={styles.gridRow}>
        <View style={styles.labelCol}>
          <Cell text="Hole" label head />
          <Cell text="Par" label />
          <Cell text="S.I." label dim />
          <Cell text="You" label bold />
          <Cell text={themName} label bold />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.grid}>
          <View>
            <View style={styles.row}>{cols.map(headerCell)}</View>
            <View style={styles.row}>{cols.map(parCell)}</View>
            <View style={styles.row}>{cols.map(siCell)}</View>
            <View style={styles.row}>{cols.map((col, i) => playerCell(col, i, youGross, youStrokes, youWon))}</View>
            <View style={styles.row}>{cols.map((col, i) => playerCell(col, i, themGross, themStrokes, themWon))}</View>
          </View>
        </ScrollView>
      </View>

      <Text style={styles.legend}>
        Turn your phone sideways ·  ○ under par · □ over par · dot = stroke received · highlight = won the hole
      </Text>
      </View>
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
        style={[styles.cellText, head && styles.headText, dim && styles.dimText, bold && styles.boldText, label && styles.labelText]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

// Circle for under par, square for over par (filled for eagle / double+).
function markStyle(mark: Mark, c: Palette) {
  switch (mark) {
    case 'eagle': return { borderRadius: 14, borderWidth: 2, borderColor: c.accent, backgroundColor: c.accentGlow };
    case 'birdie': return { borderRadius: 14, borderWidth: 1.5, borderColor: c.accent };
    case 'bogey': return { borderRadius: 3, borderWidth: 1.5, borderColor: c.muted };
    case 'double': return { borderRadius: 3, borderWidth: 1.5, borderColor: c.loss, backgroundColor: c.lossGlow };
    default: return { borderColor: 'transparent' };
  }
}

function makeStyles(c: Palette) {
  const t = makeType(c);
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    root: { flex: 1, backgroundColor: c.bg },
    landscape: { position: 'absolute', transform: [{ rotate: '90deg' }], paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: c.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: c.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
    backBtn: { flexDirection: 'row', alignItems: 'center' },
    backText: { ...t.bodySemiBold, color: c.accent },
    title: { ...t.subheading, flex: 1 },
    resultPill: { backgroundColor: c.accentGlow, borderWidth: 1, borderColor: c.accent, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
    resultText: { ...t.bodySemiBold, color: c.accent },
    gridRow: { flexDirection: 'row', paddingLeft: spacing.sm },
    labelCol: { width: LABEL_W },
    grid: { paddingRight: spacing.md },
    row: { flexDirection: 'row' },
    cell: {
      width: CELL, height: ROW_H, alignItems: 'center', justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.surface,
    },
    mark: { minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
    labelCell: { width: LABEL_W, alignItems: 'flex-start', paddingHorizontal: spacing.sm },
    headCell: { backgroundColor: c.surfaceRaised },
    accentCell: { backgroundColor: c.surfaceRaised },
    cellWon: { backgroundColor: c.accentGlow },
    cellText: { ...t.body, fontSize: 15, fontVariant: ['tabular-nums'] as ('tabular-nums')[], color: c.text },
    headText: { color: c.text, fontFamily: fonts.bodySemi },
    dimText: { color: c.muted, fontSize: 12 },
    boldText: { fontFamily: fonts.bodySemi },
    labelText: { fontSize: 13 },
    cellTextWon: { color: c.accent, fontFamily: fonts.bodyBold },
    strokeDot: { position: 'absolute', top: 4, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },
    legend: { ...t.caption, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
    errText: { ...t.body, color: c.muted },
    link: { ...t.bodySemiBold, color: c.accent },
  });
}
