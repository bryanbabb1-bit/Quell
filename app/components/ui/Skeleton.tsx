import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useColors } from '@/store/useThemeStore';
import { radius, spacing } from '@/constants/theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: object;
}

// Pulsing placeholder block — replaces bare ActivityIndicators while data loads
// so the dark layout stays put instead of flashing a spinner.
export function Skeleton({ width = '100%', height = 16, radius: r = 8, style }: SkeletonProps) {
  const c = useColors();
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.9, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: c.surfaceRaised }, anim, style]} />;
}

// A pre-composed card-shaped skeleton (title + two lines) for list loading.
export function SkeletonCard() {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Skeleton width="55%" height={20} />
      <Skeleton width="85%" height={14} />
      <Skeleton width="40%" height={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
});
