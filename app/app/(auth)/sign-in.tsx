import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { colors, spacing, radius, typography } from '@/constants/theme';

// Email + password auth. Sign-up is two-step: create the account, then verify
// the emailed 6-digit code (Clerk requires email verification by default, so a
// one-step create returns `missing_requirements` with a null session). The
// onboarding/norms flow (handicap entry, "verification tool not wagering")
// still layers on top of this once the session is active.
export default function SignInScreen() {
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();

  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = mode === 'sign-in' ? signInLoaded : signUpLoaded;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'sign-in') {
        const res = await signIn!.create({ identifier: email.trim(), password });
        if (res.status === 'complete') {
          await setSignInActive!({ session: res.createdSessionId });
        } else {
          // e.g. needs 2FA — out of scope for the email+password V1.
          setErr(`Sign-in needs another step (${res.status}).`);
        }
      } else {
        const res = await signUp!.create({ emailAddress: email.trim(), password });
        if (res.status === 'complete') {
          await setSignUpActive!({ session: res.createdSessionId });
        } else {
          // Email not yet verified — send the code and switch to the code view.
          await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
          setPendingVerification(true);
        }
      }
      // AuthGate handles the redirect into (app) once the session is active.
    } catch (e: any) {
      setErr(e?.errors?.[0]?.message ?? e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!signUpLoaded || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await signUp!.attemptEmailAddressVerification({ code: code.trim() });
      if (res.status === 'complete') {
        await setSignUpActive!({ session: res.createdSessionId });
      } else {
        setErr('That code did not complete sign-up. Double-check and try again.');
      }
    } catch (e: any) {
      setErr(e?.errors?.[0]?.message ?? e?.message ?? 'Invalid or expired code.');
    } finally {
      setBusy(false);
    }
  };

  const resetToStart = () => {
    setPendingVerification(false);
    setCode('');
    setErr(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.brand}>Match Play</Text>
          <Text style={styles.tagline}>Post a match. Settle the score.</Text>

          {pendingVerification ? (
            <>
              <Text style={styles.prompt}>
                We sent a 6-digit code to {email.trim()}. Enter it to finish.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Verification code"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                value={code}
                onChangeText={setCode}
              />

              {err && <Text style={styles.error}>{err}</Text>}

              <TouchableOpacity style={styles.button} onPress={verify} disabled={busy}>
                {busy
                  ? <ActivityIndicator color={colors.surface} />
                  : <Text style={styles.buttonText}>Verify email</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={resetToStart}>
                <Text style={styles.switch}>Use a different email</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              {err && <Text style={styles.error}>{err}</Text>}

              <TouchableOpacity style={styles.button} onPress={submit} disabled={busy || !ready}>
                {busy
                  ? <ActivityIndicator color={colors.surface} />
                  : <Text style={styles.buttonText}>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setErr(null); }}
              >
                <Text style={styles.switch}>
                  {mode === 'sign-in' ? "New here? Create an account" : 'Have an account? Sign in'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  brand: { ...typography.title, fontSize: 34, color: colors.fairway, textAlign: 'center' },
  tagline: { ...typography.caption, textAlign: 'center', marginBottom: spacing.lg },
  prompt: { ...typography.caption, textAlign: 'center', marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.ink,
  },
  button: {
    backgroundColor: colors.fairway,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonText: { ...typography.bodySemiBold, color: colors.surface },
  switch: { ...typography.caption, color: colors.fairway, textAlign: 'center', marginTop: spacing.md },
  error: { ...typography.caption, color: colors.flagRed, textAlign: 'center' },
});
