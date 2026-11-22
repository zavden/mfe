/* Selecting formulas by region: a rectangle dragged over the empty space of a list of cards
 * selects the cards it touches — the results of the search of formulas (D155), and the rows and
 * blocks of the Creator's own list (D172). A card keeps its own click and its drag onto the
 * timeline; in the Creator's list, where the rows fill the width, Alt held lets the rectangle
 * start on a row or a block too (`startsRegion`). With no key the selection becomes what it
 * touches, the selected formulas the list does not show included (they leave it, as on a plain
 * click on a card); Shift adds what it touches; Ctrl/⌘ takes it out (both: adds, as
 * Ctrl/⌘+Shift+click adds a range). The rectangle lives in the coordinates of the list's content,
 * so that it stays on the cards it was drawn over while the list scrolls under a held drag. Pure:
 * points and boxes in CSS px, no DOM; `useRegionSelect.ts` is the gesture. */
import type { FormulaId } from '../../model';

export interface Point {
  x: number;
  y: number;
}

/** A box, its edges included. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type RegionMode = 'replace' | 'add' | 'remove';

/** Where a press landed, for `startsRegion`: on an item of the list (a card, or another row it
 * holds, as a group's), in a text field (a name being renamed), with Alt held. */
export interface RegionPress {
  onItem: boolean;
  inField: boolean;
  alt: boolean;
}

/** Whether a press may draw a region (once it travels past the drag threshold): on the empty
 * space of the list; on an item only with Alt held, where the list allows it (`altOnItems`, the
 * Creator's) — the item's press is then the region's —; never in a text field. */
export function startsRegion(press: RegionPress, altOnItems: boolean): boolean {
  if (press.inField) return false;
  return !press.onItem || (altOnItems && press.alt);
}

/** What a region does by the keys held when it is pressed (Alt changes nothing of it). */
export function regionMode(keys: { shift: boolean; ctrl: boolean }): RegionMode {
  if (keys.shift) return 'add';
  return keys.ctrl ? 'remove' : 'replace';
}

/** The rectangle between the press point and the pointer, normalised. */
export function regionBox(start: Point, now: Point): Box {
  return {
    left: Math.min(start.x, now.x),
    top: Math.min(start.y, now.y),
    right: Math.max(start.x, now.x),
    bottom: Math.max(start.y, now.y),
  };
}

/** Where the rectangle of `box` is drawn, absolutely, in the positioned scrolling element whose
 * content's coordinates it is in. */
export function boxStyle(box: Box): { left: number; top: number; width: number; height: number } {
  return {
    left: box.left,
    top: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
  };
}

/** Whether two boxes share a point: touching edges count, and so does a rectangle of no width
 * or height that crosses a box. */
export function touches(a: Box, b: Box): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/** A card the region may touch: the formula it shows and its box, in the content's
 * coordinates. Only the cards the list shows are cards: in the search, its tab and its text
 * decide; in the Creator, a closed group's formulas have none, and a group's row is no card. */
export interface RegionCard {
  id: FormulaId;
  box: Box;
}

/** The formulas selected while a region `box` runs, from those selected when it was pressed
 * (`initial`), by `mode`: the cards it touches alone, added, or taken out — in the order of
 * `initial`, then of `cards`. */
export function regionSelection(
  initial: readonly FormulaId[],
  cards: readonly RegionCard[],
  box: Box,
  mode: RegionMode,
): FormulaId[] {
  const touched = cards.filter((card) => touches(card.box, box)).map((card) => card.id);
  if (mode === 'replace') return touched;
  if (mode === 'add') return [...new Set([...initial, ...touched])];
  const out = new Set(touched);
  return initial.filter((id) => !out.has(id));
}

/** Where the content of a scrolling element is on the screen: its client box (inside the border,
 * without the scroll bars) in the window, and how far it is scrolled. */
export interface ScrollView {
  left: number;
  top: number;
  width: number;
  height: number;
  scrollLeft: number;
  scrollTop: number;
}

/** A point of the window in the content's coordinates — from the content's top-left corner,
 * scrolling included —, held inside the part of the content the element shows: a pointer
 * dragged past an edge keeps the rectangle at that edge. */
export function contentPoint(client: Point, view: ScrollView): Point {
  const x = Math.min(Math.max(client.x, view.left), view.left + view.width);
  const y = Math.min(Math.max(client.y, view.top), view.top + view.height);
  return { x: x - view.left + view.scrollLeft, y: y - view.top + view.scrollTop };
}

/** A box of the window (a card's) in the content's coordinates. */
export function contentBox(box: Box, view: ScrollView): Box {
  const dx = view.scrollLeft - view.left;
  const dy = view.scrollTop - view.top;
  return { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
}
