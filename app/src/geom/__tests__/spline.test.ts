// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyToPoint, invert, type Vec2 } from '../index';
import { interpolatePoints } from '../morph';
import {
  arcLengths,
  ARC_SPLINE_LIMIT,
  arcSpline,
  chordFrame,
  cubicAt,
  equalSplines,
  isStraightSpline,
  nearestPoint,
  pathShift,
  placeAtFraction,
  pointAtFraction,
  splineSegments,
  splitCubic,
  splitSpline,
  straightSpline,
  type Cubic,
  type PathSpline,
  type SplineNode,
} from '../spline';

const node = (at: Vec2, extra: Partial<SplineNode> = {}): SplineNode => ({
  at,
  in: null,
  out: null,
  smooth: false,
  ...extra,
});

/** The chord with a bump: one smooth middle node pulled up, handles along the chord. */
const bump = (): PathSpline => ({
  nodes: [
    node([0, 0], { out: [0.2, 0.3] }),
    node([0.5, 0.4], { in: [0.3, 0.4], out: [0.7, 0.4], smooth: true }),
    node([1, 0], { in: [0.8, 0.3] }),
  ],
});

/** A right angle: along the chord, then straight up. */
const corner = (): PathSpline => ({ nodes: [node([0, 0]), node([1, 0]), node([1, 1])] });

const close = (a: Vec2, b: Vec2, digits = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};

/** Length of the polyline through `n` points sampled at equal parameters of a cubic. */
function polylineLength(points: Vec2[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  }
  return length;
}

describe('straightSpline', () => {
  it('is the chord: two nodes without handles, from (0, 0) to (1, 0)', () => {
    const s = straightSpline();
    expect(s.nodes.map((n) => n.at)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(isStraightSpline(s)).toBe(true);
  });

  it('is no longer straight with a handle between the nodes or a third node', () => {
    const handled = straightSpline();
    handled.nodes[0]!.out = [0.3, 0.2];
    expect(isStraightSpline(handled)).toBe(false);
    expect(isStraightSpline(corner())).toBe(false);
  });
});

describe('arcSpline', () => {
  it('is the chord under the threshold that makes Manim play an arc straight', () => {
    expect(arcSpline(0)).toEqual(straightSpline());
    expect(arcSpline(0.5)).toEqual(straightSpline()); // 0.0087 rad < 0.01
    expect(isStraightSpline(arcSpline(-0.5))).toBe(true);
  });

  it("traces Manim's arc at a uniform speed, one cubic per 90° at most", () => {
    const start = new Float64Array([0, 0]);
    const end = new Float64Array([1, 0]);
    for (const degrees of [1, 30, -45, 90, 120, -180, 180, 270, -300]) {
      const spline = arcSpline(degrees);
      expect(spline.nodes).toHaveLength(Math.ceil(Math.abs(degrees) / 90) + 1);
      const table = arcLengths(spline);
      for (let i = 0; i <= 20; i++) {
        const alpha = i / 20;
        const [u, v] = pointAtFraction(spline, table, alpha);
        const [x, y] = interpolatePoints(start, end, alpha, (degrees * Math.PI) / 180);
        expect(Math.hypot(u - x!, v - y!), `${degrees}° at ${alpha}`).toBeLessThan(1e-3);
      }
    }
  });

  it('ends on the chord with handles along the tangents, smooth in between', () => {
    const spline = arcSpline(60);
    const [first, last] = spline.nodes;
    expect(first).toMatchObject({ at: [0, 0], in: null, smooth: false });
    expect(last).toMatchObject({ at: [1, 0], out: null, smooth: false });
    // A positive arc swings under a chord that runs right (v < 0): the first handle points down.
    expect(first!.out![1]).toBeLessThan(0);
    expect(last!.in![1]).toBeLessThan(0);
    expect(arcSpline(-60).nodes[0]!.out![1]).toBeGreaterThan(0);
    const half = arcSpline(180);
    expect(half.nodes).toHaveLength(3);
    expect(half.nodes[1]).toMatchObject({ at: [0.5, -0.5], smooth: true });
    expect(half.nodes[1]!.in![0]).toBeLessThan(0.5);
    expect(half.nodes[1]!.out![0]).toBeGreaterThan(0.5);
  });
});

describe('arcSpline, given an arc no field would take', () => {
  it('builds no more nodes than a full turn has, whatever the degrees', () => {
    for (const degrees of [360, 361, 720, 900_000, 1e300, Infinity]) {
      for (const sign of [1, -1]) {
        const { nodes } = arcSpline(sign * degrees);
        expect(nodes.length).toBeLessThanOrEqual(5);
        expect(nodes[0]!.at).toEqual([0, 0]);
        expect(nodes.at(-1)!.at).toEqual([1, 0]);
        for (const node of nodes) {
          for (const point of [node.at, node.in, node.out]) {
            if (point) expect(point.every(Number.isFinite)).toBe(true);
          }
        }
      }
    }
  });

  it('is the arc itself up to the limit of the fields', () => {
    expect(arcSpline(350).nodes).toHaveLength(5);
    expect(arcSpline(-270).nodes).toHaveLength(4);
    expect(arcSpline(ARC_SPLINE_LIMIT + 1000)).toEqual(arcSpline(ARC_SPLINE_LIMIT));
  });
});

describe('equalSplines', () => {
  it('compares the geometry, a retracted handle counting as one on its anchor', () => {
    expect(equalSplines(arcSpline(60), arcSpline(60))).toBe(true);
    expect(equalSplines(arcSpline(60), arcSpline(-60))).toBe(false);
    expect(equalSplines(arcSpline(60), arcSpline(120))).toBe(false);
    expect(equalSplines(straightSpline(), arcSpline(0.1))).toBe(true);
    const onAnchor: PathSpline = {
      nodes: [node([0, 0], { out: [0, 0], smooth: true }), node([1, 0], { in: [1, 0] })],
    };
    expect(equalSplines(onAnchor, straightSpline())).toBe(true);
    const moved: PathSpline = { nodes: [node([0, 0], { out: [0.3, 0.1] }), node([1, 0])] };
    expect(equalSplines(moved, straightSpline())).toBe(false);
    expect(equalSplines(moved, { nodes: [...moved.nodes, node([1, 0])] })).toBe(false);
  });
});

describe('splineSegments and cubicAt', () => {
  it('traces a segment without handles as a line at a constant speed', () => {
    const [first, second] = splineSegments(corner());
    close(first![1], [1 / 3, 0]);
    close(first![2], [2 / 3, 0]);
    close(second![1], [1, 1 / 3]);
    close(second![2], [1, 2 / 3]);
    close(cubicAt(first!, 0.25), [0.25, 0]);
  });

  it('puts a missing handle beside a present one on its anchor', () => {
    const s: PathSpline = { nodes: [node([0, 0]), node([1, 0], { in: [0.5, 0.5] })] };
    expect(splineSegments(s)).toEqual([
      [
        [0, 0],
        [0, 0],
        [0.5, 0.5],
        [1, 0],
      ],
    ]);
  });

  it('evaluates the Bernstein form', () => {
    const c: Cubic = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
    close(cubicAt(c, 0), [0, 0]);
    close(cubicAt(c, 1), [1, 0]);
    close(cubicAt(c, 0.5), [0.5, 0.75]);
  });
});

describe('splitCubic', () => {
  it('gives two cubics that trace the same curve', () => {
    const c: Cubic = [
      [0, 0],
      [0.1, 0.9],
      [0.8, 0.7],
      [1, 0],
    ];
    const t = 0.3;
    const [first, second] = splitCubic(c, t);
    expect(first[0]).toEqual(c[0]);
    expect(second[3]).toEqual(c[3]);
    close(first[3], cubicAt(c, t));
    for (const s of [0, 0.25, 0.5, 0.8, 1]) {
      close(cubicAt(first, s), cubicAt(c, t * s));
      close(cubicAt(second, s), cubicAt(c, t + (1 - t) * s));
    }
  });
});

describe('arcLengths', () => {
  it('measures the chord and a polyline exactly', () => {
    expect(arcLengths(straightSpline()).total).toBeCloseTo(1, 12);
    const table = arcLengths(corner(), 4);
    expect(table.total).toBeCloseTo(2, 12);
    expect(table.cumulative.length).toBe(2 * 4 + 1);
    expect(table.cumulative[4]).toBeCloseTo(1, 12);
  });

  it('lies between the chord and the control polygon of a curve', () => {
    const { total } = arcLengths(bump());
    const polygon = 0.2 + 0.3 + 0.1 + 0.1 + 0.1 + 0.1 + 0.3 + 0.2;
    expect(total).toBeGreaterThan(1.2);
    expect(total).toBeLessThan(polygon);
  });
});

describe('placeAtFraction and pointAtFraction', () => {
  it('goes by length, not by segment', () => {
    const uneven: PathSpline = { nodes: [node([0, 0]), node([0.1, 0]), node([1, 0])] };
    const table = arcLengths(uneven);
    close(pointAtFraction(uneven, table, 0.5), [0.5, 0], 6);
    close(pointAtFraction(uneven, table, 0.05), [0.05, 0], 6);
    const place = placeAtFraction(table, 0.05);
    expect(place.segment).toBe(0);
    expect(place.t).toBeCloseTo(0.5, 9);
  });

  it('ends on the anchors and clamps alpha', () => {
    const s = bump();
    const table = arcLengths(s);
    close(pointAtFraction(s, table, 0), [0, 0]);
    close(pointAtFraction(s, table, 1), [1, 0]);
    close(pointAtFraction(s, table, -2), [0, 0]);
    close(pointAtFraction(s, table, 3), [1, 0]);
    expect(placeAtFraction(table, 1)).toEqual({ segment: 1, t: 1 });
  });

  it('moves at a uniform speed along a curve', () => {
    const s = bump();
    const table = arcLengths(s);
    const steps = 20;
    const points: Vec2[] = [];
    for (let i = 0; i <= steps; i++) points.push(pointAtFraction(s, table, i / steps));
    const lengths: number[] = [];
    for (let i = 1; i <= steps; i++) lengths.push(polylineLength([points[i - 1]!, points[i]!]));
    const mean = lengths.reduce((a, b) => a + b, 0) / steps;
    for (const l of lengths) expect(Math.abs(l - mean) / mean).toBeLessThan(0.01);
  });
});

describe('nearestPoint', () => {
  it('finds a point of the curve itself', () => {
    const s = bump();
    const expected = cubicAt(splineSegments(s)[1]!, 0.37);
    const near = nearestPoint(s, expected);
    expect(near.segment).toBe(1);
    expect(near.t).toBeCloseTo(0.37, 5);
    expect(near.distance).toBeLessThan(1e-7);
    close(near.point, expected, 7);
  });

  it('drops the perpendicular onto a straight segment', () => {
    const near = nearestPoint(straightSpline(), [0.3, 0.2]);
    expect(near.segment).toBe(0);
    close(near.point, [0.3, 0], 7);
    expect(near.distance).toBeCloseTo(0.2, 7);
  });

  it('stops at the ends and at a corner', () => {
    const beyond = nearestPoint(straightSpline(), [1.5, 0.1]);
    expect(beyond.segment).toBe(0);
    expect(beyond.t).toBeCloseTo(1, 7);
    close(beyond.point, [1, 0], 7);
    const outside = nearestPoint(corner(), [1.2, -0.2]);
    close(outside.point, [1, 0], 7);
    expect(outside.distance).toBeCloseTo(Math.hypot(0.2, 0.2), 7);
  });
});

describe('splitSpline', () => {
  it('adds a corner node on a straight segment, the line unchanged', () => {
    const split = splitSpline(corner(), { segment: 1, t: 0.5 });
    expect(split.nodes).toHaveLength(4);
    expect(split.nodes[2]).toEqual(node([1, 0.5]));
    expect(split.nodes[1]).toEqual(node([1, 0]));
    expect(split.nodes[3]).toEqual(node([1, 1]));
  });

  it('adds a smooth node on a curve, the curve unchanged', () => {
    const s = bump();
    const split = splitSpline(s, { segment: 0, t: 0.6 });
    expect(split.nodes).toHaveLength(4);
    const added = split.nodes[1]!;
    expect(added.smooth).toBe(true);
    close(added.at, cubicAt(splineSegments(s)[0]!, 0.6));
    // Collinear handles: in and out on opposite sides of the anchor.
    const [ix, iy] = [added.in![0] - added.at[0], added.in![1] - added.at[1]];
    const [ox, oy] = [added.out![0] - added.at[0], added.out![1] - added.at[1]];
    expect(ix * oy - iy * ox).toBeCloseTo(0, 9);
    expect(ix * ox + iy * oy).toBeLessThan(0);
    // The old nodes keep their anchors; the untouched segment keeps its handles.
    expect(split.nodes.map((n) => n.at)).toEqual([[0, 0], added.at, [0.5, 0.4], [1, 0]]);
    expect(split.nodes[3]!.in).toEqual([0.8, 0.3]);
    expect(split.nodes[2]!.out).toEqual([0.7, 0.4]);
    // Every point of the old curve lies on the new one.
    for (const c of splineSegments(s)) {
      for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        expect(nearestPoint(split, cubicAt(c, t)).distance).toBeLessThan(1e-7);
      }
    }
  });

  it('leaves a handle out when the split puts it on its anchor', () => {
    const s: PathSpline = { nodes: [node([0, 0]), node([1, 0], { in: [0.5, 0.5] })] };
    const split = splitSpline(s, { segment: 0, t: 0.5 });
    expect(split.nodes[0]!.out).toBeNull();
    expect(split.nodes[1]!.in).not.toBeNull();
    expect(split.nodes[1]!.out).not.toBeNull();
  });
});

describe('pathShift', () => {
  it('is zero along the chord and at the ends of any path', () => {
    const chord = chordFrame([1, 1], [4, 1])!;
    const straight = straightSpline();
    const table = arcLengths(straight);
    for (const alpha of [0, 0.3, 1]) close(pathShift(straight, table, chord, alpha), [0, 0]);
    const s = bump();
    const bumpTable = arcLengths(s);
    close(pathShift(s, bumpTable, chord, 0), [0, 0]);
    close(pathShift(s, bumpTable, chord, 1), [0, 0]);
  });

  it("is the path's offset from the chord, scaled and turned with the chord", () => {
    const s = bump();
    const table = arcLengths(s);
    const [u, v] = pointAtFraction(s, table, 0.5);
    expect(u).toBeCloseTo(0.5, 3);
    expect(v).toBeGreaterThan(0.3);
    close(pathShift(s, table, [1, 0, 0, 1, 7, 7], 0.5), [u - 0.5, v]);
    // A chord of length 2 pointing up: the bump leans left, twice as far.
    close(pathShift(s, table, chordFrame([0, 0], [0, 2])!, 0.5), [-2 * v, 2 * (u - 0.5)]);
  });

  it('keeps the ends on the glyphs even when the path does not end on the chord', () => {
    const off: PathSpline = { nodes: [node([0, 0]), node([1, 0.5])] };
    const table = arcLengths(off);
    close(pathShift(off, table, [1, 0, 0, 1, 0, 0], 1), [0, 0]);
    close(pathShift(off, table, [1, 0, 0, 1, 0, 0], 0.5), [0, 0]);
  });
});

describe('chordFrame', () => {
  it('lands (0, 0) on the start, (1, 0) on the end and (0, 1) to the left', () => {
    const m = chordFrame([1, 1], [1, 3])!;
    close(applyToPoint(m, [0, 0]), [1, 1]);
    close(applyToPoint(m, [1, 0]), [1, 3]);
    close(applyToPoint(m, [0, 1]), [-1, 1]);
    close(applyToPoint(m, [0.5, 0.25]), [0.5, 2]);
    close(applyToPoint(invert(m), [0.5, 2]), [0.5, 0.25]);
  });

  it('has no frame for a degenerate chord', () => {
    expect(chordFrame([2, 2], [2, 2])).toBeNull();
  });
});
