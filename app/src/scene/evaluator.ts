/* Scene evaluator: the drawables of the whole scene at time t (docs/ARCHITECTURE.md, "Time
 * model", "Animation catalogue" and "Rendering").
 *
 * Conventions (shared with the renderer and the exporter):
 *   - formula data (colours) comes from `project.formulas`; `formulas` supplies the render and
 *     canonToRender; a clip whose formula has no render yet draws nothing;
 *   - one Drawable per visible canonical glyph, key `<clipId>:<glyph>`; a glyph that is neither
 *     fully visible nor partially drawn at t produces no drawable;
 *   - z: the top visual track is front-most; audio rows do not change visual depths;
 *   - clips on hidden tracks are skipped unless `includeHidden`;
 *   - strokes use Manim `stroke_width` units (1 unit = 0.01 scene units).
 *
 * `evaluate(t)` is pure and deterministic: the result depends on `t` and the arguments of
 * `createEvaluator` only, never on earlier calls (the internal caches only memoise values that
 * are functions of their keys). Preview playback, scrubbing and the frames of an exported video
 * therefore agree. The returned arrays are shared with those caches: do not mutate them.
 *
 * Time. `t` is clamped to [0, duration]. Clip intervals are half-open, except that the *end of
 * the scene is inclusive*: at t = duration a clip that ends there is drawn in its final state
 * (an outro of kind `none` leaves it visible; a finished fade or unwrite leaves nothing). This is
 * what playback shows when it stops at the end, and what Manim shows after its last animation.
 * Video frames use t = k / fps for k < round(duration · fps), so they never reach the end.
 *
 * Timing is derived from `buildEvents` and `clipLifetimes` (model/lifetime.ts) only, never
 * re-derived here. A glyph can come on screen and leave it several times within its clip; each
 * stay is a *stint* (ARCHITECTURE §5, "Glyph lifetime"): it enters through the intro, an appear
 * block or an incoming transfer pair (a relation's or a Morph block's), and leaves through the
 * outro, a disappear block, a consuming pair or the clip end. The glyph is drawn iff a stint
 * covers t (enter start ≤ t < exit end, plus the scene-end rule above unless a pair takes it),
 * animated by
 *   - the exit's animation once it has started (outro, disappear: the outro looks);
 *   - else the enter's animation while it runs (intro, appear: the intro looks) — and after it,
 *     its final look when the easing does not end at 1 (`settled`);
 *   - a transfer pair's morph during its window (the glyph itself is not drawn then);
 *   - otherwise plainly, in the clip's state at t — also when it comes back after a disappear:
 *     the exporter restores what a remover took (ARCHITECTURE §8), and while off screen the glyph
 *     follows the clip's tweens.
 * Every intro, outro, appear and disappear is one Manim animation over a group of glyphs, so all
 * four share one `Plan` (order, lag, rate, centre) and the same looks; blocks on different
 * glyphs run at the same time independently.
 *
 * Transfers. The pairs of a relation and those of a Morph block reach the evaluator alike, as
 * transfer events (model/transfers.ts); a Morph block's is a transfer from its clip to itself.
 * Each pair is built once, when the evaluator is created, into a morph (anim/morph.ts: Manim's
 * ReplacementTransform / TransformFromCopy / FadeTransform on VGroups of the glyphs, with the
 * point alignment of geom/morph.ts). It starts from the source clip's state at the window start
 * and ends at the target clip's state at the window end — for a Morph block both are the one
 * clip's, at the two ends of the window; validation keeps tweens out of the windows, so both are
 * the clips' plain states. During the window the morph's drawables replace the plain glyphs
 * involved: target glyphs are not drawn, consumed sources are not drawn, copied sources stay.
 * Per frame only the interpolation runs; the alignment is cached by the shapes of the two
 * glyphs. When a clip of a relation is not drawn (hidden track, no render) the visible one falls
 * back to a plain cross-fade of its glyphs.
 *
 * How each animation looks per glyph (stroke, fill, partial paths, CE/GL differences) is in
 * anim/looks.ts; how Manim lags and eases the glyphs of one animation is in anim/progress.ts and
 * `makePlan` below; the clip's own placement over time is anim/pose.ts. `measure(clipId, glyphs,
 * t)` reads what Manim's boxes would be over some glyphs at t (measure.ts), for the objects
 * attached to them (attach.ts) and for the Emphasis effects that measure their glyphs when they
 * start (anim/emphasis.ts: a Circumscribe, a Flash and a FocusOn draw a temporary mobject from
 * that, `role: 'temp'`; an Indicate and a Wiggle are part motions). */
import {
  applyToPoint,
  IDENTITY,
  multiply,
  transformBox,
  transformContour,
  transformPointPath,
  unionBox,
  type ArrowTrace,
  type Box,
  type Contour,
  type Mat2D,
  type Vec2,
} from '../geom';
import type { ResolvedFormula, ResolvedFormulas } from '../engine';
import {
  clipLifetimes,
  frameWidth,
  introWindow,
  onScreenAt,
  outroWindow,
  sceneDuration,
  TIME_EPSILON,
  type Clip,
  type ClipId,
  type Easing,
  type Formula,
  type GlyphMembers,
  type GlyphStyle,
  type GlyphTarget,
  type IntroKind,
  type OutroKind,
  type Project,
  type ProjectMeta,
  type Span,
  type Stint,
  type Target,
  EMPHASIS,
  glyphMembers,
  sourceRoles,
  TEXT_STYLE,
  tracesAsArrow,
} from '../model';
import {
  introLook,
  outroIsReversed,
  outroLook,
  paintsOf,
  type Look,
  type LookInput,
} from './anim/looks';
import { buildTemp, emphasisMotion, tempLooks, type TempShape } from './anim/emphasis';
import { buildEndsTrack, type EndsTrack } from './anim/ends';
import { buildFitTrack, type FitTrack, type ShapedGlyphs } from './anim/fit';
import { buildMorph, morphDrawables, pointPathOf, type Morph } from './anim/morph';
import { manimBoxes, manimCenter, type ManimBoxes } from './measure';
import { buildPartSegments, partStateAt, PLAIN_PART, type PartSegment } from './anim/part';
import { poseAt, type Pose } from './anim/pose';
import { subProgress } from './anim/progress';
import { rateFunction, type RateFunction } from './easing';
import { buildEvents } from './events';
import { lineEndsLocal, lineTraceLocal } from './lines';
import { trackDepths } from './placement';
import { defaultLagRatio } from './lag';
import type {
  AppearEvent,
  ClipGeometry,
  DisappearEvent,
  Drawable,
  EmphasisEvent,
  GlyphPoints,
  IntroEvent,
  OutroEvent,
  PartTransformEvent,
  SceneEvaluator,
  TransferEvent,
  TweenEvent,
} from './types';

export interface EvaluatorOptions {
  /** Draw clips on hidden tracks too (default false: hiding is a preview toggle). */
  includeHidden?: boolean;
  /** The pixels of the picture being made, when they are not the project's: a video exported at
   * another size. The scene's frame is that picture's then, 8 units tall and as wide as its
   * pixels make it, as it is in the Manim that renders that size, and what an animation reads
   * from the frame (the disc of a FocusOn) it reads from this one. */
  frame?: Pick<ProjectMeta, 'width' | 'height'>;
}

/** An animation that brings glyphs on screen or takes them off it, one Manim animation over a
 * group of glyphs: the intro, the outro, an appear or a disappear action. */
type GlyphEvent = IntroEvent | OutroEvent | AppearEvent | DisappearEvent;

/** The glyphs a glyph event animates and how Manim would order and lag them. */
interface Plan {
  event: GlyphEvent;
  /** Takes glyphs off the screen (outro, disappear): drawn with the outro looks. */
  exits: boolean;
  /** Glyph → position in Manim's submobject order for this animation. */
  position: Map<number, number>;
  count: number;
  lag: number;
  rate: RateFunction;
  reverse: boolean;
  /** Progress every glyph holds once the animation has finished. */
  settled: number;
  /** Scene-space centre of the animated glyphs, per placement matrix (and part states). */
  centers: Map<string, Vec2>;
  /** The centre last asked for, at that time: every glyph of the plan asks once per frame. */
  lastCenter: { time: number; center: Vec2 } | null;
}

/** How a glyph comes on screen or leaves it: absolute seconds, plus what animates it then. */
interface Edge {
  start: number;
  end: number;
  /** The animation that draws the glyph during [start, end); null for an instant change, for a
   * zero-length animation and for a transfer pair. */
  plan: Plan | null;
  /** Set when a transfer pair (a relation's or a Morph block's) moves the glyph: its rate, and
   * whether a morph draws it during the window (otherwise a plain cross-fade stands in). */
  relation: { rate: RateFunction; morphed: boolean } | null;
}

/** One stay on screen (model/lifetime.ts `Stint`), resolved for drawing. */
interface GlyphStint {
  enter: Edge;
  exit: Edge;
}

interface GlyphRuntime {
  glyph: number;
  /** Its place among the clip's drawable glyphs (`ClipRuntime.glyphs`). */
  slot: number;
  local: readonly Contour[];
  /** The box of `local`. */
  localBox: Box;
  /** The glyph's own style (the render's, or a text glyph's). */
  style: GlyphStyle;
  /** In time order; a glyph that is never on screen has none. */
  stints: GlyphStint[];
}

interface ClipRuntime {
  clip: Clip;
  formula: Formula;
  glyphs: GlyphRuntime[];
  byGlyph: Map<number, GlyphRuntime>;
  tweens: TweenEvent[];
  intro: Plan | null;
  outro: Plan | null;
  /** Plans of the appear and disappear actions, by action id. */
  actions: Map<string, Plan | null>;
  z: number;
  /** Part transforms acting on each glyph (scene/anim/part.ts). */
  parts: Map<number, PartSegment[]>;
  /** A shape whose tweens carry it to other glyphs (anim/fit.ts), or a line whose tweens carry
   * its ends (anim/ends.ts, also in `ends`): what it is shaped like at each instant; null for a
   * clip that is drawn from its render alone. */
  fit: FitTrack | null;
  ends: EndsTrack | null;
  /** Memo of each glyph's plain paths, with the key of the matrix that made them. */
  staticPaths: Map<number, { key: string; paths: Contour[] }>;
}

/** One transfer pair, ready to play. */
interface RelationMorph {
  start: number;
  end: number;
  rate: RateFunction;
  morph: Morph;
  z: number;
  /** The key of the transfer it is a pair of. */
  transfer: string;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** The order an Unwrite erases `animated` (ascending) in. ManimCE's inverts every list of
 * submobjects (`invert(recursive=True)`), so the last glyph goes first, but a mobject stays before
 * its own submobjects in its family: the shaft of an arrow (`family`: the line itself, glyph 0)
 * goes first, then its tips from the last. ManimGL's `_Unwrite` (the exporter's) erases in that
 * order too. */
function unwriteOrder(animated: readonly number[], members: GlyphMembers): number[] {
  if (members === 'family' && animated[0] === 0) return [0, ...animated.slice(1).reverse()];
  return [...animated].reverse();
}

export function createEvaluator(
  project: Project,
  formulas: ResolvedFormulas,
  options: EvaluatorOptions = {},
): SceneEvaluator {
  // Events and glyph stays use one simulation of this project, local to this evaluator.
  const lifetimes = clipLifetimes(project);
  const events = buildEvents(project, lifetimes);
  const duration = sceneDuration(project);
  const target: Target = project.meta.target;
  const formulaById = new Map(project.formulas.map((f) => [f.id, f]));
  const zByTrack = trackDepths(project);
  const hidden = new Set(project.tracks.filter((t) => t.hidden).map((t) => t.id));

  const rates = new Map<Easing, RateFunction>();
  const rateOf = (easing: Easing): RateFunction => {
    let r = rates.get(easing);
    if (!r) {
      r = rateFunction(easing, target);
      rates.set(easing, r);
    }
    return r;
  };

  // Events grouped by clip.
  const introByClip = new Map<string, IntroEvent>();
  const outroByClip = new Map<string, OutroEvent>();
  const tweensByClip = new Map<string, TweenEvent[]>();
  const blocksByClip = new Map<string, (AppearEvent | DisappearEvent)[]>();
  const partsByClip = new Map<string, PartTransformEvent[]>();
  const emphasisByClip = new Map<string, EmphasisEvent[]>();
  const transferByKey = new Map<string, TransferEvent>();
  const push = <V>(map: Map<string, V[]>, key: string, value: V) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const event of events) {
    if (event.kind === 'intro') introByClip.set(event.clipId, event);
    else if (event.kind === 'outro') outroByClip.set(event.clipId, event);
    else if (event.kind === 'tween') push(tweensByClip, event.clipId, event);
    else if (event.kind === 'appear' || event.kind === 'disappear') {
      push(blocksByClip, event.clipId, event);
    } else if (event.kind === 'transfer') transferByKey.set(event.key, event);
    else if (event.kind === 'transform') push(partsByClip, event.clipId, event);
    else if (event.kind === 'emphasis') push(emphasisByClip, event.clipId, event);
  }

  /** `animated`: the glyphs the event animates, ascending canonical order; `formula`, the
   * clip's object. */
  function makePlan(event: GlyphEvent, animated: number[], formula: Formula): Plan | null {
    if (event.anim === 'none' || event.end - event.start <= TIME_EPSILON) return null;
    if (animated.length === 0) return null;
    const exits = event.kind === 'outro' || event.kind === 'disappear';
    const members = glyphMembers(formula, target);
    // Unwrite is Write with `reverse=True`: the last glyph is erased first, and an arrow's shaft
    // before its tips (`unwriteOrder`). GL has no Unwrite; the exporter mirrors CE's.
    const order = event.anim === 'unwrite' ? unwriteOrder(animated, members) : animated;
    // ManimGL animates `mobject.get_family()`, which starts with the mobject itself (the formula,
    // or the VGroup of the glyphs an action animates, neither of which has points): it takes lag
    // slot 0 and every glyph moves one slot back. The default lag ratio of Write already accounts
    // for it (`4 / (n + 1)`). ManimCE zips `family_members_with_points()`, i.e. the glyphs only.
    // A mobject that is its one glyph itself (a box, a circle: `glyphMembers`) has a family of
    // one, and one that is its first glyph (an arrow: the line, then its tips) starts its family
    // with a glyph: no slot — except under Unwrite, which ManimGL lacks: the exporter's
    // `_Unwrite` wraps the glyphs in a VGroup of their own, and the slot is back.
    const slot =
      target === 'gl' && (event.anim === 'unwrite' || (members !== 'self' && members !== 'family'))
        ? 1
        : 0;
    const reverse = exits && outroIsReversed(event.anim as OutroKind);
    const rate = rateOf(event.easing);
    return {
      event,
      exits,
      position: new Map(order.map((g, i) => [g, i + slot])),
      count: order.length + slot,
      lag: event.lagRatio ?? defaultLagRatio(event.anim, order.length, target),
      rate,
      reverse,
      // Where the animation ends up (Manim's `finish()` interpolates at alpha 1). Every easing
      // but there_and_back ends at "fully present" for intros.
      settled: reverse ? rate(0) : rate(1),
      centers: new Map(),
      lastCenter: null,
    };
  }

  const runtimes: ClipRuntime[] = [];
  for (const clip of project.clips) {
    if (!options.includeHidden && hidden.has(clip.trackId)) continue;
    const formula = formulaById.get(clip.formulaId);
    const resolved: ResolvedFormula | undefined = formulas.get(clip.formulaId);
    const intro = introByClip.get(clip.id);
    const outro = outroByClip.get(clip.id);
    if (!formula || !resolved || !intro || !outro) continue;

    const glyphs: GlyphRuntime[] = [];
    resolved.canonToRender.forEach((renderIndex, glyph) => {
      const g = renderIndex === null ? undefined : resolved.render.glyphs[renderIndex];
      if (g && g.contours.some((c) => c.length >= 8)) {
        glyphs.push({
          glyph,
          slot: glyphs.length,
          local: g.contours,
          localBox: g.bbox,
          style: g.style ?? TEXT_STYLE,
          stints: [],
        });
      }
    });
    const drawable = glyphs.map((g) => g.glyph);
    const except = (list: number[]) => {
      const skip = new Set(list);
      return drawable.filter((g) => !skip.has(g));
    };
    const only = (list: number[]) => {
      const keep = new Set(list);
      return drawable.filter((g) => keep.has(g));
    };
    const actions = new Map<string, Plan | null>();
    for (const event of blocksByClip.get(clip.id) ?? []) {
      actions.set(event.actionId, makePlan(event, only(event.glyphs), formula));
    }
    const tweens = (tweensByClip.get(clip.id) ?? []).sort((a, b) => a.start - b.start);
    const parts = buildPartSegments({
      // The part transforms, and the Emphasis blocks that move the glyphs (anim/emphasis.ts).
      events: [
        ...(partsByClip.get(clip.id) ?? []),
        ...(emphasisByClip.get(clip.id) ?? []).flatMap(
          (e) => emphasisMotion(e, rateOf('there_and_back')) ?? [],
        ),
      ],
      local: new Map(glyphs.map((g) => [g.glyph, g.local])),
      tweens,
      formula,
      target,
      poseAt: (t) => poseAt(clip.initial, tweens, t, formula, target),
      rateOf,
      gone: (glyph, t) => {
        const last = lifetimes.get(clip.id)?.stints.get(glyph)?.at(-1);
        return !!last && last.exit.start <= t + TIME_EPSILON;
      },
    });

    const own = glyphs.map((g) => ({ glyph: g.glyph, local: g.local, box: g.localBox }));
    const ends =
      formula.kind === 'line'
        ? buildEndsTrack({
            formula,
            target,
            tweens,
            own,
            ownStyles: glyphs.map((g) => g.style),
            rateOf,
          })
        : null;
    runtimes.push({
      clip,
      formula,
      glyphs,
      byGlyph: new Map(glyphs.map((g) => [g.glyph, g])),
      tweens,
      intro: makePlan(intro, except(intro.except), formula),
      outro: makePlan(outro, except(outro.except), formula),
      actions,
      z: zByTrack.get(clip.trackId) ?? 0,
      parts,
      fit:
        formula.kind === 'shape' ? buildFitTrack({ formula, target, tweens, own, rateOf }) : ends,
      ends,
      staticPaths: new Map(),
    });
  }

  /** A glyph's contours, their box and the matrix that places them at an instant: the render's
   * under `matrix` (the glyph's own, `glyphAt`), or — for a shape a tween carried elsewhere,
   * `shaped` — the ones it has then, which are in the scene's frame already while that tween runs.
   * `key` identifies the result for caches, '' when it is of this instant alone. */
  function shapeOf(
    glyph: GlyphRuntime,
    shaped: ShapedGlyphs | null,
    at: { matrix: Mat2D; key: string },
  ): { local: readonly Contour[]; box: Box; matrix: Mat2D; key: string } {
    if (!shaped) return { local: glyph.local, box: glyph.localBox, ...at };
    return {
      local: shaped.locals[glyph.slot]!,
      box: shaped.boxes[glyph.slot]!,
      matrix: shaped.placed ? IDENTITY : at.matrix,
      key: shaped.placed || at.key === '' ? '' : `${at.key}|${shaped.key}`,
    };
  }

  /** A glyph's own matrix and overrides at `time`: the clip's pose with the glyph's part state.
   * `key` identifies the matrix for caches, '' while a part block is moving the glyph. */
  function glyphAt(rt: ClipRuntime, glyph: number, pose: Pose, time: number) {
    const part = partStateAt(rt.parts.get(glyph), time);
    if (part === PLAIN_PART) {
      return { matrix: pose.matrix, key: pose.matrixKey, color: null, opacity: null };
    }
    return {
      matrix: multiply(pose.matrix, part.matrix),
      key: part.key === '' ? '' : `${pose.matrixKey}|${part.key}`,
      color: part.color,
      opacity: part.opacity,
    };
  }

  // Morphs of the transfer pairs; the glyphs they take over from the plain drawing.
  const morphs: RelationMorph[] = [];
  const morphedIn = new Set<string>(); // `<clipId>:<glyph>` of targets drawn by a morph
  const morphedOut = new Set<string>(); // `<clipId>:<glyph>` of consumed sources
  const runtimeOf = new Map(runtimes.map((rt) => [rt.clip.id, rt]));
  /** The keys the pieces of each transfer built so far took, with its window. */
  const taken: { start: number; end: number; keys: ReadonlySet<string> }[] = [];
  for (const event of events) {
    if (event.kind !== 'transfer' || event.end - event.start <= TIME_EPSILON) continue;
    const from = runtimeOf.get(event.fromClipId);
    const to = runtimeOf.get(event.toClipId);
    if (!from || !to) continue;
    const fromPose = poseAt(from.clip.initial, from.tweens, event.start, from.formula, target);
    const toPose = poseAt(to.clip.initial, to.tweens, event.end, to.formula, target);
    const stateOf = (rt: ClipRuntime, pose: Pose, glyph: number, time: number) => {
      const g = rt.byGlyph.get(glyph);
      if (!g) return null;
      const at = glyphAt(rt, glyph, pose, time);
      return {
        local: g.local,
        matrix: at.matrix,
        color: at.color ?? pose.colorOf(glyph),
        opacity: at.opacity ?? pose.opacity,
        style: g.style,
        clipId: rt.clip.id,
        glyph,
      };
    };
    // Pairs of one transfer can bring the same targets (D167): their pieces share the keys. So
    // do transfers drawn at the same instant: two that fade a copy of one source, or pad it, at a
    // time would name their copies alike (audit A3-02). A transfer starts from the keys of those
    // before it, in the order of the events, whose window overlaps its own; one that plays at
    // other times keeps the keys it has alone (the ghosts and the glyph cursor read them).
    const keys = new Set<string>();
    for (const other of taken) {
      if (other.start < event.end - TIME_EPSILON && event.start < other.end - TIME_EPSILON) {
        for (const key of other.keys) keys.add(key);
      }
    }
    const before = new Set(keys);
    for (const pair of event.pairs) {
      const src = pair.from.flatMap((g) => stateOf(from, fromPose, g, event.start) ?? []);
      const dst = pair.to.flatMap((g) => stateOf(to, toPose, g, event.end) ?? []);
      if (src.length === 0 || dst.length === 0) continue;
      const morph = buildMorph(
        {
          style: pair.style,
          target,
          pathArc: (event.pathArc * Math.PI) / 180,
          src,
          dst,
          extras: pair.extras,
          path: pair.path,
          routes: pair.routes,
          principal: pair.principal,
        },
        keys,
      );
      if (morph.pieces.length === 0) continue;
      morphs.push({
        start: event.start,
        end: event.end,
        rate: rateOf(event.easing),
        morph,
        z: Math.max(from.z, to.z),
        transfer: event.key,
      });
      for (const g of dst) morphedIn.add(`${g.clipId}:${g.glyph}`);
      // Consumed sources leave through the pair; copied ones (a `copy` pair, or the extras of a
      // `copies` pair) stay drawn in place while their copy travels.
      const consumed = new Set(sourceRoles(pair, pair.style).consumed);
      for (const g of src) {
        if (consumed.has(g.glyph)) morphedOut.add(`${g.clipId}:${g.glyph}`);
      }
    }
    taken.push({
      start: event.start,
      end: event.end,
      keys: new Set([...keys].filter((key) => !before.has(key))),
    });
  }

  // Every glyph's stays on screen, from the shared glyph lifetime.
  for (const rt of runtimes) {
    const life = lifetimes.get(rt.clip.id);
    const edge = (span: Span, glyph: number, entering: boolean): Edge => {
      const { cause } = span;
      let plan: Plan | null = null;
      let relation: Edge['relation'] = null;
      if (cause.kind === 'intro') plan = rt.intro;
      else if (cause.kind === 'outro') plan = rt.outro;
      else if (cause.kind === 'action') plan = rt.actions.get(cause.actionId) ?? null;
      else if (cause.kind === 'transfer') {
        const event = transferByKey.get(cause.key);
        relation = {
          rate: rateOf(event?.easing ?? 'linear'),
          morphed: (entering ? morphedIn : morphedOut).has(`${rt.clip.id}:${glyph}`),
        };
      }
      if (plan && !plan.position.has(glyph)) plan = null;
      return { start: span.start, end: span.end, plan, relation };
    };
    // A glyph the lifetime does not know (a formula without a snapshot yet) is a plain glyph of
    // the clip: the intro brings it, the outro takes it.
    const plainStint: Stint = {
      enter: { ...introWindow(rt.clip), cause: { kind: 'intro' } },
      exit: { ...outroWindow(rt.clip), cause: { kind: 'outro' } },
    };
    const known = new Set(life?.glyphs ?? []);
    for (const glyph of rt.glyphs) {
      const g = glyph.glyph;
      const stints = known.has(g) ? (life!.stints.get(g) ?? []) : [plainStint];
      glyph.stints = stints.map((s) => ({
        enter: edge(s.enter, g, true),
        exit: edge(s.exit, g, false),
      }));
    }
  }

  // The temporary drawings of the Emphasis effects that only measure their glyphs when they
  // start (anim/emphasis.ts): a Circumscribe's frame, a Flash's lines, a FocusOn's disc, each
  // built from what Manim reads over the glyphs at the block's start (`measure`) and drawn on
  // the clip's layer after its glyphs, as Manim adds them — the disc over every track.
  const sceneWidth = frameWidth(options.frame ?? project.meta);
  const temps: { event: EmphasisEvent; z: number; rate: RateFunction; shape: TempShape }[] = [];
  for (const [clipId, list] of emphasisByClip) {
    const rt = runtimeOf.get(clipId);
    if (!rt) continue;
    for (const event of list) {
      if (EMPHASIS[event.effect].animates || event.end - event.start <= TIME_EPSILON) continue;
      const boxes = measure(clipId, event.glyphs, event.start);
      const shape = boxes && buildTemp(event, boxes, target, sceneWidth);
      if (!shape) continue;
      const z = event.effect === 'focus_on' ? zByTrack.size : rt.z;
      temps.push({ event, z, rate: rateOf(event.easing), shape });
    }
  }

  /** Paths of a glyph in its plain state under `matrix` (`key` as `glyphAt` gives it). */
  function plainPaths(rt: ClipRuntime, glyph: GlyphRuntime, matrix: Mat2D, key: string): Contour[] {
    if (key === '') return glyph.local.map((c) => transformContour(matrix, c));
    const known = rt.staticPaths.get(glyph.glyph);
    if (known && known.key === key) return known.paths;
    const paths = glyph.local.map((c) => transformContour(matrix, c));
    rt.staticPaths.set(glyph.glyph, { key, paths });
    return paths;
  }

  /** Where each line object starts in the frame of its render: what GrowArrow grows it from. */
  const lineStarts = new WeakMap<Formula, Vec2>();
  const lineTraces = new WeakMap<Formula, ArrowTrace | null>();

  /** Native critical centre of the glyphs `plan` animates, in scene space. */
  function centerOf(rt: ClipRuntime, plan: Plan, pose: Pose, time: number): Vec2 {
    if (plan.lastCenter?.time === time) return plan.lastCenter.center;
    const shaped = rt.fit?.shapeAt(time) ?? null;
    const ats: { local: readonly Contour[]; matrix: Mat2D; key: string }[] = [];
    for (const glyph of plan.position.keys()) {
      const g = rt.byGlyph.get(glyph);
      if (g) ats.push(shapeOf(g, shaped, glyphAt(rt, glyph, pose, time)));
    }
    const key = ats.every((a) => a.key !== '') ? ats.map((a) => a.key).join(';') : null;
    let center = key === null ? undefined : plan.centers.get(key);
    if (!center) {
      center = manimCenter(
        ats.map((a) => transformPointPath(a.matrix, pointPathOf(a.local, target))),
        target,
      );
      if (key !== null) plan.centers.set(key, center);
    }
    plan.lastCenter = { time, center };
    return center;
  }

  /** The stint of `stints` that has the glyph on screen at `time`, if any. The scene end is
   * inclusive: a stint that lasts until then is still on screen at t = duration, except one a
   * relation ends (the morph has replaced it). */
  function stintAt(stints: readonly GlyphStint[], time: number): GlyphStint | null {
    for (const stint of stints) {
      if (time < stint.enter.start - TIME_EPSILON) return null;
      if (time < stint.exit.end - TIME_EPSILON) return stint;
      if (
        time >= duration - TIME_EPSILON &&
        stint.exit.end >= duration - TIME_EPSILON &&
        !stint.exit.relation
      ) {
        return stint;
      }
    }
    return null;
  }

  const progress = (edge: Edge, time: number) =>
    clamp01((time - edge.start) / (edge.end - edge.start));

  function evaluate(t: number): Drawable[] {
    const time = Math.min(Math.max(t, 0), duration);
    const out: Drawable[] = [];

    for (const rt of runtimes) {
      const { clip } = rt;
      if (!onScreenAt(clip, time, duration)) continue;

      const pose = poseAt(clip.initial, rt.tweens, time, rt.formula, target);
      const groupColor = pose.stateColor ?? rt.formula.color;
      const shaped = rt.fit?.shapeAt(time) ?? null;

      for (const glyph of rt.glyphs) {
        const g = glyph.glyph;
        const stint = stintAt(glyph.stints, time);
        if (!stint) continue;
        const { enter, exit } = stint;
        const leaving = time >= exit.start - TIME_EPSILON;
        let factor = 1;

        // A relation pair that brings the glyph or takes it draws it during its window as part
        // of the morph. Without a morph (a clip of the relation is not drawn) the placeholder is
        // a plain cross-fade.
        if (enter.relation && time < enter.end - TIME_EPSILON) {
          if (enter.relation.morphed) continue;
          factor *= enter.relation.rate(progress(enter, time));
        }
        if (exit.relation && leaving) {
          if (exit.relation.morphed) continue;
          factor *= 1 - exit.relation.rate(progress(exit, time));
        }
        if (factor <= 0) continue;

        // Which animation, if any, is acting on this glyph right now: the one taking it off the
        // screen once it has started, else the one bringing it while it runs. After that one,
        // the glyph keeps its final look (Manim's `finish()` interpolates at alpha 1), which
        // only differs from the plain state for an easing that does not end at 1.
        let plan: Plan | null = null;
        let alpha = 0;
        if (exit.plan && leaving) {
          plan = exit.plan;
          alpha = progress(exit, time);
        } else if (enter.plan) {
          if (time < enter.end - TIME_EPSILON) {
            plan = enter.plan;
            alpha = progress(enter, time);
          } else if (Math.abs(enter.plan.settled - 1) > 1e-9) {
            plan = enter.plan;
            alpha = 1;
          }
        }

        let look: Look | null;
        const at = glyphAt(rt, g, pose, time);
        const color = at.color ?? pose.colorOf(g);
        // A shape whose Transforms repaint it is drawn with the paint of its pose, the clip's
        // opacity already in it (`PosePaint`); anything else with its render's style at the
        // clip's opacity. A part transform that sets the opacity sets it over the paint's own.
        const { paint } = pose;
        const opacity = at.opacity ?? (paint ? 1 : pose.opacity);
        const own = shapeOf(glyph, shaped, at);
        const input: LookInput = {
          local: own.local,
          matrix: own.matrix,
          color,
          fillColor: paint?.fillColor,
          opacity,
          style: paint
            ? at.opacity === null
              ? paint.style
              : paint.own
            : (shaped?.styles?.[glyph.slot] ?? glyph.style),
          groupColor,
          center: [0, 0],
          target,
          shift: [0, 0],
          scale: 1,
        };
        if (plan) {
          input.shift = plan.event.shift;
          input.scale = plan.event.scale;
          const kind = plan.event.anim;
          if (
            kind === 'fade_in' ||
            kind === 'grow_from_center' ||
            kind === 'fade_out' ||
            kind === 'shrink_to_center'
          ) {
            input.center = centerOf(rt, plan, pose, time);
          } else if (kind === 'grow_arrow' && rt.formula.kind === 'line') {
            // Its shaft is the first of an arrow's members, then the tip at its end, then the
            // one at its start. A bent arrow is drawn along its way (D149); a straight one grows
            // from its start.
            // The arrow a tween has left (an Appear block after it), else the object's own.
            const carried = rt.ends?.builtAt(time) ?? null;
            let path = carried ? carried.trace : lineTraces.get(rt.formula);
            if (path === undefined) {
              path = lineTraceLocal(target, rt.formula);
              lineTraces.set(rt.formula, path);
            }
            if (path && tracesAsArrow(rt.formula)) {
              input.trace = { path, member: g === 0 ? 'shaft' : g === 1 ? 'tip' : 'startTip' };
            } else {
              let start = carried ? carried.start : lineStarts.get(rt.formula);
              if (!start) {
                start = lineEndsLocal(target, rt.formula).start;
                lineStarts.set(rt.formula, start);
              }
              input.center = applyToPoint(pose.matrix, start);
              input.shaft = g === 0;
            }
          }
          const p = subProgress(
            alpha,
            plan.position.get(g)!,
            plan.count,
            plan.lag,
            plan.rate,
            plan.reverse,
          );
          look = plan.exits
            ? outroLook(plan.event.anim as OutroKind, input, p)
            : introLook(plan.event.anim as IntroKind, input, p);
        } else {
          const paints = paintsOf(input, opacity);
          // A shape a tween carried elsewhere has its own contours, not the memo's.
          const contours = shaped
            ? own.local.map((c) => transformContour(own.matrix, c))
            : plainPaths(rt, glyph, at.matrix, at.key);
          look = paints ? { contours, ...paints, partial: false } : null;
        }
        if (!look) continue;
        const fill =
          look.fill && factor < 1
            ? { ...look.fill, opacity: look.fill.opacity * factor }
            : look.fill;
        const stroke =
          look.stroke && factor < 1
            ? { ...look.stroke, opacity: look.stroke.opacity * factor }
            : look.stroke;
        if ((!fill || fill.opacity <= 0) && (!stroke || stroke.opacity <= 0)) continue;
        out.push({
          key: `${clip.id}:${g}`,
          clipId: clip.id,
          glyph: g,
          path: { contours: look.contours },
          fill,
          stroke,
          z: rt.z,
          role: 'object',
          partial: look.partial,
        });
      }
    }
    for (const m of morphs) {
      if (time < m.start - TIME_EPSILON || time >= m.end - TIME_EPSILON) continue;
      const alpha = clamp01((time - m.start) / (m.end - m.start));
      out.push(...morphDrawables(m.morph, m.rate(alpha), m.z, m.transfer));
    }
    for (const temp of temps) {
      const { event } = temp;
      if (time < event.start - TIME_EPSILON || time >= event.end - TIME_EPSILON) continue;
      const s = temp.rate(clamp01((time - event.start) / (event.end - event.start)));
      for (const { suffix, look } of tempLooks(temp.shape, event, s, target)) {
        out.push({
          key: `${event.id}:${suffix}`,
          clipId: event.clipId,
          glyph: -1,
          path: { contours: look.contours },
          fill: look.fill,
          stroke: look.stroke,
          z: temp.z,
          role: 'temp',
          partial: look.partial,
        });
      }
    }
    return out.sort((a, b) => a.z - b.z);
  }

  function geometry(t: number): ClipGeometry[] {
    const time = Math.min(Math.max(t, 0), duration);
    const out: ClipGeometry[] = [];
    for (const rt of runtimes) {
      const { clip } = rt;
      if (!onScreenAt(clip, time, duration) || rt.glyphs.length === 0) continue;
      const pose = poseAt(clip.initial, rt.tweens, time, rt.formula, target);
      const shaped = rt.fit?.shapeAt(time) ?? null;
      const glyphs = new Map<number, Box>();
      for (const glyph of rt.glyphs) {
        const own = shapeOf(glyph, shaped, glyphAt(rt, glyph.glyph, pose, time));
        glyphs.set(glyph.glyph, transformBox(own.matrix, own.box));
      }
      out.push({ clipId: clip.id, box: unionBox([...glyphs.values()]), glyphs });
    }
    return out;
  }

  /** The point lists Manim stores for `glyphs` of a clip at `t`: every one of them, drawn or not,
   * as rendered and where the clip's state and its part transforms put it — turned by `frame`
   * first when given (a brace measures its target in the frame where it points down). Null for a
   * clip the evaluator does not know (no render, a hidden track it skips). */
  function points(
    clipId: ClipId,
    glyphs: GlyphTarget,
    t: number,
    frame?: Mat2D,
  ): GlyphPoints[] | null {
    const rt = runtimeOf.get(clipId);
    if (!rt) return null;
    const time = Math.min(Math.max(t, 0), duration);
    const pose = poseAt(rt.clip.initial, rt.tweens, time, rt.formula, target);
    const shaped = rt.fit?.shapeAt(time) ?? null;
    const wanted = glyphs === 'all' ? rt.glyphs : glyphs.flatMap((g) => rt.byGlyph.get(g) ?? []);
    return wanted.map((glyph) => {
      const own = shapeOf(glyph, shaped, glyphAt(rt, glyph.glyph, pose, time));
      const local = pointPathOf(own.local, target);
      const placed = transformPointPath(frame ? multiply(frame, own.matrix) : own.matrix, local);
      return { glyph: glyph.glyph, local, placed };
    });
  }

  /** What Manim measures over `glyphs` of a clip at `t` (measure.ts), from their point lists
   * (`points`). Null as `points` is, or when none of the glyphs has ink. */
  function measure(
    clipId: ClipId,
    glyphs: GlyphTarget,
    t: number,
    frame?: Mat2D,
  ): ManimBoxes | null {
    const lists = points(clipId, glyphs, t, frame);
    return lists
      ? manimBoxes(
          lists.map((l) => l.placed),
          target,
        )
      : null;
  }

  return { duration, events, evaluate, geometry, measure, points };
}

/** The evaluator of an export (the browser and ffmpeg videos): hidden tracks are drawn too.
 * Hiding a track is a preview toggle ("Hide in preview (still exported)"); the Python export
 * includes those clips by construction, so a video must show the same scene. `frame` is the size
 * of the video when it is not the project's (`EvaluatorOptions.frame`). */
export function exportEvaluator(
  project: Project,
  formulas: ResolvedFormulas,
  frame?: EvaluatorOptions['frame'],
): SceneEvaluator {
  return createEvaluator(project, formulas, { includeHidden: true, ...(frame ? { frame } : {}) });
}
