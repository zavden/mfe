// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toSnapshot, type FormulaRender, type RenderRequest } from '../../../engine';
import type { RenderBasis } from '../../../engine/correspondence';
import { rectContour } from '../../../geom';
import {
  carryPaint,
  colorGlyphs,
  hideGlyphs,
  NO_PAINT,
  planPaintCommit,
  seedPaint,
} from '../glyphPaint';

/** A render of `labels`, one box per glyph in a row, by `backend`. */
function basisOf(labels: string, backend: 'latex' | 'mathjax' = 'latex'): RenderBasis {
  const glyphs = [...labels].map((label, index) => {
    const bbox = { minX: index, minY: 0, maxX: index + 0.8, maxY: 1 };
    return { index, label, kind: 'char' as const, contours: [rectContour(bbox)], bbox };
  });
  const render: FormulaRender = {
    key: `${backend}:${labels}`,
    backend,
    exact: backend === 'latex',
    target: 'ce',
    fontSize: 48,
    glyphs,
    bbox: { minX: 0, minY: 0, maxX: labels.length, maxY: 1 },
    warnings: [],
  };
  const request = {
    kind: 'tex',
    source: labels,
    layout: { width: null, align: 'center', lineSpacing: 1 },
    packages: [],
    preamble: '',
    fontSize: 48,
    target: 'ce',
    prefer: 'auto',
  } as RenderRequest;
  return { request, render };
}

const painted = (labels: string, colors: Record<string, string>, hidden: number[] = []) => ({
  glyphColors: colors,
  hiddenGlyphs: hidden,
  snapshot: toSnapshot(basisOf(labels).render),
});

describe('the paint of a draft', () => {
  it('starts as the object is painted, on the render that resolves it', () => {
    const formula = painted('abcd', { '0': '#ff0000', '3': '#00ff00' }, [1, 3]);
    // Canonical 3 has no glyph in this render; canonical 1 and 2 swapped places.
    const state = seedPaint(formula, basisOf('acb'), [0, 2, 1, null], 0.9);
    expect(state.paint).toEqual({ colors: { '0': '#ff0000' }, hidden: [2] });
    expect(state).toMatchObject({
      snapshotKey: 'latex:abcd',
      origin: [0, 2, 1, null],
      confidence: 0.9,
      edited: false,
    });
  });

  it('starts unpainted for an object that has no snapshot, whatever it holds', () => {
    const state = seedPaint(
      { glyphColors: { '0': '#ff0000' }, hiddenGlyphs: [0], snapshot: null },
      basisOf('abc'),
      [0, 1, 2],
    );
    expect(state).toMatchObject({ paint: NO_PAINT, snapshotKey: null, origin: [] });
  });

  it('colours and hides glyphs of the render, and shows them again', () => {
    let paint = colorGlyphs(NO_PAINT, [2, 0], '#ff0000');
    paint = colorGlyphs(paint, [1], '#00ff00');
    paint = hideGlyphs(paint, [2, 1, 2], true);
    expect(paint).toEqual({
      colors: { '0': '#ff0000', '1': '#00ff00', '2': '#ff0000' },
      hidden: [1, 2],
    });
    paint = hideGlyphs(colorGlyphs(paint, [0, 1], null), [1], false);
    expect(paint).toEqual({ colors: { '2': '#ff0000' }, hidden: [2] });
    expect(NO_PAINT).toEqual({ colors: {}, hidden: [] });
  });

  it('follows the glyphs to the next render, with the origin of the canonical ones', () => {
    const formula = painted('abc', { '1': '#ff0000' }, [2]);
    let state = seedPaint(formula, basisOf('abc'), [0, 1, 2]);
    state = { ...state, paint: colorGlyphs(state.paint, [0], '#0000ff'), edited: true };
    // "abc" → "xbca": a new glyph in front, a moves to the end.
    const next = basisOf('xbca');
    state = carryPaint(state, next, { map: [3, 1, 2], confidence: 0.85 });
    expect(state.basis).toBe(next);
    expect(state.paint).toEqual({ colors: { '3': '#0000ff', '1': '#ff0000' }, hidden: [2] });
    expect(state).toMatchObject({ origin: [3, 1, 2], confidence: 0.85, edited: true });
    // "xbca" → "xa": b and c are gone, with what they had.
    state = carryPaint(state, basisOf('xa'), { map: [0, null, null, 1], confidence: 1 });
    expect(state.paint).toEqual({ colors: { '1': '#0000ff' }, hidden: [] });
    expect(state).toMatchObject({ origin: [1, null, null], confidence: 0.85 });
  });
});

describe('what Apply writes for the paint', () => {
  it('keeps the snapshot that is the very render of the draft: canonical k is glyph k', () => {
    const formula = painted('abc', { '0': '#ff0000' }, [2]);
    let state = seedPaint(formula, basisOf('abc'), [0, 1, 2]);
    state = { ...state, paint: hideGlyphs(colorGlyphs(state.paint, [1], '#00ff00'), [2], false) };
    expect(planPaintCommit(state, formula, false)).toEqual({
      kind: 'canonical',
      glyphColors: { '0': '#ff0000', '1': '#00ff00' },
      hiddenGlyphs: [],
    });
    // Also when the snapshot came while the session was open (the first render of the object).
    const late = seedPaint({ ...formula, snapshot: null }, basisOf('abc'), []);
    expect(
      planPaintCommit({ ...late, paint: colorGlyphs(late.paint, [2], '#0000ff') }, formula, false),
    ).toEqual({ kind: 'canonical', glyphColors: { '2': '#0000ff' }, hiddenGlyphs: [] });
  });

  it('gives an object without a snapshot the render of its draft, painted', () => {
    const basis = basisOf('abc');
    const start = seedPaint({ glyphColors: {}, hiddenGlyphs: [], snapshot: null }, basis, []);
    const state = {
      ...start,
      paint: hideGlyphs(colorGlyphs(start.paint, [1], '#ff0000'), [0], true),
    };
    expect(
      planPaintCommit(state, { glyphColors: {}, hiddenGlyphs: [], snapshot: null }, true),
    ).toEqual({
      kind: 'snapshot',
      snapshot: toSnapshot(basis.render),
      map: null,
      transition: null,
      confidence: 1,
      glyphColors: { '1': '#ff0000' },
      hiddenGlyphs: [0],
    });
  });

  it('replaces the snapshot when the render is another, with the map the references follow', () => {
    const formula = painted('abc', { '1': '#ff0000' });
    let state = seedPaint(formula, basisOf('abc'), [0, 1, 2]);
    const next = basisOf('xbc');
    state = carryPaint(state, next, { map: [null, 1, 2], confidence: 0.7 });
    state = { ...state, paint: colorGlyphs(state.paint, [0], '#0000ff'), edited: true };
    expect(planPaintCommit(state, formula, true)).toEqual({
      kind: 'snapshot',
      snapshot: toSnapshot(next.render),
      map: [null, 1, 2],
      transition: { from: 'latex:abc', to: 'latex:xbc', map: [null, 1, 2] },
      confidence: 0.7,
      glyphColors: { '0': '#0000ff', '1': '#ff0000' },
      hiddenGlyphs: [],
    });
    // The same for a new size or layout alone, when the render is no lesser one.
    expect(planPaintCommit(state, formula, false)).toMatchObject({ kind: 'snapshot' });
  });

  it('never lets MathJax replace a LaTeX snapshot for a new layout or size alone', () => {
    const formula = painted('abcd', { '0': '#ff0000', '3': '#00ff00' }, [3]);
    // MathJax draws three glyphs for the four of LaTeX: canonical 3 has none.
    const mathjax = basisOf('abc', 'mathjax');
    let state = seedPaint(formula, mathjax, [0, 1, 2, null]);
    state = { ...state, paint: hideGlyphs(colorGlyphs(state.paint, [0, 2], '#0000ff'), [1], true) };
    // What the render lacks keeps what it had: the colour and the hidden mark of canonical 3.
    expect(planPaintCommit(state, formula, false)).toEqual({
      kind: 'canonical',
      glyphColors: { '0': '#0000ff', '2': '#0000ff', '3': '#00ff00' },
      hiddenGlyphs: [1, 3],
    });
    // An edited source is another text: MathJax's render is then all there is to count by.
    expect(planPaintCommit(state, formula, true)).toMatchObject({
      kind: 'snapshot',
      snapshot: { backend: 'mathjax' },
      map: [0, 1, 2, null],
    });
  });

  it('refuses a snapshot that changed under the session', () => {
    const formula = painted('abc', {});
    const state = carryPaint(seedPaint(formula, basisOf('abc'), [0, 1, 2]), basisOf('abcd'), {
      map: [0, 1, 2],
      confidence: 1,
    });
    const rerendered = { ...formula, snapshot: toSnapshot(basisOf('abc', 'mathjax').render) };
    expect(planPaintCommit(state, rerendered, true)).toMatch(/rendered again/);
  });
});
