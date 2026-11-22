/* MathJax backend (free mode): mathjax-full 3.2.2, TeX input, SVG output, liteAdaptor.
 *
 * The liteAdaptor is MathJax's own pure-JS DOM, so this code path is identical in the browser
 * and in Node (tests, parity). It runs on the main thread: the production build is a single IIFE
 * opened from file://, where module workers are unavailable; a typical formula takes a few ms.
 *
 * The TeX a producer hands over (`producers.ts`: a formula inside `align*`, like Manim's
 * templates) is typeset in display mode with `fontCache: 'none'` so every glyph is an inline <path>. Glyphs are collected in document order
 * with accumulated transforms: <path> (label from `data-c`), <rect> (rules, "—"), <line> (table
 * rules "—" and \cancel strokes "╱", converted to a filled quad of the stroke width) and nested <svg>
 * viewports (stretchy extenders, clipped to the viewport). Paths with empty geometry (U+2061
 * function application) are dropped. Characters missing from the MathJax font come out as
 * <text> and are skipped with a warning.
 *
 * Size: MathJax units are 1/1000 em. MATHJAX_SCALE converts them to scene units per font_size
 * point for each target; the constants were fitted on the parity corpus (see below). Centring
 * follows the LaTeX backend (engine/glyphs.ts). */
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor, type LiteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import type { LiteElement, LiteNode } from 'mathjax-full/js/adaptors/lite/Element.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import type { MathDocument } from 'mathjax-full/js/core/MathDocument.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/amscd/AmsCdConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/braket/BraketConfiguration.js';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js';
import 'mathjax-full/js/input/tex/cases/CasesConfiguration.js';
import 'mathjax-full/js/input/tex/centernot/CenternotConfiguration.js';
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js';
import 'mathjax-full/js/input/tex/configmacros/ConfigMacrosConfiguration.js';
import 'mathjax-full/js/input/tex/empheq/EmpheqConfiguration.js';
import 'mathjax-full/js/input/tex/extpfeil/ExtpfeilConfiguration.js';
import 'mathjax-full/js/input/tex/gensymb/GensymbConfiguration.js';
import 'mathjax-full/js/input/tex/mathtools/MathtoolsConfiguration.js';
import 'mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/physics/PhysicsConfiguration.js';
import 'mathjax-full/js/input/tex/textcomp/TextcompConfiguration.js';
import 'mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js';
import 'mathjax-full/js/input/tex/upgreek/UpgreekConfiguration.js';
import {
  IDENTITY,
  ellipseContour,
  lineTo,
  multiply,
  parseSvgPath,
  parseSvgTransform,
  rectContour,
  transformContour,
  translate,
  type Box,
  type Contour,
  type Mat2D,
} from '../geom';
import type { Target } from '../model';
import { buildGlyphs, displayLabel, type RawGlyph } from './glyphs';
import { mathJaxSetup, type MathJaxMacro } from './packages';
import type { FormulaRender, RenderResult } from './types';

export const MATHJAX_VERSION = '3.2.2';
/** Bump when parsing, glyph extraction or calibration changes (part of every render key). */
export const MATHJAX_BACKEND_VERSION = `mathjax-${MATHJAX_VERSION}+2`;

/**
 * Scene units per MathJax unit (1/1000 em) per font_size point, per target.
 *
 * Least-squares fit of glyph widths and heights on the parity corpus (tests/parity, 70
 * formulas): MathJax glyphs vs the companion's LaTeX glyphs (identical to ManimCE `MathTex(s)[0]`
 * / ManimGL `Tex(s)` within 1e-3), paired by the position matcher with agreeing labels; rules
 * and \cancel strokes excluded. Theory (1 em = 10 TeX pt = 9.9626 bp, dvisvgm's unit) gives
 * 1.0378e-5 (CE) and 1.0065e-5 (GL); the fit is 0.59 % / 0.56 % larger.
 * Residual relative size error: median 0.75 %, rms 4.2 % (n ≈ 800). The rms comes from
 * outliers: script glyphs (TeX's optical sizes cmr7/cmmi5 are up to 20 % wider than MathJax's
 * scaled-down glyphs) and stretchy delimiters picked at a different size.
 */
export const MATHJAX_SCALE: Readonly<Record<Target, number>> = {
  ce: 1.044e-5,
  gl: 1.0122e-5,
};

/** Default stroke width (MathJax units) for <line> elements without one (table rules). */
const DEFAULT_LINE_WIDTH = 60;

let adaptor: LiteAdaptor | null = null;

function getAdaptor(): LiteAdaptor {
  if (!adaptor) {
    adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
  }
  return adaptor;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDocument = MathDocument<any, any, any>;

interface DocumentEntry {
  doc: AnyDocument;
  /** Error from running the preamble definitions, reported with every render. */
  definitionsError: string | null;
}

/** A TeX input jax stores definitions made by the source, including definitions before an error.
 * Each uncached render therefore needs its own parser initialized from exactly its preamble.
 * The engine caches immutable render results; sharing parser documents would make equal render
 * keys depend on which other formula or draft was rendered first. */
function createDocument(
  extensions: string[],
  macros: Record<string, MathJaxMacro>,
  definitions: string,
): DocumentEntry {
  getAdaptor();
  const tex = new TeX({
    packages: extensions,
    macros,
    // Throw TeX errors instead of typesetting them as red <merror> text.
    formatError: (_jax: unknown, err: Error) => {
      throw err;
    },
  });
  const doc = mathjax.document('', { InputJax: tex, OutputJax: new SVG({ fontCache: 'none' }) });
  let definitionsError: string | null = null;
  if (definitions) {
    try {
      doc.convert(definitions, { display: true });
    } catch (error) {
      definitionsError = errorMessage(error);
    }
  }
  return { doc, definitionsError };
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error);
}

/** Label from a `data-c` attribute (hex code points). Private-use pieces of stretchy
 * characters have no meaningful label. */
function labelFromDataC(dataC: string | null | undefined): string {
  if (!dataC) return '?';
  const chars = dataC
    .split(/[^0-9A-Fa-f]+/)
    .filter(Boolean)
    .map((h) => parseInt(h, 16));
  if (chars.length === 0 || chars.some((c) => !Number.isFinite(c))) return '?';
  if (chars.some((c) => c >= 0xe000 && c <= 0xf8ff)) return '?';
  return displayLabel(String.fromCodePoint(...chars));
}

function numAttr(a: LiteAdaptor, node: LiteElement, name: string, fallback = 0): number {
  const v = a.getAttribute(node, name);
  if (v === null || v === undefined || v === '') return fallback;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

/** A line of the given stroke width as a filled quad. */
function strokedLine(x1: number, y1: number, x2: number, y2: number, width: number): Contour {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const half = width / 2;
  const [nx, ny] = len > 0 ? [(-(y2 - y1) / len) * half, ((x2 - x1) / len) * half] : [0, half];
  const c: Contour = [x1 + nx, y1 + ny];
  lineTo(c, x2 + nx, y2 + ny);
  lineTo(c, x2 - nx, y2 - ny);
  lineTo(c, x1 - nx, y1 - ny);
  lineTo(c, x1 + nx, y1 + ny);
  return c;
}

function clampContour(c: Contour, clip: Box): Contour {
  return c.map((v, i) =>
    i % 2 === 0
      ? Math.min(clip.maxX, Math.max(clip.minX, v))
      : Math.min(clip.maxY, Math.max(clip.minY, v)),
  );
}

interface Extraction {
  glyphs: RawGlyph[];
  missing: string[];
}

/** Walk MathJax's SVG output in document order and collect glyph geometry (SVG units, y down). */
function extractGlyphs(a: LiteAdaptor, container: LiteElement): Extraction {
  const glyphs: RawGlyph[] = [];
  const missing: string[] = [];

  const walk = (
    node: LiteNode,
    m: Mat2D,
    clip: Box | null,
    dataC: string | null,
    inherited: string | undefined,
  ) => {
    const kind = a.kind(node);
    if (kind.startsWith('#')) return;
    const el = node as LiteElement;
    let mm = multiply(m, parseSvgTransform(a.getAttribute(el, 'transform')));
    const ownC = a.getAttribute(el, 'data-c') ?? dataC;
    // A colour command wraps its content in a group with a fill (labelled renders);
    // `currentColor` is MathJax's "no colour of its own".
    const own = String(a.getAttribute(el, 'fill') ?? '').trim();
    const fill = own && own !== 'currentColor' ? own : inherited;
    const push = (label: string, glyphKind: RawGlyph['kind'], contours: Contour[]) => {
      let out = contours.map((c) => transformContour(mm, c));
      if (clip) out = out.map((c) => clampContour(c, clip));
      glyphs.push({ label, kind: glyphKind, contours: out, ...(fill ? { fill } : {}) });
    };
    switch (kind) {
      case 'path': {
        const contours = parseSvgPath(a.getAttribute(el, 'd') ?? '');
        if (contours.length > 0) push(labelFromDataC(ownC), 'char', contours);
        return;
      }
      case 'rect': {
        if (a.getAttribute(el, 'data-background')) return;
        const x = numAttr(a, el, 'x');
        const y = numAttr(a, el, 'y');
        const box = {
          minX: x,
          minY: y,
          maxX: x + numAttr(a, el, 'width'),
          maxY: y + numAttr(a, el, 'height'),
        };
        push('—', 'rule', [rectContour(box)]);
        return;
      }
      case 'line': {
        // Table rules are horizontal or vertical; \cancel strokes are diagonal and labelled
        // like the companion labels LaTeX's stroke ("╱").
        const [x1, y1] = [numAttr(a, el, 'x1'), numAttr(a, el, 'y1')];
        const [x2, y2] = [numAttr(a, el, 'x2'), numAttr(a, el, 'y2')];
        const w = numAttr(a, el, 'stroke-width', DEFAULT_LINE_WIDTH) || DEFAULT_LINE_WIDTH;
        const diagonal = x1 !== x2 && y1 !== y2;
        push(diagonal ? '╱' : '—', diagonal ? 'char' : 'rule', [strokedLine(x1, y1, x2, y2, w)]);
        return;
      }
      case 'ellipse':
      case 'circle': {
        const rx = numAttr(a, el, kind === 'circle' ? 'r' : 'rx');
        const ry = numAttr(a, el, kind === 'circle' ? 'r' : 'ry');
        push(labelFromDataC(ownC), 'char', [
          ellipseContour(numAttr(a, el, 'cx'), numAttr(a, el, 'cy'), rx, ry),
        ]);
        return;
      }
      case 'text': {
        missing.push(a.textContent(el));
        return;
      }
      case 'svg': {
        // Nested viewport (stretchy extenders): position, viewBox scale (xMidYMid meet), clip.
        const x = numAttr(a, el, 'x');
        const y = numAttr(a, el, 'y');
        const w = numAttr(a, el, 'width');
        const h = numAttr(a, el, 'height');
        const corners = [
          [x, y],
          [x + w, y + h],
        ].map(([px, py]) => [mm[0] * px! + mm[2] * py! + mm[4], mm[1] * px! + mm[3] * py! + mm[5]]);
        const viewport: Box = {
          minX: Math.min(corners[0]![0]!, corners[1]![0]!),
          minY: Math.min(corners[0]![1]!, corners[1]![1]!),
          maxX: Math.max(corners[0]![0]!, corners[1]![0]!),
          maxY: Math.max(corners[0]![1]!, corners[1]![1]!),
        };
        const newClip = clip
          ? {
              minX: Math.max(clip.minX, viewport.minX),
              minY: Math.max(clip.minY, viewport.minY),
              maxX: Math.min(clip.maxX, viewport.maxX),
              maxY: Math.min(clip.maxY, viewport.maxY),
            }
          : viewport;
        mm = multiply(mm, translate(x, y));
        const vb = String(a.getAttribute(el, 'viewBox') ?? '')
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(Number);
        if (vb.length === 4 && vb[2]! > 0 && vb[3]! > 0) {
          const s = Math.min(w / vb[2]!, h / vb[3]!);
          const tx = (w - s * vb[2]!) / 2 - s * vb[0]!;
          const ty = (h - s * vb[3]!) / 2 - s * vb[1]!;
          mm = multiply(mm, [s, 0, 0, s, tx, ty]);
        }
        for (const child of a.childNodes(el)) walk(child, mm, newClip, ownC, fill);
        return;
      }
      default:
        for (const child of a.childNodes(el)) walk(child, mm, clip, ownC, fill);
    }
  };

  // Skip the outer <svg>'s own viewBox (like Manim with dvisvgm output) and walk its content.
  const outer = a.childNodes(container).find((n) => a.kind(n) === 'svg') as LiteElement | undefined;
  for (const child of outer ? a.childNodes(outer) : [])
    walk(child, IDENTITY, null, null, undefined);
  return { glyphs, missing };
}

/** The TeX source MathJax typesets for a math formula (Manim wraps it in align*). */
export function mathJaxSource(latex: string): string {
  const body = latex.trim() === '' ? '\\quad' : latex;
  return `\\begin{align*}${body}\\end{align*}`;
}

/** What MathJax typesets: a TeX source in display mode, with the packages and preamble it is set
 * up with, for a target and font size. The producer of each kind builds it (`producers.ts`). */
export interface MathJaxJob {
  tex: string;
  packages: string[];
  preamble: string;
  target: Target;
  fontSize: number;
}

/** Render with MathJax. Synchronous; the engine wraps it. `key` is the precomputed render key. */
export function renderWithMathJax(job: MathJaxJob, key: string): RenderResult {
  const setup = mathJaxSetup(job.target, job.packages, job.preamble);
  const warnings = [...setup.warnings];
  let extraction: Extraction;
  try {
    const entry = createDocument(setup.extensions, setup.macros, setup.definitions);
    if (entry.definitionsError) {
      warnings.push(`MathJax could not interpret the preamble: ${entry.definitionsError}`);
    }
    const node = entry.doc.convert(job.tex, { display: true });
    extraction = extractGlyphs(getAdaptor(), node as LiteElement);
  } catch (error) {
    return { ok: false, error: { message: errorMessage(error), backend: 'mathjax' } };
  }
  if (extraction.missing.length > 0) {
    warnings.push(`Not in the MathJax font, skipped: ${extraction.missing.join(' ')}`);
  }
  const scale = MATHJAX_SCALE[job.target] * job.fontSize;
  const { glyphs, bbox } = buildGlyphs(extraction.glyphs, scale, job.target);
  const render: FormulaRender = {
    key,
    backend: 'mathjax',
    exact: false,
    target: job.target,
    fontSize: job.fontSize,
    glyphs,
    bbox,
    warnings,
  };
  return { ok: true, render };
}
