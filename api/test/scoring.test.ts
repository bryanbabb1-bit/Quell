import { describe, it, expect } from 'vitest';
import {
  courseHandicap, allocateStrokes, computeMatch, strokeDifferenceForHoles,
  segmentCourseHandicap, computeRunning, winProbabilitySeries, buildGamecast,
  type HoleSpec,
} from '../src/lib/scoring';

// 18 par-4 holes where hole_number === stroke_index, so allocation is easy to
// reason about (SI 1 is hole 1, SI 18 is hole 18).
const HOLES_18: HoleSpec[] = Array.from({ length: 18 }, (_, i) => ({
  hole: i + 1, par: 4, stroke_index: i + 1,
}));
const allGross = (v: number) => HOLES_18.map(() => v);

describe('courseHandicap (WHS)', () => {
  it('rounds Index × Slope/113 + (Rating − Par)', () => {
    // 10 × 130/113 + (71.5 − 72) = 11.504 − 0.5 = 11.004 → 11
    expect(courseHandicap(10, 130, 71.5, 72)).toBe(11);
  });
  it('handles a plus handicap (negative index)', () => {
    expect(courseHandicap(-2, 113, 72, 72)).toBe(-2);
  });
});

describe('winProbabilitySeries (ESPN-style)', () => {
  it('starts near 50% and ends at 100% for a win, 0% for a loss', () => {
    // Creator leads by 1 every hole over 18 → wins.
    const deltas = Array.from({ length: 18 }, (_, i) => 1);
    const s = winProbabilitySeries(deltas, 18);
    expect(s.length).toBe(19);          // pre-round + 18 holes
    expect(s[0]).toBeGreaterThan(30);
    expect(s[0]).toBeLessThan(70);      // pre-round is a coin-flip-ish
    expect(s[18]).toBe(100);            // 1 up after 18 = win
  });
  it('hits 100% at the closeout hole and stays', () => {
    // 5 up after 5 holes of a front nine (4 to play) = clinched.
    const deltas = [1, 2, 3, 4, 5, 5, 5, 5, 5];
    const s = winProbabilitySeries(deltas, 9);
    expect(s[5]).toBe(100); // after hole 5, 5 up with 4 to play → clinched
  });
  it('reads 0% when the creator is buried', () => {
    const deltas = [-1, -2, -3, -4, -5, -5, -5, -5, -5];
    const s = winProbabilitySeries(deltas, 9);
    expect(s[5]).toBe(0);
  });
});

describe('buildGamecast', () => {
  const front = HOLES_18.slice(0, 9); // par-4 nine
  it('computes per-hole to-par, running status, and the current hole', () => {
    const c = [3, 4, 0, 0, 0, 0, 0, 0, 0]; // birdie, par, then nothing
    const o = [5, 4, 0, 0, 0, 0, 0, 0, 0]; // bogey, par
    const g = buildGamecast(front, c, o, 0);
    expect(g.holes_played).toBe(2);
    expect(g.holes[0].creator_to_par).toBe(-1); // birdie on a par 4
    expect(g.holes[0].winner).toBe('creator');
    expect(g.creator_delta).toBe(1);
    expect(g.cumulative).toBe('1 Up');
    expect(g.creator_to_par).toBe(-1); // −1 then E
    expect(g.current_hole).toBe(3);    // next incomplete
    expect(g.leader).toBe('creator');
  });
  it('emits win/birdie events and flags a true lead change (sign flip)', () => {
    // H1 opp wins (creator 1 down). H2 creator birdies to win (all square).
    // H3 creator wins again → creator 1 UP = a real lead change from opp to creator.
    const c = [5, 3, 4, 0, 0, 0, 0, 0, 0];
    const o = [4, 5, 5, 0, 0, 0, 0, 0, 0];
    const g = buildGamecast(front, c, o, 0);
    expect(g.events.some((e) => e.kind === 'win')).toBe(true);
    expect(g.events.some((e) => e.score_name === 'birdie')).toBe(true);
    const lc = g.events.find((e) => e.kind === 'lead_change');
    expect(lc?.hole).toBe(3);       // sign flips − → + on hole 3
    expect(lc?.side).toBe('creator');
  });
  it('flags closeout with the final delta', () => {
    const c = [3, 3, 3, 3, 3, 0, 0, 0, 0]; // win 5 straight → 5 up, 4 to play
    const o = [5, 5, 5, 5, 5, 0, 0, 0, 0];
    const g = buildGamecast(front, c, o, 0);
    expect(g.decided_on_hole).toBe(5);
    expect(g.final_delta).toBe('5 & 4');
    expect(g.events.some((e) => e.kind === 'closeout')).toBe(true);
  });
});

describe('computeRunning (live, playing-together)', () => {
  // Scratch match: gross = net. Only holes both have entered count.
  it('counts only holes both players have entered', () => {
    const c = [4, 5, 0, 0, ...Array(14).fill(0)]; // creator thru 2
    const o = [5, 5, 0, 0, ...Array(14).fill(0)]; // opponent thru 2
    const r = computeRunning(HOLES_18, c, o, 0);
    expect(r.holes_played).toBe(2);
    expect(r.creator_delta).toBe(1); // won hole 1, halved hole 2
    expect(r.cumulative).toBe('1 Up');
    expect(r.holes_remaining).toBe(16);
    expect(r.decided_on_hole).toBeNull();
  });
  it('skips a hole where only one player has posted', () => {
    const c = [4, 4, ...Array(16).fill(0)]; // creator thru 2
    const o = [5, 0, ...Array(16).fill(0)]; // opponent thru 1
    const r = computeRunning(HOLES_18, c, o, 0);
    expect(r.holes_played).toBe(1);    // only hole 1 is complete for both
    expect(r.creator_delta).toBe(1);
  });
  it('flags closeout once the lead exceeds holes remaining', () => {
    // Front nine, creator wins the first 5 → 5 up with 4 to play = closed out.
    const front = HOLES_18.slice(0, 9);
    const c = [3, 3, 3, 3, 3, 0, 0, 0, 0];
    const o = [5, 5, 5, 5, 5, 0, 0, 0, 0];
    const r = computeRunning(front, c, o, 0);
    expect(r.creator_delta).toBe(5);
    expect(r.decided_on_hole).toBe(5);
    expect(r.final_delta).toBe('5 & 4');
  });
});

describe('allocateStrokes', () => {
  it('gives one stroke to the hardest N holes when strokes < holes', () => {
    const a = allocateStrokes(5, HOLES_18);
    expect(a.slice(0, 5)).toEqual([1, 1, 1, 1, 1]); // SI 1..5
    expect(a.slice(5)).toEqual(Array(13).fill(0));
  });
  it('gives everyone a stroke at exactly 18', () => {
    expect(allocateStrokes(18, HOLES_18)).toEqual(Array(18).fill(1));
  });
  it('wraps a second stroke onto the hardest holes when strokes > holes', () => {
    const a = allocateStrokes(20, HOLES_18);
    expect(a[0]).toBe(2); // SI 1
    expect(a[1]).toBe(2); // SI 2
    expect(a[2]).toBe(1); // SI 3
    expect(a[17]).toBe(1);
  });
  it('returns zeros for non-positive strokes', () => {
    expect(allocateStrokes(0, HOLES_18)).toEqual(Array(18).fill(0));
    expect(allocateStrokes(-3, HOLES_18)).toEqual(Array(18).fill(0));
  });
});

describe('computeMatch', () => {
  it('is All Square when scratch players tie every hole', () => {
    const r = computeMatch(HOLES_18, allGross(4), allGross(4), 0);
    expect(r.final_result).toBe('tie');
    expect(r.final_delta).toBe('All Square');
    expect(r.decided_on_hole).toBeNull();
  });

  it('closes out 3 & 2 when creator goes 3 up through 3 and holds', () => {
    const creator = allGross(4);
    creator[0] = creator[1] = creator[2] = 3; // win first three holes
    const r = computeMatch(HOLES_18, creator, allGross(4), 0);
    expect(r.final_result).toBe('creator_wins');
    expect(r.decided_on_hole).toBe(16); // 3 up with 2 to play
    expect(r.final_delta).toBe('3 & 2');
    expect(r.holes[2].cumulative).toBe('3 Up');
  });

  it('applies handicap strokes that flip hole outcomes', () => {
    // creator receives 2 strokes (SI 1 & 2 → holes 1 & 2). Equal gross there
    // becomes a net win for the creator.
    const r = computeMatch(HOLES_18, allGross(4), allGross(4), 2);
    expect(r.holes[0].winner).toBe('creator');
    expect(r.holes[0].creator_net).toBe(3);
    expect(r.holes[1].winner).toBe('creator');
    expect(r.holes[2].winner).toBe('tie'); // no stroke on SI 3
    expect(r.final_result).toBe('creator_wins');
    expect(r.decided_on_hole).toBe(17); // 2 up with 1 to play
    expect(r.final_delta).toBe('2 & 1');
  });

  it('gives strokes to the opponent when the difference is negative', () => {
    const r = computeMatch(HOLES_18, allGross(4), allGross(4), -1);
    expect(r.holes[0].winner).toBe('opponent');
    expect(r.holes[0].opponent_net).toBe(3);
    expect(r.final_result).toBe('opponent_wins');
  });

  it('reports "1 Up" when decided only on the 18th', () => {
    const creator = allGross(4);
    creator[17] = 3; // win the last hole only
    const r = computeMatch(HOLES_18, creator, allGross(4), 0);
    expect(r.final_result).toBe('creator_wins');
    expect(r.final_delta).toBe('1 Up');
  });

  it('throws if score arrays do not align to holes', () => {
    expect(() => computeMatch(HOLES_18, allGross(4), [4, 4, 4], 0)).toThrow();
  });

  it('gives the field player the FULL difference when the opponent is a plus golfer', () => {
    // Creator is +2 (course handicap -2), opponent is a 10. Low-to-high
    // difference = 12 → the HIGHER handicap (opponent) receives 12 strokes,
    // allocated on their hardest 12 holes (SI 1..12). diff (creator perspective)
    // = creatorCH - opponentCH = -2 - 10 = -12.
    const r = computeMatch(HOLES_18, allGross(4), allGross(4), -12);
    expect(r.holes[0].winner).toBe('opponent');   // SI 1 → opponent stroke, net 3 < 4
    expect(r.holes[0].opponent_net).toBe(3);
    expect(r.holes[11].winner).toBe('opponent');  // SI 12 → last stroke
    expect(r.holes[12].winner).toBe('tie');       // SI 13 → no stroke
    expect(r.final_result).toBe('opponent_wins');
  });

  it('allocates pops = the course-handicap difference to the HIGHER handicap', () => {
    // Creator 12, opponent 5 → creator is higher by 7 → creator gets 7 strokes
    // (diff = creatorCH - opponentCH = +7), on SI 1..7.
    const r = computeMatch(HOLES_18, allGross(4), allGross(4), 7);
    expect(r.holes.slice(0, 7).every((h) => h.winner === 'creator')).toBe(true);
    expect(r.holes[7].winner).toBe('tie'); // SI 8 → no stroke
    expect(r.final_result).toBe('creator_wins');
  });

  it('allocates each player\'s strokes on their OWN tee when tees differ', () => {
    // Opponent plays a tee whose stroke index is REVERSED (hole 1 is SI 18,
    // hole 18 is SI 1). The opponent receives 1 stroke → it must land on THEIR
    // hardest hole (hole 18), not hole 1.
    const oppHoles: HoleSpec[] = Array.from({ length: 18 }, (_, i) => ({
      hole: i + 1, par: 4, stroke_index: 18 - i,
    }));
    const r = computeMatch(HOLES_18, allGross(4), allGross(4), -1, oppHoles);
    expect(r.holes[17].winner).toBe('opponent');  // hole 18 = opponent's SI 1
    expect(r.holes[17].opponent_net).toBe(3);
    expect(r.holes[0].winner).toBe('tie');         // hole 1 = opponent's SI 18, no stroke
    expect(r.final_result).toBe('opponent_wins');
  });
});

describe('strokeDifferenceForHoles', () => {
  it('uses the full difference over 18', () => {
    expect(strokeDifferenceForHoles(10, 4, 18)).toBe(6);
  });
  it('halves (approx) for a 9-hole match', () => {
    expect(strokeDifferenceForHoles(10, 4, 9)).toBe(3);
  });
});

describe('segmentCourseHandicap', () => {
  it('uses the full index against 18-hole ratings', () => {
    // round(10 * 130/113 + (71.5 - 72)) = round(11.504 - 0.5) = 11
    expect(segmentCourseHandicap(10, { slope: 130, rating: 71.5, par: 72, isNine: false })).toBe(11);
  });
  it('turns a plus index into a NEGATIVE course handicap on 18 holes', () => {
    // +1.2 is stored as -1.2: round(-1.2*130/113 + (71.5-72)) = round(-1.38 - 0.5) = -2
    expect(segmentCourseHandicap(-1.2, { slope: 130, rating: 71.5, par: 72, isNine: false })).toBe(-2);
  });

  it('uses the HALF index against a nine\'s own ratings', () => {
    // round(5 * 128/113 + (35.7 - 36)) = round(5.664 - 0.3) = 5
    expect(segmentCourseHandicap(10, { slope: 128, rating: 35.7, par: 36, isNine: true })).toBe(5);
  });
  it('handles plus handicaps on a nine', () => {
    // index -4 -> half -2: round(-2 * 128/113 + (35.7-36)) = round(-2.265 - 0.3) = round(-2.565) = -3
    expect(segmentCourseHandicap(-4, { slope: 128, rating: 35.7, par: 36, isNine: true })).toBe(-3);
  });
});
