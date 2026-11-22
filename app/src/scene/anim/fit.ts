/* The shape of a clip whose tweens carry it to other glyphs (`TweenFit`, D123), at an instant.
 *
 * Such a clip draws more than one shape over its life: its object's own until the first of those
 * tweens starts, then, after each, the shape fitted to that tween's target. While one runs, Manim
 * plays `Transform(shape, new_shape)`, and a Transform between two shapes of one kind is the
 * interpolation of their points, one by one (MANIM-QUIRKS, "5 bis": both libraries build them
 * with the same number of points, so nothing is aligned). The shape then goes from where it is —
 * its points as the clip's state before the tween places them, turned and scaled as earlier
 * tweens left it — to the new shape where the fit puts it, unturned.
 *
 * `shapeAt` gives the contours of every drawable glyph of the clip at an instant: in the object's
 * frame between those tweens, for the clip's pose to place; in the scene's frame already while one
 * runs (`placed`). Pure. */
import {
  boxCenter,
  contoursBox,
  shapeContours,
  transformContour,
  translate,
  unionBox,
  type Box,
  type Contour,
} from '../../geom';
import {
  diagonalOf,
  TIME_EPSILON,
  type Easing,
  type GlyphStyle,
  type ShapeFormula,
  type Target,
} from '../../model';
import type { RateFunction } from '../easing';
import { placementMatrix } from '../placement';
import type { FitSize } from '../state';
import type { TweenEvent } from '../types';

/** A drawable glyph of the clip as its render has it: the canonical glyph, which for a shape is
 * the place of its contour among the shape's (`engine/producers.ts`), its contours and their box. */
export interface OwnGlyph {
  glyph: number;
  local: readonly Contour[];
  box: Box;
}

/** The glyphs of the clip as they are shaped at an instant, in the order of the clip's own. */
export interface ShapedGlyphs {
  locals: readonly (readonly Contour[])[];
  boxes: readonly Box[];
  /** The contours are in the scene's frame already (a fit is running): no pose applies to them. */
  placed: boolean;
  /** Identifies the shapes for caches of what is drawn from them; '' while a fit runs. */
  key: string;
  /** The style of each glyph where it is not its render's (a line a tween has carried,
   * `anim/ends.ts`: an arrow's stroke is capped by its length, a tween sets a stroke width). */
  styles?: readonly GlyphStyle[];
}

export interface FitTrack {
  /** The clip's glyphs at `time`; null while they are the render's own (before the first fit, or
   * after one that came back to it). */
  shapeAt(time: number): ShapedGlyphs | null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Point by point from `a` to `b`; null when the two are not built alike (a rounded box whose
 * corners meet at one of the two sizes has fewer runs). */
function blend(a: readonly Contour[], b: readonly Contour[], t: number): Contour[] | null {
  if (a.length !== b.length) return null;
  const out: Contour[] = [];
  for (let i = 0; i < a.length; i++) {
    const from = a[i]!;
    const to = b[i]!;
    if (from.length !== to.length) return null;
    out.push(from.map((value, j) => lerp(value, to[j]!, t)));
  }
  return out;
}

/** The track of a clip of `formula` with the tween events `tweens` (in start order), or null when
 * none of them carries a fit: the clip is drawn from its render alone. */
export function buildFitTrack(input: {
  formula: ShapeFormula;
  target: Target;
  tweens: readonly TweenEvent[];
  own: readonly OwnGlyph[];
  rateOf(easing: Easing): RateFunction;
}): FitTrack | null {
  const { formula, target, own, rateOf } = input;
  const fits = input.tweens.filter((tween) => tween.fit !== undefined);
  if (fits.length === 0) return null;

  const sizes = new Map<string, ShapedGlyphs>();
  /** The shape at a size, centred as a render is; the render's own for none. */
  const sized = (size: FitSize): ShapedGlyphs => {
    const key = size ? `${size.width}x${size.height}` : 'own';
    let shaped = sizes.get(key);
    if (!shaped) {
      if (size) {
        const contours = shapeContours(
          target,
          formula.shape,
          size.width,
          size.height,
          formula.cornerRadius,
          diagonalOf(formula),
        );
        const [cx, cy] = boxCenter(contoursBox(contours));
        const centred = contours.map((c) => transformContour(translate(-cx, -cy), c));
        const locals = own.map(({ glyph }) => (centred[glyph] ? [centred[glyph]] : []));
        shaped = { locals, boxes: locals.map((l) => contoursBox(l)), placed: false, key };
      } else {
        shaped = {
          locals: own.map((g) => g.local),
          boxes: own.map((g) => g.box),
          placed: false,
          key,
        };
      }
      sizes.set(key, shaped);
    }
    return shaped;
  };

  /** The shape while `tween` runs, `alpha` of the way: every point between where it was and where
   * the fit puts it. Two shapes not built alike are replaced by the shape of the box in between. */
  const running = (tween: TweenEvent, alpha: number): ShapedGlyphs => {
    const fit = tween.fit!;
    const a = sized(fit.from);
    const b = sized(fit.to);
    const ma = placementMatrix(tween.from);
    const mb = placementMatrix(tween.to);
    const from = a.locals.map((l) => l.map((c) => transformContour(ma, c)));
    const to = b.locals.map((l) => l.map((c) => transformContour(mb, c)));
    let locals: (readonly Contour[])[] = [];
    for (let k = 0; k < own.length; k++) {
      const mixed = blend(from[k]!, to[k]!, alpha);
      if (!mixed) {
        locals = [];
        break;
      }
      locals.push(mixed);
    }
    if (locals.length !== own.length) {
      const boxA = unionBox(from.map((l) => contoursBox(l)));
      const boxB = unionBox(to.map((l) => contoursBox(l)));
      const between = sized({
        width: lerp(boxA.maxX - boxA.minX, boxB.maxX - boxB.minX, alpha),
        height: lerp(boxA.maxY - boxA.minY, boxB.maxY - boxB.minY, alpha),
      });
      const [ax, ay] = boxCenter(boxA);
      const [bx, by] = boxCenter(boxB);
      const move = translate(lerp(ax, bx, alpha), lerp(ay, by, alpha));
      locals = between.locals.map((l) => l.map((c) => transformContour(move, c)));
    }
    return { locals, boxes: locals.map((l) => contoursBox(l)), placed: true, key: '' };
  };

  return {
    shapeAt(time) {
      let size: FitSize = null;
      for (const tween of fits) {
        if (time < tween.start - TIME_EPSILON) break;
        if (time < tween.end - TIME_EPSILON && tween.end > tween.start) {
          const frac = (time - tween.start) / (tween.end - tween.start);
          return running(tween, rateOf(tween.easing)(frac));
        }
        size = tween.fit!.after;
      }
      return size ? sized(size) : null;
    },
  };
}
