/* Braces on the timeline (D66): adding one on glyphs of a clip — from the preview's and the
 * clip's menus — pointing a side, adding a label at its tip (D69), and editing an attachment in
 * the Animations panel: a brace's direction, gap, sharpness and colour, a `next_to` object's side
 * and gap, a label's gap, and Detach, which frees the object where it is. The shapes
 * (`shapeActions.ts`) share the pure creation rules in `attachmentCreation.ts`. Each action is
 * one undo step; the attach sync fits and places what hangs on something (`store/attachSync.ts`).
 * Adding plans with the project — how long the new clip lasts, on which track —, so it gives up a
 * drag still held before it reads it (`history.cancelForeignGesture`). */
import {
  attachTargets,
  BRACE_SIDE_DEGREES,
  KINDS,
  type AttachSide,
  type AttachTarget,
  type Clip,
  type ClipId,
  type FormulaId,
  type GlyphTarget,
  type Project,
} from '../../model';
import { history, useProjectStore, useUiStore } from '../../store';
import { announce } from '../announcer';
import { openFormulaEditor } from '../creator/formulaEditorStore';
import { usePanels } from '../panelsStore';
import { usePreferences } from '../preferences';
import { getActivePalette } from '../colors/paletteStore';
import { describeTargets } from './attachNames';
import {
  applyAttachmentCreation,
  planBraceCreation,
  planBraceLabelCreation,
  planSpanningBrace,
  type LabelKind,
} from './attachmentCreation';

export {
  isBraceClip,
  LABEL_KINDS,
  planSpanningBrace,
  type LabelKind,
  type SpanningBrace,
} from './attachmentCreation';

/** The four sides a menu offers, in its order, and what it calls them. */
export const BRACE_SIDES: readonly AttachSide[] = ['down', 'up', 'left', 'right'];
export const SIDE_LABELS: Readonly<Record<AttachSide, string>> = {
  down: 'Below',
  up: 'Above',
  left: 'Left',
  right: 'Right',
};

/** The clips hanging at the tip of the brace of clip `braceClipId`, in the project's order. */
export function labelsOf(project: Project, braceClipId: ClipId): Clip[] {
  return project.clips.filter((c) => c.attach?.rule === 'tip' && c.attach.clipId === braceClipId);
}

/** Add a brace on `glyphs` of the object of clip `clipId`, pointing `direction` (degrees from
 * DOWN; a side's are `BRACE_SIDE_DEGREES`): a brace object named after its kind and its clip,
 * attached with the brace rule, over `attachedClipWindow`, on the nearest free track (a new one
 * above the target's when none has room), with no intro; selected afterwards, as one
 * undo step. With `also`, one brace over those glyphs and the glyphs of the other clips it names
 * (D117), as Manim's `Brace(VGroup(…))`. Returns the clip's id, or null when a target is gone. */
export function addBrace(
  clipId: ClipId,
  glyphs: GlyphTarget,
  direction: number,
  also: readonly AttachTarget[] = [],
): ClipId | null {
  history.cancelForeignGesture();
  const state = useProjectStore.getState();
  const preferences = usePreferences.getState();
  const plan = planBraceCreation(
    state.project,
    clipId,
    glyphs,
    direction,
    useUiStore.getState().time,
    {
      introDuration: preferences.intro.duration,
      standardScale: preferences.standardScale,
      colors: getActivePalette()?.source.colors,
    },
    also,
  );
  if (!plan) return null;
  const { formula, clip, targetName } = plan;
  state.update((draft) => applyAttachmentCreation(draft, plan));
  useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
  announce(`Brace ${formula.name} added on ${targetName}`);
  return clip.id;
}

/** One brace over the whole of each of the clips `clipIds`, pointing `direction`
 * (`planSpanningBrace`, D123): read from the project as it is now, so a menu that stayed open
 * while a clip went adds nothing. Returns the new clip's id, or null when there is none. */
export function addBraceOverClips(clipIds: readonly ClipId[], direction: number): ClipId | null {
  history.cancelForeignGesture();
  const plan = planSpanningBrace(
    useProjectStore.getState().project,
    clipIds,
    useUiStore.getState().time,
  );
  return plan?.ok ? addBrace(plan.clipId, 'all', direction, plan.also) : null;
}

/** Add a label at the tip of the brace of clip `braceClipId` (D69): an empty object of `kind` named
 * after its kind, its clip over `labelClipWindow` on the nearest free track (a new one above the
 * brace's when none has room), fading in, attached with the tip rule at Manim's gap; selected, as
 * one undo step, and opened in its editor to be typed (the Creator unfolds for it): the formula
 * editor, or the composition workspace for a LaTeX text.
 * Returns the clip's id, or null when the clip is not a brace's. */
export function addBraceLabel(braceClipId: ClipId, kind: LabelKind): ClipId | null {
  history.cancelForeignGesture();
  const state = useProjectStore.getState();
  const preferences = usePreferences.getState();
  const plan = planBraceLabelCreation(
    state.project,
    braceClipId,
    kind,
    useUiStore.getState().time,
    {
      introDuration: preferences.intro.duration,
      standardScale: preferences.standardScale,
      colors: getActivePalette()?.source.colors,
    },
  );
  if (!plan) return null;
  const { formula, clip, targetName } = plan;
  state.update((draft) => applyAttachmentCreation(draft, plan));
  useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
  const panels = usePanels.getState();
  if (panels.collapsed.creator) panels.toggle('creator');
  openFormulaEditor(formula.id, true, clip.id);
  announce(
    `${KINDS[kind].label} ${formula.name} added at the tip of ${targetName}: type it in the editor`,
  );
  return clip.id;
}

/** Edit the attachment of a clip as one undo step (nothing when it has none). */
function editAttach(clipId: ClipId, recipe: (attach: NonNullable<Clip['attach']>) => void): void {
  useProjectStore.getState().update((draft) => {
    const clip = draft.clips.find((c) => c.id === clipId);
    if (clip?.attach) recipe(clip.attach);
  });
}

/** Point a brace in `direction`, degrees counter-clockwise from DOWN. */
export function setBraceDirection(clipId: ClipId, direction: number): void {
  editAttach(clipId, (attach) => {
    if (attach.rule === 'brace') attach.direction = direction;
  });
}

/** Put a `next_to` object on `side` of its target. */
export function setAttachSide(clipId: ClipId, side: AttachSide): void {
  editAttach(clipId, (attach) => {
    if (attach.rule === 'next_to') attach.side = side;
  });
}

/** The gap between the target and the object, in scene units. */
export function setAttachBuff(clipId: ClipId, buff: number): void {
  editAttach(clipId, (attach) => {
    attach.buff = buff;
  });
}

/** The gap between a brace's tip and a label hanging there; null: the gap Manim's `get_tex` leaves
 * (`BRACE_LABEL_BUFF`). */
export function setLabelBuff(clipId: ClipId, buff: number | null): void {
  editAttach(clipId, (attach) => {
    if (attach.rule === 'tip') attach.buff = buff;
  });
}

/** ManimCE's sharpness of a brace object. */
export function setBraceSharpness(formulaId: FormulaId, sharpness: number): void {
  useProjectStore.getState().update((draft) => {
    const formula = draft.formulas.find((f) => f.id === formulaId);
    if (formula?.kind === 'brace') formula.sharpness = sharpness;
  });
}

/** Free an attached object where it is: it keeps its place (a brace its shape) and moves like
 * any clip from now on. */
export function detachClip(clipId: ClipId): void {
  const { project } = useProjectStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip?.attach) return;
  const name = project.formulas.find((f) => f.id === clip.formulaId)?.name ?? 'The object';
  useProjectStore.getState().update((draft) => {
    const target = draft.clips.find((c) => c.id === clipId);
    if (target) target.attach = null;
  });
  announce(`${name} detached: it stays where it is and moves freely now`);
}

/** "Attached to f1 · glyphs 2, 3, 4", "At the tip of b1": what an attachment hangs on, for the
 * panel and hints — each clip with its glyphs, "f1 · glyphs 2, 3, 4 and f2 · glyph 0", for a
 * brace or a shape over glyphs of several; a shape it hangs on is named alone, "s1": it is one
 * piece (D123). */
export function describeAttachment(project: Project, clip: Clip): string | null {
  const attach = clip.attach;
  if (!attach) return null;
  if (attach.rule === 'tip') {
    const brace = project.clips.find((c) => c.id === attach.clipId);
    const name = project.formulas.find((f) => f.id === brace?.formulaId)?.name ?? '?';
    return `At the tip of ${name}`;
  }
  return `Attached to ${describeTargets(project, attachTargets(attach))}`;
}

export { BRACE_SIDE_DEGREES };
