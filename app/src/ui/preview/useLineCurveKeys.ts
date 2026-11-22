/* The keys of «Edit curve» (`lineCurve.ts`) while the mode is on, wherever the playhead is: the
 * points of the spline are drawn while its line is on screen (`LineCurveLayer.tsx`), and the mode
 * is on, and is left, when it is not. Enter keeps the curve, Escape puts back the one the mode
 * started with, Delete and Backspace remove the selected point — and are the mode's with none
 * selected too, when they remove nothing: the timeline would delete the selected clip, which is
 * the line's. Taken before anything else hears them — a focused clip's Enter, the Backspace that
 * deletes what is selected —, and left alone when they are somebody else's (`modeKeys.ts`): a
 * dialog's, a field's, an open menu's, or the Preview is covered; and held with Ctrl, ⌘ or Alt,
 * when they are a shortcut's. */
import { useEffect } from 'react';
import { removeCurvePoint, useLineCurveEdit } from './lineCurve';
import { modeOwnsKey } from './modeKeys';

const KEYS = new Set(['Enter', 'Escape', 'Delete', 'Backspace']);

export function useLineCurveKeys(): void {
  const active = useLineCurveEdit((state) => state.clipId !== null);
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!KEYS.has(event.key) || !modeOwnsKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === 'Escape') {
        useLineCurveEdit.getState().close(event.key === 'Escape');
      } else {
        removeCurvePoint();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active]);
}
