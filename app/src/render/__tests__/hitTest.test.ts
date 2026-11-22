// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { lineTo, rectContour, type Contour } from '../../geom';
import {
  containsPoint,
  distanceToContour,
  flattenContour,
  flattenPath,
  nearStroke,
} from '../hitTest';

/** A circle of radius r as four cubics, counter-clockwise from (r, 0). */
function circle(r: number, ccw = true): Contour {
  const k = 0.5522847498 * r;
  const c: Contour = [r, 0];
  const quarter = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
    c.push(x1, y1, x2, y2, x3, y3);
  if (ccw) {
    quarter(r, k, k, r, 0, r);
    quarter(-k, r, -r, k, -r, 0);
    quarter(-r, -k, -k, -r, 0, -r);
    quarter(k, -r, r, -k, r, 0);
  } else {
    quarter(r, -k, k, -r, 0, -r);
    quarter(-k, -r, -r, -k, -r, 0);
    quarter(-r, k, -k, r, 0, r);
    quarter(k, r, r, k, r, 0);
  }
  return c;
}

describe('hit testing', () => {
  const box = { minX: 0, minY: 0, maxX: 2, maxY: 1 };

  it('flattens cubics into a polyline with a bounding box', () => {
    const flat = flattenContour(rectContour(box));
    expect(flat.minX).toBeCloseTo(0);
    expect(flat.maxX).toBeCloseTo(2);
    expect(flat.points.length).toBeGreaterThan(8);
  });

  it('finds points inside a rectangle and rejects outside ones', () => {
    const flat = flattenPath({ contours: [rectContour(box)] });
    expect(containsPoint(flat, [1, 0.5])).toBe(true);
    expect(containsPoint(flat, [2.01, 0.5])).toBe(false);
    expect(containsPoint(flat, [1, -0.01])).toBe(false);
  });

  it('closes open subpaths implicitly, like fill()', () => {
    const open: Contour = [0, 0];
    lineTo(open, 2, 0);
    lineTo(open, 1, 2);
    expect(containsPoint(flattenPath({ contours: [open] }), [1, 0.5])).toBe(true);
  });

  it('treats a reversed inner contour as a hole (non-zero) and a same-direction one as filled', () => {
    const ring = flattenPath({ contours: [circle(2), circle(1, false)] });
    expect(containsPoint(ring, [0, 0])).toBe(false);
    expect(containsPoint(ring, [1.5, 0])).toBe(true);
    expect(containsPoint(ring, [2.5, 0])).toBe(false);

    const same = flattenPath({ contours: [circle(2), circle(1, true)] });
    expect(containsPoint(same, [0, 0], 'nonzero')).toBe(true);
    expect(containsPoint(same, [0, 0], 'evenodd')).toBe(false);
  });

  it('measures the distance to a stroke along its segments, open subpaths left open', () => {
    const open: Contour = [0, 0];
    lineTo(open, 2, 0);
    lineTo(open, 2, 1);
    const flat = flattenContour(open);
    expect(distanceToContour(flat, [1, 0.3])).toBeCloseTo(0.3, 9);
    expect(distanceToContour(flat, [2.5, 0.5])).toBeCloseTo(0.5, 9);
    expect(distanceToContour(flat, [-1, 0])).toBeCloseTo(1, 9);
    // The point (0, 1) is 1 away from both ends and from the segments: no closing side.
    expect(distanceToContour(flat, [0, 1])).toBeCloseTo(1, 9);
    expect(nearStroke([flat], [1, 0.3], 0.3)).toBe(true);
    expect(nearStroke([flat], [1, 0.3], 0.29)).toBe(false);
    expect(nearStroke([flat], [0, 1], 0.5)).toBe(false);
    // A ring: near the circle, not in the middle.
    const ring = flattenPath({ contours: [circle(1)] });
    expect(nearStroke(ring, [1.02, 0], 0.05)).toBe(true);
    expect(nearStroke(ring, [0, 0], 0.05)).toBe(false);
  });

  it('is accurate on curved boundaries', () => {
    const disc = flattenPath({ contours: [circle(1)] });
    expect(containsPoint(disc, [0.99 * Math.SQRT1_2, 0.99 * Math.SQRT1_2])).toBe(true);
    expect(containsPoint(disc, [1.01 * Math.SQRT1_2, 1.01 * Math.SQRT1_2])).toBe(false);
  });
});
