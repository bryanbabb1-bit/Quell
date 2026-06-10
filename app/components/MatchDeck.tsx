import { useEffect, useMemo, useState } from 'react';
import { Dimensions, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, interpolate, runOnJS, Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { DiscoveryMatch } from '@/types';
import { MATCH_TYPE_LABELS } from '@/types';
import { useColors } from '@/store/useThemeStore';
import { formatHandicap, formatPlayWhen } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { Avatar } from '@/components/ui';
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
    haptics.light();
    tx.value = 0;
    ty.value = 0;
    setIndex((i) => i + 1);
    if (m) onPass(m);
  };

  const triggerAccept = () => {
    haptics.medium();
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
  const glowAcceptStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [0, THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));
  const glowPassStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
  }));

  const passBtn = () => {
    tx.value = withTiming(-OFF, { duration: 220 }, (fin) => { if (fin) runOnJS(advancePast)(); });
  };
  const acceptBtn = () => { if (current) { haptics.medium(); onAccept(current); } };

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
      <Animated.View style={[styles.glow, glowAcceptStyle]} pointerEvents="none">
        <LinearGradient colors={['transparent', colors.accentGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.glow, glowPassStyle]} pointerEvents="none">
        <LinearGradient colors={[colors.lossGlow, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
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
          <Ionicons name="close" size={32} color={colors.loss} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctrlBtn} onPress={acceptBtn} activeOpacity={0.85}>
          <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctrlFill}>
            <Ionicons name="checkmark" size={34} color={colors.onAccent} />
          </LinearGradient>
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
      <LinearGradient
        colors={[colors.accent, colors.accentDark]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.cardHeader}
      />
      <View style={styles.avatarRing}>
        <Avatar name={name} size={104} photoUrl={m.creator_photo_url} />
      </View>

      <View style={styles.cardContent}>
        <Text style={styles.name}>{name}</Text>
        <View style={styles.idxPill}>
          <Text style={styles.idxText}>INDEX {formatHandicap(m.creator_handicap_index)}</Text>
        </View>

        <Text style={styles.course}>{m.course_name}</Text>
        <Text style={styles.tees}>{m.tee_color} · {MATCH_TYPE_LABELS[m.match_type]}</Text>

        <View style={styles.facts}>
          <Fact icon="calendar-outline" text={formatPlayWhen(m.play_date)} />
          <Fact icon="people-outline" text={`Handicap range ${m.hcp_range_min}–${m.hcp_range_max}`} />
        </View>
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
  glow: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  cardArea: { flex: 1, marginHorizontal: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.xs, position: 'relative', zIndex: 1 },
  card: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 10,
  },
  cardBehind: { transform: [{ scale: 0.94 }, { translateY: 16 }], opacity: 0.6 },
  body: { flex: 1 },
  cardHeader: { position: 'absolute', top: 0, left: 0, right: 0, height: 168 },
  avatarRing: { alignSelf: 'center', marginTop: 108, padding: 5, borderRadius: 64, backgroundColor: colors.surface },
  cardContent: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs },
  name: { ...typography.title, fontSize: 28, textAlign: 'center', marginTop: spacing.xs },
  idxPill: { backgroundColor: colors.accentGlow, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3, marginTop: 2 },
  idxText: { ...typography.caption, color: colors.accent, fontWeight: '800', letterSpacing: 1, fontSize: 11 },
  course: { ...typography.title, fontSize: 22, textAlign: 'center', marginTop: spacing.md },
  tees: { ...typography.body, color: colors.muted, textAlign: 'center' },
  facts: { gap: spacing.sm, marginTop: 'auto', marginBottom: spacing.lg, alignSelf: 'stretch', backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: spacing.md },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  factText: { ...typography.body, color: colors.ink, flex: 1 },
  stamp: {
    position: 'absolute', top: 32, zIndex: 20, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  acceptStamp: { left: spacing.lg, backgroundColor: colors.accent, transform: [{ rotate: '-10deg' }] },
  acceptStampText: { ...typography.title, fontSize: 30, color: colors.onAccent, letterSpacing: 1 },
  passStamp: { right: spacing.lg, backgroundColor: colors.loss, transform: [{ rotate: '10deg' }] },
  passStampText: { ...typography.title, fontSize: 30, color: '#FFFFFF', letterSpacing: 1 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  ctrlBtn: {
    width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  ctrlFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  passCtrl: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.loss },
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
