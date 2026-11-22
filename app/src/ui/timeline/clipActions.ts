/* The commands of the timeline's clips, each one undo step.
 *
 * Deleting clips (the Delete key, the clips menu, the Animations panel) is at once, as always —
 * but when objects attached to them would go too (deleting a target deletes what hangs on it,
 * `deleteClips`), a confirmation that is held down comes first, as for tracks, relations and
 * formulas, saying how many and which. A brace or a shape over glyphs of several clips stays,
 * detached, and a notice says so (`freedObjects.ts`). A clip whose delete would take a relation
 * with a clip on a locked track with it stays, and a notice says why (D34: such a relation is not
 * deleted).
 *
 * Duplicating clips (Ctrl/⌘+D, Duplicate of their menu) and moving one with the keys (Alt +
 * arrows) plan with the project: where there is room, what the clip may run into. A key can come
 * while the button is still held on a clip — a menu opens from the keyboard too —, so both give
 * that drag up before they read the project (`history.cancelForeignGesture`): the copy, or the
 * frame, is of the clip the drag leaves.
 *
 * Unlinking clips from their formula (Unlink formula, the menus of a clip and of the selected
 * clips) gives them a copy of it, as the Creator's Duplicate makes it (`unlinkClips.ts`). */
import {
  attachTargets,
  clipWindow,
  type Clip,
  type ClipId,
  type FormulaId,
  type Project,
  type Relation,
  type TrackId,
} from '../../model';
import { history, useProjectStore, useUiStore } from '../../store';
import { announce } from '../announcer';
import { addFormulaCopies } from '../creator/formulaActions';
import { confirmDelete } from '../project/dialogStore';
import { currentDocumentCheck } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import { useGlyphPick } from '../preview/glyphPickStore';
import {
  lockedReason,
  lockedTrackOf,
  lockedWindowTimes,
  relationName,
  restoreLockedWindows,
} from '../relations/lockedRelations';
import { fitRelationWindows, restoreWindows } from '../relations/relationOps';
import { round6 } from '../time';
import { audioEditable, duplicateAudioClips } from './audioCommands';
import { nudgedClip, type Nudge } from './keyboardNav';
import { timelineClip, timelineClipName, timelineClips } from './timelineClips';
import {
  attachedClips,
  deleteClips,
  deleteTrack,
  duplicateClips,
  editableClips,
  freedClips,
  heldRelations,
  lockedRelationGoing,
} from './clipOps';
import { freedEnds, reportFreed, reportHeld } from './freedObjects';
import { moveToCopies, planUnlink } from './unlinkClips';

const seconds = (t: number) => `${+t.toFixed(2)} s`;

/** "f2 (1 s–5 s) on Track 2, attached to f1": a line of a confirmation. */
export function describeAttached(project: Project, clip: Clip): string {
  const name = (c: Clip | undefined) =>
    project.formulas.find((f) => f.id === c?.formulaId)?.name ?? '?';
  const track = project.tracks.find((t) => t.id === clip.trackId)?.name ?? 'a track';
  const host = clip.attach ? attachTargets(clip.attach)[0]?.clipId : undefined;
  const target = project.clips.find((c) => c.id === host);
  const { start, end } = clipWindow(clip);
  return `${name(clip)} (${seconds(start)}–${seconds(end)}) on ${track}, attached to ${name(target)}`;
}

/** The clips of `ids` that a delete would take a relation with a clip on a locked track from
 * (`lockedRelationGoing`), each with that relation. */
function keptForLocks(project: Project, ids: Iterable<ClipId>): Map<ClipId, Relation> {
  const kept = new Map<ClipId, Relation>();
  for (const id of ids) {
    const relation = lockedRelationGoing(project, id);
    if (relation) kept.set(id, relation);
  }
  return kept;
}

/** Say which clips a delete left, and why: a relation with a clip on a locked track would have
 * gone with each. */
function reportKept(project: Project, kept: ReadonlyMap<ClipId, Relation>): void {
  if (kept.size === 0) return;
  const name = (id: ClipId) => {
    const clip = timelineClip(project, id);
    return clip ? timelineClipName(project, clip) : '?';
  };
  const what = (relation: Relation) => `The ${relationName(project, relation)} would go with it.`;
  const [first] = kept;
  if (kept.size === 1) {
    const [id, relation] = first!;
    notify({
      kind: 'info',
      title: `“${name(id)}” was not deleted`,
      message: lockedReason(project, relation, what(relation)),
    });
    return;
  }
  notify({
    kind: 'info',
    title: `${kept.size} clips were not deleted`,
    message:
      'A relation with a clip on a locked track would go with each. Unlock the track on the timeline to create, edit or delete relations of its clips.',
    details: [...kept].map(
      ([id, relation]) =>
        `“${name(id)}”: the ${relationName(project, relation)}, track “${lockedTrackOf(project, relation)?.name ?? '?'}”.`,
    ),
  });
}

/** Whether deleting the track `trackId` of `project` is stopped by a relation a locked track holds
 * (`heldRelations`), said in a notice. */
function trackHeld(project: Project, trackId: TrackId): boolean {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track) return false;
  const clips = new Set(project.clips.filter((c) => c.trackId === trackId).map((c) => c.id));
  const held = heldRelations(project, clips);
  if (held.length === 0) return false;
  reportHeld(project, new Map([[`Track “${track.name}”`, held]]), 'tracks');
  return true;
}

/** Delete a track as one undo step, after a confirmation whose button is held: it lists what goes
 * with the track. A track with a clip whose relation a locked track holds stays (D34, D187: such
 * a relation is not deleted), and a notice says why, before any question. Returns true when
 * deleted. */
export async function deleteTrackAsking(trackId: TrackId): Promise<boolean> {
  const sameDocument = currentDocumentCheck();
  const { project, update } = useProjectStore.getState();
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track || trackHeld(project, trackId)) return false;
  const clips = new Set(project.clips.filter((c) => c.trackId === trackId).map((c) => c.id));
  // Objects attached to its clips go too, wherever they are (deleteClips).
  const attached = attachedClips(project, clips);
  const doomed = new Set([...clips, ...attached.map((c) => c.id)]);
  const relations = project.relations.filter(
    (r) => doomed.has(r.fromClipId) || doomed.has(r.toClipId),
  ).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const audioCount = project.audioClips.filter((clip) => clip.trackId === trackId).length;
  const details = [
    audioCount > 0 ? `${plural(audioCount, 'audio clip')} on the timeline.` : null,
    clips.size > 0 ? `Its ${plural(clips.size, 'clip')} on the timeline.` : null,
    attached.length > 0
      ? `${plural(attached.length, 'object')} attached to those clips, on other tracks.`
      : null,
    relations > 0 ? `${plural(relations, 'relation')} of those clips.` : null,
  ].filter((line): line is string => line !== null);
  const ok = await confirmDelete({
    what: 'track',
    title: 'Delete track?',
    message:
      details.length > 0
        ? `“${track.name}” will be deleted together with:`
        : `“${track.name}” will be deleted. It has no clips.`,
    details,
  });
  if (!ok || !sameDocument()) return false;
  // A relation or a lock may have come while the question was open.
  const before = useProjectStore.getState().project;
  if (!before.tracks.some((t) => t.id === trackId) || trackHeld(before, trackId)) return false;
  const freed = freedClips(
    before,
    new Set(before.clips.filter((c) => c.trackId === trackId).map((c) => c.id)),
  );
  update((draft) => deleteTrack(draft, trackId, freedEnds(before)));
  reportFreed(before, freed);
  return true;
}

/** Delete clips as one undo step, after a held confirmation when objects attached to them go too;
 * nothing attached: no question. A clip whose delete would take a relation with a clip on a locked
 * track with it stays (D34: such a relation is not deleted), and a notice says why. The selection
 * is cleared and the deletion announced. Returns true when deleted. */
export async function deleteClipsAsking(asked: ReadonlySet<ClipId>): Promise<boolean> {
  const { project } = useProjectStore.getState();
  const kept = keptForLocks(project, asked);
  reportKept(project, kept);
  const ids = new Set([...asked].filter((id) => !kept.has(id)));
  if (ids.size === 0) return false;
  const attached = attachedClips(project, ids);
  if (attached.length > 0) {
    const one = ids.size === 1;
    const sameDocument = currentDocumentCheck();
    const ok = await confirmDelete({
      what: one ? 'clip' : `${ids.size} clips`,
      title: one ? 'Delete clip?' : `Delete ${ids.size} clips?`,
      message: `${attached.length === 1 ? 'An object is' : `${attached.length} objects are`} attached to ${one ? 'it' : 'them'} and ${attached.length === 1 ? 'goes' : 'go'} with ${one ? 'it' : 'them'}:`,
      details: attached.map((c) => describeAttached(project, c)),
    });
    // The clips that were asked about are of the document that was open then.
    if (!ok || !sameDocument()) return false;
  }
  // Some may have gone while the dialog was open, or been held by a lock since.
  const current = useProjectStore.getState().project;
  const alive = new Set(
    [...ids].filter(
      (id) =>
        timelineClips(current).some(
          (c) => c.id === id && !current.tracks.find((track) => track.id === c.trackId)?.locked,
        ) && lockedRelationGoing(current, id) === null,
    ),
  );
  if (alive.size === 0) return false;
  const total = alive.size + attachedClips(current, alive).length;
  const freed = freedClips(current, alive);
  useProjectStore.getState().update((draft) => deleteClips(draft, alive, freedEnds(current)));
  useUiStore.getState().select({ kind: 'none' });
  announce(total === 1 ? 'Clip deleted' : `${total} clips deleted`);
  reportFreed(current, freed);
  return true;
}

/** Copy the clips of `ids` that can be edited — formulas, objects and audio —, each into the
 * nearest free time after it on its own track (`duplicateClips`, `duplicateAudioClips`), as one
 * undo step; the copies are selected and the copy announced (Duplicate of the clips' menu).
 * Nothing when none of them can be edited. */
export function duplicateClipsById(ids: readonly ClipId[]): void {
  history.cancelForeignGesture();
  const { project, update } = useProjectStore.getState();
  const named = new Set(ids);
  const editable = editableClips(project, ids);
  const audio = project.audioClips.some(
    (clip) => named.has(clip.id) && audioEditable(project, clip),
  );
  if (editable.length === 0 && !audio) return;
  const copies = duplicateClips(project, editable);
  const audioCopies = duplicateAudioClips(project, named);
  update((draft) => {
    draft.clips.push(...copies);
    draft.audioClips.push(...audioCopies);
  });
  useUiStore
    .getState()
    .select({ kind: 'clips', ids: [...copies, ...audioCopies].map((c) => c.id) });
  announce(copies.length === 1 ? 'Clip duplicated' : `${copies.length} clips duplicated`);
}

/** Copy the selected clips, as `duplicateClipsById` does (Ctrl/⌘+D). */
export function duplicateSelectedClips(): void {
  const { selection } = useUiStore.getState();
  if (selection.kind === 'clips') duplicateClipsById(selection.ids);
}

/** Unlink formula (make a copy): the clips of `ids` that can be unlinked leave their formula for a
 * copy of it (`planUnlink`) — one copy per formula, shared by its clips among them —, made as the
 * Creator's Duplicate makes it (`addFormulaCopies`: after the original in the list and in its
 * group, with the original's render), as one undo step. The copy has the original's glyphs, so
 * nothing else of the clips changes, and glyphs picked on them stay picked. The selection stays;
 * a selected clip on a locked track keeps its formula, and a notice says so. Announced. Returns
 * original id → copy id; empty when nothing was unlinked. */
export function unlinkClipsById(ids: readonly ClipId[]): Map<FormulaId, FormulaId> {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  const plan = planUnlink(project, ids);
  const made = new Map<FormulaId, FormulaId>();
  if (plan.moves.length === 0) return made;
  const pick = useGlyphPick.getState().current();
  const copies = addFormulaCopies(
    plan.moves.map((move) => move.formulaId),
    (draft, copies) => moveToCopies(draft, plan.moves, copies),
  );
  for (const [id, copy] of copies) made.set(id, copy.id);
  // What is picked on a clip that went to a copy is the same glyphs of the copy: the pick, which
  // lost its owner with the formula of its clip, is taken again for it.
  const moved = new Set(plan.moves.flatMap((move) => move.clipIds));
  if (pick?.parts.some((part) => moved.has(part.clipId))) {
    useGlyphPick.getState().set({
      parts: pick.parts.map((part) =>
        moved.has(part.clipId) ? { ...part, revision: undefined } : part,
      ),
    });
  }
  const nameOf = (id: FormulaId | undefined) =>
    useProjectStore.getState().project.formulas.find((f) => f.id === id)?.name ?? '?';
  const what = plan.moves
    .map((move) => `${nameOf(made.get(move.formulaId))}, a copy of ${nameOf(move.formulaId)}`)
    .join('; ');
  announce(`${moved.size === 1 ? 'Clip' : `${moved.size} clips`} unlinked: ${what}`);
  if (plan.locked.length > 0) {
    notify({
      kind: 'info',
      title: plan.locked.length === 1 ? '1 clip stayed' : `${plan.locked.length} clips stayed`,
      message: 'A clip on a locked track keeps its formula.',
    });
  }
  return made;
}

/** Move the clip `dt` seconds along its track, or `dTrack` rows up (−1) or down (+1), constrained
 * like a drag (`nudgedClip`), as one undo step: a relation window moves with its target clip, and
 * one its source no longer covers is fitted (Alt + arrows) — but one a locked track holds stays
 * where it plays, and the clip stops before it would leave it. Where the clip went, or why it
 * stayed; null when it is gone. */
export function nudgeClip(clipId: string, dt: number, dTrack: -1 | 0 | 1): Nudge | null {
  history.cancelForeignGesture();
  const { project, update } = useProjectStore.getState();
  const clip = timelineClip(project, clipId);
  if (!clip) return null;
  const result = nudgedClip(project, clip, dt, dTrack);
  if (!result.ok) return result;
  const lockedTimes = lockedWindowTimes(project);
  update((draft) => {
    const target = timelineClip(draft, clipId);
    if (!target) return;
    target.start = round6(result.start);
    target.end = round6(result.end);
    target.trackId = result.trackId;
    // A window moves with its target clip; one the source no longer covers is fitted.
    restoreWindows(draft, project);
    restoreLockedWindows(draft, lockedTimes);
    fitRelationWindows(draft, [clipId]);
  });
  return result;
}

/** Lock clips in the preview, or unlock them (`Clip.previewLocked`, preview/previewLock.ts): those
 * of `ids` on unlocked tracks whose lock is not that already, as one undo step. A glyph pick on a
 * clip that gets locked goes with it (its glyphs cannot be reached any more). Announced. Returns
 * how many clips changed. */
export function setPreviewLock(ids: readonly ClipId[], locked: boolean): number {
  const { project, update } = useProjectStore.getState();
  const changing = new Set(
    editableClips(project, ids)
      .filter((clip) => (clip.previewLocked === true) !== locked)
      .map((clip) => clip.id),
  );
  if (changing.size === 0) return 0;
  update((draft) => {
    for (const clip of draft.clips) {
      if (!changing.has(clip.id)) continue;
      if (locked) clip.previewLocked = true;
      else delete clip.previewLocked;
    }
  });
  const pick = useGlyphPick.getState();
  if (locked && pick.pick?.parts.some((part) => changing.has(part.clipId))) pick.clear();
  const what = changing.size === 1 ? 'Clip' : `${changing.size} clips`;
  announce(`${what} ${locked ? 'locked' : 'unlocked'} in the preview`);
  return changing.size;
}
