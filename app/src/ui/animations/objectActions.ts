/* What the menu of a clip does to it besides its attachment (D118, D120): the animation its
 * clip starts or ends with, taking its animations off, taking its glyph transformations off
 * and, for a brace or a shape, the object's colour. Each is one undo step, and a clip on a
 * locked track stays as it is. The attachment's own edits — a brace's direction, Detach — are
 * `braceActions.ts`. */
import type { Clip, ClipId, IntroKind, OutroKind, Project, Relation } from '../../model';
import { history, useProjectStore, useUiStore } from '../../store';
import { announce } from '../announcer';
import { patchFormula, recordClipIntro } from '../creator/formulaActions';
import { showDialog, type DialogButton } from '../project/dialogStore';
import { notify } from '../project/noticeStore';
import { lockedPhaseReason } from '../relations/lockedRelations';
import { relationLock } from '../relations/relationOps';
import { editableClips } from '../timeline/clipOps';
import { GROW_ARROW, INTRO_CHOICES, OUTRO_CHOICES } from './catalogue';
import { setPhaseKind, type Phase } from './clipEdit';
import { planPhase, type PhasePlan } from './phasePlan';

type Animated = Pick<Clip, 'intro' | 'outro' | 'actions'>;

/** Whether a clip has an animation of its own: an intro, an outro or a block. A Morph block is
 * not one here: it is a transformation of glyphs, which goes with the relations. */
export function clipHasAnimations(clip: Animated): boolean {
  return (
    clip.intro.kind !== 'none' ||
    clip.outro.kind !== 'none' ||
    clip.actions.some((action) => action.kind !== 'morph')
  );
}

/** The relations a clip takes part in, as a source or as a target, that may be removed: one
 * with its other clip on a locked track stays (`relationLock`). */
export function removableRelations(project: Project, clipId: ClipId): Relation[] {
  return project.relations.filter(
    (relation) =>
      (relation.fromClipId === clipId || relation.toClipId === clipId) &&
      relationLock(project, relation) === null,
  );
}

/** Whether a clip has a transformation of glyphs to take off: a relation with another clip
 * that may be removed, or a Morph block. */
export function clipHasTransformations(project: Project, clip: Clip): boolean {
  return (
    clip.actions.some((action) => action.kind === 'morph') ||
    removableRelations(project, clip.id).length > 0
  );
}

/** The clip when it may be edited: it exists and its track is not locked. */
function editable(clipId: ClipId): Clip | undefined {
  return editableClips(useProjectStore.getState().project, [clipId])[0];
}

const nameOf = (project: Project, clip: Clip): string =>
  project.formulas.find((f) => f.id === clip.formulaId)?.name ?? 'the clip';

const labelOf = (phase: Phase, kind: IntroKind | OutroKind): string =>
  (phase === 'intro' ? [...INTRO_CHOICES, GROW_ARROW] : OUTRO_CHOICES).find((c) => c.value === kind)
    ?.label ?? kind;

/** Ask what to do about an animation that runs into what the clip has already: 'whole' to add
 * it as it is, 'fit' to add it as long as fits (when it does), null to leave the clip alone. */
async function askAboutConflicts(
  plan: PhasePlan,
  phase: Phase,
  label: string,
  name: string,
): Promise<'whole' | 'fit' | null> {
  const seconds = (clip: Clip) => `${clip[phase].duration.toFixed(2)} s`;
  const buttons: DialogButton[] = [{ id: 'cancel', label: 'Cancel' }];
  // Over the window of a relation a locked track holds, it cannot go anyway: that stays.
  if (!plan.locked) {
    buttons.push({
      id: 'whole',
      label: 'Add it anyway',
      tone: plan.fitted ? 'default' : 'primary',
    });
  }
  if (plan.fitted) {
    buttons.push({ id: 'fit', label: `Shorten it to ${seconds(plan.fitted)}`, tone: 'primary' });
  }
  const answer = await showDialog({
    title: `${label} runs into what is already there`,
    message: `On “${name}”, the ${label} ${phase} (${seconds(plan.whole)}) would run into:`,
    details: plan.conflicts,
    cancelId: 'cancel',
    buttons,
  });
  return answer === 'whole' || answer === 'fit' ? answer : null;
}

/** Give the clip's intro, or its outro, the animation `kind` at that animation's own length —
 * `'none'` takes it off —, as the Animations panel's select does. When it would run into what
 * the clip has already — a Transform of the whole formula it would cut, a transformation of
 * glyphs, a block or an attached object that needs the same glyphs (`planPhase`) — a dialog
 * says what and the user decides: add it anyway, add it as long as fits, or leave it. Over the
 * window of a relation with a clip on a locked track it is never added anyway: shortened, or not
 * at all (a notice says why when nothing fits). A new intro is also what «Appears with» of the
 * object says from then on (`recordClipIntro`). Resolves to whether the clip changed. */
export async function setClipPhase(
  clipId: ClipId,
  phase: Phase,
  kind: IntroKind | OutroKind,
): Promise<boolean> {
  // What it would run into is asked of the project a drag still held leaves, not of what it shows.
  history.cancelForeignGesture();
  const clip = editable(clipId);
  if (!clip || clip[phase].kind === kind) return false;
  const { project } = useProjectStore.getState();
  const name = nameOf(project, clip);
  const label = labelOf(phase, kind);
  const plan = planPhase(project, clip, phase, kind);
  if (plan.whole[phase].kind !== kind) {
    // `setPhaseKind` left it out: the other animation takes the whole clip.
    notify({
      kind: 'info',
      title: `No room for ${label}`,
      message: `The ${phase === 'intro' ? 'outro' : 'intro'} of “${name}” takes its whole clip.`,
    });
    return false;
  }
  if (plan.locked && !plan.fitted) {
    notify({
      kind: 'info',
      title: `No room for ${label}`,
      message: lockedPhaseReason(project, plan.locked.relation, phase, name),
    });
    return false;
  }
  let duration: number | undefined;
  if (plan.conflicts.length > 0 || plan.locked) {
    const answer = await askAboutConflicts(plan, phase, label, name);
    // Left alone, or the project is another one than the question was about.
    if (answer === null || useProjectStore.getState().project !== project) return false;
    if (answer === 'fit') duration = plan.fitted![phase].duration;
  }
  useProjectStore.getState().update((draft) => {
    const target = draft.clips.find((c) => c.id === clipId);
    if (!target) return;
    setPhaseKind(target, phase, kind, duration);
    if (phase === 'intro') recordClipIntro(draft, target);
  });
  return true;
}

/** A block of the clip that is gone was the selection: its clip is. */
function selectClipInsteadOfBlock(clipId: ClipId): void {
  const { selection, select } = useUiStore.getState();
  if (selection.kind !== 'action' || selection.clipId !== clipId) return;
  const clip = useProjectStore.getState().project.clips.find((c) => c.id === clipId);
  if (clip?.actions.some((action) => action.id === selection.actionId)) return;
  select({ kind: 'clips', ids: [clipId] });
}

/** Take the animations off a clip: its intro, its outro and its blocks — but the Morph blocks,
 * which are transformations of glyphs (`removeClipTransformations`), and its relations stay.
 * The object is then on screen as it is from the start of its clip to its end, and «Appears
 * with» says so. Announced. Whether it had any. */
export function removeClipAnimations(clipId: ClipId): boolean {
  const clip = editable(clipId);
  if (!clip || !clipHasAnimations(clip)) return false;
  const { project, update } = useProjectStore.getState();
  update((draft) => {
    const target = draft.clips.find((c) => c.id === clipId);
    if (!target) return;
    target.actions = target.actions.filter((action) => action.kind === 'morph');
    setPhaseKind(target, 'intro', 'none');
    setPhaseKind(target, 'outro', 'none');
    recordClipIntro(draft, target);
  });
  selectClipInsteadOfBlock(clipId);
  announce(`Animations of ${nameOf(project, clip)} removed`);
  return true;
}

/** Take the transformations of glyphs off a clip: the relations it has with other clips, as
 * source or as target, and its Morph blocks. A relation whose other clip is on a locked track
 * stays, and a notice says so. Announced. Whether it had any to remove. */
export function removeClipTransformations(clipId: ClipId): boolean {
  const clip = editable(clipId);
  const { project, update } = useProjectStore.getState();
  if (!clip || !clipHasTransformations(project, clip)) return false;
  const gone = new Set(removableRelations(project, clipId).map((relation) => relation.id));
  update((draft) => {
    draft.relations = draft.relations.filter((relation) => !gone.has(relation.id));
    const target = draft.clips.find((c) => c.id === clipId);
    if (target) target.actions = target.actions.filter((action) => action.kind !== 'morph');
  });
  const { selection, select } = useUiStore.getState();
  if (selection.kind === 'relation' && gone.has(selection.id)) {
    select({ kind: 'clips', ids: [clipId] });
  }
  selectClipInsteadOfBlock(clipId);
  const name = nameOf(project, clip);
  announce(`Relations of ${name} removed`);
  const stayed = project.relations.filter(
    (relation) =>
      (relation.fromClipId === clipId || relation.toClipId === clipId) && !gone.has(relation.id),
  ).length;
  if (stayed > 0) {
    notify({
      kind: 'info',
      title: stayed === 1 ? '1 relation stayed' : `${stayed} relations stayed`,
      message: `“${name}”: a relation with a clip on a locked track is not removed.`,
    });
  }
  return true;
}

/** The colour of the object of a clip — a brace's, a shape's: every clip of that object shows
 * it, as the colour field of the Animations panel sets it. */
export function setObjectColour(clipId: ClipId, color: string): void {
  const clip = editable(clipId);
  if (clip) patchFormula(clip.formulaId, { color });
}
