/* Where a transformation starts and where it ends, made explicit. A direct edit in the preview
 * changes the keyframe in effect at the playhead — after a transformation, that transformation's
 * end state — which is easy to change by accident. So a selected Transform block (a tween or a
 * part transform) has two icons on the timeline: the start one moves the playhead to where the
 * block starts (to look), the end one to where it reaches its target and lets the preview edit
 * that target (this module's `editing`): the keyframe of a tween, or the shift, scale and rotation
 * of a part.
 *
 * Each clip is also *locked* after its first transformation: there the preview edits it only
 * through the end icon. Before it (the clip's initial state) the preview edits freely, and an
 * unlocked clip edits the keyframe at the playhead as before. Session state: not saved, not
 * undoable. */
import { create } from 'zustand';
import {
  TIME_EPSILON,
  type ActionId,
  type Clip,
  type ClipId,
  type ClipState,
  type PartTransformAction,
  type TweenAction,
} from '../../model';
import { actionStates, endsAtStart, keyframeAt, type KeyframeRef } from '../../scene';
import { confirmDialog } from '../project/dialogStore';

export interface TransformEditTarget {
  clipId: ClipId;
  actionId: ActionId;
  /** The playhead the edit started at: moving the playhead ends the edit. */
  time: number;
}

interface TransformEditState {
  /** The tween or part transform whose end state the preview edits, or null. */
  editing: TransformEditTarget | null;
  /** Clips the user unlocked; every other clip is locked after its first transformation. */
  unlocked: readonly ClipId[];
  startEditing(target: TransformEditTarget): void;
  stopEditing(): void;
  setUnlocked(clipId: ClipId, unlocked: boolean): void;
}

export const useTransformEdit = create<TransformEditState>()((set) => ({
  editing: null,
  unlocked: [],
  startEditing: (target) => set({ editing: target }),
  stopEditing: () => set((s) => (s.editing ? { editing: null } : s)),
  setUnlocked: (clipId, unlocked) =>
    set((s) => {
      const has = s.unlocked.includes(clipId);
      if (has === unlocked) return s;
      return {
        unlocked: unlocked ? [...s.unlocked, clipId] : s.unlocked.filter((id) => id !== clipId),
      };
    }),
}));

/** A block with a start and an end state: a tween, or a transform of a part. */
export type StateBlock = TweenAction | PartTransformAction;

/** Absolute time at which the block starts. */
export function startStateTime(clip: Clip, action: StateBlock): number {
  return clip.start + action.start;
}

/** Absolute time at which the block shows its target: its end, or its middle for an easing that
 * returns to the start (`there_and_back`), where the target is reached. */
export function endStateTime(clip: Clip, action: StateBlock): number {
  return clip.start + action.start + action.duration * (endsAtStart(action.easing) ? 0.5 : 1);
}

/** The part transform of `clip` whose end state is being edited, if that is what `editing` is. */
export function partEditOf(
  clip: Clip,
  editing: TransformEditTarget | null,
): PartTransformAction | null {
  if (!editing || editing.clipId !== clip.id) return null;
  const action = clip.actions.find((a) => a.id === editing.actionId);
  return action?.kind === 'transform' ? action : null;
}

/** How far the glyphs of `part` have turned, beyond the clip's own rotation, once it reaches its
 * target: its rotation plus that of every earlier part transform of each glyph (an easing that
 * comes back leaves nothing). Only `glyphs` count (default: all the part's). The common angle in
 * degrees, or null when they differ — the preview then frames the part with an upright box. */
export function partTurn(
  clip: Clip,
  part: PartTransformAction,
  glyphs: readonly number[] = part.glyphs,
): number | null {
  let common: number | null = null;
  for (const glyph of glyphs) {
    let turn = part.rotation;
    for (const action of clip.actions) {
      if (action.kind !== 'transform' || !action.glyphs.includes(glyph)) continue;
      if (action.start < part.start - TIME_EPSILON && !endsAtStart(action.easing)) {
        turn += action.rotation;
      }
    }
    if (common === null) common = turn;
    else if (Math.abs(turn - common) > 1e-6) return null;
  }
  return common;
}

/** Whether the clip has a transformation (a tween) that the lock protects. */
export function hasTransforms(clip: Clip): boolean {
  return clip.actions.some((a) => a.kind === 'tween');
}

export type PreviewEdit = { ref: KeyframeRef; state: ClipState } | { blocked: true };

/** What a direct edit of `clip` in the preview at `time` changes: the target of the tween whose
 * end state is being edited; else the keyframe in effect at the playhead — unless the clip is
 * locked and that keyframe belongs to a transformation. */
export function previewEdit(
  clip: Clip,
  time: number,
  editing: TransformEditTarget | null,
  unlocked: readonly ClipId[],
): PreviewEdit {
  if (editing && editing.clipId === clip.id) {
    const found = actionStates(clip).find((s) => s.action.id === editing.actionId);
    if (found) return { ref: { kind: 'action', actionId: found.action.id }, state: found.to };
  }
  const at = keyframeAt(clip, time);
  if (at.ref.kind === 'action' && !unlocked.includes(clip.id)) return { blocked: true };
  return at;
}

/** Lock the clip again, or — after a warning — unlock it. */
export async function toggleTransformLock(clip: Clip, name: string): Promise<void> {
  const store = useTransformEdit.getState();
  if (store.unlocked.includes(clip.id)) {
    store.setUnlocked(clip.id, false);
    return;
  }
  const ok = await confirmDialog({
    title: `Unlock “${name}” after its transformations?`,
    message:
      'Unlocked, dragging or scaling this formula in the preview after one of its transformations ' +
      'changes the end state of that transformation (the keyframe at the playhead), which is easy ' +
      'to do by accident. Be careful. The start and end icons of a transform block work either way.',
    confirmLabel: 'Unlock',
    tone: 'danger',
  });
  if (ok) useTransformEdit.getState().setUnlocked(clip.id, true);
}
