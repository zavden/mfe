/* The timeline's keys. Delete / Backspace remove the selected clips (and their relations; asking
 * first when objects attached to them go too), the selected relation, the selected camera move or
 * the selected target camera (asking first when moves go to it), or ask before deleting the
 * selected animation block; ⌘/Ctrl+D duplicates
 * either; Alt+←/→ nudge the selected block, or the selected camera move, by a frame (with Shift,
 * five), as in video editors
 * (plain ←/→ step the playhead); S splits the selected clips at the playhead (`splitActions.ts`).
 * A block drawn as its folded group stands for the group: the
 * keys delete, duplicate and nudge all of it. None of them acts in an open menu, whose keys are
 * its own (`inOpenMenu`). The stores are read when a key is pressed; what changed is announced to
 * assistive technology (ui/announcer.ts). */
import { useEffect } from 'react';
import { history, useProjectStore, useUiStore } from '../../store';
import { announce } from '../announcer';
import {
  confirmDeleteBlock,
  confirmDeleteGroup,
  duplicateBlock,
  duplicateGroup,
  nudgeBlock,
  reportRefused,
} from '../animations/blockActions';
import {
  deleteCameraMove,
  deleteTargetCameraAsking,
  duplicateCameraMove,
  nudgeCameraMove,
} from '../camera/cameraActions';
import { foldedGroupOf } from './blockGroups';
import { useTimelineStore } from './timelineStore';
import { inOpenMenu } from '../focus';
import { letterOf } from '../platform';
import { isModalOpen } from '../project/modalStack';
import { isTextEntryTarget } from '../project/shortcuts';
import { deleteRelation, relationLock } from '../relations/relationOps';
import { deleteClipsAsking, duplicateSelectedClips } from './clipActions';
import { editableClips } from './clipOps';
import { selectedEditableAudio } from './audioCommands';
import { splitAtPlayhead, splitKeyApplies } from './splitActions';
import { isEditableTarget } from './dom';
import { arrowOf } from './axis';

/** A key of the timeline, as `timelineKey` names a key press. */
export type TimelineKey = 'split' | 'delete' | 'duplicate' | 'nudge';

/** Which key of the timeline a key press is (pure): S with neither Ctrl, ⌘ nor Alt, Delete or
 * Backspace, Ctrl/⌘+D, Alt+← or Alt+→ (Shift: five frames); null for any other. The letters are
 * read by `letterOf`: on a layout of another script, the keys where a Latin keyboard has them. */
export function timelineKey(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'> & {
    code?: string;
  },
): TimelineKey | null {
  const command = event.ctrlKey || event.metaKey;
  const letter = letterOf(event);
  if (letter === 's' && !command && !event.altKey) return 'split';
  if (event.key === 'Delete' || event.key === 'Backspace') return 'delete';
  if (letter === 'd' && command && !event.shiftKey && !event.altKey) return 'duplicate';
  // The arrows that go along time: left and right, or up and down in a vertical timeline.
  const arrow = arrowOf(event.key);
  if ((arrow === 'ArrowLeft' || arrow === 'ArrowRight') && event.altKey && !command) {
    return 'nudge';
  }
  return null;
}

export function useTimelineKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isModalOpen()) return;
      const key = timelineKey(e);
      if (key === null) return;
      // A key pressed in an open menu is the menu's (`inOpenMenu`): nothing is split, deleted,
      // duplicated or nudged under it, and the browser does not take the key either (Ctrl/⌘+D
      // would bookmark the page, Alt+←/→ go to the page before) — but in a field of the menu,
      // whose text the key edits.
      if (inOpenMenu(e.target)) {
        if (!isEditableTarget(e.target)) e.preventDefault();
        return;
      }
      const sel = useUiStore.getState().selection;
      const state = useProjectStore.getState();
      // S, where the global shortcuts leave it to the split (`splitKeyApplies`): from the same
      // places as theirs — a checkbox or a slider takes no letter —, and once per press. Asked,
      // as they ask it, of the project before a drag that runs: the split gives the drag up.
      if (
        key === 'split' &&
        !isTextEntryTarget(e.target) &&
        splitKeyApplies(history.projectBeforeGesture(), sel, useUiStore.getState().time)
      ) {
        e.preventDefault();
        if (!e.repeat) splitAtPlayhead();
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (sel.kind === 'relation' && key === 'delete') {
        e.preventDefault();
        const relation = state.project.relations.find((r) => r.id === sel.id);
        if (relation && relationLock(state.project, relation)) return; // as a locked clip
        state.update((draft) => deleteRelation(draft, sel.id));
        useUiStore.getState().select({ kind: 'none' });
        announce('Relation deleted');
        return;
      }
      // A move of the Camera row (D190): deleted without a question, copied into the first place
      // it fits, nudged inside the free time it is in.
      if (sel.kind === 'cameraMove') {
        e.preventDefault();
        if (key === 'delete') deleteCameraMove(sel.id);
        else if (key === 'duplicate') duplicateCameraMove(sel.id);
        else if (key === 'nudge') {
          const frames = (arrowOf(e.key) === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 1);
          nudgeCameraMove(sel.id, frames);
        }
        return;
      }
      // A target camera (D190): deleted, asking first when moves go to it.
      if (sel.kind === 'targetCamera' && key === 'delete') {
        e.preventDefault();
        if (!e.repeat) void deleteTargetCameraAsking(sel.id);
        return;
      }
      if (sel.kind === 'action') {
        const clip = state.project.clips.find((c) => c.id === sel.clipId);
        const folded =
          clip !== undefined &&
          foldedGroupOf(clip, sel.actionId, useTimelineStore.getState().unfolded) !== null;
        if (key === 'delete') {
          e.preventDefault();
          const asked = folded
            ? confirmDeleteGroup(sel.clipId, sel.actionId)
            : confirmDeleteBlock(sel.clipId, sel.actionId);
          void asked.then((deleted) => {
            if (deleted) announce(folded ? 'Group deleted' : 'Block deleted');
          });
        } else if (key === 'duplicate') {
          e.preventDefault();
          const outcome = folded
            ? duplicateGroup(sel.clipId, sel.actionId)
            : duplicateBlock(sel.clipId, sel.actionId);
          reportRefused(outcome);
          if (outcome.ok) announce(folded ? 'Group duplicated' : 'Block duplicated');
        } else if (key === 'nudge') {
          e.preventDefault();
          const frames = (arrowOf(e.key) === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 1);
          nudgeBlock(sel.clipId, sel.actionId, frames);
        }
        return;
      }
      if (sel.kind !== 'clips') return;
      const editable = editableClips(state.project, sel.ids);
      const audio = selectedEditableAudio(state.project, sel);
      if (key === 'delete') {
        e.preventDefault();
        if (editable.length === 0 && audio.length === 0) return;
        void deleteClipsAsking(new Set([...editable, ...audio].map((c) => c.id)));
      } else if (key === 'duplicate') {
        e.preventDefault();
        duplicateSelectedClips();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
