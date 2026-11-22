/* The data of an example of the web documentation, as `docs/web/tools/examples.mjs build` writes
 * it into `docs/web/examples/<slug>.data.js` and the player revives it (`docs/web/tools/
 * EXAMPLES.md`). The tool runs this module inside the app (its dev server), so the packing is
 * the app's own: the project as the app holds it once every formula is rendered, and the render
 * each formula was drawn with. The player then draws the scene with the app's own evaluator and
 * renderer, without MathJax: the glyphs travel as outlines.
 *
 * A glyph's outline is cubic contours in the formula's own scene units (`geom` `Contour`). Each
 * number is rounded to `QUANTUM` (a ten-thousandth of a scene unit: a hundredth of a pixel of a
 * 1080p frame) and written as the difference from the number two places before it — the previous
 * x for an x, the previous y for a y —, so that the file holds small integers. Equal points stay
 * equal after the round trip, so a closed contour stays closed. Pure. */
import type { Box, Contour } from '../geom';
import type { FormulaRender, Glyph, ResolvedFormula } from '../engine';
import type { FormulaId, GlyphStyle, Project, RenderBackend, Target } from '../model';

/** The version of `PackedScene`: the player refuses data of another one. */
export const DATA_VERSION = 1;

/** Scene units per step of a packed coordinate. */
export const QUANTUM = 1e-4;

/** What the documentation shows of an example: its card, its downloads, its player. */
export interface ExampleMeta {
  slug: string;
  /** The project's name (`meta.name`). */
  title: string;
  /** From the example's sidecar, `examples/<slug>.about.json`. */
  description: string;
  /** Seconds: the length of the scene. */
  duration: number;
  fps: number;
  /** The pixels of the project's video: its frame's aspect. */
  width: number;
  height: number;
  /** The scene's background colour. */
  background: string;
  /** The library the project is made for. */
  target: Target;
  /** The example's files, as paths from `docs/web/` (prefix `MFEDocs.root`): the project, its
   * exported Python and, when it has one, the video ManimCE rendered of it. */
  files: { project: string; ce: string; gl: string; video?: string };
}

/** One example, as `<slug>.data.js` assigns it to `window.MFE_EXAMPLES[slug]`. */
export interface ExampleData {
  meta: ExampleMeta;
  /** The app's own Export ▸ Python of the project, for each library. */
  python: { ce: string; gl: string };
  player: PackedScene;
}

/** What the player draws: the project and the renders of its formulas. */
export interface PackedScene {
  version: typeof DATA_VERSION;
  /** The visual part of the project (no sound), as the app holds it once its formulas are
   * rendered: snapshots taken, attached objects placed. */
  project: Project;
  /** The render each formula was drawn with, by formula id. */
  renders: Record<FormulaId, PackedRender>;
}

export interface PackedRender {
  key: string;
  backend: RenderBackend;
  exact: boolean;
  target: Target;
  fontSize: number;
  bbox: PackedBox;
  /** In the render's order. */
  glyphs: PackedGlyph[];
  /** Canonical index → render index (`ResolvedFormula.canonToRender`); absent when it is the
   * identity over every glyph of the render. */
  canon?: (number | null)[];
  /** `ResolvedFormula.confidence`; absent when it is 1. */
  confidence?: number;
}

/** A box as `[minX, minY, maxX, maxY]`, in quanta. */
export type PackedBox = [number, number, number, number];

export interface PackedGlyph {
  label: string;
  /** Present for a rule (`Glyph.kind`); a character has none. */
  rule?: true;
  /** Each contour in quanta: the first point, then every number as the difference from the
   * number two places before it. */
  contours: number[][];
  bbox: PackedBox;
  /** `Glyph.style`, when the render gives one. */
  style?: GlyphStyle;
}

const quantize = (value: number): number => Math.round(value / QUANTUM);
const dequantize = (steps: number): number => steps * QUANTUM;

export function packContour(contour: Contour): number[] {
  const steps = contour.map(quantize);
  const out = steps.slice(0, 2);
  for (let i = 2; i < steps.length; i++) out.push(steps[i]! - steps[i - 2]!);
  return out;
}

export function unpackContour(packed: readonly number[]): Contour {
  const steps: number[] = [];
  for (let i = 0; i < packed.length; i++) {
    steps.push(i < 2 ? packed[i]! : packed[i]! + steps[i - 2]!);
  }
  return steps.map(dequantize);
}

const packBox = (box: Box): PackedBox => [
  quantize(box.minX),
  quantize(box.minY),
  quantize(box.maxX),
  quantize(box.maxY),
];

const unpackBox = ([minX, minY, maxX, maxY]: PackedBox): Box => ({
  minX: dequantize(minX),
  minY: dequantize(minY),
  maxX: dequantize(maxX),
  maxY: dequantize(maxY),
});

/** Whether `canon` maps every canonical glyph to the render glyph of the same index, and there
 * are as many of the one as of the other. */
function isIdentity(canon: readonly (number | null)[], count: number): boolean {
  return canon.length === count && canon.every((index, i) => index === i);
}

/** A resolved formula as the data carries it. */
export function packRender(resolved: ResolvedFormula): PackedRender {
  const { render } = resolved;
  return {
    key: render.key,
    backend: render.backend,
    exact: render.exact,
    target: render.target,
    fontSize: render.fontSize,
    bbox: packBox(render.bbox),
    glyphs: render.glyphs.map((glyph) => ({
      label: glyph.label,
      ...(glyph.kind === 'rule' ? { rule: true as const } : {}),
      contours: glyph.contours.map(packContour),
      bbox: packBox(glyph.bbox),
      ...(glyph.style ? { style: { ...glyph.style } } : {}),
    })),
    ...(isIdentity(resolved.canonToRender, render.glyphs.length)
      ? {}
      : { canon: [...resolved.canonToRender] }),
    ...(resolved.confidence === 1 ? {} : { confidence: resolved.confidence }),
  };
}

/** The render a packed one stands for: what the evaluator reads of it (outlines, boxes, styles)
 * and what names it (key, backend, labels). Warnings and the provenance of a font text's shape
 * do not travel. */
export function unpackRender(packed: PackedRender): FormulaRender {
  const glyphs = packed.glyphs.map((glyph, index): Glyph => ({
    index,
    label: glyph.label,
    kind: glyph.rule ? 'rule' : 'char',
    contours: glyph.contours.map(unpackContour),
    bbox: unpackBox(glyph.bbox),
    ...(glyph.style ? { style: { ...glyph.style } } : {}),
  }));
  return {
    key: packed.key,
    backend: packed.backend,
    exact: packed.exact,
    target: packed.target,
    fontSize: packed.fontSize,
    glyphs,
    bbox: unpackBox(packed.bbox),
    warnings: [],
  };
}

/** The canonical → render map of a packed render. */
export function canonOf(packed: PackedRender): (number | null)[] {
  return packed.canon ? [...packed.canon] : packed.glyphs.map((_, index) => index);
}

/** Packs what the player needs of a project: the project and its formulas' renders. A formula
 * without a render (an empty one, or one that failed) travels without one and draws nothing,
 * as in the app. */
export function packScene(
  project: Project,
  resolved: ReadonlyMap<FormulaId, ResolvedFormula>,
): PackedScene {
  const renders: Record<FormulaId, PackedRender> = {};
  for (const formula of project.formulas) {
    const entry = resolved.get(formula.id);
    if (entry) renders[formula.id] = packRender(entry);
  }
  return { version: DATA_VERSION, project: structuredClone(project), renders };
}

/** Why `data` cannot be drawn, or null when it can: the checks the player makes before it
 * trusts a data file (the tool wrote it from a valid project; a file edited by hand or written by
 * another version of the tool is caught here). */
export function dataProblem(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'it is not an object';
  const { meta, player } = data as Partial<ExampleData>;
  if (typeof meta !== 'object' || meta === null) return 'it has no meta';
  if (typeof player !== 'object' || player === null) return 'it has no player data';
  if (player.version !== DATA_VERSION) {
    return `its player data is of version ${String(player.version)}, this player reads ${DATA_VERSION}: build the example again (tools/examples.mjs build)`;
  }
  const project = player.project as Partial<Project> | undefined;
  if (
    !project ||
    !Array.isArray(project.formulas) ||
    !Array.isArray(project.clips) ||
    !Array.isArray(project.tracks) ||
    !Array.isArray(project.relations) ||
    typeof project.meta !== 'object'
  ) {
    return 'its project is not a project';
  }
  if (typeof player.renders !== 'object' || player.renders === null) return 'it has no renders';
  return null;
}
