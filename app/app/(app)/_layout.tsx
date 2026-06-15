import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { useUserStore } from '@/store/useUserStore';
import { colors, fonts } from '@/constants/theme';

// Authenticated stack: the tab bar is the root, with detail screens pushed
// over it (create match, match detail, message thread).
export default function AppLayout() {
  // First-run: send a signed-in user with no name to onboarding.
  const user = useUserStore((s) => s.user);
  const segments = useSegments();
  useEffect(() => {
    if (user && !user.first_name && !segments.includes('onboarding')) {
      router.replace('/(app)/onboarding');
    }
  }, [user, segments]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text, fontFamily: fonts.display, fontSize: 18 },
        headerShadowVisible: false,
        // Just a chevron — no "(tabs)"/previous-screen text next to the back arrow.
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: '',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="create" options={{ title: 'Post a Match', presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="club-claim" options={{ title: 'Foretera for Clubs' }} />
      <Stack.Screen name="club/[id]" options={{ title: 'Champions' }} />
      <Stack.Screen name="club/[id]/manage" options={{ title: 'Club Control' }} />
      <Stack.Screen name="match/[id]" options={{ title: 'Match' }} />
      <Stack.Screen name="player/[id]" options={{ title: 'Player' }} />
      <Stack.Screen name="match/[id]/messages" options={{ title: 'Messages' }} />
      <Stack.Screen name="match/[id]/score" options={{ title: 'Enter Scores' }} />
      <Stack.Screen name="match/[id]/live" options={{ title: 'Live' }} />
      <Stack.Screen name="match/[id]/reveal" options={{ headerShown: false }} />
      <Stack.Screen name="match/[id]/scorecard" options={{ headerShown: false }} />
    </Stack>
  );
}
