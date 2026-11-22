/* The pointer gesture on the inner edge of a clip's intro or outro (D119): dragging it makes the
 * animation longer or shorter, as dragging an edge of an animation block does — it snaps to the
 * playhead, the ruler grid, the clip's blocks and its relation windows (Shift suspends that),
 * stays within what the clip allows (`phaseLimits`: never over the window of a relation with a
 * clip on a locked track, either), shows a readout meanwhile (`phaseDrag` in
 * the timeline store), is one undo step and is cancelled by Escape. A press selects the clip; a
 * clip on a locked track is selected and not edited. */
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ClipId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { setPhaseDuration, type Phase } from '../animations/clipEdit';
import { DRAG_THRESHOLD, isMainClick } from '../pointer';
import { trackProjectPointer } from '../project/trackProjectPointer';
import { snapOffset } from './clipOps';
import { phaseDurationAt, phaseEdge, phaseLimits, phaseSnapPoints } from './phaseDrag';
import { useTimelineStore } from './timelineStore';
import { snapOptionsAt } from './useTimelineGestures';
import { along } from './axis';

/** Press on the inner edge of the intro or the outro of clip `clipId`. */
export function startPhaseGesture(e: ReactPointerEvent, clipId: ClipId, phase: Phase): void {
  if (!isMainClick(e)) return;
  e.stopPropagation();
  e.preventDefault();
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip || clip[phase].kind === 'none') return;
  useUiStore.getState().select({ kind: 'clips', ids: [clipId] });
  if (project.tracks.find((t) => t.id === clip.trackId)?.locked) return;

  // Everything the drag depends on is fixed when it starts: the duration alone changes.
  const limits = phaseLimits(clip, phase, project);
  const points = phaseSnapPoints(project, clip, useUiStore.getState().time);
  const edge0 = phaseEdge(clip, phase);
  const startX = along(e);
  let started = false;
  let last = clip[phase].duration;

  trackProjectPointer(e, {
    move: (ev, begin) => {
      if (!started) {
        if (Math.abs(along(ev) - startX) < DRAG_THRESHOLD) return;
        started = true;
        begin();
        useTimelineStore.getState().setPhaseDrag({ clipId, phase });
      }
      const { pxPerSecond, snap } = useTimelineStore.getState();
      let edge = edge0 + (along(ev) - startX) / pxPerSecond;
      if (snap && !ev.shiftKey) {
        edge += snapOffset(edge, snapOptionsAt(points, project.meta.fps));
      }
      const duration = phaseDurationAt(clip, phase, edge, limits);
      if (Math.abs(duration - last) < 1e-9) return;
      last = duration;
      begin().update((draft) => {
        const target = draft.clips.find((c) => c.id === clipId);
        if (target) setPhaseDuration(target, phase, duration);
      });
    },
    end: () => {
      if (started) useTimelineStore.getState().setPhaseDrag(null);
    },
  });
}
