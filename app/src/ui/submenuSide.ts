/* Which side of its entry a submenu opens on, and where a context menu's submenu panel goes.
 * Pure, so it is tested without a layout. */

/** Free space kept between a menu and the window's edge. */
export const MENU_MARGIN = 8;

/** The frame of a context menu's panel around its items: its padding plus its border, in px
 * (`.ctx-menu` in styles.css). */
const PANEL_FRAME = 5;

/** A submenu's panel starts this far past its entry's edge, over its menu's frame: no gap that
 * the pointer could hover (which would close it) on its way from the entry to the panel. */
const PAST_ENTRY = 1;

/** `right` (the usual side) unless the submenu, `width` wide, leaves the window there and
 * overflows less on the left of its entry, which spans `entryLeft`…`entryRight`. */
export function submenuSide(
  entryLeft: number,
  entryRight: number,
  width: number,
  windowWidth: number,
): 'right' | 'left' {
  const overflowRight = entryRight + width - (windowWidth - MENU_MARGIN);
  if (overflowRight <= 0) return 'right';
  const overflowLeft = MENU_MARGIN - (entryLeft - width);
  return overflowLeft < overflowRight ? 'left' : 'right';
}

export interface SubmenuPlace {
  left: number;
  top: number;
  /** Open to the left of its entry. */
  flipped: boolean;
}

/** Where a context menu's submenu panel, `size` big, goes beside its entry (the entry's box in
 * window coordinates): level with it — the panel's first item lines up with the entry — to the
 * right, or to the left when the window has no room there (`submenuSide`), and moved up as far
 * as it needs to stay inside the window. */
export function placeSubmenu(
  entry: { left: number; right: number; top: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): SubmenuPlace {
  const flipped = submenuSide(entry.left, entry.right, size.width, viewport.width) === 'left';
  return {
    left: flipped ? entry.left - PAST_ENTRY - size.width : entry.right + PAST_ENTRY,
    top: Math.max(
      MENU_MARGIN,
      Math.min(entry.top - PANEL_FRAME, viewport.height - size.height - MENU_MARGIN),
    ),
    flipped,
  };
}
