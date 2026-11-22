/* The keys of «To another formula or glyphs…» (`shapeRetarget.ts`) while the mode is on: Enter
 * makes the Transform to what is chosen, Escape leaves the mode. Taken before anything else hears
 * them — a focused clip's Enter, the preview's own Escape —, and left alone when they are
 * somebody else's (`modeKeys.ts`): a dialog's, a field's, an open menu's, or the Preview is
 * covered. */
import { useEffect } from 'react';
import { modeOwnsKey } from './modeKeys';
import { confirmRetarget, useShapeRetarget } from './shapeRetarget';

export function useShapeRetargetKeys(): void {
  const active = useShapeRetarget((state) => state.request !== null);
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      if (!modeOwnsKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') useShapeRetarget.getState().cancel();
      else confirmRetarget();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active]);
}
