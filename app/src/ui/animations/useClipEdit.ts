/* Editing one clip of the project as one undo step. */
import type { Clip } from '../../model';
import { useProjectStore } from '../../store';
import { lockedWindowTimes, restoreLockedWindows } from '../relations/lockedRelations';
import { fitRelationWindows, keepWindowsInPlace } from '../relations/relationOps';

/** Edit the clip with `recipe` as one undo step. */
export function useClipEdit(clipId: string) {
  const update = useProjectStore((s) => s.update);
  return (recipe: (clip: Clip) => void) =>
    update((draft) => {
      const clip = draft.clips.find((c) => c.id === clipId);
      if (!clip) return;
      const oldStart = clip.start;
      const lockedTimes = lockedWindowTimes(draft);
      recipe(clip);
      // Edits that change the clip's extent keep its relation windows inside both clips; those a
      // locked track holds stay where they play (the fields stop before they would leave them).
      if (clip.start !== oldStart) keepWindowsInPlace(draft, clipId, oldStart);
      restoreLockedWindows(draft, lockedTimes);
      fitRelationWindows(draft, [clipId]);
    });
}
