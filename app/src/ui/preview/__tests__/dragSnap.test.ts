import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import { dragSnapOf, dragTravel, snappedTravel, type TravelRules } from '../dragSnap';

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
  minX,
  minY,
  maxX,
  maxY,
});
const frame = box(-7, -4, 7, 4);

describe('dragSnapOf', () => {
  const boxes = new Map([
    ['a', box(-3, -1, -1, 1)],
    ['b', box(1, -1, 3, 1)],
    ['c', box(0, 2, 1, 3)],
  ]);

  it('moves the union of the dragged clips and targets the others and the frame', () => {
    const snap = dragSnapOf(boxes, ['a', 'c'], frame);
    expect(snap).toEqual({
      moving: box(-3, -1, 1, 3),
      targets: { boxes: [box(1, -1, 3, 1)], frame },
    });
  });

  it('moves the part box instead when a part is dragged', () => {
    const part = box(-2.5, -0.5, -2, 0.5);
    expect(dragSnapOf(boxes, ['a'], null, part)).toEqual({
      moving: part,
      targets: { boxes: [box(1, -1, 3, 1), box(0, 2, 1, 3)], frame: null },
    });
  });

  it('is null when the dragged clip has no box yet', () => {
    expect(dragSnapOf(boxes, ['zzz'], frame)).toBeNull();
  });
});

describe('snappedTravel', () => {
  const snap = {
    moving: box(-3, -1, -1, 1),
    targets: { boxes: [box(1, -1, 3.5, 1)], frame: null },
  };

  it('corrects the travel so that the moving box sticks, and reports the guide', () => {
    // Travelling by 3.9 puts the moving box's left edge at 0.9: 0.1 short of the target's left
    // (its centre and right edge are further from the target's).
    const { travel, guides } = snappedTravel(snap, [3.9, 0.5], 0.2);
    expect(travel[0]).toBeCloseTo(4, 9);
    expect(travel[1]).toBeCloseTo(0.5, 9); // y stays: 0.5 off the target's centre is too far
    expect(guides).toHaveLength(1);
    expect(guides[0]).toMatchObject({ axis: 'x', at: 1 });
  });

  it('leaves the travel alone far from any target', () => {
    const { travel, guides } = snappedTravel(snap, [10, 10], 0.2);
    expect(travel).toEqual([10, 10]);
    expect(guides).toEqual([]);
  });

  it('along one axis alone, leaves the other component as it is', () => {
    // At [3.9, 0.1] both axes are within reach: the left edge 0.1 short of 1, the centre 0.1
    // above the target's. Held to x, the y travel stays 0.1.
    const { travel, guides } = snappedTravel(snap, [3.9, 0.1], 0.2, 'x');
    expect(travel[0]).toBeCloseTo(4, 9);
    expect(travel[1]).toBe(0.1);
    expect(guides.map((g) => g.axis)).toEqual(['x']);
  });
});

describe('dragTravel', () => {
  // The moving box is 2 × 2 around (-2, 0.3); the target's left edge is at x = 1 and its centre
  // at y = 0, within reach of the moving box's centre (0.3 away, threshold 0.4).
  const snap = {
    moving: box(-3, -0.7, -1, 1.3),
    targets: { boxes: [box(1, -1, 3.5, 1)], frame: null },
  };
  const rules = (patch: Partial<TravelRules>): TravelRules => ({
    snap,
    objects: true,
    threshold: 0.4,
    grid: null,
    lock: false,
    ...patch,
  });

  it('free: snaps both axes, as a drag always did', () => {
    const { travel, guides, axis } = dragTravel([3.8, 0.05], rules({}));
    expect(travel[0]).toBeCloseTo(4, 9); // the left edge on the target's left edge
    expect(travel[1]).toBeCloseTo(-0.3, 9); // the centres level
    expect(guides.map((g) => g.axis)).toEqual(['x', 'y']);
    expect(axis).toBeNull();
  });

  it('held (Alt): along the axis the pointer went further, still snapping along it alone', () => {
    const { travel, guides, axis } = dragTravel([3.8, 0.05], rules({ lock: true }));
    expect(axis).toBe('x');
    expect(travel[0]).toBeCloseTo(4, 9);
    expect(travel[1]).toBe(0); // no y snap pulls the box off its line
    expect(guides.map((g) => g.axis)).toEqual(['x']);
  });

  it('held, with Ctrl/⌘ (no objects, no grid): along the axis, where the pointer is', () => {
    const free = rules({ lock: true, objects: false, grid: null });
    expect(dragTravel([3.8, 0.1], free)).toEqual({ travel: [3.8, 0], guides: [], axis: 'x' });
    expect(dragTravel([0.1, -2.5], free)).toEqual({ travel: [0, -2.5], guides: [], axis: 'y' });
  });

  it('held: the axis is chosen again as the pointer goes on, from where the drag began', () => {
    expect(dragTravel([0.5, 0.6], rules({ lock: true, objects: false })).travel).toEqual([0, 0.6]);
    expect(dragTravel([0.7, 0.6], rules({ lock: true, objects: false })).travel).toEqual([0.7, 0]);
  });

  it('held: the grid holds the free axis and never the held one', () => {
    // The box's centre starts at (-2, 0.3): off the grid on y. Free, the grid takes y to 0.
    const grid = { step: 1, anchor: 'center' as const };
    const free = dragTravel([1.2, 0.05], rules({ objects: false, grid }));
    expect(free.travel[0]).toBeCloseTo(1, 9);
    expect(free.travel[1]).toBeCloseTo(-0.3, 9);
    const held = dragTravel([1.2, 0.05], rules({ objects: false, grid, lock: true }));
    expect(held.travel[0]).toBeCloseTo(1, 9);
    expect(held.travel[1]).toBe(0);
    // Held to y, the box's centre lands on the grid's y = 1 and keeps its x.
    const up = dragTravel([0.2, 0.6], rules({ objects: false, grid, lock: true }));
    expect(up.axis).toBe('y');
    expect(up.travel[0]).toBe(0);
    expect(up.travel[1]).toBeCloseTo(0.7, 9);
  });

  it('nothing to snap with (no boxes yet): the pointer travel, held or not', () => {
    expect(dragTravel([1.5, 0.2], rules({ snap: null }))).toEqual({
      travel: [1.5, 0.2],
      guides: [],
      axis: null,
    });
    expect(dragTravel([1.5, 0.2], rules({ snap: null, lock: true })).travel).toEqual([1.5, 0]);
  });
});
