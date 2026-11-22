/* Editing animation blocks from the UI: add, duplicate, change the animation of, and delete a
 * block. Each reads the project, plans the edit with the pure functions of blockOps / blockRange
 * and applies it as one undo step. Adding and duplicating select the new block.
 *
 * A command that plans gives up the gesture of another first (`history.cancelForeignGesture`): a
 * key, or a menu opened from the keyboard, can fire it while the button is still held on a clip's
 * edge or on a block, and the plan is for the project that gesture leaves, not for what it showed. */
import {
  animatedWhole,
  clipLifetimes,
  groupMembers,
  groupOf,
  isGroupable,
  namesArrowPart,
  newId,
  runsWith,
  type ActionId,
  type AppearKind,
  type ClipAction,
  type ClipId,
  type DisappearKind,
  type EmphasisKind,
  type GlyphTarget,
  type Project,
  type RelationStyle,
} from '../../model';
import { history, useProjectStore, useUiStore } from '../../store';
import { usePreferences } from '../preferences';
import { confirmDelete } from '../project/dialogStore';
import { currentDocumentCheck } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import { sortedGlyphs } from './blockGlyphs';
import { blockLabel, blockTitle, wholeReason } from './blockKinds';
import { appearChoicesOf, disappearChoicesOf, emphasisChoicesOf } from './catalogue';
import {
  convertBlock,
  convertEmphasis,
  planCopy,
  planGroupCopy,
  planKindChange,
  planNewBlock,
  planParallelCopy,
  playheadBlockNote,
  type NewBlock,
  type Plan,
} from './blockOps';
import { groupLabel } from '../timeline/blockGroups';
import { defaultStyleRefusal } from '../relations/relationActions';
import { useTimelineStore } from '../timeline/timelineStore';
import { clampTiming, findBlock, type Timing } from './blockRange';
import {
  isGlyphBlock,
  splitByParts,
  splitIntoRuns,
  splittableGlyphs,
  type GlyphBlock,
} from './splitBlock';

/** The outcome of an edit that may be refused: the block it made, or why not. */
export type Outcome = { ok: true; actionId: ActionId } | { ok: false; reason: string };

function insert(clipId: ClipId, plan: Plan): Outcome {
  if (!plan.ok) return plan;
  const { action } = plan;
  useProjectStore.getState().update((draft) => {
    const clip = draft.clips.find((c) => c.id === clipId);
    if (!clip) return;
    // A block planned as a piece of another (`Plan.joins`) is grouped with it: in the group the
    // other is in, else in a new one for the two.
    const mate = clip.actions.find((a) => a.id === plan.joins);
    if (mate && isGroupable(mate) && isGroupable(action)) {
      mate.group ??= newId('g');
      clip.actions.push({ ...action, group: mate.group });
    } else {
      clip.actions.push(action);
    }
    clip.actions.sort((a, b) => a.start - b.start);
  });
  useUiStore.getState().select({ kind: 'action', clipId, actionId: action.id });
  return { ok: true, actionId: action.id };
}

/** Add a block at absolute time `at` and select it. A track that is locked takes none. With the
 * "Suggest morph pairs" preference on, a new Morph block comes with the pairs Suggest proposes for
 * it (still one undo step). `atPlayhead` says that `at` is the playhead: a block that had to start
 * elsewhere says so (D171). While a region is marked on the timeline (D180), the block takes the
 * region instead, whatever `at` says, or is refused when it does not fit there. */
export function addBlock(
  clipId: ClipId,
  spec: NewBlock,
  at: number,
  { atPlayhead = false }: { atPlayhead?: boolean } = {},
): Outcome {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  if (isLocked(clipId)) return { ok: false, reason: 'The track of this clip is locked.' };
  const suggestPairs = usePreferences.getState().autoSuggestMorphPairs;
  const region = useTimelineStore.getState().region ?? undefined;
  const plan = planNewBlock(project, clipId, spec, at, { suggestPairs, region });
  const outcome = insert(clipId, plan);
  const moved =
    plan.ok && atPlayhead && !region && playheadBlockNote(project, clipId, spec, plan.action, at);
  if (moved) notify({ kind: 'info', ...moved });
  if (plan.ok && plan.note) notify({ kind: 'info', ...plan.note });
  if (outcome.ok && suggestPairs && plan.ok && plan.action.kind === 'morph') {
    // (A plan with a note of its own has said why it has no pairs.)
    if (plan.action.pairs.length === 0 && !plan.note) {
      notify({
        kind: 'info',
        title: 'No pairs suggested',
        message:
          'Suggest found no pairs for this Morph block where it landed: open Edit pairs… to link them, or move the block.',
      });
    }
  }
  return outcome;
}

/** Copy a block into the nearest free time after it and select the copy. */
export function duplicateBlock(clipId: ClipId, actionId: ActionId): Outcome {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  if (isLocked(clipId)) return { ok: false, reason: 'The track of this clip is locked.' };
  return insert(clipId, planCopy(project, clipId, actionId));
}

/** Copy the group the block is in (every block of it, a group of their own) into the nearest
 * free time after it, and select the copy of the block. */
export function duplicateGroup(clipId: ClipId, actionId: ActionId): Outcome {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  if (isLocked(clipId)) return { ok: false, reason: 'The track of this clip is locked.' };
  const clip = project.clips.find((c) => c.id === clipId);
  const at = clip ? groupMembers(clip, actionId).findIndex((a) => a.id === actionId) : -1;
  const plan = planGroupCopy(project, clipId, actionId);
  if (!plan.ok) return plan;
  useProjectStore.getState().update((draft) => {
    const target = draft.clips.find((c) => c.id === clipId);
    if (!target) return;
    target.actions.push(...plan.actions);
    target.actions.sort((a, b) => a.start - b.start);
  });
  const selected = plan.actions[Math.max(0, at)]!;
  useUiStore.getState().select({ kind: 'action', clipId, actionId: selected.id });
  return { ok: true, actionId: selected.id };
}

/** Copy a block for the glyphs it does not animate, alongside it (planParallelCopy), and select
 * the copy; a note says when it had to go elsewhere. Alongside, the copy is grouped with it. */
export function duplicateBlockForOthers(clipId: ClipId, actionId: ActionId): Outcome {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  if (isLocked(clipId)) return { ok: false, reason: 'The track of this clip is locked.' };
  const plan = planParallelCopy(project, clipId, actionId);
  const outcome = insert(clipId, plan);
  if (plan.ok && plan.note) notify({ kind: 'info', ...plan.note });
  return outcome;
}

/** Replace a block by `pieces` — the first keeps its id, the others are new — as one undo step,
 * and select the first new one. Pieces at the block's start keep this order after the sort, so
 * they take the lanes in turn when their group is unfolded. */
function replaceBlock(clipId: ClipId, actionId: ActionId, pieces: readonly ClipAction[]): Outcome {
  useProjectStore.getState().update((draft) => {
    const clip = draft.clips.find((c) => c.id === clipId);
    const index = clip?.actions.findIndex((a) => a.id === actionId) ?? -1;
    if (!clip || index < 0) return;
    clip.actions.splice(index, 1, ...pieces);
    clip.actions.sort((a, b) => a.start - b.start);
  });
  const selected = pieces[1] ?? pieces[0]!;
  useUiStore.getState().select({ kind: 'action', clipId, actionId: selected.id });
  return { ok: true, actionId: selected.id };
}

/** The block, if it names glyphs, with the glyphs a split divides where it is (splitBlock.ts). */
function splittable(
  clipId: ClipId,
  actionId: ActionId,
): { ok: true; action: GlyphBlock; glyphs: number[] } | { ok: false; reason: string } {
  const { project } = useProjectStore.getState();
  if (isLocked(clipId)) return { ok: false, reason: 'The track of this clip is locked.' };
  const found = findBlock(project, clipId, actionId);
  if (!found) return { ok: false, reason: 'That animation no longer exists.' };
  const { clip, action } = found;
  if (!isGlyphBlock(action)) {
    return {
      ok: false,
      reason:
        'Only a block that names glyphs (Appear, Disappear, a part Transform or an Emphasis) can be split.',
    };
  }
  // A block takes an arrow whole (`animatedWhole`, audit A5-07): none of its pieces could.
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  if (formula && animatedWhole(formula)) return { ok: false, reason: wholeReason(formula) };
  return {
    ok: true,
    action,
    glyphs: splittableGlyphs(action, clipLifetimes(project).get(clip.id)),
  };
}

/** Split a block into one block per run of consecutive glyphs, all at its time (one undo step);
 * the block of the second run is selected. */
export function splitBlockIntoRuns(clipId: ClipId, actionId: ActionId): Outcome {
  history.cancelForeignGesture();
  const target = splittable(clipId, actionId);
  if (!target.ok) return target;
  const pieces = splitIntoRuns(target.action, target.glyphs);
  if (!pieces) {
    return {
      ok: false,
      reason: 'The glyphs of this block make a single run: there is nothing to split them into.',
    };
  }
  return replaceBlock(clipId, actionId, pieces);
}

/** Move the chosen glyphs of a block to a new block at its time (one undo step) and select it. */
export function splitBlock(clipId: ClipId, actionId: ActionId, picked: Iterable<number>): Outcome {
  return splitBlockInto(clipId, actionId, [[...picked]]);
}

/** Move the glyphs of each part to a new block at the block's time, one block per part (one undo
 * step), and select the first of them; the glyphs no part names stay in the block (see
 * `splitByParts`). */
export function splitBlockInto(
  clipId: ClipId,
  actionId: ActionId,
  parts: readonly (readonly number[])[],
): Outcome {
  history.cancelForeignGesture();
  const target = splittable(clipId, actionId);
  if (!target.ok) return target;
  const pieces = splitByParts(target.action, target.glyphs, parts);
  if (!pieces) {
    return { ok: false, reason: 'Choose some of the glyphs of the block, but not all of them.' };
  }
  return replaceBlock(clipId, actionId, pieces);
}

/** Make a Transform block a keyframe of the whole formula or a transform of a part (see
 * planKindChange); the block keeps its id and stays selected. */
export function changeBlockKind(
  clipId: ClipId,
  actionId: ActionId,
  kind: 'tween' | 'transform',
): Outcome {
  history.cancelForeignGesture();
  const { project, update } = useProjectStore.getState();
  if (isLocked(clipId)) return { ok: false, reason: 'The track of this clip is locked.' };
  const plan = planKindChange(project, clipId, actionId, kind);
  if (!plan.ok) return plan;
  update((draft) => {
    const clip = draft.clips.find((c) => c.id === clipId);
    const index = clip?.actions.findIndex((a) => a.id === actionId) ?? -1;
    if (!clip || index < 0) return;
    clip.actions[index] = plan.action;
    clip.actions.sort((a, b) => a.start - b.start);
  });
  return { ok: true, actionId };
}

/** Move a block by `frames` frames of the project (Alt+←/→), as far as its allowed range lets
 * it go (blockRange); one undo step. A block on a locked track stays. */
export function nudgeBlock(clipId: ClipId, actionId: ActionId, frames: number): void {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  const found = findBlock(project, clipId, actionId);
  if (!found || isLocked(clipId)) return;
  const { clip, action } = found;
  const delta = frames / project.meta.fps;
  const timing = clampTiming(
    project,
    clip,
    actionId,
    { start: action.start + delta, end: action.start + delta + action.duration },
    'move',
  );
  if (Math.abs(timing.start - action.start) < 1e-9) return;
  setBlockTiming(clipId, actionId, timing);
}

/** Run another animation in a block (see convertBlock). */
export function changeBlockAnimation(
  clipId: ClipId,
  actionId: ActionId,
  kind: 'appear' | 'disappear',
  anim: AppearKind | DisappearKind,
): void {
  history.cancelForeignGesture();
  const { project, update } = useProjectStore.getState();
  const found = findBlock(project, clipId, actionId);
  if (!found || isLocked(clipId)) return;
  const { action } = found;
  if (action.kind !== 'appear' && action.kind !== 'disappear') return;
  // Only what the object takes: a line is never grown nor shrunk, GrowArrow is an arrow's.
  const formula = project.formulas.find((f) => f.id === found.clip.formulaId);
  const choices = kind === 'appear' ? appearChoicesOf(formula) : disappearChoicesOf(formula);
  if (!choices.some((choice) => choice.value === anim)) return;
  const next = convertBlock(action, kind, anim);
  if (next === action) return;
  update((draft) => {
    const actions = draft.clips.find((c) => c.id === clipId)?.actions;
    const i = actions?.findIndex((a) => a.id === actionId) ?? -1;
    if (actions && i >= 0) actions[i] = next;
  });
}

/** Run another effect in an Emphasis block (see convertEmphasis). */
export function changeEmphasisEffect(
  clipId: ClipId,
  actionId: ActionId,
  effect: EmphasisKind,
): void {
  history.cancelForeignGesture();
  const { project, update } = useProjectStore.getState();
  const found = findBlock(project, clipId, actionId);
  if (!found || isLocked(clipId)) return;
  const { action } = found;
  if (action.kind !== 'emphasis') return;
  // Only what the object takes: nothing that scales a line.
  const formula = project.formulas.find((f) => f.id === found.clip.formulaId);
  if (!emphasisChoicesOf(formula).some((choice) => choice.value === effect)) return;
  const next = convertEmphasis(action, effect);
  if (next === action) return;
  update((draft) => {
    const actions = draft.clips.find((c) => c.id === clipId)?.actions;
    const i = actions?.findIndex((a) => a.id === actionId) ?? -1;
    if (actions && i >= 0) actions[i] = next;
  });
}

/** Write a block's timing into the project (one `update`, so inside a gesture it is not yet an
 * undo step). The timing of a block in a group is its group's: every member takes it, in the same
 * step. The clip's actions stay sorted by start. */
export function setBlockTiming(clipId: ClipId, actionId: ActionId, timing: Timing): void {
  useProjectStore.getState().update((draft) => {
    const clip = draft.clips.find((c) => c.id === clipId);
    if (!clip) return;
    for (const action of groupMembers(clip, actionId)) {
      action.start = timing.start;
      action.duration = timing.duration;
    }
    const sorted = clip.actions.every((a, i) => i === 0 || clip.actions[i - 1]!.start <= a.start);
    if (!sorted) clip.actions.sort((a, b) => a.start - b.start);
  });
}

/** Change what a block names (one undo step). A list is stored ascending and without repeats. A
 * block of an arrow takes all of it: a list that names a part of one changes nothing
 * (`namesArrowPart`, audit A5-07). */
export function setBlockGlyphs(clipId: ClipId, actionId: ActionId, glyphs: GlyphTarget): void {
  const { project, update } = useProjectStore.getState();
  const found = findBlock(project, clipId, actionId);
  if (!found || isLocked(clipId)) return;
  const { action } = found;
  if (action.kind === 'tween' || action.kind === 'morph') return; // a morph names pairs
  const next = glyphs === 'all' ? 'all' : sortedGlyphs(glyphs);
  const formula = project.formulas.find((f) => f.id === found.clip.formulaId);
  if (formula && namesArrowPart(formula, next)) return;
  const same =
    Array.isArray(next) && Array.isArray(action.glyphs)
      ? next.length === action.glyphs.length && next.every((g, i) => g === action.glyphs[i])
      : next === action.glyphs;
  if (same || (next === 'all' && action.kind === 'transform')) return;
  update((draft) => {
    const target = draft.clips.find((c) => c.id === clipId)?.actions.find((a) => a.id === actionId);
    if (target && target.kind !== 'tween' && target.kind !== 'morph') {
      target.glyphs = next as never;
    }
  });
}

/** Group the block with the blocks of its clip that run with it — those that start with it and
 * last the same (`runsWith`) — as one undo step: they take its group, else the one any of them
 * is in, else a new one; a group among them joins whole. Nothing happens when no other block
 * runs with it, or on a locked track. */
export function groupBlocks(clipId: ClipId, actionId: ActionId): void {
  if (isLocked(clipId)) return;
  const found = findBlock(useProjectStore.getState().project, clipId, actionId);
  if (!found || runsWith(found.clip, actionId).length === 0) return;
  useProjectStore.getState().update((draft) => {
    const clip = draft.clips.find((c) => c.id === clipId);
    const action = clip?.actions.find((a) => a.id === actionId);
    if (!clip || !action || !isGroupable(action)) return;
    const others = runsWith(clip, actionId);
    const group = action.group ?? others.find((o) => o.group !== undefined)?.group ?? newId('g');
    action.group = group;
    for (const other of others) other.group = group;
  });
}

/** Undo the group the block is in: its members are blocks on their own again, each where it
 * was (one undo step). A block in no group, or on a locked track, stays as it is. */
export function ungroupBlocks(clipId: ClipId, actionId: ActionId): void {
  if (isLocked(clipId)) return;
  const found = findBlock(useProjectStore.getState().project, clipId, actionId);
  if (!found || groupOf(found.action) === undefined) return;
  useProjectStore.getState().update((draft) => {
    const clip = draft.clips.find((c) => c.id === clipId);
    if (!clip) return;
    for (const member of groupMembers(clip, actionId)) {
      if (isGroupable(member)) delete member.group;
    }
  });
}

/** Take one block out of its group (one undo step): the others stay grouped, unless one alone is
 * left, which is then a block on its own too (`model/groups.ts`). */
export function leaveGroup(clipId: ClipId, actionId: ActionId): void {
  if (isLocked(clipId)) return;
  const found = findBlock(useProjectStore.getState().project, clipId, actionId);
  if (!found || groupOf(found.action) === undefined) return;
  useProjectStore.getState().update((draft) => {
    const action = draft.clips.find((c) => c.id === clipId)?.actions.find((a) => a.id === actionId);
    if (action && isGroupable(action)) delete action.group;
  });
}

/** Set the default style of a Morph block's pairs (one undo step), unless it gives the project an
 * error it did not have (`defaultStyleRefusal`, audit A3-04): then nothing changes, and the reason
 * is returned. A block on a locked track stays. */
export function setMorphStyle(clipId: ClipId, actionId: ActionId, style: RelationStyle): Outcome {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  const found = findBlock(project, clipId, actionId);
  if (!found || found.action.kind !== 'morph') {
    return { ok: false, reason: 'That animation no longer exists.' };
  }
  if (isLocked(clipId)) return { ok: false, reason: 'The track of this clip is locked.' };
  if (found.action.style === style) return { ok: true, actionId };
  const after: Project = {
    ...project,
    clips: project.clips.map((clip) =>
      clip.id === clipId
        ? {
            ...clip,
            actions: clip.actions.map((a) => (a.id === actionId ? { ...a, style } : a)),
          }
        : clip,
    ),
  };
  const reason = defaultStyleRefusal(project, after, style);
  if (reason) return { ok: false, reason };
  editBlock(clipId, actionId, (a) => {
    if (a.kind === 'morph') a.style = style;
  });
  return { ok: true, actionId };
}

/** Edit one block with `recipe` (one undo step). */
export function editBlock(
  clipId: ClipId,
  actionId: ActionId,
  recipe: (action: ClipAction) => void,
): void {
  useProjectStore.getState().update((draft) => {
    const action = draft.clips.find((c) => c.id === clipId)?.actions.find((a) => a.id === actionId);
    if (action) recipe(action);
  });
}

export function removeBlock(clipId: ClipId, actionId: ActionId): void {
  useProjectStore.getState().update((draft) => {
    const clip = draft.clips.find((c) => c.id === clipId);
    if (clip) clip.actions = clip.actions.filter((a) => a.id !== actionId);
  });
  const selection = useUiStore.getState().selection;
  if (selection.kind === 'action' && selection.actionId === actionId) {
    useUiStore.getState().select({ kind: 'clips', ids: [clipId] });
  }
}

/** Ask (holding the confirm button, as for tracks, relations and formulas) and delete the block
 * as one undo step. The selection returns to its clip. */
export async function confirmDeleteBlock(clipId: ClipId, actionId: ActionId): Promise<boolean> {
  const found = findBlock(useProjectStore.getState().project, clipId, actionId);
  if (!found || isLocked(clipId)) return false;
  const { clip, action } = found;
  const formula = useProjectStore.getState().project.formulas.find((f) => f.id === clip.formulaId);
  const sameDocument = currentDocumentCheck();
  const ok = await confirmDelete({
    what: 'animation',
    title: 'Delete animation?',
    message: `“${blockLabel(action)}” on ${formula?.name ?? 'the clip'} will be deleted.`,
    details: [blockTitle(action, clip.start).split('\n')[1]!],
  });
  // The block that was asked about is of the document that was open then.
  if (!ok || !sameDocument()) return false;
  // It may have gone, or the track been locked, while the dialog was open.
  if (!findBlock(useProjectStore.getState().project, clipId, actionId) || isLocked(clipId)) {
    return false;
  }
  removeBlock(clipId, actionId);
  return true;
}

/** Delete every block of the group the block is in, as one undo step; the selection returns to
 * the clip. */
export function removeGroup(clipId: ClipId, actionId: ActionId): void {
  const selection = useUiStore.getState().selection;
  let gone: ActionId[] = [];
  useProjectStore.getState().update((draft) => {
    const clip = draft.clips.find((c) => c.id === clipId);
    if (!clip) return;
    gone = groupMembers(clip, actionId).map((a) => a.id);
    clip.actions = clip.actions.filter((a) => !gone.includes(a.id));
  });
  if (selection.kind === 'action' && gone.includes(selection.actionId)) {
    useUiStore.getState().select({ kind: 'clips', ids: [clipId] });
  }
}

/** Ask, as for a block, and delete the group the block is in: all its animations, as one undo
 * step. */
export async function confirmDeleteGroup(clipId: ClipId, actionId: ActionId): Promise<boolean> {
  const found = findBlock(useProjectStore.getState().project, clipId, actionId);
  if (!found || isLocked(clipId)) return false;
  const { clip, action } = found;
  const members = groupMembers(clip, actionId);
  const formula = useProjectStore.getState().project.formulas.find((f) => f.id === clip.formulaId);
  const sameDocument = currentDocumentCheck();
  const ok = await confirmDelete({
    what: 'animation',
    title: 'Delete the group?',
    message: `“${groupLabel(members)}”, a group of ${members.length} animations on ${formula?.name ?? 'the clip'}, will be deleted.`,
    details: [members.map(blockLabel).join(', '), blockTitle(action, clip.start).split('\n')[1]!],
  });
  // The group that was asked about is of the document that was open then.
  if (!ok || !sameDocument()) return false;
  // It may have gone, or the track been locked, while the dialog was open.
  if (!findBlock(useProjectStore.getState().project, clipId, actionId) || isLocked(clipId)) {
    return false;
  }
  removeGroup(clipId, actionId);
  return true;
}

function isLocked(clipId: ClipId): boolean {
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  return project.tracks.find((t) => t.id === clip?.trackId)?.locked ?? false;
}

/** Say why a block could not be added or copied (or, with another `title`, split). */
export function reportRefused(outcome: Outcome, title = 'No room for that animation'): void {
  if (!outcome.ok) notify({ kind: 'warning', title, message: outcome.reason });
}
