/* The preview's selection rectangle (marquee): the rectangle a drag on the background spans, the
 * clips whose full formula boxes it touches, and the selection that results while it runs. Pure:
 * scene units (y up), no DOM, no stores. */
import type { Box, Vec2 } from '../../geom';
import type { ClipId } from '../../model';

/** The rectangle between the press point and the pointer (scene units), normalised so that
 * min ≤ max on both axes. */
export function marqueeRect(start: Vec2, now: Vec2): Box {
  return {
    minX: Math.min(start[0], now[0]),
    minY: Math.min(start[1], now[1]),
    maxX: Math.max(start[0], now[0]),
    maxY: Math.max(start[1], now[1]),
  };
}

/** Whether two boxes share at least one point (closed intervals: touching edges count). */
function touches(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** The clips whose full box touches `rect` (shares at least one point: edges and corners
 * count), in the map's order. A degenerate rectangle (zero width or height) still touches the
 * boxes it crosses. */
export function clipsTouching(boxes: ReadonlyMap<ClipId, Box>, rect: Box): ClipId[] {
  const touched: ClipId[] = [];
  for (const [id, box] of boxes) if (touches(box, rect)) touched.push(id);
  return touched;
}

/** The selection while a marquee runs: with `additive` (Ctrl/⌘ or Shift held at the press) the
 * clips selected before the drag plus the touched ones, in that order and without duplicates;
 * otherwise the touched ones alone. */
export function mergeMarquee(
  initial: readonly ClipId[],
  touched: readonly ClipId[],
  additive: boolean,
): ClipId[] {
  return [...new Set(additive ? [...initial, ...touched] : touched)];
}
