/* Alt held while the selection is dragged in the preview holds the drag to one axis: what is
 * dragged moves only horizontally or only vertically, along the axis the pointer has gone further
 * along since the drag began — measured from where the drag began, chosen again as the pointer
 * moves, and given up when Alt is let go. Alt held already at the press is something else (a
 * glyph pick, a pan: `usePreviewGestures.ts`). Pure: travels in scene units. */
import type { Vec2 } from '../../geom';

export type DragAxis = 'x' | 'y';

/** The axis a drag held with Alt moves along after the pointer's `travel` (from where the drag
 * began): the one it has gone further along; the horizontal one on a tie. */
export function heldAxis(travel: Vec2): DragAxis {
  return Math.abs(travel[1]) > Math.abs(travel[0]) ? 'y' : 'x';
}

/** `travel` along `axis` alone: the other component is 0. */
export function alongAxis(travel: Vec2, axis: DragAxis): [number, number] {
  return axis === 'x' ? [travel[0], 0] : [0, travel[1]];
}
