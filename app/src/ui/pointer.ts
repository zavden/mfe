/* Pointer conventions shared by the gestures of every panel. */
import { isMac } from './platform';

/** Pointer travel (CSS px) that turns a press into a drag: moving or resizing a clip or a block,
 * dragging a link port or a preview handle, drawing a selection rectangle. */
export const DRAG_THRESHOLD = 3;

/** A point of the screen (client px): a pointer event, a drag event. */
export interface ScreenPoint {
  clientX: number;
  clientY: number;
}

/** Where an event is on the screen, kept apart from the event: what a gesture keeps of its
 * press. */
export const screenPoint = ({ clientX, clientY }: ScreenPoint): ScreenPoint => ({
  clientX,
  clientY,
});

/** Whether a pointer pressed at `start` has travelled far enough to be a drag. The two are points
 * of the screen, whichever way a panel is drawn: a gesture that works in a space of its own (the
 * timeline's, `timeline/axis.ts`) keeps the press as the screen gave it for this question. */
export function isDrag(e: ScreenPoint, start: ScreenPoint): boolean {
  return Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) >= DRAG_THRESHOLD;
}

/** Whether a press is of the main button and not the secondary click: on a Mac a Ctrl+click is
 * one — the browser sends the menu's event after it (`contextmenu`) —, so it takes, drags and puts
 * nothing. Asked at the press. */
export function isMainClick(event: { button: number; ctrlKey: boolean }): boolean {
  return event.button === 0 && !(event.ctrlKey && isMac());
}

/** Follows one pointer on `window` until the drag ends; Escape cancels it unless `escape` is
 * false (then the key is left to whoever else listens, a dialog for instance). */
export function trackPointer(
  pointerId: number,
  handlers: {
    move(e: PointerEvent): void;
    end(e: PointerEvent | null, cancelled: boolean): void;
  },
  { escape = true, target }: { escape?: boolean; target?: Element } = {},
): () => void {
  let finished = false;
  const onMove = (e: PointerEvent) => {
    if (target && !target.isConnected) {
      finish(null, true);
      return;
    }
    if (e.pointerId === pointerId) handlers.move(e);
  };
  const finish = (e: PointerEvent | null, cancelled: boolean) => {
    if (finished) return;
    finished = true;
    cleanup();
    handlers.end(e, cancelled);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId === pointerId) finish(e, false);
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) finish(e, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(null, true);
    }
  };
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey, true);
    target?.removeEventListener('lostpointercapture', onLost);
    observer?.disconnect();
  };
  const onLost = (e: Event) => {
    if (e.target === target && (e as PointerEvent).pointerId === pointerId) finish(null, true);
  };
  const observer = target
    ? new MutationObserver(() => {
        if (!target.isConnected) finish(null, true);
      })
    : null;
  observer?.observe(document, { childList: true, subtree: true });
  target?.addEventListener('lostpointercapture', onLost);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  if (escape) window.addEventListener('keydown', onKey, true);
  return () => finish(null, true);
}
