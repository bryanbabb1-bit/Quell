import { useEffect } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate, Extrapolation, Easing, runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/store/useThemeStore';
import { haptics } from '@/lib/haptics';
import { makeType, fonts, spacing, type Palette } from '@/constants/theme';

const DURATION = 1900;
const CLASH_T = 0.34; // where the two axes meet

// Full-screen flourish when a match is accepted from Discovery: two axes swing in
// from opposite sides and CLASH in the center (impact flash + haptic) — a match is
// about to go down — then it auto-dismisses (calls onDone) so the caller can
// navigate to the match.
export function AcceptCelebration({ onDone }: { onDone: () => void }) {
  const c = useColors();
  const styles = makeStyles(c);
  const t = useSharedValue(0);

  useEffect(() => {
    haptics.light();
    t.value = withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) }, (f) => {
      if (f) runOnJS(onDone)();
    });
    const clash = setTimeout(() => haptics.medium(), DURATION * CLASH_T);
    const done = setTimeout(() => haptics.success(), DURATION * (CLASH_T + 0.06));
    return () => { clearTimeout(clash); clearTimeout(done); };
  }, [onDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.06, 0.82, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));

  // Left axe whips in from off-screen-left, settling rotated to cross center.
  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(t.value, [0, CLASH_T], [-220, -14], Extrapolation.CLAMP) },
      { rotate: `${interpolate(t.value, [0, 0.28, CLASH_T], [-150, -20, -32], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(t.value, [0, CLASH_T], [0.7, 1], Extrapolation.CLAMP) },
    ],
  }));

  // Right axe mirrors it, whipping in from the right.
  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(t.value, [0, CLASH_T], [220, 14], Extrapolation.CLAMP) },
      { rotate: `${interpolate(t.value, [0, 0.28, CLASH_T], [150, 20, 32], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(t.value, [0, CLASH_T], [0.7, 1], Extrapolation.CLAMP) },
    ],
  }));

  // Clash spark — a quick bright burst at the moment they meet.
  const sparkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [CLASH_T - 0.06, CLASH_T, CLASH_T + 0.12], [0, 0.9, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(t.value, [CLASH_T - 0.06, CLASH_T + 0.12], [0.4, 1.5], Extrapolation.CLAMP) }],
  }));

  // "It's on" rises in just after the clash.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [CLASH_T + 0.04, CLASH_T + 0.2], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(t.value, [CLASH_T + 0.04, CLASH_T + 0.22], [18, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      <LinearGradient colors={[c.accentGlow, c.bg]} style={StyleSheet.absoluteFill} />

      <View style={styles.stage}>
        <Animated.View style={[styles.spark, sparkStyle]} />
        <Animated.View style={[styles.axe, leftStyle]}>
          <MaterialCommunityIcons name="axe" size={86} color={c.accent} />
        </Animated.View>
        <Animated.View style={[styles.axe, rightStyle]}>
          <MaterialCommunityIcons name="axe" size={86} color={c.text} />
        </Animated.View>
      </View>

      <Animated.Text style={[styles.headline, labelStyle]}>It's on</Animated.Text>
      <Animated.Text style={[styles.sub, labelStyle]}>Match accepted</Animated.Text>
    </Animated.View>
  );
}

function makeStyles(c: Palette) {
  const t = makeType(c);
  return StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, zIndex: 300, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    stage: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
    axe: { position: 'absolute' },
    spark: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: c.accentGlow, borderWidth: 2, borderColor: c.accent },
    headline: { fontFamily: fonts.displayXBold, fontSize: 40, letterSpacing: -1, color: c.text, marginTop: spacing.sm },
    sub: { ...t.body, color: c.muted },
  });
}
