/* The size of the previews of the Creator's formula list (D173): the rendering in each row of the
 * list view, and — a block has none of its own — the rendering in the tooltip beside a block of
 * the block view (its size is `tipSize` of blockTip.ts). One key of the Creator's toolbar, «+/−»
 * (D183, where − and + were two), steps the size of the view that is shown through
 * `PREVIEW_SCALES`: a click one step larger, a right-click or a Shift+click one step smaller, and
 * with the focus on it ↑ and ↓; each view keeps its own size, an editor preference
 * (`creatorListPreview`, `creatorBlockPreview`: ui/preferences.ts). The formula is drawn as large
 * as its box allows, at any size. Pure: the steps, the heights of the list's renderings, which way
 * a press goes and the words of the key. */

/** The sizes, as multiples of the standard one. */
export const PREVIEW_SCALES = [1, 1.5, 2, 3] as const;

export type PreviewScale = (typeof PREVIEW_SCALES)[number];

/** The standard size, the one each view starts with. */
export const DEFAULT_PREVIEW_SCALE: PreviewScale = 1;

/** One of the two views of the list (`CreatorView`, ui/preferences.ts): rows, or blocks. */
type View = 'list' | 'grid';

export function isPreviewScale(value: unknown): value is PreviewScale {
  return PREVIEW_SCALES.some((scale) => scale === value);
}

/** The size one step up (`step` 1) or down (−1) from `scale`, or null past either end. */
export function steppedPreview(scale: PreviewScale, step: 1 | -1): PreviewScale | null {
  return PREVIEW_SCALES[PREVIEW_SCALES.indexOf(scale) + step] ?? null;
}

/** How tall, at 1×, the rendering of a row of the list view is, and the smaller renderings of the
 * first formulas of a closed group's row: the height of their boxes (`.formula-thumb`), CSS px. */
export const ROW_PREVIEW_HEIGHT = 52;
export const GROUP_PREVIEW_HEIGHT = 36;

/** The heights of the renderings of the list view at `scale`, CSS px. */
export function listPreviewHeights(scale: PreviewScale): { row: number; group: number } {
  return { row: ROW_PREVIEW_HEIGHT * scale, group: GROUP_PREVIEW_HEIGHT * scale };
}

/** A size as the key says it: "1×", "1.5×". */
export const scaleLabel = (scale: PreviewScale): string => `${scale}×`;

/** Which way a click of the key goes: a right-click (`secondary`) or a click with Shift held one
 * step smaller, any other one step larger. Enter and Space click it, so Shift+Enter and
 * Shift+Space go smaller too. */
export function previewStepOfPress(press: { secondary: boolean; shift: boolean }): 1 | -1 {
  return press.secondary || press.shift ? -1 : 1;
}

/** Which way a key pressed with the focus on the key goes, for the keys it takes itself: ↑ one step
 * larger, ↓ one step smaller, and Shift+Space one step smaller — Chrome clicks a button for Space
 * with no Shift held only (Enter and Shift+Enter, and Space, are its clicks). Null for any other
 * key, and for these with another modifier held. */
export function previewStepOfKey(event: {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): 1 | -1 | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.shiftKey) return event.key === ' ' ? -1 : null;
  return event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : null;
}

/** What the key says, in the words of the view that is shown. */
export interface PreviewSizeWords {
  /** Its tooltip and its accessible name: the size now, what a click and a right-click do, and
   * which end is reached — there the press that would go past it does nothing. */
  title: string;
  /** What is announced after a press (ui/announcer.ts): the size now, and the end reached. */
  status: string;
}

export function previewSizeWords(view: View, scale: PreviewScale): PreviewSizeWords {
  const status = `${view === 'grid' ? 'Preview tooltip size' : 'Preview size'} ${scaleLabel(scale)}`;
  const larger = 'click for larger';
  const smaller = 'right-click or Shift+click for smaller';
  if (steppedPreview(scale, 1) === null) {
    return { title: `${status}, the largest: ${smaller}`, status: `${status}, the largest` };
  }
  if (steppedPreview(scale, -1) === null) {
    return { title: `${status}, the smallest: ${larger}`, status: `${status}, the smallest` };
  }
  return { title: `${status}: ${larger}, ${smaller}`, status };
}
