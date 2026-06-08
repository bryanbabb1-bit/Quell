import { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { colors, typography, spacing, radius } from '@/constants/theme';

export default function ForgotPasswordScreen() {
  const { signIn, isLoaded } = useSignIn();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSendCode() {
    if (!isLoaded || loading) return;
    setError('');
    setLoading(true);
    try {
      await signIn!.create({ strategy: 'reset_password_email_code', identifier: email.trim() });
      setStep('code');
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? 'Failed to send reset code.');
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setError('Enter the code from your email.');
      return;
    }
    router.push(`/(auth)/reset-password?code=${encodeURIComponent(trimmed)}`);
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

        <Text style={styles.title}>Reset Password</Text>

        {step === 'email' ? (
          <>
            <Text style={styles.subtitle}>
              Enter your email address and we'll send you a reset code.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="done"
              onSubmitEditing={handleSendCode}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={colors.surface} size="small" />
                : <Text style={styles.buttonText}>Send Reset Code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Enter the code we sent to {email}.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor={colors.muted}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              autoFocus
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={handleContinue}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkButton} onPress={() => { setStep('email'); setError(''); setCode(''); }}>
              <Text style={styles.linkText}>Resend code</Text>
            </TouchableOpacity>
          </>
        )}
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
  linkButton: { alignItems: 'center', padding: spacing.sm },
  linkText: { ...typography.body, fontSize: 14, color: colors.muted },
});
