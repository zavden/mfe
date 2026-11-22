// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAttach,
  createClip,
  createEmptyProject,
  createFitTween,
  createFormula,
  createPartTransform,
  createTween,
  type Clip,
  type Project,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { useTransformEdit } from '../../animations/transformEdit';
import { useNoticeStore } from '../../project/noticeStore';
import { useColourOrder } from '../colourOrder';
import { NUDGE_STEP, NUDGE_STEP_LARGE, nudgeSelection, nudgeTravel } from '../nudge';

const project = () => useProjectStore.getState().project;
const clip = (id: string) => project().clips.find((c) => c.id === id)!;
const position = (id: string) => clip(id).initial.position;
const select = (...ids: string[]) =>
  useUiStore.setState({ selection: ids.length ? { kind: 'clips', ids } : { kind: 'none' } });
const notices = () => useNoticeStore.getState().notices;

/** Press an arrow key, with Shift for the large step: whether the selection took it. */
const press = (key: string, shift = false) => nudgeSelection(nudgeTravel(key, shift)!);

/** Clips `a`, `b`… of formulas `Fa`, `Fb`… on one track, on screen from 0 to 10 s. */
function build(positions: Record<string, [number, number]>, edit?: (c: Clip) => void): Project {
  const p = createEmptyProject('t');
  p.formulas = Object.keys(positions).map((id) => ({
    ...createFormula({ name: `F${id}`, source: 'x' }),
    id: `f${id}`,
  }));
  const [top] = p.tracks;
  p.clips = Object.entries(positions).map(([id, at]) => {
    const c = createClip(`f${id}`, top!.id, 0, 10);
    c.id = id;
    c.initial.position = at;
    edit?.(c);
    return c;
  });
  return p;
}

function load(p: Project): void {
  loadProject(p);
  useUiStore.setState({ time: 5 });
  useTransformEdit.setState({ editing: null, unlocked: [] });
  useColourOrder.setState({ phase: null });
  useNoticeStore.getState().clear();
}

/** Put clip `id` on a track of its own that is locked. */
function lockTrackOf(p: Project, id: string): Project {
  p.tracks.push({ ...p.tracks[0]!, id: 'lockedTrack', locked: true });
  p.clips.find((c) => c.id === id)!.trackId = 'lockedTrack';
  return p;
}

beforeEach(() => load(build({ a: [0.29, 0.2], b: [-3, 1] })));

describe('nudgeTravel', () => {
  it('is 0.01 along the arrow, +y up; 0.1 with Shift; nothing for another key', () => {
    expect(NUDGE_STEP).toBe(0.01);
    expect(NUDGE_STEP_LARGE).toBe(0.1);
    expect(nudgeTravel('ArrowRight', false)).toEqual([0.01, 0]);
    expect(nudgeTravel('ArrowLeft', false)).toEqual([-0.01, 0]);
    expect(nudgeTravel('ArrowUp', false)).toEqual([0, 0.01]);
    expect(nudgeTravel('ArrowDown', false)).toEqual([0, -0.01]);
    expect(nudgeTravel('ArrowLeft', true)).toEqual([-0.1, 0]);
    expect(nudgeTravel('Home', false)).toBeNull();
    expect(nudgeTravel('a', true)).toBeNull();
  });
});

describe('nudgeSelection', () => {
  it('moves the selected clip by the step exactly, and stays on the hundredths', () => {
    select('a');
    expect(press('ArrowRight')).toBe(true);
    // 0.29 + 0.01 is 0.30000000000000004 in floating point.
    expect(position('a')).toEqual([0.3, 0.2]);
    expect(press('ArrowUp', true)).toBe(true);
    expect(position('a')).toEqual([0.3, 0.3]);
    for (let i = 0; i < 3; i++) press('ArrowLeft');
    press('ArrowDown');
    expect(position('a')).toEqual([0.27, 0.29]);
    expect(position('b')).toEqual([-3, 1]);
  });

  it('makes a run of presses one undo step', () => {
    select('a');
    for (let i = 0; i < 4; i++) press('ArrowRight');
    press('ArrowUp');
    expect(position('a')).toEqual([0.33, 0.21]);
    history.undo();
    expect(position('a')).toEqual([0.29, 0.2]);
    expect(history.canUndo()).toBe(false);
    history.redo();
    expect(position('a')).toEqual([0.33, 0.21]);
  });

  it('starts a new step after another edit, an undo, another instant or another selection', () => {
    select('a');
    press('ArrowRight');
    useProjectStore.getState().update((d) => {
      d.meta.name = 'edited';
    });
    press('ArrowRight');
    history.undo();
    expect(position('a')).toEqual([0.3, 0.2]); // the press before the edit stays
    expect(project().meta.name).toBe('edited');
    history.undo();
    history.undo();
    expect(position('a')).toEqual([0.29, 0.2]);

    load(build({ a: [0.29, 0.2], b: [-3, 1] }));
    select('a');
    press('ArrowRight');
    history.undo();
    press('ArrowRight'); // after the undo: a step of its own
    press('ArrowRight');
    history.undo();
    expect(position('a')).toEqual([0.29, 0.2]);
    expect(history.canUndo()).toBe(false);

    press('ArrowRight');
    useUiStore.setState({ time: 6 });
    press('ArrowRight');
    history.undo();
    expect(position('a')).toEqual([0.3, 0.2]);
    history.undo();

    press('ArrowRight');
    select('a'); // clicked again: the same clip, another selection
    press('ArrowRight');
    history.undo();
    expect(position('a')).toEqual([0.3, 0.2]);
  });

  it('keeps the run through derived data written without a step', () => {
    select('a');
    press('ArrowRight');
    useProjectStore.getState().amend((d) => {
      d.meta.name = 'derived';
    });
    press('ArrowRight');
    expect(position('a')).toEqual([0.31, 0.2]);
    history.undo();
    expect(position('a')).toEqual([0.29, 0.2]);
    expect(history.canUndo()).toBe(false);
  });

  it('moves every selected clip by the same step, in one undo step', () => {
    select('a', 'b');
    press('ArrowRight');
    press('ArrowUp');
    press('ArrowLeft', true);
    expect(position('a')).toEqual([0.2, 0.21]);
    expect(position('b')).toEqual([-3.09, 1.01]);
    history.undo();
    expect(position('a')).toEqual([0.29, 0.2]);
    expect(position('b')).toEqual([-3, 1]);
    expect(history.canUndo()).toBe(false);
  });

  it('leaves a clip on a locked track where it is, names it, and moves the others', () => {
    load(lockTrackOf(build({ a: [0.29, 0.2], b: [-3, 1] }), 'b'));
    select('a', 'b');
    expect(press('ArrowRight')).toBe(true);
    expect(position('a')).toEqual([0.3, 0.2]);
    expect(position('b')).toEqual([-3, 1]);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.title).toBe('1 clip stayed');
    expect(notices()[0]!.message).toContain('“Fb”');
    // Not again while that notice is up: a held key would stack them.
    press('ArrowRight');
    expect(notices()).toHaveLength(1);
    expect(position('a')).toEqual([0.31, 0.2]);
  });

  it('takes the key for a lone clip on a locked track, moves nothing and says why', () => {
    load(lockTrackOf(build({ a: [0.29, 0.2], b: [-3, 1] }), 'b'));
    select('b');
    const before = project();
    expect(press('ArrowRight')).toBe(true);
    expect(project()).toBe(before);
    expect(history.canUndo()).toBe(false);
    expect(notices().map((n) => n.title)).toEqual(['1 clip stayed']);
  });

  it('leaves the key alone with nothing selected on screen, or while a mode of the preview is on', () => {
    // b lasts longer than a: the scene does not end with a, which is gone after 10 s.
    load(
      build({ a: [0.29, 0.2], b: [-3, 1] }, (c) => {
        if (c.id === 'b') c.end = 20;
      }),
    );
    select();
    expect(press('ArrowRight')).toBe(false);
    select('a');
    useUiStore.setState({ time: 12 }); // after its clip
    expect(press('ArrowRight')).toBe(false);
    useUiStore.setState({ time: 5 });
    useColourOrder.setState({ phase: { step: 'copy', copied: [] } });
    expect(press('ArrowRight')).toBe(false);
    expect(position('a')).toEqual([0.29, 0.2]);
    expect(notices()).toEqual([]);
  });

  it('writes the keyframe a drag writes: the end state of a tween once the clip is unlocked', () => {
    load(
      build({ a: [0.29, 0.2], b: [-3, 1] }, (c) => {
        if (c.id === 'a')
          c.actions.push({ ...createTween(1, 1, { position: [2, 2] }), id: 'move' });
      }),
    );
    select('a');
    // At 5 s the clip is where its tween took it, and locked after that transformation.
    expect(press('ArrowRight')).toBe(true);
    expect(notices()[0]!.title).toContain('is locked after its first transformation');
    expect(history.canUndo()).toBe(false);
    useTransformEdit.setState({ unlocked: ['a'] });
    press('ArrowRight');
    const tween = clip('a').actions.find((x) => x.id === 'move');
    expect(tween).toMatchObject({ to: { position: [2.01, 2] } });
    expect(position('a')).toEqual([0.29, 0.2]);
  });

  it("moves a part's shift while its end state is under edit", () => {
    load(
      build({ a: [0.29, 0.2], b: [-3, 1] }, (c) => {
        if (c.id === 'a') c.actions.push({ ...createPartTransform(1, [0], {}), id: 'part' });
      }),
    );
    useTransformEdit.setState({ editing: { clipId: 'a', actionId: 'part', time: 5 } });
    useUiStore.setState({ selection: { kind: 'action', clipId: 'a', actionId: 'part' } });
    press('ArrowDown', true);
    expect(clip('a').actions.find((x) => x.id === 'part')).toMatchObject({ shift: [0, -0.1] });
    expect(position('a')).toEqual([0.29, 0.2]);
  });

  it('leaves an attached object to what it hangs on, as a drag does', () => {
    load(
      build({ a: [0.29, 0.2], b: [-3, 1], c: [1, -1] }, (c) => {
        if (c.id === 'c') c.attach = createAttach('a', 'all');
      }),
    );
    // Alone, it says why, with the notice of a drag.
    select('c');
    expect(press('ArrowRight')).toBe(true);
    expect(position('c')).toEqual([1, -1]);
    expect(notices()[0]!.title).toBe('Attached to Fa · Detach to move');
    useNoticeStore.getState().clear();
    // With what it hangs on, that moves and it follows it: nothing to say.
    select('a', 'c');
    press('ArrowRight');
    expect(position('a')).toEqual([0.3, 0.2]);
    expect(notices()).toEqual([]);
    // With another clip, it stays and is named.
    select('b', 'c');
    press('ArrowRight');
    expect(position('b')).toEqual([-2.99, 1]);
    expect(notices()[0]!.message).toContain('“Fc”');
  });

  it('leaves a shape alone while a Transform has carried it to other glyphs', () => {
    load(
      build({ a: [0.29, 0.2], b: [-3, 1], c: [1, -1] }, (c) => {
        if (c.id === 'c') c.actions.push(createFitTween(1, 1, { clipId: 'a', glyphs: 'all' }));
      }),
    );
    select('c');
    expect(press('ArrowRight')).toBe(true);
    expect(notices()[0]!.title).toBe('Carried to Fa by its Transform');
    expect(history.canUndo()).toBe(false);
  });

  it('gives up a drag still held, and moves from where the selection is without it', () => {
    select('a');
    const drag = history.beginGesture();
    drag.update((d) => {
      d.clips[0]!.initial.position = [4, 4];
    });
    expect(position('a')).toEqual([4, 4]);
    press('ArrowRight');
    expect(drag.active).toBe(false);
    expect(position('a')).toEqual([0.3, 0.2]);
    history.undo();
    expect(position('a')).toEqual([0.29, 0.2]);
    expect(history.canUndo()).toBe(false);
  });
});
