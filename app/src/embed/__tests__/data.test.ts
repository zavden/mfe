// @vitest-environment node
/* The example data of the documentation: outlines packed as small integers and unpacked to within
 * a quantum, closed contours still closed, the canonical map kept only when it is not the identity,
 * and the checks the player makes before it trusts a data file. */
import { describe, expect, it } from 'vitest';
import {
  canonOf,
  DATA_VERSION,
  dataProblem,
  packContour,
  packRender,
  QUANTUM,
  unpackContour,
  unpackRender,
} from '../data';
import { exampleData, renderedExample, renderProject } from './fixtures';

describe('a packed contour', () => {
  it('holds the first point, then each number as the step from the one two places before', () => {
    expect(packContour([1, 2, 1.5, 2, 2, 2.25, 2, 2.5])).toEqual([
      10000, 20000, 5000, 0, 5000, 2500, 0, 2500,
    ]);
  });

  it('comes back within half a quantum, and a closed contour stays closed', () => {
    const square = [0.123456, -0.5, 0.9, -0.5, 0.9, -0.5, 0.9, 0.4, 0.9, 0.4, 0.123456, -0.5];
    const back = unpackContour(packContour(square));
    expect(back).toHaveLength(square.length);
    back.forEach((value, i) =>
      expect(Math.abs(value - square[i]!)).toBeLessThanOrEqual(QUANTUM / 2),
    );
    // The end is the start, exactly: the renderer closes the path.
    expect(back[back.length - 2]).toBe(back[0]);
    expect(back[back.length - 1]).toBe(back[1]);
  });
});

describe('a packed render', () => {
  it('unpacks to the glyphs the evaluator reads: outlines, boxes, styles and labels', async () => {
    const { resolved } = await renderedExample('shapes.mfe.json');
    for (const entry of resolved.values()) {
      const packed = JSON.parse(JSON.stringify(packRender(entry))) as ReturnType<typeof packRender>;
      const render = unpackRender(packed);
      expect(render.key).toBe(entry.render.key);
      expect(render.glyphs).toHaveLength(entry.render.glyphs.length);
      render.glyphs.forEach((glyph, i) => {
        const original = entry.render.glyphs[i]!;
        expect(glyph.index).toBe(i);
        expect(glyph.label).toBe(original.label);
        expect(glyph.kind).toBe(original.kind);
        expect(glyph.style).toEqual(original.style);
        expect(glyph.contours.map((c) => c.length)).toEqual(original.contours.map((c) => c.length));
        glyph.contours.forEach((contour, k) =>
          contour.forEach((v, j) =>
            expect(Math.abs(v - original.contours[k]![j]!)).toBeLessThanOrEqual(
              QUANTUM / 2 + 1e-12,
            ),
          ),
        );
        for (const side of ['minX', 'minY', 'maxX', 'maxY'] as const) {
          expect(Math.abs(glyph.bbox[side] - original.bbox[side])).toBeLessThanOrEqual(QUANTUM);
        }
      });
      expect(canonOf(packed)).toEqual(entry.canonToRender);
    }
  });

  it('keeps the canonical map only when it is not the identity', async () => {
    // The examples were saved with exact (LaTeX) snapshots: without the companion the app
    // resolves the MathJax render against them by position, and the map travels when MathJax
    // orders the glyphs otherwise (the derivation of completing-the-square does).
    const derivation = await renderedExample('completing-the-square.mfe.json');
    let travelled = 0;
    for (const entry of derivation.resolved.values()) {
      const packed = packRender(entry);
      const identity =
        entry.canonToRender.every((index, i) => index === i) &&
        entry.canonToRender.length === entry.render.glyphs.length;
      expect(packed.canon === undefined).toBe(identity);
      expect(canonOf(packed)).toEqual(entry.canonToRender);
      if (packed.canon) travelled += 1;
    }
    expect(travelled).toBeGreaterThan(0);
    // A formula whose snapshot is its render's own is the identity: no map travels.
    const hello = await renderedExample('hello.mfe.json');
    const source = structuredClone(hello.project);
    for (const formula of source.formulas) formula.snapshot = null;
    const fresh = await renderProject(source);
    for (const entry of fresh.resolved.values()) {
      const packed = packRender(entry);
      expect(packed.canon).toBeUndefined();
      expect(packed.confidence).toBeUndefined();
      expect(canonOf(packed)).toEqual(entry.canonToRender);
    }
  });
});

describe('the checks of a data file', () => {
  it('accepts what the tool writes', async () => {
    const data = exampleData(await renderedExample('hello.mfe.json'));
    expect(dataProblem(data)).toBeNull();
    expect(data.player.version).toBe(DATA_VERSION);
  });

  it('says why it refuses one', async () => {
    const data = exampleData(await renderedExample('hello.mfe.json'));
    expect(dataProblem(null)).toBe('it is not an object');
    expect(dataProblem({ ...data, player: { ...data.player, version: 99 } })).toMatch(
      /version 99, this player reads 1: build the example again/,
    );
    expect(dataProblem({ ...data, player: { ...data.player, project: {} } })).toBe(
      'its project is not a project',
    );
    expect(dataProblem({ meta: data.meta })).toBe('it has no player data');
  });
});
