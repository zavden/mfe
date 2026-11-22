/* The keys of the timeline's region (D180): I puts its start at the playhead, O its end, Escape
 * removes it. I and O are plain letters (`regionKeyEdge`): not while a field is being typed in, a
 * dialog or a menu is open or the Timeline panel is folded — the region would be marked out of
 * sight —, and once per press.
 *
 * Escape has other work all over the app — a drag to cancel, a mode of the Preview to leave, the
 * glyphs picked with Alt to let go, a keyframe being edited, a menu or a dialog to close, the
 * search of formulas — and the region goes only when the key has nothing else to do. Who else
 * takes the key is known before any of them hears it: what is on is read as the key goes down,
 * in the capture phase (some let go of what they had without marking the event), and the region
 * is removed in the bubble phase, when nobody stopped the key or prevented its default.
 *
 * The same free Escape ends the isolation of a camera move in the Preview (`viewStore.ts`,
 * `stopIsolating`), and that first: a press ends the isolation, the next removes the region. */
import { useEffect } from 'react';
import { useTransformEdit } from '../animations/transformEdit';
import { stopIsolating } from '../camera/cameraActions';
import { inOpenMenu } from '../focus';
import { usePanels } from '../panelsStore';
import { useGlyphPick } from '../preview/glyphPickStore';
import { isPreviewCovered } from '../preview/previewCover';
import { previewModeOn } from '../preview/previewModes';
import { usePreviewView } from '../preview/viewStore';
import { isModalOpen } from '../project/modalStack';
import { isTextEntryTarget } from '../project/shortcuts';
import { regionKeyEdge } from './region';
import { markRegionEdge, removeRegion } from './regionActions';
import { useTimelineStore } from './timelineStore';

/** Whether something else has a use for Escape now, besides what stops the key itself. */
function escapeHasWork(target: EventTarget | null, pointersDown: number): boolean {
  return (
    pointersDown > 0 ||
    isModalOpen() ||
    isPreviewCovered() ||
    previewModeOn() ||
    useGlyphPick.getState().pick !== null ||
    useTransformEdit.getState().editing !== null ||
    isTextEntryTarget(target) ||
    inOpenMenu(target) ||
    // A menu opened with the pointer may leave the focus outside of it (the menu bar's, in the
    // browsers that do not focus a clicked button): open is enough.
    document.querySelector('[role="menu"]') !== null
  );
}

export function useRegionKeys(): void {
  useEffect(() => {
    // A pressed pointer is a drag that Escape may cancel, wherever it started. A release the page
    // never hears (the browser's own menu took it, the window lost the focus) must not leave it
    // pressed for good.
    const down = new Set<number>();
    const onDown = (e: PointerEvent) => void down.add(e.pointerId);
    const onUp = (e: PointerEvent) => void down.delete(e.pointerId);
    const onLost = () => down.clear();
    let escapeIsFree = false;
    const onKeyCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      escapeIsFree =
        (useTimelineStore.getState().region !== null ||
          usePreviewView.getState().isolatedMove !== null) &&
        !e.defaultPrevented &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !escapeHasWork(e.target, down.size);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const free = escapeIsFree;
        escapeIsFree = false;
        if (free && !e.defaultPrevented && (stopIsolating() || removeRegion())) e.preventDefault();
        return;
      }
      const edge = regionKeyEdge(e);
      if (!edge || e.defaultPrevented) return;
      // A letter typed in an open menu looks for an entry of it.
      if (isModalOpen() || isTextEntryTarget(e.target) || inOpenMenu(e.target)) return;
      if (usePanels.getState().collapsed.timeline) return;
      e.preventDefault();
      if (!e.repeat) markRegionEdge(edge);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('contextmenu', onLost, true);
    window.addEventListener('blur', onLost);
    window.addEventListener('keydown', onKeyCapture, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('contextmenu', onLost, true);
      window.removeEventListener('blur', onLost);
      window.removeEventListener('keydown', onKeyCapture, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
