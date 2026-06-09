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

// Compute the full hole-by-hole match-play result.
//
// `strokeDifference` is the net handicap strokes the CREATOR receives (signed,
// creator perspective): positive → creator is the higher handicap and gets
// strokes; negative → the opponent gets strokes. The caller computes it from
// course handicaps (and scales it for a 9-hole match — see callers).
//
// Gross arrays must align positionally to `holes`.
export function computeMatch(
  holes: HoleSpec[],
  creatorGross: number[],
  opponentGross: number[],
  strokeDifference: number
): MatchResult {
  if (creatorGross.length !== holes.length || opponentGross.length !== holes.length) {
    throw new Error('Score arrays must align to holes');
  }

  const creatorStrokes = strokeDifference > 0 ? allocateStrokes(strokeDifference, holes) : holes.map(() => 0);
  const opponentStrokes = strokeDifference < 0 ? allocateStrokes(-strokeDifference, holes) : holes.map(() => 0);

  const total = holes.length;
  let delta = 0;            // creator holes-up
  let decidedOnHole: number | null = null;
  const out: HoleResult[] = [];

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

    // Match closes out when the lead exceeds the holes still to play.
    const holesRemaining = total - (i + 1);
    if (decidedOnHole === null && Math.abs(delta) > holesRemaining) {
      decidedOnHole = holes[i].hole;
      // Standard match-play scoreline: "X & Y" (up by X with Y to play). The
      // final hole closeout is "X Up" (handled below since Y would be 0).
      break;
    }
  }

  let final_result: MatchResult['final_result'] = 'tie';
  if (delta > 0) final_result = 'creator_wins';
  else if (delta < 0) final_result = 'opponent_wins';

  let final_delta: string;
  if (delta === 0) {
    final_delta = 'All Square';
  } else if (decidedOnHole !== null) {
    const holesRemaining = total - out.length;
    final_delta = holesRemaining > 0 ? `${Math.abs(delta)} & ${holesRemaining}` : `${Math.abs(delta)} Up`;
  } else {
    final_delta = `${Math.abs(delta)} Up`;
  }

  return { holes: out, final_result, final_delta, decided_on_hole: decidedOnHole };
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
