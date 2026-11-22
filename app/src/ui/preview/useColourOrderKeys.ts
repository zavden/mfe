/* The keys of colours in order (`colourOrder.ts`) while the mode is on: Enter goes on from the
 * copy to the paste (and ends a paste), Backspace takes the last click back, Escape leaves the
 * mode. Taken before anything else hears them — a focused clip's Enter, the Backspace that
 * deletes what is selected, the preview's own Escape —, and left alone when they are somebody
 * else's (`modeKeys.ts`): a dialog's, a field's, an open menu's, or the Preview is covered; and
 * on the strip's own buttons, which Enter presses (`pressesModeBar`). */
import { useEffect } from 'react';
import { modeOwnsKey, pressesModeBar } from './modeKeys';
import {
  leaveColourOrder,
  startColourPaste,
  stepBackColourOrder,
  useColourOrder,
} from './colourOrder';

export function useColourOrderKeys(): void {
  const active = useColourOrder((state) => state.phase !== null);
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape' && event.key !== 'Backspace') return;
      if (!modeOwnsKey(event) || pressesModeBar(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const step = useColourOrder.getState().phase?.step;
      if (event.key === 'Backspace') stepBackColourOrder();
      else if (event.key === 'Enter' && step === 'copy') startColourPaste();
      else leaveColourOrder();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active]);
}
