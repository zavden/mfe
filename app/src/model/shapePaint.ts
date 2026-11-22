/* A shape's paint (D123): what a shape object draws with, and what a Transform of its clip can
 * change of it. The object holds its own (`ShapeFormula.style`, `fillColor`); a clip state can
 * carry another value of each field (`Appearance`), which a Transform sets and the Transforms
 * after it keep. Pure. */
import type { Appearance, Formula, ShapeFormula, ShapeKind } from './types';

/** Whether a shape has an inside to fill: a box and a circle do; a line and the two lines of a
 * cross have none, so their fill's opacity and colour paint nothing (Manim's `Cross` ignores
 * them). */
export function hasInside(shape: ShapeKind): boolean {
  return shape === 'box' || shape === 'circle';
}

/** The fields of a clip state that paint a shape, in the order the editors list them. */
export const PAINT_FIELDS = ['strokeWidth', 'strokeOpacity', 'fillOpacity', 'fillColor'] as const;
export type PaintField = (typeof PAINT_FIELDS)[number];

/** What a clip state says of a shape's paint: only the fields a Transform has set. */
export type PaintState = Pick<Appearance, PaintField>;

/** A shape's paint with nothing left to look up: the width of its stroke (Manim's units), the
 * opacities of its stroke and of its fill (before the clip's opacity), and the colour of its
 * fill — null while it is the stroke's, as it is for a shape without a fill colour of its own. */
export interface ShapePaint {
  strokeWidth: number;
  strokeOpacity: number;
  fillOpacity: number;
  fillColor: string | null;
}

/** Whether `state` sets any of a shape's paint. */
export function hasPaint(state: PaintState): boolean {
  return PAINT_FIELDS.some((field) => state[field] !== undefined);
}

/** The paint of `formula` in a clip `state`: what the state sets, the object's own otherwise. */
export function shapePaint(formula: ShapeFormula, state: PaintState = {}): ShapePaint {
  return {
    strokeWidth: state.strokeWidth ?? formula.style.strokeWidth,
    strokeOpacity: state.strokeOpacity ?? formula.style.strokeOpacity,
    fillOpacity: state.fillOpacity ?? formula.style.fillOpacity,
    fillColor: state.fillColor ?? formula.fillColor ?? null,
  };
}

/** Whether the paint of `formula`'s clips can differ from what its render carries (its `style`,
 * one colour): it is a shape, and it has a fill colour of its own or `states` set some paint. */
export function paintsApart(
  formula: Formula,
  states: readonly PaintState[],
): formula is ShapeFormula {
  return formula.kind === 'shape' && (formula.fillColor !== undefined || states.some(hasPaint));
}
