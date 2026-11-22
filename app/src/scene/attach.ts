/* Where attached objects go (`clip.attach`, R4; ARCHITECTURE §5, "Attached objects"): the
 * placement of every attached clip, derived from its target's glyphs as the evaluator measures
 * them when the clip starts — the same measure the Python's `next_to` or `Brace` makes in Manim
 * at that instant. A `next_to` object is moved beside the glyphs; a brace (`rule: 'brace'`) is
 * fitted to them as well — its width, its clip's rotation and its position all derive from the
 * glyphs' box in the frame where the brace points down, as `Brace(target, direction, buff)`
 * finds them; a label at a brace's tip (`rule: 'tip'`) goes where `brace.put_at_tip(label, buff)`
 * puts it, from the brace's points as they are when the label's clip starts; a shape (`rule:
 * 'shape'`) is fitted to the glyphs' box as its Manim class fits it (`shapes.ts`): its size goes
 * to the object, its centre to the clip. A brace or a shape that spans glyphs of several clips
 * (`attach.also`, format 21) is fitted to the box of them all, as Manim fits one to a `VGroup` of
 * them (`measureTarget`). A tween that carries a shape to other glyphs (`TweenFit`, D123) is
 * fitted the same way, to its own target as it is when the tween starts: what is found goes to
 * the tween's `fit.fitted`. The attach sync (`store/attachSync.ts`) writes what
 * `deriveAttachments` finds into the project; `settleAttachments` / `settleScene` do the same on a
 * project value (tests, the pins, the export check). */
import { isCurrentRender, type ResolvedFormulas } from '../engine';
import {
  applyToPoint,
  boxCenter,
  braceShape,
  braceTipIndex,
  contoursBox,
  rotate,
  toPointPath,
  type Mat2D,
  type PointPath,
  type Vec2,
} from '../geom';
import {
  attachTargets,
  DEFAULT_SHAPE_BUFF,
  endsTweens,
  fitTweens,
  glyphEnds,
  hasPlacementUses,
  isGlyphEnd,
  KINDS,
  labelBuff,
  placementTargets,
  overCorners,
  type ActionId,
  type BraceAttach,
  type BraceFormula,
  type Clip,
  type ClipAttach,
  type ClipId,
  type EndsAttach,
  type FitTween,
  type FormulaId,
  type FreedEndPoint,
  type Issue,
  type LineEnd,
  type LineEndsDrawn,
  type LineFormula,
  type Project,
  type ShapeAttach,
  type ShapeFitBox,
  type ShapeFormula,
  type Target,
  type TipAttach,
  type TweenFit,
} from '../model';
import { exportEvaluator } from './evaluator';
import {
  criticalPoint,
  manimBoxes,
  nextToPointShift,
  nextToShift,
  roundHalfEven,
  type ManimBoxes,
} from './measure';
import {
  drawnEnds,
  foundLineEnds,
  lineCentre,
  lineEndInput,
  manimLineEnds,
  pointForFreeEnd,
  tweenEndsDrawn,
  withTrim,
} from './lines';
import {
  carryLine,
  lineCentreOf,
  lineCurveBefore,
  measuredCurve,
  ownLineGeometry,
} from './lineStates';
import { actionStates, endsAtStart } from './state';
import { fitShape, validFitDimension } from './shapes';
import type { GlyphPoints, SceneEvaluator } from './types';

export interface AttachedPlacement {
  clipId: ClipId;
  /** The tween of the clip whose fit this is (`TweenFit.fitted`: `position` is its centre,
   * `width` and `height` its size), or whose ends these are (`TweenEnds.drawn`: `ends`, and
   * `position` the centre of the line there); absent for the clip's own placement. */
  actionId?: ActionId;
  /** The clip's initial position once placed. */
  position: Vec2;
  /** A brace: its clip's rotation (the direction it points in) and its object's width (the
   * target's, across that direction), derived with the position. A shape: its clip unturned, and
   * its object's width and height (the box it was fitted to). A line: its clip unturned, and its
   * object's vector, from where it is drawn to where it ends, and — an arc — the part of it the
   * gap at each end took (`LineCurve.trim`). */
  rotation?: number;
  width?: number;
  height?: number;
  vector?: Vec2;
  trim?: number;
  /** A tween that carries the ends of a line: where it draws the line from and to, and the part
   * of an arc the gap took. */
  ends?: Pick<LineEndsDrawn, 'start' | 'end' | 'trim'>;
}

/** Below this, a placement is where it already is (float noise of a measure). */
const SETTLED = 1e-9;

/** What Manim measures over the target of an attachment at `t` (measure.ts), in the scene's frame
 * or turned by `frame` first: the glyphs of the clip it hangs on — and, when a brace or a shape
 * spans several clips (`also`), those of them all as one group, which is what
 * `Brace(VGroup(…))` reads. Null when one of the clips cannot be measured (`SceneEvaluator.points`)
 * or none of the glyphs has ink. */
function measureTarget(
  evaluator: SceneEvaluator,
  lib: Target,
  attach: ClipAttach | TweenFit,
  t: number,
  frame?: Mat2D,
): ManimBoxes | null {
  const targets = attachTargets(attach);
  if (targets.length === 1)
    return evaluator.measure(targets[0]!.clipId, targets[0]!.glyphs, t, frame);
  const paths: PointPath[] = [];
  for (const target of targets) {
    const lists = evaluator.points(target.clipId, target.glyphs, t, frame);
    if (!lists) return null;
    for (const list of lists) paths.push(list.placed);
  }
  return manimBoxes(paths, lib);
}

/** The attached clips that are not where their attachment puts them, with the placement each
 * should have:
 *   - `next_to`: the clip's own glyphs (every glyph, where its initial state puts them) shifted
 *     beside the target glyphs, as both are measured at the clip's start;
 *   - `brace`: the target glyphs measured in the frame where the brace points down (turned by
 *     minus its direction about the origin, as Manim turns the target) give the brace's width —
 *     their box across the direction — and its upper-left corner, `buff` below their lower-left
 *     one; the brace built for that width (`geom/brace.ts`, as the render will be) is centred
 *     there and turned back, which gives the clip's position and rotation. The first attached
 *     clip of a brace object in the project's order fits its width; another clip of the same
 *     object is placed with that width;
 *   - `shape`: the target glyphs measured at the clip's start give the shape's centre and size as
 *     its Manim class reads them (`fitShape`): the size goes to the object — the first attached
 *     clip of a shape object fits it, as a brace's —, the centre to the clip, which stays unturned;
 *   - `tip`: the label's glyphs shifted as `put_at_tip` shifts them (`putAtTipShift`), from the
 *     tip and the direction of the brace's points at the label's start (`readBraceTip`): the
 *     brace's tweens until then count, as they do in Manim.
 * A clip whose target or own glyphs cannot be measured (no render yet, the target missing or
 * hidden by a chain that goes round) is left as it is. The evaluator sees every track, hidden
 * ones too. */
export function deriveAttachments(
  project: Project,
  formulas: ResolvedFormulas,
  evaluator: SceneEvaluator = exportEvaluator(project, formulas),
): AttachedPlacement[] {
  const out: AttachedPlacement[] = [];
  const byId = new Map(project.clips.map((c) => [c.id, c]));
  const { blocked } = attachmentGraph(project);
  const fitted = new Set<FormulaId>();
  for (const clip of project.clips) {
    if (blocked.has(clip.id)) continue;
    out.push(...deriveFits(project, evaluator, clip));
    out.push(...deriveEnds(project, evaluator, clip));
    const attach = clip.attach;
    if (!attach) continue;
    if (attach.rule === 'brace') {
      const formula = project.formulas.find((f) => f.id === clip.formulaId);
      if (formula?.kind !== 'brace') continue; // validation says so (`attach-rule`)
      const placement = fitBrace(
        project,
        evaluator,
        clip,
        attach,
        formula,
        !fitted.has(formula.id),
      );
      fitted.add(formula.id);
      if (placement) out.push(placement);
      continue;
    }
    if (attach.rule === 'shape') {
      const formula = project.formulas.find((f) => f.id === clip.formulaId);
      if (formula?.kind !== 'shape') continue; // validation says so (`attach-rule`)
      const placement = fitShapeClip(
        project,
        evaluator,
        clip,
        attach,
        formula,
        !fitted.has(formula.id),
      );
      fitted.add(formula.id);
      if (placement) out.push(placement);
      continue;
    }
    if (attach.rule === 'ends') {
      const formula = project.formulas.find((f) => f.id === clip.formulaId);
      if (formula?.kind !== 'line') continue; // validation says so (`attach-rule`)
      const placement = fitLineClip(
        project,
        evaluator,
        clip,
        attach,
        formula,
        !fitted.has(formula.id),
      );
      fitted.add(formula.id);
      if (placement) out.push(placement);
      continue;
    }
    const own = evaluator.measure(clip.id, 'all', clip.start);
    if (attach.rule === 'tip') {
      const placement = own && placeAtTip(project, evaluator, clip, attach, own, byId);
      if (placement) out.push(placement);
      continue;
    }
    const target = evaluator.measure(attach.clipId, attach.glyphs, clip.start);
    if (!own || !target) continue;
    const [dx, dy] = nextToShift(own, target, attach.side, attach.buff);
    if (Math.abs(dx) <= SETTLED && Math.abs(dy) <= SETTLED) continue;
    const [x, y] = clip.initial.position;
    out.push({ clipId: clip.id, position: [x + dx, y + dy] });
  }
  return out;
}

/** The gap a tween's fit leaves around its target: the one of the shape's own attachment — the
 * shape's gap, whatever it surrounds — or, for a shape that hangs on nothing, the one a new shape
 * of its kind gets. */
export function fitGap(clip: Pick<Clip, 'attach'>, formula: ShapeFormula): number {
  if (clip.attach?.rule === 'shape') return clip.attach.buff;
  return overCorners(formula.shape) ? 0 : DEFAULT_SHAPE_BUFF;
}

/** What `tween` of `clip` fits its shape to: its target as it is when the tween starts, measured
 * and fitted as an attached shape's is (`fitShape`). Null when the target cannot be measured or
 * the gap leaves no shape. */
function fitOfTween(
  project: Project,
  evaluator: SceneEvaluator,
  clip: Clip,
  formula: ShapeFormula,
  tween: FitTween,
): ShapeFitBox | null {
  const at = clip.start + tween.start;
  const target = measureTarget(evaluator, project.meta.target, tween.fit, at);
  return target ? fitShape(formula.shape, target, fitGap(clip, formula)) : null;
}

const sameFit = (a: ShapeFitBox | null, b: ShapeFitBox): boolean =>
  a !== null &&
  Math.abs(a.center[0] - b.center[0]) <= SETTLED &&
  Math.abs(a.center[1] - b.center[1]) <= SETTLED &&
  Math.abs(a.width - b.width) <= SETTLED &&
  Math.abs(a.height - b.height) <= SETTLED;

/** The fits of the tweens of `clip` that are not what their targets make them now (see
 * `deriveAttachments`): none for a clip that is not a shape's (validation says so, `fit-shape`). */
function deriveFits(project: Project, evaluator: SceneEvaluator, clip: Clip): AttachedPlacement[] {
  const tweens = fitTweens(clip);
  if (tweens.length === 0) return [];
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  if (formula?.kind !== 'shape') return [];
  const out: AttachedPlacement[] = [];
  for (const tween of tweens) {
    const fit = fitOfTween(project, evaluator, clip, formula, tween);
    if (!fit || sameFit(tween.fit.fitted, fit)) continue;
    out.push({
      clipId: clip.id,
      actionId: tween.id,
      position: fit.center,
      width: fit.width,
      height: fit.height,
    });
  }
  return out;
}

const sameDrawn = (a: LineEndsDrawn | null, b: LineEndsDrawn): boolean =>
  a !== null &&
  Math.abs(a.trim - b.trim) <= SETTLED &&
  (['start', 'end', 'center'] as const).every(
    (key) =>
      Math.abs(a[key][0] - b[key][0]) <= SETTLED && Math.abs(a[key][1] - b[key][1]) <= SETTLED,
  );

/** Where the tweens of `clip` that carry the ends of its line draw it (`TweenEnds.drawn`), for
 * the ones that are not there now (see `deriveAttachments`): each measured when it starts, with
 * the line as the tweens before it left it — the centre of the line a tween leaves depends on
 * what it was (`lineStates.ts`). A tween that cannot be measured keeps what it had. None for a
 * clip that is not a line's (validation says so, `ends-line`). */
function deriveEnds(project: Project, evaluator: SceneEvaluator, clip: Clip): AttachedPlacement[] {
  if (endsTweens(clip).length === 0) return [];
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  if (formula?.kind !== 'line') return [];
  const lib = project.meta.target;
  const out: AttachedPlacement[] = [];
  let state = ownLineGeometry(lib, formula);
  for (const { action, to } of actionStates(clip)) {
    const { ends } = action;
    if (!ends) continue;
    const at = clip.start + action.start;
    const measured = tweenEndsDrawn(evaluator, lib, ends, measuredCurve(state, ends), at);
    const found = measured ?? ends.drawn;
    if (!found) continue;
    const width = to.strokeWidth ?? formula.strokeWidth;
    const next = carryLine(lib, formula, state, ends, found, width).to;
    if (measured) {
      const center = lineCentreOf(lib, next);
      if (!sameDrawn(ends.drawn, { ...measured, center })) {
        out.push({ clipId: clip.id, actionId: action.id, position: center, ends: measured });
      }
    }
    if (!endsAtStart(action.easing)) state = next;
  }
  return out;
}

/** Where the freed end of the ends a Transform carries a line to is given to Manim, for the line to
 * stay drawn where it was (`FreedEndPoint`, the model's `freeTweenEnd`): beside an end that stays
 * on glyphs, the point an end dropped there by hand is given (`pointForFreeEnd`), measured when
 * the Transform starts, on the curve the line has then — read off `project` as it is before the
 * glyphs go, with its renders `formulas`. Null for a tween never measured, and beside an end that
 * is free or cannot be measured. */
export function freedEndPoint(project: Project, formulas: ResolvedFormulas): FreedEndPoint {
  let evaluator: SceneEvaluator | undefined;
  return (clipId, tweenId, side) => {
    const clip = project.clips.find((c) => c.id === clipId);
    const tween = clip?.actions.find((a) => a.id === tweenId);
    const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
    if (!clip || tween?.kind !== 'tween' || !tween.ends?.drawn || formula?.kind !== 'line') {
      return null;
    }
    const { ends } = tween;
    const kept = ends[side === 'start' ? 'end' : 'start'];
    if (!isGlyphEnd(kept)) return null;
    const lib = project.meta.target;
    evaluator ??= exportEvaluator(project, formulas);
    const other = lineEndInput(evaluator, lib, kept, clip.start + tween.start);
    if (!other) return null;
    const curve = measuredCurve({ curve: lineCurveBefore(formula, clip, tween.id) }, ends);
    return pointForFreeEnd(lib, other, ends.drawn![side], ends.buff, side, curve);
  };
}

/** Geometry-dependent attachment errors. Schema-valid gaps can become unsupported after a
 * target shrinks; report that condition without replacing the object's last valid geometry. The
 * same for a line whose two ends Manim finds no line between (`lineEndsIssues`). */
export function attachmentIssues(
  project: Project,
  formulas: ResolvedFormulas,
  evaluator?: SceneEvaluator,
): Issue[] {
  const issues: Issue[] = [];
  const { blocked } = attachmentGraph(project);
  const fitted = new Set<FormulaId>();
  project.clips.forEach((clip, index) => {
    if (blocked.has(clip.id)) return;
    const formula = project.formulas.find((f) => f.id === clip.formulaId);
    if (formula?.kind === 'line') {
      const evaluate = () => (evaluator ??= exportEvaluator(project, formulas));
      issues.push(...lineEndsIssues(project, clip, formula, index, evaluate));
      return;
    }
    if (formula?.kind !== 'shape') return;
    // A tween's fit that the gap leaves no shape for keeps the last one it had.
    clip.actions.forEach((action, ai) => {
      if (action.kind !== 'tween' || !action.fit) return;
      const lib = project.meta.target;
      const at = clip.start + action.start;
      const target = measureTarget(
        (evaluator ??= exportEvaluator(project, formulas)),
        lib,
        action.fit,
        at,
      );
      if (!target || fitShape(formula.shape, target, fitGap(clip, formula))) return;
      issues.push({
        severity: 'error',
        code: 'attach-shape-fit',
        message:
          'This gap cannot fit the shape to the target of its Transform with finite, nonnegative dimensions. The last valid geometry is kept; adjust the gap or the target.',
        path: ['clips', index, 'actions', ai, 'fit'],
      });
    });
    const attach = clip.attach;
    if (attach?.rule !== 'shape') return;
    const retainedSize = fitted.has(formula.id) ? formula : undefined;
    fitted.add(formula.id);
    const target = measureTarget(
      (evaluator ??= exportEvaluator(project, formulas)),
      project.meta.target,
      attach,
      clip.start,
    );
    if (!target || fitShape(formula.shape, target, attach.buff, retainedSize)) return;
    issues.push({
      severity: 'error',
      code: 'attach-shape-fit',
      message:
        'This gap cannot fit the shape to its target with finite, nonnegative dimensions. The last valid geometry is kept; adjust the gap or the target.',
      path: ['clips', index, 'attach', 'buff'],
    });
  });
  return issues;
}

/** The ends of the line of `clip` that Manim finds no line between (`foundLineEnds`): those of its
 * attachment, measured when its clip starts, and those each of its Transforms carries it to,
 * measured when the Transform starts. The sync leaves the line as it was there, while ManimCE would
 * draw nothing and ManimGL stop the scene. Ends that cannot be measured now are not reported: the
 * readiness of the scene tells of them. */
function lineEndsIssues(
  project: Project,
  clip: Clip,
  formula: LineFormula,
  index: number,
  evaluate: () => SceneEvaluator,
): Issue[] {
  const lib = project.meta.target;
  const meet = (ends: { start: LineEnd; end: LineEnd }, t: number): boolean =>
    glyphEnds(ends).length > 0 && foundLineEnds(evaluate(), lib, ends, t) === null;
  const what =
    'they are at one place. ManimCE would draw nothing and ManimGL stop the scene; the preview keeps the line as it was. Move an end, or choose another point of its glyphs.';
  const issues: Issue[] = [];
  if (clip.attach?.rule === 'ends' && meet(clip.attach, clip.start)) {
    issues.push({
      severity: 'error',
      code: 'attach-line-ends',
      message: `Manim finds no line between the two ends of "${formula.name}" when its clip starts: ${what}`,
      path: ['clips', index, 'attach'],
    });
  }
  clip.actions.forEach((action, ai) => {
    if (action.kind !== 'tween' || !action.ends) return;
    if (!meet(action.ends, clip.start + action.start)) return;
    issues.push({
      severity: 'error',
      code: 'attach-line-ends',
      message: `Manim finds no line between the two ends a Transform of "${formula.name}" carries it to, when the Transform starts: ${what}`,
      path: ['clips', index, 'actions', ai, 'ends'],
    });
  });
  return issues;
}

/** The placement of a brace clip (see `deriveAttachments`), or null when it is where it should
 * be or its target cannot be measured. `fitsWidth`: whether this clip sets its object's width. */
function fitBrace(
  project: Project,
  evaluator: SceneEvaluator,
  clip: Clip,
  attach: BraceAttach,
  formula: BraceFormula,
  fitsWidth: boolean,
): AttachedPlacement | null {
  const frame = rotate(-attach.direction);
  const lib = project.meta.target;
  const target = measureTarget(evaluator, lib, attach, clip.start, frame);
  if (!target) return null;
  const box = target.critical;
  const width = fitsWidth ? box.maxX - box.minX : formula.width;
  // The shape has its corner at the origin; the render centres it on the box of every point.
  const shape = braceShape(lib, width, formula.sharpness);
  const centre = boxCenter(contoursBox(shape));
  const corner = manimBoxes(
    shape.map((piece) => toPointPath([piece], lib)),
    lib,
  )!.critical;
  const inFrame: Vec2 = [
    box.minX - corner.minX + centre[0],
    box.minY - attach.buff - corner.maxY + centre[1],
  ];
  const position = applyToPoint(rotate(attach.direction), inFrame);
  const [x, y] = clip.initial.position;
  if (
    Math.abs(position[0] - x) <= SETTLED &&
    Math.abs(position[1] - y) <= SETTLED &&
    Math.abs(attach.direction - clip.initial.rotation) <= SETTLED &&
    Math.abs(width - formula.width) <= SETTLED
  ) {
    return null;
  }
  return { clipId: clip.id, position, rotation: attach.direction, width };
}

/** The placement of a shape clip (see `deriveAttachments`), or null when it is where it should be
 * or its target cannot be measured. `fitsSize`: whether this clip sets its object's size. */
function fitShapeClip(
  project: Project,
  evaluator: SceneEvaluator,
  clip: Clip,
  attach: ShapeAttach,
  formula: ShapeFormula,
  fitsSize: boolean,
): AttachedPlacement | null {
  const target = measureTarget(evaluator, project.meta.target, attach, clip.start);
  if (!target) return null;
  const fit = fitShape(formula.shape, target, attach.buff, fitsSize ? undefined : formula);
  if (!fit) return null;
  const { width, height } = fit;
  const [x, y] = clip.initial.position;
  if (
    Math.abs(fit.center[0] - x) <= SETTLED &&
    Math.abs(fit.center[1] - y) <= SETTLED &&
    Math.abs(clip.initial.rotation) <= SETTLED &&
    Math.abs(width - formula.width) <= SETTLED &&
    Math.abs(height - formula.height) <= SETTLED
  ) {
    return null;
  }
  return { clipId: clip.id, position: fit.center, rotation: 0, width, height };
}

/** The line Manim draws for a line clip with ends on glyphs, where they are when its clip starts
 * (`scene/lines.ts`): from where to where, after its buff, and the part of an arc that buff took.
 * Null when an end cannot be measured, or the two ends are at one place. */
function drawnLine(
  project: Project,
  evaluator: SceneEvaluator,
  clip: Clip,
  attach: EndsAttach,
  formula: LineFormula,
): { start: Vec2; end: Vec2; trim: number } | null {
  const lib = project.meta.target;
  const from = lineEndInput(evaluator, lib, attach.start, clip.start);
  const to = lineEndInput(evaluator, lib, attach.end, clip.start);
  const ends = from && to && manimLineEnds(lib, from, to);
  return ends ? drawnEnds(lib, formula.curve, ends, attach.buff) : null;
}

/** The placement of a line clip (see `deriveAttachments`), or null when it is where it should be
 * or an end cannot be measured. `fitsVector`: whether this clip sets its object's vector; another
 * clip of the same object starts where its own ends put it, and runs along that vector. */
function fitLineClip(
  project: Project,
  evaluator: SceneEvaluator,
  clip: Clip,
  attach: EndsAttach,
  formula: LineFormula,
  fitsVector: boolean,
): AttachedPlacement | null {
  const drawn = drawnLine(project, evaluator, clip, attach, formula);
  if (!drawn) return null;
  const vector: Vec2 = fitsVector
    ? [drawn.end[0] - drawn.start[0], drawn.end[1] - drawn.start[1]]
    : formula.vector;
  const held = formula.curve?.shape === 'arc' ? formula.curve.trim : 0;
  const trim = fitsVector ? drawn.trim : held;
  const look = { ...formula, curve: withTrim(formula.curve, trim) };
  const position = lineCentre(project.meta.target, look, drawn.start, vector);
  const [x, y] = clip.initial.position;
  if (
    Math.abs(position[0] - x) <= SETTLED &&
    Math.abs(position[1] - y) <= SETTLED &&
    Math.abs(clip.initial.rotation) <= SETTLED &&
    Math.abs(vector[0] - formula.vector[0]) <= SETTLED &&
    Math.abs(vector[1] - formula.vector[1]) <= SETTLED &&
    Math.abs(trim - held) <= SETTLED
  ) {
    return null;
  }
  return { clipId: clip.id, position, rotation: 0, vector, trim };
}

/** What a label reads from its brace in Manim: the tip (`get_tip()`), the direction from the
 * brace's centre to it (`get_direction()`, a unit vector) and the side or corner `put_at_tip`
 * puts the label on, that direction rounded on each axis as `np.round` rounds it. */
export interface BraceTipReading {
  tip: Vec2;
  direction: Vec2;
  side: Vec2;
}

/** Read the tip of a brace from its point lists (`SceneEvaluator.points`): the tip is the point
 * Manim fixed when it built the brace, found among the lists as rendered — where the brace points
 * down (`braceTipIndex`) — and read where it is placed; the centre is the one `get_center` reads
 * (the anchors' box in ManimCE, every point's in ManimGL). Null without points. */
export function readBraceTip(
  lists: readonly Pick<GlyphPoints, 'local' | 'placed'>[],
  lib: Target,
): BraceTipReading | null {
  const at = braceTipIndex(
    lib,
    lists.map((l) => l.local),
  );
  const boxes = manimBoxes(
    lists.map((l) => l.placed),
    lib,
  );
  if (!at || !boxes) return null;
  const points = lists[at.path]!.placed.points;
  const tip: Vec2 = [points[at.offset]!, points[at.offset + 1]!];
  const centre = criticalPoint(boxes, [0, 0]);
  const length = Math.hypot(tip[0] - centre[0], tip[1] - centre[1]);
  if (!(length > 0)) return null;
  const direction: Vec2 = [(tip[0] - centre[0]) / length, (tip[1] - centre[1]) / length];
  return { tip, direction, side: [roundHalfEven(direction[0]), roundHalfEven(direction[1])] };
}

/** The shift `brace.put_at_tip(label, buff=buff)` gives a label measured where it is:
 * `label.next_to(tip, np.round(direction), buff=buff)`. */
export function putAtTipShift(label: ManimBoxes, brace: BraceTipReading, buff: number): Vec2 {
  return nextToPointShift(label, brace.tip, brace.side, buff);
}

/** The placement of a label at a brace's tip (see `deriveAttachments`), or null when it is where
 * it should be, its target is not a brace (validation says so, `attach-rule`) or the brace cannot
 * be read. `own` is the label measured at its start. */
function placeAtTip(
  project: Project,
  evaluator: SceneEvaluator,
  clip: Clip,
  attach: TipAttach,
  own: ManimBoxes,
  byId: ReadonlyMap<ClipId, Clip>,
): AttachedPlacement | null {
  const brace = byId.get(attach.clipId);
  if (project.formulas.find((f) => f.id === brace?.formulaId)?.kind !== 'brace') return null;
  const lib = project.meta.target;
  const lists = evaluator.points(attach.clipId, 'all', clip.start);
  const reading = lists && readBraceTip(lists, lib);
  if (!reading) return null;
  const [dx, dy] = putAtTipShift(own, reading, labelBuff(attach, lib));
  if (Math.abs(dx) <= SETTLED && Math.abs(dy) <= SETTLED) return null;
  const [x, y] = clip.initial.position;
  return { clipId: clip.id, position: [x + dx, y + dy] };
}

interface AttachmentGraph {
  layers: ClipId[][];
  dependencies: ReadonlyMap<ClipId, ReadonlySet<ClipId>>;
  /** Cycles, including a shared fitted object's size depending on itself, and their consumers. */
  blocked: ReadonlySet<ClipId>;
}

/** Placement depends on the target clip — on each of them, for an object that spans several —;
 * shared geometry also depends on the first clip that fits that object. Include unattached uses
 * of a fitted object: they share its size too. */
function attachmentGraph(project: Project): AttachmentGraph {
  const byId = new Map(project.clips.map((clip) => [clip.id, clip]));
  const formulas = new Map(project.formulas.map((formula) => [formula.id, formula]));
  const owners = new Map<FormulaId, ClipId>();
  for (const clip of project.clips) {
    const kind = formulas.get(clip.formulaId)?.kind;
    // The first clip of a brace, a shape or a line that hangs by its kind's own rule.
    const rule = kind && KINDS[kind].fitted;
    if (!owners.has(clip.formulaId) && rule && clip.attach?.rule === rule) {
      owners.set(clip.formulaId, clip.id);
    }
  }
  const dependencies = new Map<ClipId, Set<ClipId>>();
  const consumers = new Map<ClipId, ClipId[]>();
  const remaining = new Map<ClipId, number>();
  for (const clip of project.clips) {
    const needs = new Set<ClipId>();
    // What it hangs on, and what the fits of its tweens carry it to.
    for (const target of placementTargets(clip)) {
      if (byId.has(target.clipId)) needs.add(target.clipId);
    }
    const owner = owners.get(clip.formulaId);
    if (owner && owner !== clip.id) needs.add(owner);
    dependencies.set(clip.id, needs);
    remaining.set(clip.id, needs.size);
    for (const id of needs) {
      const using = consumers.get(id) ?? [];
      using.push(clip.id);
      consumers.set(id, using);
    }
  }
  const layers: ClipId[][] = [];
  let layer = project.clips.filter((clip) => remaining.get(clip.id) === 0).map((clip) => clip.id);
  while (layer.length > 0) {
    layers.push(layer);
    const next: ClipId[] = [];
    for (const id of layer) {
      remaining.delete(id);
      for (const consumer of consumers.get(id) ?? []) {
        const count = remaining.get(consumer)! - 1;
        remaining.set(consumer, count);
        if (count === 0) next.push(consumer);
      }
    }
    layer = next;
  }
  return { layers, dependencies, blocked: new Set(remaining.keys()) };
}

/** One propagation pass per dependency level, plus the root level to observe convergence.
 * The bound grows with the actual graph, rather than silently stopping after eight links. */
export function attachmentPassLimit(project: Project): number {
  return Math.max(1, attachmentGraph(project).layers.length);
}

export interface PendingAttachment {
  clipId: ClipId;
  reason:
    | 'cycle'
    | 'missing-target'
    | 'missing-render'
    | 'stale-render'
    | 'unmeasurable'
    | 'invalid-fit'
    | 'dependency'
    | 'unsettled';
  dependencyId?: ClipId;
}

export interface AttachmentReadiness {
  ready: boolean;
  pending: PendingAttachment[];
}

/** No requested placement is not evidence of readiness: a render may still be missing, a
 * shared local render stale, or a fit unsupported. Keep those states explicit for callers. */
export function attachmentReadiness(
  project: Project,
  formulas: ResolvedFormulas,
): AttachmentReadiness {
  const graph = attachmentGraph(project);
  const byId = new Map(project.clips.map((clip) => [clip.id, clip]));
  const objects = new Map(project.formulas.map((formula) => [formula.id, formula]));
  const evaluator = exportEvaluator(project, formulas);
  const unsettled = new Set(deriveAttachments(project, formulas, evaluator).map((p) => p.clipId));
  const invalid = new Set(
    attachmentIssues(project, formulas, evaluator).map(
      (issue) => project.clips[issue.path[1] as number]!.id,
    ),
  );
  const pending = new Map<ClipId, PendingAttachment>();
  const renderProblem = (clip: Clip): PendingAttachment['reason'] | null => {
    const formula = objects.get(clip.formulaId);
    const resolved = formulas.get(clip.formulaId);
    if (!formula || !resolved) return 'missing-render';
    if (
      KINDS[formula.kind].fitted !== null &&
      !isCurrentRender(resolved.render, formula, project.meta)
    )
      return 'stale-render';
    return null;
  };
  for (const id of graph.blocked) pending.set(id, { clipId: id, reason: 'cycle' });
  for (const layer of graph.layers) {
    for (const id of layer) {
      const clip = byId.get(id)!;
      const attach = clip.attach;
      // The first of its targets that is missing, or whose render is.
      const targets = placementTargets(clip).map((target) => target.clipId);
      const missing = targets.find((target) => !byId.has(target));
      const unavailable = targets.flatMap((target) => {
        const host = byId.get(target);
        const reason = host && renderProblem(host);
        return reason ? [{ clipId: id, reason, dependencyId: target }] : [];
      })[0];
      const dependency = [...graph.dependencies.get(id)!].find((need) => pending.has(need));
      let problem: PendingAttachment | undefined;
      if (missing) problem = { clipId: id, reason: 'missing-target', dependencyId: missing };
      else if (unavailable) problem = unavailable;
      else if (dependency) problem = { clipId: id, reason: 'dependency', dependencyId: dependency };
      else if (invalid.has(id)) problem = { clipId: id, reason: 'invalid-fit' };
      else {
        const own = renderProblem(clip);
        if (own) problem = { clipId: id, reason: own, dependencyId: id };
        else if (
          attach &&
          (!measureTarget(evaluator, project.meta.target, attach, clip.start) ||
            (attach.rule === 'tip' &&
              !readBraceTip(
                evaluator.points(attach.clipId, 'all', clip.start) ?? [],
                project.meta.target,
              )) ||
            ((attach.rule === 'tip' || attach.rule === 'next_to') &&
              !evaluator.measure(id, 'all', clip.start)))
        )
          problem = { clipId: id, reason: 'unmeasurable' };
        else if (unsettled.has(id)) problem = { clipId: id, reason: 'unsettled' };
      }
      if (problem) pending.set(id, problem);
    }
  }
  const attached = project.clips.flatMap((clip) => {
    const problem = hasPlacementUses(clip) && pending.get(clip.id);
    return problem ? [problem] : [];
  });
  return { ready: attached.length === 0, pending: attached };
}

/** Write placements into a project draft (an immer recipe): the clips' positions and rotations,
 * the braces' widths, the shapes' sizes. */
export function applyAttachments(draft: Project, placements: readonly AttachedPlacement[]): void {
  const valid = placements.filter(validPlacement);
  const byClip = new Map(valid.filter((p) => p.actionId === undefined).map((p) => [p.clipId, p]));
  const fits = fitsByClip(valid);
  const lines = endsByClip(valid);
  for (const clip of draft.clips) {
    for (const action of clip.actions) {
      const box = action.kind === 'tween' && action.fit && fits.get(clip.id)?.get(action.id);
      if (box && action.kind === 'tween' && action.fit) action.fit.fitted = box;
      const drawn = action.kind === 'tween' && action.ends && lines.get(clip.id)?.get(action.id);
      if (drawn && action.kind === 'tween' && action.ends) action.ends.drawn = drawn;
    }
    const placement = byClip.get(clip.id);
    if (!placement) continue;
    clip.initial.position = [placement.position[0], placement.position[1]];
    if (placement.rotation !== undefined) clip.initial.rotation = placement.rotation;
    if (placement.width !== undefined) {
      const formula = draft.formulas.find((f) => f.id === clip.formulaId);
      if (formula?.kind === 'brace') formula.width = placement.width;
      if (formula?.kind === 'shape') {
        formula.width = placement.width;
        formula.height = placement.height ?? formula.height;
      }
    }
    if (placement.vector !== undefined) {
      const formula = draft.formulas.find((f) => f.id === clip.formulaId);
      if (formula?.kind === 'line') {
        formula.vector = [placement.vector[0], placement.vector[1]];
        if (placement.trim !== undefined) formula.curve = withTrim(formula.curve, placement.trim);
      }
    }
  }
}

/** `project` with `placements` applied, as `applyAttachments` does on a draft: a new project with
 * structural copies of what changed. */
function withPlacements(project: Project, placements: readonly AttachedPlacement[]): Project {
  const valid = placements.filter(validPlacement);
  const byClip = new Map(valid.filter((p) => p.actionId === undefined).map((p) => [p.clipId, p]));
  const fits = fitsByClip(valid);
  const lines = endsByClip(valid);
  const sizes = new Map<FormulaId, { width: number; height?: number }>();
  const vectors = new Map<FormulaId, { vector: Vec2; trim?: number }>();
  const clips = project.clips.map((original) => {
    const boxes = fits.get(original.id);
    const drawns = lines.get(original.id);
    const clip =
      boxes || drawns
        ? {
            ...original,
            actions: original.actions.map((action) => {
              if (action.kind !== 'tween') return action;
              const box = action.fit && boxes?.get(action.id);
              if (box && action.fit) return { ...action, fit: { ...action.fit, fitted: box } };
              const drawn = action.ends && drawns?.get(action.id);
              return drawn && action.ends ? { ...action, ends: { ...action.ends, drawn } } : action;
            }),
          }
        : original;
    const placement = byClip.get(clip.id);
    if (!placement) return clip;
    if (placement.width !== undefined) {
      sizes.set(clip.formulaId, { width: placement.width, height: placement.height });
    }
    if (placement.vector !== undefined) {
      vectors.set(clip.formulaId, { vector: placement.vector, trim: placement.trim });
    }
    return {
      ...clip,
      initial: {
        ...clip.initial,
        position: placement.position,
        ...(placement.rotation !== undefined ? { rotation: placement.rotation } : {}),
      },
    };
  });
  const formulas = project.formulas.map((f) => {
    const line = vectors.get(f.id);
    if (line && f.kind === 'line') {
      return {
        ...f,
        vector: [line.vector[0], line.vector[1]] as Vec2,
        curve: line.trim === undefined ? f.curve : withTrim(f.curve, line.trim),
      };
    }
    const size = sizes.get(f.id);
    if (!size) return f;
    if (f.kind === 'brace') return { ...f, width: size.width };
    if (f.kind === 'shape') return { ...f, width: size.width, height: size.height ?? f.height };
    return f;
  });
  return { ...project, formulas, clips };
}

/** The fits among `placements`, by clip and by tween: the boxes to write into `fit.fitted`. */
function fitsByClip(
  placements: readonly AttachedPlacement[],
): Map<ClipId, Map<ActionId, ShapeFitBox>> {
  const out = new Map<ClipId, Map<ActionId, ShapeFitBox>>();
  for (const p of placements) {
    if (p.actionId === undefined || p.width === undefined || p.height === undefined) continue;
    const boxes = out.get(p.clipId) ?? new Map<ActionId, ShapeFitBox>();
    boxes.set(p.actionId, {
      center: [p.position[0], p.position[1]],
      width: p.width,
      height: p.height,
    });
    out.set(p.clipId, boxes);
  }
  return out;
}

/** The ends among `placements`, by clip and by tween: what to write into `ends.drawn`. */
function endsByClip(
  placements: readonly AttachedPlacement[],
): Map<ClipId, Map<ActionId, LineEndsDrawn>> {
  const out = new Map<ClipId, Map<ActionId, LineEndsDrawn>>();
  for (const p of placements) {
    if (p.actionId === undefined || !p.ends) continue;
    const drawns = out.get(p.clipId) ?? new Map<ActionId, LineEndsDrawn>();
    drawns.set(p.actionId, {
      start: [p.ends.start[0], p.ends.start[1]],
      end: [p.ends.end[0], p.ends.end[1]],
      trim: p.ends.trim,
      center: [p.position[0], p.position[1]],
    });
    out.set(p.clipId, drawns);
  }
  return out;
}

/** Defense at both write boundaries: malformed measurements must never enter durable state. */
function validPlacement(placement: AttachedPlacement): boolean {
  const { ends } = placement;
  return (
    placement.position.every(Number.isFinite) &&
    (ends === undefined ||
      (ends.start.every(Number.isFinite) &&
        ends.end.every(Number.isFinite) &&
        ends.trim >= 0 &&
        ends.trim <= 0.5)) &&
    (placement.rotation === undefined || Number.isFinite(placement.rotation)) &&
    (placement.vector === undefined || placement.vector.every(Number.isFinite)) &&
    (placement.trim === undefined || (placement.trim >= 0 && placement.trim <= 0.5)) &&
    (placement.width === undefined || validFitDimension(placement.width)) &&
    (placement.height === undefined || validFitDimension(placement.height))
  );
}

/** A settled scene: the project with its attached clips placed, and the renders that go with it
 * (a brace's, at the width it was fitted to). */
export interface SettledScene {
  project: Project;
  formulas: ResolvedFormulas;
  readiness: AttachmentReadiness;
}

/** What the render sync does in the app for the tools that settle a project value: renders
 * afresh what a pass changed (`engine/resolve.ts`, `refreshLocalRenders`). */
export type RefreshRenders = (
  project: Project,
  formulas: ResolvedFormulas,
) => Pick<SettledScene, 'project' | 'formulas'>;

/** The project and the renders with every attached clip placed, as the attach sync leaves them:
 * derived and applied again while something still moves — a chain of attachments settles one
 * link per pass; a brace's width changes its render, which `refresh` remakes between passes —
 * over the dependency graph's depth. An explicit pass budget may request a partial result;
 * readiness always says whether work remains. Pure: new values when something moved, else the same. */
export function settleScene(
  project: Project,
  formulas: ResolvedFormulas,
  refresh: RefreshRenders = (p, f) => ({ project: p, formulas: f }),
  passes = attachmentPassLimit(project),
): SettledScene {
  let current = refresh(project, formulas);
  for (let pass = 0; pass < passes; pass++) {
    const placements = deriveAttachments(current.project, current.formulas);
    if (placements.length === 0) break;
    current = refresh(withPlacements(current.project, placements), current.formulas);
  }
  return { ...current, readiness: attachmentReadiness(current.project, current.formulas) };
}

/** `settleScene` for the project alone, with the renders as they are. */
export function settleAttachments(
  project: Project,
  formulas: ResolvedFormulas,
  passes = attachmentPassLimit(project),
): Project {
  return settleScene(project, formulas, undefined, passes).project;
}
