import { useState, useEffect } from 'react';
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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSignUp } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { colors, typography, spacing, radius, fonts } from '@/constants/theme';

// Pull the most descriptive text out of whatever Clerk (or JS) threw, so a
// swallowed sign-up failure is never invisible.
function describeError(e: any, fallback: string): string {
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.message ??
    fallback
  );
}

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNote, setResendNote] = useState('');

  // Tick down the resend cooldown.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleResend() {
    if (!isLoaded || resendCooldown > 0) return;
    setError('');
    setResendNote('');
    try {
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setResendNote('New code sent — check your email.');
      setResendCooldown(30);
    } catch (e: any) {
      setError(describeError(e, "Couldn't resend the code. Try again in a moment."));
    }
  }

  async function handleSignUp() {
    if (loading) return;
    if (!isLoaded) {
      setError('Still connecting to the server — give it a second and tap again.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signUp!.create({ emailAddress: email.trim(), password });
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (e: any) {
      setError(describeError(e, 'Sign up failed.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!isLoaded || loading) return;
    setError('');
    setLoading(true);
    try {
      const result = await signUp!.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
      } else {
        setError(`Verification needs another step (${result.status}).`);
      }
    } catch (e: any) {
      setError(describeError(e, 'Verification failed.'));
    } finally {
      setLoading(false);
    }
  }

  if (pendingVerification) {
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
          <Text style={styles.brand}>Foretera</Text>
          <Text style={styles.stepTitle}>Check your email</Text>
          <Text style={styles.stepSubtitle}>We sent a code to {email.trim()}</Text>

          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            placeholderTextColor={colors.muted}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleVerify}
            autoFocus
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.surface} size="small" />
              : <Text style={styles.buttonText}>Verify</Text>}
          </TouchableOpacity>

          {resendNote ? <Text style={styles.resendNote}>{resendNote}</Text> : null}
          <TouchableOpacity style={styles.linkButton} onPress={handleResend} disabled={resendCooldown > 0}>
            <Text style={[styles.linkText, resendCooldown > 0 && styles.linkTextMuted]}>
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Didn't get it? Resend code"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => setPendingVerification(false)}>
            <Text style={styles.linkText}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
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
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.brand}>Foretera</Text>
        <Text style={styles.tagline}>Create your account.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          keyboardType="email-address"
          textContentType="emailAddress"
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
            autoComplete="new-password"
            textContentType="newPassword"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
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
          onPress={handleSignUp}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.surface} size="small" />
            : <Text style={styles.buttonText}>Create Account</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => router.back()}>
          <Text style={styles.linkText}>Already have an account? Sign in</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Foretera is a scorecard and match-discovery tool, not a wagering service. Play by your
          club's rules and post honest scores.
        </Text>
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
  logo: { width: 88, height: 88, borderRadius: 20, marginBottom: spacing.md },
  brand: { fontFamily: fonts.displayXBold, fontSize: 40, letterSpacing: -1, color: colors.text, marginBottom: spacing.xs },
  tagline: { ...typography.body, fontSize: 16, color: colors.muted, marginBottom: spacing.lg },
  stepTitle: { ...typography.heading, fontSize: 24, color: colors.ink, alignSelf: 'flex-start', marginTop: spacing.sm },
  stepSubtitle: { ...typography.body, fontSize: 14, color: colors.muted, alignSelf: 'flex-start', marginBottom: spacing.sm },
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
  linkTextMuted: { color: colors.muted, opacity: 0.6 },
  resendNote: { ...typography.body, fontSize: 13, color: colors.fairway, alignSelf: 'flex-start' },
  disclaimer: {
    ...typography.body,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
});
