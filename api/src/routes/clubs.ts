import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { newId, now } from '../lib/id';
import { monthKey, isValidMonth } from '../lib/date';
import { computeChampions, readCrowned } from '../lib/champions';
import { buildDashboard } from '../lib/dashboard';
import { buildMemberDetail } from '../lib/memberDetail';
import { buildIntros } from '../lib/intros';
import { sendPush } from '../lib/push';

// Clubs — the network layer (strategy doc A2/A3/A4).
//   GET   /clubs/:id             summary + demand count (claim screen)
//   POST  /clubs/:id/interest    record the caller's "I want my club in" signal
//   GET   /clubs/:id/champions   monthly champions (live current / crowned past)
//   GET   /clubs/:id/dashboard   STAFF-ONLY pulse dashboard (engagement + churn)
//   GET   /clubs/:id/member/:uid STAFF-ONLY member engagement detail (no win/loss)
//   GET   /clubs/:id/intros      STAFF-ONLY suggested member intros (matchmaker)
//   POST  /clubs/:id/crest       STAFF-ONLY crest upload (raw image bytes -> R2)
//   PATCH /clubs/:id             STAFF-ONLY club settings (color, pinned note)
export async function handleClubs(
  request: Request,
  auth: AuthContext,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const clubId = segments[1];
  const action = segments[2];
  if (!clubId) return error('Not found', 404);

  // Explicit columns ONLY — this projection is the sole guard keeping
  // contact_email/contact_name (the GM's details) off the member-facing wire.
  // Never widen to SELECT *.
  const club = await env.DB.prepare(
    'SELECT id, name, status, crest_url, primary_color, pinned_message, link_url FROM clubs WHERE id = ?'
  ).bind(clubId).first<Record<string, any>>();
  if (!club) return error('Club not found', 404);

  // ── Summary + demand count ──
  if (!action && method === 'GET') {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM club_interest WHERE club_id = ?')
      .bind(clubId).first<{ n: number }>();
    return json({ ...club, interest_count: n?.n ?? 0 });
  }

  // ── Demand signal ──
  if (action === 'interest' && method === 'POST') {
    if (club.status === 'network') {
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM club_interest WHERE club_id = ?')
        .bind(clubId).first<{ n: number }>();
      return json({ recorded: false, count: n?.n ?? 0 });
    }
    const res = await env.DB.prepare(
      'INSERT OR IGNORE INTO club_interest (id, club_id, user_id, created_at) VALUES (?, ?, ?, ?)'
    ).bind(newId(), clubId, auth.userId, now()).run();
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM club_interest WHERE club_id = ?')
      .bind(clubId).first<{ n: number }>();
    return json({ recorded: (res.meta.changes ?? 0) > 0, count: n?.n ?? 0 });
  }

  // The club's course (1:1 today) backs every derived metric below.
  const course = await env.DB.prepare('SELECT name FROM courses WHERE club_id = ? LIMIT 1')
    .bind(clubId).first<{ name: string }>();

  // ── Champions (any member can view their club's) ──
  if (action === 'champions' && method === 'GET') {
    if (!course) return json({ club_id: clubId, month: monthKey(), crowned: false, won: [], played: [], win_pct: [] });
    const reqMonth = new URL(request.url).searchParams.get('month');
    const month = reqMonth && isValidMonth(reqMonth) ? reqMonth : monthKey();
    // Past month → frozen crowns when present; otherwise fall back to a live
    // recompute (covers months before the cron started crowning).
    if (month < monthKey()) {
      const crowned = await readCrowned(env, clubId, month);
      if (crowned) return json(crowned);
    }
    return json(await computeChampions(env, clubId, course.name, month));
  }

  // ── Staff-only surfaces ──
  if (action === 'dashboard' || action === 'member' || action === 'intros' || action === 'nudge' || action === 'crest' || (!action && method === 'PATCH')) {
    const staff = await env.DB.prepare('SELECT 1 FROM club_staff WHERE club_id = ? AND user_id = ?')
      .bind(clubId, auth.userId).first();
    if (!staff) return error('Not authorized for this club', 403);

    if (action === 'dashboard' && method === 'GET') {
      if (!course) return error('Club has no course linked', 409);
      return json(await buildDashboard(env, clubId, course.name));
    }

    if (action === 'member' && method === 'GET') {
      if (!course) return error('Club has no course linked', 409);
      const memberId = segments[3];
      if (!memberId) return error('Member id required', 400);
      const detail = await buildMemberDetail(env, course.name, memberId);
      if (!detail) return error('Member not found', 404);
      return json(detail);
    }

    if (action === 'intros' && method === 'GET') {
      if (!course) return error('Club has no course linked', 409);
      return json(await buildIntros(env, course.name));
    }

    // Staff → nudge a lapsing member with a push to come back.
    if (action === 'nudge' && method === 'POST') {
      const memberId = segments[3];
      if (!memberId) return error('Member id required', 400);
      const member = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(memberId).first();
      if (!member) return error('Member not found', 404);
      await sendPush(env, memberId, `${club.name} misses you`, `Line up your next game at ${club.name} on Foretera.`, {});
      return json({ ok: true });
    }

    if (action === 'crest' && method === 'POST') {
      const ALLOWED: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      const rawCt = (request.headers.get('Content-Type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
      const ext = ALLOWED[rawCt];
      if (!ext) return error('Expected image/jpeg, image/png, or image/webp', 400);
      const body = await request.arrayBuffer();
      if (!body || body.byteLength === 0) return error('Empty image', 400);
      if (body.byteLength > 5 * 1024 * 1024) return error('Image too large (max 5MB)', 413);
      const key = `club/${clubId}/${newId()}.${ext}`;
      await env.PHOTOS.put(key, body, { httpMetadata: { contentType: rawCt } });
      const crestUrl = `${new URL(request.url).origin}/photos/${key}`;
      await env.DB.prepare('UPDATE clubs SET crest_url = ?, updated_at = ? WHERE id = ?')
        .bind(crestUrl, now(), clubId).run();
      return json({ crest_url: crestUrl });
    }

    if (!action && method === 'PATCH') {
      const bodyText = await request.text();
      const patch = bodyText ? JSON.parse(bodyText) : {};
      const fields: string[] = [];
      const vals: unknown[] = [];
      if ('primary_color' in patch) {
        const c = patch.primary_color;
        if (c !== null && !(typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))) {
          return error('primary_color must be #RRGGBB or null', 400);
        }
        fields.push('primary_color = ?'); vals.push(c ?? null);
      }
      if ('pinned_message' in patch) {
        const msg = patch.pinned_message;
        if (msg !== null && (typeof msg !== 'string' || msg.length > 240)) {
          return error('pinned_message must be a string (<=240) or null', 400);
        }
        fields.push('pinned_message = ?'); vals.push(msg ?? null);
        fields.push('pinned_at = ?'); vals.push(msg ? now() : null);
      }
      if ('link_url' in patch) {
        const u = patch.link_url;
        if (u !== null && (typeof u !== 'string' || u.length > 300)) {
          return error('link_url must be a string (<=300) or null', 400);
        }
        let val = u ? String(u).trim() : null;
        if (val && !/^https?:\/\//i.test(val)) val = `https://${val}`; // tolerate "club.com"
        fields.push('link_url = ?'); vals.push(val);
      }
      if (fields.length === 0) return error('No fields to update', 400);
      fields.push('updated_at = ?'); vals.push(now());
      vals.push(clubId);
      await env.DB.prepare(`UPDATE clubs SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
      // Return the SAME shape as GET /clubs/:id (incl. interest_count) so the
      // ClubDetail contract holds and a client can setClub() the response.
      const updated = await env.DB.prepare(
        'SELECT id, name, status, crest_url, primary_color, pinned_message, link_url FROM clubs WHERE id = ?'
      ).bind(clubId).first<Record<string, unknown>>();
      const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM club_interest WHERE club_id = ?')
        .bind(clubId).first<{ n: number }>();
      return json({ ...updated, interest_count: cnt?.n ?? 0 });
    }
  }

  return error('Not found', 404);
}
