/* Manim's basic shapes, built in the browser as each library builds them, so that a circle, a
 * rectangle, a line or an arrow of the preview is the one Manim draws (fixtures/manim/gen_shapes.py
 * samples them from both venvs; scene/__tests__/shapes.test.ts checks every point):
 *
 *   - `Circle(radius)`: ManimCE's `Arc` of nine anchors — eight cubics, the handles a factor
 *     4/3·tan(θ/4) along the tangents (`_set_pre_positioned_points`) — and ManimGL's sixteen
 *     quadratics (`quadratic_bezier_points_for_arc`: the handles on the bisecting rays, 1/cos(θ/2)
 *     out), raised to cubics here. Both run counter-clockwise from the rightmost point. A `Dot` is
 *     the same circle in another style.
 *   - `Rectangle(width, height)`: `Polygon(UR, UL, DL, DR)`, four straight runs from the upper
 *     right corner, counter-clockwise (`rectContour`). `RoundedRectangle(corner_radius)` rounds
 *     each corner with `round_corners`: an `ArcBetweenPoints` of a quarter turn, one cubic in
 *     ManimCE and two quadratics in ManimGL, between runs that are straight cubics; ManimCE clamps
 *     the cut of a corner to half the shorter side, ManimGL does not.
 *   - `Line(start, end, buff)`: one straight run, `buff` shorter at each end
 *     (`pointwise_become_partial`); ManimCE leaves a line shorter than twice its buff whole,
 *     ManimGL shrinks it to its midpoint.
 *   - `Arrow(start, end)` is ManimCE's: the line, shortened by its buff, then by the tip's length,
 *     and a filled isosceles tip `tip_length` long and wide — capped at a quarter of the arrow's
 *     length — whose stroke width is capped at five times that length. ManimGL's own `Arrow` is
 *     a filled polygon; `Line(...).add_tip(length=, width=)` with these values builds the same
 *     two members point for point (PLAN-RUTA §7 Q7), which is what the export writes.
 *
 * The functions return formula-local cubic contours, as every glyph is held; `toPointPath` gives
 * the point lists back as each library stores them. Styles (fill opacity, stroke width) are the
 * object's, not the geometry's: `MANIM_SHAPE_STYLE` lists Manim's defaults per shape.
 * `shapeContours` builds the shape objects (`ShapeKind`) of these, at the size they were fitted
 * to. */
import type { GlyphStyle, ShapeDiagonal, ShapeKind, Vec2 } from '../model';
import { pointsToContours } from './morph';
import { lineTo, rectContour } from './primitives';
import type { Contour } from './types';

export type ShapeTarget = 'ce' | 'gl';

/** Manim's defaults: `DEFAULT_STROKE_WIDTH`, `DEFAULT_DOT_RADIUS`, `DEFAULT_ARROW_TIP_LENGTH`,
 * the `Arrow`'s stroke width and buff (`MED_SMALL_BUFF`). */
export const DEFAULT_STROKE_WIDTH = 4;
export const DOT_RADIUS = 0.08;
export const ARROW_TIP_LENGTH = 0.35;
export const ARROW_STROKE_WIDTH = 6;
export const ARROW_BUFF = 0.25;
/** `Arrow.max_tip_length_to_length_ratio` and `max_stroke_width_to_length_ratio`. */
const ARROW_MAX_TIP_RATIO = 0.25;
const ARROW_MAX_STROKE_RATIO = 5;

/** How each library styles the shape by default (the arrow's shaft at full length). */
export const MANIM_SHAPE_STYLE: Readonly<
  Record<'circle' | 'dot' | 'rect' | 'line' | 'arrow' | 'tip', GlyphStyle>
> = {
  circle: { fillOpacity: 0, strokeWidth: DEFAULT_STROKE_WIDTH, strokeOpacity: 1 },
  dot: { fillOpacity: 1, strokeWidth: 0, strokeOpacity: 1 },
  rect: { fillOpacity: 0, strokeWidth: DEFAULT_STROKE_WIDTH, strokeOpacity: 1 },
  line: { fillOpacity: 0, strokeWidth: DEFAULT_STROKE_WIDTH, strokeOpacity: 1 },
  arrow: { fillOpacity: 0, strokeWidth: ARROW_STROKE_WIDTH, strokeOpacity: 1 },
  tip: { fillOpacity: 1, strokeWidth: 0, strokeOpacity: 1 },
};

/** The points of the unit arc of `angle` radians from angle 0 — counter-clockwise for a positive
 * angle —, as the library holds it with `components` curves sharing their anchors: ManimCE cubics
 * (an anchor, then two handles and an anchor per curve), ManimGL quadratics (an anchor, then a
 * handle and an anchor per curve). */
export function arcPoints(target: ShapeTarget, angle: number, components: number): number[] {
  if (target === 'ce') {
    // Arc._set_pre_positioned_points: anchors evenly spaced, handles along the tangents.
    const step = angle / components;
    const factor = (4 / 3) * Math.tan(step / 4);
    const c: Contour = [1, 0];
    for (let k = 0; k < components; k++) {
      const a0 = k * step;
      const a1 = (k + 1) * step;
      const x0 = Math.cos(a0);
      const y0 = Math.sin(a0);
      const x1 = Math.cos(a1);
      const y1 = Math.sin(a1);
      c.push(x0 - factor * y0, y0 + factor * x0, x1 + factor * y1, y1 - factor * x1, x1, y1);
    }
    return c;
  }
  // quadratic_bezier_points_for_arc: 2n + 1 points on the arc, the odd ones pushed out so each
  // quadratic touches the circle at its middle.
  const n = 2 * components + 1;
  const step = angle / (n - 1);
  const push = 1 / Math.cos(angle / components / 2);
  const points = new Array<number>(2 * n);
  for (let i = 0; i < n; i++) {
    const r = i % 2 === 1 ? push : 1;
    points[2 * i] = r * Math.cos(i * step);
    points[2 * i + 1] = r * Math.sin(i * step);
  }
  return points;
}

/** The unit arc of `arcPoints` as a cubic contour: ManimGL's quadratics raised to cubics. */
function unitArc(target: ShapeTarget, angle: number, components: number): Contour {
  const points = arcPoints(target, angle, components);
  return target === 'ce' ? points : pointsToContours({ degree: 2 }, Float64Array.from(points))[0]!;
}

/** x ↦ cx + r·x, y ↦ cy + r·y. */
function placeArc(arc: Contour, radius: number, cx: number, cy: number): Contour {
  const out = new Array<number>(arc.length);
  for (let i = 0; i < arc.length; i += 2) {
    out[i] = cx + radius * arc[i]!;
    out[i + 1] = cy + radius * arc[i + 1]!;
  }
  return out;
}

/** `Circle(radius, arc_center=center)` of `target`'s library: one closed contour, eight cubics
 * in ManimCE, sixteen (raised quadratics) in ManimGL, counter-clockwise from (cx + r, cy). */
export function circleContour(target: ShapeTarget, radius: number, center: Vec2 = [0, 0]): Contour {
  return placeArc(
    unitArc(target, 2 * Math.PI, target === 'ce' ? 8 : 16),
    radius,
    center[0],
    center[1],
  );
}

/** `Rectangle(width, height)` centred on `center`, with its corners rounded by `radius` as
 * `RoundedRectangle(corner_radius=radius)` rounds them (`round_corners`: a quarter arc per corner
 * — one cubic in ManimCE, two quadratics in ManimGL — and a straight run between arcs, from the
 * upper right corner's arc, counter-clockwise). With no radius, `rectContour`'s four runs. */
export function rectangleContour(
  target: ShapeTarget,
  width: number,
  height: number,
  center: Vec2 = [0, 0],
  radius = 0,
): Contour {
  const [cx, cy] = center;
  const hw = width / 2;
  const hh = height / 2;
  if (radius <= 0) {
    return rectContour({ minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh });
  }
  // The cut of each corner: the radius for a right angle (radius · tan(90° / 2)); ManimCE keeps
  // it within half the shorter side, so that the arcs of a corner never cross.
  const cut = target === 'ce' ? Math.min(radius, Math.min(width, height) / 2) : radius;
  const quarter = unitArc(target, Math.PI / 2, target === 'ce' ? 1 : 2);
  // Each corner's arc, a quarter of the circle of radius `cut` about the corner moved inward, in
  // the path's order: UR (angles 0 → 90°), UL (90° → 180°), DL, DR.
  const corners: [number, number, number][] = [
    [cx + hw - cut, cy + hh - cut, 0],
    [cx - hw + cut, cy + hh - cut, Math.PI / 2],
    [cx - hw + cut, cy - hh + cut, Math.PI],
    [cx + hw - cut, cy - hh + cut, (3 * Math.PI) / 2],
  ];
  const arcs = corners.map(([ax, ay, start]) => {
    const cos = Math.cos(start);
    const sin = Math.sin(start);
    const out = new Array<number>(quarter.length);
    for (let i = 0; i < quarter.length; i += 2) {
      const x = quarter[i]!;
      const y = quarter[i + 1]!;
      out[i] = ax + cut * (cos * x - sin * y);
      out[i + 1] = ay + cut * (sin * x + cos * y);
    }
    return out;
  });
  const c: Contour = [arcs[0]![0]!, arcs[0]![1]!];
  arcs.forEach((arc, k) => {
    c.push(...arc.slice(2));
    const next = arcs[(k + 1) % 4]!;
    lineTo(c, next[0]!, next[1]!);
  });
  return c;
}

/** `Line(start, end, buff)` of `target`'s library: one straight run, `buff` shorter at each end.
 * A line shorter than twice its buff stays whole in ManimCE; ManimGL shrinks it to its midpoint
 * (a run of no length). */
export function lineContour(target: ShapeTarget, start: Vec2, end: Vec2, buff = 0): Contour {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  let a = 0;
  if (buff > 0 && length > 0) {
    if (target === 'ce') a = length < 2 * buff ? 0 : buff / length;
    else a = Math.min(buff / length, 0.5);
  }
  const c: Contour = [start[0] + a * dx, start[1] + a * dy];
  lineTo(c, end[0] - a * dx, end[1] - a * dy);
  return c;
}

/** The contours of a shape object fitted to a box `width` × `height`, centred on the origin (the
 * render centres every object): a box, its corners rounded by `cornerRadius`; a circle of diameter
 * `width`; an underline, one run `width` long; a cross, two runs over the corners of the box, from
 * the upper left one and from the upper right one, as `Cross` lays its lines; a cross line, one
 * run over the corners of `diagonal`, from the first it names to the second. A box with no size
 * yet keeps square corners. */
export function shapeContours(
  target: ShapeTarget,
  shape: ShapeKind,
  width: number,
  height: number,
  cornerRadius = 0,
  diagonal: ShapeDiagonal = 'dl_ur',
): Contour[] {
  const hw = width / 2;
  const hh = height / 2;
  switch (shape) {
    case 'box':
      return [
        rectangleContour(target, width, height, [0, 0], width > 0 && height > 0 ? cornerRadius : 0),
      ];
    case 'circle':
      return [circleContour(target, hw)];
    case 'underline':
      return [lineContour(target, [-hw, 0], [hw, 0])];
    case 'cross':
      return [lineContour(target, [-hw, hh], [hw, -hh]), lineContour(target, [hw, hh], [-hw, -hh])];
    case 'cross_line':
      return [
        diagonal === 'dl_ur'
          ? lineContour(target, [-hw, -hh], [hw, hh])
          : lineContour(target, [-hw, hh], [hw, -hh]),
      ];
  }
}

export interface ArrowOptions {
  /** `buff` (default `MED_SMALL_BUFF`, 0.25). */
  buff?: number;
  /** The shaft's `stroke_width` before the length cap (default 6). */
  strokeWidth?: number;
  /** `tip_length` before the length cap (default 0.35). */
  tipLength?: number;
}

export interface ArrowShape {
  /** The shaft: a straight run from the start (past its buff) to the base of the tip. */
  shaft: Contour;
  /** The tip: a closed triangle from its point, through the corner on the left of the arrow's
   * direction and the one on its right, back to the point. */
  tip: Contour;
  /** The shaft's stroke width, capped at five times the arrow's length. */
  strokeWidth: number;
  /** The tip's length and width, capped at a quarter of the arrow's length. */
  tipLength: number;
}

/** ManimCE's `Arrow(start, end, buff=, stroke_width=, tip_length=)` — and ManimGL's `Line(start,
 * end, buff=, stroke_width=)` with `.add_tip(length=, width=)` of the returned values —, the same
 * points in both libraries. The arrow's length is the line's after its buff (ManimCE's buff
 * rule); the tip and the stroke width are capped by it (`get_default_tip_length`,
 * `_set_stroke_width_from_length`). */
export function arrowShape(start: Vec2, end: Vec2, options: ArrowOptions = {}): ArrowShape {
  const buff = options.buff ?? ARROW_BUFF;
  const line = lineContour('ce', start, end, buff);
  const x0 = line[0]!;
  const y0 = line[1]!;
  const x1 = line[6]!;
  const y1 = line[7]!;
  const length = Math.hypot(x1 - x0, y1 - y0);
  const tipLength = Math.min(options.tipLength ?? ARROW_TIP_LENGTH, ARROW_MAX_TIP_RATIO * length);
  const strokeWidth = Math.min(
    options.strokeWidth ?? ARROW_STROKE_WIDTH,
    ARROW_MAX_STROKE_RATIO * length,
  );
  const ux = length > 0 ? (x1 - x0) / length : 1;
  const uy = length > 0 ? (y1 - y0) / length : 0;
  // The tip's base is `tip_length` back from its point; the shaft ends there
  // (`reset_endpoints_based_on_tip`).
  const bx = x1 - tipLength * ux;
  const by = y1 - tipLength * uy;
  const shaft: Contour = [x0, y0];
  lineTo(shaft, bx, by);
  const hx = (-uy * tipLength) / 2;
  const hy = (ux * tipLength) / 2;
  const tip: Contour = [x1, y1];
  lineTo(tip, bx + hx, by + hy);
  lineTo(tip, bx - hx, by - hy);
  lineTo(tip, x1, y1);
  return { shaft, tip, strokeWidth, tipLength };
}
