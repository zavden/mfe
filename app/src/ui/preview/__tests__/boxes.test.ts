// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import { enclosingBox, formulaBoxAt, frameBox, sceneFrameBox } from '../boxes';
import type { BoxPlacement } from '../handles';

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
  minX,
  minY,
  maxX,
  maxY,
});

const expectBox = (actual: Box, expected: Box) => {
  expect(actual.minX).toBeCloseTo(expected.minX, 9);
  expect(actual.minY).toBeCloseTo(expected.minY, 9);
  expect(actual.maxX).toBeCloseTo(expected.maxX, 9);
  expect(actual.maxY).toBeCloseTo(expected.maxY, 9);
};

const upright: BoxPlacement = {
  position: [0, 0],
  rotation: 0,
  scale: 1,
  flipX: false,
  flipY: false,
};

describe('enclosingBox', () => {
  it('is exactly the unrotated box at 0 degrees', () => {
    expect(enclosingBox({ center: [1, 2], rotation: 0, halfWidth: 3, halfHeight: 0.5 })).toEqual(
      box(-2, 1.5, 4, 2.5),
    );
  });

  it('swaps width and height at 90 degrees', () => {
    expectBox(
      enclosingBox({ center: [0, 0], rotation: 90, halfWidth: 3, halfHeight: 1 }),
      box(-1, -3, 1, 3),
    );
  });

  it('turns a square of side 2 into side 2*sqrt(2) at 45 degrees', () => {
    const half = Math.SQRT2;
    expectBox(
      enclosingBox({ center: [0, 0], rotation: 45, halfWidth: 1, halfHeight: 1 }),
      box(-half, -half, half, half),
    );
  });

  it('keeps the centre when it is away from the origin', () => {
    expectBox(
      enclosingBox({ center: [5, -2], rotation: 90, halfWidth: 2, halfHeight: 1 }),
      box(4, -4, 6, 0),
    );
  });

  it('treats a negative rotation like its positive twin', () => {
    expectBox(
      enclosingBox({ center: [0, 0], rotation: -90, halfWidth: 3, halfHeight: 1 }),
      box(-1, -3, 1, 3),
    );
  });
});

describe('formulaBoxAt', () => {
  const local = box(-2, -0.5, 2, 0.5);

  it('is the local box moved to the position when nothing else is set', () => {
    expectBox(formulaBoxAt(local, { ...upright, position: [1, 2] }), box(-1, 1.5, 3, 2.5));
  });

  it('scales the box about its centre', () => {
    expectBox(formulaBoxAt(local, { ...upright, position: [1, 0], scale: 2 }), box(-3, -1, 5, 1));
  });

  it('encloses the box turned by the rotation', () => {
    expectBox(formulaBoxAt(local, { ...upright, rotation: 90 }), box(-0.5, -2, 0.5, 2));
  });

  it('turns an off-centre local box about the position', () => {
    // Local centre (3, 0) turned 90 degrees about the position (1, 1) lands at (1, 4).
    expectBox(
      formulaBoxAt(box(2, -0.5, 4, 0.5), { ...upright, position: [1, 1], rotation: 90 }),
      box(0.5, 3, 1.5, 5),
    );
  });

  it('mirrors an off-centre local box about the position with a flip', () => {
    // Local centre (3, 1): flipX puts it at x = -3, flipY at y = -1.
    const off = box(2, 0.5, 4, 1.5);
    expectBox(formulaBoxAt(off, { ...upright, flipX: true }), box(-4, 0.5, -2, 1.5));
    expectBox(formulaBoxAt(off, { ...upright, flipY: true }), box(2, -1.5, 4, -0.5));
    expectBox(
      formulaBoxAt(off, { ...upright, position: [1, 0], flipX: true, flipY: true }),
      box(-3, -1.5, -1, -0.5),
    );
  });
});

describe('frameBox', () => {
  it('is 16:9 wide for 1920x1080', () => {
    const frame = frameBox({ width: 1920, height: 1080 });
    expect(frame.maxX).toBeCloseTo(7.1111111, 6);
    expect(frame.minX).toBeCloseTo(-7.1111111, 6);
    expect(frame.minY).toBe(-4);
    expect(frame.maxY).toBe(4);
  });

  it('is 8 by 8 for 1080x1080', () => {
    expect(frameBox({ width: 1080, height: 1080 })).toEqual(box(-4, -4, 4, 4));
  });
});

describe('sceneFrameBox', () => {
  const meta = { width: 1920, height: 1080, target: 'ce' as const };

  it('is Manim’s frame for a scene without a camera', () => {
    expect(sceneFrameBox({ meta }, 3)).toEqual(frameBox(meta));
  });

  it('is the camera’s frame at the instant, for a scene with one', () => {
    const camera = {
      initial: { center: [2, 1] as [number, number], height: 4 },
      targets: [],
      moves: [
        {
          id: 'n1',
          start: 1,
          duration: 2,
          easing: 'linear' as const,
          to: { kind: 'frame' as const, frame: { center: [6, -1] as [number, number], height: 2 } },
        },
      ],
    };
    // At rest in the frame of 0 s: 4 tall and 16:9 wide about (2, 1).
    const start = sceneFrameBox({ meta, camera }, 0);
    expect(start.minY).toBe(-1);
    expect(start.maxY).toBe(3);
    expect(start.minX).toBeCloseTo(2 - 32 / 9, 12);
    expect(start.maxX).toBeCloseTo(2 + 32 / 9, 12);
    // Half way of the move: half way between the two frames.
    const mid = sceneFrameBox({ meta, camera }, 2);
    expect((mid.minX + mid.maxX) / 2).toBeCloseTo(4, 12);
    expect((mid.minY + mid.maxY) / 2).toBeCloseTo(0, 12);
    expect(mid.maxY - mid.minY).toBeCloseTo(3, 12);
    // After it: where it arrived.
    expect(sceneFrameBox({ meta, camera }, 5)).toMatchObject({ minY: -2, maxY: 0 });
  });
});
