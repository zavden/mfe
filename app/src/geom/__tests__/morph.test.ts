// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  alignPointPaths,
  arcLengths,
  chordFrame,
  interpolateAlongPath,
  interpolatePoints,
  lineTo,
  pathPair,
  partialQuadraticPoints,
  pathShift,
  pointsCenter,
  pointsToContours,
  straightSpline,
  toPointPath,
  type Contour,
  type PathSpline,
} from '../index';

function polygon(corners: [number, number][]): Contour {
  const c: Contour = [corners[0]![0], corners[0]![1]];
  for (const p of corners.slice(1)) lineTo(c, p[0], p[1]);
  lineTo(c, corners[0]![0], corners[0]![1]);
  return c;
}

const triangle = polygon([
  [0, 0],
  [1, 0],
  [0.5, 1],
]);
const square = polygon([
  [0, 0],
  [1, 0],
  [1, 1.2],
  [0, 1],
]);
const ring = [
  square,
  polygon([
    [0.2, 0.2],
    [0.3, 0.8],
    [0.7, 0.7],
  ]),
];

describe.each(['ce', 'gl'] as const)('point alignment (%s)', (target) => {
  const path = (c: Contour[]) => toPointPath(c, target);
  const curves = (p: { degree: number; points: Float64Array }) =>
    p.degree === 3 ? p.points.length / 8 : (p.points.length / 2 - 1) / 2;

  it('gives both paths the same number of points and keeps the shape', () => {
    const [a, b] = alignPointPaths(path([triangle]), path([square]));
    expect(a.points.length).toBe(b.points.length);
    expect(curves(a)).toBeGreaterThanOrEqual(4);
    // The aligned triangle still traces the triangle: its anchors lie on its edges.
    const pair = pathPair(a, b);
    const contours = pointsToContours(pair, pair.start);
    expect(contours.length).toBeGreaterThan(0);
    for (const c of contours) {
      for (let i = 0; i < c.length; i += 6) {
        const x = c[i]!;
        const y = c[i + 1]!;
        // y = 0 (base), or on one of the two slanted edges.
        const onBase = Math.abs(y) < 1e-9 && x >= -1e-9 && x <= 1 + 1e-9;
        const onLeft = Math.abs(y - 2 * x) < 1e-9;
        const onRight = Math.abs(y - 2 * (1 - x)) < 1e-9;
        expect(onBase || onLeft || onRight).toBe(true);
      }
    }
  });

  it('adds null subpaths when one shape has more subpaths than the other', () => {
    const [a, b] = alignPointPaths(path([triangle]), path(ring));
    expect(a.points.length).toBe(b.points.length);
    expect(curves(b)).toBeGreaterThanOrEqual(curves(path(ring)));
  });

  it('leaves paths with as many points alone, even when their subpaths differ', () => {
    const one = path([
      polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]),
    ]);
    const [a, b] = alignPointPaths(one, one);
    expect(a).toBe(one);
    expect(b).toBe(one);
  });
});

describe('point interpolation', () => {
  it('interpolates between the ends exactly and along an arc in between', () => {
    const a = Float64Array.of(0, 0, 2, 0);
    const b = Float64Array.of(4, 0, 6, 0);
    expect([...interpolatePoints(a, b, 0, 0)]).toEqual([0, 0, 2, 0]);
    expect([...interpolatePoints(a, b, 1, 0)]).toEqual([4, 0, 6, 0]);
    expect([...interpolatePoints(a, b, 0.5, 0)]).toEqual([2, 0, 4, 0]);
    // A half-turn arc: the midpoint is a semicircle's top, left of the direction of travel for
    // a positive angle (counter-clockwise).
    const mid = interpolatePoints(a, b, 0.5, Math.PI);
    expect(mid[0]).toBeCloseTo(2, 9);
    expect(Math.abs(mid[1]!)).toBeCloseTo(2, 9);
    const ends = interpolatePoints(a, b, 1, Math.PI);
    ends.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
    // Below Manim's threshold the path is straight.
    expect([...interpolatePoints(a, b, 0.5, 0.005)]).toEqual([2, 0, 4, 0]);
  });

  it('reads the centre of the box over every point', () => {
    expect(pointsCenter(Float64Array.of(0, 0, 2, 0, 1, 4))).toEqual([1, 2]);
    expect(pointsCenter(new Float64Array(0))).toBeNull();
  });

  it('follows a custom path: the straight interpolation shifted as a whole', () => {
    const a = Float64Array.of(0, 0, 2, 0);
    const b = Float64Array.of(4, 0, 6, 0);
    const chord = chordFrame(pointsCenter(a)!, pointsCenter(b)!)!;
    const straight = straightSpline();
    expect([...interpolateAlongPath(a, b, 0.5, straight, arcLengths(straight), chord)]).toEqual([
      2, 0, 4, 0,
    ]);
    const bump: PathSpline = {
      nodes: [
        { at: [0, 0], in: null, out: [0.2, 0.3], smooth: false },
        { at: [0.5, 0.4], in: [0.3, 0.4], out: [0.7, 0.4], smooth: true },
        { at: [1, 0], in: [0.8, 0.3], out: null, smooth: false },
      ],
    };
    const table = arcLengths(bump);
    const [sx, sy] = pathShift(bump, table, chord, 0.5);
    expect(sy).toBeGreaterThan(1);
    const mid = interpolateAlongPath(a, b, 0.5, bump, table, chord);
    [2 + sx, sy, 4 + sx, sy].forEach((v, i) => expect(mid[i]).toBeCloseTo(v, 9));
    const ends = interpolateAlongPath(a, b, 1, bump, table, chord);
    ends.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
  });
});

describe('subpath breaks', () => {
  it('ManimCE: a junction missing at either end stays broken in between', () => {
    const joined = toPointPath(
      [
        polygon([
          [0, 0],
          [1, 0],
          [1, 1],
        ]),
      ],
      'ce',
    );
    const [a, b] = alignPointPaths(
      joined,
      toPointPath(
        [
          triangle,
          polygon([
            [3, 0],
            [4, 0],
            [4, 1],
          ]),
        ],
        'ce',
      ),
    );
    const pair = pathPair(a, b);
    const at = (alpha: number) =>
      pointsToContours(pair, interpolatePoints(pair.start, pair.end, alpha, 0));
    // The source is one connected path (padded with null curves at its end); the target has two
    // subpaths. Halfway the junction between them is open, as at the end.
    expect(at(0)).toHaveLength(1);
    expect(at(0.5)).toHaveLength(2);
    expect(at(1)).toHaveLength(2);
  });

  it('ManimGL: the jump to the next subpath is a marker whatever the rounding before it', () => {
    // A contour whose last segment is a curve ending at a coordinate that does not survive the
    // scaling the quadratic approximation works at (x · 20 / 20 ≠ x), then another contour: the
    // marker's handle must sit exactly on the anchor the approximation wrote, or the jump would
    // be drawn as a chord once the path is cut or morphed.
    const x = -1.9408571859719776;
    expect((x * 20) / 20).not.toBe(x);
    const bowl: Contour = [x, 0.1, x - 0.05, 0.25, x - 0.15, 0.25, x - 0.2, 0.1];
    bowl.push(x - 0.15, -0.05, x - 0.05, -0.05, x, 0.1);
    const path = toPointPath([bowl, triangle], 'gl');
    expect(pointsToContours(path, path.points)).toHaveLength(2);
    expect(pointsToContours(path, partialQuadraticPoints(path.points, 0, 0.9))).toHaveLength(2);
    const pair = pathPair(path, path);
    expect(pointsToContours(pair, interpolatePoints(pair.start, pair.end, 0.5, 0))).toHaveLength(2);
  });

  it('ManimGL: every drawn contour is a cubic path of 2 + 6k numbers', () => {
    const [a, b] = alignPointPaths(toPointPath([triangle], 'gl'), toPointPath(ring, 'gl'));
    const pair = pathPair(a, b);
    for (const alpha of [0, 0.3, 1]) {
      for (const c of pointsToContours(pair, interpolatePoints(pair.start, pair.end, alpha, 0))) {
        expect((c.length - 2) % 6).toBe(0);
      }
    }
  });
});
