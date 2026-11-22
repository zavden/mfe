// @vitest-environment node
/* Audit A6-02: the edits of a clip whose relation a locked track holds. A relation with either of
 * its clips on a locked track cannot be created, edited or deleted (D34, F12: `relationLock`), so
 * an edit of its other clip leaves what plays on the locked track as it is — the window of the
 * relation in scene time, inside both clips —: it stops where the window would no longer fit in
 * the clip, or it is refused with a notice that names the track. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createTrack,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Clip,
  type Project,
} from '../../../model';
import { plainClip, sceneWith } from '../../../scene/__tests__/sceneKit';
import { history, loadProject, useProjectStore } from '../../../store';
import { planPhase } from '../../animations/phasePlan';
import { setClipPhase } from '../../animations/objectActions';
import { useDialogStore } from '../../project/dialogStore';
import { useNoticeStore } from '../../project/noticeStore';
import { relationLock } from '../../relations/relationOps';
import { deleteFormulas } from '../../creator/formulaActions';
import { deleteClipsAsking, deleteTrackAsking, nudgeClip } from '../clipActions';
import { constrainMove, endBounds, startBounds } from '../clipOps';
import { applyTimingChange, planTimingPaste, type ClipTiming } from '../clipTiming';
import { applyTrim, trimMembers, trimRange } from '../groupTrim';
import { phaseLimits } from '../phaseDrag';
import { planSplit } from '../splitClips';

const LOCK =
  'Track “Locked” is locked: unlock it on the timeline to create, edit or delete relations of its clips.';

/** Track 1: `a` over [3, 6], with a Write intro of 0.5 s. Track 2: `c` over [3, 6]. The locked
 * track "Locked": `b` over [0, 8]. A relation over 4–5 s: from `a` to `b` (`direction` 'from'),
 * or from `b` to `a` ('to': then `a` has a FadeOut outro of 0.5 s and no intro). */
function scene(direction: 'from' | 'to' = 'from') {
  const project = createEmptyProject();
  for (const name of ['a', 'b', 'c'])
    project.formulas.push({ ...createFormula({ name }), id: name });
  const locked = createTrack('Locked');
  locked.locked = true;
  project.tracks.push(locked);
  const [t1, t2] = project.tracks;
  const phases =
    direction === 'from'
      ? { intro: { ...defaultIntro('write'), duration: 0.5 }, outro: defaultOutro('none') }
      : { intro: defaultIntro('none'), outro: { ...defaultOutro('fade_out'), duration: 0.5 } };
  const a: Clip = { ...createClip('a', t1!.id, 3, 6, phases), id: 'ca' };
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  const b: Clip = { ...createClip('b', locked.id, 0, 8, none), id: 'cb' };
  const c: Clip = { ...createClip('c', t2!.id, 3, 6, none), id: 'cc' };
  project.clips.push(a, b, c);
  const relation =
    direction === 'from'
      ? createRelation('ca', 'cb', { offset: 4, duration: 1 })
      : createRelation('cb', 'ca', { offset: 1, duration: 1 });
  project.relations.push({ ...relation, id: 'r' });
  return { project, a, b, c };
}

/** Where the relation plays, in scene time. */
function windowOf(project: Project): [number, number] {
  const relation = project.relations.find((r) => r.id === 'r')!;
  const to = project.clips.find((c) => c.id === relation.toClipId)!;
  return [to.start + relation.offset, to.start + relation.offset + relation.duration];
}

const windowErrors = (project: Project) =>
  validateProject(project).filter((issue) => issue.code === 'relation-window');

const clipOf = (project: Project, id: string) => project.clips.find((c) => c.id === id)!;
const stored = () => useProjectStore.getState().project;
const notices = () =>
  useNoticeStore.getState().notices.map((n) => ({ title: n.title, message: n.message }));

beforeEach(() => {
  useNoticeStore.setState({ notices: [] });
  useDialogStore.setState({ queue: [] });
});
afterEach(() => loadProject(createEmptyProject()));

describe('a relation with a clip on a locked track', () => {
  it('is locked: it cannot be edited directly', () => {
    const { project } = scene();
    expect(relationLock(project, project.relations[0]!)).toBe(LOCK);
  });
});

describe('a trim of its other clip', () => {
  it('of the end of the source stops at the end of the window', () => {
    const { project, a } = scene();
    const members = trimMembers(project, [a.id], a.id);
    expect(members.map((m) => m.clip.id)).toEqual([a.id]);
    // The end of a goes back as far as the window's end (5 s), no further.
    const [lo] = trimRange(project, members, 'end');
    expect(lo).toBeCloseTo(-1, 9);
    const draft = structuredClone(project);
    applyTrim(draft, project, members, 'end', lo);
    expect(clipOf(draft, a.id).end).toBe(5);
    expect(draft.relations[0]).toMatchObject({ offset: 4, duration: 1 });
    expect(windowErrors(draft)).toEqual([]);
  });

  it('of the start of the source stops where its intro meets the window', () => {
    const { project, a } = scene();
    const [, hi] = trimRange(project, trimMembers(project, [a.id], a.id), 'start');
    expect(hi).toBeCloseTo(0.5, 9); // the intro of 0.5 s ends at 4 s, where the window starts
    expect(startBounds(project, a)[1]).toBeCloseTo(3.5, 9);
  });

  it('of the start of the target stops at the start of the window, which keeps its time', () => {
    const { project, a } = scene('to');
    const members = trimMembers(project, [a.id], a.id);
    const [, hi] = trimRange(project, members, 'start');
    expect(hi).toBeCloseTo(1, 9);
    const draft = structuredClone(project);
    applyTrim(draft, project, members, 'start', 0.75);
    expect(clipOf(draft, a.id).start).toBe(3.75);
    expect(draft.relations[0]!.offset).toBeCloseTo(0.25, 9);
    expect(windowOf(draft)).toEqual([4, 5]);
    // The end of the target keeps the window before its outro.
    expect(endBounds(project, a)[0]).toBeCloseTo(5.5, 9);
  });

  it('of several selected clips stops them all where it stops (D168)', () => {
    const { project, a, c } = scene();
    const members = trimMembers(project, [a.id, c.id], c.id);
    expect(members.map((m) => m.clip.id)).toEqual([a.id, c.id]);
    const [lo] = trimRange(project, members, 'end');
    expect(lo).toBeCloseTo(-1, 9);
    const draft = structuredClone(project);
    applyTrim(draft, project, members, 'end', lo);
    expect([clipOf(draft, a.id).end, clipOf(draft, c.id).end]).toEqual([5, 5]);
    expect(windowOf(draft)).toEqual([4, 5]);
  });
});

describe('a move of its other clip', () => {
  it('stops where the window would leave it, as a drag does', () => {
    const { project, a } = scene();
    const move = [{ clip: a, trackId: a.trackId }];
    expect(constrainMove(project, move, 2)).toBe(0.5);
    expect(constrainMove(project, move, -3)).toBe(-1);
    expect(constrainMove(project, move, 0.25)).toBe(0.25);
  });

  it('by Alt + arrows: the source goes as far as the window lets it, then says why it stays', () => {
    const { project, a } = scene();
    loadProject(project);
    expect(nudgeClip(a.id, 2.5, 0)).toMatchObject({ ok: true, start: 3.5, end: 6.5 });
    expect(stored().relations[0]).toMatchObject({ offset: 4, duration: 1 });
    expect(nudgeClip(a.id, 1 / 30, 0)).toEqual({
      ok: false,
      reason: 'No room that way',
      message: `The relation from “a” to “b” (4.00–5.00 s) would no longer fit in “a”. ${LOCK}`,
    });
    expect(windowErrors(stored())).toEqual([]);
  });

  it('by Alt + arrows: the window into the target keeps its time; the offset follows', () => {
    const { project, a } = scene('to');
    loadProject(project);
    expect(nudgeClip(a.id, 0.5, 0)).toMatchObject({ ok: true, start: 3.5, end: 6.5 });
    expect(stored().relations[0]!.offset).toBeCloseTo(0.5, 9);
    expect(windowOf(stored())).toEqual([4, 5]);
    // It stops with its start at the window's: 4 s.
    expect(nudgeClip(a.id, 2, 0)).toMatchObject({ ok: true, start: 4, end: 7 });
    expect(stored().relations[0]!.offset).toBe(0);
    expect(windowOf(stored())).toEqual([4, 5]);
    // Back, its end stops where the outro meets the window.
    expect(nudgeClip(a.id, -3, 0)).toMatchObject({ ok: true, start: 2.5, end: 5.5 });
    expect(windowOf(stored())).toEqual([4, 5]);
    expect(windowErrors(stored())).toEqual([]);
  });
});

describe('a paste of a timing onto its other clip', () => {
  const timing = (fields: Partial<ClipTiming>): ClipTiming => ({
    from: 'c',
    start: 3,
    end: 6,
    intro: null,
    outro: null,
    ...fields,
  });

  it('is refused when the window would no longer fit in it', () => {
    const { project, a } = scene();
    const why =
      'the relation from “a” to “b” (4.00–5.00 s) would no longer fit in it, and track “Locked” is locked';
    expect(planTimingPaste(project, a, timing({ start: 4 }), 'start')).toEqual({
      ok: false,
      reason: why,
    });
    expect(planTimingPaste(project, a, timing({ start: 3, end: 4.5 }), 'duration')).toEqual({
      ok: false,
      reason: why,
    });
    expect(planTimingPaste(project, a, timing({ intro: 1.5 }), 'intro')).toEqual({
      ok: false,
      reason: why,
    });
    // As far as it fits, it is pasted.
    expect(planTimingPaste(project, a, timing({ start: 3.5 }), 'start')).toMatchObject({
      ok: true,
    });
    expect(planTimingPaste(project, a, timing({ intro: 1 }), 'intro')).toMatchObject({ ok: true });
  });

  it('moves the target with the window kept in its time', () => {
    const { project, a } = scene('to');
    const plan = planTimingPaste(project, a, timing({ start: 3.75 }), 'start');
    expect(plan).toEqual({ ok: true, change: { kind: 'move', start: 3.75, end: 6.75 } });
    const draft = structuredClone(project);
    if (plan.ok && plan.change) applyTimingChange(draft, a.id, plan.change);
    expect(draft.relations[0]!.offset).toBeCloseTo(0.25, 9);
    expect(windowOf(draft)).toEqual([4, 5]);
  });
});

describe('the intro or the outro of its other clip', () => {
  it('dragged on the timeline, stops at the window', () => {
    const { project, a } = scene();
    expect(phaseLimits(a, 'intro', project).max).toBe(1);
    // Without the project, as before: the clip's own room.
    expect(phaseLimits(a, 'intro').max).toBe(3);
    const target = scene('to');
    expect(phaseLimits(target.a, 'outro', target.project).max).toBe(1);
  });

  it('given from the clip’s menu, is shortened to fit, never added over the window', async () => {
    const { project, a } = scene();
    project.clips[0] = { ...a, intro: defaultIntro('none') };
    project.relations[0]!.offset = 3.5; // the window starts 0.5 s into a
    const plan = planPhase(project, project.clips[0], 'intro', 'write');
    expect(plan.locked?.relation.id).toBe('r');
    expect(plan.fitted?.intro.duration).toBe(0.5);
    expect(plan.conflicts.join(' ')).toMatch(/track “Locked” is locked: it stays where it plays/);
    loadProject(project);
    const asked = setClipPhase(a.id, 'intro', 'write');
    await Promise.resolve();
    const dialog = useDialogStore.getState().queue[0]!;
    // No «Add it anyway»: the window stays.
    expect(dialog.buttons.map((button) => button.id)).toEqual(['cancel', 'fit']);
    useDialogStore.getState().settle(dialog.key, 'fit');
    expect(await asked).toBe(true);
    expect(clipOf(stored(), a.id).intro).toMatchObject({ kind: 'write', duration: 0.5 });
    expect(windowErrors(stored())).toEqual([]);
  });

  it('given from the clip’s menu with no room before the window, is refused with a notice', async () => {
    const { project, a } = scene();
    project.clips[0] = { ...a, intro: defaultIntro('none') };
    project.relations[0]!.offset = 3.02;
    loadProject(project);
    history.clear();
    expect(await setClipPhase(a.id, 'intro', 'write')).toBe(false);
    expect(useDialogStore.getState().queue).toEqual([]);
    expect(notices()).toEqual([
      {
        title: 'No room for Write',
        message: `The relation from “a” to “b” (3.02–4.02 s) leaves the intro of “a” no room. ${LOCK}`,
      },
    ]);
    expect(clipOf(stored(), a.id).intro.kind).toBe('none');
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
  });
});

describe('deleting its other clip', () => {
  it('is refused with a notice that names the track; the other clips go', async () => {
    const { project, a, c } = scene();
    loadProject(project);
    expect(await deleteClipsAsking(new Set([a.id, c.id]))).toBe(true);
    expect(stored().clips.map((clip) => clip.id)).toEqual([a.id, 'cb']);
    expect(stored().relations).toHaveLength(1);
    expect(notices()).toEqual([
      {
        title: '“a” was not deleted',
        message: `The relation from “a” to “b” (4.00–5.00 s) would go with it. ${LOCK}`,
      },
    ]);
    // Alone, nothing is deleted.
    useNoticeStore.setState({ notices: [] });
    expect(await deleteClipsAsking(new Set([a.id]))).toBe(false);
    expect(stored().clips).toHaveLength(2);
    expect(notices()).toHaveLength(1);
  });

  it('several of them are named in one notice', async () => {
    const { project, a, c } = scene();
    project.relations.push({ ...createRelation('cb', c.id, { offset: 0, duration: 1 }), id: 'r2' });
    loadProject(project);
    expect(await deleteClipsAsking(new Set([a.id, c.id]))).toBe(false);
    expect(useNoticeStore.getState().notices.map((n) => [n.title, n.message, n.details])).toEqual([
      [
        '2 clips were not deleted',
        'A relation with a clip on a locked track would go with each. Unlock the track on the timeline to create, edit or delete relations of its clips.',
        [
          '“a”: the relation from “a” to “b” (4.00–5.00 s), track “Locked”.',
          '“c”: the relation from “b” to “c” (3.00–4.00 s), track “Locked”.',
        ],
      ],
    ]);
  });
});

/** Hold the confirmation that is asked, once it is. */
async function confirmAsked(): Promise<void> {
  await Promise.resolve();
  const dialog = useDialogStore.getState().queue[0]!;
  useDialogStore.getState().settle(dialog.key, 'confirm');
}

describe('deleting the track of its other clip (D187)', () => {
  it('is refused before any question, with the notice that names the locked track', async () => {
    const { project, a } = scene();
    loadProject(project);
    const track = stored().tracks.find((t) => t.id === a.trackId)!;
    expect(await deleteTrackAsking(track.id)).toBe(false);
    expect(useDialogStore.getState().queue).toHaveLength(0);
    expect(stored().tracks).toHaveLength(3);
    expect(stored().clips).toHaveLength(3);
    expect(stored().relations).toHaveLength(1);
    expect(notices()).toEqual([
      {
        title: `Track “${track.name}” was not deleted`,
        message: `The relation from “a” to “b” (4.00–5.00 s) would go with it. ${LOCK}`,
      },
    ]);
  });

  it('several relations are named in one notice', async () => {
    const { project, a } = scene();
    const d: Clip = { ...createClip('c', a.trackId, 6.5, 7.5), id: 'cd' };
    project.clips.push(d);
    project.relations.push({
      ...createRelation('cb', d.id, { offset: 0, duration: 0.5 }),
      id: 'r2',
    });
    loadProject(project);
    const track = stored().tracks.find((t) => t.id === a.trackId)!;
    expect(await deleteTrackAsking(track.id)).toBe(false);
    expect(useNoticeStore.getState().notices.map((n) => [n.title, n.message, n.details])).toEqual([
      [
        `Track “${track.name}” was not deleted`,
        '2 relations with a clip on a locked track would go with it. Unlock the track on the timeline to create, edit or delete relations of its clips.',
        [
          'The relation from “a” to “b” (4.00–5.00 s), track “Locked”.',
          'The relation from “b” to “c” (6.50–7.00 s), track “Locked”.',
        ],
      ],
    ]);
  });

  it('a track with no such relation is deleted as always, and so is the locked track itself', async () => {
    const { project, c } = scene();
    loadProject(project);
    const free = deleteTrackAsking(c.trackId);
    await confirmAsked();
    expect(await free).toBe(true);
    expect(stored().clips.map((clip) => clip.id)).toEqual(['ca', 'cb']);
    expect(notices()).toEqual([]);
    // The locked track goes with its clip and the relation: the lock holds the relation against
    // the edits of its other clip, not the track against its own deletion.
    const locked = stored().tracks.find((t) => t.locked)!;
    const gone = deleteTrackAsking(locked.id);
    await confirmAsked();
    expect(await gone).toBe(true);
    expect(stored().clips.map((clip) => clip.id)).toEqual(['ca']);
    expect(stored().relations).toHaveLength(0);
  });

  it('is refused too when the relation came while the question was open', async () => {
    const { project, a } = scene();
    project.relations = [];
    loadProject(project);
    const pending = deleteTrackAsking(a.trackId);
    await Promise.resolve();
    const dialog = useDialogStore.getState().queue[0]!;
    useProjectStore.getState().update((draft) => {
      draft.relations.push({ ...createRelation('ca', 'cb', { offset: 4, duration: 1 }), id: 'r' });
    });
    useDialogStore.getState().settle(dialog.key, 'confirm');
    expect(await pending).toBe(false);
    expect(stored().tracks).toHaveLength(3);
    expect(notices()).toHaveLength(1);
  });
});

describe('deleting the formula of its other clip (D187)', () => {
  it('is refused before any question, with the notice that names the locked track', async () => {
    const { project } = scene();
    loadProject(project);
    expect(await deleteFormulas(['a'])).toBe(false);
    expect(useDialogStore.getState().queue).toHaveLength(0);
    expect(stored().formulas.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    expect(stored().clips).toHaveLength(3);
    expect(stored().relations).toHaveLength(1);
    expect(notices()).toEqual([
      {
        title: '“a” was not deleted',
        message: `The relation from “a” to “b” (4.00–5.00 s) would go with it. ${LOCK}`,
      },
    ]);
  });

  it('the other formulas asked with it go; several kept are named in one notice', async () => {
    const { project } = scene();
    loadProject(project);
    const pending = deleteFormulas(['a', 'c']);
    await confirmAsked();
    expect(await pending).toBe(true);
    expect(stored().formulas.map((f) => f.id)).toEqual(['a', 'b']);
    expect(stored().clips.map((clip) => clip.id)).toEqual(['ca', 'cb']);
    expect(notices().map((n) => n.title)).toEqual(['“a” was not deleted']);
    // Two formulas kept: one notice, with a line for each.
    loadProject({
      ...scene().project,
      relations: [
        { ...createRelation('ca', 'cb', { offset: 4, duration: 1 }), id: 'r' },
        { ...createRelation('cb', 'cc', { offset: 0, duration: 1 }), id: 'r2' },
      ],
    });
    useNoticeStore.setState({ notices: [] });
    expect(await deleteFormulas(['a', 'c'])).toBe(false);
    expect(useNoticeStore.getState().notices.map((n) => [n.title, n.message, n.details])).toEqual([
      [
        '2 formulas were not deleted',
        'A relation with a clip on a locked track would go with each. Unlock the track on the timeline to create, edit or delete relations of its clips.',
        [
          '“a”: the relation from “a” to “b” (4.00–5.00 s), track “Locked”.',
          '“c”: the relation from “b” to “c” (3.00–4.00 s), track “Locked”.',
        ],
      ],
    ]);
  });

  it('the formula of the clip on the locked track is deleted as always', async () => {
    const { project } = scene();
    loadProject(project);
    const pending = deleteFormulas(['b']);
    await confirmAsked();
    expect(await pending).toBe(true);
    expect(stored().clips.map((clip) => clip.id)).toEqual(['ca', 'cc']);
    expect(stored().relations).toHaveLength(0);
    expect(notices()).toEqual([]);
  });
});

describe('splitting its other clip', () => {
  async function splitScene() {
    const s = await sceneWith({ a: 'x+y', b: 'w' });
    const locked = createTrack('Locked');
    locked.locked = true;
    s.project.tracks.push(locked);
    const a = plainClip(s, 'a', 0, 0, 10);
    const b = plainClip(s, 'b', 2, 0, 10);
    return { s, a, b };
  }

  it('is refused when the relation would go to its second half', async () => {
    const { s, a, b } = await splitScene();
    s.project.relations.push({
      ...createRelation(a.id, b.id, { offset: 6, duration: 1 }),
      id: 'r',
    });
    const plan = planSplit(s.project, [a.id], 5, { suffix: '_s', resolved: s.formulas });
    expect(plan.pieces).toEqual([]);
    expect(plan.refused).toEqual([
      {
        clipId: a.id,
        name: 'a',
        reason: `The relation from “a” to “b” (6.00–7.00 s) would go to the second half. ${LOCK}`,
      },
    ]);
  });

  it('goes on when the relation stays with its first half', async () => {
    const { s, a, b } = await splitScene();
    s.project.relations.push({
      ...createRelation(b.id, a.id, { offset: 2, duration: 1 }),
      id: 'r',
    });
    const plan = planSplit(s.project, [a.id], 5, { suffix: '_s', resolved: s.formulas });
    expect(plan.refused).toEqual([]);
    expect(plan.pieces).toHaveLength(1);
    expect(plan.project.relations).toEqual(s.project.relations);
  });
});
