/* Pressing empty space clears the selection (clips, a relation or a formula), as clicking the
 * background does in a video editor. Empty means: not a control, not something that can be
 * selected or dragged (`items`, a selector the panel passes), and not a scroll bar. */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useUiStore } from '../store';
import { isMainClick } from './pointer';

const CONTROLS =
  'button, input, select, textarea, a, label, math-field, [contenteditable="true"], [role="button"], [role="tab"], [role="radio"], [role="option"], [role="scrollbar"], [role="dialog"], .modal-backdrop';

/** A press on an element's own scroll bar targets the element, outside its client box. */
export function onScrollbar(event: ReactPointerEvent, el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const scrolls = el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
  if (!scrolls) return false;
  const rect = el.getBoundingClientRect();
  return (
    event.clientX - rect.left >= el.clientLeft + el.clientWidth ||
    event.clientY - rect.top >= el.clientTop + el.clientHeight
  );
}

export function clearSelectionOnBackground(event: ReactPointerEvent, items: string): void {
  if (!isMainClick(event)) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(CONTROLS) || target.closest(items) || onScrollbar(event, target)) return;
  const ui = useUiStore.getState();
  if (ui.selection.kind !== 'none') ui.select({ kind: 'none' });
}
