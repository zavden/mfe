/* Scene contract: the project as a flat list of timed events, and the drawables the
 * evaluator produces for one instant (docs/ARCHITECTURE.md, "Time model").
 *
 * Events are the single source of truth for timing. The preview (evaluator) and the code
 * exporter both consume `buildEvents(project)`, which is what keeps them in agreement. */
import type { Box, Contour, Mat2D, PointPath, Vec2 } from '../geom';
import type { ManimBoxes } from './measure';
import type { FitSize } from './state';
import type {
  ActionId,
  AppearKind,
  ClipId,
  ClipState,
  DisappearKind,
  Easing,
  EmphasisKind,
  GlyphTarget,
  IntroKind,
  OutroKind,
  PairExtras,
  PairRoute,
  PathSpline,
  RelationStyle,
  TransferOrigin,
  TweenEnds,
} from '../model';

interface EventBase {
  /** Stable: `intro:<clipId>`, `outro:<clipId>`, the transfer key for a transfer
   * (`relation:<relationId>`, `morph:<actionId>`), and `<kind>:<actionId>` for the other actions
   * (`tween:…`, `appear:…`, `disappear:…`, `transform:…`, `emphasis:…`). */
  id: string;
  /** Absolute seconds, half-open [start, end). start === end for instantaneous events. */
  start: number;
  end: number;
  easing: Easing;
}

/** Brings in the clip's glyphs except those that arrive through transfer pairs, the formula's
 * hidden glyphs and those waiting for an appear block (model/lifetime.ts decides which glyphs
 * every event below animates). */
export interface IntroEvent extends EventBase {
  kind: 'intro';
  clipId: ClipId;
  anim: IntroKind;
  /** Canonical glyphs this intro does not animate (targets of incoming transfer pairs — a
   * relation's or a Morph block's —, hidden glyphs of the formula, glyphs waiting for an appear
   * block). */
  except: number[];
  /** null = Manim default for the animated glyph count and target (see lag.ts). */
  lagRatio: number | null;
  shift: Vec2;
  scale: number;
}

/** Takes out the clip's glyphs except those consumed by transfer pairs (relations, Morph
 * blocks). */
export interface OutroEvent extends EventBase {
  kind: 'outro';
  clipId: ClipId;
  anim: OutroKind;
  /** Canonical glyphs this outro does not animate: those off screen when it starts (consumed by
   * transform/fade pairs, taken out by a disappear action, hidden glyphs nothing brings in) and
   * those a pair consumes later. */
  except: number[];
  lagRatio: number | null;
  shift: Vec2;
  scale: number;
}

/** Animates a whole clip between two fully resolved states. */
export interface TweenEvent extends EventBase {
  kind: 'tween';
  clipId: ClipId;
  actionId: ActionId;
  from: ClipState;
  to: ClipState;
  /** The tween carries its shape to other glyphs (`TweenFit`, fitted): the sizes the shape is
   * drawn at when it starts, when it has arrived and once it has ended (`ActionStates.fit`) —
   * `to` is then where the fit puts it. */
  fit?: { from: FitSize; to: FitSize; after: FitSize };
  /** The tween carries the ends of its line (`TweenEnds`, measured): `to` is then where the
   * centre of the line it leaves is (`scene/lineStates.ts`). */
  ends?: TweenEnds;
}

export interface ResolvedPair {
  from: number[];
  to: number[];
  /** Authored consuming source for Copies, preserved across canonical rebases. */
  principal?: number | null;
  /** Pair style with the transfer's default (the relation's or the Morph block's) applied. */
  style: RelationStyle;
  /** How several sources reach one target (`effectiveExtras`). */
  extras: PairExtras;
  /** The pair's custom path (D48); null = the transfer's `pathArc`. */
  path: PathSpline | null;
  /** The routes of the pair with a path of their own (D167), which they follow instead. */
  routes: PairRoute[];
}

/** A glyph transfer (`model/transfers.ts`: the pairs of a relation, or of a Morph block — then
 * `fromClipId === toClipId`), played as one morph over its window. */
export interface TransferEvent extends EventBase {
  kind: 'transfer';
  /** `GlyphTransfer.key`: what the lifetime causes refer to. */
  key: string;
  origin: TransferOrigin;
  fromClipId: ClipId;
  toClipId: ClipId;
  /** Degrees. */
  pathArc: number;
  pairs: ResolvedPair[];
}

/** An `appear` action: brings `glyphs` (off screen until then) onto the screen, animated like an
 * intro of the same kind on those glyphs only. */
export interface AppearEvent extends EventBase {
  kind: 'appear';
  clipId: ClipId;
  actionId: ActionId;
  anim: AppearKind;
  /** The glyphs that really appear, ascending, never empty. */
  glyphs: number[];
  lagRatio: number | null;
  shift: Vec2;
  scale: number;
}

/** A `disappear` action: takes `glyphs` off the screen, animated like an outro of the same kind
 * on those glyphs only. */
export interface DisappearEvent extends EventBase {
  kind: 'disappear';
  clipId: ClipId;
  actionId: ActionId;
  anim: DisappearKind;
  /** The glyphs that really leave, ascending, never empty. */
  glyphs: number[];
  lagRatio: number | null;
  shift: Vec2;
  scale: number;
}

/** A `transform` action: moves and restyles `glyphs` relative to where they are (on screen or
 * not). The fields are those of PartTransformAction. */
export interface PartTransformEvent extends EventBase {
  kind: 'transform';
  clipId: ClipId;
  actionId: ActionId;
  /** Ascending, never empty. */
  glyphs: number[];
  shift: Vec2;
  scale: number;
  /** Degrees. */
  rotation: number;
  color: string | null;
  opacity: number | null;
}

/** An `emphasis` action (D73): draws attention to `glyphs` (those on screen when the block
 * starts) over its window and leaves them as they were. The fields are those of EmphasisAction;
 * what each effect does with them is in anim/emphasis.ts. */
export interface EmphasisEvent extends EventBase {
  kind: 'emphasis';
  clipId: ClipId;
  actionId: ActionId;
  effect: EmphasisKind;
  /** Ascending, never empty. */
  glyphs: number[];
  color: string;
  scale: number;
  /** Degrees. */
  angle: number;
  wiggles: number;
  buff: number;
  strokeWidth: number;
  timeWidth: number;
  opacity: number;
}

export type SceneEvent =
  | IntroEvent
  | OutroEvent
  | TweenEvent
  | TransferEvent
  | AppearEvent
  | DisappearEvent
  | PartTransformEvent
  | EmphasisEvent;

/** Cubic path in scene units (see geom Contour). */
export interface CubicPath {
  contours: Contour[];
}

export interface Paint {
  color: string;
  /** 0…1, already multiplied by clip opacity and animation alpha. */
  opacity: number;
}

export interface StrokePaint extends Paint {
  /** Manim stroke_width units: 1 unit = 0.01 scene units (ManimCE Cairo convention). */
  width: number;
}

/** One thing to draw at one instant. Paths are final (scene units): the renderer only maps
 * scene units to pixels. Draw order: ascending `z`, then array order. */
export interface Drawable {
  /** `<clipId>:<canonical glyph>`, unique per instant. Morph pieces: `transform` uses the source
   * glyph's key (padding copies add a `~n` suffix), `copy` the target glyph's key (the source
   * is still drawn), `fade` source keys for source pieces and target keys for target pieces;
   * `fade_copy` as `fade`, its source pieces — copies: the sources are still drawn — with a `~`.
   * A key taken by another piece drawn then — of a pair of the same transfer, or of a transfer
   * whose window overlaps — gets one more `~n` (`buildMorph`'s `used`). */
  key: string;
  clipId: ClipId;
  /** Canonical glyph index in the clip's formula; −1 for a temporary effect of the clip. */
  glyph: number;
  path: CubicPath;
  fill: Paint | null;
  stroke: StrokePaint | null;
  z: number;
  /** An object of the project (what a click selects and the editing tools measure), or a
   * temporary effect drawn over the scene (an emphasis flash) that no click selects. */
  role: 'object' | 'temp';
  /** The path is a cut of the glyph's (an outline being traced, a glyph being created): where
   * the cut lands differs a little between the preview and a library, which the export check
   * allows for. */
  partial: boolean;
  /** On a piece of a transfer in flight — of a relation, or of a Morph block —, the key of that
   * transfer (`TransferEvent.key`); absent on a clip's own glyph and on a temporary effect. What
   * a drawing that keeps the scene's structure tells the pieces in flight by (the stage of the
   * exported page, `deck/`); the canvas does not read it. */
  transfer?: string;
}

/** One glyph's point list as Manim holds it (`toPointPath`): as the render has it, in the formula's
 * own frame, and placed at an instant. */
export interface GlyphPoints {
  /** The canonical glyph. */
  glyph: number;
  local: PointPath;
  placed: PointPath;
}

/** Where a clip's formula is at an instant: the box of every glyph — placed by the clip's state
 * and its part transforms, drawn or not (hidden glyphs, glyphs still to arrive or being written
 * count) — and their union, the whole formula's box as Manim's own would be. What the editing
 * tools measure (snapping, marquee, group handles, align, distribute, align by symbol). */
export interface ClipGeometry {
  clipId: ClipId;
  box: Box;
  glyphs: Map<number, Box>;
}

export interface SceneEvaluator {
  readonly duration: number;
  readonly events: readonly SceneEvent[];
  /** Pure: the same t always yields the same drawables. t is clamped to [0, duration]; clip
   * intervals are half-open except at t = duration, which shows the final state. The returned
   * drawables and their paths may be shared with internal caches: do not mutate them. */
  evaluate(t: number): Drawable[];
  /** The geometry of the clips on screen at t (the same rule as `evaluate`), in the project's
   * order; a clip whose formula has no ink is left out. */
  geometry(t: number): ClipGeometry[];
  /** The boxes Manim would read over `glyphs` of a clip at t — every one of them, drawn or not,
   * where the clip's state and its part transforms put it, measured as the project's library
   * measures (measure.ts: the anchors for ManimCE's corners and centres, every point otherwise),
   * in the scene's frame or turned by `frame` first (a brace reads its target in the frame where
   * it points down). Null for a clip the evaluator does not draw, or when none of the glyphs has
   * ink. What places the objects attached to those glyphs (attach.ts). */
  measure(clipId: ClipId, glyphs: GlyphTarget, t: number, frame?: Mat2D): ManimBoxes | null;
  /** The point lists `measure` boxes, glyph by glyph in canonical order: each as rendered and as
   * placed at t (turned by `frame` first) — what a label reads the tip of its brace from. Null
   * for a clip the evaluator does not draw; glyphs without ink are left out. */
  points(clipId: ClipId, glyphs: GlyphTarget, t: number, frame?: Mat2D): GlyphPoints[] | null;
}
