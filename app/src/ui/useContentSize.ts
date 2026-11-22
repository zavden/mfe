/* The size of an element on screen, for a drawing that keeps lengths of its own in CSS pixels
 * whatever its scale: the frames of a glyph view (`creator/GlyphView.tsx`), the marks and the
 * badges of the drawing that links glyphs (`relations/GlyphLinkCanvas.tsx`). */
import { useLayoutEffect, useState, type RefObject } from 'react';

/** The size of an element's content box in CSS pixels, read before it is painted and again
 * whenever it changes; null while it has none (a view not laid out yet, jsdom). */
export function useContentSize(ref: RefObject<Element | null>): readonly [number, number] | null {
  const [size, setSize] = useState<readonly [number, number] | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((old) => (old && old[0] === width && old[1] === height ? old : [width, height]));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
