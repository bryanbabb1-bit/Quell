// Push-notification helpers. CRITICAL: this module must never throw at import
// time — it's pulled in by the ROOT layout, and a throw there makes Expo Router
// drop the root layout (and its <ClerkProvider>), which surfaces as the cryptic
// "useAuth outside ClerkProvider". So we lazy-`require` the native modules INSIDE
// guarded functions instead of importing them at the top.

export function configureNotifications() {
  try {
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch { /* native module absent/incompatible — ignore */ }
}

// Ask permission and return the Expo push token, or null on denial/unsupported.
export async function registerForPush(): Promise<string | null> {
  try {
    const Notifications = require('expo-notifications');
    const Constants = require('expo-constants').default ?? require('expo-constants');

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token?.data ?? null;
  } catch {
    return null;
  }
}
