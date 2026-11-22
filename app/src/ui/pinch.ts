/* The gestures of a trackpad on the views that zoom and pan: its pinch and its scroll.
 *
 * A pinch. Chrome sends it to the page as a wheel event with Ctrl held, though no
 * key is: its `deltaY` is −100 × ln(scale) of the gesture, in small steps, so that a page which
 * zooms by exp(−deltaY / 100) follows the fingers — twice as far apart, twice as large. A wheel
 * turned with the command key held zooms by a rate of the app's own, a notch at a time, at which a
 * pinch is five times too slow. The two are told apart by the Control key itself: a wheel with
 * Ctrl and no Control key down is a pinch.
 *
 * A scroll — two fingers on the trackpad, the wheel or the back of a mouse — moves a view on a
 * Mac, the content following the fingers; a view that has nothing of its own to scroll, as the
 * Preview, moves what it shows (`scrollPans`).
 *
 * Asked on a Mac alone, where the trackpad is how the views are zoomed and moved: elsewhere a
 * wheel with Ctrl zooms as it always did, and a wheel alone is left to the browser. */
import { isMac } from './platform';

/** The rate of a pinch: the gesture's scale is exp(−deltaY × PINCH_RATE). */
export const PINCH_RATE = 1 / 100;

/** Whether the Control key is down, as the keys the window has seen say (`startControlKey`). */
let controlDown = false;

/** Start following the Control key: every key that goes down or up says whether it is held, and a
 * window that loses the focus hears no key let go. The result stops it. */
export function startControlKey(): () => void {
  const onKey = (event: KeyboardEvent) => {
    controlDown = event.ctrlKey;
  };
  const onBlur = () => {
    controlDown = false;
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    window.removeEventListener('blur', onBlur);
    controlDown = false;
  };
}

/** Whether a wheel event is a pinch of the trackpad (`mac`: the system; `control`: whether the
 * Control key is down). With ⌘ held too it is the wheel's. */
export function isPinch(
  event: Pick<WheelEvent, 'ctrlKey' | 'metaKey'>,
  mac: boolean = isMac(),
  control: boolean = controlDown,
): boolean {
  return mac && event.ctrlKey && !event.metaKey && !control;
}

/** The factor a wheel event zooms a view by: the scale of the gesture for a pinch, and for a
 * wheel exp(−deltaY × `wheelRate`), the view's own rate. */
export function zoomFactor(
  event: Pick<WheelEvent, 'deltaY' | 'ctrlKey' | 'metaKey'>,
  wheelRate: number,
  mac: boolean = isMac(),
  control: boolean = controlDown,
): number {
  return Math.exp(-event.deltaY * (isPinch(event, mac, control) ? PINCH_RATE : wheelRate));
}

/** Whether a wheel event moves the view under it (`mac`: the system): on a Mac, a wheel with
 * neither Ctrl nor ⌘ — those zoom — that is not over something with a scroll or a wheel of its
 * own (`own`: a menu, a field). Never elsewhere. */
export function scrollPans(
  event: Pick<WheelEvent, 'ctrlKey' | 'metaKey'>,
  own: boolean,
  mac: boolean = isMac(),
): boolean {
  return mac && !event.ctrlKey && !event.metaKey && !own;
}

/** What has a scroll or a wheel of its own inside a view that pans: a wheel over it is its. */
export const OWN_WHEEL =
  '[role="menu"], [role="listbox"], [role="dialog"], input, textarea, select';
