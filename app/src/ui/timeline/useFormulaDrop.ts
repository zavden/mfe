/* Dropping a formula from the Creator onto a track: the ghost of the clip while the formula is
 * dragged over a lane, and the clip itself (at the snapped time, moved to the nearest free space)
 * when it is dropped. Shift held suspends snapping, as in every other drag of the timeline. The
 * clip takes from its object what a new clip does: the intro, and the place on screen the object
 * keeps for its new clips (`newClipState`).
 *
 * While a region is marked on the timeline (D180) the clip takes the region whole on the track it
 * is dropped on, wherever along the track that is: the ghost shows it there. A track with a clip
 * in the region takes none — no ghost, and the drop says why. */
import { useState, type DragEvent as ReactDragEvent } from 'react';
import { createClip, newClipState, type Track } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { FORMULA_MIME } from '../dnd';
import { newClipAnimations } from '../preferences';
import { notify } from '../project/noticeStore';
import { round6 } from '../time';
import { findFreeSlot, regionClipBlocker, regionFreeOn, snapEdges } from './clipOps';
import { DROPPED_CLIP_LENGTH } from './layout';
import { regionLabel } from './region';
import { useTimelineStore } from './timelineStore';
import { snapOptions } from './useTimelineGestures';
import { along } from './axis';

/** The clip a drop would make, drawn on its lane while the formula is over it. */
export interface Ghost {
  trackId: string;
  start: number;
  end: number;
}

function hasFormula(e: ReactDragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(FORMULA_MIME);
}

export function useFormulaDrop(timeAt: (clientX: number) => number) {
  const [ghost, setGhost] = useState<Ghost | null>(null);

  /** Where a dropped clip would go: the snapped time (unless Shift is held), moved to the
   * nearest free space — or the region, while one is marked: then a sentence instead when the
   * track cannot take a clip there. */
  const dropPlacement = (track: Track, clientX: number, shiftKey: boolean): Ghost | string => {
    const state = useProjectStore.getState().project;
    const { snap: snapOn, region } = useTimelineStore.getState();
    if (region) {
      const blocker = regionClipBlocker(region);
      if (blocker) return blocker;
      if (!regionFreeOn(state, track.id, region)) {
        return `Track “${track.name}” has a clip in the region (${regionLabel(region)}): nothing was added. Drop it on another track, move the region, or remove it (Esc).`;
      }
      return { trackId: track.id, start: region.start, end: region.end };
    }
    let start = Math.max(0, timeAt(clientX));
    if (snapOn && !shiftKey) start += snapEdges([start], snapOptions(state, new Set()));
    start = findFreeSlot(state, track.id, Math.max(0, start), DROPPED_CLIP_LENGTH);
    return { trackId: track.id, start, end: round6(start + DROPPED_CLIP_LENGTH) };
  };

  const onLaneDragOver = (e: ReactDragEvent, track: Track) => {
    if (!hasFormula(e) || track.locked || track.kind !== 'visual') return;
    e.preventDefault();
    // Match the effect the dragged item allows, or the browser refuses the drop.
    const allowed = e.dataTransfer.effectAllowed;
    e.dataTransfer.dropEffect =
      allowed === 'move' || allowed === 'linkMove' ? 'move' : allowed === 'link' ? 'link' : 'copy';
    const next = dropPlacement(track, along(e), e.shiftKey);
    // A region the track cannot take: no ghost, and the drop is let through to say why.
    if (typeof next === 'string') {
      setGhost(null);
      return;
    }
    setGhost((g) =>
      g && g.trackId === next.trackId && g.start === next.start && g.end === next.end ? g : next,
    );
  };

  const onLaneDrop = (e: ReactDragEvent, track: Track) => {
    if (!hasFormula(e) || track.locked || track.kind !== 'visual') return;
    e.preventDefault();
    setGhost(null);
    const formulaId = e.dataTransfer.getData(FORMULA_MIME);
    const formula = useProjectStore.getState().project.formulas.find((f) => f.id === formulaId);
    if (!formula) return;
    const placement = dropPlacement(track, along(e), e.shiftKey);
    if (typeof placement === 'string') {
      notify({ kind: 'warning', title: 'No room in the region', message: placement });
      return;
    }
    const { start, end } = placement;
    const clip = createClip(formulaId, track.id, start, end, {
      ...newClipAnimations(end - start, formula.intro),
      initial: newClipState(formula),
    });
    useProjectStore.getState().update((draft) => {
      draft.clips.push(clip);
    });
    useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
  };

  return { ghost, clearGhost: () => setGhost(null), onLaneDragOver, onLaneDrop };
}
