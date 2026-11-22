// @vitest-environment node
/* The pure half of the Slides mode's commands (`slideOps.ts`). */
import { describe, expect, it } from 'vitest';
import type { Project, SlideMark } from '../../../model';
import { smallProject } from '../../../model/__tests__/fixtures';
import {
  addRefusal,
  commentWordsIssue,
  createMark,
  markLabel,
  markMoveTime,
  markSpread,
  markStep,
  markTitle,
  markWarnings,
  markWords,
  keepEveryWait,
  noWaitReason,
  pauseOnFrame,
  pausesAfterAnimations,
  refusalNotice,
  restsBetweenAnimations,
  rulerSpot,
  rulerZones,
  skipEveryWait,
  skipWords,
  slidesOffBlocker,
  turnSlidesOff,
  turnSlidesOn,
  waitToSkip,
  withMarkAdded,
  withMarkMoved,
  withMarkWords,
  withoutPauses,
  withSkipWait,
  withSkipWaits,
  wordsEntry,
} from '../slideOps';

const pause = (id: string, time: number, text?: string): SlideMark => ({
  id,
  time,
  kind: 'pause',
  ...(text === undefined ? {} : { text }),
});
const comment = (id: string, time: number, text: string): SlideMark => ({
  id,
  time,
  kind: 'comment',
  text,
});

/** `smallProject` — a on [0, 4] and b on [2, 6], with intros and outros of 1 s and a relation over
 * [2, 3): the scene animates over [0, 1], [2, 3], [3, 4] and [5, 6], and rests over [1, 2] and
 * [4, 5] and at the instants 0, 3 and 6 s — with the Slides mode on and these marks. */
function scene(...marks: SlideMark[]): Project {
  const project = smallProject();
  project.slides = { marks };
  return project;
}

describe('turning the Slides mode on and off', () => {
  it('gives a project the field with no mark, once', () => {
    const off = smallProject();
    const on = turnSlidesOn(off);
    expect(on.slides).toEqual({ marks: [] });
    expect(off.slides).toBeUndefined();
    expect(turnSlidesOn(on)).toBe(on);
  });

  it('takes the field away while no mark holds it', () => {
    const on = scene();
    const off = turnSlidesOff(on);
    expect('slides' in off).toBe(false);
    expect(turnSlidesOff(off)).toBe(off);
  });

  it('stays on while a pause or a comment is there, and says how many of each', () => {
    expect(slidesOffBlocker(scene())).toBeNull();
    expect(slidesOffBlocker(smallProject())).toBeNull();
    const one = scene(pause('p1', 1.5));
    expect(slidesOffBlocker(one)).toBe(
      'Delete every pause and comment to turn Slides off (there is 1 pause).',
    );
    expect(turnSlidesOff(one)).toBe(one);
    expect(slidesOffBlocker(scene(comment('p1', 1.5, 'x'), comment('p2', 4.5, 'y')))).toBe(
      'Delete every pause and comment to turn Slides off (there are 2 comments).',
    );
    expect(
      slidesOffBlocker(scene(pause('p1', 1.5), pause('p2', 4.5), comment('p3', 6, 'end'))),
    ).toBe('Delete every pause and comment to turn Slides off (there are 2 pauses and 1 comment).');
  });
});

describe('rulerZones', () => {
  it('lays the pause zones and the animations one after the other up to the end, instants as notches', () => {
    const zone = (kind: 'pause' | 'busy', start: number, end: number, notch = false) => ({
      kind,
      start,
      end,
      notch,
    });
    // The intro of b and the outro of a only touch, at 3 s: an instant of rest between them.
    expect(rulerZones(scene())).toEqual([
      zone('pause', 0, 0, true),
      zone('busy', 0, 1),
      zone('pause', 1, 2),
      zone('busy', 2, 3),
      zone('pause', 3, 3, true),
      zone('busy', 3, 4),
      zone('pause', 4, 5),
      zone('busy', 5, 6),
      zone('pause', 6, 6, true),
    ]);
    // A scene that rests at its start and in a tail of its own after the last animation.
    const tail = scene();
    tail.clips[0]!.intro = { ...tail.clips[0]!.intro, kind: 'none', duration: 0 };
    tail.meta.duration = 8;
    expect(rulerZones(tail)).toEqual([
      zone('pause', 0, 2),
      zone('busy', 2, 3),
      zone('pause', 3, 3, true),
      zone('busy', 3, 4),
      zone('pause', 4, 5),
      zone('busy', 5, 6),
      zone('pause', 6, 8),
    ]);
  });
});

describe('the words of a mark', () => {
  it('says what it is and when, and its words', () => {
    expect(markTitle(pause('p1', 1.5))).toBe('Pause at 1.50 s');
    expect(markTitle(comment('p2', 4.25, 'x'))).toBe('Comment at 4.25 s');
    expect(markWords(pause('p1', 1.5))).toBeNull();
    expect(markWords(pause('p1', 1.5, '  \n '))).toBeNull();
    expect(markWords(comment('p2', 4.25, '  Zoom on y\nthen fade  '))).toBe('Zoom on y\nthen fade');
    // For a screen reader, on one line.
    expect(markLabel(pause('p1', 1.5))).toBe('Pause at 1.50 s');
    expect(markLabel(comment('p2', 4.25, 'Zoom on y\n  then fade'))).toBe(
      'Comment at 4.25 s: Zoom on y then fade',
    );
    expect(markLabel(pause('p3', 6, 'Questions'))).toBe('Pause at 6.00 s: Questions');
    expect(markLabel(pause('p3', 6, 'Questions'), 'skips its wait: 0.50 s')).toBe(
      'Pause at 6.00 s (skips its wait: 0.50 s): Questions',
    );
    expect(markLabel(pause('p1', 1.5), 'skips its wait: none here')).toBe(
      'Pause at 1.50 s (skips its wait: none here)',
    );
  });

  it('gathers what the project says of each mark, by its id', () => {
    const project = scene(
      pause('p1', 1.5),
      pause('p2', 0.5),
      comment('p3', 4.5, ' '),
      pause('p4', 1.5),
      pause('p5', 9),
    );
    const warnings = markWarnings(project);
    expect([...warnings.keys()].sort()).toEqual(['p2', 'p3', 'p4', 'p5']);
    expect(warnings.get('p2')).toEqual([
      'The pause at 0.5 s is where the intro of "a" runs: a mark stands where nothing animates, and the exports leave this one out. Move it or delete it.',
    ]);
    expect(warnings.get('p3')).toEqual([
      'The comment at 4.5 s has no words: write it, or delete it.',
    ]);
    expect(warnings.get('p4')).toEqual([
      'There are two pauses at 1.5 s: the scene stops there once. Delete one.',
    ]);
    expect(warnings.get('p5')?.[0]).toMatch(/past the end of the scene \(6 s\)/);
    expect(markWarnings(scene(pause('p1', 1.5))).size).toBe(0);
  });

  it('sets the marks of one instant side by side about it, in their order', () => {
    const spread = markSpread(
      scene(pause('p1', 1.5), comment('p2', 1.5, 'x'), pause('p3', 4.5), comment('p4', 1.5, 'y')),
    );
    // At 1.5 s: the comments first (by id), then the pause.
    expect(spread.get('p2')).toBe(-1);
    expect(spread.get('p4')).toBe(0);
    expect(spread.get('p1')).toBe(1);
    expect(spread.get('p3')).toBe(0);
    const two = markSpread(scene(pause('p1', 1.5), comment('p2', 1.5, 'x')));
    expect([two.get('p2'), two.get('p1')]).toEqual([-0.5, 0.5]);
  });
});

describe('rulerSpot', () => {
  const fps = 60;
  /** The timeline's snapping at its default zoom: 8 px at 80 px/s. */
  const near = (playhead: number) => ({ playhead, threshold: 0.1 });

  it('puts a time on a frame where the scene rests, with the zone it is held in', () => {
    expect(rulerSpot(scene(), 1.504, fps, null)).toEqual({
      kind: 'pause',
      time: 1.5,
      zone: { start: 1, end: 2 },
    });
    // A frame past the edge of the zone is held in it.
    expect(rulerSpot(scene(), 1.999, fps, null)).toMatchObject({ kind: 'pause', time: 2 });
  });

  it('snaps onto an edge of a pause zone, or the playhead, when the Snap is on', () => {
    expect(rulerSpot(scene(), 1.05, fps, near(0))).toMatchObject({ kind: 'pause', time: 1 });
    expect(rulerSpot(scene(), 1.05, fps, null)).toMatchObject({ kind: 'pause', time: 1.05 });
    expect(rulerSpot(scene(), 1.66, fps, near(1.7))).toMatchObject({ kind: 'pause', time: 1.7 });
    // An instant between two animations that touch, reached from either: a notch.
    expect(rulerSpot(scene(), 2.95, fps, near(0))).toEqual({
      kind: 'pause',
      time: 3,
      zone: { start: 3, end: 3 },
    });
    expect(rulerSpot(scene(), 3.06, fps, near(0))).toMatchObject({ kind: 'pause', time: 3 });
  });

  it('says what runs where the scene animates, and when the scene is over', () => {
    expect(rulerSpot(scene(), 0.5, fps, near(0))).toEqual({
      kind: 'busy',
      time: 0.5,
      cover: 'the intro of "a"',
    });
    expect(rulerSpot(scene(), 2.95, fps, null)).toMatchObject({ kind: 'busy', time: 2.95 });
    expect(rulerSpot(scene(), 7.2, fps, null)).toEqual({ kind: 'outside', time: 7.2 });
  });
});

describe('adding a mark', () => {
  it('refuses where the scene animates, past its end and on a frame that has a pause', () => {
    const project = scene(pause('p1', 1.5));
    expect(addRefusal(project, 'pause', 1.25)).toBeNull();
    expect(addRefusal(project, 'pause', 3)).toBeNull();
    expect(addRefusal(project, 'pause', 0.5)).toEqual({ kind: 'busy', cover: 'the intro of "a"' });
    expect(addRefusal(project, 'comment', 6.5)).toEqual({ kind: 'outside', end: 6 });
    expect(addRefusal(project, 'pause', 1.5)).toEqual({
      kind: 'twice',
      existing: pause('p1', 1.5),
    });
    // On the same frame, a hair away.
    expect(addRefusal(project, 'pause', 1.504)?.kind).toBe('twice');
    expect(pauseOnFrame(project, 1.52)).toBeUndefined();
    // A comment may share an instant with a pause.
    expect(addRefusal(project, 'comment', 1.5)).toBeNull();
    expect(addRefusal(smallProject(), 'pause', 1.5)).toEqual({ kind: 'off' });
  });

  it('says why in a notice', () => {
    expect(refusalNotice('pause', 1.5, { kind: 'twice', existing: pause('p1', 1.5) })).toEqual({
      title: 'A pause is at 1.50 s already',
      message: 'The scene stops there once: the pause that is there has the focus.',
    });
    expect(refusalNotice('comment', 0.5, { kind: 'busy', cover: 'the intro of "a"' })).toEqual({
      title: 'No comment at 0.50 s',
      message: 'The intro of "a" runs then: a comment stands where nothing animates.',
    });
    expect(refusalNotice('pause', 7, { kind: 'outside', end: 6 })).toEqual({
      title: 'No pause at 7.00 s',
      message: 'The scene ends at 6.00 s.',
    });
  });

  it('makes a mark with its words trimmed, and keeps the marks in their order', () => {
    const made = createMark('comment', 1.25, '  Zoom\n ');
    expect(made).toEqual({
      id: expect.stringMatching(/^p/),
      time: 1.25,
      kind: 'comment',
      text: 'Zoom',
    });
    expect('text' in createMark('pause', 1.25, '   ')).toBe(false);
    const marks = withMarkAdded([pause('p1', 4.5), pause('p2', 1.5)], comment('p3', 1.5, 'x'));
    expect(marks.map((m) => m.id)).toEqual(['p3', 'p2', 'p1']);
    expect(commentWordsIssue('  ')).toMatch(/^A comment needs words/);
    expect(commentWordsIssue('x')).toBeNull();
  });
});

describe('moving a mark', () => {
  const near = (playhead: number) => ({ playhead, threshold: 0.1 });

  it('keeps it in the zone it stands in, on frames, snapped to the playhead and the edges', () => {
    const project = scene(pause('p1', 1.5), comment('p2', 4.5, 'x'));
    const [p1, p2] = project.slides!.marks as [SlideMark, SlideMark];
    expect(markMoveTime(project, p1, 1.254, null)).toBe(1.25);
    expect(markMoveTime(project, p1, 2.7, null)).toBe(2);
    expect(markMoveTime(project, p1, 0.2, null)).toBe(1);
    expect(markMoveTime(project, p1, 1.33, near(1.3))).toBe(1.3);
    expect(markMoveTime(project, p1, 1.93, near(0))).toBe(2);
    // The edges of another zone do not pull it: it stays in its own.
    expect(markMoveTime(project, p2, 3.95, near(0))).toBe(4);
    expect(markMoveTime(project, p2, 2.5, null)).toBe(4);
  });

  it('takes a mark out of place to the nearest time where one may stand, in any zone', () => {
    const project = scene(pause('p1', 0.5), pause('p2', 7));
    const [p1, p2] = project.slides!.marks as [SlideMark, SlideMark];
    expect(markMoveTime(project, p1, 0.6, null)).toBe(1);
    expect(markMoveTime(project, p1, 0.4, null)).toBe(0);
    expect(markMoveTime(project, p1, 4.4, null)).toBe(4.4);
    expect(markMoveTime(project, p1, 3.4, null)).toBe(3);
    expect(markMoveTime(project, p2, 9, null)).toBe(6);
  });

  it('does not put a pause on the frame of another pause; a comment may', () => {
    const project = scene(pause('p1', 1.5), pause('p2', 1.75), comment('p3', 1.25, 'x'));
    const [p1, , p3] = project.slides!.marks as [SlideMark, SlideMark, SlideMark];
    expect(markMoveTime(project, p1, 1.75, null)).toBeNull();
    expect(markMoveTime(project, p1, 1.8, null)).toBe(1.8);
    expect(markMoveTime(project, p3, 1.75, null)).toBe(1.75);
    // Its own frame is no other pause's.
    expect(markMoveTime(project, p1, 1.5, null)).toBe(1.5);
  });

  it('writes the marks in their order', () => {
    const marks = [pause('p1', 1.5), comment('p2', 4.5, 'x')];
    expect(withMarkMoved(marks, 'p2', 1.25).map((m) => [m.id, m.time])).toEqual([
      ['p2', 1.25],
      ['p1', 1.5],
    ]);
  });
});

describe('the words of a mark, written', () => {
  it('sets them trimmed, and takes a pause’s note away when they are empty', () => {
    const marks = [pause('p1', 1.5, 'Old'), comment('p2', 4.5, 'x')];
    expect(withMarkWords(marks, 'p1', '  New\nnote ')[0]).toEqual(pause('p1', 1.5, 'New\nnote'));
    expect(withMarkWords(marks, 'p1', '  ')[0]).toEqual(pause('p1', 1.5));
    expect(withMarkWords(marks, 'p2', 'y')[1]).toEqual(comment('p2', 4.5, 'y'));
    expect(withMarkWords(marks, 'p2', 'y')[0]).toBe(marks[0]);
  });

  it('names the entry of the menu by what the mark has', () => {
    expect(wordsEntry(pause('p1', 1.5))).toBe('Add a note…');
    expect(wordsEntry(pause('p1', 1.5, 'x'))).toBe('Edit note…');
    expect(wordsEntry(comment('p2', 4.5, 'x'))).toBe('Edit comment…');
  });
});

describe('a pause after every animation', () => {
  const times = (project: Project) => pausesAfterAnimations(project).map((mark) => mark.time);

  it('finds the rests between two animations: not the start of the scene, nor its end', () => {
    expect(restsBetweenAnimations(scene())).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 3 },
      { start: 4, end: 5 },
    ]);
    const empty = scene();
    empty.clips = [];
    empty.relations = [];
    expect(restsBetweenAnimations(empty)).toEqual([]);
  });

  it('puts one where each animation ends and another follows, the instant between two included', () => {
    const added = pausesAfterAnimations(scene());
    expect(added.map((mark) => [mark.kind, mark.time, mark.text])).toEqual([
      ['pause', 1, undefined],
      ['pause', 3, undefined],
      ['pause', 4, undefined],
    ]);
    expect(new Set(added.map((mark) => mark.id)).size).toBe(3);
    expect(added.every((mark) => addRefusal(scene(), 'pause', mark.time) === null)).toBe(true);
  });

  it('leaves a rest that has a pause alone, wherever in it the pause is; a comment does not count', () => {
    expect(times(scene(pause('p1', 1.5)))).toEqual([3, 4]);
    expect(times(scene(pause('p1', 2), pause('p2', 3)))).toEqual([4]);
    expect(times(scene(comment('p1', 1, 'here'), pause('p2', 5)))).toEqual([1, 3]);
    expect(times(scene(pause('p1', 1), pause('p2', 3), pause('p3', 4.25)))).toEqual([]);
    // A pause out of place — under an animation — is in no rest.
    expect(times(scene(pause('p1', 2.5)))).toEqual([1, 3, 4]);
  });

  it('adds nothing to a project with the mode off but what it would hold, and none twice on a frame', () => {
    const off = smallProject();
    expect(pausesAfterAnimations(off).map((mark) => mark.time)).toEqual([1, 3, 4]);
    // At 2 fps the frames are 0.5 s apart: the pause at 3.2 is on the frame of the instant 3.
    const coarse = scene(pause('p1', 4.2));
    coarse.meta.fps = 2;
    expect(times(coarse)).toEqual([1, 3]);
  });
});

describe('markStep', () => {
  it('moves a mark a frame inside its zone, and says what is next at its edge', () => {
    const project = scene(pause('p1', 1.5), pause('p2', 2), comment('p3', 6, 'end'));
    const [p1, p2, p3] = project.slides!.marks as [SlideMark, SlideMark, SlideMark];
    expect(markStep(project, p1, 1)).toEqual({ kind: 'move', time: 1.516667 });
    expect(markStep(project, p1, -1)).toEqual({ kind: 'move', time: 1.483333 });
    expect(markStep(project, p2, 1)).toEqual({ kind: 'edge', next: 'the intro of "b" runs next' });
    expect(markStep(project, p2, -1)).toEqual({ kind: 'move', time: 1.983333 });
    expect(markStep(project, p3, 1)).toEqual({ kind: 'edge', next: 'the scene ends there' });
    expect(markStep(project, p3, -1)).toEqual({ kind: 'edge', next: 'the outro of "b" runs next' });
    const start = scene(comment('p1', 0, 'start'));
    expect(markStep(start, start.slides!.marks[0]!, -1)).toEqual({
      kind: 'edge',
      next: 'the scene starts there',
    });
  });

  it('from a time off the frames, goes to the nearest frame on that side', () => {
    const project = scene(pause('p1', 1.51));
    expect(markStep(project, project.slides!.marks[0]!, 1)).toEqual({
      kind: 'move',
      time: 1.516667,
    });
    expect(markStep(project, project.slides!.marks[0]!, -1)).toEqual({ kind: 'move', time: 1.5 });
  });

  it('stops a pause short of the frame of another', () => {
    const project = scene(pause('p1', 1.5), pause('p2', 1.516667));
    expect(markStep(project, project.slides!.marks[0]!, 1)).toEqual({
      kind: 'pause',
      other: pause('p2', 1.516667),
    });
  });

  it('takes a mark out of place to the edge of what covers it, on the side of the key', () => {
    const project = scene(pause('p1', 0.2), pause('p2', 8));
    const [p1, p2] = project.slides!.marks as [SlideMark, SlideMark];
    expect(markStep(project, p1, 1)).toEqual({ kind: 'move', time: 1 });
    expect(markStep(project, p1, -1)).toEqual({ kind: 'move', time: 0 });
    expect(markStep(project, p2, -1)).toEqual({ kind: 'move', time: 6 });
    expect(markStep(project, p2, 1)).toEqual({ kind: 'edge', next: 'the scene ends before it' });
  });
});

describe('a pause that skips its wait', () => {
  const skipping = (id: string, time: number, text?: string): SlideMark => ({
    ...pause(id, time, text),
    skipWait: true,
  });
  /** The stretch each pause would skip, by id: `[start, end]`, or null. */
  const waits = (project: Project) =>
    Object.fromEntries(
      project.slides!.marks.map((mark) => {
        const wait = waitToSkip(project, mark);
        return [mark.id, wait && [wait.start, wait.end]];
      }),
    );

  it('finds the wait a pause would skip with the flag on, or none: the rule of the model', () => {
    const project = scene(
      pause('p1', 1),
      skipping('p2', 4.25),
      pause('p3', 2), // an animation starts at its instant
      pause('p4', 3), // the instant between two animations
      pause('p5', 6), // after the last animation
      pause('p6', 2.5), // under an animation
      comment('p7', 1.5, 'x'),
      pause('p8', 0), // the first animation starts at 0 s
    );
    expect(waits(project)).toEqual({
      p1: [1, 2],
      p2: [4.25, 5],
      p3: null,
      p4: null,
      p5: null,
      p6: null,
      p7: null,
      p8: null,
    });
  });

  it('says why a pause has none, and only then', () => {
    const project = scene(
      pause('p1', 1),
      pause('p3', 2),
      pause('p4', 3),
      pause('p5', 6),
      pause('p6', 2.5),
      comment('p7', 1.5, 'x'),
      pause('p8', 0),
    );
    const why = (id: string) =>
      noWaitReason(
        project,
        project.slides!.marks.find((mark) => mark.id === id)!,
      );
    expect(why('p1')).toBeNull();
    expect(why('p7')).toBeNull();
    const starts = 'An animation starts at this instant: there is no wait after it to skip.';
    expect(why('p3')).toBe(starts);
    expect(why('p4')).toBe(starts);
    expect(why('p8')).toBe(starts);
    expect(why('p5')).toBe('No animation follows this pause: the scene only ends after it.');
    expect(why('p6')).toBe('The exports leave this pause out: it is not where the scene rests.');
    // A reason exactly where there is no wait, at every frame of the scene.
    for (let frame = 0; frame <= 6 * 8; frame++) {
      const mark = pause('px', frame / 8);
      const one = scene(mark);
      expect(noWaitReason(one, mark) === null, `${frame / 8}`).toBe(waitToSkip(one, mark) !== null);
    }
  });

  it('says how long a pause skips, and that one with nothing to skip skips none', () => {
    const project = scene(skipping('p1', 1.5), skipping('p2', 3), pause('p3', 4.5));
    const [p1, p2, p3] = project.slides!.marks;
    expect(skipWords(project, p1!)).toBe('skips its wait: 0.50 s');
    expect(skipWords(project, p2!)).toBe('skips its wait: none here');
    expect(skipWords(project, p3!)).toBeNull();
    expect(skipWords(project, { ...comment('p4', 1.25, 'x'), skipWait: true })).toBeNull();
  });

  it('sets the flag of one pause, and takes the field away when it is cleared', () => {
    const marks = [pause('p1', 1.5, 'Note'), comment('p2', 4.5, 'x')];
    const on = withSkipWait(marks, 'p1', true);
    expect(on[0]).toEqual(skipping('p1', 1.5, 'Note'));
    expect(on[1]).toBe(marks[1]);
    const off = withSkipWait(on, 'p1', false);
    expect(off[0]).toEqual(pause('p1', 1.5, 'Note'));
    expect('skipWait' in off[0]!).toBe(false);
    expect(withSkipWaits(on, new Set(['p1', 'p2']), false)[0]).toEqual(pause('p1', 1.5, 'Note'));
  });

  it('keeps the flag through every other write of a mark', () => {
    const marks = [skipping('p1', 1.5, 'Note'), comment('p2', 4.5, 'x')];
    expect(withMarkMoved(marks, 'p1', 1.25).find((m) => m.id === 'p1')).toEqual(
      skipping('p1', 1.25, 'Note'),
    );
    expect(withMarkWords(marks, 'p1', '')[0]).toEqual(skipping('p1', 1.5));
    expect(withMarkWords(marks, 'p1', 'Other')[0]).toEqual(skipping('p1', 1.5, 'Other'));
  });

  it('sets every pause that has a wait to skip, and counts those that have none', () => {
    const project = scene(
      pause('p1', 1),
      pause('p2', 3),
      skipping('p3', 4.25),
      comment('p4', 1.5, 'x'),
      pause('p5', 6),
      { ...pause('p6', 4.75), skipWait: false },
    );
    const every = skipEveryWait(project);
    expect(every.set.map((mark) => mark.id)).toEqual(['p1', 'p6']);
    expect(every.none).toBe(2);
    expect(skipEveryWait(scene()).set).toEqual([]);
  });

  it('clears every pause that skips, one with nothing to skip included', () => {
    const project = scene(skipping('p1', 1), pause('p2', 1.5), skipping('p3', 3));
    expect(keepEveryWait(project).map((mark) => mark.id)).toEqual(['p1', 'p3']);
    expect(keepEveryWait(scene(pause('p1', 1)))).toEqual([]);
  });

  it('deletes every pause and keeps the comments', () => {
    const marks = [pause('p1', 1), comment('p2', 1, 'x'), skipping('p3', 4.25, 'y')];
    expect(withoutPauses(marks)).toEqual([comment('p2', 1, 'x')]);
    expect(withoutPauses([pause('p1', 1)])).toEqual([]);
  });
});
