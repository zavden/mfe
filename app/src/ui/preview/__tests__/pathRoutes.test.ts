// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { arcSpline, straightSpline, type Mat2D } from '../../../geom';
import type { FormulaSnapshot, GlyphPair, PathSpline } from '../../../model';
import type { Drawable } from '../../../scene';
import {
  commonSpline,
  commonTitle,
  dropPlainPaths,
  ghostGlyph,
  hasPlainPaths,
  hitRoute,
  opensPerGlyph,
  ownRouteCount,
  ownRoutePath,
  ownRoutesText,
  plainRoutePath,
  routeChoices,
  routeMark,
  routeName,
  routeOfGlyph,
  routeSpline,
  routeTitle,
  sameRoute,
  setRoutePath,
  stepRoute,
} from '../pathRoutes';

const HOLDER = { style: 'transform' as const, pathArc: 0 };
const bump: PathSpline = {
  nodes: [
    { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
    { at: [1, 0], in: [0.7, 0.4], out: null, smooth: false },
  ],
};
const dip: PathSpline = {
  nodes: [
    { at: [0, 0], in: null, out: [0.3, -0.4], smooth: false },
    { at: [1, 0], in: [0.7, -0.4], out: null, smooth: false },
  ],
};

const pair = (from: number[], to: number[], extra: Partial<GlyphPair> = {}): GlyphPair => ({
  from,
  to,
  style: null,
  ...extra,
});

/** A snapshot whose glyphs are labelled by these letters. */
const letters = (labels: string): FormulaSnapshot =>
  ({
    backend: 'mathjax',
    key: 'k',
    glyphs: [...labels].map((label) => ({ label, center: [0, 0], size: [1, 1] })),
  }) as FormulaSnapshot;

describe('the routes a pair offers', () => {
  it('lists every source onto one target, one source onto every target, and several onto several', () => {
    expect(routeChoices(pair([0, 1], [0]), HOLDER)).toEqual([
      { from: 0, to: 0 },
      { from: 1, to: 0 },
    ]);
    expect(routeChoices(pair([0], [0, 1]), HOLDER)).toEqual([
      { from: 0, to: 0 },
      { from: 0, to: 1 },
    ]);
    // Two onto three: the first source covers two targets, as Manim aligns the groups.
    expect(routeChoices(pair([0, 1], [0, 1, 2]), HOLDER)).toEqual([
      { from: 0, to: 0 },
      { from: 0, to: 1 },
      { from: 1, to: 2 },
    ]);
  });

  it('offers none for a single route, nor where a fade aligns nothing', () => {
    expect(routeChoices(pair([0], [0]), HOLDER)).toEqual([]);
    expect(routeChoices(pair([0], [0, 1]), { style: 'fade', pathArc: 0 })).toEqual([]);
    // The pair's own style wins over its holder's.
    expect(routeChoices(pair([0], [0, 1], { style: 'fade' }), HOLDER)).toEqual([]);
    expect(
      routeChoices(pair([0], [0, 1], { style: 'copy' }), { style: 'fade', pathArc: 0 }),
    ).toHaveLength(2);
  });
});

describe('what a route follows', () => {
  it('follows its own path, else the pair’s, else its holder’s arc', () => {
    const route = { from: 1, to: 0 };
    const p = pair([0, 1], [0]);
    expect(routeSpline(p, { ...HOLDER, pathArc: 60 }, route)).toEqual(arcSpline(60));
    p.path = bump;
    expect(commonSpline(p, HOLDER)).toBe(bump);
    expect(routeSpline(p, HOLDER, route)).toBe(bump);
    p.routes = [{ from: 1, to: 0, path: dip }];
    expect(ownRoutePath(p, route)).toBe(dip);
    expect(routeSpline(p, HOLDER, route)).toBe(dip);
    expect(routeSpline(p, HOLDER, { from: 0, to: 0 })).toBe(bump);
    expect(ownRoutePath(p, { from: 0, to: 0 })).toBeNull();
  });

  it('writes a route’s own path in place, adds it at the end, and takes it away', () => {
    const p = pair([0, 1, 2], [0]);
    setRoutePath(p, { from: 1, to: 0 }, bump);
    expect(p.routes).toEqual([{ from: 1, to: 0, path: bump }]);
    setRoutePath(p, { from: 2, to: 0 }, dip);
    const entry = p.routes![0]!;
    setRoutePath(p, { from: 1, to: 0 }, dip);
    // The entry is the same object, its path the one given.
    expect(p.routes![0]).toBe(entry);
    expect(p.routes![0]!.path).toBe(dip);
    setRoutePath(p, { from: 1, to: 0 }, null);
    expect(p.routes).toEqual([{ from: 2, to: 0, path: dip }]);
    setRoutePath(p, { from: 0, to: 0 }, null);
    expect(p.routes).toHaveLength(1);
    setRoutePath(p, { from: 2, to: 0 }, null);
    expect(p).not.toHaveProperty('routes');
  });
});

describe('a path that says nothing of its own', () => {
  it('is a route’s own path equal to what the route would follow without it', () => {
    const p = pair([0, 1], [0], { path: bump, routes: [{ from: 1, to: 0, path: bump }] });
    expect(plainRoutePath(p, HOLDER, { from: 1, to: 0 })).toBe(true);
    expect(plainRoutePath(p, HOLDER, { from: 0, to: 0 })).toBe(false);
    p.routes = [{ from: 1, to: 0, path: dip }];
    expect(plainRoutePath(p, HOLDER, { from: 1, to: 0 })).toBe(false);
    // Without a path of the pair, the route would follow the holder's arc.
    const q = pair([0, 1], [0], { routes: [{ from: 0, to: 0, path: arcSpline(60) }] });
    expect(plainRoutePath(q, { ...HOLDER, pathArc: 60 }, { from: 0, to: 0 })).toBe(true);
    expect(plainRoutePath(q, HOLDER, { from: 0, to: 0 })).toBe(false);
  });

  it('is dropped with the pair’s plain path, judged against the common path as it is left', () => {
    const holder = { ...HOLDER, pathArc: 60 };
    const p = pair([0, 1], [0], {
      // The chord itself: the pair's path says nothing, and goes; the pair follows the arc.
      path: straightSpline(),
      routes: [
        // The arc: what this route follows once the pair's path is gone.
        { from: 0, to: 0, path: arcSpline(60) },
        // The chord: what it played, and no longer the common path: it stays.
        { from: 1, to: 0, path: straightSpline() },
      ],
    });
    const frozen = structuredClone(p);
    expect(hasPlainPaths(p, holder)).toBe(true);
    expect(p).toEqual(frozen);
    expect(dropPlainPaths(p, holder)).toBe(true);
    expect(p).not.toHaveProperty('path');
    expect(p.routes).toEqual([{ from: 1, to: 0, path: straightSpline() }]);
    expect(hasPlainPaths(p, holder)).toBe(false);
    expect(dropPlainPaths(p, holder)).toBe(false);
  });

  it('is left alone on a route the pair does not play', () => {
    // A fade that merges plays no route: the entry is kept, and ignored.
    const p = pair([0, 1], [0], {
      style: 'fade',
      extras: 'merge',
      routes: [{ from: 1, to: 0, path: straightSpline() }],
    });
    expect(hasPlainPaths(p, HOLDER)).toBe(false);
  });
});

describe('Path per glyph (D175)', () => {
  it('opens on when a route the pair plays has a path of its own', () => {
    expect(opensPerGlyph(pair([0, 1], [0]), HOLDER)).toBe(false);
    // The pair's own path is common to the routes: it does not count.
    expect(opensPerGlyph(pair([0, 1], [0], { path: bump }), HOLDER)).toBe(false);
    const p = pair([0, 1], [0], { routes: [{ from: 1, to: 0, path: dip }] });
    expect(opensPerGlyph(p, HOLDER)).toBe(true);
    // A route the pair does not play: a fade that merges its sources plays none.
    expect(opensPerGlyph({ ...p, style: 'fade', extras: 'merge' }, HOLDER)).toBe(false);
    expect(
      opensPerGlyph(pair([0, 1], [0], { routes: [{ from: 2, to: 0, path: dip }] }), HOLDER),
    ).toBe(false);
    // A single route is edited as the pair: there is no option.
    expect(opensPerGlyph(pair([0], [0], { routes: [{ from: 0, to: 0, path: dip }] }), HOLDER)).toBe(
      false,
    );
  });

  it('counts the routes with a path of their own, and says so beside the common path', () => {
    const p = pair([0, 1, 2], [0], {
      routes: [
        { from: 0, to: 0, path: bump },
        { from: 2, to: 0, path: dip },
      ],
    });
    const choices = routeChoices(p, HOLDER);
    expect(ownRouteCount(p, choices)).toBe(2);
    expect(ownRouteCount(p, [])).toBe(0);
    expect(commonTitle(0)).toBe('One path for all the glyphs');
    expect(commonTitle(2)).toBe('Common path');
    expect(ownRoutesText(0)).toBeNull();
    expect(ownRoutesText(1)).toBe('1 route with its own path');
    expect(ownRoutesText(2)).toBe('2 routes with their own paths');
  });
});

describe('naming and stepping', () => {
  const choices = [
    { from: 0, to: 0 },
    { from: 0, to: 1 },
    { from: 1, to: 2 },
  ];

  it('names a route by its glyphs and says which of how many', () => {
    const from = letters('ab');
    const to = letters('xyz');
    expect(routeName({ from: 1, to: 2 }, from, to)).toBe('b → z');
    expect(routeTitle(choices, null, from, to)).toBe('All 3 routes');
    expect(routeTitle(choices, { from: 0, to: 1 }, from, to)).toBe('Route 2 of 3: a → y');
    // Without a snapshot, a glyph is named by its index.
    expect(routeName({ from: 1, to: 2 }, null, null)).toBe('1 → 2');
  });

  it('steps through All together and every route, round', () => {
    expect(stepRoute(choices, null, 1)).toEqual({ from: 0, to: 0 });
    expect(stepRoute(choices, { from: 0, to: 0 }, 1)).toEqual({ from: 0, to: 1 });
    expect(stepRoute(choices, { from: 1, to: 2 }, 1)).toBeNull();
    expect(stepRoute(choices, null, -1)).toEqual({ from: 1, to: 2 });
    expect(stepRoute(choices, { from: 0, to: 0 }, -1)).toBeNull();
    expect(stepRoute([], null, 1)).toBeNull();
  });

  it('finds the route of a glyph that is the glyph of one route only', () => {
    expect(routeOfGlyph(choices, 'from', 1)).toEqual({ from: 1, to: 2 });
    expect(routeOfGlyph(choices, 'from', 0)).toBeNull();
    expect(routeOfGlyph(choices, 'to', 1)).toEqual({ from: 0, to: 1 });
    expect(routeOfGlyph(choices, 'to', 5)).toBeNull();
    expect(sameRoute({ from: 1, to: 2 }, { from: 1, to: 2 })).toBe(true);
    expect(sameRoute({ from: 1, to: 2 }, null)).toBe(false);
    expect(sameRoute(null, null)).toBe(true);
  });
});

describe('hitting routes', () => {
  // Two straight routes: along y = 0 from x = 0 to 2, and along y = 1 from x = 0 to 2.
  const low: Mat2D = [2, 0, 0, 2, 0, 0];
  const high: Mat2D = [2, 0, 0, 2, 0, 1];
  const curves = [
    { route: { from: 0, to: 0 }, spline: straightSpline(), matrix: low },
    { route: { from: 1, to: 0 }, spline: straightSpline(), matrix: high },
    { route: { from: 2, to: 0 }, spline: straightSpline(), matrix: null },
  ];

  it('takes the nearest curve within reach, never the one edited', () => {
    expect(hitRoute(curves, [1, 0.1], 0.2, null)).toEqual({ from: 0, to: 0 });
    expect(hitRoute(curves, [1, 0.9], 0.2, null)).toEqual({ from: 1, to: 0 });
    expect(hitRoute(curves, [1, 0.5], 0.2, null)).toBeNull();
    expect(hitRoute(curves, [1, 0.1], 0.2, { from: 0, to: 0 })).toBeNull();
    // Within reach of both, the nearer wins.
    expect(hitRoute(curves, [1, 0.6], 0.5, null)).toEqual({ from: 1, to: 0 });
  });

  it('marks a curve a third of the way along, not halfway', () => {
    const curve: [number, number][] = Array.from({ length: 25 }, (_, i) => [i, 0]);
    expect(routeMark(curve)).toEqual([8, 0]);
    expect(routeMark([])).toEqual([0, 0]);
  });

  it('tells the side and glyph of the faint glyphs the mode draws', () => {
    const d = (key: string) => ({ key, glyph: 3 }) as Drawable;
    expect(ghostGlyph(d('ghost:from:a:3'))).toEqual({ side: 'from', glyph: 3 });
    expect(ghostGlyph(d('ghost:to:b:3'))).toEqual({ side: 'to', glyph: 3 });
    expect(ghostGlyph(d('ghost:from-end:a:3'))).toEqual({ side: 'from', glyph: 3 });
    expect(ghostGlyph(d('a:3'))).toBeNull();
  });
});
