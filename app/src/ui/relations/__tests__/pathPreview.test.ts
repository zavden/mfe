// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pathPreviewPoints } from '../pathPreview';

describe('pathPreviewPoints', () => {
  it('is the chord for a pair without a path on a straight relation, and for the chord itself', () => {
    expect(pathPreviewPoints({}, 0)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    const chord = {
      nodes: [
        { at: [0, 0] as [number, number], in: null, out: null, smooth: false },
        { at: [1, 0] as [number, number], in: null, out: null, smooth: false },
      ],
    };
    expect(pathPreviewPoints({ path: chord }, 45)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('swings under the chord for a positive arc (counter-clockwise), over it for a negative one', () => {
    const points = pathPreviewPoints({}, 90, 8);
    expect(points).toHaveLength(9);
    expect(points[0]![0]).toBeCloseTo(0, 9);
    expect(points[8]![0]).toBeCloseTo(1, 9);
    expect(points[4]![1]).toBeLessThan(-0.1);
    expect(pathPreviewPoints({}, -90, 8)[4]![1]).toBeGreaterThan(0.1);
  });

  it('samples a custom path by arc length', () => {
    const bump = {
      nodes: [
        {
          at: [0, 0] as [number, number],
          in: null,
          out: [0.3, 0.4] as [number, number],
          smooth: false,
        },
        {
          at: [1, 0] as [number, number],
          in: [0.7, 0.4] as [number, number],
          out: null,
          smooth: false,
        },
      ],
    };
    const points = pathPreviewPoints({ path: bump }, 90, 4);
    expect(points).toHaveLength(5);
    expect(points[2]![0]).toBeCloseTo(0.5, 2);
    expect(points[2]![1]).toBeGreaterThan(0.25);
  });
});
