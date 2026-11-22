/* Glyph producers: how each kind of object becomes glyphs (docs/ARCHITECTURE.md §4). A producer
 * turns a formula of its kind into the engine's request, says what identifies a render of it (the
 * cache and snapshot keys hash that), which part of the object is its content, and how unchanged
 * occurrences survive layout changes, renders it in free mode —
 * in the browser: with MathJax, or as placeholder boxes for a font text — writes what the
 * companion compiles in exact mode, and makes the request of a labelled render (match colours). A producer marked `local` renders in the browser
 * in either mode, from the object's own fields (a brace: `geom/brace.ts` builds the pieces Manim
 * builds; a shape: `geom/shapes.ts`), so its render is exact and carries the exact backend's
 * name, companion or not. The engine, the keys and the render sync ask this registry; nothing
 * outside it reads a kind's own fields. A new kind adds its request type (`types.ts`) and its row
 * here. */
import {
  boxCenter,
  braceShape,
  contoursBox,
  buildLine,
  lineTo,
  shapeContours,
  transformContour,
  translate,
  type Contour,
  type LinePart,
} from '../geom';
import {
  diagonalOf,
  type Formula,
  type FormulaKind,
  type ProjectMeta,
  type ShapeKind,
} from '../model';
import { mathJaxSource, renderWithMathJax, type MathJaxJob } from './mathjax';
import { textBoxesRender } from './textBoxes';
import { textMeasurer } from './textMeasure';
import { emUnits, mathJaxTextSource, SPACE_EM, texSource, textRows } from './textSource';
import { wrapRows } from './textWrap';
import type {
  BraceRenderRequest,
  CompanionTexRequest,
  Glyph,
  LineRenderRequest,
  MathRenderRequest,
  RenderRequest,
  RenderResult,
  ShapeRenderRequest,
  TexRenderRequest,
  TextRenderRequest,
} from './types';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What a producer reads of a formula: its kind, the kind's own fields and the size (its name,
 * colours, intro and snapshot do not change its glyphs). */
export type RenderableFormula = DistributiveOmit<
  Formula,
  'id' | 'name' | 'tag' | 'color' | 'glyphColors' | 'hiddenGlyphs' | 'intro' | 'snapshot'
>;

type RenderableOf<K extends FormulaKind> = Extract<RenderableFormula, { kind: K }>;

/** The project settings a render depends on. */
export type RenderMeta = Pick<ProjectMeta, 'preamble' | 'target'>;

export interface GlyphProducer<
  R extends RenderRequest = RenderRequest,
  F extends RenderableFormula = RenderableFormula,
> {
  /** Rendered by `free` in either mode, exactly: the glyphs are the ones Manim builds, so the
   * render carries the exact backend's name (`latex`) and needs no companion, which is never
   * asked (`texRequest` is moot). */
  local?: true;
  /** The request that renders a formula of this kind for a project with `meta`. */
  request(formula: F, meta: RenderMeta, prefer: R['prefer']): R;
  /** What identifies a render of `request` apart from the backend and its version: the render key
   * hashes it (`prefer` is no part of it; equal identity ⇒ equal glyphs in the same order). */
  identity(request: R): unknown[];
  /** The object's content as the user wrote it (JSON-able), independent of layout and setup. */
  content(formula: F): unknown;
  /** The same authored content carried by a render request. Project preamble, target and layout
   * are separate; changing those alone does not discard a retained higher-fidelity snapshot. */
  requestContent(request: R): unknown;
  /** The layout of `request` with the content/setup of `content`. Both have this producer's kind. */
  withContent(request: R, content: R): R;
  /** How unchanged source occurrences survive layout changes within one backend and target. */
  layoutMatch?: 'sequence';
  /** Free mode: typeset in the browser, synchronously (`key` is the precomputed render key). */
  free(request: R, key: string): RenderResult;
  /** Exact mode: what the companion compiles for the request (`POST /tex`). */
  texRequest(request: R): CompanionTexRequest;
  /** The request of a labelled render (`labelled.ts`): `request` with `source` — the object's
   * source with its colour groups — in place of its own, and the colour package loaded; null
   * when `source` is the request's own (nothing to label). */
  labelled(request: R, source: string): R | null;
  /** Notes for the author about `request`, whatever the backend renders it (the engine adds them
   * to the render's warnings): a package the preamble would need, say. */
  hints?(request: R): string[];
}

/** `packages` with the colour package `\color[RGB]` needs: ManimCE's template lacks it, while
 * ManimGL's and MathJax's base already load it (asking again is harmless). */
export function withColorPackage(packages: readonly string[]): string[] {
  return packages.includes('xcolor') || packages.includes('color')
    ? [...packages]
    : [...packages, 'xcolor'];
}

/** `math`: LaTeX in math mode — MathJax inside `align*` in free mode, the companion's port of
 * Manim's `MathTex` / `Tex` in exact mode. */
const math: GlyphProducer<MathRenderRequest, RenderableOf<'math'>> = {
  request: (formula, meta, prefer) => ({
    kind: 'math',
    latex: formula.source,
    packages: formula.packages,
    preamble: meta.preamble,
    target: meta.target,
    fontSize: formula.fontSize,
    prefer,
  }),
  // The list the key has hashed since the first file format, so that the snapshot keys of saved
  // projects stay current. The kinds to come put their kind first.
  identity: (request) => [
    request.latex,
    request.packages,
    request.preamble,
    request.target,
    request.fontSize,
  ],
  content: (formula) => [formula.source, formula.packages],
  requestContent: (request) => [request.latex, request.packages],
  withContent: (request, content) => ({
    ...request,
    latex: content.latex,
    packages: content.packages,
    preamble: content.preamble,
  }),
  free: (request, key) =>
    renderWithMathJax(
      {
        tex: mathJaxSource(request.latex),
        packages: request.packages,
        preamble: request.preamble,
        target: request.target,
        fontSize: request.fontSize,
      },
      key,
    ),
  texRequest: (request) => ({
    latex: request.latex,
    packages: request.packages,
    preamble: request.preamble,
    target: request.target,
  }),
  labelled: (request, latex) =>
    latex === request.latex
      ? null
      : { ...request, latex, packages: withColorPackage(request.packages) },
};

/** What free mode says of a text whose rows it had to break for the width. */
export const TEXT_WRAP_WARNING =
  'Line breaks are approximate: MathJax breaks the lines by measuring words; the companion lets LaTeX break them.';

/** What a text with non-ASCII letters is told for ManimCE, whose OT1 fonts set an accented letter
 * as two glyphs (PLAN-RUTA Q10); ManimGL's template loads T1 already. */
export const TEXT_FONTENC_HINT =
  'Non-ASCII letters: add \\usepackage[T1]{fontenc} to the project preamble, so that ManimCE sets each accented letter as one glyph, as ManimGL does.';

/** What free mode says of a text with accented letters: MathJax has no glyphs for them, so they
 * are set as their base letters (one glyph each, as T1 fonts set them). */
export const TEXT_ACCENTS_WARNING =
  'Accents are not drawn by MathJax: an accented letter is shown as its base letter (é as e); the companion draws it.';

/** `text` with every accented letter replaced by its base letter (é → e, ñ → n): what MathJax
 * can set. A letter with no base (ß) stays, and is reported as missing by the render. */
export function plainLetters(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

const hasNonAsciiLetter = (text: string) =>
  [...text].some((ch) => ch.codePointAt(0)! > 0x7f && /\p{L}/u.test(ch));

/** Widths of words as MathJax sets them in text mode, by word and job; the measure of the
 * greedy line breaking (`textWrap.ts`). */
const wordWidths = new Map<string, number>();
const MAX_WORD_WIDTHS = 4000;

function textWidth(word: string, job: Omit<MathJaxJob, 'tex'>): number {
  const key = JSON.stringify([word, job.packages, job.preamble, job.target, job.fontSize]);
  const known = wordWidths.get(key);
  if (known !== undefined) return known;
  const result = renderWithMathJax({ ...job, tex: `\\text{${word}}` }, 'measure');
  // A word MathJax cannot set takes no room here; the row's own render reports the error.
  const width = result.ok ? result.render.bbox.maxX - result.render.bbox.minX : 0;
  if (wordWidths.size >= MAX_WORD_WIDTHS) wordWidths.clear();
  wordWidths.set(key, width);
  return width;
}

/** `tex`: LaTeX in text mode (`textSource.ts`) — MathJax typesets the rows the user broke, each
 * inside `\text{…}`, in free mode; the companion compiles the wrapped source as Manim's `Tex`
 * (CE) / `TexText` (GL) in exact mode. The object has no packages of its own: the list only
 * carries the colour package of a labelled render. */
const tex: GlyphProducer<TexRenderRequest, RenderableOf<'tex'>> = {
  request: (formula, meta, prefer) => ({
    kind: 'tex',
    source: formula.source,
    layout: formula.layout,
    packages: [],
    preamble: meta.preamble,
    target: meta.target,
    fontSize: formula.fontSize,
    prefer,
  }),
  identity: (request) => [
    'tex',
    request.source,
    request.layout.width,
    request.layout.align,
    request.layout.lineSpacing,
    request.packages,
    request.preamble,
    request.target,
    request.fontSize,
  ],
  content: (formula) => [formula.source],
  requestContent: (request) => [request.source, request.packages],
  withContent: (request, content) => ({
    ...request,
    source: content.source,
    packages: content.packages,
    preamble: content.preamble,
  }),
  layoutMatch: 'sequence',
  free: (request, key) => {
    const job = {
      packages: request.packages,
      preamble: request.preamble,
      target: request.target,
      fontSize: request.fontSize,
    };
    const plain = plainLetters(request.source);
    let rows = textRows(plain);
    let broken = false;
    const { width } = request.layout;
    if (width !== null && rows.length > 0) {
      const space = SPACE_EM * emUnits(request.fontSize, request.target);
      ({ lines: rows, broken } = wrapRows(rows, (word) => textWidth(word, job), space, width));
    }
    const result = renderWithMathJax(
      {
        ...job,
        tex: rows.length === 0 ? mathJaxSource('') : mathJaxTextSource(rows, request.layout),
      },
      key,
    );
    if (result.ok && plain !== request.source) result.render.warnings.push(TEXT_ACCENTS_WARNING);
    if (result.ok && broken) result.render.warnings.push(TEXT_WRAP_WARNING);
    return result;
  },
  texRequest: (request) => ({
    latex: texSource(request, request.target),
    packages: request.packages,
    preamble: request.preamble,
    target: request.target,
    mode: 'text',
  }),
  labelled: (request, source) =>
    source === request.source
      ? null
      : { ...request, source, packages: withColorPackage(request.packages) },
  hints: (request) =>
    request.target === 'ce' &&
    hasNonAsciiLetter(request.source) &&
    !/fontenc/.test(request.preamble)
      ? [TEXT_FONTENC_HINT]
      : [],
};

/** `text`: literal text in a font, shaped by Pango in the companion as Manim's `Text` (the engine
 * asks it, `pango.ts`: there is no LaTeX to compile). Free mode cannot shape, the browser does not
 * read the fonts of the machine: it lays the text out as placeholder boxes, one per grapheme
 * (`textBoxes.ts`), measured with the font the browser has under that name. */
const text: GlyphProducer<TextRenderRequest, RenderableOf<'text'>> = {
  request: (formula, meta, prefer) => ({
    kind: 'text',
    source: formula.source,
    font: { ...formula.font },
    fontSize: formula.fontSize,
    target: meta.target,
    preamble: '',
    prefer,
  }),
  identity: (request) => [
    'text',
    request.source,
    request.font.family,
    request.font.weight,
    request.font.slant,
    request.fontSize,
    request.target,
    'native-lines',
    'ligatures',
  ],
  content: (formula) => [formula.source],
  requestContent: (request) => [request.source],
  withContent: (request, content) => ({ ...request, source: content.source }),
  free: (request, key) => ({ ok: true, render: textBoxesRender(request, key, textMeasurer()) }),
  texRequest: () => {
    throw new Error('Font text is shaped by Pango, not LaTeX.');
  },
  labelled: () => null,
};

/** `brace`: Manim's brace fitted to a target `width` wide (`geom/brace.ts`), built here in
 * either mode — one glyph in ManimCE (the path), six in ManimGL (hook, rule, tip, tip, rule,
 * hook) — and centred like any render. Nothing of it is content: a new width or sharpness
 * re-renders the same pieces. */
const brace: GlyphProducer<BraceRenderRequest, RenderableOf<'brace'>> = {
  local: true,
  request: (formula, meta, prefer) => ({
    kind: 'brace',
    width: formula.width,
    sharpness: formula.sharpness,
    preamble: '',
    target: meta.target,
    fontSize: formula.fontSize,
    prefer,
  }),
  identity: (request) => ['brace', request.target, request.width, request.sharpness],
  content: () => [],
  requestContent: () => [],
  withContent: (request) => request,
  free: (request, key) => {
    const pieces = braceShape(request.target, request.width, request.sharpness);
    const [cx, cy] = boxCenter(contoursBox(pieces));
    const centred = pieces.map((piece) => transformContour(translate(-cx, -cy), piece));
    const glyphs = centred.map((contour, index): Glyph => {
      const rule = request.target === 'gl' && (index === 1 || index === 4);
      return {
        index,
        label: rule ? '—' : '⏟',
        kind: rule ? 'rule' : 'char',
        contours: [contour],
        bbox: contoursBox([contour]),
      };
    });
    return {
      ok: true,
      render: {
        key,
        backend: 'latex',
        exact: true,
        target: request.target,
        fontSize: request.fontSize,
        glyphs,
        bbox: contoursBox(centred),
        warnings: [],
      },
    };
  },
  texRequest: () => {
    throw new Error('A brace is not typeset: it is built in the browser.');
  },
  labelled: () => null,
};

/** What the glyphs of each shape are called: a box, a circle, an underline (a rule, as TeX's
 * bars), the two lines of a cross, a cross line by its diagonal (the rising one here). */
const SHAPE_GLYPH_LABELS: Readonly<Record<ShapeKind, readonly string[]>> = {
  box: ['▢'],
  circle: ['○'],
  underline: ['—'],
  cross: ['╲', '╱'],
  cross_line: ['╱'],
};

/** `shape`: Manim's shape fitted to a box `width` × `height` (`geom/shapes.ts`), built here in
 * either mode — one glyph, two for a cross (its lines) —, each painted with the object's style,
 * and centred like any render. Nothing of it is content: a new size or style re-renders the same
 * pieces. */
const shape: GlyphProducer<ShapeRenderRequest, RenderableOf<'shape'>> = {
  local: true,
  request: (formula, meta, prefer) => ({
    kind: 'shape',
    shape: formula.shape,
    width: formula.width,
    height: formula.height,
    cornerRadius: formula.cornerRadius,
    diagonal: diagonalOf(formula),
    style: formula.style,
    preamble: '',
    target: meta.target,
    fontSize: formula.fontSize,
    prefer,
  }),
  // The diagonal is part of a cross line alone: the key of every other shape stays as it was.
  identity: (request) => [
    'shape',
    request.target,
    request.shape,
    request.width,
    request.height,
    request.cornerRadius,
    request.style.fillOpacity,
    request.style.strokeWidth,
    request.style.strokeOpacity,
    ...(request.shape === 'cross_line' ? [request.diagonal] : []),
  ],
  content: () => [],
  requestContent: () => [],
  withContent: (request) => request,
  free: (request, key) => {
    const contours = shapeContours(
      request.target,
      request.shape,
      request.width,
      request.height,
      request.cornerRadius,
      request.diagonal,
    );
    const [cx, cy] = boxCenter(contoursBox(contours));
    const centred = contours.map((c) => transformContour(translate(-cx, -cy), c));
    const labels =
      request.shape === 'cross_line' && request.diagonal === 'ul_dr'
        ? ['╲']
        : SHAPE_GLYPH_LABELS[request.shape];
    const glyphs = centred.map((contour, index): Glyph => ({
      index,
      label: labels[index] ?? labels[0]!,
      kind: 'char',
      contours: [contour],
      bbox: contoursBox([contour]),
      style: { ...request.style },
    }));
    return {
      ok: true,
      render: {
        key,
        backend: 'latex',
        exact: true,
        target: request.target,
        fontSize: request.fontSize,
        glyphs,
        bbox: contoursBox(centred),
        warnings: [],
      },
    };
  },
  texRequest: () => {
    throw new Error('A shape is not typeset: it is built in the browser.');
  },
  labelled: () => null,
};

/** What the glyphs of a line are called: the line or a dash, and a tip. */
const LINE_GLYPH_LABELS: Readonly<Record<LinePart['role'], string>> = {
  line: '—',
  dash: '╌',
  tip: '▸',
};

/** `line`: Manim's line or arrow along a `vector` (`geom/lines.ts`), built here in either mode —
 * one glyph for a line, one per dash for a dashed one, the shaft and then its tips for an arrow —,
 * each painted as Manim paints that member (a stroke, a filled tip), and centred as the library
 * centres the line (`LineBuild.centre`): the line runs from minus half its vector to half of it
 * before that. Nothing of it is content. */
const line: GlyphProducer<LineRenderRequest, RenderableOf<'line'>> = {
  local: true,
  request: (formula, meta, prefer) => ({
    kind: 'line',
    line: formula.line,
    vector: formula.vector,
    strokeWidth: formula.strokeWidth,
    tipLength: formula.tipLength,
    dashLength: formula.dashLength,
    curve: formula.curve,
    tip: formula.tip,
    startTip: formula.startTip,
    preamble: '',
    target: meta.target,
    fontSize: formula.fontSize,
    prefer,
  }),
  // What a kind does not draw with is no part of its key: a line's tip, an arrow's dashes.
  identity: (request) => [
    'line',
    request.target,
    request.line,
    request.vector[0],
    request.vector[1],
    request.strokeWidth,
    ...(request.line === 'arrow' || request.line === 'double_arrow'
      ? [request.tipLength, request.tip]
      : []),
    ...(request.line === 'double_arrow' ? [request.startTip] : []),
    ...(request.line === 'dashed' ? [request.dashLength] : []),
    request.curve ? JSON.stringify(request.curve) : '',
  ],
  content: () => [],
  requestContent: () => [],
  withContent: (request) => request,
  free: (request, key) => {
    const [vx, vy] = request.vector;
    const built = buildLine(request.target, request.line, [-vx / 2, -vy / 2], [vx / 2, vy / 2], {
      strokeWidth: request.strokeWidth,
      tipLength: request.tipLength,
      dashLength: request.dashLength,
      curve: request.curve,
      tip: request.tip,
      startTip: request.startTip,
    });
    let { parts } = built;
    // ManimGL's dashed line of no length has no dash at all: a render is never without a glyph,
    // so it keeps one, a run of no length, which draws nothing either.
    if (parts.length === 0) {
      const dot: Contour = [0, 0];
      lineTo(dot, 0, 0);
      parts = [
        {
          role: 'dash',
          contour: dot,
          style: { fillOpacity: 0, strokeWidth: request.strokeWidth, strokeOpacity: 1 },
        },
      ];
    }
    // Its origin is the centre the library reads of the line (`get_center()`), which a curve
    // puts elsewhere than the middle of what is drawn.
    const [cx, cy] = built.centre;
    const glyphs = parts.map((part, index): Glyph => {
      const contour = transformContour(translate(-cx, -cy), part.contour);
      return {
        index,
        label: LINE_GLYPH_LABELS[part.role],
        kind: 'char',
        contours: [contour],
        bbox: contoursBox([contour]),
        style: { ...part.style },
      };
    });
    return {
      ok: true,
      render: {
        key,
        backend: 'latex',
        exact: true,
        target: request.target,
        fontSize: request.fontSize,
        glyphs,
        bbox: contoursBox(glyphs.flatMap((glyph) => glyph.contours)),
        warnings: [],
      },
    };
  },
  texRequest: () => {
    throw new Error('A line is not typeset: it is built in the browser.');
  },
  labelled: () => null,
};

export const PRODUCERS: Readonly<Record<FormulaKind, GlyphProducer>> = {
  math,
  tex,
  text,
  brace,
  shape,
  line,
};

/** The producer of objects of `kind`. */
export function producerOf(kind: FormulaKind): GlyphProducer {
  return PRODUCERS[kind];
}

/** What the engine is asked to render for `formula` of a project with `meta`. */
export function renderRequestFor(
  formula: RenderableFormula,
  meta: RenderMeta,
  prefer: RenderRequest['prefer'],
): RenderRequest {
  return producerOf(formula.kind).request(formula, meta, prefer);
}
