/* What one glyph looks like during an intro or outro, as Manim draws it.
 *
 * Every function takes the glyph's progress `p` — the value Manim hands to
 * `interpolate_submobject` after lagging and the rate function (see progress.ts) — and returns
 * the paths and paint to draw, or null when Manim would show nothing (a stroke of zero length, a
 * mobject scaled to a point, zero opacity). Geometry is computed in formula-local space and
 * placed with the clip's matrix; fades and grows are affine maps about the animated group's
 * centre applied on top, which is what Manim's point-by-point `Transform` interpolation of an
 * affinely related start and end amounts to.
 *
 * The glyph has a style of its own (`GlyphStyle`: the opacity of its fill, the width and opacity
 * of its stroke — a text glyph is filled without a stroke, a circle is stroked and empty), which
 * every animation ends at: the fades and grows scale both opacities together (`set_opacity(0)`
 * to the glyph as it is), Create keeps the paints of the cut path, and Write /
 * DrawBorderThenFill trace an outline of width 2 and then interpolate from that outline to the
 * glyph's own style (`interpolate_color`: the fill opacity from 0, the stroke width from 2, the
 * stroke colour from the outline's) — a text glyph fills in as its outline fades, a stroked
 * shape's outline grows to its own width. The clip's opacity scales both opacities throughout.
 *
 * Sources: ManimCE `animation/creation.py`, `fading.py`, `growing.py`, `transform.py`
 * (ShrinkToCenter); ManimGL `animation/creation.py`, `fading.py`, `growing.py`, `transform.py`. */
import {
  integerInterpolate,
  lerpColor,
  multiply,
  partialContours,
  partialQuadraticPoints,
  pointsToContours,
  traceAt,
  transformContour,
  type ArrowTrace,
  type Contour,
  type Mat2D,
  type Vec2,
} from '../../geom';
import type { GlyphStyle, IntroKind, OutroKind, Target } from '../../model';
import type { Paint, StrokePaint } from '../types';
import { pointPathOf } from './morph';

/** Stroke width of the outline DrawBorderThenFill / Write draws (Manim `stroke_width=2`). */
export const OUTLINE_WIDTH = 2;

/** Below this, a progress or width is float noise at a boundary, not something to draw. */
const NEGLIGIBLE = 1e-9;

export interface Look {
  /** Final scene-space paths. */
  contours: Contour[];
  fill: Paint | null;
  stroke: StrokePaint | null;
  /** The contours are a cut of the glyph's path (an outline being traced, a path being created):
   * where the cut lands differs a little between the preview and a library (`Drawable.partial`). */
  partial: boolean;
}

export interface LookInput {
  /** Formula-local contours of the glyph. */
  local: readonly Contour[];
  /** Placement of the formula (formula-local → scene) in the clip state of this instant. */
  matrix: Mat2D;
  /** Resolved colour of the glyph in that state: of its stroke, and of its fill too unless
   * `fillColor` says otherwise. */
  color: string;
  /** The colour of the fill when it is not `color` (a shape with a fill colour of its own). */
  fillColor?: string | null;
  /** Clip opacity (or the part transform's override): scales both of the style's opacities. */
  opacity: number;
  /** The glyph's own style, what every animation ends at. */
  style: GlyphStyle;
  /** Colour of the whole formula (clip colour override, else the formula colour). ManimGL's Write
   * draws every outline in it (`stroke_color=vmobject.get_color()` of the group). */
  groupColor: string;
  /** Scene-space centre of the animated group (fade/grow/shrink pivot). */
  center: Vec2;
  target: Target;
  /** FadeIn / FadeOut parameters (`shift`, `scale`). */
  shift: Vec2;
  scale: number;
  /** GrowArrow: the glyph is the shaft of the arrow, whose stroke ManimCE grows with it. */
  shaft?: boolean;
  /** GrowArrow of a bent arrow (D149): what it follows, in the glyph's own frame, and which
   * member of the arrow the glyph is — its shaft, the tip at its end or the one at its start. */
  trace?: { path: ArrowTrace; member: 'shaft' | 'tip' | 'startTip' };
}

export interface Paints {
  fill: Paint | null;
  stroke: StrokePaint | null;
}

/** The glyph's own paints with both opacities scaled by `factor` (the clip's opacity, times what
 * the animation leaves of it); null when neither shows anything. */
export function paintsOf(input: LookInput, factor: number): Paints | null {
  const fillOpacity = input.style.fillOpacity * factor;
  const strokeOpacity = input.style.strokeOpacity * factor;
  const width = input.style.strokeWidth;
  const fill =
    fillOpacity > NEGLIGIBLE
      ? { color: input.fillColor ?? input.color, opacity: fillOpacity }
      : null;
  const stroke =
    strokeOpacity > NEGLIGIBLE && width > NEGLIGIBLE
      ? { color: input.color, opacity: strokeOpacity, width }
      : null;
  return fill || stroke ? { fill, stroke } : null;
}

export function placed(input: LookInput): Look | null {
  const paints = paintsOf(input, input.opacity);
  if (!paints) return null;
  return {
    contours: input.local.map((c) => transformContour(input.matrix, c)),
    ...paints,
    partial: false,
  };
}

/** Map about `center`: scale `s`, then translate by `shift`. */
function aboutCenter(center: Vec2, s: number, shift: Vec2): Mat2D {
  return [s, 0, 0, s, center[0] + shift[0] - s * center[0], center[1] + shift[1] - s * center[1]];
}

function affineLook(input: LookInput, s: number, shift: Vec2, opacityFactor: number): Look | null {
  if (s === 0) return null;
  const paints = paintsOf(input, input.opacity * opacityFactor);
  if (!paints) return null;
  const matrix = multiply(aboutCenter(input.center, s, shift), input.matrix);
  return {
    contours: input.local.map((c) => transformContour(matrix, c)),
    ...paints,
    partial: false,
  };
}

/** FadeIn: the faded start state is scaled by `scale` (CE) or `1 / scale` (GL) about the
 * centre and shifted by `−shift`; it ends at the glyph's own state. */
export function fadeInLook(input: LookInput, p: number): Look | null {
  const from = input.target === 'ce' ? input.scale : 1 / Math.max(input.scale, 1e-9);
  const s = from + (1 - from) * p;
  return affineLook(input, s, [-input.shift[0] * (1 - p), -input.shift[1] * (1 - p)], p);
}

/** FadeOut: ends scaled by `scale` about the centre, shifted by `shift`, with opacity 0. `q` is
 * the progress of the fade (0 = intact). */
export function fadeOutLook(input: LookInput, q: number): Look | null {
  const s = 1 + (input.scale - 1) * q;
  return affineLook(input, s, [input.shift[0] * q, input.shift[1] * q], 1 - q);
}

/** GrowFromCenter: points travel from the centre to their place. */
export function growLook(input: LookInput, p: number): Look | null {
  return affineLook(input, p, [0, 0], 1);
}

/** GrowArrow: the arrow grows from its start (`center`), tips and all — what is drawn at `p` is
 * the arrow scaled by it about that point. ManimCE grows the stroke of the shaft with it, from
 * none (its `Arrow` sets its stroke from its length, and starts with none); ManimGL keeps it. */
export function growArrowLook(input: LookInput, p: number): Look | null {
  const look = affineLook(input, p, [0, 0], 1);
  if (look?.stroke && input.shaft && input.target === 'ce') {
    look.stroke = { ...look.stroke, width: look.stroke.width * p };
  }
  return look;
}

/** How much of the way of a traced arrow is drawn when its tips reach their size. */
export const TRACE_TIP_GROWN = 0.25;

/** GrowArrow of a bent arrow (D149), an animation of the editor's own — the export writes it as
 * `_TraceArrow` —: the shaft is drawn from its start as Create draws it; the tip at the end sits
 * with its base on the end of what is drawn, turned as the shaft runs there, and grows about that
 * base from nothing to its size over the first quarter of the way; the tip at the start of a
 * double arrow grows about its own base, where it is. */
export function traceArrowLook(input: LookInput, p: number): Look | null {
  const { trace } = input;
  if (!trace || trace.member === 'shaft') return createLook(input, p);
  const k = Math.min(1, p / TRACE_TIP_GROWN);
  if (k <= 0) return null;
  const paints = paintsOf(input, input.opacity);
  if (!paints) return null;
  const { path } = trace;
  const base = trace.member === 'tip' ? path.endBase : (path.startBase ?? path.endBase);
  const { at, turn } = trace.member === 'tip' && p < 1 ? traceAt(path, p) : { at: base, turn: 0 };
  const cos = k * Math.cos(turn);
  const sin = k * Math.sin(turn);
  // A point of the tip goes to `at + k · R(turn) · (point − base)`.
  const grown: Mat2D = [
    cos,
    sin,
    -sin,
    cos,
    at[0] - cos * base[0] + sin * base[1],
    at[1] - sin * base[0] - cos * base[1],
  ];
  const matrix = multiply(input.matrix, grown);
  return {
    contours: input.local.map((c) => transformContour(matrix, c)),
    ...paints,
    partial: false,
  };
}

/** ShrinkToCenter: points travel from their place to the centre (q = progress, 0 = intact). */
export function shrinkLook(input: LookInput, q: number): Look | null {
  return affineLook(input, 1 - q, [0, 0], 1);
}

/** The first fraction `p` of the glyph's path, cut as the target library cuts it
 * (`pointwise_become_partial`, by curve count): ManimCE by the cubic curves of the outline,
 * ManimGL by the quadratics it stores, one per line and two per cubic (`toPointPath`), so the two
 * reach a point of the outline at different fractions when the glyph mixes lines and curves. */
function partialGlyph(input: LookInput, p: number): Contour[] {
  if (input.target === 'ce') return partialContours(input.local, 0, p);
  const path = pointPathOf(input.local, 'gl');
  return pointsToContours(path, partialQuadraticPoints(path.points, 0, p));
}

/** Create / ShowCreation: the first fraction `p` of the path (by curve count), painted as the
 * glyph is. */
export function createLook(input: LookInput, p: number): Look | null {
  if (p <= 0) return null;
  const paints = paintsOf(input, input.opacity);
  if (!paints) return null;
  const part = p >= 1 ? input.local : partialGlyph(input, p);
  if (part.length === 0) return null;
  return {
    contours: part.map((c) => transformContour(input.matrix, c)),
    ...paints,
    partial: p < 1,
  };
}

/** DrawBorderThenFill: for p < ½ the outline is traced (stroke width 2 in `outlineColor`, with
 * the glyph's stroke opacity, no fill); for p ≥ ½ the glyph interpolates from that outline to
 * its own style: the fill opacity from 0, the stroke width from 2 and its colour from the
 * outline's. */
export function drawBorderThenFillLook(
  input: LookInput,
  p: number,
  outlineColor: string,
): Look | null {
  if (p <= 0 || input.opacity <= 0) return null;
  const strokeOpacity = input.style.strokeOpacity * input.opacity;
  const [stage, sub] = integerInterpolate(0, 2, p);
  if (stage === 0) {
    // An outline the glyph's stroke opacity hides (a box with no stroke at all) shows nothing.
    if (strokeOpacity <= NEGLIGIBLE) return null;
    const part = partialGlyph(input, sub);
    if (part.length === 0) return null;
    return {
      contours: part.map((c) => transformContour(input.matrix, c)),
      fill: null,
      stroke: { color: outlineColor, opacity: strokeOpacity, width: OUTLINE_WIDTH },
      partial: true,
    };
  }
  const width = OUTLINE_WIDTH + (input.style.strokeWidth - OUTLINE_WIDTH) * sub;
  const fillOpacity = input.style.fillOpacity * input.opacity * sub;
  const fill =
    fillOpacity > NEGLIGIBLE
      ? { color: input.fillColor ?? input.color, opacity: fillOpacity }
      : null;
  const stroke =
    width > NEGLIGIBLE && strokeOpacity > NEGLIGIBLE
      ? { color: lerpColor(outlineColor, input.color, sub), opacity: strokeOpacity, width }
      : null;
  if (!fill && !stroke) return null;
  return {
    contours: input.local.map((c) => transformContour(input.matrix, c)),
    fill,
    stroke,
    partial: false,
  };
}

/** Colour of the traced outline of Write / DrawBorderThenFill.
 *  - ManimCE (both): per glyph — its stroke colour when it has a stroke, else its fill colour:
 *    the glyph's colour either way.
 *  - ManimGL DrawBorderThenFill: per glyph (its stroke colour).
 *  - ManimGL Write: `stroke_color = vmobject.get_color()` of the whole formula for every glyph. */
export function outlineColor(
  kind: 'write' | 'unwrite' | 'draw_border_then_fill',
  input: LookInput,
): string {
  return input.target === 'gl' && (kind === 'write' || kind === 'unwrite')
    ? input.groupColor
    : input.color;
}

/** Look of an intro glyph at progress `p` (Manim's post-rate sub-alpha; 1 = fully present). */
export function introLook(kind: IntroKind, input: LookInput, p: number): Look | null {
  switch (kind) {
    case 'none':
      return placed(input);
    case 'write':
      return drawBorderThenFillLook(input, p, outlineColor('write', input));
    case 'draw_border_then_fill':
      return drawBorderThenFillLook(input, p, outlineColor('draw_border_then_fill', input));
    case 'create':
      return createLook(input, p);
    case 'fade_in':
      return fadeInLook(input, p);
    case 'grow_from_center':
      return growLook(input, p);
    case 'grow_arrow':
      if (input.trace) return traceArrowLook(input, p);
      return growArrowLook(input, p);
  }
}

/** Look of an outro glyph at progress `p`. For fade_out and shrink_to_center `p` is the forward
 * progress of the fade (0 = intact, 1 = gone); for unwrite and uncreate it is the progress of
 * the corresponding *Write* / *Create* played in reverse, i.e. 1 = intact, 0 = gone. */
export function outroLook(kind: OutroKind, input: LookInput, p: number): Look | null {
  switch (kind) {
    case 'none':
      return placed(input);
    case 'unwrite':
      return drawBorderThenFillLook(input, p, outlineColor('unwrite', input));
    case 'uncreate':
      return createLook(input, p);
    case 'fade_out':
      return fadeOutLook(input, p);
    case 'shrink_to_center':
      return shrinkLook(input, p);
  }
}

/** Whether the outro's progress is Manim's reversed one (see outroLook). */
export function outroIsReversed(kind: OutroKind): boolean {
  return kind === 'unwrite' || kind === 'uncreate';
}
