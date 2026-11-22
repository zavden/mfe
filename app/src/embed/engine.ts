/* The player's engine: an example's data revived into the app's own scene, evaluated and drawn by
 * the app's own evaluator and canvas renderer (`scene/evaluator.ts`, `render/`), as the Preview
 * draws it. The page's player is built on it (`player.ts`), and so are the interactive widgets
 * of the documentation (`window.MFEPlayer.engine`, docs/web/tools/EXAMPLES.md): a widget makes a
 * scene of a modified copy of the example's project — the same formulas with other relation
 * pairs, other timing, other colours — and plays it.
 *
 * The renders travel with the data (`data.ts`): nothing here typesets LaTeX, so a project may
 * change anything but what its objects are made of, which the app derives by rendering — a
 * formula's source or font size, a brace's or a shape's size, the project's target —: a scene of
 * a project that changed one is refused, saying what (`changedMakeup`). The evaluator comes from
 * its own file, not from the scene module's index: that one also exports the attach tools, whose
 * import of the engine brings MathJax into a bundle (`__tests__/boundaries.test.ts` keeps it
 * out). */
import type { Box, Vec2 } from '../geom';
import type { FormulaRender, ResolvedFormula } from '../engine';
import {
  createClip,
  createEmptyProject,
  defaultClipState,
  defaultIntro,
  defaultOutro,
  diagonalOf,
  sceneDuration,
  validateProject,
  type ClipId,
  type Formula,
  type FormulaId,
  type Issue,
  type Project,
  type ProjectMeta,
} from '../model';
import { createCanvasRenderer, type Surface } from '../render';
import { createEvaluator } from '../scene/evaluator';
import { sceneFraming } from '../scene/camera';
import type { ClipGeometry, Drawable, SceneEvaluator } from '../scene';
import {
  canonOf,
  dataProblem,
  unpackRender,
  type ExampleData,
  type ExampleMeta,
  type PackedRender,
} from './data';
import { lineRender, placeLines, sameLineGlyphs } from './lines';
import { cameraBox, fitView, frameBox, type View } from './view';

/** One glyph of a formula, in canonical order (the index a relation pair, a glyph colour or a
 * block names it by), in the formula's own scene units: its box centred on the formula's, at the
 * formula's font size, before any clip places it. */
export interface GlyphInfo {
  index: number;
  /** What it is: "x", "+", "∑", "—" for a rule (a fraction bar, a radical's line). */
  label: string;
  kind: 'char' | 'rule';
  /** Its box, control points included (Manim's convention). */
  box: Box;
  center: Vec2;
  size: Vec2;
  /** Its outline: cubic contours `[x0, y0, c1x, c1y, c2x, c2y, x1, y1, …]`. Null when the render
   * has no glyph for it (the app draws nothing there either). */
  contours: readonly (readonly number[])[] | null;
}

/** An object of the example's Creator. */
export interface FormulaInfo {
  id: FormulaId;
  name: string;
  kind: Formula['kind'];
  /** Its LaTeX (empty for a brace, a shape, a line). */
  source: string;
  /** How many glyphs it has (canonical). */
  glyphs: number;
  /** The clips that show it, in the project's order. */
  clips: ClipId[];
}

export interface DrawOptions {
  /** The part of the scene to show, in scene units: fitted whole into the canvas and centred.
   * Default: the whole frame the scene is filmed through — Manim's (the Preview at 100%), or the
   * frame of the project's camera at the instant drawn. */
  region?: Box;
  /** Changes what is drawn: receives the drawables of the instant (do not mutate them) and
   * returns the ones to draw — fewer, recoloured copies, added ones. */
  adjust?: (drawables: readonly Drawable[]) => readonly Drawable[];
}

/** A scene made of an example's project, or of a modified copy of it. */
export interface Scene {
  readonly project: Project;
  /** Seconds. */
  readonly duration: number;
  readonly fps: number;
  /** The frame, in scene units: 8 tall, as wide as the project's pixels make it. */
  readonly frame: Box;
  /** The frame the scene is filmed through at `t`: `frame`, or, when the project has a camera
   * that moves, the camera's frame of that instant. */
  frameAt(t: number): Box;
  /** The project's background colour, which the scene paints. */
  readonly background: string;
  /** The app's evaluator of the scene (`scene/evaluator.ts`): `evaluate(t)`, `geometry(t)`… */
  readonly evaluator: SceneEvaluator;
  /** The drawables at `t` (clamped to the scene): final paths in scene units. */
  evaluate(t: number): Drawable[];
  /** Where every clip on screen at `t` is: its box and the box of each of its glyphs, placed,
   * in scene units (drawn or not). */
  geometry(t: number): ClipGeometry[];
  /** The box of everything on screen at `t`; null when nothing is. */
  contentBox(t: number): Box | null;
  /** The view a canvas of this size would show at `t` (`draw` returns the same one). The instant
   * matters to a scene whose camera moves alone; without it, the view is the one of 0 s. */
  view(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    options?: Pick<DrawOptions, 'region'>,
    t?: number,
  ): View;
  /** Draws the scene at `t` into the canvas's whole bitmap (size it first: `sizeCanvas`) and
   * returns the view it used. */
  draw(canvas: HTMLCanvasElement | OffscreenCanvas, t: number, options?: DrawOptions): View;
}

export interface SceneOptions {
  /** Also draw the clips of hidden tracks, as the video export does (the Preview does not). */
  includeHidden?: boolean;
}

/** An example of the documentation, revived from its data. */
export interface Example {
  readonly slug: string;
  readonly meta: ExampleMeta;
  /** The app's Export ▸ Python of the project. */
  readonly python: { readonly ce: string; readonly gl: string };
  /** The example's project. Shared: modify a copy (`cloneProject`). */
  readonly project: Project;
  /** A deep copy of the project, to change and make a scene of. */
  cloneProject(): Project;
  formulas(): FormulaInfo[];
  /** The formula with this id or name; null when there is none. */
  formula(ref: string): Formula | null;
  /** A formula's glyphs in canonical order (`ref`: its id or its name). */
  glyphs(ref: string): GlyphInfo[];
  /** The render the app drew a formula with (`ref`: its id or its name). */
  render(ref: string): FormulaRender | null;
  /** A scene of the example's project (made once and shared), or of `project`: a modified copy
   * that keeps its objects (a formula of the example's that keeps what it is made of has the
   * example's render, and one that changed it throws, saying what — `changedMakeup`; a formula
   * the example has not is not drawn, as one without a render in the app). */
  scene(project?: Project, options?: SceneOptions): Scene;
  /** A scene of one formula alone, at the centre of the frame, as it is with no clip state:
   * draw it at time 0 with `region` its `contentBox(0)` to show the formula large (a widget that
   * lets the reader pick glyphs). `clip` is the id of its one clip. */
  formulaScene(ref: string): Scene & { readonly clip: ClipId };
  /** The app's checks of a project (`validateProject`): what a widget tells the reader when a
   * change cannot play (`severity: 'error'`). */
  validate(project?: Project): Issue[];
  /** `project` (a modified copy) with every line whose ends are on glyphs placed where the app's
   * attach sync puts it — after an end was put on other glyphs or at another anchor: its vector,
   * its clip's position, its glyphs built again (`lines.ts`). Braces, shapes and labels keep the
   * places the example gave them. */
  placeLines(project: Project): Project;
}

const renderer = createCanvasRenderer();

/** The project settings a render depends on. */
export type RenderMeta = Pick<ProjectMeta, 'preamble' | 'target'>;

/** What the render of an object is made of, field by field, each with the words that name it: what
 * the app's render key hashes for its kind — the identity of the kind's producer,
 * `engine/producers.ts`, which the player cannot import (it brings MathJax);
 * `__tests__/engine.test.ts` holds this list to the producers'. A line has nothing here: the
 * player builds its glyphs again (`lines.ts`). The runtime of the exported page writes the list in
 * its glyph file and reads it back (`deck/glyphFile.ts`). */
export function makeup(formula: Formula, meta: RenderMeta): (readonly [string, unknown])[] {
  const size = ['its font size', formula.fontSize] as const;
  const preamble = ['the project’s preamble', meta.preamble] as const;
  const target = ['the project’s target', meta.target] as const;
  switch (formula.kind) {
    case 'math':
      return [
        ['its source', formula.source],
        ['its packages', formula.packages],
        size,
        preamble,
        target,
      ];
    case 'tex': {
      const { width, align, lineSpacing } = formula.layout;
      return [
        ['its source', formula.source],
        ['its layout', [width, align, lineSpacing]],
        size,
        preamble,
        target,
      ];
    }
    case 'text': {
      const { family, weight, slant } = formula.font;
      return [['its source', formula.source], ['its font', [family, weight, slant]], size, target];
    }
    case 'brace':
      return [['its width', formula.width], ['its sharpness', formula.sharpness], target];
    case 'shape': {
      const { fillOpacity, strokeWidth, strokeOpacity } = formula.style;
      return [
        ['its shape', formula.shape],
        ['its width', formula.width],
        ['its height', formula.height],
        ['its corner radius', formula.cornerRadius],
        ['its style', [fillOpacity, strokeWidth, strokeOpacity]],
        ...(formula.shape === 'cross_line' ? [['its diagonal', diagonalOf(formula)] as const] : []),
        target,
      ];
    }
    case 'line':
      return [];
  }
}

/** What `formula`, of a project with `meta`, changed of what `original`, of the example's project
 * (`originalMeta`), is made of — "its kind", "its width", "the project’s target" —, or null when
 * the example's render of `original` draws it. */
export function changedMakeup(
  formula: Formula,
  meta: RenderMeta,
  original: Formula,
  originalMeta: RenderMeta,
): string | null {
  if (formula.kind !== original.kind) return 'its kind';
  const now = makeup(formula, meta);
  const then = makeup(original, originalMeta);
  const changed = now.find(
    ([, value], i) => JSON.stringify(value) !== JSON.stringify(then[i]?.[1]),
  );
  return changed ? changed[0] : null;
}

function unionOf(boxes: Iterable<Box>): Box | null {
  let out: Box | null = null;
  for (const b of boxes) {
    out = out
      ? {
          minX: Math.min(out.minX, b.minX),
          minY: Math.min(out.minY, b.minY),
          maxX: Math.max(out.maxX, b.maxX),
          maxY: Math.max(out.maxY, b.maxY),
        }
      : { ...b };
  }
  return out;
}

/** The device pixels per CSS pixel of a canvas: its bitmap's width over its CSS width, or the
 * screen's ratio while it is not laid out (an offscreen canvas has none). */
function canvasRatio(canvas: HTMLCanvasElement | OffscreenCanvas): number {
  const css = 'clientWidth' in canvas ? canvas.clientWidth : 0;
  if (css > 0) return canvas.width / css;
  return globalThis.devicePixelRatio || 1;
}

/** Gives a canvas the bitmap of its CSS size on this screen (whole device pixels); returns the
 * device pixels per CSS pixel. */
export function sizeCanvas(canvas: HTMLCanvasElement): number {
  const dpr = globalThis.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return dpr;
}

/** A scene of `project` drawn with `resolved`, the render of each of its formulas: what an example
 * makes of its own data (`reviveExample`) and the exported page of its files (`deck/`). */
export function makeScene(
  project: Project,
  resolved: ReadonlyMap<FormulaId, ResolvedFormula>,
  options: SceneOptions,
): Scene {
  const evaluator = createEvaluator(project, resolved, {
    includeHidden: options.includeHidden ?? false,
  });
  const frame = frameBox(project.meta);
  // Through the project's camera, when it has one that moves (D190): the scene is then seen as
  // its video shows it, the camera's frame of each instant filling the canvas.
  const framing = sceneFraming(project);
  const frameAt = (t: number): Box => (framing ? cameraBox(project.meta, framing(t)) : frame);
  const view = (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    viewOptions: Pick<DrawOptions, 'region'> = {},
    t = 0,
  ): View => {
    const surface: Surface = { width: canvas.width, height: canvas.height };
    return fitView(project.meta, surface, canvasRatio(canvas), viewOptions.region, frameAt(t));
  };
  return {
    project,
    duration: sceneDuration(project),
    fps: project.meta.fps,
    frame,
    frameAt,
    background: project.meta.background,
    evaluator,
    evaluate: (t) => evaluator.evaluate(t),
    geometry: (t) => evaluator.geometry(t),
    contentBox: (t) => unionOf(evaluator.geometry(t).map((clip) => clip.box)),
    view,
    draw(canvas, t, drawOptions = {}) {
      const shown = view(canvas, drawOptions, t);
      const ctx = canvas.getContext('2d') as
        CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) return shown; // no 2D context (jsdom)
      const drawables = evaluator.evaluate(t);
      renderer.draw(
        ctx,
        drawOptions.adjust ? drawOptions.adjust(drawables) : drawables,
        shown.camera,
        shown.surface,
        { background: project.meta.background, outside: null },
      );
      return shown;
    },
  };
}

/** Revives an example's data (`window.MFE_EXAMPLES[slug]`). Throws, saying why, when the data
 * cannot be drawn. */
export function reviveExample(slug: string, data: unknown): Example {
  const problem = dataProblem(data);
  if (problem) throw new Error(`The data of the example "${slug}" cannot be used: ${problem}.`);
  const { meta, python, player } = data as ExampleData;
  const project = player.project;
  const renders = new Map<FormulaId, { packed: PackedRender; render: FormulaRender }>();
  for (const [id, packed] of Object.entries(player.renders)) {
    renders.set(id, { packed, render: unpackRender(packed) });
  }
  const formulaOf = (ref: string): Formula | null =>
    project.formulas.find((f) => f.id === ref) ??
    project.formulas.find((f) => f.name === ref) ??
    null;
  const need = (ref: string): Formula => {
    const formula = formulaOf(ref);
    if (!formula) throw new Error(`The example "${slug}" has no formula "${ref}".`);
    return formula;
  };

  /** What the evaluator reads of each formula of `of`: the example's render of a formula with
   * the same id and the same makeup (`changedMakeup`: its source, a brace's or a shape's size…),
   * tied to the formula as `of` has it (its colours, its name); a formula whose makeup changed
   * throws, saying what changed. A line whose geometry changed (its ends were put elsewhere:
   * `placeLines`) is built again for it, as the app builds a line in the browser (`lines.ts`). */
  const resolve = (of: Project): Map<FormulaId, ResolvedFormula> => {
    const out = new Map<FormulaId, ResolvedFormula>();
    for (const formula of of.formulas) {
      const entry = renders.get(formula.id);
      const original = project.formulas.find((f) => f.id === formula.id);
      if (!entry || !original) continue;
      const changed = changedMakeup(formula, of.meta, original, project.meta);
      if (changed) {
        throw new Error(
          `The formula "${formula.name}" of the example "${slug}" changed what it is made of ` +
            `(${changed}): the player draws the renders the example came with.`,
        );
      }
      if (
        formula.kind === 'line' &&
        original.kind === 'line' &&
        !sameLineGlyphs(formula, of.meta.target, original, project.meta.target)
      ) {
        const render = lineRender(formula, of.meta.target);
        out.set(formula.id, {
          formula,
          render,
          canonToRender: render.glyphs.map((_, index) => index),
          confidence: 1,
        });
        continue;
      }
      out.set(formula.id, {
        formula,
        render: entry.render,
        canonToRender: canonOf(entry.packed),
        confidence: entry.packed.confidence ?? 1,
      });
    }
    return out;
  };
  const exampleResolved = resolve(project);
  /** The scene of the example's own project, made once for every player of it. */
  let ownScene: Scene | null = null;

  const glyphsOf = (formula: Formula): GlyphInfo[] => {
    const entry = renders.get(formula.id);
    const snapshot = formula.snapshot?.glyphs ?? [];
    const canon = entry ? canonOf(entry.packed) : snapshot.map(() => null);
    return canon.map((renderIndex, index): GlyphInfo => {
      const glyph = renderIndex === null ? undefined : entry?.render.glyphs[renderIndex];
      const snap = snapshot[index];
      const box: Box = glyph
        ? { ...glyph.bbox }
        : snap
          ? {
              minX: snap.center[0] - snap.size[0] / 2,
              minY: snap.center[1] - snap.size[1] / 2,
              maxX: snap.center[0] + snap.size[0] / 2,
              maxY: snap.center[1] + snap.size[1] / 2,
            }
          : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      return {
        index,
        label: snap?.label ?? glyph?.label ?? '?',
        kind: glyph?.kind ?? 'char',
        box,
        center: [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2],
        size: [box.maxX - box.minX, box.maxY - box.minY],
        contours: glyph ? glyph.contours : null,
      };
    });
  };

  const example: Example = {
    slug,
    meta,
    python,
    project,
    cloneProject: () => structuredClone(project),
    formulas: () =>
      project.formulas.map((formula) => ({
        id: formula.id,
        name: formula.name,
        kind: formula.kind,
        source: formula.source,
        glyphs: formula.snapshot?.glyphs.length ?? 0,
        clips: project.clips.filter((clip) => clip.formulaId === formula.id).map((c) => c.id),
      })),
    formula: formulaOf,
    glyphs: (ref) => glyphsOf(need(ref)),
    render: (ref) => renders.get(need(ref).id)?.render ?? null,
    scene(of = project, options = {}) {
      if (of !== project) return makeScene(of, resolve(of), options);
      if (options.includeHidden) return makeScene(project, exampleResolved, options);
      return (ownScene ??= makeScene(project, exampleResolved, {}));
    },
    formulaScene(ref) {
      const formula = need(ref);
      const alone = createEmptyProject(formula.name);
      alone.meta = { ...project.meta, name: formula.name, duration: null };
      alone.formulas = [structuredClone(formula)];
      alone.tracks = [alone.tracks[0]!];
      const clip = createClip(formula.id, alone.tracks[0]!.id, 0, 1, {
        initial: defaultClipState(),
        intro: defaultIntro('none'),
        outro: defaultOutro('none'),
        actions: [],
        attach: null,
      });
      alone.clips = [clip];
      return { ...makeScene(alone, resolve(alone), {}), clip: clip.id };
    },
    validate: (of = project) => validateProject(of),
    placeLines(of) {
      // The glyphs are measured as the attach sync measures them: hidden tracks too.
      const measured = makeScene(of, resolve(of), { includeHidden: true });
      return placeLines(of, measured.evaluator);
    },
  };
  return example;
}
