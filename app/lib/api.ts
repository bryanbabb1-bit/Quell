export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8787';

const DEFAULT_TIMEOUT_MS = 15_000;

// Clerk token refresher, registered once at app start (see app/_layout.tsx).
// Clerk JWTs are short-lived; if one expires between minting and the request
// landing, the Worker returns 401. apiFetch uses this to transparently mint a
// fresh token and retry once. (Reused from TrueForecast.)
type TokenRefresher = () => Promise<string | null>;
let tokenRefresher: TokenRefresher | null = null;
export function setTokenRefresher(fn: TokenRefresher | null): void {
  tokenRefresher = fn;
}

export async function apiFetch(
  path: string,
  token: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options;

  const attempt = async (bearer: string): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    try {
      return await fetch(`${API_BASE}${path}`, {
        ...rest,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
          ...(rest.headers ?? {}),
        },
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error('Request timed out. Check your connection and try again.');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await attempt(token);

  // A 401 almost always means the Clerk JWT expired in transit. Mint a fresh
  // one and retry once — transparent to the caller.
  if (res.status === 401 && tokenRefresher) {
    const fresh = await tokenRefresher().catch(() => null);
    if (fresh && fresh !== token) {
      res = await attempt(fresh);
    }
  }

  return res;
}

// Convenience JSON wrapper — throws on non-2xx with the server's error message.
export async function apiJson<T>(
  path: string,
  token: string,
  options?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const res = await apiFetch(path, token, options);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data as T;
}
