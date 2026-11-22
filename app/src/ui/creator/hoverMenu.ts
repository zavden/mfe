/* When a menu that hangs from a key and opens on hover is open, and where it goes (D183: the
 * Creator's menu of the kinds, KindMenu.tsx).
 *
 * The pointer resting on the key opens the menu after `HOVER_OPEN_DELAY` (one that only crosses
 * the key on its way elsewhere does not); a press on the key — a click, a tap, Enter or Space —
 * opens it at once, and a second press closes a menu a press opened (one the pointer opened is
 * opened by the press again: the press is what the keyboard enters it by). The pointer gone from
 * both the key and the menu closes it after `HOVER_CLOSE_DELAY`, so that the way from one to the
 * other never closes it; back on either before then, it stays. Escape, a press elsewhere, Tab out
 * of it and the window changing size close it at once (`close`). Only a pointer that hovers — a
 * mouse — goes in and out: a touch opens the menu by its tap. Pure: the state and the timers; the
 * caller renders what `onChange` says, and places the menu with `placeHoverMenu`. */
import { MENU_MARGIN } from '../submenuSide';

/** How long the pointer rests on the key before the menu opens, ms. */
export const HOVER_OPEN_DELAY = 150;
/** How long the pointer may be off the key and the menu before the menu closes, ms. */
export const HOVER_CLOSE_DELAY = 300;

/** What opened the menu: the pointer resting on the key, or a press of the key. */
export type HoverMenuOpen = 'hover' | 'press';

/** The two places the pointer can be on: the key, or the menu under it. */
export type HoverPart = 'key' | 'menu';

export interface HoverMenu {
  /** Whether the menu is open now, and what opened it. */
  readonly open: HoverMenuOpen | null;
  /** The pointer (a mouse) came onto the key or the menu. */
  enter(part: HoverPart): void;
  /** It went off it. */
  leave(part: HoverPart): void;
  /** A click, a tap, Enter or Space on the key: the menu open at once (for the keyboard to go
   * into), or closed when a press had opened it. Says which. */
  press(): 'opened' | 'closed';
  /** ↓ or ↑ on the key: the menu open, as a press opens it, whatever opened it before. */
  show(): void;
  /** Closed at once: Escape, a press elsewhere, Tab out of it, the window resized. */
  close(): void;
  /** No timer left running (the key is gone); it may be used again. */
  stop(): void;
}

export function createHoverMenu(
  onChange: (open: HoverMenuOpen | null) => void,
  delays: { open: number; close: number } = { open: HOVER_OPEN_DELAY, close: HOVER_CLOSE_DELAY },
): HoverMenu {
  let open: HoverMenuOpen | null = null;
  const hovered = new Set<HoverPart>();
  let opening: ReturnType<typeof setTimeout> | null = null;
  let closing: ReturnType<typeof setTimeout> | null = null;

  const cancel = (timer: ReturnType<typeof setTimeout> | null) => {
    if (timer !== null) clearTimeout(timer);
    return null;
  };
  const set = (next: HoverMenuOpen | null) => {
    opening = cancel(opening);
    closing = cancel(closing);
    // The menu is gone: the pointer is on it no more (a menu taken away under it says nothing).
    if (next === null) hovered.delete('menu');
    if (next === open) return;
    open = next;
    onChange(next);
  };

  return {
    get open() {
      return open;
    },
    enter(part) {
      hovered.add(part);
      closing = cancel(closing);
      if (part === 'key' && open === null && opening === null) {
        opening = setTimeout(() => {
          opening = null;
          set('hover');
        }, delays.open);
      }
    },
    leave(part) {
      hovered.delete(part);
      if (part === 'key') opening = cancel(opening);
      if (open !== null && hovered.size === 0 && closing === null) {
        closing = setTimeout(() => {
          closing = null;
          set(null);
        }, delays.close);
      }
    },
    press() {
      if (open === 'press') {
        set(null);
        return 'closed';
      }
      set('press');
      return 'opened';
    },
    show() {
      set('press');
    },
    close() {
      set(null);
    },
    stop() {
      opening = cancel(opening);
      closing = cancel(closing);
    },
  };
}

/** Where a menu `size` big hangs under its key (the key's box in the window): its left edge under
 * the key's, moved left as far as it needs to stay in the window; its top at the foot of the key
 * — the menu's own frame starts with a strip of nothing above the panel, so that the pointer that
 * goes down from the key to the menu is never off both —, moved up only in a window too short for
 * it. As the `left` and `top` of something fixed. */
export function placeHoverMenu(
  key: { left: number; bottom: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  return {
    left: Math.max(MENU_MARGIN, Math.min(key.left, viewport.width - size.width - MENU_MARGIN)),
    top: Math.max(MENU_MARGIN, Math.min(key.bottom, viewport.height - size.height - MENU_MARGIN)),
  };
}
