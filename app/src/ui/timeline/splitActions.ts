/* Split at playhead (D169): the S key, «Split at playhead (S)» in the menu of a clip, of the
 * selected clips and of a sound, and the Split button of a sound's properties. The clips the
 * playhead is inside are cut in two there, those of the scene (`splitClips.ts`: the second half
 * becomes a clip of a copy of its formula) and those of the sound alike, as one undo step; the
 * halves are selected. A clip of the scene that cannot be cut — something crosses the playhead,
 * or its second half could not start as the object is then — stays whole, and a notice says why
 * (one notice for all of them).
 *
 * S is also what switches the Preview's circle selector (`project/shortcuts.ts`): it splits while
 * a sound is selected, as it always did, and while a selected clip of the scene has the playhead
 * inside — unless the keyboard is in the Preview, where the key stays the selector's
 * (`splitKeyApplies`). Pressed in an open menu, S is the menu's and does neither: the two
 * listeners ask `inOpenMenu` before this. */
import type { ClipId, Project } from '../../model';
import { history, useProjectStore, useRenderStore, useUiStore, type Selection } from '../../store';
import { announce } from '../announcer';
import { validateFormulaName } from '../creator/formulaActions';
import { usePreferences } from '../preferences';
import { useGlyphPick } from '../preview/glyphPickStore';
import { notify } from '../project/noticeStore';
import { audioEditable, selectedEditableAudio, splitAudioAt } from './audioCommands';
import { planSplit, splitCandidates, splitName, type SplitRefusal } from './splitClips';

const isUnlocked = (project: Project, trackId: string) =>
  !project.tracks.find((track) => track.id === trackId)?.locked;

/** The clips of the scene among `ids` that a split at `time` would cut: the playhead strictly
 * inside, on an unlocked track. */
function sceneCuts(project: Project, ids: readonly ClipId[], time: number) {
  return splitCandidates(project, ids, time).filter((clip) => isUnlocked(project, clip.trackId));
}

/** The sounds among `ids` that a split at `time` would cut. */
function soundCuts(project: Project, ids: readonly string[], time: number) {
  const named = new Set(ids);
  return project.audioClips.filter(
    (clip) =>
      named.has(clip.id) && audioEditable(project, clip) && time > clip.start && time < clip.end,
  );
}

/** Whether the keyboard is in the Preview: the last thing clicked was the scene. */
function focusInPreview(): boolean {
  if (typeof document === 'undefined') return false;
  return document.activeElement?.closest('[data-testid="panel-preview"]') != null;
}

/** Whether S splits now, rather than switching the Preview's circle selector: a sound that can
 * be edited is selected (with the playhead outside it a notice says where to put it, as always),
 * or a selected clip of the scene has the playhead inside and the keyboard is not in the
 * Preview. A menu that is open changes nothing here: S pressed in it is the menu's, and goes to
 * neither (`inOpenMenu`, asked first); pressed on what has the focus elsewhere, it does what it
 * does with no menu open. */
export function splitKeyApplies(project: Project, selection: Selection, time: number): boolean {
  if (selection.kind !== 'clips') return false;
  if (selectedEditableAudio(project, selection).length > 0) return true;
  return !focusInPreview() && sceneCuts(project, selection.ids, time).length > 0;
}

/** An entry of a menu: its text, and its tooltip — what it does, or why it is off. */
export interface SplitEntry {
  label: string;
  title: string;
  disabled: boolean;
}

/** «Split at playhead (S)» for the clips of the scene `ids` (the menu of one clip, or of the
 * selected ones): off when the playhead is inside none of them, or only inside clips of locked
 * tracks. Null when none of `ids` is a clip of the scene. */
export function splitEntry(
  project: Project,
  ids: readonly ClipId[],
  time: number,
  suffix: string,
): SplitEntry | null {
  const named = new Set(ids);
  const clips = project.clips.filter((clip) => named.has(clip.id));
  if (clips.length === 0) return null;
  const label = 'Split at playhead (S)';
  const one = clips.length === 1;
  const under = splitCandidates(project, ids, time);
  const cuts = under.filter((clip) => isUnlocked(project, clip.trackId));
  if (cuts.length === 0) {
    const title =
      under.length > 0
        ? one
          ? 'The clip is on a locked track.'
          : 'The clips under the playhead are on locked tracks.'
        : `Place the playhead inside ${one ? 'the clip' : 'one of the clips'} to split it there.`;
    return { label, title, disabled: true };
  }
  const at = `${time.toFixed(2)} s`;
  const nameOf = (formulaId: string) => project.formulas.find((f) => f.id === formulaId)?.name;
  if (cuts.length === 1) {
    const name = nameOf(cuts[0]!.formulaId) ?? '?';
    const copy = splitName(
      name,
      suffix,
      new Set(project.formulas.map((f) => f.name)),
      (candidate) => validateFormulaName(candidate, project.formulas, null) === null,
    );
    return {
      label,
      title: `Cuts the clip in two at the playhead (${at}): the second half becomes a clip of a copy of “${name}”, “${copy}”, that starts as it is then, and editing either no longer changes the other.`,
      disabled: false,
    };
  }
  return {
    label,
    title: `Cuts the ${cuts.length} clips under the playhead in two (${at}): the second half of each becomes a clip of a copy of its formula, that starts as it is then.`,
    disabled: false,
  };
}

/** Say which clips stayed whole, and why: one notice, whatever their number, so that each reason
 * is there to read (a stack of notices keeps the last few alone). */
function reportRefused(refused: readonly SplitRefusal[]): void {
  if (refused.length === 0) return;
  if (refused.length === 1) {
    const [only] = refused;
    notify({ kind: 'warning', title: `“${only!.name}” was not split`, message: only!.reason });
    return;
  }
  notify({
    kind: 'warning',
    title: `${refused.length} clips were not split`,
    message: 'They stay whole:',
    details: refused.map((refusal) => `“${refusal.name}”: ${refusal.reason}`),
  });
}

/** Split at the playhead the clips `ids` — the selected ones when not given —: those of the
 * scene and the sounds the playhead is inside, as one undo step. The halves are selected and the
 * split announced; a clip that could not be split stays, and a notice says why; with nothing to
 * split a notice says where the playhead goes. A drag still held is given up first. Returns
 * whether something was split. The halves are selected along with the clips named that stayed
 * whole. */
export function splitAtPlayhead(ids?: readonly string[]): boolean {
  history.cancelForeignGesture();
  const ui = useUiStore.getState();
  const { project, update } = useProjectStore.getState();
  const named = ids ?? (ui.selection.kind === 'clips' ? ui.selection.ids : []);
  if (named.length === 0) return false;
  const time = ui.time;
  const sounds = soundCuts(project, named, time);
  const cuts = sceneCuts(project, named, time);
  const plan = planSplit(
    project,
    cuts.map((clip) => clip.id),
    time,
    {
      suffix: usePreferences.getState().splitSuffix,
      validName: (name) => validateFormulaName(name, project.formulas, null) === null,
      resolved: useRenderStore.getState().resolved,
    },
  );
  reportRefused(plan.refused);
  if (plan.pieces.length === 0 && sounds.length === 0) {
    if (plan.refused.length === 0) {
      const onlySound = named.every((id) => project.audioClips.some((clip) => clip.id === id));
      notify({
        kind: 'info',
        title: onlySound
          ? 'Place the playhead inside a selected, unlocked audio clip to split it.'
          : 'Place the playhead inside a selected, unlocked clip to split it.',
      });
    }
    return false;
  }
  // Each copy starts with the render of its original: what draws it does not wait for one.
  for (const piece of plan.pieces) {
    useRenderStore.getState().seedCopies(new Map([[piece.sourceId, piece.copy]]));
  }
  const pieces: string[] = [];
  update((draft) => {
    if (plan.pieces.length > 0) {
      draft.clips = plan.project.clips;
      draft.relations = plan.project.relations;
      draft.formulas = plan.project.formulas;
      if (plan.project.formulaGroups) draft.formulaGroups = plan.project.formulaGroups;
    }
    pieces.push(...splitAudioAt(draft, new Set(sounds.map((clip) => clip.id)), time));
  });
  pieces.push(...plan.pieces.flatMap((piece) => [piece.clipId, piece.rightId]));
  // The halves are selected, with what was selected and stayed whole.
  useUiStore.getState().select({ kind: 'clips', ids: [...new Set([...named, ...pieces])] });
  // Glyphs picked on a clip that was cut are those of the first half, which has ended there.
  const split = new Set(plan.pieces.map((piece) => piece.clipId));
  const pick = useGlyphPick.getState();
  if (pick.pick?.parts.some((part) => split.has(part.clipId))) pick.clear();
  const nameOf = (id: string) => project.formulas.find((f) => f.id === id)?.name ?? '?';
  const total = plan.pieces.length + sounds.length;
  announce(
    plan.pieces.length === 1 && sounds.length === 0
      ? `Clip split: ${plan.pieces[0]!.copy.name}, a copy of ${nameOf(plan.pieces[0]!.sourceId)}`
      : total === 1
        ? 'Clip split'
        : `${total} clips split`,
  );
  return true;
}
