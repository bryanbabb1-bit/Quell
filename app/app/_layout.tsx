import { useEffect, useRef } from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { tokenCache } from '@/lib/tokenCache';
import { setTokenRefresher, apiJson } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import { useThemeStore, useColors } from '@/store/useThemeStore';
import { configureNotifications, registerForPush } from '@/lib/notifications';
import { colors } from '@/constants/theme';

// Hold the native splash until fonts + theme are ready so the first frame is
// already the dark Tournament look (no light flash, no fallback-font reflow).
SplashScreen.preventAutoHideAsync().catch(() => {});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

// Routes the user between the (auth) and (app) groups based on Clerk state, and
// loads /me once signed in. Lessons carried from TrueForecast:
//  - Never gate the tree behind <ClerkLoaded> — a wedged Clerk init would leave
//    a permanent black screen. We render eagerly and guard on `isLoaded`.
//  - getToken is recreated every render, so we never put it in an effect dep
//    array (that caused a request-loop incident); the refresher reads a ref.
function AuthGate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const segments = useSegments();
  const loadUser = useUserStore((s) => s.load);
  const resetUser = useUserStore((s) => s.reset);

  // Stable token refresher for apiFetch's transparent 401 retry.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const pushRegistered = useRef(false);
  useEffect(() => {
    setTokenRefresher(() => getTokenRef.current({ skipCache: true }));
    return () => setTokenRefresher(null);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';

    if (!isSignedIn) {
      resetUser();
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }

    // Signed in: load profile and make sure we're inside the app group. On a
    // cold boot we land on the index route ('/'), which is neither group — so
    // redirect whenever we're not already in (app), not just from (auth).
    getToken()
      .then((t) => {
        if (!t) {
          router.replace('/(auth)/sign-in');
          return;
        }
        loadUser(t);
        // Sync timezone (for 7pm-local score reminders) + register for push,
        // once per session.
        if (!pushRegistered.current) {
          pushRegistered.current = true;
          try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz) apiJson('/me', t, { method: 'PATCH', body: JSON.stringify({ timezone: tz }) }).catch(() => {});
          } catch { /* ignore */ }
          registerForPush()
            .then((tok) => {
              if (tok) apiJson('/me', t, { method: 'PATCH', body: JSON.stringify({ expo_push_token: tok }) }).catch(() => {});
            })
            .catch(() => {});
        }
        if (!inAppGroup) router.replace('/(app)/(tabs)');
      })
      .catch(() => router.replace('/(auth)/sign-in'));
    // Intentionally NOT depending on getToken (see note above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, segments]);

  return null;
}

export default function RootLayout() {
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydrated = useThemeStore((s) => s.hydrated);
  const active = useColors();
  useEffect(() => { hydrateTheme(); }, [hydrateTheme]);

  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // App is portrait everywhere; only the landscape scorecard unlocks (and
  // restores) rotation. app.json orientation is "default" so the dev build can
  // rotate at all — this lock keeps every other screen upright.
  useEffect(() => {
    // Lazy-require: expo-screen-orientation is a NATIVE module. A top-level import
    // here would crash the WHOLE app at parse time on any dev client that predates
    // the module. Require it guarded so boot is never at its mercy.
    try {
      const SO = require('expo-screen-orientation');
      SO.lockAsync(SO.OrientationLock.PORTRAIT_UP).catch(() => {});
    } catch { /* native module not in this build — skip the lock */ }
    configureNotifications();
  }, []);

  // Reveal the UI once fonts (loaded or failed — never block on a font error)
  // and the persisted palette are ready.
  const ready = (fontsLoaded || !!fontError) && hydrated;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null; // splash still showing

  // If the Clerk publishable key didn't make it into the bundle, Clerk throws a
  // cryptic "useAuth outside ClerkProvider". Surface the real cause + the fix
  // instead of a red crash.
  if (!publishableKey) {
    return (
      <View style={styles.keyless}>
        <Text style={styles.keylessTitle}>Missing Clerk key in this bundle</Text>
        <Text style={styles.keylessText}>
          Metro didn&apos;t inline EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Stop Metro and restart it
          from the app folder with a clean cache, then reload:
        </Text>
        <Text style={styles.keylessCode}>cd C:\Projects\Quell\app{'\n'}npx expo start --dev-client -c</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: active.bg }}>
      <SafeAreaProvider>
        <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
          <StatusBar style={active.scheme === 'light' ? 'dark' : 'light'} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: active.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
          <AuthGate />
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Shared boot spinner used by the index route while auth resolves.
export function BootSpinner() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.fairway} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  keyless: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12, backgroundColor: colors.bg },
  keylessTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  keylessText: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  keylessCode: { color: colors.accent, fontSize: 13, fontFamily: 'Courier', textAlign: 'center', marginTop: 8 },
});
