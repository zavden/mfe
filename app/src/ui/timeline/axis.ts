/* The timeline's own space (D182). The timeline is laid out with time along x and the tracks down
 * y, and its gestures think in that space. Drawn vertical — time down the screen, the tracks side
 * by side — it is the same layout, turned a quarter clockwise on the screen by one CSS transform
 * (`.tl-well` in timeline.css; D193): what is at the top when it lies — the ruler, then the first
 * track — is on the right when it stands, and what is on the left, the start of the time, is at
 * the top. The functions here read a point or a box of the screen in the timeline's space,
 * whichever way it is drawn, so that a gesture never asks. What goes back to the screen — the
 * corner of a menu, a tooltip, `elementFromPoint` — keeps the event's own coordinates.
 *
 * Across the tracks the space grows away from the ruler: to the left of the screen when the
 * timeline stands. A place across is therefore the screen's x with its sign changed — it is only
 * ever compared with another place, or with a box's `top`, read the same way. */

import type { ScreenPoint } from '../pointer';

let vertical = false;

/** The timeline is drawn vertical (true) or horizontal: `setVertical` of the timeline's store
 * says so. */
export function setTimelineVertical(next: boolean): void {
  vertical = next;
}

export function timelineVertical(): boolean {
  return vertical;
}

/** Where a point of the screen is along time (CSS px, from the window's edge the time starts
 * at). */
export const along = (point: ScreenPoint): number => (vertical ? point.clientY : point.clientX);

/** Where a point of the screen is across the tracks: it grows away from the ruler. */
export const across = (point: ScreenPoint): number => (vertical ? -point.clientX : point.clientY);

/** A box in the timeline's space: `left` and `width` along time, `top` and `height` across the
 * tracks. */
export interface TimelineBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** The box of an element on the screen, in the timeline's space. */
export function boxOf(element: Element): TimelineBox {
  const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
  return vertical
    ? { left: top, top: -right, right: bottom, bottom: -left, width: height, height: width }
    : { left, top, right, bottom, width, height };
}

/** A wheel's turn in the timeline's space: `x` along time, `y` across the tracks. A wheel that
 * turns down the screen goes along time when the timeline is vertical, and one that turns to the
 * right goes towards the ruler. */
export function wheelOf(event: { deltaX: number; deltaY: number }): { x: number; y: number } {
  // `0 - x` and not `-x`: a wheel that does not turn sideways gives 0, never -0.
  return vertical ? { x: event.deltaY, y: 0 - event.deltaX } : { x: event.deltaX, y: event.deltaY };
}

/** An arrow key in the timeline's space. Drawn vertical, the arrows follow the screen: up and
 * down go along time, left and right across the tracks — to the right is towards the ruler, where
 * the first track is —, so the key the timeline is asked about is the one that goes that way in
 * its own space. Any other key is itself. */
export function arrowOf(key: string): string {
  if (!vertical) return key;
  switch (key) {
    case 'ArrowUp':
      return 'ArrowLeft';
    case 'ArrowDown':
      return 'ArrowRight';
    case 'ArrowLeft':
      return 'ArrowDown';
    case 'ArrowRight':
      return 'ArrowUp';
    default:
      return key;
  }
}
