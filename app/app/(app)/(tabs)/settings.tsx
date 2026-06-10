import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '@clerk/clerk-expo';
import { useThemeStore } from '@/store/useThemeStore';
import { useUserStore } from '@/store/useUserStore';
import { useApi } from '@/lib/useApi';
import { registerForPush } from '@/lib/notifications';
import { haptics } from '@/lib/haptics';
import { PALETTES, type Palette, spacing, radius, typography } from '@/constants/theme';

export default function SettingsScreen() {
  const c = useThemeStore((s) => s.colors);
  const paletteId = useThemeStore((s) => s.paletteId);
  const setPalette = useThemeStore((s) => s.setPalette);
  const styles = useMemo(() => makeStyles(c), [c]);
  const { signOut } = useAuth();
  const api = useApi();
  const user = useUserStore((s) => s.user);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifOn, setNotifOn] = useState(!!user?.expo_push_token);

  const toggleNotifications = async (v: boolean) => {
    setNotifBusy(true);
    if (v) {
      try {
        const token = await registerForPush();
        if (token) {
          const updated = await api.updateMe({ expo_push_token: token });
          useUserStore.setState({ user: updated });
          setNotifOn(true);
        } else {
          setNotifOn(false);
          Alert.alert('Not enabled', 'Allow notifications for Quell in iOS Settings, then try again. (Requires the notifications build.)');
        }
      } catch {
        setNotifOn(false);
        Alert.alert('Could not enable', 'Try again in a moment.');
      }
    } else {
      try {
        const updated = await api.updateMe({ expo_push_token: null });
        useUserStore.setState({ user: updated });
      } catch { /* best effort */ }
      setNotifOn(false);
    }
    setNotifBusy(false);
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'Sign out of Quell?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const version = (Constants.expoConfig as any)?.version ?? '0.1.0';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Appearance */}
        <Text style={styles.sectionTitle}>Appearance</Text>
        <Text style={styles.sectionHint}>Light or dark — applies instantly.</Text>
        <View style={styles.card}>
          {PALETTES.map((p, i) => {
            const active = p.id === paletteId;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.row, i > 0 && styles.rowDivider]}
                onPress={() => { haptics.select(); setPalette(p.id); }}
                activeOpacity={0.7}
              >
                <View style={styles.swatches}>
                  <View style={[styles.swatch, { backgroundColor: p.colors.bg, borderWidth: 1, borderColor: p.colors.border }]} />
                  <View style={[styles.swatch, { backgroundColor: p.colors.surface }]} />
                  <View style={[styles.swatch, { backgroundColor: p.colors.accent }]} />
                </View>
                <Text style={styles.rowLabel}>{p.name}</Text>
                {active
                  ? <Ionicons name="checkmark-circle" size={22} color={c.accent} />
                  : <View style={styles.radioEmpty} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Notifications */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="notifications-outline" size={20} color={c.muted} />
            <Text style={styles.rowLabel}>Challenges & score reminders</Text>
            <Switch
              value={notifOn}
              onValueChange={(v) => { haptics.select(); toggleNotifications(v); }}
              disabled={notifBusy}
              trackColor={{ true: c.accent, false: c.scheme === 'light' ? '#B9C3BC' : c.surfaceRaised }}
              ios_backgroundColor={c.scheme === 'light' ? '#B9C3BC' : c.surfaceRaised}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="person-outline" size={20} color={c.muted} />
            <Text style={styles.rowLabel} numberOfLines={1}>{user?.email ?? 'Signed in'}</Text>
          </View>
          <TouchableOpacity style={[styles.row, styles.rowDivider]} onPress={confirmSignOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={20} color={c.loss} />
            <Text style={[styles.rowLabel, { color: c.loss }]}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="information-circle-outline" size={20} color={c.muted} />
            <Text style={styles.rowLabel}>Quell</Text>
            <Text style={styles.rowAction}>v{version}</Text>
          </View>
        </View>
        <Text style={styles.note}>Post a match. Settle the score.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    container: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
    sectionTitle: { ...typography.heading, color: c.text, marginTop: spacing.md },
    sectionHint: { ...typography.caption, color: c.muted, marginBottom: spacing.xs },
    card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    rowLabel: { ...typography.bodySemiBold, color: c.text, flex: 1 },
    rowAction: { ...typography.bodySemiBold, color: c.accent },
    swatches: { flexDirection: 'row' },
    swatch: { width: 22, height: 22, borderRadius: 6, marginLeft: -6 },
    radioEmpty: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.border },
    note: { ...typography.caption, color: c.muted, marginTop: spacing.md, textAlign: 'center' },
  });
}
