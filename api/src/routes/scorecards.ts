import type { AuthContext } from '../lib/auth';
import type { Env } from '../types';
import { json, error } from '../lib/response';
import { newId, now } from '../lib/id';
import { parseBody, ValidationError } from '../lib/validate';
import {
  courseHandicap, computeMatch, strokeDifferenceForHoles, allocateStrokes,
  type HoleSpec,
} from '../lib/scoring';

// Holes a match type is played over.
function holeRange(matchType: string): { min: number; max: number; count: number } {
  if (matchType === 'front_nine') return { min: 1, max: 9, count: 9 };
  if (matchType === 'back_nine') return { min: 10, max: 18, count: 9 };
  return { min: 1, max: 18, count: 18 }; // eighteen
}

// POST /matches/:id/scorecard  — submit (or re-submit) your hole-by-hole scores.
// GET  /matches/:id/reveal     — both cards + computed result, once both are in.
//
// HIDDEN-ENTRY LOCK: no endpoint ever returns the opponent's scores until BOTH
// players have submitted. getOne (matches.ts) returns only scorecard *ids*, not
// contents; match_progression stays null until completion; and reveal refuses
// until both cards exist. So neither side can back-solve what they need.
export async function handleScorecards(
  request: Request,
  auth: AuthContext,
  env: Env,
  segments: string[]
): Promise<Response> {
  const matchId = segments[1];
  const sub = segments[2];
  if (!matchId) return error('Match id required', 400);

  if (sub === 'scorecard' && request.method === 'POST') return submit(auth, env, matchId, request);
  if (sub === 'reveal' && request.method === 'GET') return reveal(auth, env, matchId);
  if (sub === 'holes' && request.method === 'GET') return holesSetup(auth, env, matchId);
  return error('Not found', 404);
}

async function submit(auth: AuthContext, env: Env, matchId: string, request: Request): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);

  const isCreator = match.creator_id === auth.userId;
  const isOpponent = match.opponent_id === auth.userId;
  if (!isCreator && !isOpponent) return error('Not your match', 403);
  if (match.status === 'completed') return error('Match is already settled', 409);
  if (match.status !== 'accepted' && match.status !== 'in_progress') {
    return error(`Cannot submit scores for a ${match.status} match`, 409);
  }

  const range = holeRange(match.match_type);
  const scores = await parseScores(request, range);

  const total = scores.reduce((s, e) => s + e.gross, 0);
  const id = newId();
  const ts = now();

  // Upsert this player's card (unique on match_id + player_id).
  await env.DB.prepare(
    `INSERT INTO scorecards (id, match_id, player_id, hole_scores, total_gross, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(match_id, player_id) DO UPDATE SET
       hole_scores = excluded.hole_scores,
       total_gross = excluded.total_gross,
       submitted_at = excluded.submitted_at`
  ).bind(id, matchId, auth.userId, JSON.stringify(scores), total, ts).run();

  // Point the match at this player's card + flip to in_progress on first entry.
  const col = isCreator ? 'creator_scorecard_id' : 'opponent_scorecard_id';
  const cardId = await currentCardId(env, matchId, auth.userId);
  await env.DB.prepare(
    `UPDATE matches SET ${col} = ?, status = 'in_progress', updated_at = ? WHERE id = ?`
  ).bind(cardId, ts, matchId).run();

  // If BOTH cards are now in, settle the match.
  const fresh = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Record<string, any>>();
  if (fresh?.creator_scorecard_id && fresh?.opponent_scorecard_id) {
    await settle(env, fresh);
    const settled = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
    return json({ status: 'completed', match: settled });
  }

  return json({ status: 'waiting_on_opponent' });
}

// Validate the submitted scores against the holes the match is played over.
async function parseScores(request: Request, range: { min: number; max: number; count: number }) {
  const body = await parseBody(request);
  const raw = body.hole_scores;
  if (!Array.isArray(raw) || raw.length !== range.count) {
    throw new ValidationError(`Expected ${range.count} hole scores`);
  }
  const seen = new Set<number>();
  const scores = raw.map((e: any) => {
    const hole = Number(e?.hole);
    const gross = Number(e?.gross);
    if (!Number.isInteger(hole) || hole < range.min || hole > range.max) {
      throw new ValidationError(`Hole ${e?.hole} is out of range`);
    }
    if (seen.has(hole)) throw new ValidationError(`Duplicate hole ${hole}`);
    seen.add(hole);
    if (!Number.isInteger(gross) || gross < 1 || gross > 15) {
      throw new ValidationError(`Score for hole ${hole} must be 1–15`);
    }
    return { hole, gross };
  });
  scores.sort((a, b) => a.hole - b.hole);
  return scores;
}

async function currentCardId(env: Env, matchId: string, playerId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT id FROM scorecards WHERE match_id = ? AND player_id = ?')
    .bind(matchId, playerId).first<{ id: string }>();
  return row!.id;
}

// Run the determination engine and write result + progression onto the match.
async function settle(env: Env, match: Record<string, any>): Promise<void> {
  if (!match.tee_id) {
    // No course linked → can't auto-compute. Leave the cards in place; reveal
    // will report that course data is needed. (Sample/seeded tees avoid this.)
    return;
  }
  const range = holeRange(match.match_type);
  const [tee, holeRows, creatorCard, opponentCard] = await Promise.all([
    env.DB.prepare('SELECT * FROM tees WHERE id = ?').bind(match.tee_id).first<any>(),
    env.DB.prepare(
      'SELECT hole_number, par, stroke_index FROM holes WHERE tee_id = ? AND hole_number BETWEEN ? AND ? ORDER BY hole_number'
    ).bind(match.tee_id, range.min, range.max).all<any>(),
    env.DB.prepare('SELECT hole_scores FROM scorecards WHERE id = ?').bind(match.creator_scorecard_id).first<{ hole_scores: string }>(),
    env.DB.prepare('SELECT hole_scores FROM scorecards WHERE id = ?').bind(match.opponent_scorecard_id).first<{ hole_scores: string }>(),
  ]);
  if (!tee || !holeRows?.results?.length || !creatorCard || !opponentCard) return;

  const holes: HoleSpec[] = holeRows.results.map((h: any) => ({
    hole: h.hole_number, par: h.par, stroke_index: h.stroke_index,
  }));
  const grossByHole = (json: string) => {
    const map = new Map<number, number>();
    for (const e of JSON.parse(json) as { hole: number; gross: number }[]) map.set(e.hole, e.gross);
    return holes.map((h) => map.get(h.hole) ?? 0);
  };

  const creatorCH = courseHandicap(match.creator_handicap ?? 0, tee.slope_rating, tee.course_rating, tee.par);
  const opponentCH = courseHandicap(match.opponent_handicap ?? 0, tee.slope_rating, tee.course_rating, tee.par);
  const diff = strokeDifferenceForHoles(creatorCH, opponentCH, holes.length);

  const result = computeMatch(holes, grossByHole(creatorCard.hole_scores), grossByHole(opponentCard.hole_scores), diff);

  await env.DB.prepare(
    `UPDATE matches SET result = ?, match_progression = ?, status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`
  ).bind(result.final_result, JSON.stringify(result), now(), now(), match.id).run();
}

async function reveal(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  let match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  if (match.creator_id !== auth.userId && match.opponent_id !== auth.userId) {
    return error('Not your match', 403);
  }
  // The lock: refuse until BOTH cards are submitted.
  if (!match.creator_scorecard_id || !match.opponent_scorecard_id) {
    return error('Both players must submit before the reveal', 409);
  }

  // Lazy settle: if both cards are in but the match was never computed (e.g. it
  // had no tee linked at submit time, since fixed), settle it now so the result
  // surfaces instead of dead-ending on a stuck in_progress match.
  if (!match.match_progression && match.tee_id) {
    await settle(env, match);
    match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first<Record<string, any>>();
    if (!match) return error('Match not found', 404);
  }

  const [creatorCard, opponentCard, creatorUser, opponentUser] = await Promise.all([
    env.DB.prepare('SELECT * FROM scorecards WHERE id = ?').bind(match.creator_scorecard_id).first(),
    env.DB.prepare('SELECT * FROM scorecards WHERE id = ?').bind(match.opponent_scorecard_id).first(),
    env.DB.prepare('SELECT first_name, last_name FROM users WHERE id = ?').bind(match.creator_id).first<any>(),
    match.opponent_id
      ? env.DB.prepare('SELECT first_name, last_name FROM users WHERE id = ?').bind(match.opponent_id).first<any>()
      : Promise.resolve(null),
  ]);

  const nameOf = (u: any) => (u ? [u.first_name, u.last_name].filter(Boolean).join(' ').trim() : '') || 'A golfer';

  return json({
    match,
    creator_scorecard: creatorCard,
    opponent_scorecard: opponentCard,
    creator_name: nameOf(creatorUser),
    opponent_name: nameOf(opponentUser),
    progression: match.match_progression ? JSON.parse(match.match_progression) : null,
  });
}

// GET /matches/:id/holes — par + stroke index for each hole the match is played
// over, plus the handicap strokes the CALLER receives in this match (so score
// entry can show par context + stroke dots). Never returns any score data, so
// it's safe to call before the reveal. Returns has_course_data=false (and zero
// strokes) when no tee is linked.
async function holesSetup(auth: AuthContext, env: Env, matchId: string): Promise<Response> {
  const match = await env.DB.prepare('SELECT * FROM matches WHERE id = ?')
    .bind(matchId).first<Record<string, any>>();
  if (!match) return error('Match not found', 404);
  if (match.creator_id !== auth.userId && match.opponent_id !== auth.userId) {
    return error('Not your match', 403);
  }

  const range = holeRange(match.match_type);
  const holeNumbers = Array.from({ length: range.count }, (_, i) => range.min + i);

  if (!match.tee_id) {
    return json({
      has_course_data: false,
      holes: holeNumbers.map((h) => ({ hole: h, par: null, stroke_index: null })),
      par_total: null,
      my_strokes: holeNumbers.map(() => 0),
    });
  }

  const [tee, holeRows] = await Promise.all([
    env.DB.prepare('SELECT * FROM tees WHERE id = ?').bind(match.tee_id).first<any>(),
    env.DB.prepare(
      'SELECT hole_number, par, stroke_index FROM holes WHERE tee_id = ? AND hole_number BETWEEN ? AND ? ORDER BY hole_number'
    ).bind(match.tee_id, range.min, range.max).all<any>(),
  ]);

  if (!tee || !holeRows?.results?.length) {
    return json({
      has_course_data: false,
      holes: holeNumbers.map((h) => ({ hole: h, par: null, stroke_index: null })),
      par_total: null,
      my_strokes: holeNumbers.map(() => 0),
    });
  }

  const holes = holeRows.results.map((h: any) => ({
    hole: h.hole_number, par: h.par, stroke_index: h.stroke_index,
  }));

  // Strokes the caller receives = the net stroke difference, allocated to the
  // higher-handicap side. Zero for everyone until both handicaps are snapshotted.
  let my_strokes = holes.map(() => 0);
  if (match.creator_handicap != null && match.opponent_handicap != null) {
    const specs: HoleSpec[] = holes.map((h: any) => ({
      hole: h.hole, par: h.par, stroke_index: h.stroke_index,
    }));
    const creatorCH = courseHandicap(match.creator_handicap, tee.slope_rating, tee.course_rating, tee.par);
    const opponentCH = courseHandicap(match.opponent_handicap, tee.slope_rating, tee.course_rating, tee.par);
    const diff = strokeDifferenceForHoles(creatorCH, opponentCH, specs.length);
    const viewerIsCreator = match.creator_id === auth.userId;
    if (diff > 0 && viewerIsCreator) my_strokes = allocateStrokes(diff, specs);
    else if (diff < 0 && !viewerIsCreator) my_strokes = allocateStrokes(-diff, specs);
  }

  const par_total = holes.reduce((s: number, h: any) => s + h.par, 0);
  return json({ has_course_data: true, holes, par_total, my_strokes });
}
