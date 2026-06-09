import type { Env } from '../types';

// Send an Expo push notification to a user by id. Best-effort: looks up the
// stored token, posts to Expo's push service, and never throws into the request
// path (a notification failing must not fail the scorecard submit).
//   Docs: https://docs.expo.dev/push-notifications/sending-notifications/
export async function sendPush(
  env: Env,
  userId: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!userId) return;
  try {
    const row = await env.DB.prepare('SELECT expo_push_token FROM users WHERE id = ?')
      .bind(userId).first<{ expo_push_token: string | null }>();
    const token = row?.expo_push_token;
    if (!token) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body, sound: 'default', data: data ?? {} }),
    });
  } catch { /* best effort — swallow */ }
}
