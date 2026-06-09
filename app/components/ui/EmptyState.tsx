import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/store/useThemeStore';
import { spacing } from '@/constants/theme';
import { AppText } from './AppText';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

// Standardized empty state — same shape everywhere (icon + title + message +
// optional CTA), replacing the ad-hoc "No matches yet" Text blocks.
export function EmptyState({ icon = 'golf-outline', title, message, actionLabel, onAction }: EmptyStateProps) {
  const c = useColors();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconRing, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
        <Ionicons name={icon} size={30} color={c.muted} />
      </View>
      <AppText variant="heading" center>{title}</AppText>
      {message ? <AppText variant="body" tone="muted" center>{message}</AppText> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="secondary" fullWidth={false} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  iconRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  action: { marginTop: spacing.md },
});
