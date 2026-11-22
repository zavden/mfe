/* Pointer gestures on a relation's window band: a press selects the relation, dragging the body
 * moves the window and dragging an edge resizes it. The window snaps (like blocks) to the
 * playhead, the ruler grid and the edges of both clips' blocks, phases and other windows; Shift
 * suspends that. It never leaves where it may be (ui/relations/windowRange). While it is dragged
 * the band shows a readout of the window (`windowDrag` in the timeline store). One drag is one
 * undo step; Escape cancels it. Relations of a locked track can be selected but not edited, nor
 * can one with a brace, a shape or a line on a side (`onePieceRelation`). */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { relationWindow, type RelationId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { DRAG_THRESHOLD, isMainClick } from '../pointer';
import { trackProjectPointer } from '../project/trackProjectPointer';
import { setRelationWindow } from '../relations/relationActions';
import { onePieceRelation, relationLock, type WindowSpec } from '../relations/relationOps';
import { clampWindow, type WindowEdit } from '../relations/windowRange';
import { blockSnapPoints } from './blockSnap';
import { snapEdges } from './clipOps';
import { useTimelineStore } from './timelineStore';
import { snapOptionsAt } from './useTimelineGestures';
import { along } from './axis';

const sameSpec = (a: WindowSpec, b: WindowSpec) =>
  Math.abs(a.offset - b.offset) < 1e-9 && Math.abs(a.duration - b.duration) < 1e-9;

/** Press on a window band (`edge`: its body or one of its edges). */
export function startWindowGesture(
  e: ReactPointerEvent,
  relationId: RelationId,
  edge: WindowEdit,
): void {
  if (!isMainClick(e)) return;
  e.stopPropagation();
  if (edge !== 'move') e.preventDefault();
  useUiStore.getState().select({ kind: 'relation', id: relationId });

  const project = useProjectStore.getState().project;
  const relation = project.relations.find((r) => r.id === relationId);
  const from = project.clips.find((c) => c.id === relation?.fromClipId);
  const to = project.clips.find((c) => c.id === relation?.toClipId);
  if (!relation || !from || !to || relationLock(project, relation)) return;
  // One with a brace, a shape or a line on a side is not edited, only deleted (audit A1-02).
  if (onePieceRelation(project, relation)) return;

  // Everything the drag depends on is fixed when it starts: the window alone changes meanwhile.
  const window = relationWindow(relation, to);
  const playhead = useUiStore.getState().time;
  const points = [
    ...blockSnapPoints(project, from, '', playhead, relationId),
    ...blockSnapPoints(project, to, '', playhead, relationId),
  ];
  const startX = along(e);
  let started = false;
  let last: WindowSpec = { offset: relation.offset, duration: relation.duration };

  trackProjectPointer(e, {
    move: (ev, begin) => {
      if (!started) {
        if (Math.abs(along(ev) - startX) < DRAG_THRESHOLD) return;
        started = true;
        begin();
        useTimelineStore.getState().setWindowDrag(relationId);
      }
      const { pxPerSecond, snap } = useTimelineStore.getState();
      const dt = (along(ev) - startX) / pxPerSecond;
      let start = window.start;
      let end = window.end;
      if (edge === 'move') {
        start += dt;
        end += dt;
      } else if (edge === 'start') start += dt;
      else end += dt;
      if (snap && !ev.shiftKey) {
        const options = snapOptionsAt(points, project.meta.fps);
        const edges = edge === 'move' ? [start, end] : [edge === 'start' ? start : end];
        const offset = snapEdges(edges, options);
        if (edge === 'move') {
          start += offset;
          end += offset;
        } else if (edge === 'start') start += offset;
        else end += offset;
      }
      const spec = clampWindow(project, relationId, { start, end }, edge);
      if (!spec || sameSpec(spec, last)) return;
      last = spec;
      begin().run(() => setRelationWindow(relationId, spec));
    },
    end: () => {
      if (!started) return;
      useTimelineStore.getState().setWindowDrag(null);
    },
  });
}
