// @vitest-environment node
/* The path of each piece of a pair's morph (D167): a piece that stands for a route of the pair —
 * one source glyph going to one target glyph — follows the path of that route when it has one of
 * its own, and the pair's otherwise. */
import { describe, expect, it } from 'vitest';
import { lineTo, translate, type Contour } from '../../geom';
import { TEXT_STYLE, type PairRoute, type PathSpline } from '../../model';
import { buildMorph, morphDrawables, type MorphGlyph, type MorphSpec } from '../anim/morph';

const square = (): Contour => {
  const c: Contour = [0, 0];
  lineTo(c, 1, 0);
  lineTo(c, 1, 1);
  lineTo(c, 0, 1);
  lineTo(c, 0, 0);
  return c;
};
const SHAPE = [square()];
const glyph = (clipId: string, index: number, x: number, y: number): MorphGlyph => ({
  local: SHAPE,
  matrix: translate(x, y),
  color: '#FFFFFF',
  opacity: 1,
  style: TEXT_STYLE,
  clipId,
  glyph: index,
});
/** A path that bulges `v` chord lengths to the left of its chord. */
const curve = (v: number): PathSpline => ({
  nodes: [
    { at: [0, 0], in: null, out: [0.25, v], smooth: false },
    { at: [1, 0], in: [0.75, v], out: null, smooth: false },
  ],
});
const spec = (more: Partial<MorphSpec>): MorphSpec => ({
  style: 'transform',
  target: 'ce',
  pathArc: 0,
  src: [glyph('a', 0, 0, 4), glyph('a', 1, 4, 4)],
  dst: [glyph('b', 5, 2, 0)],
  ...more,
});
/** `from>to` → the path of the piece, as 'own', 'pair' or 'arc'. */
const pathsOf = (s: MorphSpec, own: PathSpline, common: PathSpline | null) =>
  buildMorph(s).pieces.map((piece) => {
    const route = piece.route ? `${piece.route.from}>${piece.route.to}` : 'none';
    const spline = piece.path?.spline ?? null;
    return `${route}:${spline === own ? 'own' : spline && spline === common ? 'pair' : spline ? '?' : 'arc'}`;
  });

describe('the path of each piece of a pair', () => {
  const own = curve(0.6);
  const common = curve(-0.3);
  const routes: PairRoute[] = [{ from: 1, to: 5, path: own }];

  it('several sources onto one target: each source its route, however they arrive', () => {
    for (const extras of ['separate', 'merge', 'copies'] as const) {
      expect(pathsOf(spec({ extras, path: common, routes }), own, common)).toEqual([
        '0>5:pair',
        '1>5:own',
      ]);
      // Without a path of the pair, the other routes keep the arc.
      expect(pathsOf(spec({ extras, routes }), own, null)).toEqual(['0>5:arc', '1>5:own']);
    }
  });

  it('one source to several targets, and several to several as Manim aligns them', () => {
    const split = spec({
      src: [glyph('a', 1, 0, 4)],
      dst: [glyph('b', 5, 0, 0), glyph('b', 6, 4, 0)],
      path: common,
      routes: [{ from: 1, to: 6, path: own }],
    });
    expect(pathsOf(split, own, common)).toEqual(['1>5:pair', '1>6:own']);
    const aligned = spec({
      src: [glyph('a', 0, 0, 4), glyph('a', 1, 4, 4)],
      dst: [glyph('b', 5, 0, 0), glyph('b', 6, 2, 0), glyph('b', 7, 4, 0)],
      routes: [{ from: 0, to: 6, path: own }],
    });
    // Glyph 0 covers two targets: its second piece is the route 0 → 6.
    expect(pathsOf(aligned, own, null)).toEqual(['0>5:arc', '0>6:own', '1>7:arc']);
  });

  it('a fade: one glyph with one glyph is the route, a group follows the pair’s path', () => {
    const one = spec({ style: 'fade', src: [glyph('a', 1, 4, 4)], path: common, routes });
    expect(pathsOf(one, own, common)).toEqual(['1>5:own', '1>5:own']);
    const apart = spec({ style: 'fade', extras: 'separate', path: common, routes });
    expect(pathsOf(apart, own, common)).toEqual(['0>5:pair', '0>5:pair', '1>5:own', '1>5:own']);
    const whole = spec({ style: 'fade', extras: 'merge', path: common, routes });
    expect(pathsOf(whole, own, common)).toEqual(['none:pair', 'none:pair', 'none:pair']);
  });

  it('plays each piece on its own path', () => {
    const morph = buildMorph(spec({ extras: 'separate', routes }));
    const at = (key: string) => {
      const d = morphDrawables(morph, 0.5, 0).find((x) => x.key === key)!;
      const xs = d.path.contours.flatMap((c) => c.filter((_, i) => i % 2 === 0));
      const ys = d.path.contours.flatMap((c) => c.filter((_, i) => i % 2 === 1));
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    };
    // Glyph 0 goes straight from (0.5, 4.5) to (2.5, 0.5): halfway, the middle of its chord.
    const [x0, y0] = at('a:0');
    expect(x0).toBeCloseTo(1.5, 6);
    expect(y0).toBeCloseTo(2.5, 6);
    // Glyph 1 goes from (4.5, 4.5) to (2.5, 0.5) on a path that bulges to the left of its way:
    // halfway it is off the middle of its chord, (3.5, 2.5), on the side the path names.
    const [x1, y1] = at('a:1');
    const chord = [2.5 - 4.5, 0.5 - 4.5];
    const left = [-chord[1]!, chord[0]!];
    const off = (x1! - 3.5) * left[0]! + (y1! - 2.5) * left[1]!;
    expect(off).toBeGreaterThan(1);
  });

  it('keeps the keys of pairs drawn together apart', () => {
    const used = new Set<string>();
    const copy = (from: number) =>
      spec({ style: 'copy', src: [glyph('a', from, from * 4, 4)], extras: 'merge' });
    const first = buildMorph(copy(0), used);
    const second = buildMorph(copy(1), used);
    // Both copies are named after the target glyph they become.
    expect(first.pieces.map((p) => p.key)).toEqual(['b:5']);
    expect(second.pieces.map((p) => p.key)).toEqual(['b:5~1']);
    // On its own, a pair starts from clean keys.
    expect(buildMorph(copy(1)).pieces.map((p) => p.key)).toEqual(['b:5']);
  });
});
