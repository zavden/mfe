/* Pointer gestures on a move of the Camera row (CameraRow.tsx): a press selects it, dragging its
 * body moves it and dragging an edge stretches it. It snaps, like a block, to the playhead, the
 * ruler's grid, the edges of the other moves and of every animation, and the ends of the clips;
 * Shift suspends that. It never leaves the free gap it is in (`moveLimits`): nothing else animates
 * while the camera moves, so it stops against the animation — or the move — before it and after
 * it, and Shift does not change that. While it is dragged a readout under it gives its time and,
 * when it is held short of where the pointer asks, why (`cameraDrag`; the move is marked
 * meanwhile). One drag is one undo step; Escape cancels it. A locked row selects but does not
 * edit. */
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CameraMoveId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { setCameraMoveTiming } from '../camera/cameraActions';
import {
  clampMoveTiming,
  moveLimits,
  moveSnapPoints,
  moveStopReason,
  type MoveEdit,
  type MoveTiming,
} from '../camera/cameraOps';
import { DRAG_THRESHOLD, isMainClick } from '../pointer';
import { trackProjectPointer } from '../project/trackProjectPointer';
import { along } from './axis';
import { snapEdges } from './clipOps';
import { useTimelineStore } from './timelineStore';
import { snapOptionsAt } from './useTimelineGestures';

/** Press on a camera move (`edge`: its body or one of its edges). */
export function startCameraMoveGesture(
  event: ReactPointerEvent,
  moveId: CameraMoveId,
  edge: MoveEdit,
): void {
  if (!isMainClick(event)) return;
  event.stopPropagation();
  if (edge !== 'move') event.preventDefault();
  useUiStore.getState().select({ kind: 'cameraMove', id: moveId });

  const project = useProjectStore.getState().project;
  const camera = project.camera;
  const move = camera?.moves.find((m) => m.id === moveId);
  const limits = moveLimits(project, moveId);
  if (!camera || !move || !limits || camera.locked) return;

  // Everything the drag depends on is fixed when it starts: the move alone changes meanwhile.
  const points = moveSnapPoints(project, moveId, useUiStore.getState().time);
  const startX = along(event);
  const current: MoveTiming = { start: move.start, duration: move.duration };
  const end0 = move.start + move.duration;
  let started = false;
  let last = current;
  let lastStop: string | null = null;

  trackProjectPointer(event, {
    move: (ev, begin) => {
      if (!started) {
        if (Math.abs(along(ev) - startX) < DRAG_THRESHOLD) return;
        started = true;
        begin();
        useTimelineStore.getState().setCameraDrag({ moveId, stop: null });
      }
      const { pxPerSecond, snap } = useTimelineStore.getState();
      const dt = (along(ev) - startX) / pxPerSecond;
      let start = move.start;
      let end = end0;
      if (edge === 'move') {
        start += dt;
        end += dt;
      } else if (edge === 'start') start += dt;
      else end += dt;
      if (snap && !ev.shiftKey) {
        const options = snapOptionsAt(points, project.meta.fps);
        // The edge being moved first: the grid applies to it.
        const offset = snapEdges(
          edge === 'move' ? [start, end] : [edge === 'start' ? start : end],
          options,
        );
        if (edge === 'move') {
          start += offset;
          end += offset;
        } else if (edge === 'start') start += offset;
        else end += offset;
      }
      const timing = clampMoveTiming(limits, current, { start, duration: end - start }, edge);
      // Held short of the pointer: say what stands there.
      const stop = timing.stopped
        ? moveStopReason(project, moveId, { start, end }, timing, edge)
        : null;
      if (stop !== lastStop) {
        lastStop = stop;
        useTimelineStore.getState().setCameraDrag({ moveId, stop });
      }
      if (timing.start === last.start && timing.duration === last.duration) return;
      last = { start: timing.start, duration: timing.duration };
      begin().run(() => setCameraMoveTiming(moveId, last));
    },
    end: () => {
      if (started) useTimelineStore.getState().setCameraDrag(null);
    },
  });
}
