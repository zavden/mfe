// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import {
  shiftBox,
  snapBox,
  snapSize,
  type LineGuide,
  type SnapGuide,
  type SnapTargets,
} from '../snap';

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
  minX,
  minY,
  maxX,
  maxY,
});

const frame = box(-7, -4, 7, 4);
const only = (...boxes: Box[]): SnapTargets => ({ boxes, frame: null });
/** The coordinate of a line guide. */
const lineAt = (g: SnapGuide | undefined) => (g as LineGuide).at;

describe('snapBox', () => {
  it('does not snap without targets or when everything is out of range', () => {
    const moving = box(1, 1, 2, 2);
    expect(snapBox(moving, only(), 0.5)).toEqual({ dx: 0, dy: 0, guides: [] });
    expect(snapBox(moving, only(box(5, 5, 6, 6)), 0.5)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('snaps left to left', () => {
    // Target x in [0, 3]; moving min 0.1 -> 0. Centres 1.5 vs 0.6, max 3 vs 1.1: left wins.
    const r = snapBox(box(0.1, 5, 1.1, 6), only(box(0, 0, 3, 1)), 0.2);
    expect(r.dx).toBeCloseTo(-0.1, 9);
    expect(r.dy).toBe(0);
    expect(r.guides).toHaveLength(1);
    expect(r.guides[0]).toMatchObject({ axis: 'x', at: 0 });
  });

  it('snaps right to right', () => {
    const r = snapBox(box(1.9, 5, 2.9, 6), only(box(-4, 0, 3, 1)), 0.2);
    expect(r.dx).toBeCloseTo(0.1, 9);
    expect(r.guides[0]).toMatchObject({ axis: 'x', at: 3 });
  });

  it('snaps centre to centre', () => {
    const r = snapBox(box(0.9, 5, 3.1, 6), only(box(0, 0, 4, 1)), 0.2);
    expect(r.dx).toBeCloseTo(0, 9);
    expect(r.guides[0]).toMatchObject({ axis: 'x', at: 2 });
    // Off by 0.1: centre 2.1 vs 2.
    const r2 = snapBox(box(1, 5, 3.2, 6), only(box(0, 0, 4, 1)), 0.2);
    expect(r2.dx).toBeCloseTo(-0.1, 9);
  });

  it('snaps left to right (abutting) and top to bottom', () => {
    const target = box(0, 0, 2, 1);
    const left = snapBox(box(2.1, 5, 3.1, 6), only(target), 0.2);
    expect(left.dx).toBeCloseTo(-0.1, 9);
    expect(left.guides[0]).toMatchObject({ axis: 'x', at: 2 });
    // Moving is above the target: its bottom (1.08) goes to the target's top (1).
    const top = snapBox(box(10, 1.08, 11, 2), only(target), 0.2);
    expect(top.dy).toBeCloseTo(-0.08, 9);
    expect(top.dx).toBe(0);
    expect(top.guides[0]).toMatchObject({ axis: 'y', at: 1 });
  });

  it('snaps within the threshold and not beyond it', () => {
    const target = only(box(0, 0, 4, 1));
    expect(snapBox(box(0.5, 5, 0.7, 6), target, 0.5).dx).toBeCloseTo(-0.5, 9);
    expect(snapBox(box(0.5, 5, 0.7, 6), target, 0.49).guides).toEqual([]);
    expect(snapBox(box(0.5, 5, 0.7, 6), target, 0.49).dx).toBe(0);
    expect(snapBox(box(0.51, 5, 0.71, 6), target, 0.5)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('snaps one axis while the other stays free', () => {
    const target = only(box(0, 0, 4, 1));
    const r = snapBox(box(0.1, 20, 1, 21), target, 0.2);
    expect(r.dx).toBeCloseTo(-0.1, 9);
    expect(r.dy).toBe(0);
    expect(r.guides.map((g) => g.axis)).toEqual(['x']);
    const s = snapBox(box(20, -0.1, 21, 0.9), target, 0.2);
    expect(s.dx).toBe(0);
    expect(s.dy).toBeCloseTo(0.1, 9);
    expect(s.guides.map((g) => g.axis)).toEqual(['y']);
  });

  it('snaps both axes and returns the x guide before the y guide', () => {
    const r = snapBox(box(0.1, 1.05, 1, 2), only(box(0, 0, 4, 1)), 0.2);
    expect(r.dx).toBeCloseTo(-0.1, 9);
    expect(r.dy).toBeCloseTo(-0.05, 9);
    expect(r.guides.map((g) => g.axis)).toEqual(['x', 'y']);
  });

  it('picks the nearest pairing', () => {
    // Left of moving is 0.15 from the first target's left and 0.05 from the second's.
    const r = snapBox(box(0.15, 5, 1, 6), only(box(0, 0, 9, 1), box(0.2, 2, 9, 3)), 0.5);
    expect(r.dx).toBeCloseTo(0.05, 9);
    expect(r.guides[0]).toMatchObject({ axis: 'x', at: 0.2 });
  });

  it('ties: a centre-to-centre pairing beats an edge pairing', () => {
    // Moving [0, 2] (centre 1). Target A: left edge at 0.3, 0.3 from moving's min. Target B
    // (later): centre at 1.3, 0.3 from moving's centre.
    const a = box(0.3, 10, 5, 11);
    const b = box(-3, 20, 5.6, 21);
    const r = snapBox(box(0, 5, 2, 6), only(a, b), 0.5);
    expect(r.dx).toBeCloseTo(0.3, 9);
    expect(lineAt(r.guides[0])).toBeCloseTo(1.3, 9);
    // Swapping the order changes nothing: the centre pairing wins either way.
    const swapped = snapBox(box(0, 5, 2, 6), only(b, a), 0.5);
    expect(lineAt(swapped.guides[0])).toBeCloseTo(1.3, 9);
  });

  it('ties: the earlier target wins', () => {
    // The targets' left edges are 0.25 to the right and to the left of the moving left edge.
    const first = box(0.25, 10, 50, 11);
    const second = box(-0.25, 20, 50, 21);
    const r = snapBox(box(0, 5, 4, 6), only(first, second), 0.5);
    expect(r.dx).toBeCloseTo(0.25, 9);
    const swapped = snapBox(box(0, 5, 4, 6), only(second, first), 0.5);
    expect(swapped.dx).toBeCloseTo(-0.25, 9);
  });

  it('ties: a box beats the frame', () => {
    // Moving max 6.75 is 0.25 from the box's left edge (6.5) and 0.25 from the frame edge (7).
    const moving = box(2, 0.5, 6.75, 1.5);
    const r = snapBox(moving, { boxes: [box(6.5, 2, 9, 3)], frame }, 0.5);
    expect(r.dx).toBeCloseTo(-0.25, 9);
    expect(lineAt(r.guides[0])).toBeCloseTo(6.5, 9);
  });

  it('snaps to the frame centre lines', () => {
    const r = snapBox(box(-1.1, -0.1, 1, 0.15), { boxes: [], frame }, 0.2);
    expect(r.dx).toBeCloseTo(0.05, 9);
    expect(r.dy).toBeCloseTo(-0.025, 9);
    expect(r.guides.map((g) => [g.axis, lineAt(g)])).toEqual([
      ['x', 0],
      ['y', 0],
    ]);
  });

  it('snaps to a frame edge', () => {
    const r = snapBox(box(5.9, 0, 6.9, 1), { boxes: [], frame }, 0.2);
    expect(r.dx).toBeCloseTo(0.1, 9);
    expect(r.guides[0]).toMatchObject({ axis: 'x', at: 7 });
  });

  it('draws one long guide through every aligned box', () => {
    // Three boxes share the line x = 0 (left, centre and right edges); moving's left goes there.
    const a = box(0, 0, 2, 1);
    const b = box(-1, 3, 1, 4);
    const c = box(-2, -3, 0, -2);
    const far = box(10, 8, 11, 9);
    const r = snapBox(box(0.05, 5, 0.6, 6), only(a, b, c, far), 0.2);
    expect(r.dx).toBeCloseTo(-0.05, 9);
    expect(r.guides).toEqual([{ axis: 'x', at: 0, from: -3, to: 6 }]);
  });

  it('spans the whole frame with the guide of a frame line', () => {
    const r = snapBox(box(-0.5, 1, 0.55, 2), { boxes: [], frame }, 0.2);
    expect(r.dx).toBeCloseTo(-0.025, 9);
    expect(r.guides[0]).toEqual({ axis: 'x', at: 0, from: -4, to: 4 });
    // A horizontal frame edge spans the frame width.
    const bottom = snapBox(box(-1, -3.9, 1, -2), { boxes: [], frame }, 0.2);
    expect(bottom.dy).toBeCloseTo(-0.1, 9);
    expect(bottom.guides.find((g) => g.axis === 'y')).toEqual({
      axis: 'y',
      at: -4,
      from: -7,
      to: 7,
    });
  });

  it('along one axis alone (a drag held to it), leaves the other where it is, with no guide', () => {
    // Both axes are within reach of the target: left edges 0.1 apart, bottoms 0.05 apart.
    const moving = box(0.1, 1.05, 1, 2);
    const target = only(box(0, 0, 4, 1));
    const x = snapBox(moving, target, 0.2, 'x');
    expect(x.dx).toBeCloseTo(-0.1, 9);
    expect(x.dy).toBe(0);
    // The guide runs along the box where it stays on y, not where a y snap would have put it.
    expect(x.guides).toEqual([{ axis: 'x', at: 0, from: 0, to: 2 }]);
    const y = snapBox(moving, target, 0.2, 'y');
    expect(y.dx).toBe(0);
    expect(y.dy).toBeCloseTo(-0.05, 9);
    expect(y.guides.map((g) => g.axis)).toEqual(['y']);
  });

  it('along one axis alone, takes no spacing across it either', () => {
    // Two boxes in a column with the moving one between them, 0.1 off the middle: a spacing
    // snap on y, which a drag held to x does not take (nothing lines up on x).
    const above = box(0, 4, 2, 5);
    const below = box(0, -5, 2, -4);
    const moving = box(0.3, -0.4, 0.7, 0.6);
    expect(snapBox(moving, only(above, below), 0.2).dy).toBeCloseTo(-0.1, 9);
    expect(snapBox(moving, only(above, below), 0.2, 'x')).toMatchObject({ dy: 0, guides: [] });
  });
});

describe('spacing guides', () => {
  // Two boxes in a row, 6 apart; the moving box is 2 wide and 1 tall, in the same row.
  const a = box(-5, -1, -3, 1);
  const b = box(3, -1, 5, 1);

  it('puts the moving box as far from one box as from the other, the two gaps as spans', () => {
    // A gap of 2 each side: the box starts at -1. It is 0.3 to the right of that.
    const r = snapBox(box(-0.7, -0.5, 1.3, 0.5), only(a, b), 0.5);
    expect(r.dx).toBeCloseTo(-0.3, 9);
    expect(r.dy).toBe(0);
    expect(r.guides).toEqual([
      { axis: 'y', at: 0, from: -5, to: 5 },
      {
        kind: 'span',
        axis: 'x',
        spans: [
          { from: -3, to: -1, at: -0.5 },
          { from: 1, to: 3, at: -0.5 },
        ],
      },
    ]);
  });

  it('repeats the gap two neighbours keep, after them or before them', () => {
    // After b the box starts at 11 (0.4 away); before a it ends at -11 (0.3 away).
    const after = snapBox(box(10.6, -0.5, 12.6, 0.5), only(a, b), 0.5);
    expect(after.dx).toBeCloseTo(0.4, 9);
    expect(after.guides[1]).toEqual({
      kind: 'span',
      axis: 'x',
      spans: [
        { from: -3, to: 3, at: -0.5 },
        { from: 5, to: 11, at: -0.5 },
      ],
    });
    const before = snapBox(box(-13.3, -0.5, -11.3, 0.5), only(a, b), 0.5);
    expect(before.dx).toBeCloseTo(0.3, 9);
    expect(before.guides[1]).toEqual({
      kind: 'span',
      axis: 'x',
      spans: [
        { from: -11, to: -5, at: -0.5 },
        { from: -3, to: 3, at: -0.5 },
      ],
    });
  });

  it('works down a column too, with the spans at the right of what the boxes share', () => {
    const top = box(-1, 3, 1, 5);
    const bottom = box(-1.5, -5, 0.5, -3);
    // 6 free units between them, the box 1 tall: 2.5 each side, so it spans -0.5 … 0.5.
    const r = snapBox(box(-1, -0.7, 0, 0.3), only(top, bottom), 0.5);
    expect(r.dy).toBeCloseTo(0.2, 9);
    expect(r.guides.at(-1)).toEqual({
      kind: 'span',
      axis: 'y',
      spans: [
        { from: -3, to: -0.5, at: 0 },
        { from: 0.5, to: 3, at: 0 },
      ],
    });
  });

  it('yields to an edge or centre on that axis, keeps to the threshold and to the row', () => {
    // The left edge 0.2 from b's: the edge pairing wins and no span is drawn.
    const edge = snapBox(box(2.8, -0.5, 4.8, 0.5), only(a, b), 0.5);
    expect(edge.guides.some((g) => g.kind === 'span')).toBe(false);
    // 0.6 from the spot, with a threshold of 0.5: nothing on x (the y centres still pair).
    const far = snapBox(box(-0.4, -0.5, 1.6, 0.5), only(a, b), 0.5);
    expect(far.dx).toBe(0);
    expect(far.guides).toHaveLength(1);
    // Another row: the boxes do not count.
    const high = snapBox(box(-0.7, 3, 1.3, 4), only(a, b), 0.5);
    expect(high).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});

describe('snapSize', () => {
  // A 2 × 1 box about its centre (0, 0); targets 3 wide / 1 tall and 1 wide / 1.5 tall.
  const moving = box(-1, -0.5, 1, 0.5);
  const wide = box(4, 2, 7, 3);
  const tall = box(-6, -3, -5, -1.5);

  it('sticks the width to another box, with the two widths as spans below each box', () => {
    // At a factor of 1.45 the box is 2.9 wide, 0.1 short of 3: it snaps to 1.5.
    const r = snapSize(moving, [0, 0], 1.45, [wide], 0.2)!;
    expect(r.factor).toBeCloseTo(1.5, 9);
    expect(r.guides).toEqual([
      {
        kind: 'span',
        axis: 'x',
        spans: [
          { from: -1.5, to: 1.5, at: -0.75 },
          { from: 4, to: 7, at: 2 },
        ],
      },
    ]);
  });

  it('sticks the height too, the spans right of each box; the nearer size wins', () => {
    // At 1.45 the height is 1.45 (0.05 from tall's 1.5) and the width 2.9 (0.1 from wide's 3).
    const r = snapSize(moving, [0, 0], 1.45, [wide, tall], 0.2)!;
    expect(r.factor).toBeCloseTo(1.5, 9);
    expect(r.guides).toEqual([
      {
        kind: 'span',
        axis: 'y',
        spans: [
          { from: -0.75, to: 0.75, at: 1.5 },
          { from: -3, to: -1.5, at: -5 },
        ],
      },
    ]);
  });

  it('scales about the given centre and keeps to the threshold', () => {
    const r = snapSize(box(0, 0, 2, 1), [0, 0], 1.45, [wide], 0.2)!;
    expect(r.guides[0]!.spans[0]).toEqual({ from: 0, to: 3, at: 0 });
    // At 1.25 the nearest size is 0.25 away (the heights of both): nothing within 0.2.
    expect(snapSize(moving, [0, 0], 1.25, [wide, tall], 0.2)).toBeNull();
    expect(snapSize(box(0, 0, 0, 0), [0, 0], 1, [wide], 0.2)).toBeNull();
  });
});

describe('shiftBox', () => {
  it('moves the box by (dx, dy) without touching the input', () => {
    const b = box(0, 1, 2, 3);
    expect(shiftBox(b, 1.5, -2)).toEqual(box(1.5, -1, 3.5, 1));
    expect(b).toEqual(box(0, 1, 2, 3));
  });
});
