/* What a block being moved or resized snaps to. Pure. */
import {
  actionWindow,
  cameraMoveEdges,
  groupMembers,
  introWindow,
  outroWindow,
  relationWindow,
  type Clip,
  type ClipId,
  type Project,
} from '../../model';

/** Times (absolute seconds) a block of `clip` snaps to: the playhead, the edges of the clip's
 * other blocks (not those of its group, which move with it), the end of the intro, the start of
 * the outro, the clip's own edges, the edges of the windows of the relations that touch it
 * (except `skipRelationId`'s: a window being dragged does not snap to itself) and the edges of the
 * camera's moves. The ruler grid is added by the caller. */
export function blockSnapPoints(
  project: Project,
  clip: Clip,
  skipActionId: string,
  playhead: number,
  skipRelationId: string | null = null,
): number[] {
  const points = [playhead, clip.start, clip.end, introWindow(clip).end, outroWindow(clip).start];
  const moving = new Set(groupMembers(clip, skipActionId).map((a) => a.id));
  for (const action of clip.actions) {
    if (moving.has(action.id)) continue;
    const w = actionWindow(clip, action);
    points.push(w.start, w.end);
  }
  const byId = new Map<ClipId, Clip>(project.clips.map((c) => [c.id, c]));
  for (const relation of project.relations) {
    if (relation.fromClipId !== clip.id && relation.toClipId !== clip.id) continue;
    if (relation.id === skipRelationId) continue;
    const to = byId.get(relation.toClipId);
    if (!to) continue;
    const w = relationWindow(relation, to);
    points.push(w.start, w.end);
  }
  // The edges of the camera's moves: where the locked region starts and ends.
  points.push(...cameraMoveEdges(project));
  return points;
}
