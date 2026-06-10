import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { formatHandicap, indexAgeLabel, parseHandicapInput } from '@/lib/format';
import { useColors } from '@/store/useThemeStore';
import { spacing, radius, typography, type Palette } from '@/constants/theme';

// Pre-round index confirmation. Rendered as an absolute-fill overlay (NOT a
// React Native <Modal> — stacked Modals misbehave on iOS; see the RN overlay
// pattern). Shown when the user's index is unset or stale, right before posting
// or accepting a match, so the value locked onto the match is current.
//
// Index input accepts plain values ("8.4") and plus handicaps ("+1.2" -> -1.2).
export function ConfirmIndexSheet({
  visible, handicap, updatedAt, actionLabel, busy, onCancel, onConfirm,
}: {
  visible: boolean;
  handicap: number | null;
  updatedAt: string | null;
  actionLabel: string;       // e.g. "Post match" / "Accept match"
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (index: number) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Lift the sheet by the exact keyboard height (UI-thread tracked) so the input
  // and buttons are never covered — more reliable than KeyboardAvoidingView for
  // a bottom-anchored overlay.
  const keyboard = useAnimatedKeyboard();
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -keyboard.height.value }] }));

  // Seed the field from the current index whenever the sheet opens.
  useEffect(() => {
    if (visible) {
      setText(handicap == null ? '' : formatHandicap(handicap));
      setErr(null);
    }
  }, [visible, handicap]);

  if (!visible) return null;

  const submit = () => {
    if (text.trim() === '') { setErr('Enter your current Handicap Index.'); return; }
    // "+1.2" is a plus handicap (better than scratch) -> stored negative.
    const value = parseHandicapInput(text);
    if (value == null || value < -10 || value > 54) {
      setErr('Enter a number like 8.4, or +1.2 for a plus handicap.');
      return;
    }
    onConfirm(value);
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel} />
      <Animated.View style={[styles.sheetWrap, liftStyle]} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Confirm your Handicap Index</Text>
          <Text style={styles.subtitle}>
            Handicaps are locked at the time a match is accepted — they can't change after that, so
            the result stays fair. Confirm or update your current Handicap Index below.
          </Text>

          <View style={styles.ageRow}>
            <Ionicons name="time-outline" size={15} color={colors.muted} />
            <Text style={styles.ageText}>{indexAgeLabel(handicap, updatedAt)}</Text>
          </View>

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={(t) => { setText(t); if (err) setErr(null); }}
            placeholder="e.g. 8.4 (use + for plus, e.g. +1.2)"
            placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {err && <Text style={styles.error}>{err}</Text>}

          <TouchableOpacity style={[styles.confirmBtn, busy && styles.disabled]} onPress={submit} disabled={busy}>
            {busy
              ? <ActivityIndicator color={colors.surface} size="small" />
              : <Text style={styles.confirmText}>Confirm & {actionLabel}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  title: { ...typography.heading },
  subtitle: { ...typography.caption, color: colors.muted },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  ageText: { ...typography.caption },
  input: {
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16, color: colors.ink, marginTop: spacing.xs,
  },
  error: { ...typography.caption, color: colors.flagRed },
  confirmBtn: { backgroundColor: colors.fairway, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  disabled: { opacity: 0.7 },
  confirmText: { ...typography.bodySemiBold, color: colors.surface },
  cancelBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { ...typography.body, color: colors.muted },
  });
}
