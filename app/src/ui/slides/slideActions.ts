/* The commands of the Slides mode (D200): what the View menu, the timeline's toolbar, its ruler
 * and the keys run. Each reads the stores, works the change out with `slideOps.ts` and writes it
 * as one undo step. */
import { marksInOrder, type SlideMarkId, type SlideMarkKind } from '../../model';
import { history, useProjectStore, useUiStore } from '../../store';
import { announce } from '../announcer';
import { confirmDelete, promptDialog } from '../project/dialogStore';
import { currentDocumentCheck } from '../project/documentStore';
import { notify } from '../project/noticeStore';
import {
  addRefusal,
  commentWordsIssue,
  createMark,
  markClock,
  markStep,
  markTitle,
  MAX_MARK_WORDS,
  markWords,
  noWaitReason,
  pausesAfterAnimations,
  keepEveryWait,
  refusalNotice,
  restsBetweenAnimations,
  skipEveryWait,
  slidesOffBlocker,
  turnSlidesOff,
  turnSlidesOn,
  rulerSpot,
  waitToSkip,
  withMarkAdded,
  withMarkMoved,
  withMarkWords,
  withoutPauses,
  withSkipWait,
  withSkipWaits,
} from './slideOps';

/** Give the keyboard's focus to a mark on the ruler, once it is drawn (the timeline draws the
 * marks of the project the store holds). */
export function focusSlideMark(id: SlideMarkId): void {
  if (typeof document === 'undefined') return;
  const focus = () =>
    document
      .querySelector<HTMLElement>(`[data-testid="timeline-ruler"] [data-mark-id="${id}"]`)
      ?.focus();
  // After the render the write makes.
  if (typeof requestAnimationFrame === 'undefined') focus();
  else requestAnimationFrame(focus);
}

/** Turn the Slides mode on, or off: the project gets its marks of the mode — none yet — or loses
 * the field. Off only once every pause and comment is deleted (the owner's rule): until then a
 * notice says what holds it on, and nothing changes. Whether it changed. */
export function toggleSlides(): boolean {
  // What a drag has moved so far is not what the command decides with.
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  if (!project.slides) {
    const slides = turnSlidesOn(project).slides;
    useProjectStore.getState().update((draft) => {
      draft.slides = slides;
    });
    announce('Slides mode on');
    return true;
  }
  const blocker = slidesOffBlocker(project);
  if (blocker !== null) {
    notify({ kind: 'info', title: 'Slides stays on', message: blocker });
    return false;
  }
  if (turnSlidesOff(project) === project) return false;
  useProjectStore.getState().update((draft) => {
    delete draft.slides;
  });
  announce('Slides mode off');
  return true;
}

/** Whether a mark of `kind` can be put at `time` of the project the store holds; when it cannot,
 * a notice says why — and a pause already on that frame takes the focus. */
function placeable(kind: SlideMarkKind, time: number): boolean {
  const refusal = addRefusal(useProjectStore.getState().project, kind, time);
  if (!refusal) return true;
  notify({ kind: 'info', ...refusalNotice(kind, time, refusal) });
  if (refusal.kind === 'twice') focusSlideMark(refusal.existing.id);
  return false;
}

/** Write a new mark, as one undo step, and give it the focus. */
function writeMark(kind: SlideMarkKind, time: number, text?: string): SlideMarkId {
  const mark = createMark(kind, time, text);
  useProjectStore.getState().update((draft) => {
    if (draft.slides) draft.slides.marks = withMarkAdded(draft.slides.marks, mark);
  });
  announce(`${kind === 'pause' ? 'Pause' : 'Comment'} added at ${markClock(time)}`);
  focusSlideMark(mark.id);
  return mark.id;
}

/** Add a pause at `time` (seconds, on a frame), where the scene rests: the exported page stops
 * there. Not where something animates, nor on a frame that has a pause: a notice says why. The
 * new pause's id, or null. */
export function addPause(time: number): SlideMarkId | null {
  history.cancelForeignGesture();
  if (!placeable('pause', time)) return null;
  return writeMark('pause', time);
}

/** Add a comment at `time`: its words are asked for first (several lines), and a comment is not
 * kept without them. Where the scene rests only, as a pause. The new comment's id, or null when
 * it is not added. */
export async function addComment(time: number): Promise<SlideMarkId | null> {
  history.cancelForeignGesture();
  if (!placeable('comment', time)) return null;
  const sameDocument = currentDocumentCheck();
  const text = await promptDialog({
    title: `Comment at ${markClock(time)}`,
    message:
      'What is to be done here after the export: the exported Python and the exported web page carry it.',
    label: 'Comment',
    value: '',
    multiline: true,
    maxLength: MAX_MARK_WORDS,
    validate: commentWordsIssue,
    confirmLabel: 'Add comment',
  });
  // The words were for the document they were asked in. That one may have changed while they
  // were written: the time is asked about again.
  if (text === null || !sameDocument() || !placeable('comment', time)) return null;
  return writeMark('comment', time, text);
}

/** Add a pause after every animation that another follows (View ▸ Add a pause after every
 * animation, and the ruler's menu): for a long scene, every place a talk could stop at once, as
 * one undo step — the ones not wanted are then deleted one by one. A rest that has a pause keeps
 * it and gets no other, so the command can be run again after more work on the scene. A notice
 * says how many were added, or why none was; the first one added has the focus. How many. */
export function addPausesAfterAnimations(): number {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  if (!project.slides) return 0;
  const added = pausesAfterAnimations(project);
  if (added.length === 0) {
    notify({
      kind: 'info',
      title: 'No pause to add',
      message:
        restsBetweenAnimations(project).length === 0
          ? 'A pause goes where an animation ends and another follows: this scene has no such place.'
          : 'Every place where an animation ends and another follows has its pause already.',
    });
    return 0;
  }
  useProjectStore.getState().update((draft) => {
    if (draft.slides) {
      draft.slides.marks = marksInOrder({ slides: { marks: [...draft.slides.marks, ...added] } });
    }
  });
  const count = `${added.length} ${added.length === 1 ? 'pause' : 'pauses'}`;
  notify({
    kind: 'info',
    title: `Added ${count}`,
    message:
      'One where each animation ends and another follows. Delete the ones you do not want: ' +
      'Tab reaches the marks one by one and Delete removes the one that has the focus. ' +
      'Undo takes them all back.',
  });
  announce(`Added ${count}`);
  focusSlideMark(added[0]!.id);
  return added.length;
}

/** «N pauses», «1 pause». */
const pausesCount = (n: number) => `${n} ${n === 1 ? 'pause' : 'pauses'}`;

/** Make the pause `id` skip its wait (`on`) or keep it (D202; «Skip the wait after it» in its
 * menu), as one undo step. A pause with no wait to skip is not set: a notice says why. Whether it
 * changed. */
export function setSkipWait(id: SlideMarkId, on: boolean): boolean {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  const mark = project.slides?.marks.find((m) => m.id === id);
  if (!mark || mark.kind !== 'pause' || (mark.skipWait === true) === on) return false;
  const skipped = on ? waitToSkip(project, mark) : null;
  if (on && skipped === null) {
    notify({
      kind: 'info',
      title: `${markTitle(mark)} has no wait to skip`,
      message: noWaitReason(project, mark) ?? '',
    });
    return false;
  }
  useProjectStore.getState().update((draft) => {
    if (draft.slides) draft.slides.marks = withSkipWait(draft.slides.marks, id, on);
  });
  announce(
    skipped
      ? `${markTitle(mark)} skips its wait: ${markClock(skipped.end - skipped.start)}`
      : `${markTitle(mark)} keeps its wait`,
  );
  return true;
}

/** «Skip the wait at every pause» (View, and the ruler's menu): every pause that has a wait to
 * skip skips it, as one undo step; a pause with none — the instant between two animations, the
 * rest after the last one — is left as it is, and the notice counts those. How many changed. */
export function skipWaitAtEveryPause(): number {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  if (!project.slides) return 0;
  const { set, none } = skipEveryWait(project);
  const pauses = project.slides.marks.filter((mark) => mark.kind === 'pause').length;
  /** What is said of the pauses with no wait to skip, when some have none. */
  const without = none === 0 ? '' : ` ${pausesCount(none)} ${none === 1 ? 'has' : 'have'} none.`;
  if (set.length === 0) {
    notify({
      kind: 'info',
      title: 'No pause changed',
      message:
        pauses === 0
          ? 'This scene has no pause.'
          : none === pauses
            ? `${pauses === 1 ? 'The pause has no' : `None of the ${pausesCount(pauses)} has a`} wait to skip (a pause’s menu says why).`
            : `Every pause with a wait to skip skips it already.${without}`,
    });
    return 0;
  }
  const ids = new Set(set.map((mark) => mark.id));
  useProjectStore.getState().update((draft) => {
    if (draft.slides) draft.slides.marks = withSkipWaits(draft.slides.marks, ids, true);
  });
  const title = `${pausesCount(set.length)} ${set.length === 1 ? 'skips its' : 'skip their'} wait now`;
  notify({
    kind: 'info',
    title,
    message:
      'Where the exported page or the rehearsal stops at one, it goes on where the next animation starts.' +
      (none === 0
        ? ''
        : ` ${pausesCount(none)} with no wait to skip ${none === 1 ? 'stays as it was' : 'stay as they were'}.`) +
      ' Undo takes them all back.',
  });
  announce(title);
  return set.length;
}

/** «Keep the wait at every pause» (View, and the ruler's menu): no pause skips its wait any
 * more, as one undo step. How many changed. */
export function keepWaitAtEveryPause(): number {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  if (!project.slides) return 0;
  const cleared = keepEveryWait(project);
  if (cleared.length === 0) {
    notify({ kind: 'info', title: 'No pause changed', message: 'No pause skips its wait.' });
    return 0;
  }
  const ids = new Set(cleared.map((mark) => mark.id));
  useProjectStore.getState().update((draft) => {
    if (draft.slides) draft.slides.marks = withSkipWaits(draft.slides.marks, ids, false);
  });
  const title = `${pausesCount(cleared.length)} ${cleared.length === 1 ? 'keeps its' : 'keep their'} wait now`;
  notify({
    kind: 'info',
    title,
    message:
      'Where the exported page or the rehearsal stops at one, it plays the rest that follows. ' +
      'Undo takes them all back.',
  });
  announce(title);
  return cleared.length;
}

/** «Delete every pause…» (View, and the ruler's menu): every pause of the project goes, with its
 * note and whether it skips its wait; the comments stay. It asks first, saying how many pauses go
 * and what stays, with the button of a deletion, which is held down (D204); then one undo step
 * brings them back, and the notice says so. The focus goes to the first comment left, or to the
 * mode's button in the timeline's toolbar. How many were deleted. */
export async function deleteEveryPause(): Promise<number> {
  history.cancelForeignGesture();
  const sameDocument = currentDocumentCheck();
  const asked = useProjectStore.getState().project;
  if (!asked.slides) return 0;
  const pauses = asked.slides.marks.filter((mark) => mark.kind === 'pause').length;
  if (pauses === 0) {
    notify({ kind: 'info', title: 'No pause to delete', message: 'This scene has no pause.' });
    return 0;
  }
  const ok = await confirmDelete({
    what: pausesCount(pauses),
    title: 'Delete every pause?',
    message: deleteEveryPauseQuestion(pauses, asked.slides.marks.length - pauses),
  });
  if (!ok || !sameDocument()) return 0;
  // The marks may have changed while the question was open.
  const { project } = useProjectStore.getState();
  if (!project.slides) return 0;
  const left = withoutPauses(marksInOrder(project));
  const deleted = project.slides.marks.length - left.length;
  if (deleted === 0) return 0;
  useProjectStore.getState().update((draft) => {
    if (draft.slides) draft.slides.marks = withoutPauses(draft.slides.marks);
  });
  const title = `Deleted ${pausesCount(deleted)}`;
  const comments = left.length;
  notify({
    kind: 'info',
    title,
    message:
      (comments === 0
        ? ''
        : `The ${comments === 1 ? 'comment stays' : `${comments} comments stay`}. `) +
      'Undo brings the pauses back.',
  });
  announce(title);
  if (left[0]) focusSlideMark(left[0].id);
  else focusSlidesButton();
  return deleted;
}

/** What the question of «Delete every pause…» says: how many pauses go, with what they carry,
 * and how many comments stay. */
export function deleteEveryPauseQuestion(pauses: number, comments: number): string {
  const go =
    pauses === 1
      ? 'The scene has 1 pause: it goes, with its note and whether it skips its wait.'
      : `The scene has ${pauses} pauses: they go, with their notes and whether they skip their wait.`;
  const stay =
    comments === 0 ? '' : ` The ${comments === 1 ? 'comment stays' : `${comments} comments stay`}.`;
  return `${go}${stay} Undo brings ${pauses === 1 ? 'it' : 'them'} back.`;
}

/** Give the focus to the Slides mode's button in the timeline's toolbar, once the render the
 * write makes is done. */
function focusSlidesButton(): void {
  if (typeof document === 'undefined') return;
  const focus = () =>
    document.querySelector<HTMLElement>('[data-testid="timeline-slides"]')?.focus();
  if (typeof requestAnimationFrame === 'undefined') focus();
  else requestAnimationFrame(focus);
}

/** Delete a mark, as one undo step; whether there was one. */
export function deleteMark(id: SlideMarkId): boolean {
  history.cancelForeignGesture();
  const mark = useProjectStore.getState().project.slides?.marks.find((m) => m.id === id);
  if (!mark) return false;
  useProjectStore.getState().update((draft) => {
    if (draft.slides) draft.slides.marks = draft.slides.marks.filter((m) => m.id !== id);
  });
  announce(`${markTitle(mark)} deleted`);
  return true;
}

/** Write the words of a mark — a comment's, a pause's note — in a dialog of several lines, and
 * keep them as one undo step: a pause left without words loses its note; a comment is not kept
 * without them. Whether they changed. */
export async function editMarkWords(id: SlideMarkId): Promise<boolean> {
  history.cancelForeignGesture();
  const mark = useProjectStore.getState().project.slides?.marks.find((m) => m.id === id);
  if (!mark) return false;
  const comment = mark.kind === 'comment';
  const sameDocument = currentDocumentCheck();
  const text = await promptDialog({
    title: comment
      ? `Comment at ${markClock(mark.time)}`
      : `Note of the pause at ${markClock(mark.time)}`,
    message: comment
      ? 'What is to be done here after the export: the exported Python and the exported web page carry it.'
      : 'Words for whoever presents, with this pause of the exported page. Left empty, the pause has none.',
    label: comment ? 'Comment' : 'Note',
    value: mark.text ?? '',
    multiline: true,
    maxLength: MAX_MARK_WORDS,
    validate: comment ? commentWordsIssue : undefined,
    confirmLabel: 'Save',
  });
  // Another document may have a mark of this id: the words were for the one they were asked in.
  if (text === null || !sameDocument()) return false;
  // Read again: the mark may be gone, or changed, while its words were written.
  const now = useProjectStore.getState().project.slides?.marks.find((m) => m.id === id);
  if (!now || (markWords(now) ?? '') === text) return false;
  useProjectStore.getState().update((draft) => {
    if (draft.slides) draft.slides.marks = withMarkWords(draft.slides.marks, id, text);
  });
  announce(
    comment ? `Comment at ${markClock(now.time)} saved` : text ? 'Note saved' : 'Note removed',
  );
  return true;
}

/** Move a mark a frame along (←/→ on it: `direction` -1 or 1), inside the zone it stands in — a
 * mark out of place to the edge of what covers it on that side —, as one undo step; when it does
 * not move, a screen reader is told why. Whether it moved. */
export function stepMark(id: SlideMarkId, direction: 1 | -1): boolean {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  const mark = project.slides?.marks.find((m) => m.id === id);
  if (!mark) return false;
  const step = markStep(project, mark, direction);
  if (step.kind === 'edge') {
    announce(`${markTitle(mark)} stays: ${step.next}`);
    return false;
  }
  if (step.kind === 'pause') {
    announce(`${markTitle(mark)} stays: the pause at ${markClock(step.other.time)} is next`);
    return false;
  }
  useProjectStore.getState().update((draft) => {
    if (draft.slides) draft.slides.marks = withMarkMoved(draft.slides.marks, id, step.time);
  });
  announce(markTitle({ ...mark, time: step.time }));
  // Moved past another mark, it is drawn in another place among them: the focus stays with it.
  focusSlideMark(id);
  return true;
}

/** Where the playhead puts a mark: its time on a frame, held in the pause zone it is in (P and
 * Shift+P, and their entries of the View menu). */
function playheadTime(): number {
  const { project } = useProjectStore.getState();
  return rulerSpot(project, useUiStore.getState().time, project.meta.fps, null).time;
}

/** Add a pause at the playhead (P): only where the scene rests, else a notice names what runs
 * there. Nothing while the Slides mode is off. */
export function addPauseAtPlayhead(): SlideMarkId | null {
  if (!useProjectStore.getState().project.slides) return null;
  return addPause(playheadTime());
}

/** Add a comment at the playhead (Shift+P), its words asked for first; as `addPauseAtPlayhead`. */
export function addCommentAtPlayhead(): Promise<SlideMarkId | null> {
  if (!useProjectStore.getState().project.slides) return Promise.resolve(null);
  return addComment(playheadTime());
}
