// Thin wrapper over expo-haptics with a safe no-op fallback (web, simulators,
// or any platform where haptics are unavailable). Never throws — feedback is a
// nicety, not a dependency. Import the named helpers; don't call expo-haptics
// directly from screens so the fallback stays in one place.
import * as Haptics from 'expo-haptics';

function safe(fn: () => Promise<unknown>) {
  try { fn().catch(() => {}); } catch { /* unsupported platform — ignore */ }
}

export const haptics = {
  /** Light tap — selection changes, per-hole reveal tick, palette swap. */
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium tap — confirming an action (accept, submit), a hole win. */
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Heavy tap — decisive moments (match closeout). */
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Discrete selection feedback — stepper ticks, segmented toggles. */
  select: () => safe(() => Haptics.selectionAsync()),
  /** Win / completed-successfully. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Caution — overwrite, stale index. */
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Loss / error / decline. */
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
