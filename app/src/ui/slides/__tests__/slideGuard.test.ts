// @vitest-environment node
/* The guard of the Slides mode: what is asked when an edit covers a mark, and its two answers. */
import { beforeEach, describe, expect, it } from 'vitest';
import { newlyCoveredMarks, type Project, type SlideMark } from '../../../model';
import { smallProject } from '../../../model/__tests__/fixtures';
import { history, loadProject, useProjectStore } from '../../../store';
import { withServices } from '../../../test/services';
import { useDialogStore } from '../../project/dialogStore';
import {
  coveredLine,
  coveredQuestion,
  KEEP_CHANGE,
  startSlideGuard,
  TAKE_BACK,
} from '../slideGuard';

const pause = (id: string, time: number): SlideMark => ({ id, time, kind: 'pause' });
const comment = (id: string, time: number, text: string): SlideMark => ({
  id,
  time,
  kind: 'comment',
  text,
});

/** `smallProject` — a on [0, 4] and b on [2, 6], with intros and outros of 1 s and a relation over
 * [2, 3): the scene rests over [1, 2] and [4, 5] — with the Slides mode on and these marks. */
function scene(...marks: SlideMark[]): Project {
  const project = smallProject();
  project.slides = { marks };
  return project;
}

const project = () => useProjectStore.getState().project;
const update = useProjectStore.getState().update;
const marks = () => (project().slides?.marks ?? []).map((mark) => mark.id);
const question = () => useDialogStore.getState().queue.at(-1);
/** The guard looks once the writes of a command are made. */
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const answer = async (id: string | null) => {
  const pending = question()!;
  useDialogStore.getState().settle(pending.key, id);
  await settled();
};

/** The first clip starts 1.25 s later: its intro then runs over [1.25, 2.25], on a mark at 1.5 s. */
const delayFirstClip = (draft: Project) => {
  draft.clips[0]!.start = 1.25;
};

describe('newlyCoveredMarks', () => {
  it('names the marks that stood before the change and do not after it', () => {
    const before = scene(pause('p1', 1.5), pause('p2', 4.5), pause('p3', 0.5));
    const after = structuredClone(before);
    delayFirstClip(after); // the intro of a over [1.25, 2.25]
    expect(newlyCoveredMarks(before, after).map(({ mark }) => mark.id)).toEqual(['p1']);
    // Out of place already: the change did nothing to it.
    expect(newlyCoveredMarks(before, before)).toEqual([]);
    // A scene cut short leaves a mark past its end.
    const short = structuredClone(before);
    short.meta.duration = 4.25;
    expect(
      newlyCoveredMarks(before, short).map(({ mark, standing }) => [mark.id, standing]),
    ).toEqual([['p2', 'outside']]);
  });
});

describe('the question of the guard', () => {
  it('names one mark, what it is and what runs there now', () => {
    const before = scene(pause('p1', 1.5));
    const after = structuredClone(before);
    delayFirstClip(after);
    const covered = newlyCoveredMarks(before, after);
    const spec = coveredQuestion(after, covered);
    expect(spec.title).toBe('This change covers a pause');
    expect(spec.details).toEqual(['Pause at 1.50 s — the intro of "a" runs there now']);
    expect(spec.buttons.map((button) => button.label)).toEqual([
      'Take the change back',
      'Delete it and keep the change',
    ]);
    expect(spec.cancelId).toBe(TAKE_BACK);
  });

  it('lists several, a comment with its first words, a mark past the end with where the scene ends', () => {
    const long = `${'A flash over the b, then the whole row turns teal and '.repeat(2)}waits`;
    const before = scene(comment('p1', 1.5, `${long}\nand a second line`), pause('p2', 4.5));
    const after = structuredClone(before);
    delayFirstClip(after);
    after.meta.duration = 4.25;
    const spec = coveredQuestion(after, newlyCoveredMarks(before, after));
    expect(spec.title).toBe('This change covers 2 marks of the Slides mode');
    expect(spec.details).toEqual([
      'Comment at 1.50 s: “A flash over the b, then the whole row turns teal and A fla…” — the intro of "a" runs there now',
      'Pause at 4.50 s — the scene ends at 4.25 s now',
    ]);
    expect(spec.buttons.at(-1)!.label).toBe('Delete them and keep the change');
    expect(coveredLine(after, { mark: comment('p9', 1.5, '  '), standing: 'busy' })).toBe(
      'Comment at 1.50 s — the intro of "a" runs there now',
    );
  });
});

describe('the guard', () => {
  withServices(startSlideGuard);
  beforeEach(() => {
    for (const pending of useDialogStore.getState().queue) {
      useDialogStore.getState().settle(pending.key, null);
    }
  });

  it('asks when an edit covers a mark, and deletes it with the edit in one undo step', async () => {
    loadProject(scene(pause('p1', 1.5), pause('p2', 4.5)));
    await settled();
    const start = project();
    update(delayFirstClip);
    await settled();
    expect(question()?.title).toBe('This change covers a pause');
    await answer(KEEP_CHANGE);
    expect(marks()).toEqual(['p2']);
    expect(project().clips[0]!.start).toBe(1.25);
    expect(question()).toBeUndefined();
    // One undo: the clip is back, and so is the mark.
    history.undo();
    await settled();
    expect(project()).toBe(start);
    expect(history.canUndo()).toBe(false);
    expect(question()).toBeUndefined();
    // And one redo makes both again, with nothing asked: that state was looked at.
    history.redo();
    await settled();
    expect(marks()).toEqual(['p2']);
    expect(project().clips[0]!.start).toBe(1.25);
    expect(question()).toBeUndefined();
  });

  it('takes the edit back for good, on its button and on Escape', async () => {
    for (const id of [TAKE_BACK, null]) {
      loadProject(scene(pause('p1', 1.5)));
      await settled();
      const start = project();
      update(delayFirstClip);
      await settled();
      expect(question()).toBeDefined();
      // Escape gives the dialog's own cancel id; a dialog closed with none is the same answer.
      await answer(id);
      expect(project()).toBe(start);
      expect(history.canRedo()).toBe(false);
      expect(history.canUndo()).toBe(false);
      expect(question()).toBeUndefined();
    }
  });

  it('leaves the steps before the edit alone when it takes it back', async () => {
    loadProject(scene(pause('p1', 1.5)));
    await settled();
    update((draft) => void (draft.meta.name = 'renamed'));
    await settled();
    const renamed = project();
    update(delayFirstClip);
    await settled();
    await answer(TAKE_BACK);
    expect(project()).toBe(renamed);
    expect(history.depth()).toBe(1);
  });

  it('asks nothing of an edit that reaches no mark, nor of a project without marks', async () => {
    loadProject(scene(pause('p1', 1.5)));
    await settled();
    update((draft) => void (draft.clips[1]!.end = 7));
    await settled();
    expect(question()).toBeUndefined();
    loadProject(smallProject());
    await settled();
    update(delayFirstClip);
    await settled();
    expect(question()).toBeUndefined();
  });

  it('asks nothing while a drag runs, and asks when it ends', async () => {
    loadProject(scene(pause('p1', 1.5)));
    await settled();
    const start = project();
    const gesture = history.beginGesture();
    gesture.update(delayFirstClip);
    await settled();
    expect(question()).toBeUndefined();
    // Dragged on, off the mark again: nothing to ask when it ends there.
    gesture.update((draft) => void (draft.clips[0]!.start = 0));
    gesture.end();
    await settled();
    expect(question()).toBeUndefined();

    const again = history.beginGesture();
    again.update(delayFirstClip);
    again.end();
    await settled();
    expect(question()).toBeDefined();
    await answer(TAKE_BACK);
    expect(project().clips[0]!.start).toBe(0);
    expect(project().slides).toEqual(start.slides);
    expect(history.canRedo()).toBe(false);
  });

  it('asks nothing of a drag that is cancelled', async () => {
    loadProject(scene(pause('p1', 1.5)));
    await settled();
    const gesture = history.beginGesture();
    gesture.update(delayFirstClip);
    gesture.cancel();
    await settled();
    expect(question()).toBeUndefined();
    expect(project().clips[0]!.start).toBe(0);
  });

  it('asks nothing of a file that comes with a mark out of place, and only of what an edit covers after', async () => {
    loadProject(scene(pause('p0', 0.5), pause('p1', 1.5)));
    await settled();
    expect(question()).toBeUndefined();
    update(delayFirstClip);
    await settled();
    // p0 was under the intro already (and the edit even freed it): only p1 is asked about.
    expect(question()?.details).toEqual(['Pause at 1.50 s — the intro of "a" runs there now']);
    await answer(KEEP_CHANGE);
    expect(marks()).toEqual(['p0']);
  });

  it('asks nothing of an undo or a redo into a state it looked at', async () => {
    // A file with a mark under the intro; an edit frees it; undo covers it again.
    loadProject(scene(pause('p0', 0.5)));
    await settled();
    update((draft) => void (draft.clips[0]!.start = 0.75));
    await settled();
    expect(question()).toBeUndefined();
    history.undo();
    await settled();
    expect(question()).toBeUndefined();
    history.redo();
    await settled();
    expect(question()).toBeUndefined();
  });

  it('asks once of a command made of several writes, of what it leaves', async () => {
    loadProject(scene(pause('p1', 1.5)));
    await settled();
    // Covered by the first write and freed by the second, in one turn: nothing to ask.
    update(delayFirstClip);
    update((draft) => void (draft.clips[0]!.start = 0));
    await settled();
    expect(question()).toBeUndefined();
    // Two writes that both stay: one question, and taking it back takes both.
    const start = project();
    const depth = history.depth();
    update((draft) => void (draft.meta.name = 'renamed'));
    update(delayFirstClip);
    await settled();
    expect(useDialogStore.getState().queue).toHaveLength(1);
    await answer(TAKE_BACK);
    expect(history.depth()).toBe(depth);
    expect(project()).toBe(start);
  });

  it('deletes what is still covered when a render amended the project meanwhile', async () => {
    loadProject(scene(pause('p1', 1.5), pause('p2', 4.5)));
    await settled();
    update(delayFirstClip);
    await settled();
    useProjectStore.getState().amend((draft) => void (draft.formulas[0]!.name = 'a'));
    await answer(KEEP_CHANGE);
    expect(marks()).toEqual(['p2']);
    history.undo();
    await settled();
    expect(marks()).toEqual(['p1', 'p2']);
    expect(project().clips[0]!.start).toBe(0);
  });

  it('asks nothing once it is stopped', async () => {
    const stop = startSlideGuard();
    stop();
    // The file's own guard still runs: one question, not two.
    loadProject(scene(pause('p1', 1.5)));
    await settled();
    update(delayFirstClip);
    await settled();
    expect(useDialogStore.getState().queue).toHaveLength(1);
    await answer(TAKE_BACK);
  });
});
