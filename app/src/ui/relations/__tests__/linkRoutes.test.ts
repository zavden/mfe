// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import { linkFrame } from '../linkLayout';
import {
  apart,
  BADGE_HEIGHT_PX,
  badgeWidthPx,
  linkRoutes,
  routePaths,
  type LinkEnds,
  type LinkRoute,
} from '../linkRoutes';

// Two formulas 8 wide and 0.5 tall, of a text 0.25 large: the gap between them is 0.75.
const A: Box = { minX: -4, maxX: 4, minY: 0, maxY: 0.5 };
const FRAME = linkFrame(A, A, 0.25);
const GAP = FRAME.gapTop - FRAME.gapBottom;

/** A mark 0.2 wide about `x`, on the source (just over the gap) or on the target (just under). */
const mark = (x: number, side: 'from' | 'to'): Box =>
  side === 'from'
    ? { minX: x - 0.1, maxX: x + 0.1, minY: FRAME.gapTop, maxY: FRAME.gapTop + 0.3 }
    : { minX: x - 0.1, maxX: x + 0.1, minY: FRAME.gapBottom - 0.3, maxY: FRAME.gapBottom };

/** A pair from the source glyph at `from` to the target glyph at `to`, with a badge `1 I:C`. */
const pair = (from: number, to: number, badgePx = badgeWidthPx('1 I:C')): LinkEnds => ({
  sources: [mark(from, 'from')],
  targets: [mark(to, 'to')],
  badgePx,
});

const heights = (routes: (LinkRoute | null)[]) => routes.map((route) => route?.junction[1]);

describe('linkRoutes', () => {
  // A scale at which the gap is 300 px high: room for every row.
  const FINE = GAP / 300;

  it('joins the marks of a pair through a junction in the middle of the gap', () => {
    const [route] = linkRoutes(FRAME, [pair(-2, 1)], FINE);
    expect(route!.junction[0]).toBeCloseTo(-0.5);
    expect(route!.junction[1]).toBeCloseTo(0);
    // The line starts a pixel under the source's mark; the arrow ends two over the target's.
    expect(route!.starts).toHaveLength(1);
    expect(route!.starts[0]![0]).toBeCloseTo(-2);
    expect(route!.starts[0]![1]).toBeCloseTo(FRAME.gapTop - FINE);
    expect(route!.ends[0]![0]).toBeCloseTo(1);
    expect(route!.ends[0]![1]).toBeCloseTo(FRAME.gapBottom + 2 * FINE);
  });

  it('meets the lines of several sources and targets between their middles', () => {
    const many: LinkEnds = {
      sources: [mark(-3, 'from'), mark(-1, 'from')],
      targets: [mark(2, 'to'), mark(3, 'to'), mark(4, 'to')],
      badgePx: 40,
    };
    const [route] = linkRoutes(FRAME, [many], FINE);
    expect(route!.junction[0]).toBeCloseTo((-2 + 3) / 2);
    expect(route!.starts.map(([x]) => x)).toEqual([-3, -1]);
    expect(route!.ends.map(([x]) => x)).toEqual([2, 3, 4]);
  });

  it('gives each pair a row of its own while the gap holds them, the first on top', () => {
    const routes = linkRoutes(FRAME, [pair(-3, -3), pair(-1, -1), pair(1, 1), pair(3, 3)], FINE);
    const ys = heights(routes) as number[];
    expect(new Set(ys.map((y) => y.toFixed(6))).size).toBe(4);
    expect([...ys].sort((a, b) => b - a)).toEqual(ys);
    // Spread evenly over the gap, about its middle.
    expect(ys[0]! + ys[3]!).toBeCloseTo(0);
    expect(ys[0]! - ys[1]!).toBeCloseTo(ys[1]! - ys[2]!);
    // A ninth pair shares the first row: eight rows at most.
    const nine = linkRoutes(
      FRAME,
      Array.from({ length: 9 }, (_, i) => pair(i - 4, i - 4)),
      GAP / 2000,
    );
    expect(nine[8]!.junction[1]).toBeCloseTo(nine[0]!.junction[1]);
    expect(new Set(heights(nine).map((y) => y!.toFixed(6))).size).toBe(8);
  });

  it('has only the rows a small gap holds: no row nearer the next than a badge is high', () => {
    // The gap is 60 px high: two rows of badges fit between its margins.
    const px = GAP / 60;
    const far = linkRoutes(FRAME, [pair(-3, -3), pair(-1, -1), pair(1, 1), pair(3, 3)], px);
    const ys = heights(far) as number[];
    expect(new Set(ys.map((y) => y.toFixed(6))).size).toBe(2);
    expect((ys[0]! - ys[1]!) / px).toBeGreaterThanOrEqual(BADGE_HEIGHT_PX);
    // Pairs take their rows in turn while their badges do not meet.
    expect(ys[2]).toBeCloseTo(ys[0]!);
    expect(ys[3]).toBeCloseTo(ys[1]!);
    // A gap of 20 px holds one row, in its middle.
    const one = linkRoutes(FRAME, [pair(-3, -3), pair(3, 3)], GAP / 20);
    expect(heights(one)).toEqual([0, 0]);
  });

  it('moves a pair to a row with room rather than lay its badge on another', () => {
    const px = GAP / 60; // two rows
    const width = badgeWidthPx('1 I:C') * px;
    // The third pair would share the first row with the first, right under its badge.
    const near = linkRoutes(FRAME, [pair(0, 0), pair(3, 3), pair(width / 2, width / 2)], px);
    expect(near[2]!.junction[1]).toBeCloseTo(near[1]!.junction[1]);
    // With no row free of badges it keeps its own, and the two badges of that row move apart
    // with their junctions, as much one way as the other: none is under another.
    const crowded = linkRoutes(FRAME, [pair(0, 0), pair(0.01, 0.01), pair(0.02, 0.02)], px);
    expect(crowded[2]!.junction[1]).toBeCloseTo(crowded[0]!.junction[1]);
    const [first, , third] = crowded.map((route) => route!.junction[0]);
    expect(third! - first!).toBeCloseTo(width + 2 * px);
    expect((first! + third!) / 2).toBeCloseTo(0.01);
    expect(crowded[1]!.junction[0]).toBeCloseTo(0.01);
    // The lines still start and end on the glyphs.
    expect(crowded[2]!.starts[0]![0]).toBeCloseTo(0.02);
    expect(crowded[2]!.ends[0]![0]).toBeCloseTo(0.02);
    // Links without a badge (suggested pairs) take their rows in turn, wherever they are.
    const bare = linkRoutes(FRAME, [pair(0, 0, 0), pair(3, 3, 0), pair(0.01, 0.01, 0)], px);
    expect(bare[2]!.junction[1]).toBeCloseTo(bare[0]!.junction[1]);
  });

  it('does not draw a pair without a glyph on a side, which keeps its turn', () => {
    const lone: LinkEnds = { sources: [mark(0, 'from')], targets: [], badgePx: 40 };
    const routes = linkRoutes(FRAME, [pair(-3, -3), lone, pair(3, 3)], FINE);
    expect(routes[1]).toBeNull();
    const all = linkRoutes(FRAME, [pair(-3, -3), pair(0, 0), pair(3, 3)], FINE);
    expect(routes[2]!.junction[1]).toBeCloseTo(all[2]!.junction[1]);
    expect(linkRoutes(FRAME, [], FINE)).toEqual([]);
  });
});

describe('linkRoutes side by side', () => {
  // The same two formulas side by side: the source ends at the gap, the target starts after it.
  const SIDE = linkFrame(A, A, 0.25, 'side');
  const PX = 0.01;
  /** A mark 0.2 wide and 0.3 tall whose top is at `top`: of the source about `x` (to the left
   * of the gap), of the target about `x` (to its right). */
  const at = (x: number, top: number): Box => ({
    minX: x - 0.1,
    maxX: x + 0.1,
    minY: top - 0.3,
    maxY: top,
  });
  const arc = (
    from: number,
    to: number,
    top = 0.25,
    badgePx = badgeWidthPx('1 I:C'),
  ): LinkEnds => ({
    sources: [at(from, top)],
    targets: [at(to, top)],
    badgePx,
  });

  it('draws a pair as an arc over its glyphs: up from the source, down on the target', () => {
    const [route] = linkRoutes(SIDE, [arc(-3, 2)], PX);
    // The junction between the two, 22 px over their marks.
    expect(route!.junction[0]).toBeCloseTo(-0.5);
    expect(route!.junction[1]).toBeCloseTo(0.25 + 22 * PX);
    expect(route!.badge).toEqual(route!.junction);
    // Both ends over the marks: the line leaves the source upwards, the arrow comes down.
    expect(route!.starts[0]).toEqual([-3, 0.25 + PX]);
    expect(route!.ends[0]![0]).toBeCloseTo(2);
    expect(route!.ends[0]![1]).toBeCloseTo(0.25 + 2 * PX);
    expect(routePaths(route!)).toHaveLength(2);
  });

  it('turns over the highest glyph of the pair', () => {
    const tall: LinkEnds = {
      sources: [at(-3, 0.25), at(-2, 0.6)],
      targets: [at(2, 0.1)],
      badgePx: 0,
    };
    const [route] = linkRoutes(SIDE, [tall], PX);
    expect(route!.junction[1]).toBeCloseTo(0.6 + 22 * PX);
    // Each line starts over its own mark.
    expect(route!.starts.map(([, y]) => y)).toEqual([0.25 + PX, 0.6 + PX]);
  });

  it('puts arcs that would run along each other one over another, the first the lowest', () => {
    const routes = linkRoutes(SIDE, [arc(-3, 2), arc(-2.5, 2.5), arc(-2, 3)], PX);
    const ys = heights(routes) as number[];
    expect(ys[1]! - ys[0]!).toBeCloseTo(9 * PX);
    expect(ys[2]! - ys[1]!).toBeCloseTo(9 * PX);
    // A pair of a line below is at its own height, however many arc over the line above.
    const lower = linkRoutes(SIDE, [arc(-3, 2), arc(-2.5, 2.5), arc(-3, 2, -1)], PX);
    expect(lower[2]!.junction[1]).toBeCloseTo(-1 + 22 * PX);
    // Nor do two arcs that span nothing in common share anything: both at their lowest.
    const apartArcs = linkRoutes(
      SIDE,
      [
        { sources: [at(-3, 0.25)], targets: [at(-2, 0.25)], badgePx: 0 },
        { sources: [at(2, 0.25)], targets: [at(3, 0.25)], badgePx: 0 },
      ],
      PX,
    );
    expect(apartArcs[1]!.junction[1]).toBeCloseTo(apartArcs[0]!.junction[1]);
  });

  it('puts a badge beside its junction rather than on a badge that is there', () => {
    // Four arcs between the same places: 9 px apart, and a badge is 15.4 px high.
    const routes = linkRoutes(
      SIDE,
      Array.from({ length: 4 }, () => arc(-3, 2)),
      PX,
    );
    const width = badgeWidthPx('1 I:C') * PX;
    const boxes = routes.map((route) => ({
      left: route!.badge[0] - width / 2,
      right: route!.badge[0] + width / 2,
      bottom: route!.badge[1] - (BADGE_HEIGHT_PX * PX) / 2,
      top: route!.badge[1] + (BADGE_HEIGHT_PX * PX) / 2,
    }));
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        expect(
          a.right <= b.left || b.right <= a.left || a.top <= b.bottom || b.top <= a.bottom,
        ).toBe(true);
      }
    }
    // The first is at its junction; the second, nine pixels over it, beside its own.
    expect(routes[0]!.badge).toEqual(routes[0]!.junction);
    expect(routes[1]!.badge[0]).toBeCloseTo(routes[1]!.junction[0] + width + 2 * PX);
    expect(routes[1]!.badge[1]).toBe(routes[1]!.junction[1]);
    // The third is high enough over the first to be at its junction again.
    expect(routes[2]!.badge).toEqual(routes[2]!.junction);
    // A pair that is not drawn takes no height.
    const lone: LinkEnds = { sources: [], targets: [at(2, 0.25)], badgePx: 40 };
    const some = linkRoutes(SIDE, [lone, arc(-3, 2)], PX);
    expect(some[0]).toBeNull();
    expect(some[1]!.junction[1]).toBeCloseTo(0.25 + 22 * PX);
  });
});

describe('apart', () => {
  const at = (...xs: number[]) => xs.map((x) => ({ x, width: 1 }));

  it('leaves alone what does not meet, and answers in the order given', () => {
    expect(apart(at(5, 0, 2.5), 0.5, -10, 10)).toEqual([5, 0, 2.5]);
    expect(apart([], 0.5, -10, 10)).toEqual([]);
  });

  it('moves those that meet apart about where they were, keeping their order', () => {
    // Two on the same spot: half a segment and half the gap each way.
    expect(apart(at(0, 0), 0.5, -10, 10)).toEqual([-0.75, 0.75]);
    // A third beside them joins the run, which is centred on the three.
    const three = apart(at(0, 0, 1), 0.5, -10, 10);
    expect(three[1]! - three[0]!).toBeCloseTo(1.5);
    expect(three[2]! - three[1]!).toBeCloseTo(1.5);
    expect((three[0]! + three[1]! + three[2]!) / 3).toBeCloseTo(1 / 3);
    // One far from them stays where it is.
    expect(apart(at(0, 0, 8), 0.5, -10, 10)[2]).toBe(8);
    // Of different widths, each keeps its own.
    const mixed = apart(
      [
        { x: 0, width: 2 },
        { x: 0.1, width: 1 },
      ],
      0,
      -10,
      10,
    );
    expect(mixed[1]! - mixed[0]!).toBeCloseTo(1.5);
  });

  it('keeps a run between the bounds while it fits, and centres one that does not', () => {
    // Pushed against the left bound: the run starts on it.
    expect(apart(at(-9.9, -9.9), 0.5, -10, 10)).toEqual([-9.5, -8]);
    expect(apart(at(9.9, 9.9), 0.5, -10, 10)).toEqual([8, 9.5]);
    // Four segments in a room for two.
    const tight = apart(at(0, 0, 0, 0), 0, -1, 1);
    expect(tight).toEqual([-1.5, -0.5, 0.5, 1.5]);
  });
});

describe('routePaths', () => {
  it('draws a line from each source to the junction and from the junction to each target', () => {
    const route: LinkRoute = {
      junction: [1, 0],
      badge: [1, 0],
      starts: [
        [0, 2],
        [2, 2],
      ],
      ends: [[1.5, -2]],
    };
    expect(routePaths(route)).toEqual(['M0 2 Q0 0 1 0', 'M2 2 Q2 0 1 0', 'M1 0 Q1.5 0 1.5 -2']);
  });
});
