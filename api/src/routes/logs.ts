import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { newId, now } from '../lib/id';

// POST /logs { logs: [{ level, message, stack?, context?, platform?, app_version? }] }
// The app batches client errors here so they're queryable from D1. Bounded:
// max 50 rows per request, fields truncated, so a runaway client can't flood it.
export async function handleLogs(auth: AuthContext, env: Env, request: Request): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return error('Bad JSON', 400); }
  const logs = Array.isArray(body?.logs) ? body.logs.slice(0, 50) : [];
  if (logs.length === 0) return json({ stored: 0 });

  const ts = now();
  const trim = (v: unknown, n: number): string | null =>
    typeof v === 'string' && v.trim() ? v.slice(0, n) : null;

  const stmts = logs.map((l: any) =>
    env.DB.prepare(
      `INSERT INTO client_logs (id, user_id, level, message, stack, context, platform, app_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      newId(), auth.userId,
      trim(l?.level, 16) ?? 'error',
      trim(l?.message, 2000) ?? '(empty)',
      trim(l?.stack, 4000),
      trim(l?.context, 200),
      trim(l?.platform, 32),
      trim(l?.app_version, 32),
      trim(l?.at, 40) ?? ts,
    )
  );
  await env.DB.batch(stmts);
  return json({ stored: stmts.length });
}
