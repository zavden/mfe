// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box, Vec2 } from '../../../geom';
import type { ClipId } from '../../../model';
import {
  groupBox,
  groupOrientedBox,
  minGroupFactor,
  rotatedPlacements,
  scaledPlacements,
  type GroupMember,
} from '../groupTransform';
import { MIN_SCALE } from '../handles';

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
  minX,
  minY,
  maxX,
  maxY,
});

const member = (
  clipId: ClipId,
  startPosition: Vec2,
  startScale = 1,
  startRotation = 0,
): GroupMember => ({ clipId, startPosition, startScale, startRotation });

const near = (a: Vec2, b: Vec2, digits = 9) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};

describe('groupBox', () => {
  const boxes = new Map<ClipId, Box>([
    ['a', box(-3, -1, -1, 1)],
    ['b', box(1, -2, 3, 0)],
    ['c', box(0, 2, 1, 3)],
  ]);

  it('is the union of the boxes of the given clips', () => {
    expect(groupBox(boxes, ['a', 'b'])).toEqual(box(-3, -2, 3, 1));
    expect(groupBox(boxes, ['c', 'a', 'b'])).toEqual(box(-3, -2, 3, 3));
    expect(groupBox(boxes, ['b'])).toEqual(box(1, -2, 3, 0));
  });

  it('ignores the clips it has no box for', () => {
    expect(groupBox(boxes, ['a', 'missing', 'c'])).toEqual(box(-3, -1, 1, 3));
  });

  it('is null when it knows none of them, or none are given', () => {
    expect(groupBox(boxes, ['missing', 'gone'])).toBeNull();
    expect(groupBox(boxes, [])).toBeNull();
    expect(groupBox(new Map(), ['a'])).toBeNull();
  });
});

describe('groupOrientedBox', () => {
  it('is upright, centred on the box, with half its width and height', () => {
    expect(groupOrientedBox(box(-3, -2, 5, 1))).toEqual({
      center: [1, -0.5],
      rotation: 0,
      halfWidth: 4,
      halfHeight: 1.5,
    });
  });

  it('is a point box for a degenerate box', () => {
    expect(groupOrientedBox(box(2, 3, 2, 3))).toEqual({
      center: [2, 3],
      rotation: 0,
      halfWidth: 0,
      halfHeight: 0,
    });
  });
});

describe('minGroupFactor', () => {
  it('is MIN_SCALE over the smallest start scale', () => {
    const members = [member('a', [0, 0], 2), member('b', [1, 1], 0.5), member('c', [2, 2], 1)];
    expect(minGroupFactor(members)).toBeCloseTo(MIN_SCALE / 0.5, 12);
    expect(minGroupFactor([member('a', [0, 0], 1)])).toBe(MIN_SCALE);
  });

  it('keeps every member at the minimum or above once applied', () => {
    const members = [member('a', [0, 0], 0.3), member('b', [1, 1], 4)];
    const k = minGroupFactor(members);
    for (const { scale } of scaledPlacements(members, [0, 0], k)) {
      expect(scale).toBeGreaterThanOrEqual(MIN_SCALE);
    }
    expect(scaledPlacements(members, [0, 0], k)[0]!.scale).toBe(MIN_SCALE);
  });

  it('is above 1 when a member already starts below the minimum', () => {
    expect(minGroupFactor([member('a', [0, 0], 0.025), member('b', [0, 0], 1)])).toBeCloseTo(2, 12);
  });

  it('takes a custom minimum', () => {
    expect(minGroupFactor([member('a', [0, 0], 0.5)], 0.2)).toBeCloseTo(0.4, 12);
  });

  it('is 1 for no members', () => {
    expect(minGroupFactor([])).toBe(1);
  });

  it('leaves out members whose scale is not positive', () => {
    expect(minGroupFactor([member('a', [0, 0], 0), member('b', [0, 0], 0.5)])).toBeCloseTo(0.1, 12);
    expect(minGroupFactor([member('a', [0, 0], 0)])).toBe(1);
  });
});

describe('scaledPlacements', () => {
  const center: Vec2 = [1, 1];
  const members = [
    member('a', [3, 1], 1.5, 30),
    member('b', [1, -2], 0.5),
    member('c', [1, 1], 2), // on the centre
  ];

  it('is the identity at k = 1', () => {
    expect(scaledPlacements(members, center, 1)).toEqual([
      { clipId: 'a', position: [3, 1], scale: 1.5 },
      { clipId: 'b', position: [1, -2], scale: 0.5 },
      { clipId: 'c', position: [1, 1], scale: 2 },
    ]);
  });

  it('doubles the distances to the centre and the scales at k = 2', () => {
    expect(scaledPlacements(members, center, 2)).toEqual([
      { clipId: 'a', position: [5, 1], scale: 3 },
      { clipId: 'b', position: [1, -5], scale: 1 },
      { clipId: 'c', position: [1, 1], scale: 4 },
    ]);
  });

  it('halves them at k = 0.5, and keeps a member on the centre in place', () => {
    expect(scaledPlacements(members, center, 0.5)).toEqual([
      { clipId: 'a', position: [2, 1], scale: 0.75 },
      { clipId: 'b', position: [1, -0.5], scale: 0.25 },
      { clipId: 'c', position: [1, 1], scale: 1 },
    ]);
  });

  it('keeps the members in their order and touches neither rotation nor the inputs', () => {
    const before = JSON.stringify(members);
    const result = scaledPlacements(members, center, 3);
    expect(result.map((p) => p.clipId)).toEqual(['a', 'b', 'c']);
    expect(result[0]).not.toHaveProperty('rotation');
    expect(JSON.stringify(members)).toBe(before);
  });

  it('rounds positions and scales with round6', () => {
    const [p] = scaledPlacements([member('a', [0.1, 0.7], 0.1)], [0, 0], 3);
    // 0.1·3 is 0.30000000000000004 and 0.7·3 is 2.0999999999999996 in floats.
    expect(p).toEqual({ clipId: 'a', position: [0.3, 2.1], scale: 0.3 });
    const [q] = scaledPlacements([member('a', [1, 0], 1)], [0, 0], 1 / 3);
    expect(q!.position).toEqual([0.333333, 0]);
    expect(q!.scale).toBe(0.333333);
  });

  it('is empty for no members', () => {
    expect(scaledPlacements([], [0, 0], 2)).toEqual([]);
  });
});

describe('rotatedPlacements', () => {
  it('sends [1, 0] to [0, 1] when turning 90° about the origin', () => {
    const [p] = rotatedPlacements([member('a', [1, 0])], [0, 0], 90);
    near(p!.position, [0, 1]);
    expect(p!.rotation).toBe(90);
  });

  it('turns counter-clockwise about any centre', () => {
    const [p, q] = rotatedPlacements(
      [member('a', [3, 1]), member('b', [1, 2])],
      [1, 1], // a is 2 to the right of the centre, b 1 above it
      90,
    );
    near(p!.position, [1, 3]);
    near(q!.position, [0, 1]);
    const [r] = rotatedPlacements([member('a', [3, 1])], [1, 1], -90);
    near(r!.position, [1, -1]);
  });

  it('only turns a member on the centre', () => {
    const [p] = rotatedPlacements([member('a', [1, 1], 2, 10)], [1, 1], 45);
    expect(p).toEqual({ clipId: 'a', position: [1, 1], rotation: 55 });
  });

  it('adds the angle to each start rotation', () => {
    const turned = rotatedPlacements(
      [member('a', [0, 0], 1, 30), member('b', [2, 0], 1, -15), member('c', [0, 2], 1, 400)],
      [1, 1],
      20,
    );
    expect(turned.map((p) => p.rotation)).toEqual([50, 5, 420]);
    expect(turned.map((p) => p.clipId)).toEqual(['a', 'b', 'c']);
  });

  it('is the identity at 0°, and back in place after 360°', () => {
    const members = [member('a', [2.5, -1.25], 1, 12), member('b', [-3, 4], 0.5, 0)];
    expect(rotatedPlacements(members, [1, 1], 0)).toEqual([
      { clipId: 'a', position: [2.5, -1.25], rotation: 12 },
      { clipId: 'b', position: [-3, 4], rotation: 0 },
    ]);
    const full = rotatedPlacements(members, [1, 1], 360);
    near(full[0]!.position, [2.5, -1.25]);
    near(full[1]!.position, [-3, 4]);
    expect(full.map((p) => p.rotation)).toEqual([372, 360]);
  });

  it('rounds with round6, without -0', () => {
    // At 90° the cosine is 6.1e-17, not 0: the rounding removes it.
    const [p] = rotatedPlacements([member('a', [1, 0])], [0, 0], 90);
    expect(p!.position).toEqual([0, 1]);
    const [q] = rotatedPlacements([member('a', [-1, 0])], [0, 0], 90);
    expect(Object.is(q!.position[0], 0)).toBe(true); // -6.1e-17 → 0, not -0
    expect(q!.position[1]).toBe(-1);
    const [r] = rotatedPlacements([member('a', [1, 0], 1, 0.1)], [0, 0], 0.2);
    expect(r!.rotation).toBe(0.3); // 0.1 + 0.2 is 0.30000000000000004
  });

  it('is empty for no members', () => {
    expect(rotatedPlacements([], [0, 0], 90)).toEqual([]);
  });
});
