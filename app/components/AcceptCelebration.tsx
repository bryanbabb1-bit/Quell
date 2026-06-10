import { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withDelay, Easing, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/store/useThemeStore';
import { haptics } from '@/lib/haptics';
import { makeType, fonts, spacing, type Palette } from '@/constants/theme';

// Full-screen flourish when a match is accepted from Discovery: a check burst +
// the Quell wordmark, then it auto-dismisses (calls onDone) so the caller can
// navigate to the match. (Placeholder mark until a real logo exists.)
export function AcceptCelebration({ onDone }: { onDone: () => void }) {
  const c = useColors();
  const styles = makeStyles(c);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.6);
  const ring = useSharedValue(0);

  useEffect(() => {
    haptics.success();
    scale.value = withSequence(
      withTiming(1.1, { duration: 280, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 160 }),
    );
    ring.value = withTiming(1, { duration: 720, easing: Easing.out(Easing.quad) });
    opacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withDelay(1050, withTiming(0, { duration: 260 }, (f) => { if (f) runOnJS(onDone)(); })),
    );
  }, [onDone, opacity, ring, scale]);

  const wrap = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.7 + ring.value * 1.6 }], opacity: (1 - ring.value) * 0.5 }));

  return (
    <Animated.View style={[styles.overlay, wrap]} pointerEvents="none">
      <LinearGradient colors={[c.accentGlow, c.bg]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.ring, ringStyle]} />
      <Animated.View style={[styles.badge, mark]}>
        <Ionicons name="checkmark" size={48} color={c.onAccent} />
      </Animated.View>
      <Animated.Text style={[styles.brand, mark]}>Quell</Animated.Text>
      <Text style={styles.sub}>Match accepted</Text>
    </Animated.View>
  );
}

function makeStyles(c: Palette) {
  const t = makeType(c);
  return StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, zIndex: 300, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: c.accent, top: '38%' },
    badge: { width: 92, height: 92, borderRadius: 46, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    brand: { fontFamily: fonts.displayXBold, fontSize: 40, letterSpacing: -1, color: c.accent, marginTop: spacing.md },
    sub: { ...t.body, color: c.muted },
  });
}
