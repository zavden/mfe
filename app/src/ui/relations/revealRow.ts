/* Brings a row of a list that scrolls into view by scrolling that list alone, as little as
 * possible. `scrollIntoView` scrolls every ancestor that can scroll: in an editor whose dialog
 * scrolls too, the drawing would move under the pointer that rests on one of its glyphs. */
import { revealScroll } from '../timeline/keyboardNav';

export function revealRow(row: Element | null): void {
  const list = row?.closest('ol, ul');
  if (!row || !list) return;
  const rowBox = row.getBoundingClientRect();
  const listBox = list.getBoundingClientRect();
  // The row's top in the list's content: from its padding edge, with what is scrolled away.
  const top = rowBox.top - listBox.top - list.clientTop + list.scrollTop;
  list.scrollTop = revealScroll(list.scrollTop, list.clientHeight, 0, top, rowBox.height);
}
