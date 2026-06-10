import { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withDelay, Easing, runOnJS } from 'react-native-reanimated';
import { useColors } from '@/store/useThemeStore';
import { haptics } from '@/lib/haptics';
import { fonts, spacing, type Palette } from '@/constants/theme';

// Full-screen flourish when a match is accepted from Discovery: a big "ACCEPTED"
// SLAMS in like a judge stamping a paper (large -> normal with an impact + haptic,
// tilted like a rubber stamp), holds a beat, then auto-dismisses (onDone) so the
// caller can navigate to the match. Monochrome: black on light, white on dark.
export function AcceptCelebration({ onDone }: { onDone: () => void }) {
  const c = useColors();
  const ink = c.scheme === 'light' ? '#0A0A0A' : '#FFFFFF';
  const styles = makeStyles(c, ink);

  const overlay = useSharedValue(0);
  const scale = useSharedValue(2.4);
  const stampOpacity = useSharedValue(0);

  useEffect(() => {
    // Slam down: accelerate in (big -> slightly past), then settle — the "press".
    scale.value = withSequence(
      withTiming(0.94, { duration: 230, easing: Easing.in(Easing.cubic) }),
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
    );
    stampOpacity.value = withTiming(1, { duration: 200 });
    overlay.value = withSequence(
      withTiming(1, { duration: 130 }),
      withDelay(1000, withTiming(0, { duration: 260 }, (f) => { if (f) runOnJS(onDone)(); })),
    );
    const hit = setTimeout(() => haptics.medium(), 230); // the stamp contact
    return () => clearTimeout(hit);
  }, [onDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.value }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stampOpacity.value,
    transform: [{ rotate: '-8deg' }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      <Animated.View style={[styles.stamp, stampStyle]}>
        <Text style={styles.stampText}>ACCEPTED</Text>
      </Animated.View>
    </Animated.View>
  );
}

function makeStyles(c: Palette, ink: string) {
  // A light wash on light themes / dark wash on dark themes keeps the monochrome
  // stamp legible while the matched card's PHOTO still shows through behind it.
  const scrim = c.scheme === 'light' ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.40)';
  return StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, zIndex: 300, alignItems: 'center', justifyContent: 'center', backgroundColor: scrim },
    stamp: {
      borderWidth: 5,
      borderColor: ink,
      borderRadius: 10,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 12,
    },
    stampText: {
      fontFamily: fonts.displayXBold,
      fontSize: 52,
      letterSpacing: 4,
      color: ink,
      textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 },
    },
  });
}
