/* Panning the timeline with the middle button (the wheel, pressed): the view follows the pointer
 * both ways at once, like a sheet under a hand, wherever in the timeline the press lands. Escape
 * puts the view back where the drag found it.
 *
 * The wheel itself, a trackpad and a touch mouse need nothing here: they scroll the same element,
 * on both axes at once, as the browser does it. */
import { trackPointer } from '../pointer';
import { across, along } from './axis';

/** Where a middle press is left alone: a text field has its own use for it (on Linux it pastes
 * the selection). */
const FIELDS = 'input, textarea, select, [contenteditable]';

/** Make `scroll`, the timeline's scrolling element, follow a drag of the middle button. While
 * one is under way the element carries `data-panning`. Returns the stop. */
export function startTimelinePan(scroll: HTMLElement): () => void {
  let stop: (() => void) | null = null;
  const onDown = (event: PointerEvent) => {
    if (event.button !== 1 || stop) return;
    if ((event.target as Element | null)?.closest?.(FIELDS)) return;
    // The press is the pan's: the browser starts no scrolling mode of its own with it.
    event.preventDefault();
    const from = {
      x: along(event),
      y: across(event),
      left: scroll.scrollLeft,
      top: scroll.scrollTop,
    };
    try {
      // The drag goes on over the other panels and outside the window, under one cursor.
      scroll.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that cannot be captured still drags the view while it is over the page.
    }
    scroll.dataset.panning = '';
    stop = trackPointer(event.pointerId, {
      // The browser keeps the view inside what there is to scroll.
      move: (e) => {
        scroll.scrollLeft = from.left - (along(e) - from.x);
        scroll.scrollTop = from.top - (across(e) - from.y);
      },
      end: (_e, cancelled) => {
        stop = null;
        delete scroll.dataset.panning;
        if (!cancelled) return;
        scroll.scrollLeft = from.left;
        scroll.scrollTop = from.top;
      },
    });
  };
  scroll.addEventListener('pointerdown', onDown);
  return () => {
    scroll.removeEventListener('pointerdown', onDown);
    stop?.();
  };
}
