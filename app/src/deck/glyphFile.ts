/* The glyph file of an exported page (`glyphs.js`): the outline of every glyph of every formula of
 * the scene, as the editor drew it. The page typesets no LaTeX — it carries no MathJax —, so what
 * a formula is made of travels as outlines, and the scene file (`scene.js`) may change anything
 * but that. Each formula's entry says what its outlines were made of (`made`: its source, its font
 * size…), so a scene that changed one of them is told so instead of being drawn with the old
 * outlines as if nothing had happened.
 *
 * A glyph is one line of the file: its label and its outline as SVG path data (`pathData.ts`: `M`,
 * `C`, `Z`, y down). A line or an arrow has no entry: the page builds it from its fields, as the
 * editor does (`embed/lines.ts`). Pure. */
import type { Box, Contour } from '../geom';
import type { FormulaRender, Glyph, ResolvedFormula } from '../engine';
import type { Formula, FormulaId, GlyphStyle, Project, RenderBackend, Target } from '../model';
import { makeup, type RenderMeta } from '../embed/engine';
import { lineRender } from '../embed/lines';
import { parsePathData, pathData, QUANTUM, written } from './pathData';

/** The version of the glyph file: the runtime refuses another one. */
export const GLYPHS_VERSION = 1;

export interface GlyphFile {
  version: typeof GLYPHS_VERSION;
  /** By formula id. */
  formulas: Record<FormulaId, GlyphFileFormula>;
}

export interface GlyphFileFormula {
  /** The formula's name when the scene was exported: for whoever reads the file. */
  name: string;
  kind: Formula['kind'];
  /** What the outlines were made of, by the words that name each thing: «its source», «its font
   * size», «the project’s target»… (`embed/engine.ts`, `makeup`). */
  made: Record<string, unknown>;
  backend: RenderBackend;
  /** The glyphs are in Manim's own order (they were rendered by LaTeX). */
  exact: boolean;
  target: Target;
  fontSize: number;
  /** Canonical index → index in `glyphs`; absent when each glyph is its own. */
  canon?: (number | null)[];
  /** How sure that map is; absent when it is 1. */
  confidence?: number;
  /** `[minX, minY, maxX, maxY]`, y up; absent when it is the box of the glyphs. */
  box?: BoxTuple;
  glyphs: GlyphFileGlyph[];
}

export interface GlyphFileGlyph {
  /** What it is: "x", "+", "∑", "—" for a rule. */
  label: string;
  /** Present for a rule (a fraction bar, a radical's line). */
  rule?: true;
  /** How it is painted, when not as text is (filled, no stroke). */
  style?: GlyphStyle;
  /** `[minX, minY, maxX, maxY]`, y up; absent when it is the box of the outline's points. */
  box?: BoxTuple;
  /** The outline, in the formula's own scene units about its centre, y down. */
  d: string;
}

export type BoxTuple = [number, number, number, number];

const tuple = (box: Box): BoxTuple => [
  written(box.minX),
  written(box.minY),
  written(box.maxX),
  written(box.maxY),
];
const boxOf = ([minX, minY, maxX, maxY]: BoxTuple): Box => ({ minX, minY, maxX, maxY });

/** The box of every point of `contours`, control points included; null without a point. */
function pointsBox(contours: readonly Contour[]): Box | null {
  let box: Box | null = null;
  for (const contour of contours) {
    for (let i = 0; i + 1 < contour.length; i += 2) {
      const x = contour[i]!;
      const y = contour[i + 1]!;
      if (!box) box = { minX: x, minY: y, maxX: x, maxY: y };
      else {
        if (x < box.minX) box.minX = x;
        if (x > box.maxX) box.maxX = x;
        if (y < box.minY) box.minY = y;
        if (y > box.maxY) box.maxY = y;
      }
    }
  }
  return box;
}

function union(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

const sameBox = (a: Box | null, b: Box): boolean =>
  a !== null &&
  Math.abs(a.minX - b.minX) <= QUANTUM &&
  Math.abs(a.minY - b.minY) <= QUANTUM &&
  Math.abs(a.maxX - b.maxX) <= QUANTUM &&
  Math.abs(a.maxY - b.maxY) <= QUANTUM;

const ZERO_BOX: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/** The glyph as the file keeps it. Its outline is read back as the file gives it, so the box is
 * compared with the box of that. */
function packGlyph(glyph: Glyph): GlyphFileGlyph {
  const d = pathData(glyph.contours);
  const read = pointsBox(parsePathData(d));
  return {
    label: glyph.label,
    ...(glyph.kind === 'rule' ? { rule: true as const } : {}),
    ...(glyph.style ? { style: { ...glyph.style } } : {}),
    ...(sameBox(read, glyph.bbox) ? {} : { box: tuple(glyph.bbox) }),
    d,
  };
}

function unpackGlyph(glyph: GlyphFileGlyph, index: number): Glyph {
  const contours = parsePathData(glyph.d);
  return {
    index,
    label: glyph.label,
    kind: glyph.rule ? 'rule' : 'char',
    contours,
    bbox: glyph.box ? boxOf(glyph.box) : (pointsBox(contours) ?? { ...ZERO_BOX }),
    ...(glyph.style ? { style: { ...glyph.style } } : {}),
  };
}

/** What the page needs of the formulas of `project` to draw them: the render each was drawn with
 * (`resolved`, the editor's). A line has no entry (the page builds it); a formula without a render
 * — an empty one, one that failed — has none either and draws nothing, as in the editor. */
export function packGlyphs(
  project: Project,
  resolved: ReadonlyMap<FormulaId, ResolvedFormula>,
): GlyphFile {
  const formulas: Record<FormulaId, GlyphFileFormula> = {};
  for (const formula of project.formulas) {
    if (formula.kind === 'line') continue;
    const entry = resolved.get(formula.id);
    if (!entry) continue;
    const { render, canonToRender, confidence } = entry;
    const glyphs = render.glyphs.map(packGlyph);
    const identity =
      canonToRender.length === glyphs.length && canonToRender.every((index, i) => index === i);
    const read = union(glyphs.map((glyph, i) => unpackGlyph(glyph, i).bbox));
    formulas[formula.id] = {
      name: formula.name,
      kind: formula.kind,
      made: Object.fromEntries(makeup(formula, project.meta)),
      backend: render.backend,
      exact: render.exact,
      target: render.target,
      fontSize: render.fontSize,
      ...(identity ? {} : { canon: [...canonToRender] }),
      ...(confidence === 1 ? {} : { confidence }),
      ...(sameBox(read, render.bbox) ? {} : { box: tuple(render.bbox) }),
      glyphs,
    };
  }
  return { version: GLYPHS_VERSION, formulas };
}

/** Something the page cannot draw as the scene file asks. */
export interface GlyphProblem {
  formulaId: FormulaId;
  message: string;
}

/** Why `data` is not a glyph file this runtime reads, or null when it is one. */
export function glyphFileProblem(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'it is not an object';
  const { version, formulas } = data as Partial<GlyphFile>;
  if (version !== GLYPHS_VERSION) {
    return `it is of version ${String(version)} and this runtime reads version ${GLYPHS_VERSION}: export the scene again from the editor, or use the mfe-runtime.js it came with`;
  }
  if (typeof formulas !== 'object' || formulas === null) return 'it has no formulas';
  return null;
}

/** What the evaluator reads of each formula of `project`, from the glyph file: its outlines, tied
 * to the formula as the scene file has it now (its colours, its name). With them, what could not
 * be given: a formula the file has no outlines for is not drawn, and one that changed what it is
 * made of since the export is drawn with the outlines it came with — both said, by name, so that
 * whoever edited the scene file knows. A line is built from its fields. Throws when an outline of
 * the file cannot be read. */
export function reviveGlyphs(
  project: Project,
  file: GlyphFile,
): { resolved: Map<FormulaId, ResolvedFormula>; problems: GlyphProblem[] } {
  const resolved = new Map<FormulaId, ResolvedFormula>();
  const problems: GlyphProblem[] = [];
  const meta: RenderMeta = project.meta;
  for (const formula of project.formulas) {
    if (formula.kind === 'line') {
      const render = lineRender(formula, meta.target);
      resolved.set(formula.id, {
        formula,
        render,
        canonToRender: render.glyphs.map((_, index) => index),
        confidence: 1,
      });
      continue;
    }
    const entry = file.formulas[formula.id];
    if (!entry) {
      // One the editor had no render for either (an empty source) is simply not there.
      if (formula.source.trim() !== '' || formula.kind === 'brace' || formula.kind === 'shape') {
        problems.push({
          formulaId: formula.id,
          message: `"${formula.name}" has no outlines in the glyph file, so it is not drawn: the page does not typeset LaTeX. A new formula comes from the editor (export the scene again), or is drawn by your own code in a layer.`,
        });
      }
      continue;
    }
    const changed = changedSince(formula, meta, entry);
    if (changed) {
      problems.push({
        formulaId: formula.id,
        message: `"${formula.name}" changed ${changed} since the scene was exported, and is drawn with the outlines it came with: the page does not typeset LaTeX. Put it back, or export the scene again from the editor.`,
      });
    }
    let glyphs: Glyph[];
    try {
      glyphs = entry.glyphs.map(unpackGlyph);
    } catch (error) {
      throw new Error(
        `The glyph file's outlines of "${entry.name}" cannot be read (${error instanceof Error ? error.message : String(error)}).`,
        { cause: error },
      );
    }
    const render: FormulaRender = {
      key: `glyphs:${formula.id}`,
      backend: entry.backend,
      exact: entry.exact,
      target: entry.target,
      fontSize: entry.fontSize,
      glyphs,
      bbox: entry.box
        ? boxOf(entry.box)
        : (union(glyphs.map((glyph) => glyph.bbox)) ?? { ...ZERO_BOX }),
      warnings: [],
    };
    resolved.set(formula.id, {
      formula,
      render,
      canonToRender: entry.canon ? [...entry.canon] : glyphs.map((_, index) => index),
      confidence: entry.confidence ?? 1,
    });
  }
  return { resolved, problems };
}

/** What `formula` changed of what its outlines were made of — "its kind", "its source", "the
 * project’s target" —, or null when they still draw it. */
export function changedSince(
  formula: Formula,
  meta: RenderMeta,
  entry: Pick<GlyphFileFormula, 'kind' | 'made'>,
): string | null {
  if (formula.kind !== entry.kind) return 'its kind';
  for (const [words, value] of makeup(formula, meta)) {
    if (JSON.stringify(value) !== JSON.stringify(entry.made[words])) return words;
  }
  return null;
}
