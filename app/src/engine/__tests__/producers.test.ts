// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createBraceFormula,
  createFormula,
  createShapeFormula,
  createTexFormula,
  KINDS,
  parseProject,
} from '../../model';
import { expectedRenderKey } from '../engine';
import { renderKey } from '../key';
import { PRODUCERS, producerOf, renderRequestFor, type RenderableFormula } from '../producers';
import {
  plainLetters,
  TEXT_ACCENTS_WARNING,
  TEXT_FONTENC_HINT,
  TEXT_WRAP_WARNING,
} from '../producers';
import { EXAMPLE_FILES, readExample } from '../../test/examples';
import type {
  BraceRenderRequest,
  RenderRequest,
  ShapeRenderRequest,
  TexRenderRequest,
} from '../types';

const meta = { preamble: '\\newcommand{\\R}{\\mathbb{R}}', target: 'gl' as const };

const request: RenderRequest = {
  kind: 'math',
  latex: 'a+b',
  packages: [],
  preamble: '',
  target: 'ce',
  fontSize: 48,
  prefer: 'auto',
};

describe('glyph producers', () => {
  it('has one per kind of object', () => {
    expect(Object.keys(PRODUCERS)).toEqual(Object.keys(KINDS));
  });

  it('asks for a math formula as its LaTeX, packages and size in the project', () => {
    const formula = createFormula({ source: 'a+b', packages: ['cancel'], fontSize: 36 });
    expect(renderRequestFor(formula, meta, 'latex')).toEqual({
      kind: 'math',
      latex: 'a+b',
      packages: ['cancel'],
      preamble: meta.preamble,
      target: 'gl',
      fontSize: 36,
      prefer: 'latex',
    });
  });

  it('keeps producer identity stable within a backend revision', () => {
    // The keys a project saved before the producers existed carries (format 9 and earlier).
    expect(renderKey(request, 'latex', 'latex+1')).toBe('latex-19jsbibm65n');
    expect(renderKey(request, 'mathjax', 'mathjax-3.2.2+1')).toBe('mathjax-cyo8jkdw63');
    expect(renderKey({ ...request, prefer: 'mathjax' }, 'latex', 'latex+1')).toBe(
      'latex-19jsbibm65n',
    );
    // The MathJax snapshots the examples carried until they were written again for format 18
    // preceded isolated parser state (backend revision +1): their producer identity is what it
    // was, so that revision still gives the keys those files had, and the current revision asks
    // for another render.
    const historical: Record<string, string> = {
      poly: 'mathjax-n0trdign08',
      deriv: 'mathjax-60jfocj92',
      square: 'mathjax-1hyyw3wdb12',
    };
    const parsed = parseProject(readExample('match-colors.mfe.json'));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.project.formulas.map((formula) => formula.name)).toEqual(Object.keys(historical));
    for (const formula of parsed.project.formulas) {
      const earlier = renderKey(
        renderRequestFor(formula, parsed.project.meta, 'auto'),
        'mathjax',
        'mathjax-3.2.2+1',
      );
      expect(earlier).toBe(historical[formula.name]);
      expect(earlier).not.toBe(expectedRenderKey(formula, parsed.project.meta, 'mathjax'));
    }
  });

  // The examples carry the snapshots of the backends as they are: a file opened with the backend
  // of its snapshots at hand is not rendered into another snapshot, and Export → Python may
  // address the glyphs of a LaTeX one by literal indices. A backend whose version moves asks for
  // the examples to be taken again.
  it.each(EXAMPLE_FILES)('finds the snapshots of %s current', (name) => {
    const parsed = parseProject(readExample(name));
    if (!parsed.ok) throw new Error(parsed.error);
    const { project } = parsed;
    expect(project.formulas.length).toBeGreaterThan(0);
    for (const formula of project.formulas) {
      const snapshot = formula.snapshot;
      if (!snapshot) throw new Error(`${name}: ${formula.name} has no snapshot`);
      if (formula.kind === 'text') {
        // A font text is counted on the geometry its file carries.
        expect(snapshot.backend).toBe('pango');
        expect(snapshot.key).toBe(formula.geometry?.key);
        continue;
      }
      expect(snapshot.key, `${name}: ${formula.name}`).toBe(
        expectedRenderKey(formula, project.meta, snapshot.backend),
      );
    }
  });

  it('tells an edit of the content from any other change', () => {
    const { content } = producerOf('math');
    const formula = createFormula({ source: 'a', packages: [] });
    const sameContent = (other: RenderableFormula) =>
      JSON.stringify(content(other)) === JSON.stringify(content(formula));
    expect(sameContent({ ...formula, fontSize: 96 })).toBe(true);
    expect(sameContent({ ...formula, source: 'b' })).toBe(false);
    expect(sameContent({ ...formula, packages: ['bm'] })).toBe(false);
  });

  it('asks for a LaTeX text as its source and layout, keyed with its kind first', () => {
    const text = createTexFormula({
      source: 'Hello $x$',
      layout: { width: 4, align: 'left', lineSpacing: 1.5 },
      fontSize: 36,
    });
    const request = renderRequestFor(text, meta, 'auto');
    if (request.kind !== 'tex') throw new Error('not a text');
    expect(request).toEqual({
      kind: 'tex',
      source: 'Hello $x$',
      layout: { width: 4, align: 'left', lineSpacing: 1.5 },
      packages: [],
      preamble: meta.preamble,
      target: 'gl',
      fontSize: 36,
      prefer: 'auto',
    });
    const { identity, content } = producerOf('tex');
    expect(identity(request)).toEqual([
      'tex',
      'Hello $x$',
      4,
      'left',
      1.5,
      [],
      meta.preamble,
      'gl',
      36,
    ]);
    expect(renderKey(request, 'latex', 'latex+1')).not.toBe(
      renderKey({ ...request, layout: { ...text.layout, width: 5 } }, 'latex', 'latex+1'),
    );
    // Only the text is content: a new width re-flows the same glyphs.
    expect(content(text)).toEqual(content({ ...text, layout: { ...text.layout, width: 9 } }));
    expect(content(text)).not.toEqual(content({ ...text, source: 'Bye' }));
  });

  it('renders a text free with MathJax, row by row, and compiles it exact in text mode', () => {
    const producer = producerOf('tex');
    const request: TexRenderRequest = {
      kind: 'tex',
      source: 'Hi $x$\\\\bye',
      layout: { width: null, align: 'center', lineSpacing: 1 },
      packages: [],
      preamble: '',
      target: 'ce',
      fontSize: 48,
      prefer: 'auto',
    };
    const result = producer.free(request, 'k');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.render.glyphs.map((g) => g.label)).toEqual(['H', 'i', 'x', 'b', 'y', 'e']);
    expect(result.render.warnings).toEqual([]);
    // The second row sits under the first.
    expect(result.render.glyphs[3]!.bbox.maxY).toBeLessThan(result.render.glyphs[0]!.bbox.minY);
    // A width the rows fit in changes nothing in free mode; a narrower one breaks the lines.
    const wide = { ...request, layout: { ...request.layout, width: 2 } };
    const wideResult = producer.free(wide, 'k2');
    if (!wideResult.ok) throw new Error(wideResult.error.message);
    expect(wideResult.render.warnings).toEqual([]);
    expect(wideResult.render.glyphs.map((g) => g.label)).toEqual(['H', 'i', 'x', 'b', 'y', 'e']);
    const narrow = { ...wide, source: 'one two three four five six' };
    const narrowResult = producer.free(narrow, 'k3');
    if (!narrowResult.ok) throw new Error(narrowResult.error.message);
    expect(narrowResult.render.warnings).toEqual([TEXT_WRAP_WARNING]);
    expect(narrowResult.render.glyphs).toHaveLength(22);
    // "one two" (about 1.8 units at 48 pt) on the first line, the rest below, within 2 units.
    const rowsOf = (glyphs: { bbox: { minY: number } }[]) =>
      new Set(glyphs.map((g) => Math.round(g.bbox.minY * 10))).size;
    expect(rowsOf(narrowResult.render.glyphs)).toBeGreaterThanOrEqual(3);
    expect(narrowResult.render.bbox.maxX - narrowResult.render.bbox.minX).toBeLessThan(2.2);
    expect(producer.texRequest(wide)).toEqual({
      latex: '\\parbox{40.15pt}{\\centering Hi $x$\\\\bye\\par}',
      packages: [],
      preamble: '',
      target: 'ce',
      mode: 'text',
    });
    // Accented letters: MathJax has no glyphs for them, so their base letters, one glyph each.
    expect(plainLetters('Café, ñ, über, ß')).toBe('Cafe, n, uber, ß');
    const accented = producer.free({ ...request, source: 'Café' }, 'k4');
    if (!accented.ok) throw new Error(accented.error.message);
    expect(accented.render.glyphs.map((g) => g.label)).toEqual(['C', 'a', 'f', 'e']);
    expect(accented.render.warnings).toEqual([TEXT_ACCENTS_WARNING]);
    // Non-ASCII letters: ManimCE's OT1 fonts set them as two glyphs, so the preamble hint.
    expect(producer.hints!(request)).toEqual([]);
    expect(producer.hints!({ ...request, source: 'Café' })).toEqual([TEXT_FONTENC_HINT]);
    expect(producer.hints!({ ...request, source: 'Café', target: 'gl' })).toEqual([]);
    expect(
      producer.hints!({ ...request, source: 'Café', preamble: '\\usepackage[T1]{fontenc}' }),
    ).toEqual([]);
    expect(producer.hints!({ ...request, source: '$\\alpha$ → 2' })).toEqual([]);
    // A labelled render keeps the layout and loads the colour package.
    expect(producer.labelled(wide, wide.source)).toBeNull();
    expect(producer.labelled(wide, '{\\color[RGB]{1,0,1}Hi} $x$')).toEqual({
      ...wide,
      source: '{\\color[RGB]{1,0,1}Hi} $x$',
      packages: ['xcolor'],
    });
  });

  it('renders free with MathJax and compiles exact through /tex in math mode', () => {
    const producer = producerOf('math');
    const frac = { ...request, latex: '\\frac{a}{b}' };
    const result = producer.free(frac, 'k');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.render.glyphs.map((g) => g.label)).toEqual(['a', 'b', '—']);
    expect(result.render).toMatchObject({ key: 'k', backend: 'mathjax', exact: false });
    expect(producer.texRequest(frac)).toEqual({
      latex: '\\frac{a}{b}',
      packages: [],
      preamble: '',
      target: 'ce',
    });
  });
});

describe('the brace producer', () => {
  const brace = createBraceFormula({ width: 2.5, sharpness: 1.5 });

  it('is local: built in the browser from the width and sharpness, keyed with its kind first', () => {
    const producer = producerOf('brace');
    expect(producer.local).toBe(true);
    const request = renderRequestFor(brace, meta, 'mathjax');
    expect(request).toEqual({
      kind: 'brace',
      width: 2.5,
      sharpness: 1.5,
      preamble: '',
      target: 'gl',
      fontSize: 48,
      prefer: 'mathjax',
    });
    expect(producer.identity(request)).toEqual(['brace', 'gl', 2.5, 1.5]);
    // Nothing of it is content: a new width re-renders the same pieces, by position.
    expect(producer.content(brace)).toEqual(producer.content({ ...brace, width: 9 }));
    // The exact key is the one the render carries, whatever the companion's state.
    expect(expectedRenderKey(brace, meta, 'latex')).toMatch(/^latex-/);
    expect(() => producer.texRequest(request)).toThrow();
    expect(producer.labelled(request, 'x')).toBeNull();
  });

  it("renders ManimCE's brace as one glyph and ManimGL's as six, exact and centred", () => {
    const producer = producerOf('brace');
    const request = (target: 'ce' | 'gl'): BraceRenderRequest => ({
      kind: 'brace',
      width: 2.5,
      sharpness: 2,
      preamble: '',
      target,
      fontSize: 48,
      prefer: 'auto',
    });
    const ce = producer.free(request('ce'), 'k');
    if (!ce.ok) throw new Error(ce.error.message);
    expect(ce.render).toMatchObject({ key: 'k', backend: 'latex', exact: true, target: 'ce' });
    expect(ce.render.glyphs.map((g) => [g.label, g.kind])).toEqual([['⏟', 'char']]);
    expect(ce.render.bbox.maxX - ce.render.bbox.minX).toBeCloseTo(2.5, 9);
    expect(ce.render.bbox.minX + ce.render.bbox.maxX).toBeCloseTo(0, 9);
    expect(ce.render.bbox.minY + ce.render.bbox.maxY).toBeCloseTo(0, 9);
    const gl = producer.free(request('gl'), 'k2');
    if (!gl.ok) throw new Error(gl.error.message);
    expect(gl.render.glyphs.map((g) => g.kind)).toEqual([
      'char',
      'rule',
      'char',
      'char',
      'rule',
      'char',
    ]);
    expect(gl.render.bbox.maxX - gl.render.bbox.minX).toBeCloseTo(2.5, 9);
    expect(gl.render.bbox.minX + gl.render.bbox.maxX).toBeCloseTo(0, 9);
  });
});

describe('the shape producer', () => {
  const style = { fillOpacity: 0.3, strokeWidth: 2, strokeOpacity: 0.5 };
  const box = createShapeFormula({ width: 2, height: 1, cornerRadius: 0.2, style });

  it('is local: built in the browser from the size, corners and style, keyed with its kind first', () => {
    const producer = producerOf('shape');
    expect(producer.local).toBe(true);
    const request = renderRequestFor(box, meta, 'mathjax');
    expect(request).toEqual({
      kind: 'shape',
      shape: 'box',
      width: 2,
      height: 1,
      cornerRadius: 0.2,
      diagonal: 'dl_ur',
      style,
      preamble: '',
      target: 'gl',
      fontSize: 48,
      prefer: 'mathjax',
    });
    expect(producer.identity(request)).toEqual(['shape', 'gl', 'box', 2, 1, 0.2, 0.3, 2, 0.5]);
    // A cross line is keyed with its diagonal too; no other shape is (their keys stay).
    const line = renderRequestFor({ ...box, shape: 'cross_line', diagonal: 'ul_dr' }, meta, 'auto');
    expect(line).toMatchObject({ shape: 'cross_line', diagonal: 'ul_dr' });
    expect(producer.identity(line)).toEqual([
      'shape',
      'gl',
      'cross_line',
      2,
      1,
      0.2,
      0.3,
      2,
      0.5,
      'ul_dr',
    ]);
    expect(
      producer.identity(renderRequestFor({ ...box, diagonal: 'ul_dr' }, meta, 'mathjax')),
    ).toEqual(producer.identity(request));
    // Nothing of it is content: a new size or shape re-renders the pieces, by position.
    expect(producer.content(box)).toEqual(producer.content({ ...box, shape: 'cross', width: 9 }));
    expect(expectedRenderKey(box, meta, 'latex')).toMatch(/^latex-/);
    expect(() => producer.texRequest(request)).toThrow();
    expect(producer.labelled(request, 'x')).toBeNull();
  });

  it('renders each shape as its glyphs, styled, exact and centred: a cross is its two lines', () => {
    const producer = producerOf('shape');
    const request = (
      shape: ShapeRenderRequest['shape'],
      target: 'ce' | 'gl',
    ): ShapeRenderRequest => ({
      kind: 'shape',
      shape,
      width: 2,
      height: 1,
      cornerRadius: 0,
      diagonal: 'dl_ur',
      style,
      preamble: '',
      target,
      fontSize: 48,
      prefer: 'auto',
    });
    const render = (shape: ShapeRenderRequest['shape'], target: 'ce' | 'gl') => {
      const result = producer.free(request(shape, target), 'k');
      if (!result.ok) throw new Error(result.error.message);
      return result.render;
    };
    const ceBox = render('box', 'ce');
    expect(ceBox).toMatchObject({ key: 'k', backend: 'latex', exact: true, target: 'ce' });
    expect(ceBox.glyphs.map((g) => [g.label, g.kind, g.style])).toEqual([['▢', 'char', style]]);
    expect(ceBox.glyphs[0]!.style).not.toBe(style);
    expect(ceBox.bbox).toEqual({ minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 });
    expect(render('circle', 'gl').glyphs.map((g) => g.label)).toEqual(['○']);
    // A circle's diameter is its width (ManimGL's pushed handles just reach the box).
    expect(render('circle', 'ce').bbox).toEqual({ minX: -1, minY: -1, maxX: 1, maxY: 1 });
    expect(render('circle', 'gl').bbox.maxX).toBeCloseTo(1, 9);
    const line = render('underline', 'ce');
    expect(line.glyphs.map((g) => g.label)).toEqual(['—']);
    expect(line.bbox).toEqual({ minX: -1, minY: 0, maxX: 1, maxY: 0 });
    const cross = render('cross', 'gl');
    expect(cross.glyphs.map((g) => g.label)).toEqual(['╲', '╱']);
    expect(cross.glyphs[0]!.contours[0]!.slice(0, 2)).toEqual([-1, 0.5]);
    expect(cross.glyphs[1]!.contours[0]!.slice(0, 2)).toEqual([1, 0.5]);
    expect(cross.bbox).toEqual({ minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 });
    // A cross line is one glyph: the line of its diagonal, from the corner it names first.
    const rising = render('cross_line', 'ce');
    expect(rising.glyphs.map((g) => [g.label, g.kind, g.style])).toEqual([['╱', 'char', style]]);
    expect(rising.glyphs[0]!.contours[0]!.slice(0, 2)).toEqual([-1, -0.5]);
    expect(rising.glyphs[0]!.contours[0]!.slice(-2)).toEqual([1, 0.5]);
    expect(rising.bbox).toEqual({ minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 });
    const falling = producer.free({ ...request('cross_line', 'gl'), diagonal: 'ul_dr' }, 'k');
    if (!falling.ok) throw new Error(falling.error.message);
    expect(falling.render.glyphs.map((g) => g.label)).toEqual(['╲']);
    expect(falling.render.glyphs[0]!.contours[0]!.slice(0, 2)).toEqual([-1, 0.5]);
    expect(falling.render.glyphs[0]!.contours[0]!.slice(-2)).toEqual([1, -0.5]);
  });
});
