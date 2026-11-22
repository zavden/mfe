// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import {
  createAttach,
  createClip,
  createEmptyProject,
  createFitTween,
  createFormula,
  createPartTransform,
  createTipAttach,
  createTween,
  type Clip,
  type Project,
} from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { useTransformEdit } from '../../animations/transformEdit';
import { useNoticeStore } from '../../project/noticeStore';
import {
  alignableSelection,
  alignSelection,
  distributeSelection,
  editableSelection,
} from '../alignActions';
import { boxSnapshot, resolvedBoxes } from './resolvedBoxes';

/** Every formula renders 2 wide and 1 high, centred on its origin, as one glyph unless a test
 * gives its clip's letter other glyph boxes. */
const BBOX: Box = { minX: -1, minY: -0.5, maxX: 1, maxY: 0.5 };
let glyphBoxes: Record<string, Box[]> = {};

const project = () => useProjectStore.getState().project;
const clip = (id: string) => project().clips.find((c) => c.id === id)!;
const position = (id: string) => clip(id).initial.position;
const select = (...ids: string[]) =>
  useUiStore.setState({ selection: ids.length ? { kind: 'clips', ids } : { kind: 'none' } });

function build(
  positions: Record<string, [number, number]>,
  edit?: (c: Clip) => void,
  boxes: Record<string, Box[]> = {},
): Project {
  glyphBoxes = boxes;
  const p = createEmptyProject('t');
  p.formulas = Object.keys(positions).map((id) => ({
    ...createFormula({
      name: `F${id}`,
      source: 'x',
      snapshot: boxSnapshot(boxes[id] ?? [BBOX]),
    }),
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
  const resolved: ReturnType<typeof useRenderStore.getState>['resolved'] = new Map(
    p.formulas.map((f) => [f.id, resolvedBoxes(f, glyphBoxes[f.id.slice(1)] ?? [BBOX])]),
  );
  useRenderStore.setState({ resolved });
  useUiStore.setState({ time: 5 });
  useTransformEdit.setState({ editing: null, unlocked: [] });
  useNoticeStore.getState().clear();
}

const notices = () => useNoticeStore.getState().notices;

beforeEach(() => load(build({ a: [-4, 2], b: [0, 0], c: [3, -1] })));

describe('alignableSelection', () => {
  it('lists the selected clips with their formula boxes at the playhead, in project order', () => {
    select('c', 'a');
    const { items, skipped } = alignableSelection();
    expect(skipped).toEqual([]);
    expect(items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(items[0]!.box).toEqual({ minX: -5, minY: 1.5, maxX: -3, maxY: 2.5 });
  });

  it('measures a scaled and turned formula by its enclosing box', () => {
    useProjectStore.getState().update((d) => {
      d.clips[0]!.initial.scale = 2;
      d.clips[0]!.initial.rotation = 90;
    });
    select('a');
    const box = alignableSelection().items[0]!.box;
    expect(box.minX).toBeCloseTo(-5);
    expect(box.maxX).toBeCloseTo(-3);
    expect(box.minY).toBeCloseTo(0);
    expect(box.maxY).toBeCloseTo(4);
  });

  it('is empty with no clip selected', () => {
    select();
    expect(alignableSelection()).toEqual({ items: [], skipped: [] });
  });

  it('measures a glyph where a part transform has moved it', () => {
    const left = { minX: -1, minY: -0.5, maxX: 0, maxY: 0.5 };
    const right = { minX: 0, minY: -0.5, maxX: 1, maxY: 0.5 };
    const p = build(
      { a: [-4, 2], b: [0, 0] },
      (c) => {
        if (c.id === 'a') {
          c.actions.push(
            createPartTransform(1, [1], { duration: 1, shift: [3, 0], easing: 'linear' }),
          );
        }
      },
      { a: [left, right] },
    );
    load(p);
    select('a');
    // At 5 s the block is over: the right glyph sits 3 units further right, and so does the edge.
    const { box } = alignableSelection().items[0]!;
    expect(box.minX).toBeCloseTo(-5);
    expect(box.maxX).toBeCloseTo(0);
    expect(box.minY).toBeCloseTo(1.5);
    expect(box.maxY).toBeCloseTo(2.5);
    select('a', 'b');
    expect(alignSelection('right')).toBe(true); // b's right edge, 1, is the rightmost
    expect(position('a')[0]).toBeCloseTo(-3);
    expect(position('b')).toEqual([0, 0]);
  });

  it('leaves out clips that are off screen, unrendered, on a locked track or locked by a tween', () => {
    const p = build({ a: [0, 0], b: [1, 0], c: [2, 0], d: [3, 0], e: [4, 0] }, (c) => {
      if (c.id === 'b') c.start = 8;
      if (c.id === 'e') c.actions.push({ ...createTween(1, 1, { position: [5, 5] }), id: 'move' });
    });
    p.tracks.push({ ...p.tracks[0]!, id: 'lockedTrack', locked: true });
    p.clips.find((c) => c.id === 'd')!.trackId = 'lockedTrack';
    load(p);
    useRenderStore.setState({
      resolved: new Map([...useRenderStore.getState().resolved].filter(([id]) => id !== 'fc')),
    });
    select('a', 'b', 'c', 'd', 'e');
    // The playhead (5 s) is after e's tween: its keyframe belongs to the transformation.
    const { items, skipped } = alignableSelection();
    expect(items.map((i) => i.id)).toEqual(['a']);
    expect(skipped.map((s) => s.id)).toEqual(['b', 'c', 'd', 'e']);
    // Unlocking the clip puts it back.
    useTransformEdit.setState({ unlocked: ['e'] });
    expect(alignableSelection().items.map((i) => i.id)).toEqual(['a', 'e']);
  });

  it('leaves out a clip whose part transform is under edit', () => {
    const p = build({ a: [0, 0], b: [1, 0] });
    p.clips[0]!.actions.push({
      id: 'part',
      kind: 'transform',
      start: 1,
      duration: 1,
      easing: 'smooth',
      glyphs: [0],
      shift: [0, 0],
      scale: 1,
      rotation: 0,
    } as never);
    load(p);
    useTransformEdit.setState({ editing: { clipId: 'a', actionId: 'part', time: 5 } });
    select('a', 'b');
    expect(alignableSelection().skipped.map((s) => s.id)).toEqual(['a']);
  });
});

describe('alignSelection', () => {
  it('aligns left edges to the leftmost, in one undo step', () => {
    select('a', 'b', 'c');
    expect(alignSelection('left')).toBe(true);
    expect([position('a'), position('b'), position('c')]).toEqual([
      [-4, 2],
      [-4, 0],
      [-4, -1],
    ]);
    expect(history.canUndo()).toBe(true);
    history.undo();
    expect([position('a'), position('b'), position('c')]).toEqual([
      [-4, 2],
      [0, 0],
      [3, -1],
    ]);
    expect(history.canUndo()).toBe(false);
  });

  it('aligns the other edges and centre lines', () => {
    select('a', 'b', 'c');
    alignSelection('right');
    expect(position('b')[0]).toBe(3);
    alignSelection('centerX');
    expect(position('a')[0]).toBe(3);
    alignSelection('top');
    expect([position('a')[1], position('b')[1], position('c')[1]]).toEqual([2, 2, 2]);
    alignSelection('middle');
    expect(position('c')[1]).toBe(2);
    alignSelection('bottom');
    expect(position('b')[1]).toBe(2);
  });

  it('moves nothing, and adds no undo step, when everything is in place', () => {
    select('a', 'b');
    expect(alignSelection('left')).toBe(true);
    expect(alignSelection('left')).toBe(false);
    // The second call added no step: one undo returns to the original.
    history.undo();
    expect(position('b')).toEqual([0, 0]);
    expect(history.canUndo()).toBe(false);
  });

  // A probe the final audit asked for (P02-327), which found the defect. The sides of a 16:9 frame
  // are at ∓64/9, which the six decimals of a position do not hold: a clip put there is a
  // ten-millionth from where the side asks it to be, so aligned again it was «moved» to the
  // position it has, and the history took a step that changed nothing. The top, the bottom and the
  // centre, at ∓3.5 and 0, never had such a step.
  it('adds no undo step when a clip at a side of the frame is aligned to it again', () => {
    for (const edge of ['left', 'right'] as const) {
      load(build({ a: [-4, 2], b: [0.3, 0], c: [3, -1] }));
      select('b');
      expect(alignSelection(edge)).toBe(true);
      const at = position('b');
      expect(alignSelection(edge), edge).toBe(false);
      expect(position('b')).toEqual(at);
      history.undo();
      expect(position('b')).toEqual([0.3, 0]);
      expect(history.canUndo(), edge).toBe(false);
    }
  });

  it('adds no undo step when a clip at the top, the bottom or the centre of the frame is aligned again', () => {
    for (const edge of ['top', 'bottom', 'centerX', 'middle'] as const) {
      load(build({ a: [-4, 2], b: [0.3, 0.2], c: [3, -1] }));
      select('b');
      expect(alignSelection(edge)).toBe(true);
      expect(alignSelection(edge), edge).toBe(false);
      history.undo();
      expect(position('b')).toEqual([0.3, 0.2]);
      expect(history.canUndo(), edge).toBe(false);
    }
  });

  it('aligns a lone clip to the frame, and several to the frame with toFrame', () => {
    select('b');
    alignSelection('left');
    // 16:9 frame: x from −7.111…; the box is 2 wide: centre at −7.111 + 1.
    expect(position('b')[0]).toBeCloseTo(-(8 * 16) / 9 / 2 + 1, 5);
    select('a', 'c');
    alignSelection('top', true);
    expect(position('a')[1]).toBe(3.5);
    expect(position('c')[1]).toBe(3.5);
    alignSelection('centerX', true);
    expect([position('a')[0], position('c')[0]]).toEqual([0, 0]);
  });

  it('does nothing without a selection', () => {
    select();
    expect(alignSelection('left')).toBe(false);
    expect(history.canUndo()).toBe(false);
    expect(notices()).toEqual([]);
  });

  it('keeps the clips it cannot move and names them in a notice', () => {
    useProjectStore.getState().update((d) => {
      d.clips[1]!.actions.push({ ...createTween(1, 1, { position: [5, 5] }), id: 'move' });
    });
    select('a', 'b', 'c');
    expect(alignSelection('left')).toBe(true);
    expect(position('b')).toEqual([0, 0]);
    expect(position('c')[0]).toBe(-4);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.title).toBe('1 clip stayed');
    expect(notices()[0]!.message).toContain('“Fb”');
  });

  it('says so too when nothing could move, and a lone clip left with no partner stays', () => {
    useProjectStore.getState().update((d) => {
      d.tracks[0]!.locked = true;
    });
    select('a', 'b');
    expect(alignSelection('left')).toBe(false);
    expect(notices()[0]!.title).toBe('2 clips stayed');

    useProjectStore.getState().update((d) => {
      d.tracks[0]!.locked = false;
      d.clips[1]!.start = 9;
    });
    useNoticeStore.getState().clear();
    select('a', 'b');
    expect(alignSelection('left')).toBe(false);
    expect(position('a')).toEqual([-4, 2]);
    expect(notices()).toHaveLength(1);
  });
});

describe('distributeSelection', () => {
  it('spaces three clips evenly and needs three', () => {
    load(build({ a: [-6, 0], b: [-2, 1], c: [1, 2], d: [6, 3] }));
    select('a', 'b', 'c', 'd');
    expect(distributeSelection('x')).toBe(true);
    // Boxes 2 wide from −7 to 7: gaps (14 − 8) / 3 = 2.
    expect([position('a')[0], position('b')[0], position('c')[0], position('d')[0]]).toEqual([
      -6, -2, 2, 6,
    ]);
    expect(position('b')[1]).toBe(1);
    select('a', 'b');
    expect(distributeSelection('x')).toBe(false);
  });

  it('distributes on y', () => {
    load(build({ a: [0, -3], b: [0, 2], c: [0, 3] }));
    select('a', 'b', 'c');
    distributeSelection('y');
    expect(position('b')[1]).toBe(0);
  });

  // Gaps of 4/3, which six decimals do not hold: the clips in between are a ten-millionth from
  // where an even spacing asks them to be, as a clip at a side of the frame is.
  it('adds no undo step when the clips are evenly spaced already, at gaps a position cannot hold', () => {
    for (const axis of ['x', 'y'] as const) {
      const at = (along: number): [number, number] => (axis === 'x' ? [along, 0] : [0, along]);
      load(build({ a: at(-5), b: at(-4.5), c: at(0.5), d: at(5) }));
      select('a', 'b', 'c', 'd');
      expect(distributeSelection(axis)).toBe(true);
      const spaced = ['a', 'b', 'c', 'd'].map((id) => position(id));
      // Boxes 2 wide from −6 to 6, gaps of 4/3; 1 high from −5.5 to 5.5, gaps of 7/3. Either
      // way the second clip's centre is asked to be at −5/3.
      expect(spaced[1]![axis === 'x' ? 0 : 1]).toBe(-1.666667);
      expect(distributeSelection(axis), axis).toBe(false);
      expect(['a', 'b', 'c', 'd'].map((id) => position(id))).toEqual(spaced);
      history.undo();
      expect(position('b')).toEqual(at(-4.5));
      expect(history.canUndo(), axis).toBe(false);
    }
  });
});

/* Alt+A and the others are keys: they can come while the button is still held on a formula. */
describe('aligning while a drag is still held', () => {
  it('gives the drag up first: what is aligned is where the formulas are again', () => {
    select('a', 'b');
    // b dragged to the right in the preview.
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.clips.find((c) => c.id === 'b')!.initial.position = [2, 0];
    });
    expect(alignSelection('left')).toBe(true);
    expect(gesture.active).toBe(false);
    // On the left edge of a, from where it was: not by what the drag had measured.
    expect(position('a')).toEqual([-4, 2]);
    expect(position('b')).toEqual([-4, 0]);
    history.undo();
    expect(position('b')).toEqual([0, 0]);
  });

  it('and so does distributing', () => {
    select('a', 'b', 'c');
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.clips.find((c) => c.id === 'b')!.initial.position = [2, 0];
    });
    expect(distributeSelection('x')).toBe(true);
    expect(gesture.active).toBe(false);
    expect(position('b')[0]).toBeCloseTo(-0.5);
  });
});

/* An attached object is placed by what it hangs on (the attach sync derives its position, and a
 * drag refuses it): Align and Distribute neither measure it nor write it. */
describe('aligning a selection that holds an attached object', () => {
  /** The three clips, with c hanging on a (a label beside it). */
  const attached = (positions: Record<string, [number, number]> = {}) =>
    load(
      build({ a: [-4, 2], b: [0, 0], c: [3, -1], ...positions }, (c) => {
        if (c.id === 'c') c.attach = createAttach('a', 'all');
      }),
    );

  it('aligns the others among themselves, and what hangs on one of them goes with it', () => {
    attached();
    select('a', 'b', 'c');
    // The right edge of a and b is b's: c, further right, is no edge to align to.
    expect(alignSelection('right')).toBe(true);
    expect(position('a')).toEqual([0, 2]);
    expect(position('b')).toEqual([0, 0]);
    expect(position('c')).toEqual([3, -1]);
    // c follows a: it did not stay, and nothing says it did.
    expect(notices()).toEqual([]);
    history.undo();
    expect(position('a')).toEqual([-4, 2]);
  });

  it('does not write it, and names it when what it hangs on is not aligned with it', () => {
    attached();
    select('b', 'c');
    const before = project();
    expect(alignSelection('left')).toBe(false);
    expect(project()).toBe(before);
    expect(history.canUndo()).toBe(false);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.title).toBe('1 clip stayed');
    expect(notices()[0]!.message).toContain('“Fc”');
    expect(notices()[0]!.message).toContain('attached');
  });

  it('the frame is the scene camera’s at the playhead, in a scene with one', () => {
    // 4 tall about (2, 1): from −1.56 to 5.56 across, from −1 to 3 up. The playhead is at 5 s,
    // after a move that took it 3 to the right.
    useProjectStore.getState().update((draft) => {
      draft.camera = {
        initial: { center: [2, 1], height: 4 },
        targets: [],
        moves: [
          {
            id: 'n1',
            start: 1,
            duration: 1,
            easing: 'linear',
            to: { kind: 'frame', frame: { center: [5, 1], height: 4 } },
          },
        ],
      };
    });
    select('a');
    alignSelection('left');
    expect(position('a')[0]).toBeCloseTo(5 - 32 / 9 + 1, 6);
    alignSelection('top');
    expect(position('a')[1]).toBeCloseTo(3 - 0.5, 6);
    select('a', 'b');
    alignSelection('centerX', true);
    expect(position('a')[0]).toBeCloseTo(5, 6);
    expect(position('b')[0]).toBeCloseTo(5, 6);
    // Before the move, the frame of 0 s.
    useUiStore.setState({ time: 0.5 });
    alignSelection('right', true);
    expect(position('b')[0]).toBeCloseTo(2 + 32 / 9 - 1, 6);
  });

  it('a formula selected with what hangs on it is a lone clip: it aligns to the frame', () => {
    attached();
    select('a', 'c');
    expect(alignSelection('left')).toBe(true);
    // The frame is 8 high at 16:9: its left edge is at -64/9, and a is 2 wide.
    expect(position('a')[0]).toBeCloseTo(-64 / 9 + 1);
    expect(position('c')).toEqual([3, -1]);
    expect(notices()).toEqual([]);
  });

  it('distributes without it', () => {
    attached({ a: [-4, 0], b: [0, 0], c: [1, 0], d: [6, 0] });
    select('a', 'b', 'c', 'd');
    expect(distributeSelection('x')).toBe(true);
    // b half-way between a and d, as if c were not selected.
    expect(position('b')[0]).toBeCloseTo(1);
    expect(position('c')).toEqual([1, 0]);
    expect(notices()).toEqual([]);
  });

  it('what hangs on an attached object goes with it too (a brace and its label)', () => {
    load(
      build({ a: [-4, 2], b: [0, 0], c: [3, -1], d: [3, -2] }, (c) => {
        if (c.id === 'c') c.attach = createAttach('a', 'all');
        if (c.id === 'd') c.attach = createTipAttach('c');
      }),
    );
    select('a', 'b', 'c', 'd');
    expect(alignSelection('right')).toBe(true);
    expect(position('a')).toEqual([0, 2]);
    expect(position('d')).toEqual([3, -2]);
    expect(notices()).toEqual([]);
  });

  it('leaves a shape alone while a Transform has carried it to other glyphs', () => {
    load(
      build({ a: [-4, 2], b: [0, 0], c: [3, -1] }, (c) => {
        if (c.id === 'c') c.actions.push(createFitTween(1, 1, { clipId: 'a', glyphs: 'all' }));
      }),
    );
    useTransformEdit.setState({ editing: null, unlocked: ['c'] });
    select('b', 'c');
    const before = project();
    expect(alignSelection('left')).toBe(false);
    expect(project()).toBe(before);
    expect(notices()[0]!.title).toBe('1 clip stayed');
    expect(notices()[0]!.message).toContain('“Fc”');
  });

  it('Paste properties still reaches it: its colour and opacity are its own', () => {
    attached();
    select('b', 'c');
    expect(editableSelection().items.map((item) => item.id)).toEqual(['b', 'c']);
    expect(alignableSelection().items.map((item) => item.id)).toEqual(['b']);
  });
});
