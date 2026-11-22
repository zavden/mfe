/* Part transforms (`PartTransformAction`, ARCHITECTURE §5): a block moves, scales, rotates,
 * recolours or fades some glyphs of a clip *relative to where they are* when it starts — the
 * shift in screen axes, the scale and the rotation about the centre of those glyphs — and what it
 * did stays with them: a later tween of the whole formula carries the moved part along, as it
 * carries Manim's points.
 *
 * So besides the clip's pose, each glyph has a *part state*: a matrix in the formula-local frame
 * (the scene operation conjugated by the placement in force when the block ran, so that the
 * glyph's scene matrix is `placement · part`), and optional colour and opacity overrides. While a
 * block runs, its glyphs interpolate from that state: shift, scale and colour linearly, the
 * rotation as a true rotation about the part's centre (like a tween's), all driven by one eased
 * progress; afterwards they keep what the block reached (`rate(1)`, so `there_and_back` leaves
 * them where they were). A colour or opacity override lasts until a tween of the whole formula
 * changes that glyph's colour or the clip opacity, as Manim's `.set_color` / `.set_opacity` on
 * the formula would recolour the part. Blocks on one glyph never overlap (validation), so at
 * most one is running at a time.
 *
 * An Indicate and a Wiggle (`EmphasisEvent`, anim/emphasis.ts) are motions of the same kind that
 * come back to where they started: the Indicate a scale and a colour driven by its pulse easing,
 * the Wiggle a scale and a turn that follow curves of their own (`PartProfile`) rather than the
 * eased progress itself. */
import {
  IDENTITY,
  invert,
  lerpColor,
  multiply,
  sameColor,
  rotate,
  scale as scaleMatrix,
  translate,
  transformPointPath,
  type Contour,
  type Mat2D,
  type Vec2,
  type PointPath,
} from '../../geom';
import { TIME_EPSILON, type ClipState, type Easing, type Formula, type Target } from '../../model';
import { manimCenter } from '../measure';
import { pointPathOf } from './morph';
import type { RateFunction } from '../easing';
import { glyphColor } from '../placement';
import type { Pose } from './pose';
import type { TweenEvent } from '../types';

export interface PartState {
  /** Formula-local frame: the glyph's scene matrix is `placement · matrix`. */
  matrix: Mat2D;
  /** Colour override, or null for the colour of the clip's pose. */
  color: string | null;
  /** Opacity override, or null for the clip opacity. */
  opacity: number | null;
  /** Identifies a settled state for caches; '' while a block is running (nothing to cache). */
  key: string;
}

export const PLAIN_PART: PartState = { matrix: IDENTITY, color: null, opacity: null, key: '' };

/** How far along its scale and its turn a motion is at eased progress s (0…1 of its easing):
 * the fraction of `scale − 1` and of `rotation` applied. A part transform's is s itself; a
 * Wiggle's are `there_and_back(s)` and `wiggle(s, n)`. */
export interface PartProfile {
  scale: RateFunction;
  turn: RateFunction;
}

/** A block that moves some glyphs relative to where they are: a part transform event as it is,
 * or an Indicate / Wiggle (`emphasisMotion`), with a `profile` when its scale and turn do not
 * follow the eased progress itself. */
export interface PartMotion {
  id: string;
  start: number;
  end: number;
  easing: Easing;
  glyphs: number[];
  shift: Vec2;
  scale: number;
  rotation: number;
  color: string | null;
  opacity: number | null;
  profile?: PartProfile;
}

/** One block acting on one glyph. */
export interface PartSegment {
  start: number;
  end: number;
  rate: RateFunction;
  /** The clip placement while the block runs (a tween cannot overlap it) and its inverse — null
   * when the placement is degenerate (scale 0): then the block cannot move the glyphs. */
  placement: Mat2D;
  inverse: Mat2D | null;
  /** Scene-space centre of the block's glyphs when it starts: the scale and rotation pivot. */
  center: Vec2;
  shift: Vec2;
  scale: number;
  rotation: number;
  /** The curves the scale and the turn follow; null for the eased progress itself. */
  profile: PartProfile | null;
  /** The glyph's part matrix before the block. */
  before: Mat2D;
  /** Resolved colour and opacity before the block, and the block's targets (null: unchanged). */
  color0: string;
  color1: string | null;
  opacity0: number;
  opacity1: number | null;
  /** Overrides in force before the block, kept when it changes nothing. */
  keepColor: string | null;
  keepOpacity: number | null;
  /** The state the block leaves (at `rate(1)`). */
  after: PartState;
  /** When a later tween takes over the colour / opacity of this glyph (null: never). */
  colorUntil: number | null;
  opacityUntil: number | null;
}

export interface PartInput {
  /** The clip's part transform events and emphasis motions, in any order. */
  events: readonly PartMotion[];
  /** Formula-local contours of every drawable glyph. */
  local: ReadonlyMap<number, readonly Contour[]>;
  /** The clip's tweens, sorted by start. */
  tweens: readonly TweenEvent[];
  formula: Formula;
  target: Target;
  poseAt(t: number): Pose;
  rateOf(easing: Easing): RateFunction;
  /** Whether a glyph has left for good by `time` (consumed by a transfer, taken out by a block
   * it does not come back from): it no longer counts for the pivot, as in the exported scene,
   * where it is no longer part of the formula on screen. */
  gone?(glyph: number, time: number): boolean;
}

/** Which overrides of a part transform a tween takes over on `glyph`: the colour when the tween
 * changes that glyph's colour, the opacity when it changes the clip opacity. The exporter uses
 * the same rule. */
export function overridesEndedBy(
  from: ClipState,
  to: ClipState,
  glyph: number,
  formula: Formula,
): { color: boolean; opacity: boolean } {
  return {
    color: !sameColor(glyphColor(glyph, from, formula), glyphColor(glyph, to, formula)),
    opacity: from.opacity !== to.opacity,
  };
}

/** The scene operation of a block at progress `s`: scale and rotation about `center` (each as
 * far along as the profile says), then the shift. */
function operation(seg: PartSegment, s: number): Mat2D {
  const scaled = seg.profile ? seg.profile.scale(s) : s;
  const turned = seg.profile ? seg.profile.turn(s) : s;
  const about = multiply(
    translate(seg.center[0], seg.center[1]),
    multiply(
      multiply(rotate(seg.rotation * turned), scaleMatrix(1 + (seg.scale - 1) * scaled)),
      translate(-seg.center[0], -seg.center[1]),
    ),
  );
  return multiply(translate(seg.shift[0] * s, seg.shift[1] * s), about);
}

/** The glyph's part matrix at progress `s` of the block. */
function matrixAt(seg: PartSegment, s: number): Mat2D {
  if (!seg.inverse) return seg.before;
  return multiply(multiply(seg.inverse, multiply(operation(seg, s), seg.placement)), seg.before);
}

/** The part segments of every glyph a transform event touches, by canonical glyph. */
export function buildPartSegments(input: PartInput): Map<number, PartSegment[]> {
  const out = new Map<number, PartSegment[]>();
  const events = [...input.events].sort((a, b) => a.start - b.start);
  for (const event of events) {
    const glyphs = event.glyphs.filter((g) => input.local.has(g));
    if (glyphs.length === 0) continue;
    const pose = input.poseAt(event.start);
    const p = pose.matrix;
    const inverse = Math.abs(p[0] * p[3] - p[1] * p[2]) < 1e-12 ? null : invert(p);
    const rate = input.rateOf(event.easing);
    // Where the glyphs are when the block starts, parts included: the pivot. Glyphs that have
    // left for good do not count (the exporter no longer animates them).
    const current = new Map(glyphs.map((g) => [g, stateBefore(out.get(g), event.start)]));
    const live = glyphs.filter((g) => !input.gone?.(g, event.start));
    const all: PointPath[] = [];
    for (const g of live.length > 0 ? live : glyphs) {
      const m = multiply(pose.matrix, current.get(g)!.matrix);
      all.push(transformPointPath(m, pointPathOf(input.local.get(g)!, input.target)));
    }
    const center = manimCenter(all, input.target);
    const settled = rate(1);
    for (const g of glyphs) {
      const before = current.get(g)!;
      const color0 = before.color ?? pose.colorOf(g);
      const opacity0 = before.opacity ?? pose.opacity;
      const seg: PartSegment = {
        start: event.start,
        end: event.end,
        rate,
        placement: pose.matrix,
        inverse,
        center,
        shift: event.shift,
        scale: event.scale,
        rotation: event.rotation,
        profile: event.profile ?? null,
        before: before.matrix,
        color0,
        color1: event.color,
        opacity0,
        opacity1: event.opacity,
        keepColor: before.color,
        keepOpacity: before.opacity,
        after: PLAIN_PART,
        colorUntil: null,
        opacityUntil: null,
      };
      const color = event.color === null ? before.color : lerpColor(color0, event.color, settled);
      const opacity =
        event.opacity === null ? before.opacity : opacity0 + (event.opacity - opacity0) * settled;
      seg.after = {
        matrix: matrixAt(seg, settled),
        color,
        opacity,
        key: `${event.id}:${g}`,
      };
      // A later tween that changes this glyph's colour or the clip opacity takes over.
      for (const tween of input.tweens) {
        if (tween.start < event.end - TIME_EPSILON) continue;
        const ended = overridesEndedBy(tween.from, tween.to, g, input.formula);
        if (seg.colorUntil === null && color !== null && ended.color) seg.colorUntil = tween.start;
        if (seg.opacityUntil === null && opacity !== null && ended.opacity) {
          seg.opacityUntil = tween.start;
        }
      }
      const list = out.get(g);
      if (list) list.push(seg);
      else out.set(g, [seg]);
    }
  }
  return out;
}

/** The settled state a segment leaves at `time` (after it), overrides expired as due. */
function settledState(seg: PartSegment, time: number): PartState {
  const colorGone = seg.colorUntil !== null && time >= seg.colorUntil - TIME_EPSILON;
  const opacityGone = seg.opacityUntil !== null && time >= seg.opacityUntil - TIME_EPSILON;
  if (!colorGone && !opacityGone) return seg.after;
  return {
    matrix: seg.after.matrix,
    color: colorGone ? null : seg.after.color,
    opacity: opacityGone ? null : seg.after.opacity,
    key: `${seg.after.key}${colorGone ? '|c' : ''}${opacityGone ? '|o' : ''}`,
  };
}

/** The state before a block starting at `time`: what the previous segments left. */
function stateBefore(segments: readonly PartSegment[] | undefined, time: number): PartState {
  let state = PLAIN_PART;
  for (const seg of segments ?? []) {
    if (seg.start > time - TIME_EPSILON) break;
    state = settledState(seg, time);
  }
  return state;
}

/** The glyph's part state at absolute `time`; `segments` as `buildPartSegments` gives them. */
export function partStateAt(segments: readonly PartSegment[] | undefined, time: number): PartState {
  let state = PLAIN_PART;
  for (const seg of segments ?? []) {
    if (time < seg.start - TIME_EPSILON) break;
    if (time < seg.end - TIME_EPSILON) {
      const s = seg.rate(Math.min(1, Math.max(0, (time - seg.start) / (seg.end - seg.start))));
      return {
        matrix: matrixAt(seg, s),
        color: seg.color1 === null ? seg.keepColor : lerpColor(seg.color0, seg.color1, s),
        opacity:
          seg.opacity1 === null
            ? seg.keepOpacity
            : seg.opacity0 + (seg.opacity1 - seg.opacity0) * s,
        key: '',
      };
    }
    state = settledState(seg, time);
  }
  return state;
}
