// Match-play determination engine. Pure functions, no I/O — unit-tested in
// test/scoring.test.ts. This is the heart of the app: turn two sets of gross
// scores + handicaps into a hole-by-hole net match-play result.

export interface HoleSpec {
  hole: number;          // 1..18
  par: number;
  stroke_index: number;  // 1..18 difficulty rank
}

export interface HoleResult {
  hole: number;
  creator_gross: number;
  creator_strokes: number;   // handicap strokes received on this hole
  creator_net: number;
  opponent_gross: number;
  opponent_strokes: number;
  opponent_net: number;
  winner: 'creator' | 'opponent' | 'tie';
  creator_delta: number;     // running holes-up from creator's perspective
  cumulative: string;        // label, creator perspective ("2 Up", "1 Down", "All Square")
}

export interface MatchResult {
  holes: HoleResult[];
  final_result: 'creator_wins' | 'opponent_wins' | 'tie';
  final_delta: string;       // "3 & 2", "2 Up", "All Square", ...
  decided_on_hole: number | null; // hole the match closed out, or null if it went the distance
  // Creator's win probability (0..100) at each point: index 0 = pre-round, then
  // one per hole played. Powers the ESPN-style win-prob graph on the reveal.
  win_prob: number[];
}

// WHS Course Handicap = Index × (Slope / 113) + (Course Rating − Par), rounded.
// Plus handicaps (Index < 0) flow through naturally to a negative result.
export function courseHandicap(
  index: number,
  slopeRating: number,
  courseRating: number,
  par: number
): number {
  return Math.round(index * (slopeRating / 113) + (courseRating - par));
}

// A scoring segment: the rating/slope/par that apply to the holes being played.
// For an 18-hole match that's the full tee; for a 9-hole match it's that nine's
// own rating/slope/par (WHS 9-hole values), and the index is halved.
export interface Segment {
  slope: number;
  rating: number;
  par: number;
  isNine: boolean;
}

// WHS course handicap for the segment actually being played. 9-hole matches use
// the half (9-hole) Handicap Index against the nine's rating/slope/par — so the
// front/back stroke difference is correct, not a rescale of the 18-hole number.
export function segmentCourseHandicap(index: number, seg: Segment): number {
  return courseHandicap(seg.isNine ? index / 2 : index, seg.slope, seg.rating, seg.par);
}

// Allocate `strokes` handicap strokes across the given holes by stroke index:
// the lowest-index (hardest) holes get strokes first; when strokes exceed the
// number of holes, everyone gets a base stroke and the remainder lands on the
// hardest holes again (a 2nd stroke). Returns an array aligned to `holes`.
export function allocateStrokes(strokes: number, holes: HoleSpec[]): number[] {
  const n = holes.length;
  if (strokes <= 0 || n === 0) return holes.map(() => 0);

  const base = Math.floor(strokes / n);
  const remainder = strokes % n;

  // Indices of the `remainder` holes with the lowest stroke_index.
  const hardestFirst = holes
    .map((h, i) => ({ i, si: h.stroke_index }))
    .sort((a, b) => a.si - b.si)
    .slice(0, remainder)
    .reduce((set, o) => set.add(o.i), new Set<number>());

  return holes.map((_, i) => base + (hardestFirst.has(i) ? 1 : 0));
}

function deltaLabel(delta: number): string {
  if (delta === 0) return 'All Square';
  return delta > 0 ? `${delta} Up` : `${Math.abs(delta)} Down`;
}

// ESPN-style win probability: the creator's chance of winning the match given
// the current lead (`delta`, creator holes-up) and holes left to play. A flat
// per-hole match-play model — creator wins the hole 25%, halves 50%, loses 25%
// — propagated by DP, with closeout clamping (once the lead exceeds the holes
// remaining, it's 1 or 0). A halved match counts as NOT a win for the creator.
function winProb(delta: number, remaining: number, memo = new Map<string, number>()): number {
  if (Math.abs(delta) > remaining) return delta > 0 ? 1 : 0; // clinched
  if (remaining === 0) return delta > 0 ? 1 : 0;              // final: tie ≠ win
  const key = `${delta}:${remaining}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const p = 0.25 * winProb(delta + 1, remaining - 1, memo)
          + 0.50 * winProb(delta, remaining - 1, memo)
          + 0.25 * winProb(delta - 1, remaining - 1, memo);
  memo.set(key, p);
  return p;
}

// The win-probability series for a finished match: pre-round (50-ish) then the
// creator's P(win) after each hole, from the running deltas. 0..100 integers.
export function winProbabilitySeries(deltas: number[], total: number): number[] {
  const memo = new Map<string, number>();
  const pct = (d: number, rem: number) => Math.round(winProb(d, rem, memo) * 100);
  const series = [pct(0, total)];
  for (let i = 0; i < deltas.length; i++) series.push(pct(deltas[i], total - (i + 1)));
  return series;
}

// Compute the full hole-by-hole match-play result.
//
// `strokeDifference` is the net handicap strokes the CREATOR receives (signed,
// creator perspective): positive → creator is the higher handicap and gets
// strokes; negative → the opponent gets strokes. The caller computes it from
// course handicaps (and scales it for a 9-hole match — see callers).
//
// `holes` is the creator's tee. `opponentHoles` is the opponent's tee — pass it
// when the two players play DIFFERENT tees, so each side's handicap strokes
// allocate on their OWN tee's stroke index (the holes are the same physical
// holes, in the same order, so par-per-hole never enters the net-vs-net result —
// only the stroke index, which can differ by tee). Omit it and both share
// `holes`. Gross arrays must align positionally to their player's holes.
export function computeMatch(
  holes: HoleSpec[],
  creatorGross: number[],
  opponentGross: number[],
  strokeDifference: number,
  opponentHoles: HoleSpec[] = holes
): MatchResult {
  if (
    creatorGross.length !== holes.length ||
    opponentGross.length !== opponentHoles.length ||
    holes.length !== opponentHoles.length
  ) {
    throw new Error('Score arrays must align to holes');
  }

  const creatorStrokes = strokeDifference > 0 ? allocateStrokes(strokeDifference, holes) : holes.map(() => 0);
  const opponentStrokes = strokeDifference < 0 ? allocateStrokes(-strokeDifference, opponentHoles) : opponentHoles.map(() => 0);

  const total = holes.length;
  let delta = 0;            // creator holes-up
  let decidedOnHole: number | null = null;
  let closeoutDelta = 0;     // the match-deciding margin (locked at closeout)
  let closeoutRemaining = 0; // holes left to play when it closed out
  const out: HoleResult[] = [];

  // Play EVERY hole so the full round (gross + hole-by-hole card) is shown —
  // players enter all 9/18 holes. The RESULT, though, is locked at the closeout
  // hole (the moment the lead exceeded the holes remaining); later holes don't
  // change who won.
  for (let i = 0; i < total; i++) {
    const cNet = creatorGross[i] - creatorStrokes[i];
    const oNet = opponentGross[i] - opponentStrokes[i];

    let winner: HoleResult['winner'] = 'tie';
    if (cNet < oNet) { winner = 'creator'; delta++; }
    else if (oNet < cNet) { winner = 'opponent'; delta--; }

    out.push({
      hole: holes[i].hole,
      creator_gross: creatorGross[i], creator_strokes: creatorStrokes[i], creator_net: cNet,
      opponent_gross: opponentGross[i], opponent_strokes: opponentStrokes[i], opponent_net: oNet,
      winner, creator_delta: delta, cumulative: deltaLabel(delta),
    });

    const holesRemaining = total - (i + 1);
    if (decidedOnHole === null && Math.abs(delta) > holesRemaining) {
      decidedOnHole = holes[i].hole;
      closeoutDelta = delta;
      closeoutRemaining = holesRemaining;
    }
  }

  // Result is the closeout margin if it closed out, else the margin after the
  // final hole.
  const resultDelta = decidedOnHole !== null ? closeoutDelta : delta;
  let final_result: MatchResult['final_result'] = 'tie';
  if (resultDelta > 0) final_result = 'creator_wins';
  else if (resultDelta < 0) final_result = 'opponent_wins';

  let final_delta: string;
  if (decidedOnHole !== null) {
    final_delta = closeoutRemaining > 0 ? `${Math.abs(closeoutDelta)} & ${closeoutRemaining}` : `${Math.abs(closeoutDelta)} Up`;
  } else {
    final_delta = resultDelta === 0 ? 'All Square' : `${Math.abs(resultDelta)} Up`;
  }

  const win_prob = winProbabilitySeries(out.map((h) => h.creator_delta), total);
  return { holes: out, final_result, final_delta, decided_on_hole: decidedOnHole, win_prob };
}

// The running match state for a LIVE (playing-together) match — the same
// determination as computeMatch, but over only the holes BOTH players have
// entered so far. Handicap strokes are allocated over the FULL hole set (the
// match will be played out), so the running net is correct from the first hole.
// Holes not yet completed by both (gross ≤ 0 on either side) are skipped.
export interface RunningResult {
  holes: HoleResult[];          // completed holes only, in order
  creator_delta: number;        // running, creator perspective
  cumulative: string;           // "2 Up" / "All Square" / "1 Down"
  holes_played: number;         // holes both have entered
  holes_remaining: number;
  decided_on_hole: number | null; // closed out already?
  final_delta: string | null;   // set once decided
}

export function computeRunning(
  holes: HoleSpec[],
  creatorGross: number[],
  opponentGross: number[],
  strokeDifference: number,
  opponentHoles: HoleSpec[] = holes
): RunningResult {
  const creatorStrokes = strokeDifference > 0 ? allocateStrokes(strokeDifference, holes) : holes.map(() => 0);
  const opponentStrokes = strokeDifference < 0 ? allocateStrokes(-strokeDifference, opponentHoles) : opponentHoles.map(() => 0);

  const total = holes.length;
  let delta = 0, played = 0;
  let decidedOnHole: number | null = null;
  let closeoutDelta = 0, closeoutRemaining = 0;
  const out: HoleResult[] = [];

  for (let i = 0; i < total; i++) {
    const cg = creatorGross[i] ?? 0;
    const og = opponentGross[i] ?? 0;
    if (cg <= 0 || og <= 0) continue; // not yet completed by both
    const cNet = cg - creatorStrokes[i];
    const oNet = og - opponentStrokes[i];
    let winner: HoleResult['winner'] = 'tie';
    if (cNet < oNet) { winner = 'creator'; delta++; }
    else if (oNet < cNet) { winner = 'opponent'; delta--; }
    played++;
    out.push({
      hole: holes[i].hole,
      creator_gross: cg, creator_strokes: creatorStrokes[i], creator_net: cNet,
      opponent_gross: og, opponent_strokes: opponentStrokes[i], opponent_net: oNet,
      winner, creator_delta: delta, cumulative: deltaLabel(delta),
    });
    const remaining = total - played;
    if (decidedOnHole === null && Math.abs(delta) > remaining) {
      decidedOnHole = holes[i].hole; closeoutDelta = delta; closeoutRemaining = remaining;
    }
  }

  const final_delta = decidedOnHole !== null
    ? (closeoutRemaining > 0 ? `${Math.abs(closeoutDelta)} & ${closeoutRemaining}` : `${Math.abs(closeoutDelta)} Up`)
    : null;

  return {
    holes: out, creator_delta: delta, cumulative: deltaLabel(delta),
    holes_played: played, holes_remaining: total - played,
    decided_on_hole: decidedOnHole, final_delta,
  };
}

// ── Gamecast — the rich live/spectator view ─────────────────────────────────
// Everything the live screen needs to be WATCHABLE: per-hole score-to-par, each
// player's round to-par, the running status, momentum, a live win-prob series,
// and a server-generated play-by-play. Pure (no I/O) → unit-tested.

export type ToParName = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'other';

export interface GamecastHole {
  hole: number;
  par: number | null;
  creator_gross: number | null;
  opponent_gross: number | null;
  creator_to_par: number | null;   // gross − par (null until played)
  opponent_to_par: number | null;
  winner: 'creator' | 'opponent' | 'tie' | null;
  creator_delta: number | null;    // running, after this hole
  status_label: string | null;     // "2 Up" / "All Square" (creator perspective)
}

export interface GamecastEvent {
  hole: number;
  kind: 'win' | 'halve' | 'lead_change' | 'closeout';
  side: 'creator' | 'opponent' | null;   // who it's about
  score_name: ToParName | null;          // birdie/eagle etc. on the deciding score
  text: string;                          // play-by-play line (names filled by caller? no — neutral)
}

export interface Gamecast {
  holes: GamecastHole[];                 // all holes of the match (played + pending)
  holes_played: number;
  holes_remaining: number;
  creator_delta: number;
  cumulative: string;                    // "2 Up" / "All Square"
  leader: 'creator' | 'opponent' | 'tie';
  decided_on_hole: number | null;
  final_delta: string | null;
  creator_to_par: number | null;         // round total vs par over completed holes
  opponent_to_par: number | null;
  momentum: { side: 'creator' | 'opponent' | null; won: number; of: number }; // last ≤3 decided
  win_prob: number[];                    // creator P(win) at each completed hole (+pre-round)
  current_hole: number | null;           // next hole not complete by both
  events: GamecastEvent[];               // oldest → newest (client reverses for the feed)
}

function toParName(toPar: number): ToParName {
  if (toPar <= -2) return 'eagle';
  if (toPar === -1) return 'birdie';
  if (toPar === 0) return 'par';
  if (toPar === 1) return 'bogey';
  if (toPar === 2) return 'double';
  return 'other';
}

export function buildGamecast(
  holes: HoleSpec[],
  creatorGross: number[],
  opponentGross: number[],
  strokeDifference: number,
  opponentHoles: HoleSpec[] = holes
): Gamecast {
  const creatorStrokes = strokeDifference > 0 ? allocateStrokes(strokeDifference, holes) : holes.map(() => 0);
  const opponentStrokes = strokeDifference < 0 ? allocateStrokes(-strokeDifference, opponentHoles) : opponentHoles.map(() => 0);

  const total = holes.length;
  let delta = 0, played = 0, cToPar = 0, oToPar = 0;
  let decidedOnHole: number | null = null, closeoutDelta = 0, closeoutRemaining = 0;
  let prevLeadSign = 0, currentHole: number | null = null;
  const out: GamecastHole[] = [];
  const events: GamecastEvent[] = [];
  const deltas: number[] = [];

  for (let i = 0; i < total; i++) {
    const cg = creatorGross[i] ?? 0;
    const og = opponentGross[i] ?? 0;
    const par = holes[i].par ?? null;
    const both = cg > 0 && og > 0;

    if (!both) {
      // First incomplete hole = "happening now".
      if (currentHole === null && (cg > 0 || og > 0 || played === i)) currentHole = holes[i].hole;
      out.push({
        hole: holes[i].hole, par,
        creator_gross: cg > 0 ? cg : null, opponent_gross: og > 0 ? og : null,
        creator_to_par: cg > 0 && par != null ? cg - par : null,
        opponent_to_par: og > 0 && par != null ? og - par : null,
        winner: null, creator_delta: null, status_label: null,
      });
      continue;
    }

    const cNet = cg - creatorStrokes[i];
    const oNet = og - opponentStrokes[i];
    let winner: 'creator' | 'opponent' | 'tie' = 'tie';
    if (cNet < oNet) { winner = 'creator'; delta++; }
    else if (oNet < cNet) { winner = 'opponent'; delta--; }
    played++;
    if (par != null) { cToPar += cg - par; oToPar += og - par; }
    deltas.push(delta);

    out.push({
      hole: holes[i].hole, par,
      creator_gross: cg, opponent_gross: og,
      creator_to_par: par != null ? cg - par : null,
      opponent_to_par: par != null ? og - par : null,
      winner, creator_delta: delta, status_label: deltaLabel(delta),
    });

    // Play-by-play. Lead change first (it's the headline), then the hole result.
    const sign = Math.sign(delta);
    if (sign !== 0 && prevLeadSign !== 0 && sign !== prevLeadSign) {
      events.push({ hole: holes[i].hole, kind: 'lead_change', side: sign > 0 ? 'creator' : 'opponent', score_name: null, text: 'lead_change' });
    }
    if (sign !== 0) prevLeadSign = sign;

    const remaining = total - played;
    if (winner === 'tie') {
      events.push({ hole: holes[i].hole, kind: 'halve', side: null, score_name: par != null ? toParName(cg - par) : null, text: 'halve' });
    } else {
      const wSide = winner;
      const wGross = wSide === 'creator' ? cg : og;
      events.push({ hole: holes[i].hole, kind: 'win', side: wSide, score_name: par != null ? toParName(wGross - par) : null, text: 'win' });
    }

    if (decidedOnHole === null && Math.abs(delta) > remaining) {
      decidedOnHole = holes[i].hole; closeoutDelta = delta; closeoutRemaining = remaining;
      events.push({ hole: holes[i].hole, kind: 'closeout', side: delta > 0 ? 'creator' : 'opponent', score_name: null, text: 'closeout' });
    }
  }

  // Momentum: of the last ≤3 DECIDED holes, who won more.
  const decided = out.filter((h) => h.winner && h.winner !== 'tie').slice(-3);
  let cWon = 0, oWon = 0;
  for (const h of decided) { if (h.winner === 'creator') cWon++; else if (h.winner === 'opponent') oWon++; }
  const momentum = { side: (cWon > oWon ? 'creator' : oWon > cWon ? 'opponent' : null) as 'creator' | 'opponent' | null, won: Math.max(cWon, oWon), of: decided.length };

  const final_delta = decidedOnHole !== null
    ? (closeoutRemaining > 0 ? `${Math.abs(closeoutDelta)} & ${closeoutRemaining}` : `${Math.abs(closeoutDelta)} Up`)
    : null;

  return {
    holes: out, holes_played: played, holes_remaining: total - played,
    creator_delta: delta, cumulative: deltaLabel(delta),
    leader: delta > 0 ? 'creator' : delta < 0 ? 'opponent' : 'tie',
    decided_on_hole: decidedOnHole, final_delta,
    creator_to_par: played > 0 ? cToPar : null, opponent_to_par: played > 0 ? oToPar : null,
    momentum,
    win_prob: winProbabilitySeries(deltas, total),
    current_hole: currentHole,
    events,
  };
}

// Net strokes the creator receives over a set of holes, given both 18-hole
// course handicaps. Scaled for the number of holes actually played (a 9-hole
// match uses ~half the difference — a documented approximation; see PUNCHLIST).
export function strokeDifferenceForHoles(
  creatorCH: number,
  opponentCH: number,
  holesPlayed: number
): number {
  const full = creatorCH - opponentCH;
  return Math.round((full * holesPlayed) / 18);
}
