import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/store/useThemeStore';
import { spacing } from '@/constants/theme';
import { AppText } from './AppText';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

// Standardized error state with a retry CTA — same shape everywhere.
export function ErrorState({ title = 'Something went wrong', message, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  const c = useColors();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconRing, { backgroundColor: c.lossGlow, borderColor: c.loss }]}>
        <Ionicons name="alert-circle-outline" size={30} color={c.loss} />
      </View>
      <AppText variant="heading" center>{title}</AppText>
      {message ? <AppText variant="body" tone="muted" center>{message}</AppText> : null}
      {onRetry ? <Button title={retryLabel} variant="secondary" icon="refresh" fullWidth={false} onPress={onRetry} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  iconRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  action: { marginTop: spacing.md },
});
