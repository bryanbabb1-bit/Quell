import { Stack } from 'expo-router';
import { colors, fonts } from '@/constants/theme';

// Authenticated stack: the tab bar is the root, with detail screens pushed
// over it (create match, match detail, message thread).
export default function AppLayout() {
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
      <Stack.Screen name="create" options={{ title: 'Post a Match', presentation: 'modal' }} />
      <Stack.Screen name="match/[id]" options={{ title: 'Match' }} />
      <Stack.Screen name="match/[id]/messages" options={{ title: 'Messages' }} />
      <Stack.Screen name="match/[id]/score" options={{ title: 'Enter Scores' }} />
      <Stack.Screen name="match/[id]/reveal" options={{ title: 'The Reveal' }} />
      <Stack.Screen name="match/[id]/scorecard" options={{ headerShown: false }} />
    </Stack>
  );
}
