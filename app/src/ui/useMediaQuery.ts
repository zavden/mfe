/* Whether a CSS media query matches, followed as the window changes: the layout stacks its
 * panels in a narrow window (`NARROW_LAYOUT`: a phone, or the desktop at 400 % zoom). */
import { useSyncExternalStore } from 'react';

/** Below this width the panels stack and the page scrolls (styles.css has the same number). */
export const NARROW_LAYOUT = '(max-width: 760px)';

const query = (q: string): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(q)
    : null;

/** True while `q` matches; false where `matchMedia` is missing (a test DOM). */
export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = query(q);
      if (!list) return () => {};
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => query(q)?.matches ?? false,
    () => false,
  );
}
