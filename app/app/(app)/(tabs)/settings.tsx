import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '@/store/useThemeStore';
import { PALETTES, type Palette, spacing, radius, typography } from '@/constants/theme';

export default function SettingsScreen() {
  const c = useThemeStore((s) => s.colors);
  const paletteId = useThemeStore((s) => s.paletteId);
  const setPalette = useThemeStore((s) => s.setPalette);
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <Text style={styles.sectionHint}>Pick a color theme. It applies instantly.</Text>

        <View style={styles.card}>
          {PALETTES.map((p, i) => {
            const active = p.id === paletteId;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.row, i > 0 && styles.rowDivider]}
                onPress={() => setPalette(p.id)}
                activeOpacity={0.7}
              >
                <View style={styles.swatches}>
                  <View style={[styles.swatch, { backgroundColor: p.colors.fairway }]} />
                  <View style={[styles.swatch, { backgroundColor: p.colors.sand }]} />
                  <View style={[styles.swatch, { backgroundColor: p.colors.paper, borderWidth: 1, borderColor: p.colors.border }]} />
                </View>
                <Text style={styles.rowLabel}>{p.name}</Text>
                {active
                  ? <Ionicons name="checkmark-circle" size={22} color={c.fairway} />
                  : <View style={styles.radioEmpty} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.note}>More settings will live here as the app grows.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.paper },
    container: { padding: spacing.lg, gap: spacing.sm },
    sectionTitle: { ...typography.heading, color: c.ink },
    sectionHint: { ...typography.caption, color: c.muted, marginBottom: spacing.sm },
    card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    swatches: { flexDirection: 'row' },
    swatch: { width: 22, height: 22, borderRadius: 6, marginLeft: -6 },
    rowLabel: { ...typography.bodySemiBold, color: c.ink, flex: 1, marginLeft: spacing.sm },
    radioEmpty: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.border },
    note: { ...typography.caption, color: c.muted, marginTop: spacing.md },
  });
}
