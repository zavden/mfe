/* Clip/part opacity is a multiplier of each glyph's base paint, never a replacement for a
 * shape's fill/stroke mask. The same operation serves animation, override reset and jumps.
 *
 * A shape whose clip repaints it (D123: a fill colour of its own, or a Transform that sets its
 * stroke's width, an opacity or its fill's colour) is written from the paint of its states
 * instead: what it is built with, and what each Transform changes of it — Manim's `set_stroke`
 * and `set_fill` leave alone what they do not name, and interpolate the rest linearly, which is
 * what the editor draws (MANIM-QUIRKS, "5 bis"). */
import { sameColor } from '../../geom';
import {
  hasInside,
  hasTips,
  paintsApart,
  shapePaint,
  type Clip,
  type ClipState,
  type Formula,
  type ShapeFormula,
  type Target,
} from '../../model';
import { glyphColor } from '../../scene';
import { num, quoted } from './python';

/** Whether the shape of `clip` is painted from its states (`paintsApart`): its object has a fill
 * colour of its own, or a state of the clip — its initial one, or the target of a Transform —
 * sets some paint. Any other clip is written as it always was. */
export function repainted(clip: Clip, formula: Formula): formula is ShapeFormula {
  return paintsApart(formula, [
    clip.initial,
    ...clip.actions.flatMap((action) => (action.kind === 'tween' ? [action.to] : [])),
  ]);
}

/** A shape's paint in a state of its clip, as Manim holds it: the stroke's colour and width, the
 * fill's colour (its own, else the stroke's), and the two opacities with the clip's in them. */
export function statePaint(formula: ShapeFormula, state: ClipState) {
  const paint = shapePaint(formula, state);
  const stroke = glyphColor(0, state, formula);
  return {
    stroke,
    fill: paint.fillColor ?? stroke,
    /** The fill has a colour of its own, which the stroke's does not carry along. */
    ownFill: paint.fillColor !== null,
    width: paint.strokeWidth,
    strokeOpacity: paint.strokeOpacity * state.opacity,
    fillOpacity: paint.fillOpacity * state.opacity,
  };
}

/** The same shape with the style a state of its clip gives it, for the emitters that read
 * `formula.style` (the clip's opacity is theirs to fold in). */
export function paintedShape(formula: ShapeFormula, state: ClipState): ShapeFormula {
  const { strokeWidth, strokeOpacity, fillOpacity } = shapePaint(formula, state);
  return { ...formula, style: { strokeWidth, strokeOpacity, fillOpacity } };
}

/** `.set_fill("#…")` after the constructor of a repainted box or circle: the colour of its fill
 * when its clip starts, always written — a constructor gives the fill the stroke's colour, or a
 * default of its library's (a `Circle` built without `fill_color`), and a fill that is invisible
 * now keeps the colour a later Transform fades in or starts from. `set_fill` with a colour alone
 * leaves the opacity as built. */
export function fillColourCall(formula: ShapeFormula, state: ClipState): string {
  return hasInside(formula.shape) ? `.set_fill(${quoted(statePaint(formula, state).fill)})` : '';
}

/** What a Transform changes of a repainted shape between two states, for the `.animate` chain:
 * `.set_color` when stroke and fill go to one colour together, as before; else the stroke's
 * colour, width and opacity in `.set_stroke` and the fill's colour and opacity in `.set_fill`,
 * each naming only what changes. */
export function paintChain(formula: ShapeFormula, from: ClipState, to: ClipState): string[] {
  const a = statePaint(formula, from);
  const b = statePaint(formula, to);
  const inside = hasInside(formula.shape);
  const strokeMoves = !sameColor(a.stroke, b.stroke);
  const fillMoves = inside && !sameColor(a.fill, b.fill);
  const chain: string[] = [];
  // One colour for both, at both ends: Manim's `set_color`.
  const together = !a.ownFill && !b.ownFill;
  if (together && strokeMoves) chain.push(`.set_color(${quoted(b.stroke)})`);
  const fill: string[] = [];
  if (!together && fillMoves) fill.push(`color=${quoted(b.fill)}`);
  if (inside && a.fillOpacity !== b.fillOpacity) fill.push(`opacity=${num(b.fillOpacity)}`);
  if (fill.length > 0) chain.push(`.set_fill(${fill.join(', ')})`);
  const stroke: string[] = [];
  if (!together && strokeMoves) stroke.push(`color=${quoted(b.stroke)}`);
  if (a.width !== b.width) stroke.push(`width=${num(b.width)}`);
  if (a.strokeOpacity !== b.strokeOpacity) stroke.push(`opacity=${num(b.strokeOpacity)}`);
  if (stroke.length > 0) chain.push(`.set_stroke(${stroke.join(', ')})`);
  return chain;
}

/** The same change for `_Tween` (a Transform that turns or flips the shape): the pairs of its
 * `opacity`, `stroke`, `width` and `fills` arguments that change — the stroke's colours go in
 * `colors`, glyph by glyph, as for any object. `fills` is given whenever the fill has a colour of
 * its own at either end: without it the helper paints the fill in the stroke's. */
export function tweenPaintKw(formula: ShapeFormula, from: ClipState, to: ClipState): string[] {
  const a = statePaint(formula, from);
  const b = statePaint(formula, to);
  const inside = hasInside(formula.shape);
  const pair = (x: number, y: number) => `(${num(x)}, ${num(y)})`;
  const kw: string[] = [];
  if (inside && a.fillOpacity !== b.fillOpacity) {
    kw.push(`opacity=${pair(a.fillOpacity, b.fillOpacity)}`);
  }
  if (a.strokeOpacity !== b.strokeOpacity) {
    kw.push(`stroke=${pair(a.strokeOpacity, b.strokeOpacity)}`);
  }
  if (a.width !== b.width) kw.push(`width=${pair(a.width, b.width)}`);
  if (
    inside &&
    (a.ownFill || b.ownFill) &&
    !(sameColor(a.fill, b.fill) && sameColor(a.stroke, b.stroke))
  ) {
    kw.push(`fills=(${quoted(a.fill)}, ${quoted(b.fill)})`);
  }
  return kw;
}

/** The chain for an opacity multiplier; zero base channels stay absent. A bent line (D145) takes
 * it on its stroke alone: `set_opacity` would fill what the curve encloses with the line between
 * its two ends. An arrow's tips are filled, and are the members after its shaft: the whole takes
 * the opacity, and the shaft alone — the mobject itself, without its family — no fill. */
export function opacityChain(formula: Formula, opacity: number, target: Target): string {
  if (formula.kind === 'line' && formula.curve) {
    if (!hasTips(formula.line)) return `.set_stroke(opacity=${num(opacity)})`;
    const alone = target === 'ce' ? 'family=False' : 'recurse=False';
    return `.set_opacity(${num(opacity)}).set_fill(opacity=0, ${alone})`;
  }
  if (formula.kind !== 'shape') return `.set_opacity(${num(opacity)})`;
  const { fillOpacity, strokeOpacity } = formula.style;
  return [
    fillOpacity > 0 ? `.set_fill(opacity=${num(opacity * fillOpacity)})` : '',
    strokeOpacity > 0 ? `.set_stroke(opacity=${num(opacity * strokeOpacity)})` : '',
  ].join('');
}

/** `_Tween` fill/stroke pairs in canonical glyph order. A compact pair is valid only when
 * every starting multiplier is equal; Cross lines can carry distinct prior part overrides. What
 * is not a shape takes the opacity on its stroke too, as `set_opacity` gives it in a plain
 * `.animate` (`opacityChain`): the stroke is what an animation that traces the outline later
 * draws (an Unwrite, a Write that brings glyphs back), at the opacity the editor draws it. */
export function tweenOpacityKw(
  formula: Formula,
  starts: number | readonly number[],
  end: number,
): string[] {
  const values = typeof starts === 'number' ? [starts] : starts;
  const uniform = values.every((value) => value === values[0]);
  const pairs = (base: number) => {
    const pair = (start: number) => `(${num(start * base)}, ${num(end * base)})`;
    return uniform ? pair(values[0]!) : `[${values.map(pair).join(', ')}]`;
  };
  if (formula.kind !== 'shape') return [`opacity=${pairs(1)}`, `stroke=${pairs(1)}`];
  const { fillOpacity, strokeOpacity } = formula.style;
  return [
    ...(fillOpacity > 0 ? [`opacity=${pairs(fillOpacity)}`] : []),
    ...(strokeOpacity > 0 ? [`stroke=${pairs(strokeOpacity)}`] : []),
  ];
}
