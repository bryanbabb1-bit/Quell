import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json } from '../lib/response';

// GIF search, proxied through the Worker so the Giphy key stays server-side (the
// client never sees it, and we control rate/rating). The message itself only
// stores the chosen GIF's URL — Giphy's CDN serves the actual file, so there's no
// storage/bandwidth cost on our side.
//   GET /gifs            trending
//   GET /gifs?q=<query>  search
export async function handleGifs(_auth: AuthContext, env: Env, request: Request): Promise<Response> {
  const key = env.GIPHY_API_KEY;
  if (!key) return json({ gifs: [], unconfigured: true });

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  const common = `api_key=${key}&limit=24&rating=pg-13&bundle=messaging_non_clips`;
  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?${common}&q=${encodeURIComponent(q)}`
    : `https://api.giphy.com/v1/gifs/trending?${common}`;

  try {
    const res = await fetch(endpoint);
    if (!res.ok) return json({ gifs: [] });
    const data = (await res.json()) as any;
    const gifs = (data.data ?? [])
      .map((g: any) => ({
        id: g.id,
        preview: g.images?.fixed_width_small?.url ?? g.images?.fixed_width?.url,
        full: g.images?.fixed_width?.url ?? g.images?.downsized_medium?.url,
      }))
      .filter((g: any) => g.preview && g.full);
    return json({ gifs });
  } catch {
    return json({ gifs: [] });
  }
}
