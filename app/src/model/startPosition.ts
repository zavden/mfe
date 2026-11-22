/* Where the new clips of a library object start (D124). An object can keep a position
 * (`FormulaBase.startPosition`): every clip made of it afterwards — dropped on a track or added
 * from a menu — starts there instead of at the centre of the frame. It is to the position what
 * `intro` is to the way in: read once, when a clip is made; the clips that exist keep their own.
 * Pure. */
import { defaultClipState } from './defaults';
import type { ClipState, FormulaBase, Vec2 } from './types';

type Placed = Pick<FormulaBase, 'startPosition'>;

/** Where a new clip of `formula` starts: the position the object keeps, else the centre of the
 * frame. A fresh array. */
export function startPositionOf(formula: Placed): Vec2 {
  const at = formula.startPosition;
  return at ? [at[0], at[1]] : [0, 0];
}

/** The state a new clip of `formula` starts in: Manim's (`defaultClipState`), at the object's
 * start position. */
export function newClipState(formula: Placed): ClipState {
  return { ...defaultClipState(), position: startPositionOf(formula) };
}

/** Make `position` the one the new clips of `formula` start at. The centre of the frame is the
 * absence of the field, so a file never says `[0, 0]`. Mutates `formula` (a store draft). */
export function setStartPosition(formula: Placed, position: Vec2): void {
  if (position[0] === 0 && position[1] === 0) delete formula.startPosition;
  else formula.startPosition = [position[0], position[1]];
}
