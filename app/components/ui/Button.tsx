import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/store/useThemeStore';
import { makeType, radius, spacing, type Palette } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  /** Haptic fired on press (before onPress). Set null to silence. */
  haptic?: 'light' | 'medium' | 'success' | null;
  /** Outer container style (e.g. margins). */
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The one button. Press-scales with a light spring and fires a haptic, so every
// tap across the app feels consistent. Variants map onto palette tokens.
export function Button({
  title, variant = 'primary', size = 'md', loading, icon, disabled,
  fullWidth = true, haptic = 'medium', onPress, style, ...rest
}: ButtonProps) {
  const c = useColors();
  const styles = makeStyles(c);
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const isDisabled = disabled || loading;
  const v = styles[variant];
  const s = styles[size];

  const labelColor =
    variant === 'primary' ? c.onAccent :
    variant === 'danger' ? c.loss :
    variant === 'ghost' ? c.accent :
    c.text;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPressIn={() => { scale.value = withTiming(0.97, { duration: 90 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
      onPress={(e) => {
        if (isDisabled) return;
        if (haptic) haptics[haptic]();
        onPress?.(e);
      }}
      style={[styles.base, v, s, fullWidth && styles.fullWidth, isDisabled && styles.disabled, style, animStyle]}
      {...rest}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={[c.accent, c.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      ) : null}
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={labelColor} /> : null}
          <AppText variant={size === 'sm' ? 'label' : 'bodySemiBold'} color={labelColor} style={styles.label}>
            {title}
          </AppText>
        </View>
      )}
    </AnimatedPressable>
  );
}

function makeStyles(c: Palette) {
  const t = makeType(c);
  return StyleSheet.create({
    base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', overflow: 'hidden' },
    fullWidth: { alignSelf: 'stretch' },
    disabled: { opacity: 0.45 },
    content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    label: { fontFamily: t.bodySemiBold.fontFamily },
    // sizes
    sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 38 },
    md: { paddingVertical: 14, paddingHorizontal: spacing.lg, minHeight: 50 },
    lg: { paddingVertical: 17, paddingHorizontal: spacing.lg, minHeight: 56 },
    // variants
    primary: { backgroundColor: c.accent },
    secondary: { backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: c.lossGlow, borderWidth: 1, borderColor: c.loss },
  });
}
