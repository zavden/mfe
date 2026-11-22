/* A clip locked in the preview (`Clip.previewLocked`, format 20): the preview draws it and
 * leaves it alone. It is not there for the pointer — a press, a hover, a selection rectangle and
 * an Alt pick go through it to what is under it — and nothing done in the preview moves it: not
 * a drag of the selection it is part of, not the transform handles, not Align, Distribute, Align
 * by symbol nor Paste properties. Other formulas still snap to it as they are dragged, which is
 * what it is locked for: to put the others in place around it. The timeline and the panels edit
 * it as any other clip (and its menu on the timeline unlocks it). The preview shows which
 * formulas are locked by drawing them faded (`fadeLocked`; how much is a preference). Pure. */
import type { Clip, ClipId, Project } from '../../model';
import type { Drawable } from '../../scene';
import { editableClips } from '../timeline/clipOps';

/** Whether the preview leaves `clip` alone. */
export const isPreviewLocked = (clip: Pick<Clip, 'previewLocked'>): boolean =>
  clip.previewLocked === true;

const NONE: ReadonlySet<ClipId> = new Set();

/** The clips the preview leaves alone (the same empty set when there are none). */
export function previewLockedIds(project: Pick<Project, 'clips'>): ReadonlySet<ClipId> {
  const locked = project.clips.filter(isPreviewLocked).map((clip) => clip.id);
  return locked.length === 0 ? NONE : new Set(locked);
}

/** What the pointer can reach among things of clips (drawables, ids): those of the clips that
 * are not locked — the same array when none is. */
export function reachable<T extends { clipId: ClipId }>(
  items: readonly T[],
  locked: ReadonlySet<ClipId>,
): readonly T[] {
  if (locked.size === 0) return items;
  return items.filter((item) => !locked.has(item.clipId));
}

/** The clips among `ids` the preview may change: those the timeline may (`editableClips`: not on
 * a locked track) that are not locked in the preview, in the project's order. */
export function previewEditableClips(project: Project, ids: readonly ClipId[]): Clip[] {
  return editableClips(project, ids).filter((clip) => !isPreviewLocked(clip));
}

/** The drawables as the preview paints them: those of the locked clips at `opacity` of their own
 * (fill and stroke alike), the others untouched — the same array when nothing is locked or
 * `opacity` is 1. For the editor's preview alone: what is exported is never faded. */
export function fadeLocked(
  drawables: readonly Drawable[],
  locked: ReadonlySet<ClipId>,
  opacity: number,
): readonly Drawable[] {
  if (locked.size === 0 || opacity >= 1) return drawables;
  return drawables.map((drawable) =>
    locked.has(drawable.clipId)
      ? {
          ...drawable,
          fill: drawable.fill && { ...drawable.fill, opacity: drawable.fill.opacity * opacity },
          stroke: drawable.stroke && {
            ...drawable.stroke,
            opacity: drawable.stroke.opacity * opacity,
          },
        }
      : drawable,
  );
}
