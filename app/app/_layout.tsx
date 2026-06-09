import { useEffect, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { tokenCache } from '@/lib/tokenCache';
import { setTokenRefresher } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import { useThemeStore } from '@/store/useThemeStore';
import { colors } from '@/constants/theme';

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
  useEffect(() => { hydrateTheme(); }, [hydrateTheme]);

  // App is portrait everywhere; only the landscape scorecard unlocks (and
  // restores) rotation. app.json orientation is "default" so the dev build can
  // rotate at all — this lock keeps every other screen upright.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
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
});
