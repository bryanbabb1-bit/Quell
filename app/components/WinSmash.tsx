import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate, runOnJS, Extrapolation, Easing,
} from 'react-native-reanimated';
import { Avatar } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { makeType, spacing, radius, cinematicColors, type Palette } from '@/constants/theme';

const { width } = Dimensions.get('window');
const DURATION = 4400;
const IMPACT_T = 0.46; // fraction of the timeline where the hit lands

// Celebratory result overlay: the two players sit side by side, the WINNER winds
// up, lunges, and smashes the loser off-screen, then a banner declares the win.
// Auto-plays once; tap to skip. Driven by a single 0→1 progress so onDone fires
// cleanly in the timing callback.
export function WinSmash({ winnerName, winnerPhoto, loserName, loserPhoto, delta, youWon, onDone }: {
  winnerName: string;
  winnerPhoto: string | null;
  loserName: string;
  loserPhoto: string | null;
  delta: string;            // e.g. "3 & 2"
  youWon: boolean;
  onDone: () => void;
}) {
  const c = cinematicColors;
  const styles = makeStyles(c);
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(1, { duration: DURATION, easing: Easing.linear }, (fin) => {
      if (fin) runOnJS(onDone)();
    });
    const hit = setTimeout(() => haptics.medium(), DURATION * IMPACT_T);
    const cheer = setTimeout(() => haptics.success(), DURATION * 0.6);
    return () => { clearTimeout(hit); clearTimeout(cheer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Winner: enters to its slot (left of center), HOLDS beside the loser for a
  // beat, winds up, lunges through the loser, then settles dead center, scaled
  // up, and HOLDS there before the screen hands off to the summary.
  const winnerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(t.value, [0, 0.12, 0.32, 0.42, IMPACT_T, 0.58, 1], [-width * 0.55, 0, 0, -24, 96, 70, 70], Extrapolation.CLAMP) },
      { scale: interpolate(t.value, [0, 0.12, 0.32, 0.42, IMPACT_T, 0.58, 1], [0.6, 1, 1, 1.06, 1.22, 1.16, 1.16], Extrapolation.CLAMP) },
      { rotate: `${interpolate(t.value, [0.32, 0.42, IMPACT_T], [0, -8, 4], Extrapolation.CLAMP)}deg` },
    ],
  }));

  // Loser: present beside the winner, then knocked off to the right (spin + fade)
  // at impact.
  const loserStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.1, IMPACT_T, 0.58], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(t.value, [0, IMPACT_T, 0.62], [0, 0, width], Extrapolation.CLAMP) },
      { translateY: interpolate(t.value, [IMPACT_T, 0.62], [0, 90], Extrapolation.CLAMP) },
      { rotate: `${interpolate(t.value, [IMPACT_T, 0.62], [0, 65], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(t.value, [0, 0.1], [0.6, 1], Extrapolation.CLAMP) },
    ],
  }));

  // A quick white flash at the moment of impact.
  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.42, IMPACT_T, 0.52], [0, 0.85, 0], Extrapolation.CLAMP),
  }));

  // Banner rises in after the hit and holds.
  const bannerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.58, 0.72], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(t.value, [0.58, 0.74], [24, 0], Extrapolation.CLAMP) },
      { scale: interpolate(t.value, [0.58, 0.74], [0.9, 1], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Pressable style={styles.overlay} onPress={onDone}>
      <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />

      <View style={styles.stage}>
        <Animated.View style={[styles.avatarSlot, loserStyle]}>
          <Avatar name={loserName} size={108} photoUrl={loserPhoto} />
          <Text style={styles.loserName} numberOfLines={1}>{loserName}</Text>
        </Animated.View>

        <Animated.View style={[styles.avatarSlot, styles.winnerSlot, winnerStyle]}>
          <View style={styles.winnerRing}>
            <Avatar name={winnerName} size={120} photoUrl={winnerPhoto} />
          </View>
        </Animated.View>
      </View>

      <Animated.View style={[styles.banner, bannerStyle]}>
        <Text style={styles.bannerWho}>{youWon ? 'You won' : `${winnerName} won`}</Text>
        <Text style={styles.bannerDelta}>{delta}</Text>
      </Animated.View>

      <Animated.Text style={[styles.skip, bannerStyle]}>Tap to continue</Animated.Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  const t = makeType(c);
  return StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
    flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF' },
    stage: { height: 200, alignItems: 'center', justifyContent: 'center' },
    avatarSlot: { position: 'absolute', alignItems: 'center', gap: spacing.sm, marginLeft: 70 },   // right-of-center
    winnerSlot: { marginLeft: -70 },                                                                 // left-of-center
    winnerRing: { padding: 4, borderRadius: 70, borderWidth: 3, borderColor: c.win, backgroundColor: c.surface },
    loserName: { ...t.caption, color: 'rgba(255,255,255,0.85)', maxWidth: 120 },
    banner: { alignItems: 'center', marginTop: spacing.xl, gap: 2 },
    bannerWho: { ...t.title, color: '#FFFFFF', fontSize: 30 },
    bannerDelta: { ...t.scoreBig, color: c.win, fontSize: 56 },
    skip: { ...t.caption, color: 'rgba(255,255,255,0.6)', marginTop: spacing.xl, position: 'absolute', bottom: spacing.xl },
  });
}
