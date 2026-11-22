/* The menu of what has the focus, from the keyboard. On Windows and Linux the browser turns the
 * Menu key and Shift+F10 into a `contextmenu` event at the focused element, and every menu that
 * hangs from a right-click opens with them. A Mac has no such key and its browsers send nothing:
 * those menus would be out of the keyboard's reach there. This service does on a Mac what the
 * browser does elsewhere, with the same event at the same place, so the components know one way
 * only (`onContextMenu`).
 *
 * It listens on the document, after the components: a key that one of them took (the timeline
 * opens the menus of its clips and blocks itself) is left alone. */
import { isMac } from './platform';

/** The Menu key, or Shift+F10: what opens a context menu from the keyboard. */
export function isMenuKey(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return (
    (event.key === 'ContextMenu' && !event.shiftKey) || (event.key === 'F10' && event.shiftKey)
  );
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where the browsers that have the key put the event: the middle of the part of the element
 * that is in the window, on whole pixels (measured on Chrome). */
export function menuPoint(
  box: Box,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const left = Math.max(box.left, 0);
  const top = Math.max(box.top, 0);
  const right = Math.min(box.right, viewport.width);
  const bottom = Math.min(box.bottom, viewport.height);
  return { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) };
}

/** Start answering the menu key where the browser does not (`mac`: asked at every key). The
 * result stops it. */
export function startContextMenuKey(mac: () => boolean = isMac): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !isMenuKey(event) || !mac()) return;
    const target = document.activeElement;
    // Any element: the glyph view of a formula is an SVG, and it takes the focus.
    if (!(target instanceof Element) || target === document.body) return;
    const { x, y } = menuPoint(target.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    event.preventDefault();
    target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
      }),
    );
  };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
