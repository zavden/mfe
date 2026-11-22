/* What a move of the preview's selection moves, by the rules of a drag: the clip it starts from
 * — the one pressed, for a drag — and the other selected clips that go along, or why that clip
 * stays, with the notice that says so. A drag (`usePreviewGestures.ts`) and the arrow keys
 * (`nudge.ts`) ask it alike, so that a key moves exactly what a drag would.
 *
 * The clip it starts from does not move when a Transform has carried it to other glyphs (D123),
 * when glyphs place it at the playhead — what it hangs on (D66), the glyph ends of a line (D144)
 * — or when it is locked after its first transformation. The others go along when they are on
 * screen, on unlocked tracks, not locked in the preview, placed by hand, and their keyframe at the
 * playhead can be edited (`startDrag`). */
import { isGlyphEnd, type Clip, type Project, type TweenAction } from '../../model';
import { fitInEffect } from '../../scene';
import { useProjectStore, useUiStore, type Selection } from '../../store';
import { attachHosts, listNames } from '../animations/attachNames';
import { useTransformEdit } from '../animations/transformEdit';
import { notify } from '../project/noticeStore';
import { highlightedClipIds } from '../selection';
import { startDrag, type Drag, type EditContext, type Press } from './gesture';
import { clipsOnScreen } from './interaction';
import { lineEndsHeld } from './lineDraw';
import { previewEditableClips } from './previewLock';

/** Say why a drag did nothing: the clip is locked after its first transformation. */
export function warnLocked(clip: Clip): void {
  const formula = useProjectStore.getState().project.formulas.find((f) => f.id === clip.formulaId);
  notify({
    kind: 'info',
    title: `“${formula?.name ?? 'This formula'}” is locked after its first transformation`,
    message:
      'To change where a transformation ends, select its block on the timeline and click its end ' +
      'icon. To edit freely here, unlock the clip with the padlock on the timeline.',
  });
}

/** Say why a drag did nothing: the clip hangs on another one (D66), or on several (D117). */
export function warnAttached(project: Project, clip: Clip): void {
  const name = project.formulas.find((f) => f.id === clip.formulaId)?.name ?? 'This object';
  const targetName = clip.attach ? listNames(attachHosts(project, clip.attach)) : 'a clip';
  notify({
    kind: 'info',
    title: `Attached to ${targetName} · Detach to move`,
    message:
      clip.attach?.rule === 'ends' ||
      project.formulas.some((f) => f.id === clip.formulaId && f.kind === 'line')
        ? `“${name}” runs between its ends, and one of them is on glyphs. Drag the handles ` +
          'at its ends to move them: onto empty space to free one.'
        : `“${name}” is placed by the glyphs it hangs on. To move it by hand, select it and press ` +
          'Detach in the Animations panel.',
  });
}

/** Whether glyphs place `clip` at the playhead, so that it does not move by hand: what it hangs
 * on — for a line, the ends in effect there: its clip's, or the ones the Transform in effect
 * carried it to (D144). */
export function heldNow(project: Project, clip: Clip): boolean {
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  if (formula?.kind !== 'line') return clip.attach !== null;
  const held = lineEndsHeld(clip, 'playhead');
  return [held.start, held.end].some((end) => end !== null && isGlyphEnd(end));
}

/** Say why a drag did nothing: a Transform carried the shape to other glyphs, which place it. */
export function warnCarried(project: Project, clip: Clip, tween: TweenAction): void {
  const name = project.formulas.find((f) => f.id === clip.formulaId)?.name ?? 'This shape';
  const targetName = tween.fit ? listNames(attachHosts(project, tween.fit)) : 'other glyphs';
  notify({
    kind: 'info',
    title: `Carried to ${targetName} by its Transform`,
    message:
      `“${name}” is placed by the glyphs its Transform took it to. Select that Transform and ` +
      'press Pick again… for another target, or add a Transform after it to move the shape on.',
  });
}

/** The Transform that places `clip` at the playhead by carrying it to other glyphs, if any. */
export const carriedNow = (clip: Clip): TweenAction | null =>
  fitInEffect(clip, useUiStore.getState().time);

/** What a drag may edit now: the playhead, the end state under edit, the unlocked clips. */
export function editContext(): EditContext {
  const { editing: target, unlocked: open } = useTransformEdit.getState();
  return { time: useUiStore.getState().time, editing: target, unlocked: open };
}

/** Why the clip a move starts from stays where it is. */
export type MoveRefusal =
  | { refused: 'carried'; clip: Clip; tween: TweenAction }
  | { refused: 'held'; clip: Clip }
  | { refused: 'blocked'; clip: Clip };

/** The drag of the selection that starts from `clip` — pressed at `press` —, with the selected
 * clips that go along, or why `clip` does not move. */
export function planMove(
  project: Project,
  clip: Clip,
  press: Pick<Press, 'clipId' | 'startScene'>,
  selection: Selection,
  context: EditContext,
): Drag | MoveRefusal {
  // A shape a Transform carried to other glyphs is placed by them while that holds: it does not
  // move by hand (D123), and it is that Transform, not what the shape first hung on, that says so.
  const carried = carriedNow(clip);
  if (carried) return { refused: 'carried', clip, tween: carried };
  // An attached object is placed by what it hangs on: it does not move by hand (D66).
  if (heldNow(project, clip)) return { refused: 'held', clip };
  // The other selected clips move along, when they are on screen, on unlocked tracks and not
  // attached to something.
  const onScreen = new Set(clipsOnScreen(project, context.time));
  const others = previewEditableClips(
    project,
    highlightedClipIds(selection).filter((id) => onScreen.has(id)),
  ).filter((c) => !heldNow(project, c) && !carriedNow(c));
  const drag = startDrag(press, clip, context, others);
  return drag === 'blocked' ? { refused: 'blocked', clip } : drag;
}

/** Say why the clip a move starts from stays: the notice a drag gives. */
export function warnRefusal(project: Project, refusal: MoveRefusal): void {
  if (refusal.refused === 'carried') warnCarried(project, refusal.clip, refusal.tween);
  else if (refusal.refused === 'held') warnAttached(project, refusal.clip);
  else warnLocked(refusal.clip);
}
