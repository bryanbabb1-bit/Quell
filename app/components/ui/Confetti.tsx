import { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing, interpolate, Extrapolation } from 'react-native-reanimated';

// Lightweight confetti burst built on Reanimated (no native dependency, so it
// streams over the dev server). Mount it to fire once — e.g. on a match win.
const { width, height } = Dimensions.get('window');
const PIECE_COLORS = ['#36E27D', '#7C83FF', '#FF9A5A', '#2DD4D4', '#FFD166', '#FF5A5F', '#F7F9FC'];

function Piece({ index }: { index: number }) {
  // Deterministic-enough spread using Math.random (fine in app code).
  const startX = Math.random() * width;
  const driftX = (Math.random() - 0.5) * 220;
  const size = 6 + Math.random() * 9;
  const color = PIECE_COLORS[index % PIECE_COLORS.length];
  const delay = Math.random() * 350;
  const duration = 1700 + Math.random() * 1300;
  const rot = (Math.random() - 0.5) * 900;

  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.quad) }));
  }, [p, delay, duration]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: driftX * p.value },
      { translateY: p.value * (height * 0.95) },
      { rotate: `${rot * p.value}deg` },
    ],
    // Stay visible through the fall, then fully fade out by the end so no pieces
    // linger as a row at the bottom of the screen.
    opacity: interpolate(p.value, [0, 0.8, 1], [1, 1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      style={[
        { position: 'absolute', top: -24, left: startX, width: size, height: size * 0.55, backgroundColor: color, borderRadius: 2 },
        style,
      ]}
    />
  );
}

export function Confetti({ count = 90 }: { count?: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }).map((_, i) => <Piece key={i} index={i} />)}
    </View>
  );
}
