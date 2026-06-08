import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

// Authenticated stack: the tab bar is the root, with detail screens pushed
// over it (create match, match detail, message thread).
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.fairway,
        headerTitleStyle: { color: colors.ink },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="create" options={{ title: 'Post a Match', presentation: 'modal' }} />
      <Stack.Screen name="match/[id]" options={{ title: 'Match' }} />
      <Stack.Screen name="match/[id]/messages" options={{ title: 'Messages' }} />
    </Stack>
  );
}
