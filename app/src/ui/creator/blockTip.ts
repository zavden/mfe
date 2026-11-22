/* The tooltip of a block in the block view of the formula list (FormulaTooltip): which block it
 * is for, and where it goes.
 *
 * It is there as soon as the pointer is on a block, and it hangs beside the block, not at the
 * pointer: moving on a block changes nothing, so nothing is drawn again; on another block it is
 * that block's. It goes when the pointer leaves the blocks, when a button goes down (a drag, a
 * menu or a double-click follows) and when the list scrolls. After a press it stays away until
 * the pointer has moved off the spot (PRESS_SLOP) or onto another block, so that the two clicks
 * of a double-click do not flash it. Its size follows the size of the previews of the block view
 * (`tipSize`, D173). Pure: the caller renders what `onShow` / `onHide` say. */

/** How far the pointer moves from where a button went down before the tooltip is back, px. */
export const PRESS_SLOP = 4;

export interface BlockTip<T> {
  /** The pointer moved to (x, y) with no button down, over `target` (null: over no block). */
  move(target: T | null, x: number, y: number): void;
  /** A button went down at (x, y), over `target`. */
  press(target: T | null, x: number, y: number): void;
  /** The pointer left, the list scrolled, a drag is on: nothing to show until it moves again. */
  cancel(): void;
}

export function createBlockTip<T>(options: {
  onShow(target: T): void;
  onHide(): void;
}): BlockTip<T> {
  let shown: T | null = null;
  let pressed: { target: T | null; x: number; y: number } | null = null;
  const hide = () => {
    if (shown === null) return;
    shown = null;
    options.onHide();
  };
  return {
    move(target, x, y) {
      if (pressed) {
        const near = Math.hypot(x - pressed.x, y - pressed.y) < PRESS_SLOP;
        if (near && pressed.target === target) return;
        pressed = null;
      }
      if (target === shown) return;
      if (target === null) {
        hide();
        return;
      }
      shown = target;
      options.onShow(target);
    },
    press(target, x, y) {
      pressed = { target, x, y };
      hide();
    },
    cancel: hide,
  };
}

/** The edges of a block in the window. */
export interface TipAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The tooltip's rendering at the standard size of the previews (1×): as wide as the tooltip inside
 * its padding and its border, a fifth taller than a row's (creator.css); what the tooltip has
 * around it — that padding and border, and under the rendering its caption and its line of keys,
 * about —; and so the tooltip's width — a fifth more than the 240 px it began with — and about how
 * tall it is. CSS px. */
export const TIP_PREVIEW = { width: 274, height: 62 } as const;
const TIP_FRAME = { width: 14, height: 60 } as const;
export const TIP_WIDTH = TIP_PREVIEW.width + TIP_FRAME.width;
export const TIP_HEIGHT = TIP_PREVIEW.height + TIP_FRAME.height;
/** Between the block and its tooltip, and between the tooltip and the window's edge. */
const GAP = 8;
const MARGIN = 6;

export interface TipSize {
  /** The whole tooltip: its width, and about its height. */
  width: number;
  height: number;
  /** The box of its rendering. */
  preview: { width: number; height: number };
}

/** The tooltip at the size of the previews of the block view (`scale`, previewSize.ts, D173): its
 * rendering `scale` times as wide and as tall as at 1×, its caption and keys as they are. In a
 * window too small for it, the rendering is as large as fits there, in the same proportion — never
 * under 1×. */
export function tipSize(scale: number, viewport: { width: number; height: number }): TipSize {
  const fits = Math.min(
    (viewport.width - 2 * MARGIN - TIP_FRAME.width) / TIP_PREVIEW.width,
    (viewport.height - 2 * MARGIN - TIP_FRAME.height) / TIP_PREVIEW.height,
  );
  const k = Math.max(1, Math.min(scale, fits));
  // Whole pixels (the steps make whole pixels; a size that fits a window, its whole part).
  const px = (length: number) => Math.floor(length + 1e-6);
  const preview = { width: px(TIP_PREVIEW.width * k), height: px(TIP_PREVIEW.height * k) };
  return {
    width: preview.width + TIP_FRAME.width,
    height: preview.height + TIP_FRAME.height,
    preview,
  };
}

/** Where the tooltip of the block at `anchor`, `size` large, goes in a window of `width` ×
 * `height`, as the `left` and the `top` or `bottom` of something fixed: to the right of the block
 * with its top level with the block's; to its left when the right has no room for it; and with its
 * bottom level with the block's when it would run past the foot of the window — but never past its
 * top, where a tall tooltip of a block high in a short window would go. */
export function placeTip(
  anchor: TipAnchor,
  viewport: { width: number; height: number },
  size: { width: number; height: number } = { width: TIP_WIDTH, height: TIP_HEIGHT },
): { left: number; top: number } | { left: number; bottom: number } {
  const most = viewport.width - size.width - MARGIN;
  const right = anchor.right + GAP;
  const before = anchor.left - GAP - size.width;
  const left = right <= most ? right : before >= MARGIN ? before : Math.max(MARGIN, most);
  if (anchor.top + size.height + MARGIN <= viewport.height) {
    return { left, top: Math.max(MARGIN, anchor.top) };
  }
  /** The `bottom` that puts the tooltip's top at the margin of the window. */
  const atTop = viewport.height - size.height - MARGIN;
  return { left, bottom: Math.max(MARGIN, Math.min(viewport.height - anchor.bottom, atTop)) };
}
