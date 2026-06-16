import { requireAuth, AuthError } from './lib/auth';
import { json, error } from './lib/response';
import { now } from './lib/id';
import { ValidationError } from './lib/validate';
import type { Env } from './types';
import { handleGetMe, handleUpdateMe, handleGetMyRecord, handleDeleteMe } from './routes/users';
import { handleBlocks, handleReports } from './routes/blocks';
import { handleLeaderboard } from './routes/leaderboard';
import { handleMatches } from './routes/matches';
import { handleScorecards } from './routes/scorecards';
import { handleMessages } from './routes/messages';
import { handleLive } from './routes/live';
import { handleLogs } from './routes/logs';
import { handleCourses } from './routes/courses';
import { handleClubs } from './routes/clubs';
import { handleFavorites } from './routes/favorites';
import { handlePlayer } from './routes/players';
import { runReminders } from './routes/reminders';
import { crownPriorMonth } from './lib/champions';
import { handleUploadPhoto, servePhoto } from './routes/photos';
import { privacyPage } from './routes/legal';
import { handleGifs } from './routes/gifs';

// CORS only matters for browsers (Expo Web, dev tooling). Native iOS/Android
// don't send Origin and aren't subject to CORS. Reflect the Origin only when
// it matches a known pattern. (Reused from TrueForecast.)
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/[^/]+\.expo\.dev$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

function corsHeadersFor(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    Vary: 'Origin',
  };
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function withCors(response: Response, request: Request): Response {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(corsHeadersFor(request))) r.headers.set(k, v);
  return r;
}

// Routes a request and reports the resolved userId (null for public/auth-failed
// requests) so the fetch wrapper can log it.
async function handleRequest(
  request: Request,
  env: Env
): Promise<{ response: Response; userId: string | null }> {
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const root = segments[0];
  const method = request.method;

  // ── Public ──
  if (root === 'health' && method === 'GET') {
    return { response: json({ ok: true, timestamp: now() }), userId: null };
  }
  if (root === 'photos' && method === 'GET') {
    return { response: await servePhoto(env, segments), userId: null };
  }
  if (root === 'privacy' && method === 'GET') {
    return { response: privacyPage(), userId: null };
  }

  // ── Authenticated ──
  const auth = await requireAuth(request, env);

  // Per-user rate limit (fail open on binding hiccups, but log it).
  if (env.RATE_LIMITER) {
    const verdict = await env.RATE_LIMITER.limit({ key: auth.userId }).catch((e) => {
      console.error('Rate limiter binding error (failing open):', e);
      return { success: true };
    });
    if (!verdict.success) {
      return { response: error('Too many requests. Try again in a moment.', 429), userId: auth.userId };
    }
  }

  let response: Response;

  if (root === 'me') {
    if (url.pathname === '/me' && method === 'GET') {
      response = await handleGetMe(auth, env);
    } else if (url.pathname === '/me' && method === 'PATCH') {
      response = await handleUpdateMe(auth, request, env);
    } else if (url.pathname === '/me' && method === 'DELETE') {
      response = await handleDeleteMe(auth, env);
    } else if (url.pathname === '/me/record' && method === 'GET') {
      response = await handleGetMyRecord(auth, env);
    } else {
      response = error('Not found', 404);
    }
  } else if (root === 'leaderboard' && method === 'GET') {
    response = await handleLeaderboard(auth, env, request);
  } else if (root === 'matches') {
    // The matches handler also owns the nested /matches/:id/scorecard,
    // /reveal, and /messages sub-resources once implemented; for now route
    // the scorecard/message sub-paths to their dedicated handlers so the
    // contracts are visible from the router.
    const sub = segments[2];
    if (sub === 'scorecard' || sub === 'reveal' || sub === 'holes') {
      response = await handleScorecards(request, auth, env, segments);
    } else if (sub === 'messages') {
      response = await handleMessages(request, auth, env, segments);
    } else if (sub === 'follow' || sub === 'live' || sub === 'live-score' || sub === 'confirm' || sub === 'cheer') {
      response = await handleLive(request, auth, env, segments);
    } else {
      response = await handleMatches(request, auth, env, segments);
    }
  } else if (root === 'courses') {
    response = await handleCourses(request, auth, env, segments);
  } else if (root === 'clubs') {
    response = await handleClubs(request, auth, env, segments);
  } else if (root === 'favorites') {
    response = await handleFavorites(request, auth, env, segments);
  } else if (root === 'players' && method === 'GET') {
    response = await handlePlayer(auth, env, segments);
  } else if (root === 'blocks') {
    response = await handleBlocks(request, auth, env, segments);
  } else if (root === 'reports') {
    response = await handleReports(request, auth, env);
  } else if (root === 'photo' && method === 'POST') {
    response = await handleUploadPhoto(auth, env, request);
  } else if (root === 'gifs' && method === 'GET') {
    response = await handleGifs(auth, env, request);
  } else if (root === 'logs' && method === 'POST') {
    response = await handleLogs(auth, env, request);
  } else {
    response = error('Not found', 404);
  }

  return { response, userId: auth.userId };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now();
    const requestId = crypto.randomUUID().slice(0, 8);
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeadersFor(request) });
    }

    let response: Response;
    let userId: string | null = null;
    try {
      const result = await handleRequest(request, env);
      response = result.response;
      userId = result.userId;
    } catch (e) {
      if (e instanceof AuthError) {
        response = error(e.message, e.status);
      } else if (e instanceof ValidationError) {
        response = error(e.message, 400);
      } else {
        response = error('Internal server error', 500);
        console.log(JSON.stringify({
          t: now(), level: 'error', requestId, method, path: url.pathname,
          msg: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        }));
      }
    }

    const final = withCors(response, request);
    final.headers.set('X-Request-Id', requestId);

    // One structured log line per request — queryable in Cloudflare's logs.
    console.log(JSON.stringify({
      t: now(),
      level: response.status >= 500 ? 'error' : 'info',
      requestId, method, path: url.pathname, status: response.status,
      ms: Date.now() - started, userId,
    }));

    return final;
  },

  // Cron (wrangler.toml). The monthly schedule freezes club champions; every
  // other tick is the hourly reminder/forfeit sweep.
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === '0 7 1 * *') {
      ctx.waitUntil(crownPriorMonth(env));
    } else {
      ctx.waitUntil(runReminders(env));
    }
  },
} satisfies ExportedHandler<Env>;
