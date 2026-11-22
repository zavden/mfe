// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import type { Vec2 } from '../../../model';
import { alignDeltas, distributeDeltas, edgeOf, type AlignItem } from '../align';

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
  minX,
  minY,
  maxX,
  maxY,
});

const entries = (map: Map<string, Vec2>) => Object.fromEntries(map);

const expectDeltas = (actual: Map<string, Vec2>, expected: Record<string, Vec2>) => {
  expect([...actual.keys()].sort()).toEqual(Object.keys(expected).sort());
  for (const [id, [dx, dy]] of Object.entries(expected)) {
    expect(actual.get(id)![0]).toBeCloseTo(dx, 9);
    expect(actual.get(id)![1]).toBeCloseTo(dy, 9);
  }
};

describe('edgeOf', () => {
  const b = box(-2, 1, 4, 5);
  it('reads each edge and centre line', () => {
    expect(edgeOf(b, 'left')).toBe(-2);
    expect(edgeOf(b, 'centerX')).toBe(1);
    expect(edgeOf(b, 'right')).toBe(4);
    expect(edgeOf(b, 'top')).toBe(5);
    expect(edgeOf(b, 'middle')).toBe(3);
    expect(edgeOf(b, 'bottom')).toBe(1);
  });
});

describe('alignDeltas', () => {
  // The union is x -2..4 (centre 1) and y -1..4 (centre 1.5).
  const items: AlignItem[] = [
    { id: 'a', box: box(0, 0, 2, 1) },
    { id: 'b', box: box(3, -1, 4, 3) },
    { id: 'c', box: box(-2, 2, 0, 4) },
  ];

  it('aligns to the leftmost edge', () => {
    expectDeltas(alignDeltas(items, 'left'), { a: [-2, 0], b: [-5, 0] });
  });

  it('aligns to the rightmost edge', () => {
    expectDeltas(alignDeltas(items, 'right'), { a: [2, 0], c: [4, 0] });
  });

  it('aligns centres to the centre of the enclosing box', () => {
    expectDeltas(alignDeltas(items, 'centerX'), { b: [-2.5, 0], c: [2, 0] });
  });

  it('aligns to the top edge', () => {
    expectDeltas(alignDeltas(items, 'top'), { a: [0, 3], b: [0, 1] });
  });

  it('aligns to the bottom edge', () => {
    expectDeltas(alignDeltas(items, 'bottom'), { a: [0, -1], c: [0, -3] });
  });

  it('aligns middles to the middle of the enclosing box', () => {
    expectDeltas(alignDeltas(items, 'middle'), { a: [0, 1], b: [0, 0.5], c: [0, -1.5] });
  });

  it('leaves out items that are already aligned', () => {
    const aligned: AlignItem[] = [
      { id: 'a', box: box(0, 0, 2, 1) },
      { id: 'b', box: box(0, 3, 5, 4) },
    ];
    expect(alignDeltas(aligned, 'left').size).toBe(0);
    expect(entries(alignDeltas(aligned, 'right'))).toEqual({ a: [3, 0] });
  });

  it('moves a single item to the frame edge or centre', () => {
    const frame = box(-64 / 9, -4, 64 / 9, 4);
    const one: AlignItem[] = [{ id: 'a', box: box(0, 0, 2, 1) }];
    expectDeltas(alignDeltas(one, 'left', frame), { a: [-64 / 9, 0] });
    expectDeltas(alignDeltas(one, 'right', frame), { a: [64 / 9 - 2, 0] });
    expectDeltas(alignDeltas(one, 'centerX', frame), { a: [-1, 0] });
    expectDeltas(alignDeltas(one, 'top', frame), { a: [0, 3] });
    expectDeltas(alignDeltas(one, 'bottom', frame), { a: [0, -4] });
    expectDeltas(alignDeltas(one, 'middle', frame), { a: [0, -0.5] });
  });

  it('aligns several items to the reference, leaving out those already on it', () => {
    expectDeltas(alignDeltas(items, 'top', box(-9, -4, 9, 4)), {
      a: [0, 3],
      b: [0, 1],
    });
  });

  it('does not move one item without a reference', () => {
    const one: AlignItem[] = [{ id: 'a', box: box(0, 0, 2, 1) }];
    expect(alignDeltas(one, 'left').size).toBe(0);
    expect(alignDeltas(one, 'middle', null).size).toBe(0);
  });

  it('does nothing for no items', () => {
    expect(alignDeltas([], 'left').size).toBe(0);
    expect(alignDeltas([], 'left', box(-1, -1, 1, 1)).size).toBe(0);
  });
});

describe('distributeDeltas', () => {
  it('spaces three boxes with equal gaps along x', () => {
    // Sizes 2 + 1 + 3 = 6 in a span of 11: both gaps are 2.5, so b starts at 4.5.
    const items: AlignItem[] = [
      { id: 'a', box: box(0, 0, 2, 1) },
      { id: 'b', box: box(5, 7, 6, 8) },
      { id: 'c', box: box(8, 0, 11, 1) },
    ];
    expectDeltas(distributeDeltas(items, 'x'), { b: [-0.5, 0] });
  });

  it('spaces four boxes of different sizes along x', () => {
    // Sizes 2 + 0.5 + 3 + 1 = 6.5 in a span of 9: each gap is 2.5 / 3.
    const gap = 2.5 / 3;
    const items: AlignItem[] = [
      { id: 'a', box: box(0, 0, 2, 1) },
      { id: 'b', box: box(3, 0, 3.5, 1) },
      { id: 'c', box: box(4, 0, 7, 1) },
      { id: 'd', box: box(8, 0, 9, 1) },
    ];
    expectDeltas(distributeDeltas(items, 'x'), {
      b: [2 + gap - 3, 0],
      c: [2 + gap + 0.5 + gap - 4, 0],
    });
  });

  it('spaces boxes along y with deltas on y only', () => {
    // Sizes 1 + 2 + 1 + 4 = 8 in a span of 14: each gap is 2.
    const items: AlignItem[] = [
      { id: 'a', box: box(0, -7, 1, -6) },
      { id: 'b', box: box(5, -3, 6, -1) },
      { id: 'c', box: box(2, 0, 3, 1) },
      { id: 'd', box: box(9, 3, 10, 7) },
    ];
    // Bottom to top: a -7..-6, b starts at -4 (was -3), c starts at 0 (was 0), d fixed.
    expectDeltas(distributeDeltas(items, 'y'), { b: [0, -1] });
  });

  it('gives negative gaps when the boxes overlap', () => {
    // Sizes 4 + 1 + 6 = 11 in a span of 9: the gaps are -1, so b starts at 3 (was 2).
    const items: AlignItem[] = [
      { id: 'a', box: box(0, 0, 4, 1) },
      { id: 'b', box: box(2, 0, 3, 1) },
      { id: 'c', box: box(3, 0, 9, 1) },
    ];
    expectDeltas(distributeDeltas(items, 'x'), { b: [1, 0] });
  });

  it('does nothing for fewer than three items', () => {
    const two: AlignItem[] = [
      { id: 'a', box: box(0, 0, 1, 1) },
      { id: 'b', box: box(5, 0, 6, 1) },
    ];
    expect(distributeDeltas(two, 'x').size).toBe(0);
    expect(distributeDeltas(two.slice(0, 1), 'y').size).toBe(0);
    expect(distributeDeltas([], 'x').size).toBe(0);
  });

  it('never moves the outer two and sorts by centre, not by id or input order', () => {
    const items: AlignItem[] = [
      { id: 'z', box: box(8, 0, 11, 1) },
      { id: 'a', box: box(0, 0, 2, 1) },
      { id: 'm', box: box(5, 0, 6, 1) },
    ];
    const deltas = distributeDeltas(items, 'x');
    expect(deltas.has('z')).toBe(false);
    expect(deltas.has('a')).toBe(false);
    expectDeltas(deltas, { m: [-0.5, 0] });
  });

  it('leaves out boxes that are already evenly spaced', () => {
    const items: AlignItem[] = [
      { id: 'a', box: box(0, 0, 1, 1) },
      { id: 'b', box: box(2, 0, 3, 1) },
      { id: 'c', box: box(4, 0, 5, 1) },
    ];
    expect(distributeDeltas(items, 'x').size).toBe(0);
  });
});
