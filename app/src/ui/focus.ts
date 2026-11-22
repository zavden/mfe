/* Focus conventions shared by the panels: keeping it where it is, moving it along a row of
 * controls, and giving it back when a popup closes; and what a menu open on the page owns — its
 * keys (`inOpenMenu`) and the choice of one of its entries (`onMenuChoice`). */

/** A `pointerdown` (or `mousedown`) handler for a toolbar button that must not take the focus, so
 * that Space and the arrow keys keep controlling what the user was working on (playback, a list). */
export const keepFocus = (e: { preventDefault(): void }): void => e.preventDefault();

/** Which item of a row (tabs, a segmented control, a menu) a navigation key moves to: the arrows
 * of `axis` step and wrap, Home and End jump to the ends; `null` for any other key. With no item
 * focused (`index` -1) ArrowDown/ArrowRight reach the first item. */
export function rovingIndex(
  key: string,
  index: number,
  length: number,
  axis: 'horizontal' | 'vertical' | 'both' = 'both',
): number | null {
  if (length === 0) return null;
  const horizontal = axis !== 'vertical';
  const vertical = axis !== 'horizontal';
  const step =
    (horizontal && key === 'ArrowRight') || (vertical && key === 'ArrowDown')
      ? 1
      : (horizontal && key === 'ArrowLeft') || (vertical && key === 'ArrowUp')
        ? -1
        : 0;
  if (step !== 0) return (index + step + length) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}

/** Type-ahead along a row of labelled items (a menu, the menu bar): the index of the next item
 * after `from` (wrapping; −1 for none) whose label starts with `char`, case ignored; null when
 * no label does. The item at `from` itself comes last, so a lone match keeps the focus. */
export function typeAheadIndex(
  labels: readonly string[],
  from: number,
  char: string,
): number | null {
  const wanted = char.toLocaleLowerCase();
  for (let step = 1; step <= labels.length; step += 1) {
    const i = (from + step + labels.length) % labels.length;
    if (labels[i]!.trimStart().toLocaleLowerCase().startsWith(wanted)) return i;
  }
  return null;
}

/** Whether a key pressed on `target` is for a menu that is open: pressed inside one (a context
 * menu, a menu of the bar, a submenu, the Creator's menu of the kinds), on the bar while one of
 * its menus is open — opened with the pointer, a menu leaves the focus on its button —, or on the
 * page itself while a menu is open: a press on what of a menu takes no focus (its heading, a
 * line, its edge) lets the focus go to the page and leaves the menu open. Such a key is the
 * menu's alone: the app's shortcuts, the playhead's keys and the timeline's leave it, and so does
 * a mode of the Preview (`modeKeys.ts`). The bar with its menus closed owns no key of somebody
 * else: an entry chosen in a menu leaves the focus on the menu's button, and what the entry
 * started (a mode of the Preview) has its keys from there. Nor does a menu open elsewhere take
 * the key of a control that has the focus. */
export function inOpenMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[role="menu"]')) return true;
  const page = target.ownerDocument;
  if (target === page.body || target === page.documentElement) {
    return page.querySelector('[role="menu"]') !== null;
  }
  return target.closest('[role="menubar"]')?.querySelector('[role="menu"]') != null;
}

/** Hear every entry chosen in a menu of the page (`ContextMenu.tsx`: its panels carry
 * `data-ctx-root`) — a click on an item that opens no submenu, of
 * the pointer or of Enter or Space on the item, or Enter in a field of the menu that holds a value
 * it takes (not empty, not marked invalid) — before the entry itself hears it, until the result
 * is called: what a choice ends goes first, and the entry acts on what is left. A menu closed
 * with Escape, Tab or a press outside is no choice. */
export function onMenuChoice(hear: () => void): () => void {
  const inMenu = (target: Element) => target.closest('[data-ctx-root]') !== null;
  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || !inMenu(target)) return;
    const item = target.closest('[role^="menuitem"]');
    if (item && !item.matches(':disabled') && !item.hasAttribute('aria-haspopup')) hear();
  };
  const onKey = (event: KeyboardEvent) => {
    const field = event.target;
    if (event.key !== 'Enter' || !(field instanceof HTMLInputElement)) return;
    if (!field.matches('[data-ctx-field]') || !inMenu(field)) return;
    if (field.value.trim() !== '' && field.getAttribute('aria-invalid') !== 'true') hear();
  };
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);
  return () => {
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKey, true);
  };
}

/** Remembers the focused element; the returned function gives it the focus back if it is still
 * in the document (when the menu or dialog that took the focus closes). */
export function captureFocus(): () => void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return () => {
    if (previous?.isConnected) previous.focus();
  };
}
