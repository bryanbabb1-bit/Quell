import { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSignIn } from '@clerk/clerk-expo';
import { useLocalSearchParams, router } from 'expo-router';
import { colors, typography, spacing, radius } from '@/constants/theme';

export default function ResetPasswordScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { code } = useLocalSearchParams<{ code: string }>();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (!isLoaded || loading) return;
    if (!newPassword) { setError('Enter a new password.'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await signIn!.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code ?? '',
        password: newPassword,
      });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
      } else {
        setError(`Reset needs another step (${result.status}).`);
      }
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? 'Reset failed. Check your code and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>New Password</Text>
        <Text style={styles.subtitle}>Choose a new password for your account.</Text>

        <View style={styles.passwordWrap}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            placeholder="New password"
            placeholderTextColor={colors.muted}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showNew}
            autoComplete="new-password"
            returnKeyType="next"
            autoFocus
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowNew((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={showNew ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>
        <View style={styles.passwordWrap}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            placeholder="Confirm password"
            placeholderTextColor={colors.muted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirm}
            autoComplete="new-password"
            returnKeyType="done"
            onSubmitEditing={handleReset}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowConfirm((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={showConfirm ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleReset}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.surface} size="small" />
            : <Text style={styles.buttonText}>Set New Password</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  passwordWrap: { width: '100%', justifyContent: 'center' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  backBtn: { position: 'absolute', top: spacing.xl * 2, left: spacing.lg, padding: spacing.sm },
  backText: { ...typography.bodySemiBold, fontSize: 17, color: colors.fairway },
  title: { ...typography.title, fontSize: 30, color: colors.ink, alignSelf: 'flex-start' },
  subtitle: { ...typography.body, fontSize: 14, color: colors.muted, alignSelf: 'flex-start', marginBottom: spacing.xs },
  input: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    fontSize: 16,
    color: colors.ink,
  },
  error: { ...typography.body, fontSize: 13, color: colors.flagRed, alignSelf: 'flex-start' },
  button: {
    width: '100%',
    backgroundColor: colors.fairway,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { ...typography.bodySemiBold, fontSize: 16, color: colors.surface },
});
