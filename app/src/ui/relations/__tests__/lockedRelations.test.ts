// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createTrack,
  defaultIntro,
  defaultOutro,
  type Clip,
  type Project,
} from '../../../model';
import {
  lockedBreak,
  lockedLimits,
  lockedPhaseBlocker,
  lockedPhaseRoom,
  lockedReason,
  lockedRelationsOf,
  lockedWindowTimes,
  relationName,
  restoreLockedWindows,
} from '../lockedRelations';
import { fitRelationWindows } from '../relationOps';

/* The relations a locked track holds (D34, F12): what an edit of their other clip must leave as it
 * is — the window in scene time, inside both clips — and how far it may go. */

/** `a` on Track 1 over [1, 5] with a 0.5 s intro and outro; `b` on the locked track "Locked" over
 * [0, 6]; `c` on Track 2 over [0, 6]. A relation from `a` to `b` over 2–3 s and one from `b` to
 * `a` over 3.5–4 s (the target is `a`: offset 2.5). */
function scene(): { project: Project; a: Clip; b: Clip; c: Clip } {
  const project = createEmptyProject();
  const fa = createFormula({ name: 'fa' });
  const fb = createFormula({ name: 'fb' });
  project.formulas.push(fa, fb);
  const locked = createTrack('Locked');
  locked.locked = true;
  project.tracks.push(locked);
  const half = { intro: { ...defaultIntro('write'), duration: 0.5 } };
  const a = createClip(fa.id, project.tracks[0]!.id, 1, 5, {
    ...half,
    outro: { ...defaultOutro('fade_out'), duration: 0.5 },
  });
  const b = createClip(fb.id, locked.id, 0, 6, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  const c = createClip(fb.id, project.tracks[1]!.id, 0, 6, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  project.clips.push(a, b, c);
  project.relations.push(
    { ...createRelation(a.id, b.id, { offset: 2, duration: 1 }), id: 'ab' },
    { ...createRelation(b.id, a.id, { offset: 2.5, duration: 0.5 }), id: 'ba' },
  );
  return { project, a, b, c };
}

describe('lockedRelationsOf', () => {
  it('lists the relations of a clip whose other clip is on a locked track, in scene time', () => {
    const { project, a, b, c } = scene();
    project.relations.push({ ...createRelation(a.id, c.id, { offset: 2, duration: 1 }), id: 'ac' });
    const held = lockedRelationsOf(project, a);
    expect(held.map((h) => [h.relation.id, h.source, h.window, h.track.name])).toEqual([
      ['ab', true, { start: 2, end: 3 }, 'Locked'],
      ['ba', false, { start: 3.5, end: 4 }, 'Locked'],
    ]);
    expect(held[0]!.other.id).toBe(b.id);
    // The clip on the locked track holds none: nothing edits it. Unlocked, nothing is held.
    expect(lockedRelationsOf(project, b)).toEqual([]);
    project.tracks.at(-1)!.locked = false;
    expect(lockedRelationsOf(project, a)).toEqual([]);
  });
});

describe('lockedLimits', () => {
  it('a source keeps its window after its intro and before its end; a target from its start to its outro', () => {
    const { project, a } = scene();
    expect(lockedLimits(project, a)).toEqual({
      // As a source: 2 − its intro (0.5); as a target: 3.5. The earlier one holds.
      latestStart: 1.5,
      // As a source: 3; as a target: 4 + its outro (0.5).
      earliestEnd: 4.5,
      longestIntro: 1, // the window from it starts 1 s after it
      longestOutro: 1, // the window into it ends 1 s before it
    });
  });

  it('are infinite when nothing holds the clip', () => {
    const { project, c } = scene();
    expect(lockedLimits(project, c)).toEqual({
      latestStart: Infinity,
      earliestEnd: -Infinity,
      longestIntro: Infinity,
      longestOutro: Infinity,
    });
  });

  it('give the room of an intro or an outro, never less than it has already', () => {
    const { project, a } = scene();
    expect(lockedPhaseRoom(project, a, 'intro')).toBe(1);
    expect(lockedPhaseRoom(project, a, 'outro')).toBe(1);
    // A window that does not fit already does not shorten what is there.
    a.intro.duration = 1.5;
    expect(lockedPhaseRoom(project, a, 'intro')).toBe(1.5);
  });
});

describe('lockedBreak', () => {
  it('names the relation whose window an edit would leave out of the clip', () => {
    const { project, a } = scene();
    expect(lockedBreak(project, { ...a, end: 4.5 })).toBeNull();
    expect(lockedBreak(project, { ...a, end: 4.4 })?.relation.id).toBe('ba');
    expect(lockedBreak(project, { ...a, start: 1.5 })).toBeNull();
    expect(lockedBreak(project, { ...a, start: 1.6 })?.relation.id).toBe('ab');
    expect(lockedBreak(project, { ...a, intro: { ...a.intro, duration: 1.1 } })?.relation.id).toBe(
      'ab',
    );
    expect(lockedBreak(project, { ...a, outro: { ...a.outro, duration: 1 } })).toBeNull();
  });

  it('counts a window that does not fit already only when the edit leaves it further out', () => {
    const { project, a } = scene();
    a.end = 3.8; // the window into it ends at 4: 0.7 s out, with its outro
    expect(lockedBreak(project, { ...a, end: 4 })).toBeNull();
    expect(lockedBreak(project, { ...a, end: 3.8 })).toBeNull();
    expect(lockedBreak(project, { ...a, end: 3.7 })?.relation.id).toBe('ba');
  });

  it('a phase leaves no room when not even the shortest animation fits', () => {
    const { project, a } = scene();
    const bare = { ...a, intro: defaultIntro('none') };
    project.clips[0] = bare;
    expect(lockedPhaseBlocker(project, bare, 'intro', 0.05)).toBeNull();
    project.relations[0]!.offset = 1.02; // the window from it starts 0.02 s after it
    expect(lockedPhaseBlocker(project, bare, 'intro', 0.05)?.relation.id).toBe('ab');
  });
});

describe('the windows a locked track holds', () => {
  it('play where they did when their target moves: the offset follows its start', () => {
    const { project, a } = scene();
    const times = lockedWindowTimes(project);
    expect([...times]).toEqual([
      ['ab', { start: 2, duration: 1 }],
      ['ba', { start: 3.5, duration: 0.5 }],
    ]);
    const draft = structuredClone(project);
    const moved = draft.clips.find((c) => c.id === a.id)!;
    moved.start = 0.75;
    moved.end = 4.75;
    draft.relations[1]!.offset = 9; // whatever an edit did to it
    restoreLockedWindows(draft, times);
    expect(draft.relations[1]).toMatchObject({ offset: 2.75, duration: 0.5 });
    // The one whose target did not move is as it was.
    expect(draft.relations[0]).toEqual(project.relations[0]);
  });

  it('are left alone by fitRelationWindows', () => {
    const { project, a, c } = scene();
    project.relations.push({ ...createRelation(a.id, c.id, { offset: 2, duration: 1 }), id: 'ac' });
    const draft = structuredClone(project);
    draft.clips[0]!.end = 2.5; // a no longer holds any window
    fitRelationWindows(draft, [a.id]);
    // The relation with a clip on a locked track stays where it plays; the other is fitted.
    expect(draft.relations.map((r) => [r.id, r.offset, r.duration])).toEqual([
      ['ab', 2, 1],
      ['ba', 2.5, 0.5],
      ['ac', 1.5, 1],
    ]);
  });
});

describe('the words', () => {
  it('name the relation by its clips and its window, then say whose lock keeps it', () => {
    const { project } = scene();
    const [ab, ba] = project.relations;
    expect(relationName(project, ab!)).toBe('relation from “fa” to “fb” (2.00–3.00 s)');
    expect(relationName(project, ba!)).toBe('relation from “fb” to “fa” (3.50–4.00 s)');
    expect(lockedReason(project, ab!, 'It would go.')).toBe(
      'It would go. Track “Locked” is locked: unlock it on the timeline to create, edit or delete relations of its clips.',
    );
  });
});
