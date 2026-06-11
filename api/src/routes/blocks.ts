import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { newId, now } from '../lib/id';
import { parseBody, requireString, requireEnum, optionalString } from '../lib/validate';

// Blocking + reporting (App Store Guideline 1.2 — required for an app with
// open matchmaking + chat).
//   GET    /blocks            ids the caller has blocked
//   POST   /blocks/:userId    block (idempotent)
//   DELETE /blocks/:userId    unblock
//   POST   /reports           { reported_id, match_id?, reason, detail? }
//
// A block hides both players from each other in discovery, kills direct
// challenges + accepts in both directions (enforced in routes/matches.ts).
// Reports just persist for review — no automated action.

export async function handleBlocks(
  request: Request,
  auth: AuthContext,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const targetId = segments[1];

  if (!targetId && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT blocked_id FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC'
    ).bind(auth.userId).all<{ blocked_id: string }>();
    return json({ blocked: (results ?? []).map((r) => r.blocked_id) });
  }

  if (targetId && method === 'POST') {
    if (targetId === auth.userId) return error('You cannot block yourself', 400);
    const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first();
    if (!target) return error('Unknown user', 404);
    await env.DB.prepare(
      'INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
    ).bind(auth.userId, targetId, now()).run();
    return json({ blocked: true });
  }

  if (targetId && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?')
      .bind(auth.userId, targetId).run();
    return json({ blocked: false });
  }

  return error('Not found', 404);
}

const REPORT_REASONS = ['spam', 'abuse', 'cheating', 'other'] as const;

export async function handleReports(
  request: Request,
  auth: AuthContext,
  env: Env
): Promise<Response> {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  const body = await parseBody(request);
  const reported_id = requireString(body.reported_id, 'reported_id', 64);
  if (reported_id === auth.userId) return error('You cannot report yourself', 400);
  const reason = requireEnum(body.reason, REPORT_REASONS, 'reason');
  const match_id = optionalString(body.match_id, 'match_id', 64);
  const detail = optionalString(body.detail, 'detail', 1000);

  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(reported_id).first();
  if (!target) return error('Unknown user', 404);

  await env.DB.prepare(
    'INSERT INTO reports (id, reporter_id, reported_id, match_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(newId(), auth.userId, reported_id, match_id, reason, detail, now()).run();
  return json({ reported: true }, 201);
}
