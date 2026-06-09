import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useApi, type CreateMatchInput } from '@/lib/useApi';
import { useUserStore } from '@/store/useUserStore';
import { useColors } from '@/store/useThemeStore';
import { ConfirmIndexSheet } from '@/components/ConfirmIndexSheet';
import type { MatchType } from '@/types';
import { MATCH_TYPE_LABELS } from '@/types';
import { spacing, radius, typography, type Palette } from '@/constants/theme';
import { isIndexStale } from '@/lib/format';

const TYPES: MatchType[] = ['front_nine', 'back_nine', 'eighteen'];

// ISO date N days from today, for the quick date input default.
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CreateMatchScreen() {
  const api = useApi();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [courseName, setCourseName] = useState('');
  const [teeColor, setTeeColor] = useState('');
  const [playDate, setPlayDate] = useState(isoToday());
  const [playTime, setPlayTime] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('eighteen');
  const [hcpMin, setHcpMin] = useState('');
  const [hcpMax, setHcpMax] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const user = useUserStore((s) => s.user);
  const [pendingCreate, setPendingCreate] = useState<CreateMatchInput | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);

  // Validate the form and return the create payload, or null (after alerting).
  const buildPayload = (): CreateMatchInput | null => {
    if (!courseName.trim() || !teeColor.trim()) {
      Alert.alert('Missing info', 'Course and tees are required.'); return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(playDate)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD (e.g. 2026-06-14).'); return null;
    }
    const min = parseInt(hcpMin, 10);
    const max = parseInt(hcpMax, 10);
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      Alert.alert('Handicap range', 'Enter whole numbers for the min and max handicap.'); return null;
    }
    if (min > max) { Alert.alert('Handicap range', 'Min must be ≤ max.'); return null; }

    return {
      course_name: courseName.trim(),
      tee_color: teeColor.trim(),
      play_date: playDate,
      play_time: playTime.trim() || null,
      match_type: matchType,
      stakes: null,
      hcp_range_min: min,
      hcp_range_max: max,
    };
  };

  const doCreate = async (payload: CreateMatchInput) => {
    setSubmitting(true);
    try {
      await api.createMatch(payload);
      router.back();
    } catch (e: any) {
      Alert.alert('Could not post', e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // The creator's index is locked onto the match at post time — confirm/refresh
  // it first when it's unset or stale.
  const submit = () => {
    const payload = buildPayload();
    if (!payload) return;
    if (user && isIndexStale(user.handicap, user.handicap_updated_at)) setPendingCreate(payload);
    else doCreate(payload);
  };

  const confirmIndexAndCreate = async (index: number) => {
    setSheetBusy(true);
    try {
      const updated = await api.updateMe({ handicap: index });
      useUserStore.setState({ user: updated });
      const payload = pendingCreate;
      setPendingCreate(null);
      if (payload) await doCreate(payload);
    } catch (e: any) {
      Alert.alert('Could not save your index', e?.message ?? 'Please try again.');
    } finally {
      setSheetBusy(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <Field label="Course" value={courseName} onChangeText={setCourseName} placeholder="Prairie Highlands" />
        <Field label="Tees" value={teeColor} onChangeText={setTeeColor} placeholder="Blue / White / Black…" />

        <View style={styles.rowFields}>
          <View style={styles.flex}>
            <Field label="Date" value={playDate} onChangeText={setPlayDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.flex}>
            <Field label="Time (optional)" value={playTime} onChangeText={setPlayTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation" />
          </View>
        </View>

        <Text style={styles.label}>Match type</Text>
        <View style={styles.segment}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.segBtn, matchType === t && styles.segBtnActive]}
              onPress={() => setMatchType(t)}
            >
              <Text style={[styles.segText, matchType === t && styles.segTextActive]}>{MATCH_TYPE_LABELS[t]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Opponent handicap range</Text>
        <View style={styles.rowFields}>
          <View style={styles.flex}>
            <TextInput style={styles.input} value={hcpMin} onChangeText={setHcpMin} placeholder="Min" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.flex}>
            <TextInput style={styles.input} value={hcpMax} onChangeText={setHcpMax} placeholder="Max" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" />
          </View>
        </View>

        <TouchableOpacity style={styles.submit} onPress={submit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitText}>Post Match</Text>}
        </TouchableOpacity>
      </ScrollView>

    <ConfirmIndexSheet
      visible={!!pendingCreate}
      handicap={user?.handicap ?? null}
      updatedAt={user?.handicap_updated_at ?? null}
      actionLabel="Post match"
      busy={sheetBusy}
      onCancel={() => setPendingCreate(null)}
      onConfirm={confirmIndexAndCreate}
    />
    </View>
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
      />
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.paper },
  field: { gap: spacing.xs },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  label: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: 16, color: colors.ink,
  },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.sm + 2, alignItems: 'center', backgroundColor: colors.surface },
  segBtnActive: { backgroundColor: colors.fairway, borderColor: colors.fairway },
  segText: { ...typography.bodySemiBold, color: colors.ink },
  segTextActive: { color: colors.surface },
  note: { ...typography.caption, color: colors.muted },
  submit: { backgroundColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  submitText: { ...typography.bodySemiBold, color: colors.surface },
  });
}
