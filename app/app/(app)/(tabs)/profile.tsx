import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useApi } from '@/lib/useApi';
import { useUserStore } from '@/store/useUserStore';
import { useColors } from '@/store/useThemeStore';
import { haptics } from '@/lib/haptics';
import { indexAgeLabel } from '@/lib/format';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore.setState;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [ghin, setGhin] = useState('');
  const [handicap, setHandicap] = useState('');
  const [saving, setSaving] = useState(false);

  // Hydrate the form from the loaded profile.
  useEffect(() => {
    if (!user) return;
    setFirstName(user.first_name ?? '');
    setLastName(user.last_name ?? '');
    setGhin(user.ghin_number ?? '');
    setHandicap(user.handicap != null ? String(user.handicap) : '');
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        ghin_number: ghin.trim() || null,
      };
      if (handicap.trim() === '') {
        patch.handicap = null;
      } else {
        const n = Number(handicap);
        if (!Number.isFinite(n)) { Alert.alert('Invalid handicap', 'Enter a number like 8.4 or +1.2.'); setSaving(false); return; }
        patch.handicap = n;
      }
      const updated = await api.updateMe(patch);
      setUser({ user: updated });
      haptics.success();
      Alert.alert('Saved', 'Your profile is updated.');
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Field label="First name" value={firstName} onChangeText={setFirstName} placeholder="First" />
          <Field label="Last name" value={lastName} onChangeText={setLastName} placeholder="Last" />
          <Field
            label="GHIN number"
            value={ghin}
            onChangeText={setGhin}
            placeholder="e.g. 1234567"
            keyboardType="number-pad"
          />
          <Field
            label="Handicap Index"
            value={handicap}
            onChangeText={setHandicap}
            placeholder="e.g. 8.4 (use + for plus, e.g. -1.2)"
            keyboardType="numbers-and-punctuation"
          />
          {user && (
            <Text style={styles.ageNote}>{indexAgeLabel(user.handicap, user.handicap_updated_at)}</Text>
          )}
          <Text style={styles.note}>
            Your Handicap Index becomes the official GHIN value once GHIN
            verification is connected. For now it's entered manually. You'll be
            asked to confirm it when you post or accept a match.
          </Text>

          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOut} onPress={() => signOut()}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string; value: string; onChangeText: (s: string) => void;
  placeholder?: string; keyboardType?: any;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={props.keyboardType}
        autoCapitalize="words"
      />
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { padding: spacing.lg, gap: spacing.md },
  field: { gap: spacing.xs },
  label: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: 16, color: colors.ink,
  },
  ageNote: { ...typography.caption, color: colors.fairway },
  note: { ...typography.caption, color: colors.muted },
  saveBtn: { backgroundColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  saveText: { ...typography.bodySemiBold, color: colors.surface },
  signOut: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  signOutText: { ...typography.body, color: colors.flagRed },
  });
}
