import { useEffect, useMemo, useState } from 'react';
import { Dimensions, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, interpolate, runOnJS, Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { DiscoveryMatch } from '@/types';
import { MATCH_TYPE_LABELS } from '@/types';
import { useColors } from '@/store/useThemeStore';
import { formatHandicap, formatPlayWhen } from '@/lib/format';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

const { width } = Dimensions.get('window');
const THRESHOLD = width * 0.25;
const OFF = width * 1.4;

// Full-screen swipeable deck of open matches. Swipe RIGHT (or tap accept) to
// accept, LEFT (or tap pass) to pass. Accept is routed back to the parent (runs the
// index-confirm + acceptMatch); pass is purely local (advances the deck).
export function MatchDeck({ matches, onAccept, onPass, onReload }: {
  matches: DiscoveryMatch[];
  onAccept: (m: DiscoveryMatch) => void;
  onPass: (m: DiscoveryMatch) => void;
  onReload: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [index, setIndex] = useState(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  // Fresh list (a reload) → restart the deck.
  useEffect(() => {
    setIndex(0);
    tx.value = 0;
    ty.value = 0;
  }, [matches]); // eslint-disable-line react-hooks/exhaustive-deps

  const current: DiscoveryMatch | undefined = matches[index];
  const next: DiscoveryMatch | undefined = matches[index + 1];

  const advancePast = () => {
    const m = current;
    tx.value = 0;
    ty.value = 0;
    setIndex((i) => i + 1);
    if (m) onPass(m);
  };

  const triggerAccept = () => {
    tx.value = withSpring(0);
    ty.value = withSpring(0);
    if (current) onAccept(current);
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY * 0.15;
    })
    .onEnd((e) => {
      if (e.translationX < -THRESHOLD) {
        tx.value = withTiming(-OFF, { duration: 220 }, (fin) => { if (fin) runOnJS(advancePast)(); });
      } else if (e.translationX > THRESHOLD) {
        // Spring back to center; the parent takes over (confirm sheet / navigate).
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        runOnJS(triggerAccept)();
      } else {
        tx.value = withSpring(0);
        ty.value = withSpring(0);
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-width / 2, width / 2], [-9, 9], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const acceptBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [0, THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));
  const passBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
  }));

  const passBtn = () => {
    tx.value = withTiming(-OFF, { duration: 220 }, (fin) => { if (fin) runOnJS(advancePast)(); });
  };
  const acceptBtn = () => { if (current) onAccept(current); };

  if (!current) {
    return (
      <View style={styles.empty}>
        <Ionicons name="golf-outline" size={48} color={colors.muted} />
        <Text style={styles.emptyTitle}>You're all caught up</Text>
        <Text style={styles.emptyHint}>No more open matches right now.</Text>
        <TouchableOpacity style={styles.reloadBtn} onPress={onReload}>
          <Ionicons name="refresh" size={18} color={colors.fairway} />
          <Text style={styles.reloadText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.deck}>
      <View style={styles.cardArea}>
        {next && (
          <View style={[styles.card, styles.cardBehind]} pointerEvents="none">
            <CardBody m={next} />
          </View>
        )}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.card, topStyle]}>
            <Animated.View style={[styles.stamp, styles.acceptStamp, acceptBadgeStyle]}>
              <Text style={styles.acceptStampText}>ACCEPT</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.passStamp, passBadgeStyle]}>
              <Text style={styles.passStampText}>PASS</Text>
            </Animated.View>
            <CardBody m={current} />
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.ctrlBtn, styles.passCtrl]} onPress={passBtn} activeOpacity={0.85}>
          <Ionicons name="close" size={30} color={colors.flagRed} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, styles.acceptCtrl]} onPress={acceptBtn} activeOpacity={0.85}>
          <Ionicons name="golf" size={26} color={colors.surface} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CardBody({ m }: { m: DiscoveryMatch }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const name = [m.creator_first_name, m.creator_last_name].filter(Boolean).join(' ') || 'A golfer';
  return (
    <View style={styles.body}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(name[0] ?? '?').toUpperCase()}</Text>
      </View>
      <Text style={styles.name}>{name}</Text>
      <View style={styles.idxPill}>
        <Text style={styles.idxText}>Index {formatHandicap(m.creator_handicap_index)}</Text>
      </View>

      <Text style={styles.course}>{m.course_name}</Text>
      <Text style={styles.tees}>{m.tee_color} tees · {MATCH_TYPE_LABELS[m.match_type]}</Text>

      <View style={styles.facts}>
        <Fact icon="calendar-outline" text={formatPlayWhen(m.play_date, m.play_time)} />
        <Fact icon="people-outline" text={`Wants handicap ${m.hcp_range_min}–${m.hcp_range_max}`} />
        {m.stakes != null && <Fact icon="cash-outline" text={`$${m.stakes} on the line (for context)`} />}
      </View>
    </View>
  );
}

function Fact({ icon, text }: { icon: any; text: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  deck: { flex: 1 },
  cardArea: { flex: 1, margin: spacing.lg, position: 'relative' },
  card: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  cardBehind: { transform: [{ scale: 0.95 }, { translateY: 14 }], opacity: 0.7 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  avatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: colors.fairway,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
  },
  avatarText: { ...typography.title, fontSize: 36, color: colors.surface },
  name: { ...typography.title, fontSize: 26, textAlign: 'center' },
  idxPill: { backgroundColor: colors.sand, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  idxText: { ...typography.bodySemiBold, color: colors.fairway },
  course: { ...typography.heading, fontSize: 20, textAlign: 'center', marginTop: spacing.md },
  tees: { ...typography.body, color: colors.muted, textAlign: 'center' },
  facts: { gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch', paddingHorizontal: spacing.md },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  factText: { ...typography.body, color: colors.ink },
  stamp: {
    position: 'absolute', top: spacing.lg, zIndex: 10, borderWidth: 3, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  acceptStamp: { left: spacing.lg, borderColor: colors.fairway, transform: [{ rotate: '-12deg' }] },
  acceptStampText: { ...typography.title, fontSize: 22, color: colors.fairway },
  passStamp: { right: spacing.lg, borderColor: colors.flagRed, transform: [{ rotate: '12deg' }] },
  passStampText: { ...typography.title, fontSize: 22, color: colors.flagRed },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, paddingBottom: spacing.lg },
  ctrlBtn: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  passCtrl: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.flagRed },
  acceptCtrl: { backgroundColor: colors.fairway },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyTitle: { ...typography.heading, color: colors.muted, textAlign: 'center' },
  emptyHint: { ...typography.caption, textAlign: 'center', maxWidth: 260 },
  reloadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.fairway, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  reloadText: { ...typography.bodySemiBold, color: colors.fairway },
  });
}
