import { Pressable, type PressableProps, type ViewStyle, type StyleProp } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { haptics } from '@/lib/haptics';
import { PRESS_SCALE, PRESS_IN_MS, PRESS_OUT_MS } from '@/constants/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type HapticKind = 'select' | 'light' | 'medium' | 'success' | null;

// Anything tappable should depress. A reusable press-scale (1 → 0.97) + optional
// haptic, generalizing the spring already baked into components/ui/Button.tsx so
// rows, pills and cards can feel physical in one line.
export function PressableScale({
  children, onPress, haptic = 'select', scaleTo = PRESS_SCALE, style, ...rest
}: {
  haptic?: HapticKind;
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
} & Omit<PressableProps, 'style'>) {
  const s = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      onPressIn={() => { s.value = withTiming(scaleTo, { duration: PRESS_IN_MS }); }}
      onPressOut={() => { s.value = withTiming(1, { duration: PRESS_OUT_MS }); }}
      onPress={(e) => { if (haptic) haptics[haptic](); onPress?.(e); }}
      style={[aStyle, style]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
