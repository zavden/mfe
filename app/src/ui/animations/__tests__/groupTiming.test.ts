import { afterEach, describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createPartTransform,
  groupOf,
  type ClipAction,
  type PartTransformAction,
} from '../../../model';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { stopReason } from '../../timeline/blockDrag';
import { blockSnapPoints } from '../../timeline/blockSnap';
import { leaveGroup, nudgeBlock, setBlockTiming, ungroupBlocks } from '../blockActions';
import { blockLimits, clampTiming, movedWith } from '../blockRange';
import { oneClipScene } from './fixtures';

/* The timing of a group (model/groups.ts): its blocks start and end together, so the planner
 * answers for all of them and an edit of one is an edit of each. */

/** A part transform of `glyphs` over [start, start + duration], named `id`. */
function move(
  id: string,
  start: number,
  glyphs: number[],
  group?: string,
  duration = 1,
): PartTransformAction {
  return {
    ...createPartTransform(start, glyphs, { duration, shift: [0, 1] }),
    id,
    ...(group === undefined ? {} : { group }),
  };
}

/** Six glyphs on a clip over [0, 10]. A group of two blocks over [4, 5]: `a` moves glyph 0, which
 * `left` moves over [1, 2]; `b` moves glyph 1, which `right` moves over [7, 8]. `free` moves
 * glyph 5 over [4, 5] and is in no group. */
function scene(extra: ClipAction[] = []) {
  return oneClipScene({
    glyphs: 6,
    start: 0,
    end: 10,
    actions: [
      move('left', 1, [0]),
      move('a', 4, [0], 'g'),
      move('b', 4, [1], 'g'),
      move('free', 4, [5]),
      move('right', 7, [1]),
      ...extra,
    ],
  });
}

afterEach(() => {
  useUiStore.setState({ selection: { kind: 'none' } });
  loadProject(createEmptyProject());
});

describe('the planner, for a block in a group', () => {
  it('moves the members of its group with it, and a block on its own alone', () => {
    const { clip } = scene();
    expect(movedWith(clip, 'a')).toEqual(['a', 'b']);
    expect(movedWith(clip, 'b')).toEqual(['a', 'b']);
    expect(movedWith(clip, 'free')).toEqual(['free']);
    expect(movedWith(clip, 'gone')).toEqual([]);
  });

  it('is free where every member is: between what stops any of them', () => {
    const { project, clip } = scene();
    // `a` alone could go on to the clip's end, `b` back to its start.
    expect(blockLimits(project, clip, 'a')).toEqual({ start: 2, end: 7 });
    expect(blockLimits(project, clip, 'b')).toEqual({ start: 2, end: 7 });
    expect(blockLimits(project, clip, 'free')).toEqual({ start: 0, end: 10 });
    expect(blockLimits(project, clip, 'gone')).toBeNull();
  });

  it('lands where all its members may be, whichever of them is asked', () => {
    const { project, clip } = scene();
    for (const id of ['a', 'b']) {
      expect(clampTiming(project, clip, id, { start: 0, end: 1 }, 'move')).toEqual({
        start: 2,
        duration: 1,
      });
      expect(clampTiming(project, clip, id, { start: 9, end: 10 }, 'move')).toEqual({
        start: 6,
        duration: 1,
      });
      expect(clampTiming(project, clip, id, { start: 0.5, end: 5 }, 'start')).toEqual({
        start: 2,
        duration: 3,
      });
      expect(clampTiming(project, clip, id, { start: 4, end: 9.5 }, 'end')).toEqual({
        start: 4,
        duration: 3,
      });
      expect(clampTiming(project, clip, id, { start: 5.5, end: 6.5 }, 'move')).toEqual({
        start: 5.5,
        duration: 1,
      });
    }
    // The block on its own goes where the group could not.
    expect(clampTiming(project, clip, 'free', { start: 9, end: 10 }, 'move')).toEqual({
      start: 9,
      duration: 1,
    });
  });

  it('says why in the words of the member that cannot be there', () => {
    const { project, clip } = scene();
    const why = (id: string, wanted: { start: number; end: number }, start: number) =>
      stopReason(project, clip, id, wanted, { start, duration: 1 }, 'move');
    // Asked through `a`, which nothing stops on its right: it is `b` that meets `right`, on
    // glyph 1.
    expect(why('a', { start: 8.5, end: 9.5 }, 6)).toMatch(/\bglyph 1\b.* at the same time/);
    // On the other side it is `a` that meets `left`, on glyph 0, whichever member is asked.
    expect(why('b', { start: 0, end: 1 }, 2)).toBe(
      'The Transform block at 1.00 s animates glyph 0 “0” at the same time.',
    );
    // A block on its own has only its own reasons: glyph 5 is free on both sides.
    expect(why('free', { start: 9.5, end: 10.5 }, 9)).toBe('A block stays inside its clip.');
  });

  it('does not snap to the edges of its own group, which move with it', () => {
    const { project, clip } = scene([move('later', 8.5, [3], undefined, 0.5)]);
    const points = blockSnapPoints(project, clip, 'a', 3);
    // The playhead, the clip, the other blocks: `left`, `right`, `later` — and `free`, which
    // runs over the same time without being of the group.
    expect([...new Set(points)].sort((x, y) => x - y)).toEqual([
      0, 1, 2, 3, 4, 5, 7, 8, 8.5, 9, 10,
    ]);
    const withoutFree = scene([move('later', 8.5, [3], undefined, 0.5)]);
    withoutFree.clip.actions = withoutFree.clip.actions.filter((a) => a.id !== 'free');
    expect(
      [...new Set(blockSnapPoints(withoutFree.project, withoutFree.clip, 'b', 3))].sort(
        (x, y) => x - y,
      ),
    ).toEqual([0, 1, 2, 3, 7, 8, 8.5, 9, 10]);
  });
});

describe('the timing of a group in the project', () => {
  const blocks = () =>
    Object.fromEntries(
      useProjectStore
        .getState()
        .project.clips[0]!.actions.map((a) => [a.id, [a.start, a.duration, groupOf(a) ?? null]]),
    );

  it('is written to every member in one step, and undone in one', () => {
    const { project, clip } = scene();
    loadProject(project);
    setBlockTiming(clip.id, 'b', { start: 5, duration: 1.5 });
    expect(blocks()).toMatchObject({
      a: [5, 1.5, 'g'],
      b: [5, 1.5, 'g'],
      free: [4, 1, null],
      left: [1, 1, null],
    });
    // The clip's actions stay in start order.
    const starts = useProjectStore.getState().project.clips[0]!.actions.map((a) => a.start);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
    useProjectStore.temporal.getState().undo();
    expect(blocks()).toMatchObject({ a: [4, 1, 'g'], b: [4, 1, 'g'] });
  });

  it('moves with Alt + arrows as one, as far as all its members can go', () => {
    const { project, clip } = scene();
    loadProject(project);
    nudgeBlock(clip.id, 'a', 30); // half a second at 60 fps
    expect(blocks()).toMatchObject({ a: [4.5, 1, 'g'], b: [4.5, 1, 'g'], free: [4, 1, null] });
    nudgeBlock(clip.id, 'b', 600);
    expect(blocks()).toMatchObject({ a: [6, 1, 'g'], b: [6, 1, 'g'] });
    nudgeBlock(clip.id, 'a', -600);
    expect(blocks()).toMatchObject({ a: [2, 1, 'g'], b: [2, 1, 'g'] });
  });

  it('is its own for a block in no group', () => {
    const { project, clip } = scene();
    loadProject(project);
    setBlockTiming(clip.id, 'free', { start: 6, duration: 2 });
    expect(blocks()).toMatchObject({ a: [4, 1, 'g'], b: [4, 1, 'g'], free: [6, 2, null] });
  });
});

describe('undoing a group', () => {
  const groups = () =>
    Object.fromEntries(
      useProjectStore.getState().project.clips[0]!.actions.map((a) => [a.id, groupOf(a) ?? null]),
    );

  /** The scene with a third member, `c`, which moves glyph 2 with the group. */
  function load() {
    const { project, clip } = scene([move('c', 4, [2], 'g')]);
    loadProject(project);
    return clip;
  }

  it('leaves its blocks where they were, each on its own, in one step', () => {
    const clip = load();
    ungroupBlocks(clip.id, 'b');
    expect(groups()).toMatchObject({ a: null, b: null, c: null });
    const blocks = useProjectStore.getState().project.clips[0]!.actions;
    expect(blocks.filter((a) => 'group' in a)).toEqual([]);
    expect(blocks.find((a) => a.id === 'c')).toMatchObject({ start: 4, duration: 1 });
    // On their own, they move alone.
    setBlockTiming(clip.id, 'c', { start: 6, duration: 1 });
    expect(blocks.find((a) => a.id === 'a')!.start).toBe(4);
    useProjectStore.temporal.getState().undo();
    useProjectStore.temporal.getState().undo();
    expect(groups()).toMatchObject({ a: 'g', b: 'g', c: 'g' });
  });

  it('takes one block out and keeps the others together, while they are two or more', () => {
    const clip = load();
    leaveGroup(clip.id, 'a');
    expect(groups()).toMatchObject({ a: null, b: 'g', c: 'g' });
    leaveGroup(clip.id, 'b');
    // One block is no group.
    expect(groups()).toMatchObject({ a: null, b: null, c: null });
  });

  it('does nothing to a block in no group, or on a locked track', () => {
    const clip = load();
    const before = useProjectStore.getState().project;
    ungroupBlocks(clip.id, 'free');
    leaveGroup(clip.id, 'free');
    ungroupBlocks(clip.id, 'gone');
    expect(useProjectStore.getState().project).toBe(before);
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    ungroupBlocks(clip.id, 'a');
    leaveGroup(clip.id, 'a');
    expect(groups()).toMatchObject({ a: 'g', b: 'g', c: 'g' });
  });
});
