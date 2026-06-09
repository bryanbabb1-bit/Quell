import { ScrollView, View, StyleSheet, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useColors } from '@/store/useThemeStore';
import { spacing, type Palette } from '@/constants/theme';

interface ScreenProps extends ViewProps {
  /** Wrap content in a ScrollView. */
  scroll?: boolean;
  /** Apply standard horizontal+vertical padding to the content. */
  padded?: boolean;
  edges?: readonly Edge[];
}

// Page wrapper: dark safe-area background + optional scroll + standard padding.
// Replaces the per-screen `SafeAreaView style={{flex:1, backgroundColor: c.paper}}`
// boilerplate so every screen shares the same canvas.
export function Screen({ scroll, padded = true, edges = ['bottom'], style, children, ...rest }: ScreenProps) {
  const c = useColors();
  const styles = makeStyles(c);
  const inner = padded ? styles.padded : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, style]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...rest}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, inner, style]} {...rest}>{children}</View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    padded: { padding: spacing.lg, gap: spacing.md },
  });
}
