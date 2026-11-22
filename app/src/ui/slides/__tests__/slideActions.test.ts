// @vitest-environment node
/* The commands of the Slides mode (D200), run against the stores. */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, type Project, type SlideMark } from '../../../model';
import { smallProject } from '../../../model/__tests__/fixtures';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { useAnnouncer } from '../../announcer';
import { useDialogStore } from '../../project/dialogStore';
import { useDocumentStore } from '../../project/documentStore';
import { useNoticeStore } from '../../project/noticeStore';
import {
  addComment,
  addCommentAtPlayhead,
  addPause,
  addPauseAtPlayhead,
  addPausesAfterAnimations,
  deleteEveryPause,
  deleteEveryPauseQuestion,
  deleteMark,
  editMarkWords,
  keepWaitAtEveryPause,
  setSkipWait,
  skipWaitAtEveryPause,
  stepMark,
  toggleSlides,
} from '../slideActions';

const slides = () => useProjectStore.getState().project.slides;
const notices = () =>
  useNoticeStore.getState().notices.map(({ title, message }) => [title, message]);

beforeEach(() => {
  loadProject(createEmptyProject('test'));
  useNoticeStore.getState().clear();
  useDialogStore.setState({ queue: [] });
});

/** `smallProject` (the scene rests over [1, 2] and [4, 5], and at 0, 3 and 6 s) with the Slides
 * mode on and these marks, loaded. */
function open(...marks: SlideMark[]): void {
  const project: Project = smallProject();
  project.slides = { marks };
  loadProject(project);
}
const marks = () => useProjectStore.getState().project.slides?.marks ?? [];
const question = () => useDialogStore.getState().queue.at(-1);

/** Another document takes the place of the one that is open, as File → Open… does: the same
 * scene with these marks, so with the ids of the first one. The project it holds. */
function openAnother(...others: SlideMark[]): Project {
  open(...others);
  const { project } = useProjectStore.getState();
  useDocumentStore.getState().beginDocument(project, { fileName: null, handle: null });
  return project;
}

describe('toggleSlides', () => {
  it('gives the project the mode with no mark, and takes it away: a step each', () => {
    expect(slides()).toBeUndefined();
    expect(toggleSlides()).toBe(true);
    expect(slides()).toEqual({ marks: [] });
    expect(useAnnouncer.getState().text).toBe('Slides mode on');
    expect(toggleSlides()).toBe(true);
    expect('slides' in useProjectStore.getState().project).toBe(false);
    expect(useAnnouncer.getState().text).toBe('Slides mode off');
    history.undo();
    expect(slides()).toEqual({ marks: [] });
    history.undo();
    expect(slides()).toBeUndefined();
    expect(history.canUndo()).toBe(false);
  });

  it('stays on while a mark is there: a notice says why, and nothing changes', () => {
    toggleSlides();
    useProjectStore.getState().update((draft) => {
      draft.slides!.marks.push({ id: 'p1', time: 0, kind: 'pause' });
    });
    const before = useProjectStore.getState().project;
    expect(toggleSlides()).toBe(false);
    expect(useProjectStore.getState().project).toBe(before);
    expect(notices()).toEqual([
      ['Slides stays on', 'Delete every pause and comment to turn Slides off (there is 1 pause).'],
    ]);
  });
});

describe('adding and deleting a mark', () => {
  it('adds a pause where the scene rests, in the order of the marks, as one step', () => {
    open({ id: 'p1', time: 4.5, kind: 'pause' });
    const id = addPause(1.5);
    expect(marks().map((m) => [m.id, m.time, m.kind])).toEqual([
      [id, 1.5, 'pause'],
      ['p1', 4.5, 'pause'],
    ]);
    expect(useAnnouncer.getState().text).toBe('Pause added at 1.50 s');
    history.undo();
    expect(marks().map((m) => m.id)).toEqual(['p1']);
  });

  it('refuses a pause where the scene animates or on a frame that has one: a notice says why', () => {
    open({ id: 'p1', time: 1.5, kind: 'pause' });
    expect(addPause(0.5)).toBeNull();
    expect(addPause(1.5)).toBeNull();
    expect(marks().map((m) => m.id)).toEqual(['p1']);
    expect(notices().map(([title]) => title)).toEqual([
      'No pause at 0.50 s',
      'A pause is at 1.50 s already',
    ]);
    expect(history.canUndo()).toBe(false);
  });

  it('asks for the words of a comment first, and adds nothing when they are not given', async () => {
    open();
    const added = addComment(4.25);
    await Promise.resolve();
    const pending = question()!;
    expect(pending.title).toBe('Comment at 4.25 s');
    expect(pending.field).toMatchObject({ multiline: true, maxLength: 2000 });
    expect(pending.field!.validate!('')).toMatch(/needs words/);
    useDialogStore.getState().settle(pending.key, 'confirm', 'Zoom on y\nthen fade');
    const id = await added;
    expect(marks()).toEqual([{ id, time: 4.25, kind: 'comment', text: 'Zoom on y\nthen fade' }]);
    // Cancelled: nothing.
    const cancelled = addComment(1.25);
    await Promise.resolve();
    useDialogStore.getState().settle(question()!.key, 'cancel');
    expect(await cancelled).toBeNull();
    expect(marks()).toHaveLength(1);
  });

  it('asks again of the project when the words come: an edit meanwhile may have covered the time', async () => {
    open();
    const added = addComment(1.5);
    await Promise.resolve();
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.start = 1; // its intro now runs over [1, 2]
    });
    useDialogStore.getState().settle(question()!.key, 'confirm', 'Too late');
    expect(await added).toBeNull();
    expect(marks()).toEqual([]);
    expect(notices().at(-1)?.[0]).toBe('No comment at 1.50 s');
  });

  it('adds no comment to another document that opened while its words were asked for', async () => {
    open();
    const added = addComment(1.5);
    await Promise.resolve();
    const pending = question()!;
    // The scene of the other document rests at 1.5 s too: the time alone would be taken.
    const other = openAnother();
    useDialogStore.getState().settle(pending.key, 'confirm', 'Words for the first document');
    expect(await added).toBeNull();
    expect(useProjectStore.getState().project).toBe(other);
    expect(history.canUndo()).toBe(false);
    expect(notices()).toEqual([]);
  });

  it('deletes a mark as one step', () => {
    open({ id: 'p1', time: 1.5, kind: 'pause' }, { id: 'p2', time: 4.5, kind: 'pause' });
    expect(deleteMark('p1')).toBe(true);
    expect(marks().map((m) => m.id)).toEqual(['p2']);
    expect(useAnnouncer.getState().text).toBe('Pause at 1.50 s deleted');
    expect(deleteMark('p1')).toBe(false);
    history.undo();
    expect(marks().map((m) => m.id)).toEqual(['p1', 'p2']);
  });
});

describe('addPausesAfterAnimations', () => {
  const pause = (id: string, time: number): SlideMark => ({ id, time, kind: 'pause' });
  const comment = (id: string, time: number, text: string): SlideMark => ({
    id,
    time,
    kind: 'comment',
    text,
  });

  it('adds a pause after every animation that another follows, as one step, and says how many', () => {
    open(pause('p1', 4.5), comment('p2', 1, 'here'));
    const before = history.depth();
    expect(addPausesAfterAnimations()).toBe(2);
    expect(marks().map((mark) => [mark.kind, mark.time])).toEqual([
      ['comment', 1],
      ['pause', 1],
      ['pause', 3],
      ['pause', 4.5],
    ]);
    expect(history.depth()).toBe(before + 1);
    expect(notices().at(-1)![0]).toBe('Added 2 pauses');
    expect(useAnnouncer.getState().text).toBe('Added 2 pauses');
    // Again: every rest has its pause.
    expect(addPausesAfterAnimations()).toBe(0);
    expect(history.depth()).toBe(before + 1);
    expect(notices().at(-1)).toEqual([
      'No pause to add',
      'Every place where an animation ends and another follows has its pause already.',
    ]);
    // One step back takes them all away.
    history.undo();
    expect(marks().map((mark) => mark.id)).toEqual(['p1', 'p2']);
  });

  it('says so of a scene with no place for one, and does nothing with the mode off', () => {
    const still = createEmptyProject('still');
    still.slides = { marks: [] };
    loadProject(still);
    expect(addPausesAfterAnimations()).toBe(0);
    expect(notices().at(-1)![0]).toBe('No pause to add');
    expect(notices().at(-1)![1]).toContain('this scene has no such place');
    loadProject(smallProject());
    useNoticeStore.getState().clear();
    expect(addPausesAfterAnimations()).toBe(0);
    expect(notices()).toEqual([]);
    expect(slides()).toBeUndefined();
  });

  it('says «1 pause» of one', () => {
    open(pause('p1', 1), pause('p2', 3));
    expect(addPausesAfterAnimations()).toBe(1);
    expect(notices().at(-1)![0]).toBe('Added 1 pause');
  });
});

describe('editMarkWords', () => {
  it('writes a pause’s note, and takes it away when it is emptied: a step each', async () => {
    open({ id: 'p1', time: 1.5, kind: 'pause' });
    let edited = editMarkWords('p1');
    await Promise.resolve();
    expect(question()!.title).toBe('Note of the pause at 1.50 s');
    expect(question()!.field).toMatchObject({ value: '', multiline: true });
    expect(question()!.field!.validate).toBeUndefined();
    useDialogStore.getState().settle(question()!.key, 'confirm', 'Ask the room');
    expect(await edited).toBe(true);
    expect(marks()).toEqual([{ id: 'p1', time: 1.5, kind: 'pause', text: 'Ask the room' }]);
    edited = editMarkWords('p1');
    await Promise.resolve();
    expect(question()!.field!.value).toBe('Ask the room');
    useDialogStore.getState().settle(question()!.key, 'confirm', '');
    expect(await edited).toBe(true);
    expect(marks()).toEqual([{ id: 'p1', time: 1.5, kind: 'pause' }]);
    expect(useAnnouncer.getState().text).toBe('Note removed');
    history.undo();
    expect(marks()[0]!.text).toBe('Ask the room');
  });

  it('keeps a comment from being emptied, and writes nothing that did not change', async () => {
    open({ id: 'p1', time: 4.5, kind: 'comment', text: 'Zoom' });
    const edited = editMarkWords('p1');
    await Promise.resolve();
    expect(question()!.field!.validate!('')).toMatch(/needs words/);
    useDialogStore.getState().settle(question()!.key, 'confirm', 'Zoom');
    expect(await edited).toBe(false);
    expect(history.canUndo()).toBe(false);
  });

  it('writes nothing when the mark went while its words were written', async () => {
    open({ id: 'p1', time: 4.5, kind: 'comment', text: 'Zoom' });
    const edited = editMarkWords('p1');
    await Promise.resolve();
    deleteMark('p1');
    useDialogStore.getState().settle(question()!.key, 'confirm', 'Zoom out');
    expect(await edited).toBe(false);
    expect(marks()).toEqual([]);
  });

  it('writes nothing in another document that opened meanwhile, though it has a mark of that id', async () => {
    open({ id: 'p1', time: 4.5, kind: 'comment', text: 'First talk' });
    const edited = editMarkWords('p1');
    await Promise.resolve();
    const pending = question()!;
    const other = openAnother({ id: 'p1', time: 4.5, kind: 'comment', text: 'Second talk' });
    useDialogStore.getState().settle(pending.key, 'confirm', 'Words for the first talk');
    expect(await edited).toBe(false);
    expect(useProjectStore.getState().project).toBe(other);
    expect(marks()).toEqual([{ id: 'p1', time: 4.5, kind: 'comment', text: 'Second talk' }]);
    expect(history.canUndo()).toBe(false);
  });

  it('writes the words when the document was edited, not replaced, while they were written', async () => {
    open({ id: 'p1', time: 4.5, kind: 'comment', text: 'Zoom' });
    const edited = editMarkWords('p1');
    await Promise.resolve();
    useProjectStore.getState().update((draft) => {
      draft.meta.name = 'Renamed meanwhile';
    });
    useDialogStore.getState().settle(question()!.key, 'confirm', 'Zoom out');
    expect(await edited).toBe(true);
    expect(marks()[0]!.text).toBe('Zoom out');
  });
});

describe('the keys of the Slides mode', () => {
  it('moves a mark a frame, a step each; at the edge of its zone it says why it stays', () => {
    open({ id: 'p1', time: 1.983333, kind: 'pause' });
    expect(stepMark('p1', 1)).toBe(true);
    expect(marks()[0]!.time).toBe(2);
    expect(useAnnouncer.getState().text).toBe('Pause at 2.00 s');
    expect(stepMark('p1', 1)).toBe(false);
    expect(useAnnouncer.getState().text).toBe('Pause at 2.00 s stays: the intro of "b" runs next');
    history.undo();
    expect(marks()[0]!.time).toBe(1.983333);
  });

  it('adds a pause or a comment at the playhead, where the scene rests', async () => {
    open();
    useUiStore.getState().setTime(4.25);
    const pause = addPauseAtPlayhead();
    expect(marks()).toEqual([{ id: pause, time: 4.25, kind: 'pause' }]);
    const comment = addCommentAtPlayhead();
    await Promise.resolve();
    useDialogStore.getState().settle(question()!.key, 'confirm', 'Then this');
    const id = await comment;
    expect(marks().map((m) => m.id)).toEqual([id, pause]);
    // Where something animates: a notice names it.
    useUiStore.getState().setTime(2.5);
    expect(addPauseAtPlayhead()).toBeNull();
    expect(notices().at(-1)).toEqual([
      'No pause at 2.50 s',
      'The intro of "b" runs then: a pause stands where nothing animates.',
    ]);
    // Off: nothing at all.
    loadProject(smallProject());
    useUiStore.getState().setTime(1.5);
    expect(addPauseAtPlayhead()).toBeNull();
    expect(await addCommentAtPlayhead()).toBeNull();
    expect(useDialogStore.getState().queue).toEqual([]);
  });
});

describe('a pause that skips its wait', () => {
  const pause = (id: string, time: number, extra: Partial<SlideMark> = {}): SlideMark => ({
    id,
    time,
    kind: 'pause',
    ...extra,
  });

  it('sets and clears the flag of one pause, a step each, the field gone when cleared', () => {
    open(pause('p1', 1.5, { text: 'Note' }));
    expect(setSkipWait('p1', true)).toBe(true);
    expect(marks()).toEqual([pause('p1', 1.5, { text: 'Note', skipWait: true })]);
    expect(useAnnouncer.getState().text).toBe('Pause at 1.50 s skips its wait: 0.50 s');
    expect(setSkipWait('p1', true)).toBe(false);
    expect(setSkipWait('p1', false)).toBe(true);
    expect(marks()).toEqual([pause('p1', 1.5, { text: 'Note' })]);
    expect('skipWait' in marks()[0]!).toBe(false);
    expect(useAnnouncer.getState().text).toBe('Pause at 1.50 s keeps its wait');
    history.undo();
    expect(marks()[0]!.skipWait).toBe(true);
    history.undo();
    expect(marks()).toEqual([pause('p1', 1.5, { text: 'Note' })]);
    expect(history.canUndo()).toBe(false);
  });

  it('does not set a pause with no wait to skip: a notice says why', () => {
    open(pause('p1', 3), pause('p2', 6));
    expect(setSkipWait('p1', true)).toBe(false);
    expect(setSkipWait('p2', true)).toBe(false);
    expect(notices()).toEqual([
      [
        'Pause at 3.00 s has no wait to skip',
        'An animation starts at this instant: there is no wait after it to skip.',
      ],
      [
        'Pause at 6.00 s has no wait to skip',
        'No animation follows this pause: the scene only ends after it.',
      ],
    ]);
    expect(history.canUndo()).toBe(false);
    // One that skips with nothing to skip — a clip moved under it — can still be cleared.
    open(pause('p1', 3, { skipWait: true }));
    expect(setSkipWait('p1', false)).toBe(true);
    expect(marks()).toEqual([pause('p1', 3)]);
  });

  it('«Skip the wait at every pause»: those with a wait to skip, as one step, and says how many', () => {
    open(
      pause('p1', 1),
      pause('p2', 3),
      pause('p3', 4.25),
      { id: 'p4', time: 1.5, kind: 'comment', text: 'x' },
      pause('p5', 6),
    );
    const before = history.depth();
    expect(skipWaitAtEveryPause()).toBe(2);
    expect(
      marks()
        .filter((mark) => mark.skipWait)
        .map((mark) => mark.id),
    ).toEqual(['p1', 'p3']);
    expect(history.depth()).toBe(before + 1);
    expect(notices().at(-1)).toEqual([
      '2 pauses skip their wait now',
      'Where the exported page or the rehearsal stops at one, it goes on where the next animation starts. 2 pauses with no wait to skip stay as they were. Undo takes them all back.',
    ]);
    expect(useAnnouncer.getState().text).toBe('2 pauses skip their wait now');
    // Again: nothing more to set.
    expect(skipWaitAtEveryPause()).toBe(0);
    expect(history.depth()).toBe(before + 1);
    expect(notices().at(-1)).toEqual([
      'No pause changed',
      'Every pause with a wait to skip skips it already. 2 pauses have none.',
    ]);
    // «Keep the wait at every pause»: one step back to none.
    expect(keepWaitAtEveryPause()).toBe(2);
    expect(marks().some((mark) => 'skipWait' in mark)).toBe(false);
    expect(notices().at(-1)![0]).toBe('2 pauses keep their wait now');
    expect(keepWaitAtEveryPause()).toBe(0);
    expect(notices().at(-1)).toEqual(['No pause changed', 'No pause skips its wait.']);
    history.undo();
    expect(
      marks()
        .filter((mark) => mark.skipWait)
        .map((mark) => mark.id),
    ).toEqual(['p1', 'p3']);
    history.undo();
    expect(marks().some((mark) => 'skipWait' in mark)).toBe(false);
  });

  it('says so of a scene with no pause, or none with a wait, and does nothing with the mode off', () => {
    open({ id: 'p1', time: 1.5, kind: 'comment', text: 'x' });
    expect(skipWaitAtEveryPause()).toBe(0);
    expect(notices().at(-1)).toEqual(['No pause changed', 'This scene has no pause.']);
    open(pause('p1', 3));
    expect(skipWaitAtEveryPause()).toBe(0);
    expect(notices().at(-1)).toEqual([
      'No pause changed',
      'The pause has no wait to skip (a pause’s menu says why).',
    ]);
    open(pause('p1', 3), pause('p2', 6));
    skipWaitAtEveryPause();
    expect(notices().at(-1)![1]).toBe(
      'None of the 2 pauses has a wait to skip (a pause’s menu says why).',
    );
    open(pause('p1', 1), pause('p2', 6));
    skipWaitAtEveryPause();
    expect(notices().at(-1)).toEqual([
      '1 pause skips its wait now',
      'Where the exported page or the rehearsal stops at one, it goes on where the next animation starts. 1 pause with no wait to skip stays as it was. Undo takes them all back.',
    ]);
    loadProject(smallProject());
    useNoticeStore.getState().clear();
    expect(skipWaitAtEveryPause()).toBe(0);
    expect(keepWaitAtEveryPause()).toBe(0);
    expect(notices()).toEqual([]);
  });
});

describe('deleteEveryPause', () => {
  /** Ask to delete every pause and answer the question with `id`, once it is asked. */
  const deleteAnswering = async (id: 'confirm' | 'cancel'): Promise<number> => {
    const done = deleteEveryPause();
    useDialogStore.getState().settle(question()!.key, id);
    return done;
  };

  it('asks first, then deletes every pause and keeps the comments, as one step', async () => {
    open(
      { id: 'p1', time: 1, kind: 'pause', text: 'Note' },
      { id: 'p2', time: 1.5, kind: 'comment', text: 'Stay' },
      { id: 'p3', time: 4.25, kind: 'pause', skipWait: true },
    );
    const before = history.depth();
    const done = deleteEveryPause();
    // The question: how many go and what stays, with the held button of a deletion.
    const asked = question()!;
    expect(asked.title).toBe('Delete every pause?');
    expect(asked.message).toBe(
      'The scene has 2 pauses: they go, with their notes and whether they skip their wait. ' +
        'The comment stays. Undo brings them back.',
    );
    expect(asked.buttons.map(({ id, label, tone }) => [id, label, tone])).toEqual([
      ['cancel', 'Cancel', undefined],
      ['confirm', 'Hold to delete 2 pauses', 'danger'],
    ]);
    expect(asked.buttons[1]!.holdMs).toBeGreaterThan(0);
    // Nothing is deleted while it is open.
    expect(marks()).toHaveLength(3);
    expect(history.depth()).toBe(before);
    useDialogStore.getState().settle(asked.key, 'confirm');
    expect(await done).toBe(2);
    expect(marks()).toEqual([{ id: 'p2', time: 1.5, kind: 'comment', text: 'Stay' }]);
    expect(useDialogStore.getState().queue).toEqual([]);
    expect(history.depth()).toBe(before + 1);
    expect(notices().at(-1)).toEqual([
      'Deleted 2 pauses',
      'The comment stays. Undo brings the pauses back.',
    ]);
    expect(useAnnouncer.getState().text).toBe('Deleted 2 pauses');
    // Again: none, and no question.
    expect(await deleteEveryPause()).toBe(0);
    expect(useDialogStore.getState().queue).toEqual([]);
    expect(notices().at(-1)).toEqual(['No pause to delete', 'This scene has no pause.']);
    expect(history.depth()).toBe(before + 1);
    history.undo();
    expect(marks().map((mark) => mark.id)).toEqual(['p1', 'p2', 'p3']);
    expect(marks()[2]!.skipWait).toBe(true);
  });

  it('deletes nothing when the answer is no, or the project is another by then', async () => {
    open({ id: 'p1', time: 1, kind: 'pause' }, { id: 'p2', time: 4.5, kind: 'pause' });
    const before = history.depth();
    expect(await deleteAnswering('cancel')).toBe(0);
    expect(marks()).toHaveLength(2);
    expect(history.depth()).toBe(before);
    expect(notices()).toEqual([]);
    // Another project is opened while the question is on screen: its pauses are not the ones
    // that were asked about.
    const done = deleteEveryPause();
    const asked = question()!;
    open({ id: 'q1', time: 1, kind: 'pause' });
    useDocumentStore
      .getState()
      .beginDocument(useProjectStore.getState().project, { fileName: null, handle: null });
    useDialogStore.getState().settle(asked.key, 'confirm');
    expect(await done).toBe(0);
    expect(marks().map((mark) => mark.id)).toEqual(['q1']);
  });

  it('deletes the pauses there are when it is answered: one added meanwhile goes too', async () => {
    open({ id: 'p1', time: 1, kind: 'pause' }, { id: 'p2', time: 1.5, kind: 'comment', text: 'a' });
    const done = deleteEveryPause();
    const asked = question()!;
    useProjectStore.getState().update((draft) => {
      draft.slides!.marks.push({ id: 'p3', time: 4.5, kind: 'pause' });
    });
    useDialogStore.getState().settle(asked.key, 'confirm');
    expect(await done).toBe(2);
    expect(marks().map((mark) => mark.id)).toEqual(['p2']);
  });

  it('says «1 pause», counts the comments that stay, and does nothing with the mode off', async () => {
    open(
      { id: 'p1', time: 1, kind: 'pause' },
      { id: 'p2', time: 1.5, kind: 'comment', text: 'a' },
      { id: 'p3', time: 4.5, kind: 'comment', text: 'b' },
    );
    const done = deleteEveryPause();
    expect(question()!.message).toBe(
      'The scene has 1 pause: it goes, with its note and whether it skips its wait. ' +
        'The 2 comments stay. Undo brings it back.',
    );
    expect(question()!.buttons[1]!.label).toBe('Hold to delete 1 pause');
    useDialogStore.getState().settle(question()!.key, 'confirm');
    expect(await done).toBe(1);
    expect(notices().at(-1)).toEqual([
      'Deleted 1 pause',
      'The 2 comments stay. Undo brings the pauses back.',
    ]);
    open({ id: 'p1', time: 1, kind: 'pause' });
    expect(await deleteAnswering('confirm')).toBe(1);
    expect(notices().at(-1)).toEqual(['Deleted 1 pause', 'Undo brings the pauses back.']);
    expect(slides()).toEqual({ marks: [] });
    loadProject(smallProject());
    useNoticeStore.getState().clear();
    expect(await deleteEveryPause()).toBe(0);
    expect(notices()).toEqual([]);
    expect(useDialogStore.getState().queue).toEqual([]);
  });

  it('writes the question of one pause and of several, with and without comments', () => {
    expect(deleteEveryPauseQuestion(1, 0)).toBe(
      'The scene has 1 pause: it goes, with its note and whether it skips its wait. Undo brings it back.',
    );
    expect(deleteEveryPauseQuestion(4, 1)).toBe(
      'The scene has 4 pauses: they go, with their notes and whether they skip their wait. ' +
        'The comment stays. Undo brings them back.',
    );
  });
});
