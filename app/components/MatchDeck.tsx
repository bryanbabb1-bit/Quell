import { useEffect, useMemo, useState } from 'react';
import { Dimensions, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, interpolate, runOnJS, Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { DiscoveryMatch } from '@/types';
import { MATCH_TYPE_LABELS } from '@/types';
import { useColors } from '@/store/useThemeStore';
import { useSavedMatchesStore } from '@/store/useSavedMatchesStore';
import { formatHandicap, formatPlayWhen } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { Avatar } from '@/components/ui';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

const { width } = Dimensions.get('window');
const THRESHOLD = width * 0.25;
const OFF = width * 1.4;
const SAVE_YELLOW = '#F5C518'; // a saved/starred match fills yellow (not theme green)

const creatorName = (m: DiscoveryMatch) =>
  [m.creator_first_name, m.creator_last_name].filter(Boolean).join(' ') || 'A golfer';

// Full-screen swipeable deck of open matches, styled as full-bleed photo cards.
// Swipe RIGHT (or tap the flag) to accept, LEFT (or tap X) to pass; tap the heart
// to favorite the creator. Accept is routed to the parent (index-confirm +
// acceptMatch); pass is local (advances the deck).
export function MatchDeck({ matches, onAccept, onPass, onReload }: {
  matches: DiscoveryMatch[];
  onAccept: (m: DiscoveryMatch) => void;
  onPass: (m: DiscoveryMatch) => void;
  onReload: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isSaved = useSavedMatchesStore((s) => s.isSaved);
  const toggleSaved = useSavedMatchesStore((s) => s.toggle);
  const savedIds = useSavedMatchesStore((s) => s.saved);
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
  const saveBtn = () => {
    if (!current) return;
    haptics.light();
    toggleSaved(current.id);
  };
  const saved = current ? (savedIds.includes(current.id) || isSaved(current.id)) : false;

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
        <LinearGradient colors={['transparent', colors.accent]} start={{ x: 0.35, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.glow, glowPassStyle]} pointerEvents="none">
        <LinearGradient colors={[colors.loss, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.65, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.cardArea}>
        {next && (
          <View style={[styles.card, styles.cardBehind]} pointerEvents="none">
            <CardBody m={next} />
          </View>
        )}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.card, topStyle]}>
            <CardBody m={current} />
            <Animated.View style={[styles.stamp, styles.acceptStamp, acceptBadgeStyle]} pointerEvents="none">
              <Text style={styles.acceptStampText}>ACCEPT</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.passStamp, passBadgeStyle]} pointerEvents="none">
              <Text style={styles.passStampText}>PASS</Text>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.ctrlBtn, styles.ctrlSide, styles.passCtrl]} onPress={passBtn} activeOpacity={0.85}>
          <Ionicons name="close" size={30} color={colors.loss} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, styles.ctrlMain]} onPress={acceptBtn} activeOpacity={0.85}>
          <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctrlFill}>
            <Ionicons name="flag" size={34} color={colors.onAccent} />
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrlBtn, styles.ctrlSide, styles.saveCtrl, saved && styles.saveCtrlOn]} onPress={saveBtn} activeOpacity={0.85}>
          <Ionicons name={saved ? 'star' : 'star-outline'} size={26} color={saved ? SAVE_YELLOW : colors.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CardBody({ m }: { m: DiscoveryMatch }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const name = creatorName(m);

  return (
    <View style={styles.body}>
      {/* Photo, or a rich gradient + big initials when the creator has no photo. */}
      {m.creator_photo_url ? (
        <Image source={{ uri: m.creator_photo_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={[colors.accent, colors.accentDark, colors.bg]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        >
          <View style={styles.fallbackAvatar}>
            <Avatar name={name} size={148} />
          </View>
        </LinearGradient>
      )}

      {/* Scrim so overlaid text stays legible over any photo. */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.86)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top pills: handicap (left), when (right). */}
      <View style={styles.topRow}>
        <View style={styles.hcpPill}>
          <Ionicons name="golf" size={13} color={colors.accent} />
          <Text style={styles.hcpText}>{formatHandicap(m.creator_handicap_index)} HCP</Text>
        </View>
        <View style={styles.whenPill}>
          <Ionicons name="calendar-outline" size={12} color="#FFFFFF" />
          <Text style={styles.whenText}>{formatPlayWhen(m.play_date)}</Text>
        </View>
      </View>

      {/* Bottom overlay: name, course, detail chips. */}
      <View style={styles.overlay}>
        <Text style={styles.nameOverlay} numberOfLines={1}>{name}</Text>
        <View style={styles.courseRow}>
          <Ionicons name="location-sharp" size={15} color="rgba(255,255,255,0.9)" />
          <Text style={styles.courseOverlay} numberOfLines={1}>{m.course_name}</Text>
        </View>
        <View style={styles.chips}>
          <Chip icon="flag-outline" text={MATCH_TYPE_LABELS[m.match_type]} />
          <Chip icon="golf-outline" text={`${m.tee_color} tees`} />
          <Chip icon="people-outline" text={`Hcp ${m.hcp_range_min}–${m.hcp_range_max}`} />
        </View>
      </View>
    </View>
  );
}

function Chip({ icon, text }: { icon: any; text: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={13} color="#FFFFFF" />
      <Text style={styles.chipText}>{text}</Text>
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
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 12,
  },
  cardBehind: { transform: [{ scale: 0.94 }, { translateY: 16 }], opacity: 0.6 },
  body: { flex: 1 },
  fallbackAvatar: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 120, opacity: 0.92 },

  topRow: { position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  // Near-solid dark chip + bright white text so the handicap is unmistakable over
  // any photo OR the accent gradient fallback. The golf icon carries the accent.
  hcpPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  hcpText: { ...typography.caption, color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.4, fontSize: 13.5 },
  whenPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  whenText: { ...typography.caption, color: '#FFFFFF', fontWeight: '700', fontSize: 12 },

  overlay: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: 7 },
  nameOverlay: { ...typography.title, color: '#FFFFFF', fontSize: 34, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  courseOverlay: { ...typography.body, color: 'rgba(255,255,255,0.95)', fontWeight: '600', flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  chipText: { ...typography.caption, color: '#FFFFFF', fontWeight: '600', fontSize: 12.5 },

  // Solid FILLED badges (not outlines) so ACCEPT/PASS read instantly over a
  // photo while swiping.
  stamp: {
    position: 'absolute', top: 64, zIndex: 20, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  acceptStamp: { left: spacing.lg, backgroundColor: colors.accent, transform: [{ rotate: '-12deg' }] },
  acceptStampText: { ...typography.title, fontSize: 32, color: colors.onAccent, letterSpacing: 2 },
  passStamp: { right: spacing.lg, backgroundColor: colors.loss, transform: [{ rotate: '12deg' }] },
  passStampText: { ...typography.title, fontSize: 32, color: '#FFFFFF', letterSpacing: 2 },

  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xl, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  ctrlBtn: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  ctrlSide: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surface, borderWidth: 1.5 },
  ctrlMain: { width: 78, height: 78, borderRadius: 39 },
  ctrlFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  passCtrl: { borderColor: colors.loss },
  saveCtrl: { borderColor: colors.border },
  saveCtrlOn: { borderColor: SAVE_YELLOW },

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
