/* What the passes of the Python generator share (index.ts): the project and its renders, the
 * export options, the resolved events, the names taken, the issues found and the lines emitted
 * so far — and the per-formula and per-clip facts the first pass works out. */
import type { ResolvedFormulas } from '../../engine';
import {
  clipLifetimes,
  type Clip,
  type ClipAttach,
  type ClipId,
  type ClipLifetime,
  type ClipState,
  type Formula,
  type IntroKind,
  type Issue,
  type OutroKind,
  type Project,
  type SlideMark,
  type Target,
} from '../../model';
import {
  buildEvents,
  endsAtStart,
  type AppearEvent,
  type CameraLeg,
  type DisappearEvent,
  type EmphasisEvent,
  type IntroEvent,
  type OutroEvent,
  type PartTransformEvent,
  type TransferEvent,
  type ResolvedPair,
  type SceneEvent,
  type TweenEvent,
} from '../../scene';
import type { CodegenOptions } from '../types';
import type { GlyphNaming } from './glyphs';
import { NameAllocator } from './python';
import { DIALECTS, type Dialect } from './dialect';
import { EMITTED_SYMBOLS } from './symbols';
import { attachmentPlan, type AttachmentPlan } from './attach';
import { CAMERA_SYMBOLS, cameraPlan, effectiveSceneName, type CameraPlan } from './camera';

export const INDENT = '        ';

export type AnimKind = IntroKind | OutroKind;

export interface FormulaCtx {
  formula: Formula;
  index: number;
  count: number;
  /** Normalised (x, y, w, h) per canonical glyph, for `_glyphs`. */
  layout: [number, number, number, number][];
  positional: boolean;
  /** CE formula split by `{{ … }}`: literal order, but through a flat list. */
  flat: boolean;
  fontSize: number;
  /** Python expression of the TeX template (CE) / additional preamble (GL), or null. */
  texSetup: string | null;
  /** A font text this library shaped: the fingerprint of its saved outlines, which the scene
   * checks the text it builds against; null when there is none (the scene then checks only the
   * number of glyphs, `count`). */
  textSignature: string | null;
}

export interface ClipCtx {
  clip: Clip;
  formula: FormulaCtx;
  naming: GlyphNaming;
  z: number;
  /** Glyphs on screen now. */
  present: Set<number>;
  /** Glyphs that left for good (outro, a disappear block they do not come back from, the clip
   * end) or were consumed by a transfer (a relation, a Morph block): never shown again — so the
   * formula is never used whole again either (`isWhole`). */
  gone: Set<number>;
  /** Colour and opacity a part transform left on a glyph (scene/anim/part.ts), until a tween
   * changes that glyph's colour or the clip opacity. */
  partColor: Map<number, string>;
  partOpacity: Map<number, number>;
  /** A part transform moved glyphs: the formula's box centre is no longer where its placement
   * puts the formula centre, so tweens pivot on explicit points (`about_point`, `shift`). */
  partsMoved: boolean;
}

export type Op =
  | { kind: 'intro'; event: IntroEvent; clip: ClipCtx; glyphs: number[] }
  | { kind: 'outro'; event: OutroEvent; clip: ClipCtx; glyphs: number[] }
  | { kind: 'appear'; event: AppearEvent; clip: ClipCtx; glyphs: number[] }
  /** `back`: glyphs an appear block brings back later in the clip. */
  | { kind: 'disappear'; event: DisappearEvent; clip: ClipCtx; glyphs: number[]; back: Set<number> }
  /** Glyphs still on screen when their clip ends (they came on screen during the outro). */
  | { kind: 'leave'; event: { start: number; end: number }; clip: ClipCtx; glyphs: number[] }
  | { kind: 'tween'; event: TweenEvent; clip: ClipCtx }
  | { kind: 'transform'; event: PartTransformEvent; clip: ClipCtx; glyphs: number[] }
  /** An Emphasis block (D73) on the glyphs on screen when it starts. */
  | { kind: 'emphasis'; event: EmphasisEvent; clip: ClipCtx; glyphs: number[] }
  | { kind: 'transfer'; event: TransferEvent; from: ClipCtx; to: ClipCtx; pairs: ResolvedPair[] }
  /** The placement of an attached object beside its target's glyphs (attach.ts), an instant at
   * the clip's start. `target` is the clip it hangs on: the first of its targets, when a brace
   * or a shape spans several clips. */
  | {
      kind: 'place';
      event: { start: number; end: number };
      clip: ClipCtx;
      target: ClipCtx;
      attach: ClipAttach;
    }
  /** A move of the scene's camera (camera.ts): the one op that belongs to no clip. */
  | { kind: 'camera'; event: { start: number; end: number }; leg: CameraLeg };

export interface Generated {
  /** Statements before the play where the op starts. */
  pre: string[];
  /** One animation, or one per transfer pair. */
  anims: string[];
  /** Statements after the play where the op ends. */
  post: string[];
  /** Variable holding the animation(s) when the op is played in parts — or set by the generator
   * itself when the animation had to be made in `pre` (a Flash or a FocusOn given its layer). */
  variable?: string;
}

/** The Python helpers (helpers.ts) the scene turned out to need. */
export type Helper =
  | 'text-geometry'
  | 'part'
  | 'tween'
  | 'tween-paint'
  | 'tween-style'
  | 'spline'
  | 'route-paths'
  | 'circle'
  | 'cross-line'
  | 'arrow'
  | 'spline-line'
  | 'dashed'
  | 'carried'
  | 'trace-arrow'
  | 'wiggle'
  | 'circumscribe'
  | 'glyphs'
  | 'unwrite'
  | 'restore-unwrite'
  | 'restore-uncreate'
  | 'restore-shrink';

/** What the passes share. Everything but the containers is fixed when the context is made; the
 * containers fill up as the passes run (prepare.ts, steps.ts, assemble.ts). */
export interface Codegen {
  readonly project: Project;
  readonly formulas: ResolvedFormulas;
  readonly options: CodegenOptions;
  readonly target: Target;
  readonly dialect: Dialect;
  readonly fps: number;
  readonly sceneName: string;
  /** buildEvents(project), once per export. */
  readonly events: SceneEvent[];
  /** clipLifetimes(project): which glyphs come back after a disappear block, and which leave
   * with the clip end. */
  readonly lifetimes: Map<ClipId, ClipLifetime>;
  readonly attachments: AttachmentPlan;
  /** The project's camera, when it has one that does something (camera.ts); null otherwise, and
   * the file is then the one of a project without a camera. */
  readonly camera: CameraPlan | null;
  /** Per clip: when each tween ends and the state it leaves (`endsAtStart`: its start). */
  readonly settled: Map<string, { end: number; state: ClipState }[]>;
  /** Python names taken so far (the scene class, the mobjects, the variables of animations
   * played in parts, pivots). */
  readonly names: NameAllocator;
  readonly issues: Issue[];
  readonly formulaCtx: Map<string, FormulaCtx>;
  readonly clipCtx: Map<string, ClipCtx>;
  readonly helpers: Set<Helper>;
  /** Clips whose glyph list stays only if the scene reads it (glyphs.ts). */
  readonly onDemandLists: Set<ClipCtx>;
  /** Lines of `construct` that make the mobjects. */
  readonly setup: string[];
  /** Lines of `construct` that play the timeline. */
  readonly body: string[];
  /** The marks of the Slides mode the scene carries, in order (`exportedMarks` of the project
   * with its sound: a mark in the tail where only sound plays is one of them, though the scene is
   * the visual part of the project). */
  readonly marks: readonly SlideMark[];
}

export function createContext(
  project: Project,
  formulas: ResolvedFormulas,
  options: CodegenOptions,
  marks: readonly SlideMark[] = [],
): Codegen {
  const target = options.target;
  const camera = cameraPlan(project);
  // A scene with a camera uses a few names more: its class is not called as one of them.
  const sceneName = effectiveSceneName(project, options.sceneName);
  const lifetimes = clipLifetimes(project);
  const events = buildEvents(project, lifetimes);
  const settled = new Map<string, { end: number; state: ClipState }[]>();
  for (const event of events) {
    if (event.kind !== 'tween') continue;
    const list = settled.get(event.clipId) ?? [];
    list.push({ end: event.end, state: endsAtStart(event.easing) ? event.from : event.to });
    settled.set(event.clipId, list);
  }
  return {
    project,
    formulas,
    options,
    target,
    dialect: DIALECTS[target],
    fps: project.meta.fps,
    sceneName,
    events,
    lifetimes,
    attachments: attachmentPlan(project),
    camera,
    settled,
    names: new NameAllocator([...EMITTED_SYMBOLS, sceneName, ...(camera ? CAMERA_SYMBOLS : [])]),
    issues: [],
    formulaCtx: new Map(),
    clipCtx: new Map(),
    helpers: new Set(),
    onDemandLists: new Set(),
    setup: [],
    body: [],
    marks,
  };
}
