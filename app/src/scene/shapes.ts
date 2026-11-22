/* Where a shape object goes and how big it is (`clip.attach`, `rule: 'shape'`; ARCHITECTURE §5,
 * "Attached objects"): what each library reads from the target glyphs when it fits its own shape
 * to them, from the two boxes Manim keeps (`measure.ts`: `size`, every point, for `width` /
 * `height`; `critical`, the anchors in ManimCE and every point in ManimGL, for `get_center` /
 * `next_to`). Checked point for point against both libraries (`fixtures/manim/gen_decorations.py`,
 * `__tests__/decorations.test.ts`):
 *   - a box, `SurroundingRectangle(target, buff=…)`: the target's `width` and `height` plus the gap
 *     on every side, centred on the target — ManimCE wraps the target in a plain `Group`, whose
 *     centre is that of every point (not the anchors'); ManimGL's `surround` sets the shape and
 *     moves to the bounding box's centre;
 *   - a circle, the export's `_circle_around(target, buff)`: `Circle(radius=hypot(width, height) /
 *     2 + buff).move_to(target)`, through the corners of the box `buff` further out, centred where
 *     `get_center` reads (the anchors in ManimCE; each library's own `Circle.surround` means
 *     something else: a `buffer_factor` in ManimCE, a circle as wide as the target in ManimGL);
 *   - an underline, `Underline(target, buff=…)`: a line as wide as the target (`match_width`, every
 *     point), `next_to(target, DOWN, buff)`: its top at `buff` below the critical box's bottom,
 *     centred on it;
 *   - a cross, `Cross(target)`: its two lines stretched over the target's `width` and `height`
 *     (`replace(stretch=True)`) and moved to its centre, where `get_center` reads; a cross line is
 *     one such line, between two opposite corners of that box (the export's `_cross_line`).
 * The attach sync (`attach.ts`) fits the first attached clip of a shape object this way and places
 * the others with that size. */
import { boxCenter, type Vec2 } from '../geom';
import type { ShapeKind } from '../model';
import type { ManimBoxes } from './measure';

export interface ShapeFit {
  /** The shape's centre: the clip's position (the render centres the shape on its box). */
  center: Vec2;
  /** The fitted box, scene units: a circle's diameter is its width, an underline's height 0. */
  width: number;
  height: number;
}

/** The signed contour spans of a surrounding rectangle. Temporary Circumscribe paths use
 * these directly; persisted shape objects must use the checked `fitShape` result below. */
export function boxFitGeometry(target: ManimBoxes, buff: number): ShapeFit {
  const { size } = target;
  return {
    center: boxCenter(size),
    width: size.maxX - size.minX + 2 * buff,
    height: size.maxY - size.minY + 2 * buff,
  };
}

/** Whether a derived dimension can be stored in the project. Zero is supported, negatives and
 * nonfinite results are not; insets themselves may be negative. */
export function validFitDimension(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** Where `shape` goes around glyphs measured as `target`, `buff` away (nothing for a cross).
 * Null for an unsupported fit; callers retain the last valid geometry and report the problem.
 * A reused object keeps the first attached clip's size, even when another clip's gap would ask
 * for a different size. */
export function fitShape(
  shape: ShapeKind,
  target: ManimBoxes,
  buff: number,
  retainedSize?: Pick<ShapeFit, 'width' | 'height'>,
): ShapeFit | null {
  const { size, critical } = target;
  const width = size.maxX - size.minX;
  const height = size.maxY - size.minY;
  const centre = boxCenter(critical);
  let fit: ShapeFit;
  switch (shape) {
    case 'box':
      fit = boxFitGeometry(target, buff);
      break;
    case 'circle': {
      const diameter = Math.hypot(width, height) + 2 * buff;
      fit = { center: centre, width: diameter, height: diameter };
      break;
    }
    case 'underline':
      fit = { center: [centre[0], critical.minY - buff], width, height: 0 };
      break;
    case 'cross':
    case 'cross_line':
      fit = { center: centre, width, height };
      break;
  }
  if (retainedSize) fit = { ...fit, width: retainedSize.width, height: retainedSize.height };
  return validFitDimension(fit.width) &&
    validFitDimension(fit.height) &&
    fit.center.every(Number.isFinite)
    ? fit
    : null;
}
