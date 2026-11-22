// @vitest-environment node
/* The Slides mode in the file and in the rules of a project (format 35, D200): where the scene
 * animates and where it rests, the marks — pauses and comments at instants —, and what is said of
 * a mark that does not stand where it may. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FORMAT_VERSION,
  animationSpans,
  coverAt,
  coveredMarks,
  createEmphasis,
  createSceneCamera,
  createSlides,
  exportedMarks,
  exportedPauses,
  markCoverName,
  markName,
  markStanding,
  marksInOrder,
  nearestPauseTime,
  newlyCoveredMarks,
  parseProject,
  pauseZoneAt,
  pauseZones,
  projectIdEntries,
  sceneDuration,
  serializeProject,
  setIdGenerator,
  slideMarkIssues,
  slidesOn,
  stopsOf,
  validateProject,
  withoutMarks,
  zoneAt,
  type IssueCode,
  type Project,
  type SlideMark,
  skippedWait,
} from '../index';
import { sequentialIds } from '../../test/sequentialIds';
import { smallProject } from './fixtures';

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};

const issuesOf = (project: Project, code: IssueCode) =>
  validateProject(project).filter((issue) => issue.code === code);

const pause = (id: string, time: number, text?: string): SlideMark => ({
  id,
  time,
  kind: 'pause',
  ...(text === undefined ? {} : { text }),
});
const comment = (id: string, time: number, text = 'A flash over the b'): SlideMark => ({
  id,
  time,
  kind: 'comment',
  text,
});

/** `smallProject` with the Slides mode on and these marks. Its clips are on screen over [0, 4]
 * and [2, 6], each with an intro and an outro of 1 s, and its relation runs during [2, 3): the
 * scene animates over [0, 1], [2, 3], [3, 4] and [5, 6], and rests over [1, 2] and [4, 5]. */
function withMarks(...marks: SlideMark[]): Project {
  const p = smallProject();
  p.slides = { marks };
  return p;
}

const pairs = (windows: readonly { start: number; end: number }[]) =>
  windows.map((window) => [window.start, window.end]);

describe('where the scene animates and where it rests', () => {
  it('cuts the scene into animation spans and the pause zones between them', () => {
    const p = smallProject();
    expect(sceneDuration(p)).toBe(6);
    // The fade in of the second clip and the relation are one span; the outro of the first
    // starts where they end, and stays a span of its own.
    expect(pairs(animationSpans(p))).toEqual([
      [0, 1],
      [2, 3],
      [3, 4],
      [5, 6],
    ]);
    // One zone more than there are spans: the instant at 0 s, the instant between the two spans
    // that touch and the instant the scene ends at are zones of no length.
    expect(pairs(pauseZones(p))).toEqual([
      [0, 0],
      [1, 2],
      [3, 3],
      [4, 5],
      [6, 6],
    ]);
  });

  it('answers the same for the same project, and anew for an edited one', () => {
    const p = smallProject();
    expect(animationSpans(p)).toBe(animationSpans(p));
    const edited = { ...p, clips: p.clips.map((clip) => ({ ...clip })) };
    expect(animationSpans(edited)).not.toBe(animationSpans(p));
    expect(pairs(animationSpans(edited))).toEqual(pairs(animationSpans(p)));
  });

  it('merges the animations that overlap, and a chain of them, into one span', () => {
    const p = smallProject();
    // A block of the first clip over [0.5, 2.5]: it joins the intro and the span of [2, 3].
    p.clips[0]!.actions.push(createEmphasis(0.5, 'indicate', 'all', { duration: 2 }));
    expect(pairs(animationSpans(p))).toEqual([
      [0, 3],
      [3, 4],
      [5, 6],
    ]);
  });

  it('counts a block as an animation, and a clip that is only on screen as none', () => {
    const p = smallProject();
    p.clips[1]!.actions.push(createEmphasis(2.2, 'indicate', 'all', { duration: 0.5 }));
    // The second clip starts at 2: its block runs over [4.2, 4.7], where the scene rested.
    expect(pairs(animationSpans(p))).toContainEqual([4.2, 4.7]);
  });

  it('counts no intro or outro of kind none: the clip only appears or goes', () => {
    const p = smallProject();
    p.clips[0]!.intro = { ...p.clips[0]!.intro, kind: 'none', duration: 0 };
    p.clips[1]!.outro = { ...p.clips[1]!.outro, kind: 'none', duration: 0 };
    expect(pairs(animationSpans(p))).toEqual([
      [2, 3],
      [3, 4],
    ]);
    expect(pairs(pauseZones(p))).toEqual([
      [0, 2],
      [3, 3],
      [4, 6],
    ]);
  });

  it('counts the clips of a hidden track: they are exported all the same', () => {
    const p = smallProject();
    p.tracks[0]!.hidden = true;
    expect(pairs(animationSpans(p))).toEqual(pairs(animationSpans(smallProject())));
  });

  it('counts the moves of the scene’s camera', () => {
    const p = smallProject();
    p.camera = {
      ...createSceneCamera(),
      moves: [{ id: 'n1', start: 4.25, duration: 0.5, easing: 'smooth', to: { kind: 'start' } }],
    };
    expect(pairs(animationSpans(p))).toContainEqual([4.25, 4.75]);
    expect(zoneAt(p, 4.5)).toBe('animation');
    expect(coverAt(p, 4.5)).toMatchObject({ kind: 'camera', move: { id: 'n1' } });
    expect(markCoverName(p, 4.5)).toBe('a camera move');
  });

  it('ends at the end of the scene: the tail of sound is a pause zone, a set length cuts', () => {
    // A project is a value (what is worked out of one is kept for it): each length, its own.
    const lasting = (duration: number): Project => {
      const p = smallProject();
      p.meta.duration = duration;
      return p;
    };
    expect(pairs(pauseZones(lasting(9))).at(-1)).toEqual([6, 9]);
    expect(pairs(animationSpans(lasting(5.5))).at(-1)).toEqual([5, 5.5]);
    expect(pairs(pauseZones(lasting(5.5))).at(-1)).toEqual([5.5, 5.5]);
  });

  it('is one zone, the whole scene, where nothing animates', () => {
    const p = smallProject();
    for (const clip of p.clips) {
      clip.intro = { ...clip.intro, kind: 'none', duration: 0 };
      clip.outro = { ...clip.outro, kind: 'none', duration: 0 };
    }
    p.relations = [];
    expect(animationSpans(p)).toEqual([]);
    expect(pairs(pauseZones(p))).toEqual([[0, 6]]);
  });

  it('says what the scene does at an instant: the edges of an animation rest', () => {
    const p = smallProject();
    expect(zoneAt(p, 0)).toBe('pause');
    expect(zoneAt(p, 0.5)).toBe('animation');
    expect(zoneAt(p, 1)).toBe('pause');
    expect(zoneAt(p, 1.5)).toBe('pause');
    expect(zoneAt(p, 2)).toBe('pause');
    expect(zoneAt(p, 3)).toBe('pause'); // between two animations that touch
    expect(zoneAt(p, 3.000_000_1)).toBe('pause'); // within the tolerance of a time
    expect(zoneAt(p, 3.01)).toBe('animation');
    expect(zoneAt(p, 6)).toBe('pause');
    expect(zoneAt(p, 6.5)).toBe('outside');
    expect(zoneAt(p, -1)).toBe('outside');
    expect(zoneAt(p, Number.NaN)).toBe('outside');
  });

  it('gives the pause zone of an instant, and the nearest instant a mark may stand at', () => {
    const p = smallProject();
    expect(pauseZoneAt(p, 1.5)).toEqual({ start: 1, end: 2 });
    expect(pauseZoneAt(p, 2)).toEqual({ start: 1, end: 2 });
    expect(pauseZoneAt(p, 3)).toEqual({ start: 3, end: 3 });
    expect(pauseZoneAt(p, 2.5)).toBeNull();
    expect(pauseZoneAt(p, 7)).toBeNull();
    expect(nearestPauseTime(p, 1.5)).toBe(1.5);
    expect(nearestPauseTime(p, 2.4)).toBe(2);
    expect(nearestPauseTime(p, 2.6)).toBe(3);
    expect(nearestPauseTime(p, 2.5)).toBe(2); // half way: the edge before
    expect(nearestPauseTime(p, 8)).toBe(6);
    expect(nearestPauseTime(p, -3)).toBe(0);
  });

  it('names what animates at an instant: the animation that started first', () => {
    const p = smallProject();
    expect(coverAt(p, 1.5)).toBeNull();
    expect(coverAt(p, 1)).toBeNull(); // an edge
    expect(coverAt(p, 0.5)).toMatchObject({ kind: 'animation', owner: { kind: 'intro' } });
    expect(markCoverName(p, 0.5)).toBe('the intro of "a"');
    expect(markCoverName(p, 3.5)).toBe('the outro of "a"');
    // The intro of the second clip and the relation start together: the intro is listed first.
    expect(markCoverName(p, 2.5)).toBe('the intro of "b"');
    expect(markCoverName(p, 1.5)).toBe('an animation');
  });
});

describe('the marks of the Slides mode in the file', () => {
  it('are kept by a save and a load, as the last field of the project', () => {
    const marks = [pause('p1', 1.5), comment('p2', 4.5), pause('p3', 4, 'Ask the room')];
    const text = serializeProject(withMarks(...marks));
    const again = opened(text);
    expect(again.slides).toEqual({ marks });
    expect(serializeProject(again)).toBe(text);
    expect(Object.keys(again).at(-1)).toBe('slides');
    expect(again.version).toBe(FORMAT_VERSION);
  });

  it('come after the camera in a project that has both', () => {
    const p = withMarks(pause('p1', 1.5));
    p.camera = createSceneCamera();
    expect(Object.keys(opened(serializeProject(p))).slice(-2)).toEqual(['camera', 'slides']);
  });

  it('are absent from a project whose mode is off, and from its file', () => {
    expect(slidesOn(smallProject())).toBe(false);
    expect(slidesOn(withMarks())).toBe(true);
    // On, whatever it holds: the mode a project has just turned on has no mark.
    expect(slidesOn({ slides: createSlides() })).toBe(true);
    const text = serializeProject(smallProject());
    expect(text).not.toContain('"slides"');
    expect('slides' in opened(text)).toBe(false);
    // On without a mark is kept: the mode is the project's.
    expect(opened(serializeProject(withMarks())).slides).toEqual({ marks: [] });
  });

  it('are not in a file of format 34, which opens as it is', () => {
    const before = JSON.parse(serializeProject(smallProject())) as { version: number };
    before.version = 34;
    const migrated = parseProject(JSON.stringify(before));
    expect(migrated.ok && migrated.migratedFrom).toBe(34);
    expect(migrated.ok && migrated.project.version).toBe(FORMAT_VERSION);
    expect(migrated.ok && 'slides' in migrated.project).toBe(false);
    expect(migrated.ok && migrated.issues).toEqual([]);
  });

  it('keep a pause that skips its wait, which a file of format 35 has none of', () => {
    const skipping = { ...pause('p1', 1, 'Say it'), skipWait: true };
    const again = opened(serializeProject(withMarks(skipping, pause('p2', 4))));
    expect(again.slides!.marks).toEqual([skipping, pause('p2', 4)]);
    expect('skipWait' in again.slides!.marks[1]!).toBe(false);
    const before = JSON.parse(serializeProject(withMarks(pause('p1', 1)))) as { version: number };
    before.version = 35;
    const migrated = parseProject(JSON.stringify(before));
    expect(migrated.ok && migrated.migratedFrom).toBe(35);
    expect(migrated.ok && migrated.project.version).toBe(36);
    expect(migrated.ok && migrated.project.slides).toEqual({ marks: [pause('p1', 1)] });
    expect(FORMAT_VERSION).toBe(36);
    // The field is a switch, nothing else.
    const raw = JSON.parse(serializeProject(withMarks(skipping))) as {
      slides: { marks: Record<string, unknown>[] };
    };
    raw.slides.marks[0]!.skipWait = 'yes';
    expect(parseProject(JSON.stringify(raw)).ok).toBe(false);
  });

  it('keep a pause without a note as one without the field', () => {
    const again = opened(serializeProject(withMarks(pause('p1', 1.5))));
    expect('text' in again.slides!.marks[0]!).toBe(false);
  });

  it('refuse a mark that is not one: no time, a kind of another thing, words that are not text', () => {
    const broken = (patch: (mark: Record<string, unknown>) => void) => {
      const raw = JSON.parse(serializeProject(withMarks(comment('p1', 1.5)))) as {
        slides: { marks: Record<string, unknown>[] };
      };
      patch(raw.slides.marks[0]!);
      return parseProject(JSON.stringify(raw)).ok;
    };
    expect(broken(() => {})).toBe(true);
    expect(broken((m) => delete m.time)).toBe(false);
    expect(broken((m) => (m.time = -1))).toBe(false);
    expect(broken((m) => (m.kind = 'slide'))).toBe(false);
    expect(broken((m) => (m.text = 7))).toBe(false);
    expect(broken((m) => (m.id = ''))).toBe(false);
    // A time a file can write and no scene can have.
    const text = serializeProject(withMarks(comment('p1', 1.5))).replace(
      '"time": 1.5',
      '"time": 1e999',
    );
    expect(parseProject(text).ok).toBe(false);
  });

  it('have their ids in the project’s', () => {
    const ids = projectIdEntries(withMarks(pause('p1', 1.5), comment('p2', 4.5))).filter(
      (entry) => entry.path[0] === 'slides',
    );
    expect(ids.map((entry) => [entry.id, entry.kind, entry.path])).toEqual([
      ['p1', 'p', ['slides', 'marks', 0, 'id']],
      ['p2', 'p', ['slides', 'marks', 1, 'id']],
    ]);
    // An id used twice is the project's error, wherever the two are.
    expect(issuesOf(withMarks(pause('p1', 1.5), pause('p1', 4.5)), 'duplicate-id')).toHaveLength(1);
  });
});

describe('the stops of a scene', () => {
  it('keeps the pauses inside the scene, once each, in order', () => {
    expect(stopsOf(10, [6, 2, 2, 2.0000001, 0, 10, 12, -1])).toEqual([2, 6]);
    expect(stopsOf(10, [])).toEqual([]);
    expect(stopsOf(0, [0])).toEqual([]);
  });

  it('takes a pause a millionth from the start or the end as one there: no stop', () => {
    expect(stopsOf(10, [1e-7, 10 - 1e-7])).toEqual([]);
    expect(stopsOf(10, [2e-6, 10 - 2e-6])).toEqual([2e-6, 10 - 2e-6]);
  });

  it('are the pauses an export carries, for the page and for the rehearsal alike', () => {
    // `smallProject` rests over [1, 2] and [4, 5], and is 6 s long: a pause at its start and one
    // at its end are no stops; one under an animation is not exported.
    const project = withMarks(
      pause('start', 0),
      pause('a', 1.5),
      pause('busy', 2.5),
      pause('b', 4.5),
      pause('end', 6),
    );
    expect(sceneDuration(project)).toBe(6);
    expect(
      stopsOf(
        sceneDuration(project),
        exportedPauses(project).map((mark) => mark.time),
      ),
    ).toEqual([1.5, 4.5]);
  });
});

describe('the wait a pause skips', () => {
  // `smallProject` animates over [0, 1], [2, 3], [3, 4] and [5, 6]: it rests over [1, 2] and
  // [4, 5], and at the instants 0, 3 and 6 s.
  const skipping = (id: string, time: number): SlideMark => ({
    ...pause(id, time),
    skipWait: true,
  });
  const skipped = (project: Project, id: string) =>
    skippedWait(
      project,
      project.slides!.marks.find((mark) => mark.id === id)!,
    );

  it('is from the pause to where the next animation starts', () => {
    const project = withMarks(skipping('p1', 1), skipping('p2', 4.25));
    expect(skipped(project, 'p1')).toEqual({ start: 1, end: 2 });
    expect(skipped(project, 'p2')).toEqual({ start: 4.25, end: 5 });
  });

  it('is nothing for a pause that keeps its wait, for a comment, and where nothing can be skipped', () => {
    const project = withMarks(
      pause('p1', 1),
      { ...comment('p2', 1.5), skipWait: true },
      skipping('p3', 2), // the animation starts at its own instant
      skipping('p4', 3), // the instant between two animations
      skipping('p5', 6), // after the last animation: nothing follows
      skipping('p6', 2.5), // under an animation
      { ...pause('p7', 4), skipWait: false },
    );
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']) {
      expect(skipped(project, id), id).toBeNull();
    }
  });

  it('ends at the next pause of the same rest, where the scene stops again', () => {
    const project = withMarks(skipping('p1', 1), pause('p2', 1.5), skipping('p3', 1.75));
    expect(skipped(project, 'p1')).toEqual({ start: 1, end: 1.5 });
    expect(skipped(project, 'p3')).toEqual({ start: 1.75, end: 2 });
    // A comment in the rest stops nothing.
    const noted = withMarks(skipping('p1', 1), comment('p2', 1.5));
    expect(skipped(noted, 'p1')).toEqual({ start: 1, end: 2 });
  });

  it('skips nothing in the rest after the last animation, whatever its length', () => {
    const project = smallProject();
    project.meta.duration = 9;
    project.slides = { marks: [skipping('p1', 6), skipping('p2', 7)] };
    expect(skipped(project, 'p1')).toBeNull();
    expect(skipped(project, 'p2')).toBeNull();
    // Before the first animation it does: the scene goes on with it.
    const late = withMarks(skipping('p1', 0));
    expect(skipped(late, 'p1')).toBeNull(); // the first animation starts at 0 s
  });
});

describe('a mark that stands where it may, and one that does not', () => {
  it('stands where the scene rests, on an edge too; not under an animation, nor past the end', () => {
    const p = smallProject();
    expect(markStanding(p, { time: 1.5 })).toBe('standing');
    expect(markStanding(p, { time: 1 })).toBe('standing');
    expect(markStanding(p, { time: 3 })).toBe('standing');
    expect(markStanding(p, { time: 6 })).toBe('standing');
    expect(markStanding(p, { time: 0.5 })).toBe('busy');
    expect(markStanding(p, { time: 6.5 })).toBe('outside');
  });

  it('is a project without a warning while every mark stands', () => {
    const p = withMarks(pause('p1', 1), comment('p2', 1.5), pause('p3', 3), pause('p4', 6));
    expect(slideMarkIssues(p)).toEqual([]);
    expect(validateProject(p)).toEqual(validateProject(smallProject()));
    expect(coveredMarks(p)).toEqual([]);
  });

  it('warns of a mark under an animation, naming the animation; the scene has no error of it', () => {
    const p = withMarks(pause('p1', 0.5), comment('p2', 3.5));
    const issues = issuesOf(p, 'slide-mark-busy');
    expect(issues.map((issue) => [issue.severity, issue.path, issue.message])).toEqual([
      [
        'warning',
        ['slides', 'marks', 0, 'time'],
        'The pause at 0.5 s is where the intro of "a" runs: a mark stands where nothing animates, and the exports leave this one out. Move it or delete it.',
      ],
      [
        'warning',
        ['slides', 'marks', 1, 'time'],
        'The comment at 3.5 s is where the outro of "a" runs: a mark stands where nothing animates, and the exports leave this one out. Move it or delete it.',
      ],
    ]);
    expect(validateProject(p).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('warns of a mark past the end of the scene', () => {
    const issues = issuesOf(withMarks(pause('p1', 7.25)), 'slide-mark-outside');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      severity: 'warning',
      path: ['slides', 'marks', 0, 'time'],
      message:
        'The pause at 7.25 s is past the end of the scene (6 s): the exports leave it out. Move it or delete it.',
    });
  });

  it('warns of a comment without words; a pause needs none', () => {
    const p = withMarks(comment('p1', 1.5, '  \n'), pause('p2', 4.5), {
      id: 'p3',
      time: 4.25,
      kind: 'comment',
    });
    expect(issuesOf(p, 'slide-mark-empty').map((issue) => issue.path)).toEqual([
      ['slides', 'marks', 0, 'text'],
      ['slides', 'marks', 2, 'text'],
    ]);
  });

  it('warns of a second pause at one instant; a comment may share it', () => {
    const p = withMarks(pause('p1', 1.5), comment('p2', 1.5), pause('p3', 1.5), pause('p4', 4.5));
    expect(issuesOf(p, 'slide-mark-twice').map((issue) => issue.path)).toEqual([
      ['slides', 'marks', 2, 'time'],
    ]);
  });

  it('lists the marks an edit covered, in order, each with why', () => {
    const p = withMarks(pause('p1', 7), comment('p2', 0.5), pause('p3', 1.5));
    expect(coveredMarks(p).map(({ mark, standing }) => [mark.id, standing])).toEqual([
      ['p2', 'busy'],
      ['p1', 'outside'],
    ]);
  });

  it('tells the marks a change covered from those that were out of place already', () => {
    const before = withMarks(pause('p1', 1.5), pause('p2', 4.5), pause('p3', 0.5));
    // The first clip a quarter of a second later: its intro runs over [1.25, 2.25].
    const later = structuredClone(before);
    later.clips[0]!.start = 1.25;
    expect(newlyCoveredMarks(before, later).map(({ mark }) => mark.id)).toEqual(['p1']);
    expect(newlyCoveredMarks(before, before)).toEqual([]);
    // A mark the project did not have before is not the change's doing.
    const added = withMarks(pause('p9', 0.5));
    expect(newlyCoveredMarks(smallProject(), added)).toEqual([]);
    // A scene cut short leaves a mark past its end.
    const short = structuredClone(before);
    short.meta.duration = 4.25;
    expect(
      newlyCoveredMarks(before, short).map(({ mark, standing }) => [mark.id, standing]),
    ).toEqual([['p2', 'outside']]);
  });

  it('gives the marks in the order of their instants, a comment before the pause it shares one with', () => {
    const p = withMarks(pause('p2', 4.5), pause('p1', 1.5), comment('p4', 4.5), comment('p3', 4.5));
    expect(marksInOrder(p).map((mark) => mark.id)).toEqual(['p1', 'p3', 'p4', 'p2']);
    expect(marksInOrder(smallProject())).toEqual([]);
  });

  it('exports the marks that stand, the scene stopping once at an instant', () => {
    const p = withMarks(
      pause('p1', 1.5),
      pause('p2', 0.5), // under the intro
      comment('p3', 4.5),
      pause('p4', 1.5), // a second pause there
      pause('p5', 9), // past the end
      pause('p6', 4.5),
    );
    expect(exportedMarks(p).map((mark) => mark.id)).toEqual(['p1', 'p3', 'p6']);
    expect(exportedPauses(p).map((mark) => mark.id)).toEqual(['p1', 'p6']);
    expect(exportedMarks(smallProject())).toEqual([]);
  });

  it('names a mark by what it is and when', () => {
    expect(markName(pause('p1', 3.2))).toBe('The pause at 3.2 s');
    expect(markName(comment('p2', 5))).toBe('The comment at 5 s');
    expect(markName(pause('p3', 1 / 3))).toBe('The pause at 0.333 s');
  });

  it('takes marks away and leaves the mode on', () => {
    const p = withMarks(pause('p1', 1.5), comment('p2', 4.5));
    const rest = withoutMarks(p, new Set(['p1']));
    expect(rest.slides).toEqual({ marks: [comment('p2', 4.5)] });
    expect(p.slides!.marks).toHaveLength(2);
    expect(withoutMarks(rest, new Set(['p2'])).slides).toEqual({ marks: [] });
    expect(withoutMarks(p, new Set(['p9']))).toBe(p);
    expect(withoutMarks(smallProject(), new Set(['p1'])).slides).toBeUndefined();
  });
});
