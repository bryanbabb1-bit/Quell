import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '@/lib/useApi';
import { useUserStore } from '@/store/useUserStore';
import { useColors } from '@/store/useThemeStore';
import { CourseSelect } from '@/components/CourseSelect';
import { Avatar } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { indexAgeLabel, formatHandicap, parseHandicapInput } from '@/lib/format';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

export default function ProfileScreen() {
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore.setState;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [handicap, setHandicap] = useState('');
  const [homeCourseId, setHomeCourseId] = useState<string | null>(null);
  const [homeCourseName, setHomeCourseName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async () => {
    // Lazy-require: expo-image-picker is a NATIVE module. Importing it at the top
    // of this route file crashes the whole route on a dev client that doesn't
    // have the module baked in — which drops the Profile tab out of the navigator
    // entirely. Requiring it here, guarded, keeps the screen safe on any build.
    let ImagePicker: typeof import('expo-image-picker') | null = null;
    try { ImagePicker = require('expo-image-picker'); } catch { ImagePicker = null; }
    if (!ImagePicker?.launchImageLibraryAsync) {
      Alert.alert('Update needed', 'Photo upload activates once you install the latest Quell build.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Allow photos', 'Enable photo access for Quell in iOS Settings to set a picture.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    setUploading(true);
    try {
      const { url } = await api.uploadPhoto(res.assets[0].uri);
      if (user) setUser({ user: { ...user, profile_photo_url: url } });
      haptics.success();
    } catch (e: any) {
      Alert.alert('Could not upload', e?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  // Hydrate the form from the loaded profile (+ resolve home course name).
  useEffect(() => {
    if (!user) return;
    setFirstName(user.first_name ?? '');
    setLastName(user.last_name ?? '');
    setHandicap(user.handicap != null ? formatHandicap(user.handicap) : '');
    const hid = user.home_course_id ?? null;
    setHomeCourseId(hid);
    if (hid) api.getCourses().then((r) => setHomeCourseName(r.courses.find((x) => x.id === hid)?.name ?? null)).catch(() => {});
    else setHomeCourseName(null);
  }, [user, api]);

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        home_course_id: homeCourseId,
      };
      if (handicap.trim() === '') {
        patch.handicap = null;
      } else {
        const n = parseHandicapInput(handicap);
        if (n == null) { Alert.alert('Invalid handicap', 'Enter a number like 8.4, or +1.2 for a plus handicap.'); setSaving(false); return; }
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
          <TouchableOpacity style={styles.avatarHeader} onPress={pickPhoto} disabled={uploading} activeOpacity={0.85}>
            <Avatar name={[firstName, lastName].filter(Boolean).join(' ') || user?.email} size={92} photoUrl={user?.profile_photo_url} />
            <View style={styles.avatarBadge}>
              {uploading ? <ActivityIndicator color={colors.onAccent} size="small" /> : <Ionicons name="camera" size={16} color={colors.onAccent} />}
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Tap to change photo</Text>

          <Field label="First name" value={firstName} onChangeText={setFirstName} placeholder="First" />
          <Field label="Last name" value={lastName} onChangeText={setLastName} placeholder="Last" />

          <CourseSelect
            label="Home course"
            valueName={homeCourseName}
            onSelect={(course) => { setHomeCourseId(course?.id ?? null); setHomeCourseName(course?.name ?? null); }}
            placeholder="Search your home course…"
          />

          <Field
            label="Handicap Index"
            value={handicap}
            onChangeText={setHandicap}
            placeholder="e.g. 8.4, or +1.2 for a plus handicap"
            keyboardType="numbers-and-punctuation"
          />
          {user && (
            <Text style={styles.ageNote}>{indexAgeLabel(user.handicap, user.handicap_updated_at)}</Text>
          )}
          <Text style={styles.note}>
            Your home course pre-filters Discovery and the leaderboard. Your Handicap
            Index is entered manually for now — you'll confirm it when you post or accept a match.
          </Text>

          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.saveText}>Save</Text>}
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
  avatarHeader: { alignSelf: 'center', marginBottom: spacing.xs },
  avatarBadge: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  avatarHint: { ...typography.caption, color: colors.muted, textAlign: 'center', marginBottom: spacing.sm },
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
