import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuth } from '@clerk/clerk-expo';
import { useThemeStore } from '@/store/useThemeStore';
import { useUserStore } from '@/store/useUserStore';
import { useApi } from '@/lib/useApi';
import { registerForPush } from '@/lib/notifications';
import { sharePlayerInvite } from '@/lib/invite';
import { haptics } from '@/lib/haptics';
import { PALETTES, type Palette, spacing, radius, typography } from '@/constants/theme';

export default function SettingsScreen() {
  const c = useThemeStore((s) => s.colors);
  const paletteId = useThemeStore((s) => s.paletteId);
  const setPalette = useThemeStore((s) => s.setPalette);
  const styles = useMemo(() => makeStyles(c), [c]);
  const { signOut } = useAuth();
  const router = useRouter();
  const api = useApi();
  const user = useUserStore((s) => s.user);
  const staffClubId = user?.staff_club_id ?? null;
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifOn, setNotifOn] = useState(!!user?.push_enabled);
  const [deleting, setDeleting] = useState(false);

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
          Alert.alert('Not enabled', 'Allow notifications for Foretera in iOS Settings, then try again. (Requires the notifications build.)');
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
    Alert.alert('Sign out', 'Sign out of Foretera?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  // App Store 5.1.1(v): account deletion must be available in-app. Two-step
  // confirm — this is permanent (Clerk account + profile are gone; completed
  // match results remain, anonymized).
  const confirmDelete = () => {
    Alert.alert('Delete your account?', 'This permanently deletes your account and profile. Completed match results stay, without your name. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account', style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            await api.deleteMe();
            await signOut();
          } catch (e: any) {
            Alert.alert('Could not delete', e?.message ?? 'Try again in a moment.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const version = (Constants.expoConfig as any)?.version ?? '0.1.0';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Club Control — only when this user runs a club */}
        {staffClubId && (
          <>
            <Text style={styles.sectionTitle}>Your club</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Open Club Control"
                onPress={() => { haptics.select(); router.push(`/(app)/club/${staffClubId}/manage`); }}
              >
                <Ionicons name="speedometer-outline" size={20} color={c.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Club Control</Text>
                  <Text style={styles.rowSub}>Pulse dashboard, identity & growth</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.muted} />
              </TouchableOpacity>
            </View>
          </>
        )}

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
              trackColor={{ true: c.accent, false: c.surfaceRaised }}
              ios_backgroundColor={c.surfaceRaised}
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
          <TouchableOpacity style={[styles.row, styles.rowDivider]} onPress={confirmDelete} disabled={deleting} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={20} color={c.loss} />
            <Text style={[styles.rowLabel, { color: c.loss }]}>{deleting ? 'Deleting…' : 'Delete account'}</Text>
          </TouchableOpacity>
        </View>

        {/* Invite — the growth loop, available to everyone */}
        <Text style={styles.sectionTitle}>Invite</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Invite a friend to Foretera"
            onPress={() => { haptics.select(); sharePlayerInvite(); }}
          >
            <Ionicons name="person-add-outline" size={20} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Invite a friend</Text>
              <Text style={styles.rowSub}>Let’s get a match going</Text>
            </View>
            <Ionicons name="share-outline" size={18} color={c.muted} />
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="information-circle-outline" size={20} color={c.muted} />
            <Text style={styles.rowLabel}>Foretera</Text>
            <Text style={styles.rowAction}>v{version}</Text>
          </View>
        </View>
        <Text style={styles.note}>Find a match. Settle the score.</Text>
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
    rowDivider: { borderTopWidth: 1, borderTopColor: c.divider },
    rowLabel: { ...typography.bodySemiBold, color: c.text, flex: 1 },
    rowSub: { ...typography.caption, color: c.muted, marginTop: 1 },
    rowAction: { ...typography.bodySemiBold, color: c.accent },
    swatches: { flexDirection: 'row' },
    swatch: { width: 22, height: 22, borderRadius: 6, marginLeft: -6 },
    radioEmpty: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.border },
    note: { ...typography.caption, color: c.muted, marginTop: spacing.md, textAlign: 'center' },
  });
}
