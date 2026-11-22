/* The thumb of a scrollbar drawn by hand (`TimelineScrollbars.tsx`): where it is and how long,
 * for a view `client` long of a content `total` long scrolled by `scroll`, on a bar `bar` long.
 * Pure. */

/** The shortest a thumb is drawn, so that it can be grabbed. */
export const MIN_THUMB = 24;

export interface BarThumb {
  /** From the start of the bar. */
  offset: number;
  size: number;
  /** False when everything is in view: there is nothing to scroll, and no thumb is drawn. */
  movable: boolean;
}

export function barThumb(scroll: number, client: number, total: number, bar: number): BarThumb {
  const room = total - client;
  if (!(room > 0.5)) return { offset: 0, size: Math.max(0, bar), movable: false };
  // A bar that is not drawn yet has no length: there is something to scroll all the same, which
  // is what brings the bar up.
  if (!(bar > 0)) return { offset: 0, size: 0, movable: true };
  const size = Math.min(bar, Math.max(MIN_THUMB, (bar * client) / total));
  const offset = (bar - size) * Math.min(1, Math.max(0, scroll / room));
  return { offset, size, movable: true };
}

/** The scroll that puts the thumb `delta` px further along the bar than it was at `scroll`. */
export function scrollForThumbMove(
  scroll: number,
  delta: number,
  client: number,
  total: number,
  bar: number,
): number {
  const room = total - client;
  const thumb = barThumb(scroll, client, total, bar);
  const travel = bar - thumb.size;
  if (!thumb.movable || !(travel > 0)) return scroll;
  return Math.min(room, Math.max(0, scroll + (delta * room) / travel));
}
