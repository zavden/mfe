// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createTween,
  type Clip,
  type ClipState,
  type Project,
} from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { useTransformEdit } from '../../animations/transformEdit';
import { useNoticeStore } from '../../project/noticeStore';
import {
  copyProperties,
  copySource,
  pasteLabel,
  pastePatch,
  pasteProperties,
  propertiesOf,
  usePropertyClipboard,
  type ClipProperties,
} from '../propertyClipboard';
import { boxSnapshot, resolvedBoxes } from './resolvedBoxes';

const BBOX = { minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 };

const project = () => useProjectStore.getState().project;
const clip = (id: string) => project().clips.find((c) => c.id === id)!;
const initial = (id: string) => clip(id).initial;
const scale = (id: string) => initial(id).scale;
const select = (...ids: string[]) =>
  useUiStore.setState({ selection: ids.length ? { kind: 'clips', ids } : { kind: 'none' } });
const clipboard = () => usePropertyClipboard.getState().properties;

/** A clip spec: its formula (`f<id>` by default) and the initial state fields it sets. */
type Spec = Partial<ClipState> & { formula?: string };

/** A project with one clip per spec, 3 units apart on the top track, 0–10 s. */
function build(specs: Record<string, Spec>, edit?: (c: Clip) => void): Project {
  const p = createEmptyProject('t');
  const formulaIds = [...new Set(Object.entries(specs).map(([id, s]) => s.formula ?? `f${id}`))];
  p.formulas = formulaIds.map((fid) => ({
    ...createFormula({ name: `F${fid.slice(1)}`, source: 'x', snapshot: boxSnapshot([BBOX]) }),
    id: fid,
  }));
  const [top] = p.tracks;
  p.clips = Object.entries(specs).map(([id, { formula, ...state }], i) => {
    const c = createClip(formula ?? `f${id}`, top!.id, 0, 10);
    c.id = id;
    c.initial = { ...c.initial, position: [i * 3, 0], ...state };
    edit?.(c);
    return c;
  });
  return p;
}

function load(p: Project): void {
  loadProject(p);
  const resolved: ReturnType<typeof useRenderStore.getState>['resolved'] = new Map(
    p.formulas.map((f) => [f.id, resolvedBoxes(f, [BBOX])]),
  );
  useRenderStore.setState({ resolved });
  useUiStore.setState({ time: 5 });
  useTransformEdit.setState({ editing: null, unlocked: [] });
  useNoticeStore.getState().clear();
  usePropertyClipboard.getState().set(null);
}

const notices = () => useNoticeStore.getState().notices;

/** Alpha's look: scaled, turned, flipped, half transparent, red, its first glyph green. */
const ALPHA: Spec = {
  scale: 1.6,
  rotation: 30,
  flipX: true,
  opacity: 0.5,
  color: '#FF0000',
  glyphColors: { '0': '#00FF00' },
};
/** The same, as pasted: everything a clip state has but the position. */
const ALPHA_LOOK: Omit<ClipState, 'position'> = {
  scale: 1.6,
  rotation: 30,
  flipX: true,
  flipY: false,
  opacity: 0.5,
  color: '#FF0000',
  glyphColors: { '0': '#00FF00' },
};
const ALPHA_PROPERTIES: ClipProperties = { formulaId: 'fa', position: [0, 0], ...ALPHA_LOOK };

// b shares alpha's formula, c has its own.
beforeEach(() => load(build({ a: ALPHA, b: { formula: 'fa' }, c: { scale: 0.8 } })));

describe('copyProperties', () => {
  it('takes the whole state of the given clip, as shown at the playhead', () => {
    expect(propertiesOf(clip('a'))).toEqual(ALPHA_PROPERTIES);
    expect(copyProperties('a')).toBe(true);
    expect(clipboard()).toEqual(ALPHA_PROPERTIES);
    // A copy, not a view of the clip: editing the clip leaves it alone.
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.initial.glyphColors['1'] = '#0000FF';
      draft.clips[0]!.initial.position[0] = 9;
    });
    expect(clipboard()).toEqual(ALPHA_PROPERTIES);
  });

  it('interpolates the numbers of a running tween and takes the colours of the nearer keyframe', () => {
    load(
      build({ a: { opacity: 1 } }, (c) =>
        c.actions.push(createTween(4, 2, { scale: 2, opacity: 0, color: '#FF0000' })),
      ),
    );
    useUiStore.setState({ time: 4.4 });
    expect(copyProperties('a')).toBe(true);
    const early = clipboard()!;
    expect(early.scale).toBeGreaterThan(1);
    expect(early.scale).toBeLessThan(2);
    expect(early.opacity).toBeLessThan(1);
    expect(early.opacity).toBeGreaterThan(0);
    expect(early.color).toBeNull();
    useUiStore.setState({ time: 5.6 });
    expect(copyProperties('a')).toBe(true);
    expect(clipboard()!.scale).toBeGreaterThan(early.scale);
    expect(clipboard()!.color).toBe('#FF0000');
  });

  it('takes the single highlighted clip when none is given; none or several copy nothing', () => {
    select('c');
    expect(copySource()?.id).toBe('c');
    expect(copyProperties()).toBe(true);
    expect(clipboard()).toMatchObject({ formulaId: 'fc', scale: 0.8, position: [6, 0] });
    select();
    expect(copySource()).toBeNull();
    expect(copyProperties()).toBe(false);
    select('a', 'b');
    expect(copySource()).toBeNull();
    expect(copyProperties()).toBe(false);
    expect(clipboard()).toMatchObject({ formulaId: 'fc' }); // untouched
    expect(copySource('zzz')).toBeNull();
  });
});

describe('pastePatch', () => {
  it('picks the fields of the group; the glyph colours only for the same formula', () => {
    expect(pastePatch(ALPHA_PROPERTIES, 'transformation', { formulaId: 'fc' })).toEqual({
      scale: 1.6,
      rotation: 30,
      flipX: true,
      flipY: false,
    });
    expect(pastePatch(ALPHA_PROPERTIES, 'appearance', { formulaId: 'fc' })).toEqual({
      opacity: 0.5,
      color: '#FF0000',
    });
    expect(pastePatch(ALPHA_PROPERTIES, 'glyph-colors', { formulaId: 'fa' })).toEqual({
      glyphColors: { '0': '#00FF00' },
    });
    expect(pastePatch(ALPHA_PROPERTIES, 'glyph-colors', { formulaId: 'fc' })).toEqual({});
    expect(pastePatch(ALPHA_PROPERTIES, 'position', { formulaId: 'fc' })).toEqual({
      position: [0, 0],
    });
    const all = pastePatch(ALPHA_PROPERTIES, 'all', { formulaId: 'fa' });
    expect(Object.keys(all).sort()).toEqual([
      'color',
      'flipX',
      'flipY',
      'glyphColors',
      'opacity',
      'rotation',
      'scale',
    ]);
    expect(all.position).toBeUndefined();
    // Its own copies of the position and the colours.
    const patch = pastePatch(ALPHA_PROPERTIES, 'all', { formulaId: 'fa' });
    patch.glyphColors!['1'] = '#000000';
    expect(ALPHA_PROPERTIES.glyphColors).toEqual({ '0': '#00FF00' });
  });
});

describe('pasteProperties', () => {
  it('writes everything but the position onto the selected clips, in one undo step', () => {
    copyProperties('a');
    select('b', 'c');
    expect(pasteProperties()).toBe(true);
    expect(initial('b')).toEqual({ ...ALPHA_LOOK, position: [3, 0] });
    // c is another formula: alpha's glyph colours go by alpha's glyph indices, so c keeps its own.
    expect(initial('c')).toEqual({ ...ALPHA_LOOK, position: [6, 0], glyphColors: {} });
    history.undo();
    expect([scale('a'), scale('b'), scale('c')]).toEqual([1.6, 1, 0.8]);
    expect(initial('b').color).toBeNull();
    expect(history.canUndo()).toBe(false);
  });

  it('leaves alone a clip that is on screen only by a drag still held, which it gives up', () => {
    useProjectStore.getState().update((draft) => {
      Object.assign(
        draft.clips.find((c) => c.id === 'c')!,
        { start: 0, end: 2 },
      );
    });
    history.clear();
    copyProperties('a');
    select('c');
    // c dragged under the playhead (5 s) on the timeline, the button still held at Ctrl/⌘+V.
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      Object.assign(
        draft.clips.find((c) => c.id === 'c')!,
        { start: 4, end: 6 },
      );
    });
    expect(pasteProperties('transformation')).toBe(false);
    expect(gesture.active).toBe(false);
    expect(clip('c')).toMatchObject({ start: 0, end: 2 });
    expect(scale('c')).toBe(0.8);
    expect(notices().map((notice) => notice.title)).toEqual(['1 clip stayed']);
    expect(history.canUndo()).toBe(false);
  });

  it('pastes one group at a time', () => {
    copyProperties('a');
    select('b');
    expect(pasteProperties('transformation')).toBe(true);
    expect(initial('b')).toMatchObject({ scale: 1.6, rotation: 30, flipX: true, opacity: 1 });
    expect(initial('b').color).toBeNull();
    expect(pasteProperties('appearance')).toBe(true);
    expect(initial('b')).toMatchObject({ opacity: 0.5, color: '#FF0000', glyphColors: {} });
    expect(pasteProperties('glyph-colors')).toBe(true);
    expect(initial('b').glyphColors).toEqual({ '0': '#00FF00' });
    expect(initial('b').position).toEqual([3, 0]);
    expect(pasteProperties('position')).toBe(true);
    expect(initial('b').position).toEqual([0, 0]);
    // Four pastes, four undo steps.
    history.undo();
    expect(initial('b').position).toEqual([3, 0]);
    history.undo();
    expect(initial('b').glyphColors).toEqual({});
    history.undo();
    expect(initial('b').color).toBeNull();
    history.undo();
    expect(scale('b')).toBe(1);
    expect(history.canUndo()).toBe(false);
  });

  it('replaces the per-glyph colours of an initial state, so the clip looks like the source', () => {
    load(
      build({
        a: { glyphColors: { '0': '#00FF00' } },
        b: { formula: 'fa', glyphColors: { '1': '#0000FF' } },
      }),
    );
    copyProperties('a');
    select('b');
    expect(pasteProperties('glyph-colors')).toBe(true);
    expect(initial('b').glyphColors).toEqual({ '0': '#00FF00' });
    // Pasting no glyph colours clears them.
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.initial.glyphColors = {};
    });
    copyProperties('a');
    expect(clipboard()!.glyphColors).toEqual({});
    expect(pasteProperties('glyph-colors')).toBe(true);
    expect(initial('b').glyphColors).toEqual({});
  });

  it('does nothing without a copy, without a selection, or when nothing would change', () => {
    select('b');
    expect(pasteProperties()).toBe(false);
    copyProperties('a');
    select();
    expect(pasteProperties()).toBe(false);
    select('a');
    expect(pasteProperties()).toBe(false);
    expect(pasteProperties('position')).toBe(false);
    // c is another formula: a paste of the glyph colours has nothing to write on it.
    select('c');
    expect(pasteProperties('glyph-colors')).toBe(false);
    expect(history.canUndo()).toBe(false);
    expect(scale('a')).toBe(1.6);
  });

  it('keeps the clips it cannot edit and names them in a notice', () => {
    copyProperties('a');
    useProjectStore.getState().update((draft) => {
      draft.tracks.push({
        id: 'locked',
        kind: 'visual',
        name: 'L',
        hidden: false,
        muted: false,
        locked: true,
      });
      draft.clips.find((c) => c.id === 'c')!.trackId = 'locked';
    });
    history.clear();
    select('b', 'c');
    expect(pasteProperties()).toBe(true);
    expect(scale('b')).toBe(1.6);
    expect(scale('c')).toBe(0.8);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.title).toBe('1 clip stayed');
    expect(notices()[0]!.message).toContain('“Fc”');
  });

  it('writes the keyframe in effect, like a drag; a tween target adds glyph colours', () => {
    load(
      build({ a: ALPHA, b: { formula: 'fa', glyphColors: { '1': '#0000FF' } } }, (c) => {
        if (c.id === 'b') c.actions.push(createTween(1, 1, { scale: 1.2 }));
      }),
    );
    useTransformEdit.setState({ editing: null, unlocked: ['b'] }); // unlocked: edits the tween's end
    copyProperties('a');
    select('b');
    expect(pasteProperties()).toBe(true);
    const tween = clip('b').actions[0]!;
    expect(tween.kind === 'tween' && tween.to).toEqual({
      scale: 1.6,
      rotation: 30,
      flipX: true,
      flipY: false,
      opacity: 0.5,
      color: '#FF0000',
      glyphColors: { '0': '#00FF00' },
    });
    expect(initial('b')).toMatchObject({ scale: 1, glyphColors: { '1': '#0000FF' } });
    // The target already shows alpha's glyph colour on top of its own: nothing more to write.
    expect(pasteProperties('glyph-colors')).toBe(false);
  });
});

describe('pasteLabel', () => {
  it('says what each group would write', () => {
    expect(pasteLabel(ALPHA_PROPERTIES, 'transformation')).toBe('× 1.60 · 30° · flipped');
    expect(pasteLabel(ALPHA_PROPERTIES, 'appearance')).toBe('50 % · #FF0000');
    expect(pasteLabel(ALPHA_PROPERTIES, 'glyph-colors')).toBe('1 glyph');
    expect(pasteLabel(ALPHA_PROPERTIES, 'position')).toBe('0.00, 0.00');
    expect(pasteLabel(ALPHA_PROPERTIES, 'all')).toBe(
      '× 1.60 · 30° · flipped · 50 % · #FF0000 · 1 glyph',
    );
    const plain: ClipProperties = {
      ...ALPHA_PROPERTIES,
      position: [1.5, -0.25],
      rotation: 0,
      flipX: false,
      opacity: 1,
      color: null,
      glyphColors: { '0': '#00FF00', '2': '#00FF00' },
    };
    expect(pasteLabel(plain, 'transformation')).toBe('× 1.60');
    expect(pasteLabel(plain, 'appearance')).toBe('100 %');
    expect(pasteLabel(plain, 'glyph-colors')).toBe('2 glyphs');
    expect(pasteLabel(plain, 'position')).toBe('1.50, -0.25');
    expect(pasteLabel(plain, 'all')).toBe('× 1.60 · 100 % · 2 glyphs');
    expect(pasteLabel({ ...plain, glyphColors: {} }, 'glyph-colors')).toBe('none');
    expect(pasteLabel({ ...plain, glyphColors: {} }, 'all')).toBe('× 1.60 · 100 %');
  });
});
