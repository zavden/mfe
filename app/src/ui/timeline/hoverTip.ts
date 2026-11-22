/* Hover intent for the clip tooltip: it shows once the pointer has rested on a clip for
 * HOVER_TIP_DELAY_MS and hides as soon as the pointer moves again, leaves, presses a button or
 * scrolls; it comes back after the pointer rests again. Pure apart from the timer: the caller
 * renders what `onShow` / `onHide` say. */

export const HOVER_TIP_DELAY_MS = 600;

export interface HoverTip<T> {
  /** The pointer is at (x, y), over `target` (null: over nothing to describe). */
  move(target: T | null, x: number, y: number): void;
  /** The pointer left, a button went down, the content scrolled…: nothing to show. */
  cancel(): void;
}

export function createHoverTip<T>(options: {
  onShow(target: T, x: number, y: number): void;
  onHide(): void;
  delayMs?: number;
}): HoverTip<T> {
  const delay = options.delayMs ?? HOVER_TIP_DELAY_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let shown = false;
  const stop = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };
  const hide = () => {
    if (!shown) return;
    shown = false;
    options.onHide();
  };
  return {
    move(target, x, y) {
      stop();
      hide();
      if (target === null) return;
      timer = setTimeout(() => {
        timer = null;
        shown = true;
        options.onShow(target, x, y);
      }, delay);
    },
    cancel() {
      stop();
      hide();
    },
  };
}
