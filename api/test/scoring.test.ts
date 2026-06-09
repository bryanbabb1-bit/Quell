import { describe, it, expect } from 'vitest';
import {
  courseHandicap, allocateStrokes, computeMatch, strokeDifferenceForHoles,
  segmentCourseHandicap,
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
  it('uses the HALF index against a nine\'s own ratings', () => {
    // round(5 * 128/113 + (35.7 - 36)) = round(5.664 - 0.3) = 5
    expect(segmentCourseHandicap(10, { slope: 128, rating: 35.7, par: 36, isNine: true })).toBe(5);
  });
  it('handles plus handicaps on a nine', () => {
    // index -4 -> half -2: round(-2 * 128/113 + (35.7-36)) = round(-2.265 - 0.3) = round(-2.565) = -3
    expect(segmentCourseHandicap(-4, { slope: 128, rating: 35.7, par: 36, isNine: true })).toBe(-3);
  });
});
