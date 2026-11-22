/* The placement and colours of a clip at an instant: its initial state, the state after the
 * tweens that have finished, or a blend while a tween runs.
 *
 * A tween is a single Manim animation of the whole clip, so one eased alpha drives every
 * channel: position, scale, rotation (a true rotation about the formula centre, like Manim's
 * `Rotate`), flips (the x or y scale passes linearly from +1 to −1), opacity and — per glyph —
 * colour, interpolated component-wise in RGB as `Transform` does in both libraries; and, for a
 * shape whose Transforms change its paint (D123), the width of its stroke, the opacity of its
 * stroke and of its fill and the colour of its fill, each linearly, as Manim interpolates them
 * (`MANIM-QUIRKS`: what it holds, and so what it interpolates, are the opacities with the clip's
 * in them). */
import { lerpColor, multiply, scale as scaleMatrix, type Mat2D, type Vec2 } from '../../geom';
import {
  paintsApart,
  shapePaint,
  TIME_EPSILON,
  type ClipState,
  type Formula,
  type GlyphStyle,
  type ShapeFormula,
  type Target,
} from '../../model';
import { rateFunction } from '../easing';
import { glyphColor, placementMatrix } from '../placement';
import { endsAtStart } from '../state';
import type { TweenEvent } from '../types';

/** The paint of a shape in a pose, when it is not what its render carries (`paintsApart`). */
export interface PosePaint {
  /** The stroke's width, and the opacities of the stroke and of the fill with the clip's
   * opacity in them: drawn at an opacity of 1. */
  style: GlyphStyle;
  /** The same before the clip's opacity, for a glyph whose opacity a part transform sets. */
  own: GlyphStyle;
  /** The fill's colour; null while it is the stroke's. */
  fillColor: string | null;
}

export interface Pose {
  matrix: Mat2D;
  opacity: number;
  /** A shape's paint in this pose; null for what is painted as its render says, at `opacity`. */
  paint: PosePaint | null;
  /** Clip colour override (or null) of the state, for the formula-wide colour. */
  stateColor: string | null;
  /** Colour of a canonical glyph in this pose. */
  colorOf(glyph: number): string;
  /** Identifies `matrix` for caches. */
  matrixKey: string;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sign = (flip: boolean) => (flip ? -1 : 1);

function sameColors(a: ClipState, b: ClipState): boolean {
  if (a.color !== b.color) return false;
  const ka = Object.keys(a.glyphColors);
  const kb = Object.keys(b.glyphColors);
  return ka.length === kb.length && ka.every((k) => a.glyphColors[k] === b.glyphColors[k]);
}

/** A shape's paint in `state`, and the colour of its fill there (its own, else the stroke's). */
function paintIn(state: ClipState, formula: ShapeFormula) {
  const paint = shapePaint(formula, state);
  const own: GlyphStyle = {
    fillOpacity: paint.fillOpacity,
    strokeWidth: paint.strokeWidth,
    strokeOpacity: paint.strokeOpacity,
  };
  return { own, fillColor: paint.fillColor, opacity: state.opacity };
}

/** `own` with the clip's opacity in its two opacities. */
const withOpacity = (own: GlyphStyle, opacity: number): GlyphStyle => ({
  fillOpacity: own.fillOpacity * opacity,
  strokeWidth: own.strokeWidth,
  strokeOpacity: own.strokeOpacity * opacity,
});

const lerpStyle = (a: GlyphStyle, b: GlyphStyle, t: number): GlyphStyle => ({
  fillOpacity: lerp(a.fillOpacity, b.fillOpacity, t),
  strokeWidth: lerp(a.strokeWidth, b.strokeWidth, t),
  strokeOpacity: lerp(a.strokeOpacity, b.strokeOpacity, t),
});

/** `apart`: the clip's object is a shape whose paint is read from its states (`paintsApart`). */
export function staticPose(state: ClipState, formula: Formula, apart = false): Pose {
  const matrix = placementMatrix(state);
  let paint: PosePaint | null = null;
  if (apart && formula.kind === 'shape') {
    const { own, fillColor } = paintIn(state, formula);
    paint = { style: withOpacity(own, state.opacity), own, fillColor };
  }
  return {
    matrix,
    opacity: state.opacity,
    paint,
    stateColor: state.color,
    colorOf: (glyph) => glyphColor(glyph, state, formula),
    matrixKey: matrix.join(','),
  };
}

export function blendPose(
  from: ClipState,
  to: ClipState,
  alpha: number,
  formula: Formula,
  apart = false,
): Pose {
  const position: Vec2 = [
    lerp(from.position[0], to.position[0], alpha),
    lerp(from.position[1], to.position[1], alpha),
  ];
  const s = lerp(from.scale, to.scale, alpha);
  const rotation = lerp(from.rotation, to.rotation, alpha);
  const base = { position, scale: s, rotation };
  let matrix: Mat2D;
  if (from.flipX === to.flipX && from.flipY === to.flipY) {
    matrix = placementMatrix({ ...base, flipX: to.flipX, flipY: to.flipY });
  } else {
    const fx = lerp(sign(from.flipX), sign(to.flipX), alpha);
    const fy = lerp(sign(from.flipY), sign(to.flipY), alpha);
    matrix = multiply(
      placementMatrix({ ...base, flipX: false, flipY: false }),
      scaleMatrix(fx, fy),
    );
  }
  const colorsMove = !sameColors(from, to);
  let paint: PosePaint | null = null;
  if (apart && formula.kind === 'shape') {
    const a = paintIn(from, formula);
    const b = paintIn(to, formula);
    // A fill that follows the stroke at both ends follows it in between; otherwise its colour
    // goes from the one it has to the one it gets, the stroke's standing in for none.
    const fillColor =
      a.fillColor === null && b.fillColor === null
        ? null
        : lerpColor(
            a.fillColor ?? glyphColor(0, from, formula),
            b.fillColor ?? glyphColor(0, to, formula),
            alpha,
          );
    paint = {
      style: lerpStyle(withOpacity(a.own, a.opacity), withOpacity(b.own, b.opacity), alpha),
      own: lerpStyle(a.own, b.own, alpha),
      fillColor,
    };
  }
  return {
    matrix,
    opacity: lerp(from.opacity, to.opacity, alpha),
    paint,
    stateColor: from.color,
    colorOf: colorsMove
      ? (glyph) =>
          lerpColor(glyphColor(glyph, from, formula), glyphColor(glyph, to, formula), alpha)
      : (glyph) => glyphColor(glyph, to, formula),
    matrixKey: matrix.join(','),
  };
}

/** Pose of a clip at absolute time `t`; `tweens` are the clip's tween events sorted by start. */
export function poseAt(
  initial: ClipState,
  tweens: readonly TweenEvent[],
  t: number,
  formula: Formula,
  target: Target,
): Pose {
  // One rule for the whole clip: a shape some Transform repaints is painted from its states
  // from its first instant on.
  const apart = paintsApart(formula, [initial, ...tweens.map((tween) => tween.to)]);
  let current = initial;
  for (const tween of tweens) {
    if (t < tween.start - TIME_EPSILON) break;
    if (t < tween.end - TIME_EPSILON && tween.end > tween.start) {
      const frac = (t - tween.start) / (tween.end - tween.start);
      const alpha = rateFunction(tween.easing, target)(frac);
      return blendPose(tween.from, tween.to, alpha, formula, apart);
    }
    current = endsAtStart(tween.easing) ? tween.from : tween.to;
  }
  return staticPose(current, formula, apart);
}
