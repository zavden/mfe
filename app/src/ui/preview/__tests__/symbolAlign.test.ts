// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import {
  createAttach,
  createClip,
  createEmptyProject,
  createFormula,
  createTween,
  type Project,
} from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { useTransformEdit } from '../../animations/transformEdit';
import { useNoticeStore } from '../../project/noticeStore';
import {
  symbolAlignHint,
  toggleLockedSymbolAlign,
  useSymbolAlign,
  type ClickedGlyph,
} from '../symbolAlign';
import { boxSnapshot, resolvedBoxes } from './resolvedBoxes';

const project = () => useProjectStore.getState().project;
const position = (id: string) => project().clips.find((c) => c.id === id)!.initial.position;
const store = () => useSymbolAlign.getState();
const notices = () => useNoticeStore.getState().notices;

/** Every formula is one square glyph, 1 by 1, centred on its origin. */
const SQUARE: Box = { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 };

/** Formula a at (0, 0) and b at (3, 2), both until 10 s; `lock` puts b on a locked track. */
function build(lock = false): Project {
  const p = createEmptyProject('t');
  p.formulas = ['a', 'b'].map((id) => ({
    ...createFormula({
      name: `F${id}`,
      source: '=',
      snapshot: boxSnapshot([SQUARE], '='),
    }),
    id: `f${id}`,
  }));
  const [top] = p.tracks;
  if (lock)
    p.tracks.push({
      id: 'locked',
      kind: 'visual',
      name: 'L',
      hidden: false,
      muted: false,
      locked: true,
    });
  p.clips = ['a', 'b'].map((id) => {
    const c = createClip(`f${id}`, id === 'b' && lock ? 'locked' : top!.id, 0, 10);
    c.id = id;
    c.initial.position = id === 'a' ? [0, 0] : [3, 2];
    return c;
  });
  return p;
}

function load(p: Project): void {
  loadProject(p);
  useRenderStore.setState({
    resolved: new Map(p.formulas.map((f) => [f.id, resolvedBoxes(f, [SQUARE], '=')])),
  });
}

/** The glyph of a clip's formula as the preview reports a click on it. */
const glyph = (clipId: string, label = '='): ClickedGlyph => ({
  clipId,
  glyph: 0,
  key: `${clipId}:0`,
  label,
});
const at = { x: 10, y: 20 };

beforeEach(() => {
  load(build());
  useUiStore.setState({ time: 5, selection: { kind: 'none' } });
  useTransformEdit.setState({ editing: null, unlocked: [] });
  useNoticeStore.getState().clear();
  useSymbolAlign.setState({ phase: null, source: 'unlocked' });
});

describe('the align-by-symbol mode', () => {
  it('walks target → reference → direction: what moves first, then where it goes', () => {
    expect(store().phase).toBeNull();
    store().toggle();
    expect(store().phase).toEqual({ step: 'target' });
    expect(symbolAlignHint(store().phase)).toContain('click the symbol to move');
    const target = glyph('b');
    store().pick(target, at);
    expect(store().phase).toMatchObject({ step: 'reference', target });
    expect(symbolAlignHint(store().phase)).toContain('the reference symbol on another formula');
    expect(symbolAlignHint(store().phase)).toContain('“=” goes to it');
    store().pick(glyph('b'), at); // the formula that moves: no reference for itself
    expect(store().phase).toMatchObject({ step: 'reference' });
    const ref = glyph('a');
    store().pick(ref, at);
    expect(store().phase).toMatchObject({ step: 'direction', reference: ref, target, at });
    expect(symbolAlignHint(store().phase)).toBeNull();
    store().toggle(); // the shortcut leaves the mode
    expect(store().phase).toBeNull();
    store().cancel();
    expect(store().phase).toBeNull();
  });

  it('gives up a drag still held before it measures: B lands on the reference all the same', () => {
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    // B dragged in the preview, the button still held when the direction is pressed.
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.clips.find((c) => c.id === 'b')!.initial.position = [5, 2];
    });
    expect(store().apply('LEFT')).toBe(true);
    expect(gesture.active).toBe(false);
    expect(position('b')).toEqual([0, 2]);
    history.undo();
    expect(position('b')).toEqual([3, 2]);
  });

  it('moves the whole formula B so that its symbol lands on the reference, in one undo step', () => {
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    expect(store().apply('LEFT')).toBe(true);
    expect(position('b')).toEqual([0, 2]); // moved by -3 in x, nothing in y
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: ['b'] });
    expect(store().phase).toBeNull();
    history.undo();
    expect(position('b')).toEqual([3, 2]);
    expect(history.canUndo()).toBe(false);
    // A corner moves both axes; the centre too.
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    expect(store().apply('DR')).toBe(true);
    expect(position('b')).toEqual([0, 0]);
  });

  it('moves by the symbol it took when its formula was rendered again with other indices', () => {
    // b is two squares, a unit left and a unit right of its origin; its left one is taken.
    const LEFT: Box = { minX: -1.5, minY: -0.5, maxX: -0.5, maxY: 0.5 };
    const RIGHT: Box = { minX: 0.5, minY: -0.5, maxX: 1.5, maxY: 0.5 };
    const p = build();
    p.formulas[1]!.snapshot = boxSnapshot([LEFT, RIGHT], '=');
    loadProject(p);
    const resolve = (boxes: Box[]) =>
      useRenderStore.setState({
        resolved: new Map([
          ['fa', resolvedBoxes(project().formulas[0]!, [SQUARE], '=')],
          ['fb', resolvedBoxes(project().formulas[1]!, boxes, '=')],
        ]),
      });
    resolve([LEFT, RIGHT]);
    store().toggle();
    store().pick(glyph('b'), at); // glyph 0: the left square
    // The formula is rendered again: the same squares, numbered the other way round. Nothing
    // follows the stores here: the mode reads its symbols again when it measures them.
    useRenderStore.getState().setTransition('fb', { from: 'test', to: 'again', map: [1, 0] });
    useProjectStore.getState().amend((d) => {
      d.formulas[1]!.snapshot = { ...boxSnapshot([RIGHT, LEFT], '='), key: 'again' };
    });
    resolve([RIGHT, LEFT]);
    store().pick(glyph('a'), at);
    expect(store().apply('CENTER')).toBe(true);
    // The left square, a unit left of b's origin, is on a's centre: not the right one.
    expect(position('b')).toEqual([1, 0]);
  });

  it('follows the reference alone when only its formula was rendered again', () => {
    // a is two squares; its left one is the reference. b, one square, is what moves.
    const LEFT: Box = { minX: -1.5, minY: -0.5, maxX: -0.5, maxY: 0.5 };
    const RIGHT: Box = { minX: 0.5, minY: -0.5, maxX: 1.5, maxY: 0.5 };
    const p = build();
    p.formulas[0]!.snapshot = boxSnapshot([LEFT, RIGHT], '=');
    loadProject(p);
    const resolve = (boxes: Box[]) =>
      useRenderStore.setState({
        resolved: new Map([
          ['fa', resolvedBoxes(project().formulas[0]!, boxes, '=')],
          ['fb', resolvedBoxes(project().formulas[1]!, [SQUARE], '=')],
        ]),
      });
    resolve([LEFT, RIGHT]);
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at); // glyph 0 of a: its left square
    const before = store().phase;
    useRenderStore.getState().setTransition('fa', { from: 'test', to: 'again', map: [1, 0] });
    useProjectStore.getState().amend((d) => {
      d.formulas[0]!.snapshot = { ...boxSnapshot([RIGHT, LEFT], '='), key: 'again' };
    });
    resolve([RIGHT, LEFT]);
    const now = store().current();
    expect(now).toMatchObject({
      step: 'direction',
      reference: { clipId: 'a', glyph: 1, key: 'a:1' },
    });
    // The symbol of the formula that was not touched is the very one it was.
    expect(now?.step === 'direction' && now.target).toBe(
      before?.step === 'direction' && before.target,
    );
    expect(store().apply('CENTER')).toBe(true);
    expect(position('b')).toEqual([-1, 0]); // on a's left square, a unit left of a's origin
  });

  it('measures the symbols where they are when the side is chosen, not when they were clicked', () => {
    useProjectStore.getState().update((d) => {
      // a moves 3 units right between 1 s and 2 s; b sits further right.
      d.clips.find((c) => c.id === 'a')!.actions.push(createTween(1, 1, { position: [3, 0] }));
      d.clips.find((c) => c.id === 'b')!.initial.position = [6, 2];
    });
    history.clear();
    useUiStore.setState({ time: 0.5 });
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at); // a is at x = 0 now
    useUiStore.getState().setTime(3); // the tween is over: a is at x = 3
    expect(store().apply('LEFT')).toBe(true);
    expect(position('b')).toEqual([3, 2]); // b's left edge meets a's at 2.5, not at -0.5
    // A symbol that is no longer on screen when the side comes: nothing moves, a notice says so.
    useProjectStore.getState().update((d) => {
      d.clips.find((c) => c.id === 'a')!.end = 8;
    });
    history.clear();
    useUiStore.setState({ time: 5 });
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    useUiStore.getState().setTime(9);
    expect(store().apply('LEFT')).toBe(false);
    expect(position('b')).toEqual([3, 2]);
    expect(history.canUndo()).toBe(false);
    expect(notices()[0]!.title).toBe('Nothing to align');
  });

  it('does nothing without a direction step, or when the symbols already line up', () => {
    expect(store().apply('LEFT')).toBe(false);
    useProjectStore.getState().update((d) => {
      d.clips.find((c) => c.id === 'b')!.initial.position = [0, 5]; // the left edges meet already
    });
    history.clear();
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    expect(store().apply('LEFT')).toBe(false);
    expect(history.canUndo()).toBe(false);
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: ['b'] });
  });

  it('has a form whose reference is on a formula locked in the preview (Shift+Alt+G)', () => {
    // Nothing locked: nothing could be clicked, so the mode is not entered and a notice says how
    // a formula is locked.
    toggleLockedSymbolAlign();
    expect(store().phase).toBeNull();
    expect(notices()[0]!.title).toBe('No formula is locked in the preview');
    useNoticeStore.getState().clear();
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === 'a')!.previewLocked = true;
    });
    toggleLockedSymbolAlign();
    expect(store()).toMatchObject({ phase: { step: 'target' }, source: 'locked' });
    expect(symbolAlignHint(store().phase, store().source)).toContain('click the symbol to move');
    expect(notices()).toHaveLength(0);
    // The same shortcut leaves that form; the plain one starts over in its own.
    toggleLockedSymbolAlign();
    expect(store().phase).toBeNull();
    toggleLockedSymbolAlign();
    store().pick(glyph('b'), at);
    store().toggle();
    expect(store()).toMatchObject({ phase: { step: 'target' }, source: 'unlocked' });
    store().toggle('locked');
    expect(store()).toMatchObject({ phase: { step: 'target' }, source: 'locked' });
    // The formula that moves first; then the reference, which is on a locked formula and stays.
    const [reference, moving] = [position('a'), position('b')];
    store().pick(glyph('b'), at);
    expect(symbolAlignHint(store().phase, store().source)).toContain(
      'the reference symbol on a locked formula: “=” goes to it',
    );
    store().pick(glyph('a'), at);
    expect(store().apply('LEFT')).toBe(true);
    expect(position('a')).toEqual(reference);
    expect(position('b')).not.toEqual(moving);
    expect(store().phase).toBeNull();
  });

  it('never moves a formula locked in the preview: as the symbol to align, it stays', () => {
    const before = position('b');
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === 'b')!.previewLocked = true;
    });
    history.clear();
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    expect(store().apply('LEFT')).toBe(false);
    expect(position('b')).toEqual(before);
    expect(notices()[0]!.title).toBe('1 clip stayed');
    expect(notices()[0]!.message).toContain('locked in the preview');
    expect(history.canUndo()).toBe(false);
  });

  it('leaves a formula that cannot be edited now where it is, with a notice', () => {
    load(build(true)); // b on a locked track
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    expect(store().apply('LEFT')).toBe(false);
    expect(position('b')).toEqual([3, 2]);
    expect(notices()[0]!.title).toBe('1 clip stayed');
    // Locked after a transformation too.
    load(build());
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === 'b')!.actions.push(createTween(1, 1, {}));
    });
    history.clear();
    useNoticeStore.getState().clear();
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    expect(store().apply('UP')).toBe(false);
    expect(notices()).toHaveLength(1);
  });

  it('does not move a formula that hangs on another one: its place is derived', () => {
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === 'b')!.attach = createAttach('a', 'all');
    });
    history.clear();
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    expect(store().apply('LEFT')).toBe(false);
    expect(position('b')).toEqual([3, 2]);
    expect(history.canUndo()).toBe(false);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.title).toBe('“Fb” was not moved');
    expect(notices()[0]!.message).toContain('“Fb” is attached to “Fa”');
    expect(store().phase).toBeNull();
  });

  it('does not move a formula while one of its transformations runs: it would not line up', () => {
    let tweenId = '';
    useProjectStore.getState().update((draft) => {
      const tween = createTween(4, 2, { opacity: 0.5 }, 'linear'); // 4 s to 6 s
      tweenId = tween.id;
      draft.clips.find((c) => c.id === 'b')!.actions.push(tween);
    });
    history.clear();
    useTransformEdit.setState({ unlocked: ['b'] });
    // At 5 s the keyframe is the end of that transformation, and half of a shift of it shows.
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    expect(store().apply('LEFT')).toBe(false);
    const tween = project()
      .clips.find((c) => c.id === 'b')!
      .actions.find((a) => a.id === tweenId)!;
    expect(tween).toMatchObject({ kind: 'tween', to: { opacity: 0.5 } });
    expect(tween.kind === 'tween' && tween.to.position).toBeUndefined();
    expect(history.canUndo()).toBe(false);
    expect(notices()[0]!.title).toBe('“Fb” was not moved');
    expect(notices()[0]!.message).toContain(
      '“=” is moving at 5.00 s: a transformation of the formula runs from 4.00 s to 6.00 s',
    );
    expect(notices()[0]!.message).toContain('Align it at a time when it is at rest.');
    // Once it is over, its end is what moves.
    useNoticeStore.getState().clear();
    useUiStore.setState({ time: 6 });
    store().toggle();
    store().pick(glyph('b'), at);
    store().pick(glyph('a'), at);
    expect(store().apply('LEFT')).toBe(true);
    expect(notices()).toHaveLength(0);
  });
});

describe('align by symbol between two instants (G keeps the symbol to move)', () => {
  /** Formula a at (0, 0) from 0 s to 5 s, then b at (3, 2) from 5 s to 10 s: never together. */
  function apart(): Project {
    const p = build();
    p.clips.find((c) => c.id === 'a')!.end = 5;
    p.clips.find((c) => c.id === 'b')!.start = 5;
    return p;
  }
  const held = () => {
    const { phase } = store();
    return phase && phase.step !== 'target' ? phase.held : undefined;
  };
  /** Alt+G, the symbol of b at `from`, G, then the symbol of a at `to`. */
  function keepAndPick(from: number, to: number): void {
    useUiStore.setState({ time: from });
    store().toggle();
    store().pick(glyph('b'), at);
    store().hold();
    useUiStore.getState().setTime(to);
    store().pick(glyph('a'), at);
  }

  beforeEach(() => {
    load(apart());
    history.clear();
  });

  it('measures the kept symbol at its instant and moves the keyframe in effect there', () => {
    useUiStore.setState({ time: 7 });
    store().toggle();
    store().pick(glyph('b'), at);
    expect(held()).toBeNull();
    expect(symbolAlignHint(store().phase)).toContain('G keeps “=” as it is now');
    store().hold();
    expect(held()).toEqual({ at: 7, editing: null });
    expect(symbolAlignHint(store().phase)).toBe(
      '“=” kept as at 7.00 s · go to another time and click (or arrow to) the reference symbol ' +
        'on another formula · G lets it go · Esc cancels',
    );
    // At 2 s only a is on screen: its symbol is the reference, and b is still measured at 7 s.
    useUiStore.getState().setTime(2);
    store().pick(glyph('a'), at);
    expect(store().phase).toMatchObject({ step: 'direction', held: { at: 7 } });
    expect(store().apply('LEFT')).toBe(true);
    expect(position('b')).toEqual([0, 2]);
    // The playhead stays, the moved formula is selected, and a notice says what was done.
    expect(useUiStore.getState().time).toBe(2);
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: ['b'] });
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toMatchObject({
      kind: 'info',
      title: '“Fb” moved',
      message: 'The left edge of its “=” as at 7.00 s is on that of “=” of “Fa” as at 2.00 s.',
    });
    expect(notices()[0]!.details).toBeUndefined();
    // One undo step, and nothing else of the project changed.
    history.undo();
    expect(position('b')).toEqual([3, 2]);
    expect(history.canUndo()).toBe(false);
  });

  it('lets the symbol go with G again, and keeps nothing outside the reference step', () => {
    store().hold(); // no mode
    expect(store().phase).toBeNull();
    useUiStore.setState({ time: 7 });
    store().toggle();
    store().hold(); // no symbol to keep yet
    expect(store().phase).toEqual({ step: 'target' });
    store().pick(glyph('b'), at);
    store().hold();
    store().hold();
    expect(held()).toBeNull();
    expect(notices()).toHaveLength(0);
    // Kept and back at its instant, it is the mode as it always was: no notice.
    load(build());
    history.clear();
    useSymbolAlign.setState({ phase: null });
    keepAndPick(5, 5);
    expect(store().apply('LEFT')).toBe(true);
    expect(position('b')).toEqual([0, 2]);
    expect(notices()).toHaveLength(0);
  });

  it('reminds that G remembers a symbol when its formula has left the screen', () => {
    useUiStore.setState({ time: 7 });
    store().toggle();
    store().pick(glyph('b'), at);
    useUiStore.getState().setTime(2); // b is not on screen here, and was not kept
    expect(symbolAlignHint(store().phase, 'unlocked', false)).toContain(
      '“=” is not on screen at this time: go back to it and press G',
    );
    store().pick(glyph('a'), at);
    // The reference is not taken: the mode waits, with the symbol to move still chosen.
    expect(store().phase).toMatchObject({ step: 'reference', target: glyph('b'), held: null });
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.title).toBe('“=” is not on screen at 2.00 s');
    expect(notices()[0]!.message).toContain('press G after clicking its symbol');
    expect(notices()[0]!.message).toContain('G remembers where the symbol is at that time');
    // G here keeps nothing either: there is nothing to measure.
    useNoticeStore.getState().clear();
    store().hold();
    expect(held()).toBeNull();
    expect(notices()[0]!.title).toBe('“=” cannot be kept at 2.00 s');
    expect(notices()[0]!.message).toContain('“Fb” is not on screen at 2.00 s');
    // Back where b is, G keeps it and the reference is taken.
    useUiStore.getState().setTime(7);
    store().hold();
    useUiStore.getState().setTime(2);
    store().pick(glyph('a'), at);
    expect(store().phase).toMatchObject({ step: 'direction' });
    expect(history.canUndo()).toBe(false);
  });

  it('does not keep a symbol that cannot be aligned as it is then, and says why', () => {
    const refused = (time: number) => {
      useNoticeStore.getState().clear();
      useSymbolAlign.setState({ phase: null });
      useUiStore.setState({ time });
      store().toggle();
      store().pick(glyph('b'), at);
      store().hold();
      expect(held()).toBeNull();
      expect(notices()).toHaveLength(1);
      expect(notices()[0]!.title).toBe(`“=” cannot be kept at ${time.toFixed(2)} s`);
      return notices()[0]!.message!;
    };
    // A transformation of b from 6 s to 8 s. Locked after it, as every clip is at first.
    useProjectStore.getState().update((d) => {
      d.clips.find((c) => c.id === 'b')!.actions.push(createTween(1, 2, { position: [5, 2] }));
    });
    expect(refused(9)).toContain('“Fb” is locked after its transformations');
    // Unlocked, it still cannot be kept while that transformation runs.
    useTransformEdit.setState({ unlocked: ['b'] });
    expect(refused(7)).toContain('a transformation of the formula runs from 6.00 s to 8.00 s');
    // Hanging on another clip, it is not placed by hand.
    useProjectStore.getState().update((d) => {
      d.clips.find((c) => c.id === 'b')!.attach = createAttach('a', 'all');
    });
    expect(refused(9)).toContain('“Fb” is attached to “Fa”');
  });

  it('moves the end state under edit when the symbol was kept there', () => {
    let tweenId = '';
    useProjectStore.getState().update((d) => {
      const tween = createTween(1, 1, { position: [5, 2] }); // 6 s to 7 s
      tweenId = tween.id;
      d.clips.find((c) => c.id === 'b')!.actions.push(tween);
    });
    history.clear();
    const to = () =>
      project()
        .clips.find((c) => c.id === 'b')!
        .actions.find((a) => a.id === tweenId)!;
    // The block's end icon: the playhead at its end, its end state under edit.
    useUiStore.setState({ time: 7 });
    useTransformEdit.setState({ editing: { clipId: 'b', actionId: tweenId, time: 7 } });
    store().toggle();
    store().pick(glyph('b'), at);
    store().hold();
    expect(held()).toEqual({ at: 7, editing: { clipId: 'b', actionId: tweenId, time: 7 } });
    // Moving the playhead ends that edit; the kept symbol remembers it.
    useUiStore.getState().setTime(2);
    useTransformEdit.getState().stopEditing();
    store().pick(glyph('a'), at);
    expect(store().apply('LEFT')).toBe(true);
    expect(to()).toMatchObject({ kind: 'tween', to: { position: [0, 2] } });
    expect(position('b')).toEqual([3, 2]);
    expect(notices()[0]).toMatchObject({ kind: 'warning', title: '“Fb” moved' });
    expect(notices()[0]!.details).toEqual([
      'Only the end of the transformation at 6.00 s moved: before it, “Fb” is where it was.',
    ]);
  });

  it('lists what moves beyond the alignment in the closing notice', () => {
    useProjectStore.getState().update((d) => {
      // b goes to a point of its own at 8 s; a travels from 3 s to 4 s.
      d.clips.find((c) => c.id === 'b')!.actions.push(createTween(3, 1, { position: [5, 5] }));
      d.clips.find((c) => c.id === 'a')!.actions.push(createTween(3, 1, { position: [1, 0] }));
    });
    history.clear();
    keepAndPick(6, 2);
    expect(store().apply('LEFT')).toBe(true);
    expect(position('b')).toEqual([0, 2]); // on a where a is at 2 s
    expect(notices()[0]).toMatchObject({ kind: 'warning', title: '“Fb” moved' });
    expect(notices()[0]!.details).toEqual([
      'The transformation of “Fb” at 8.00 s takes it to a position of its own, which did not ' +
        'move.',
      'The reference “=” of “Fa” moves between 2.00 s and 5.00 s: it was taken where it is at ' +
        '2.00 s.',
    ]);
  });

  it('says so when the kept symbol is gone, or when nothing had to move', () => {
    keepAndPick(7, 2);
    useProjectStore.getState().update((d) => {
      d.clips.find((c) => c.id === 'b')!.start = 8; // b is no longer on screen at 7 s
    });
    history.clear();
    expect(store().apply('LEFT')).toBe(false);
    expect(notices()[0]).toMatchObject({
      title: 'Nothing to align',
      message: '“=” is no longer there at 7.00 s, the time it was kept at.',
    });
    expect(history.canUndo()).toBe(false);
    // Already in place: no undo step, and a notice, since nothing shows at the playhead.
    load(apart());
    useProjectStore.getState().update((d) => {
      d.clips.find((c) => c.id === 'b')!.initial.position = [0, 2];
    });
    history.clear();
    useNoticeStore.getState().clear();
    keepAndPick(7, 2);
    expect(store().apply('LEFT')).toBe(false);
    expect(history.canUndo()).toBe(false);
    expect(notices()[0]).toMatchObject({ kind: 'info', title: 'Nothing moved' });
  });
});
