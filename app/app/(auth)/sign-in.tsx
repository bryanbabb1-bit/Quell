import { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSignIn, useAuth } from '@clerk/clerk-expo';
import { Link } from 'expo-router';
import { colors, typography, spacing, radius } from '@/constants/theme';

// Clerk's second-factor strategies we know how to drive. backup_code and totp
// don't need a prepare step; phone_code does.
type SecondFactorStrategy = 'totp' | 'phone_code' | 'backup_code';
const STRATEGY_LABELS: Record<SecondFactorStrategy, string> = {
  totp: 'Authenticator code',
  phone_code: 'Text message code',
  backup_code: 'Backup code',
};

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Second-factor state — only relevant when Clerk returns needs_second_factor
  const [secondFactor, setSecondFactor] = useState<null | {
    available: SecondFactorStrategy[];
    selected: SecondFactorStrategy;
    sent: boolean;
  }>(null);
  const [code, setCode] = useState('');

  function clearError() { if (error) setError(''); }

  async function finishIfComplete(result: any): Promise<boolean> {
    if (result.status === 'complete') {
      await setActive?.({ session: result.createdSessionId });
      return true;
    }
    return false;
  }

  // Pull the supported strategies off the sign-in result, fall back to common
  // ones if the field is missing (e.g. older Clerk SDK).
  function collectSupportedStrategies(result: any): SecondFactorStrategy[] {
    const raw = result.supportedSecondFactors ?? [];
    const list: SecondFactorStrategy[] = [];
    for (const f of raw) {
      const s = f.strategy as SecondFactorStrategy;
      if ((s === 'totp' || s === 'phone_code' || s === 'backup_code') && !list.includes(s)) {
        list.push(s);
      }
    }
    return list.length > 0 ? list : ['totp', 'backup_code'];
  }

  async function prepareSecondFactor(strategy: SecondFactorStrategy): Promise<boolean> {
    if (strategy === 'phone_code') {
      try {
        await signIn!.prepareSecondFactor({ strategy: 'phone_code' });
        return true;
      } catch (e: any) {
        setError(e.errors?.[0]?.message ?? 'Could not send the code. Try a different method.');
        return false;
      }
    }
    // totp + backup_code don't need preparation
    return true;
  }

  // Clerk-Expo can end up in a torn state where useAuth().isSignedIn=false
  // (so AuthGate routes to this screen) but the SDK still has a residual
  // session, so signIn.create throws { code: 'session_exists' }. Detect
  // that, sign the residual out, and retry once.
  async function attemptSignIn() {
    try {
      return await signIn!.create({ identifier: email.trim(), password });
    } catch (e: any) {
      const c = e?.errors?.[0]?.code;
      if (c === 'session_exists' || c === 'identifier_already_signed_in') {
        try { await signOut(); } catch { /* best effort */ }
        return await signIn!.create({ identifier: email.trim(), password });
      }
      throw e;
    }
  }

  async function handleSignIn() {
    if (loading) return;
    if (!isLoaded) {
      // Surface the guard instead of silently doing nothing — tells us if
      // Clerk's signIn object hasn't initialized yet.
      setError('Still connecting to the server — give it a second and tap again.');
      return;
    }
    clearError();
    setLoading(true);
    try {
      let result = await attemptSignIn();
      if (result.status === 'needs_first_factor') {
        result = await signIn!.attemptFirstFactor({ strategy: 'password', password });
      }
      if (await finishIfComplete(result)) return;

      if (result.status === 'needs_second_factor') {
        const available = collectSupportedStrategies(result);
        const selected = available[0];
        const sent = await prepareSecondFactor(selected);
        setSecondFactor({ available, selected, sent });
        return;
      }

      // Anything else (needs_new_password, abandoned, etc.) — show a clear,
      // actionable message instead of dead-ending.
      setError(
        result.status === 'needs_new_password'
          ? 'Reset your password to continue.'
          : `Sign in needs another step (${result.status}). Try again or use a different method.`
      );
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!isLoaded || loading || !secondFactor) return;
    const trimmed = code.trim();
    if (!trimmed) { setError('Enter the code.'); return; }
    clearError();
    setLoading(true);
    try {
      const result = await signIn!.attemptSecondFactor({
        strategy: secondFactor.selected,
        code: trimmed,
      });
      if (await finishIfComplete(result)) return;
      setError(`Could not verify (${result.status}).`);
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSwitchStrategy(strategy: SecondFactorStrategy) {
    if (!secondFactor || strategy === secondFactor.selected) return;
    clearError();
    setCode('');
    setLoading(true);
    try {
      const sent = await prepareSecondFactor(strategy);
      setSecondFactor({ ...secondFactor, selected: strategy, sent });
    } finally {
      setLoading(false);
    }
  }

  function handleStartOver() {
    setSecondFactor(null);
    setCode('');
    setError('');
    setPassword('');
  }

  // ─── Second-factor screen ───────────────────────────────────────────────────
  if (secondFactor) {
    const strategyLabel = STRATEGY_LABELS[secondFactor.selected];
    const hint =
      secondFactor.selected === 'totp'
        ? 'Enter the 6-digit code from your authenticator app.'
        : secondFactor.selected === 'phone_code'
        ? secondFactor.sent
          ? 'We sent a code to the phone number on your account.'
          : "Couldn't send a text code. Try a different method below."
        : 'Enter one of your backup codes.';

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
          <Text style={styles.brand}>
            <Text style={styles.brandMatch}>Match </Text>
            <Text style={styles.brandPlay}>Play</Text>
          </Text>

          <Text style={styles.stepTitle}>{strategyLabel}</Text>
          <Text style={styles.stepSubtitle}>{hint}</Text>

          <TextInput
            style={styles.input}
            placeholder={secondFactor.selected === 'backup_code' ? 'Backup code' : '6-digit code'}
            placeholderTextColor={colors.muted}
            value={code}
            onChangeText={setCode}
            keyboardType={secondFactor.selected === 'backup_code' ? 'default' : 'number-pad'}
            autoFocus
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleVerifyCode}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerifyCode}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.surface} size="small" />
              : <Text style={styles.buttonText}>Verify</Text>}
          </TouchableOpacity>

          {secondFactor.available.length > 1 && (
            <>
              <Text style={styles.switchLabel}>Try a different method:</Text>
              {secondFactor.available
                .filter((s) => s !== secondFactor.selected)
                .map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={styles.linkButton}
                    onPress={() => handleSwitchStrategy(s)}
                    disabled={loading}
                  >
                    <Text style={styles.linkText}>{STRATEGY_LABELS[s]}</Text>
                  </TouchableOpacity>
                ))}
            </>
          )}

          <TouchableOpacity style={styles.linkButton} onPress={handleStartOver}>
            <Text style={styles.linkText}>← Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─── Sign-in screen ─────────────────────────────────────────────────────────
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
        <Text style={styles.brand}>
          <Text style={styles.brandMatch}>Match </Text>
          <Text style={styles.brandPlay}>Play</Text>
        </Text>
        <Text style={styles.tagline}>Post a match. Settle the score.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
        />
        <View style={styles.passwordWrap}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.surface} size="small" />
            : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>

        <Link href="/(auth)/forgot-password" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>Forgot password?</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/(auth)/sign-up" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>No account? Sign up</Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  // flexGrow (not flex) so content centers when short but the scroll view
  // absorbs the keyboard instead of re-centering every frame (the jitter fix).
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
  brand: { marginBottom: spacing.xs },
  brandMatch: { fontSize: 36, fontWeight: '600', fontStyle: 'italic', color: colors.fairway },
  brandPlay: { fontSize: 36, fontWeight: '700', color: colors.ink },
  tagline: { ...typography.body, fontSize: 16, color: colors.muted, marginBottom: spacing.lg },
  stepTitle: { ...typography.heading, fontSize: 22, color: colors.ink, alignSelf: 'flex-start', marginTop: spacing.sm },
  stepSubtitle: { ...typography.body, fontSize: 14, color: colors.muted, alignSelf: 'flex-start', marginBottom: spacing.sm },
  switchLabel: {
    ...typography.body,
    fontSize: 12,
    color: colors.muted,
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    marginBottom: -spacing.xs,
  },
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
