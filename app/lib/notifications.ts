import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// All calls are guarded so this no-ops cleanly on a build WITHOUT the
// expo-notifications native module (e.g. the dev client before the
// notifications-enabled rebuild) instead of crashing.

export function configureNotifications() {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch { /* native module absent — ignore */ }
}

// Ask permission and return the Expo push token, or null on denial/unsupported.
export async function registerForPush(): Promise<string | null> {
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;
    const projectId =
      (Constants?.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data ?? null;
  } catch {
    return null;
  }
}
