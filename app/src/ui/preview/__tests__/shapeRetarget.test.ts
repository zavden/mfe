/* «To another formula or glyphs…» (shapeRetarget.ts, D123): what is chosen in the preview for a
 * shape to go to, the Transform that is planned from it and what making it does. */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createBraceAttach,
  createBraceFormula,
  createClip,
  createEmptyProject,
  createFitTween,
  createFormula,
  createShapeAttach,
  createShapeFormula,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  type Clip,
  type Project,
  type TweenAction,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { useNoticeStore } from '../../project/noticeStore';
import {
  chosenTargets,
  confirmRetarget,
  planRetarget,
  retargetHint,
  shapeLock,
  startRetarget,
  startShapeRetargetTracking,
  targetNames,
  useShapeRetarget,
} from '../shapeRetarget';

const snapshot = (glyphs: number) => ({
  backend: 'mathjax' as const,
  key: 'k',
  glyphs: Array.from({ length: glyphs }, (_, i) => ({
    label: String(i),
    center: [i, 0] as [number, number],
    size: [1, 1] as [number, number],
  })),
});
const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

let cf: Clip;
let cg: Clip;
let cs: Clip;
const project = () => useProjectStore.getState().project;
const shape = () => project().clips.find((c) => c.id === cs.id)!;
const notices = () => useNoticeStore.getState().notices;

/** f1 over [0, 8), written in 1 s, and f2 over [2, 8), faded in in 1 s; a box s1 around f1 from
 * 1 s. The playhead at 4 s. */
beforeEach(() => {
  const p = createEmptyProject();
  p.tracks = ['Track 3', 'Track 2', 'Track 1'].map((name) => createTrack(name));
  const f = createFormula({ name: 'f1', source: 'a+b', snapshot: snapshot(3) });
  const g = createFormula({ name: 'f2', source: 'c=d', snapshot: snapshot(3) });
  // With its one glyph, as the render sync leaves it: what two blocks at once would both animate.
  const s = createShapeFormula({ name: 's1', width: 2, height: 1, snapshot: snapshot(1) });
  p.formulas.push(f, g, s);
  cf = createClip(f.id, p.tracks[2]!.id, 0, 8, { ...none, intro: defaultIntro('write') });
  cg = createClip(g.id, p.tracks[1]!.id, 2, 8, { ...none, intro: defaultIntro('fade_in') });
  cs = createClip(s.id, p.tracks[0]!.id, 1, 8, {
    ...none,
    attach: createShapeAttach(cf.id, 'all'),
  });
  p.clips.push(cf, cg, cs);
  loadProject(p);
  useUiStore.setState({ selection: { kind: 'clips', ids: [cs.id] }, time: 4 });
  useShapeRetarget.setState({ request: null });
  useNoticeStore.setState({ notices: [] });
});

describe('chosenTargets', () => {
  it('are the selected objects, each whole, without the shape itself', () => {
    const p = project();
    expect(chosenTargets(p, { kind: 'clips', ids: [cs.id] }, null, cs.id)).toEqual([]);
    expect(chosenTargets(p, { kind: 'clips', ids: [cg.id, cs.id, cf.id] }, null, cs.id)).toEqual([
      { clipId: cg.id, glyphs: 'all' },
      { clipId: cf.id, glyphs: 'all' },
    ]);
    expect(chosenTargets(p, { kind: 'none' }, null, cs.id)).toEqual([]);
    expect(chosenTargets(p, { kind: 'clips', ids: ['audio-or-gone'] }, null, cs.id)).toEqual([]);
  });

  it('are the picked symbols when there are some, formula by formula', () => {
    const picked = [
      { clipId: cg.id, glyphs: [0, 1] },
      { clipId: cf.id, glyphs: 'all' as const },
    ];
    expect(chosenTargets(project(), { kind: 'clips', ids: [cg.id, cf.id] }, picked, cs.id)).toEqual(
      picked,
    );
    expect(targetNames(project(), picked)).toBe('f2 and f1');
  });
});

describe('planRetarget', () => {
  it('plans a Transform of 1 s at the playhead that goes to the targets, the others beside the first', () => {
    const plan = planRetarget(
      project(),
      { clipId: cs.id },
      [
        { clipId: cg.id, glyphs: [0] },
        { clipId: cf.id, glyphs: 'all' },
      ],
      4,
    );
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.replaces).toBe(false);
    // The box's clip starts at 1 s: 3 s into it.
    expect(plan.action).toMatchObject({
      kind: 'tween',
      start: 3,
      duration: 1,
      to: {},
      fit: {
        clipId: cg.id,
        glyphs: [0],
        also: [{ clipId: cf.id, glyphs: 'all' }],
        fitted: null,
      },
    });
  });

  it('moves it into free time, as any new Transform', () => {
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === cs.id)!.actions.push(createTween(2.5, 1, { opacity: 0.5 }));
    });
    const plan = planRetarget(project(), { clipId: cs.id }, [{ clipId: cg.id, glyphs: 'all' }], 4);
    if (!plan.ok) throw new Error(plan.reason);
    // [3.5, 4.5) of the scene is taken: the nearest free second.
    const start = 1 + plan.action.start;
    expect(start + plan.action.duration <= 3.5 + 1e-9 || start >= 4.5 - 1e-9).toBe(true);
  });

  it('is refused with nothing chosen, and on what is not a shape', () => {
    const empty = planRetarget(project(), { clipId: cs.id }, [], 4);
    expect(!empty.ok && empty.reason).toMatch(/Nothing is chosen yet/);
    const formula = planRetarget(
      project(),
      { clipId: cf.id },
      [{ clipId: cg.id, glyphs: 'all' }],
      4,
    );
    expect(!formula.ok && formula.reason).toMatch(/no longer exists/);
  });

  it('is refused on a locked track, for a new Transform and for another target of one', () => {
    const tween = createFitTween(2, 1, { clipId: cf.id, glyphs: 'all' });
    const locked: Project = {
      ...project(),
      tracks: project().tracks.map((t, i) => (i === 0 ? { ...t, locked: true } : t)),
      clips: project().clips.map((c) => (c.id === cs.id ? { ...c, actions: [tween] } : c)),
    };
    const reason =
      'Track “Track 3” is locked: unlock it on the timeline to give its shapes a Transform.';
    expect(shapeLock(locked, cs.id)).toBe(reason);
    expect(shapeLock(project(), cs.id)).toBeNull();
    const target = [{ clipId: cg.id, glyphs: 'all' as const }];
    expect(planRetarget(locked, { clipId: cs.id }, target, 4)).toEqual({ ok: false, reason });
    expect(planRetarget(locked, { clipId: cs.id, actionId: tween.id }, target, 4)).toEqual({
      ok: false,
      reason,
    });
  });

  it('is refused when its target is still being drawn then, with what validation says', () => {
    // f2 fades in over [2, 3): at 2.5 s Manim would measure it half drawn.
    const plan = planRetarget(
      project(),
      { clipId: cs.id },
      [{ clipId: cg.id, glyphs: 'all' }],
      2.5,
    );
    expect(!plan.ok && plan.reason).toMatch(
      /The Transform of "s1" goes to .* of "f2" while the intro/,
    );
  });

  it('is refused for a target that hangs on the shape itself', () => {
    useProjectStore.getState().update((draft) => {
      const brace = createBraceFormula({ name: 'b1' });
      draft.formulas.push(brace);
      draft.tracks.push(createTrack('Track 4'));
      draft.clips.push({
        ...createClip(brace.id, draft.tracks[3]!.id, 2, 8, {
          ...none,
          attach: createBraceAttach(cs.id, 'all'),
        }),
        id: 'cb',
      });
    });
    const plan = planRetarget(project(), { clipId: cs.id }, [{ clipId: 'cb', glyphs: 'all' }], 4);
    expect(!plan.ok && plan.reason).toMatch(/goes round/);
  });

  it('gives the Transform being edited its new targets, keeping its time and what it arrives with', () => {
    const first = planRetarget(project(), { clipId: cs.id }, [{ clipId: cg.id, glyphs: 'all' }], 4);
    if (!first.ok) throw new Error(first.reason);
    const tween: TweenAction = {
      ...first.action,
      easing: 'linear',
      to: { opacity: 0.5 },
      fit: { ...first.action.fit!, fitted: { center: [1, 1], width: 2, height: 1 } },
    };
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === cs.id)!.actions.push(tween);
    });
    const again = planRetarget(
      project(),
      { clipId: cs.id, actionId: tween.id },
      [{ clipId: cf.id, glyphs: [1, 2] }],
      6,
    );
    if (!again.ok) throw new Error(again.reason);
    expect(again.replaces).toBe(true);
    expect(again.action).toMatchObject({
      id: tween.id,
      start: tween.start,
      duration: 1,
      easing: 'linear',
      to: { opacity: 0.5 },
      // Not fitted yet to the new target: the attach sync measures it.
      fit: { clipId: cf.id, glyphs: [1, 2], fitted: null },
    });
    expect('also' in again.action.fit!).toBe(false);
  });
});

describe('the mode', () => {
  it('starts on a shape, lets the picked symbols go, and says how to choose', () => {
    startRetarget(cs.id);
    expect(useShapeRetarget.getState().request).toEqual({ clipId: cs.id });
    expect(retargetHint('s1', '', false, false)).toBe(
      'Transform “s1”: click a formula (Ctrl/⌘ adds more), or hold Alt and pick symbols · nothing chosen yet · Enter makes it at the playhead · Esc cancels',
    );
    expect(retargetHint('s1', 'f2 and f1', true, false)).toMatch(
      /^Another target for the Transform of “s1”: .* · to f2 and f1 · Enter/,
    );
    // On a Mac its keys are written the Mac's way — and a name that is a key's word is a name.
    expect(retargetHint('Alt', 'Shift and Enter', false, true)).toBe(
      'Transform “Alt”: click a formula (⌘ adds more), or hold ⌥ and pick symbols · to Shift and Enter · ↩ makes it at the playhead · Esc cancels',
    );
  });

  it('does not start on a locked track, and says so', () => {
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    startRetarget(cs.id);
    expect(useShapeRetarget.getState().request).toBeNull();
    expect(notices()[0]).toMatchObject({
      title: 'The track is locked',
      message:
        'Track “Track 3” is locked: unlock it on the timeline to give its shapes a Transform.',
    });
  });

  it('makes nothing once the track of its shape was locked while choosing, and stays on', () => {
    history.clear();
    startRetarget(cs.id);
    // The lock of the track's header, pressed with the mode on.
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    useUiStore.getState().select({ kind: 'clips', ids: [cg.id] });
    expect(confirmRetarget()).toBe(false);
    expect(shape().actions).toEqual([]);
    expect(notices().at(-1)).toMatchObject({
      kind: 'warning',
      title: 'No Transform made',
      message:
        'Track “Track 3” is locked: unlock it on the timeline to give its shapes a Transform.',
    });
    // As after any other refusal: unlocked, the same choice makes it.
    expect(useShapeRetarget.getState().request).toEqual({ clipId: cs.id });
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = false;
    });
    expect(confirmRetarget()).toBe(true);
    expect(shape().actions).toHaveLength(1);
  });

  it('does not give a Transform another target once its track was locked (Pick again)', () => {
    startRetarget(cs.id);
    useUiStore.getState().select({ kind: 'clips', ids: [cg.id] });
    confirmRetarget();
    const before = shape().actions;
    startRetarget(cs.id, before[0]!.id);
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    useUiStore.getState().select({ kind: 'clips', ids: [cf.id, cg.id] });
    expect(confirmRetarget()).toBe(false);
    expect(shape().actions).toEqual(before);
    expect(notices().at(-1)).toMatchObject({ title: 'No Transform made' });
  });

  it('makes the Transform to the selected formula: one undo step, the block selected, the mode left', () => {
    history.clear();
    startRetarget(cs.id);
    // Nothing chosen: refused, and the mode stays on.
    expect(confirmRetarget()).toBe(false);
    expect(notices()[0]).toMatchObject({ title: 'No Transform made' });
    expect(useShapeRetarget.getState().request).not.toBeNull();
    useUiStore.getState().select({ kind: 'clips', ids: [cg.id] });
    expect(confirmRetarget()).toBe(true);
    const [tween] = shape().actions as TweenAction[];
    expect(tween).toMatchObject({ kind: 'tween', start: 3, fit: { clipId: cg.id, glyphs: 'all' } });
    expect(useShapeRetarget.getState().request).toBeNull();
    expect(useUiStore.getState().selection).toEqual({
      kind: 'action',
      clipId: cs.id,
      actionId: tween!.id,
    });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    history.undo();
    expect(shape().actions).toEqual([]);
  });

  it('gives up the gesture of another before it plans: the Transform is where it goes with none', () => {
    history.clear();
    startRetarget(cs.id);
    useUiStore.getState().select({ kind: 'clips', ids: [cg.id] });
    // The start of the shape's clip, dragged from 1 s to 3 s and still held when Enter comes.
    history.beginGesture().update((draft) => {
      draft.clips.find((c) => c.id === cs.id)!.start = 3;
    });
    expect(confirmRetarget()).toBe(true);
    expect(history.isGesturing()).toBe(false);
    expect(shape().start).toBe(1);
    // At the playhead (4 s) in the clip that starts at 1 s again, not in the one the drag showed.
    expect(shape().actions).toHaveLength(1);
    expect(shape().actions[0]).toMatchObject({ kind: 'tween', start: 3 });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('gives a Transform another target with Pick again', () => {
    startRetarget(cs.id);
    useUiStore.getState().select({ kind: 'clips', ids: [cg.id] });
    confirmRetarget();
    const id = shape().actions[0]!.id;
    startRetarget(cs.id, id);
    expect(useShapeRetarget.getState().request).toEqual({ clipId: cs.id, actionId: id });
    useUiStore.getState().select({ kind: 'clips', ids: [cf.id, cg.id] });
    expect(confirmRetarget()).toBe(true);
    expect(shape().actions).toHaveLength(1);
    expect((shape().actions[0] as TweenAction).fit).toEqual({
      clipId: cf.id,
      glyphs: 'all',
      also: [{ clipId: cg.id, glyphs: 'all' }],
      fitted: null,
    });
  });

  it('is left when its shape, or the Transform it edits, goes', () => {
    const stop = startShapeRetargetTracking();
    try {
      startRetarget(cs.id);
      useUiStore.getState().select({ kind: 'clips', ids: [cg.id] });
      confirmRetarget();
      const id = shape().actions[0]!.id;
      startRetarget(cs.id, id);
      history.undo(); // the Transform is gone
      expect(useShapeRetarget.getState().request).toBeNull();
      startRetarget(cs.id);
      useProjectStore.getState().update((draft: Project) => {
        draft.clips = draft.clips.filter((c) => c.id !== cs.id);
      });
      expect(useShapeRetarget.getState().request).toBeNull();
    } finally {
      stop();
    }
  });
});
