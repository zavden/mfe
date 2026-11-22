import { afterEach, describe, expect, it } from 'vitest';
import {
  createAppear,
  createDisappear,
  createEmptyProject,
  createPartTransform,
  groupOf,
  runsWith,
  type ClipAction,
  type PartTransformAction,
} from '../../../model';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { foldedGroupOf, groupKey } from '../../timeline/blockGroups';
import {
  changeBlockAnimation,
  duplicateBlock,
  duplicateBlockForOthers,
  duplicateGroup,
  groupBlocks,
  removeGroup,
  splitBlock,
  splitBlockIntoRuns,
} from '../blockActions';
import { convertBlock, planCopy, planGroupCopy, planParallelCopy } from '../blockOps';
import {
  splitByChoice,
  splitByParts,
  splitIntoRuns,
  withPart,
  type GlyphBlock,
} from '../splitBlock';
import { oneClipScene } from './fixtures';

/* What makes a group and what does not (model/groups.ts): the pieces of a split are one group, a
 * copy for the other glyphs joins the block it copies, blocks that run together are grouped by
 * hand, a copy made after a block is on its own, and a group is copied or deleted whole. */

function move(id: string, start: number, glyphs: number[], group?: string): PartTransformAction {
  return {
    ...createPartTransform(start, glyphs, { duration: 1, shift: [0, 1] }),
    id,
    ...(group === undefined ? {} : { group }),
  };
}

/** Eight glyphs on a clip over [0, 10], with these blocks. */
function scene(actions: ClipAction[]) {
  return oneClipScene({ glyphs: 8, start: 0, end: 10, actions });
}

const actions = () => useProjectStore.getState().project.clips[0]!.actions;
/** Every block of the clip: its glyphs and its group, by id. */
const state = () =>
  Object.fromEntries(
    actions().map((a) => [a.id, [a.kind === 'transform' ? a.glyphs : null, groupOf(a) ?? null]]),
  );
const selected = () => {
  const selection = useUiStore.getState().selection;
  return selection.kind === 'action' ? selection.actionId : null;
};

afterEach(() => {
  useUiStore.setState({ selection: { kind: 'none' } });
  loadProject(createEmptyProject());
});

describe('the pieces of a split', () => {
  const block = move('x', 2, [0, 1, 3, 4, 6]) as GlyphBlock;

  it('are one group, a new one for a block that was in none', () => {
    const runs = splitIntoRuns(block, [0, 1, 3, 4, 6])!;
    expect(runs.map((p) => p.glyphs)).toEqual([[0, 1], [3, 4], [6]]);
    const group = runs[0]!.group;
    expect(group).toMatch(/^g_/);
    expect(runs.map((p) => p.group)).toEqual([group, group, group]);
    expect(runs[0]!.id).toBe('x');
    const [kept, out] = splitByChoice(block, [0, 1, 3, 4, 6], [3, 6])!;
    expect([kept.glyphs, out.glyphs]).toEqual([
      [0, 1, 4],
      [3, 6],
    ]);
    expect(kept.group).toBeDefined();
    expect(out.group).toBe(kept.group);
    // Each split makes its own group.
    expect(kept.group).not.toBe(group);
  });

  it('join the group the block was in', () => {
    const member = { ...block, group: 'g' } as GlyphBlock;
    expect(splitIntoRuns(member, [0, 1, 3, 4, 6])!.map((p) => p.group)).toEqual(['g', 'g', 'g']);
    expect(splitByChoice(member, [0, 1, 3, 4, 6], [0])!.map((p) => p.group)).toEqual(['g', 'g']);
  });

  it('are as many as the parts chosen, the glyphs left staying in the block', () => {
    const pieces = splitByParts(block, [0, 1, 3, 4, 6], [[4, 3], [6]])!;
    expect(pieces.map((p) => [p.id === 'x', p.glyphs])).toEqual([
      [true, [0, 1]],
      [false, [3, 4]],
      [false, [6]],
    ]);
    expect(new Set(pieces.map((p) => p.group)).size).toBe(1);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(3);
    // The pieces are the block in everything but their glyphs.
    for (const piece of pieces) {
      expect(piece).toMatchObject({ kind: 'transform', start: 2, duration: 1, shift: [0, 1] });
    }
  });

  it('take a glyph once, leave out what the block does not animate, and skip an empty part', () => {
    const pieces = splitByParts(block, [0, 1, 3, 4, 6], [[1, 9], [], [1, 3], [7]])!;
    expect(pieces.map((p) => p.glyphs)).toEqual([[0, 4, 6], [1], [3]]);
  });

  it('are the parts themselves when they take every glyph: the first stays in the block', () => {
    const pieces = splitByParts(block, [0, 1, 3], [[3], [0, 1]])!;
    expect(pieces.map((p) => [p.id === 'x', p.glyphs])).toEqual([
      [true, [3]],
      [false, [0, 1]],
    ]);
  });

  it('are refused when the parts make a single piece', () => {
    expect(splitByParts(block, [0, 1, 3], [])).toBeNull();
    expect(splitByParts(block, [0, 1, 3], [[], [9]])).toBeNull();
    expect(splitByParts(block, [0, 1, 3], [[0, 1, 3]])).toBeNull();
    expect(splitByChoice(block, [0, 1, 3], [0, 1, 3])).toBeNull();
    expect(splitByChoice(block, [0, 1, 3], [])).toBeNull();
  });

  it('are chosen one part at a time, a glyph being in the last part that took it', () => {
    expect(withPart([], [3, 4])).toEqual([[3, 4]]);
    expect(withPart([[3, 4]], [0])).toEqual([[3, 4], [0]]);
    // What is chosen again leaves the part it was in; a part left empty is gone.
    expect(withPart([[3, 4], [0]], [4, 1])).toEqual([[3], [0], [4, 1]]);
    expect(withPart([[3], [0]], [3, 6])).toEqual([[0], [3, 6]]);
    // Nothing chosen: the parts as they are, in lists of their own.
    const parts = [[3, 4], [0]];
    expect(withPart(parts, [])).toEqual(parts);
    expect(withPart(parts, [])[0]).not.toBe(parts[0]);
  });

  it('are grouped in the project, in the step that splits the block', () => {
    const { project, clip } = scene([move('x', 2, [0, 1, 3, 4, 6]), move('y', 5, [0])]);
    loadProject(project);
    expect(splitBlockIntoRuns(clip.id, 'x').ok).toBe(true);
    const groups = actions().map((a) => groupOf(a) ?? null);
    expect(groups.slice(0, 3)).toEqual([groups[0], groups[0], groups[0]]);
    expect(groups[0]).toMatch(/^g_/);
    expect(groups[3]).toBeNull();
    // The second piece is selected: one of the group, which the timeline draws as one block.
    expect(selected()).toBe(actions()[1]!.id);
    expect(foldedGroupOf(useProjectStore.getState().project.clips[0]!, selected()!)).toBe(
      groups[0],
    );
    useProjectStore.temporal.getState().undo();
    expect(state()).toEqual({ x: [[0, 1, 3, 4, 6], null], y: [[0], null] });
  });

  it('of a member of a group are members of that group', () => {
    const { project, clip } = scene([move('a', 2, [0, 1, 3], 'g'), move('b', 2, [5], 'g')]);
    loadProject(project);
    expect(splitBlock(clip.id, 'a', [3]).ok).toBe(true);
    expect(actions().map((a) => groupOf(a))).toEqual(['g', 'g', 'g']);
    expect(actions().map((a) => (a as PartTransformAction).glyphs)).toEqual([[0, 1], [3], [5]]);
  });
});

describe('a copy of a block', () => {
  it('made after it is a block on its own, whatever the group of the original', () => {
    const { project, clip } = scene([move('a', 2, [0], 'g'), move('b', 2, [1], 'g')]);
    const plan = planCopy(project, clip.id, 'a');
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.action).toMatchObject({ start: 3, duration: 1, glyphs: [0] });
    expect('group' in plan.action).toBe(false);
    expect(plan.joins).toBeUndefined();
    loadProject(project);
    expect(duplicateBlock(clip.id, 'a').ok).toBe(true);
    expect(actions().map((a) => groupOf(a) ?? null)).toEqual(['g', 'g', null]);
  });

  it('for the other glyphs, alongside it, is grouped with it: a new group for the two', () => {
    // A Disappear of two of four glyphs: the copy takes the two that are left.
    const fade = { ...createDisappear(2, 'fade_out', [0, 1], { duration: 1 }), id: 'x' };
    const { project, clip } = oneClipScene({ glyphs: 4, start: 0, end: 10, actions: [fade] });
    const plan = planParallelCopy(project, clip.id, 'x');
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.joins).toBe('x');
    expect(plan.action).toMatchObject({ start: 2, glyphs: [2, 3] });
    expect('group' in plan.action).toBe(false); // the group is given when it goes in
    loadProject(project);
    expect(duplicateBlockForOthers(clip.id, 'x').ok).toBe(true);
    const groups = actions().map((a) => groupOf(a));
    expect(groups[0]).toMatch(/^g_/);
    expect(groups).toEqual([groups[0], groups[0]]);
    // One undo takes the copy and the group away together.
    useProjectStore.temporal.getState().undo();
    expect(actions().map((a) => [a.id, groupOf(a) ?? null])).toEqual([['x', null]]);
  });

  it('for the other glyphs joins the group the block is in', () => {
    const a = { ...createDisappear(2, 'fade_out', [0], { duration: 1 }), id: 'a', group: 'g' };
    const b = { ...createDisappear(2, 'fade_out', [1], { duration: 1 }), id: 'b', group: 'g' };
    const { project, clip } = oneClipScene({ glyphs: 4, start: 0, end: 10, actions: [a, b] });
    loadProject(project);
    expect(duplicateBlockForOthers(clip.id, 'a').ok).toBe(true);
    expect(actions().map((x) => groupOf(x))).toEqual(['g', 'g', 'g']);
  });

  it('for the other glyphs that had to go elsewhere is on its own', () => {
    // Glyphs 2 and 3 are busy over [2, 3]: the copy cannot run alongside.
    const fade = {
      ...createDisappear(2, 'fade_out', [0, 1], { duration: 1 }),
      id: 'x',
      group: 'g',
    };
    const mate = { ...createDisappear(2, 'fade_out', [4], { duration: 1 }), id: 'm', group: 'g' };
    const busy = move('busy', 2, [2, 3]);
    const { project, clip } = oneClipScene({
      glyphs: 5,
      start: 0,
      end: 10,
      actions: [fade, mate, busy],
    });
    const plan = planParallelCopy(project, clip.id, 'x');
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.joins).toBeUndefined();
    expect(plan.note).toBeDefined();
    expect('group' in plan.action).toBe(false);
    expect(plan.action.start).not.toBe(2);
  });

  it('that changes its animation stays in its group', () => {
    const a = { ...createAppear(2, 'write', [0], { duration: 1 }), id: 'a', group: 'g' };
    expect(convertBlock(a, 'appear', 'fade_in')).toMatchObject({ anim: 'fade_in', group: 'g' });
    expect(convertBlock(a, 'disappear', 'fade_out')).toMatchObject({ group: 'g' });
    const lone = { ...createAppear(2, 'write', [0]), id: 'b' };
    expect('group' in convertBlock(lone, 'appear', 'create')).toBe(false);
    const b = { ...createAppear(2, 'write', [1], { duration: 1 }), id: 'b', group: 'g' };
    const { project, clip } = oneClipScene({
      glyphs: 4,
      start: 0,
      end: 10,
      actions: [a, b],
      hiddenGlyphs: [0, 1],
    });
    loadProject(project);
    changeBlockAnimation(clip.id, 'a', 'appear', 'fade_in');
    expect(actions().map((x) => [x.kind === 'appear' && x.anim, groupOf(x)])).toEqual([
      ['fade_in', 'g'],
      ['write', 'g'],
    ]);
  });
});

describe('grouping by hand', () => {
  /** `a`, `b` and `c` run together over [2, 3]; `d` starts with them and lasts longer; `e` runs
   * later; `k` is a keyframe-free clip's only other kind of block here: none. */
  function load(extra: ClipAction[] = []) {
    const { project, clip } = scene([
      move('a', 2, [0]),
      move('b', 2, [1]),
      move('c', 2, [2]),
      { ...move('d', 2, [3]), duration: 2 },
      move('e', 5, [0]),
      ...extra,
    ]);
    loadProject(project);
    return clip;
  }
  const clipNow = () => useProjectStore.getState().project.clips[0]!;

  it('offers the blocks that start with the block and last the same', () => {
    load();
    expect(runsWith(clipNow(), 'a').map((x) => x.id)).toEqual(['b', 'c']);
    expect(runsWith(clipNow(), 'd')).toEqual([]);
    expect(runsWith(clipNow(), 'e')).toEqual([]);
    expect(runsWith(clipNow(), 'gone')).toEqual([]);
  });

  it('makes one group of them, in one step', () => {
    const clip = load();
    groupBlocks(clip.id, 'b');
    const groups = Object.fromEntries(actions().map((x) => [x.id, groupOf(x) ?? null]));
    expect(groups.a).toMatch(/^g_/);
    expect(groups).toEqual({ a: groups.a, b: groups.a, c: groups.a, d: null, e: null });
    // Nothing is left to take in.
    expect(runsWith(clipNow(), 'a')).toEqual([]);
    useProjectStore.temporal.getState().undo();
    expect(actions().some((x) => groupOf(x) !== undefined)).toBe(false);
  });

  it('takes a block into the group of those it runs with, and a whole group into another', () => {
    const clip = load();
    useProjectStore.getState().update((draft) => {
      for (const action of draft.clips[0]!.actions) {
        if (action.kind !== 'transform') continue;
        if (action.id === 'a' || action.id === 'b') action.group = 'g';
      }
    });
    // `c` runs with the group without being of it.
    expect(runsWith(clipNow(), 'a').map((x) => x.id)).toEqual(['c']);
    expect(runsWith(clipNow(), 'c').map((x) => x.id)).toEqual(['a', 'b']);
    groupBlocks(clip.id, 'c');
    expect(actions().map((x) => groupOf(x) ?? null)).toEqual(['g', 'g', 'g', null, null]);

    // Two groups over the same time are one, under the name of the block asked.
    const { project } = scene([
      move('a', 2, [0], 'g'),
      move('b', 2, [1], 'g'),
      move('c', 2, [2], 'h'),
      move('d', 2, [3], 'h'),
    ]);
    loadProject(project);
    groupBlocks(project.clips[0]!.id, 'd');
    expect(actions().map((x) => groupOf(x))).toEqual(['h', 'h', 'h', 'h']);
  });

  it('does nothing when no other block runs with it, or on a locked track', () => {
    const clip = load();
    const before = useProjectStore.getState().project;
    groupBlocks(clip.id, 'd');
    groupBlocks(clip.id, 'e');
    expect(useProjectStore.getState().project).toBe(before);
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    groupBlocks(clip.id, 'a');
    expect(actions().some((x) => groupOf(x) !== undefined)).toBe(false);
  });
});

describe('a group as a whole', () => {
  function load() {
    const { project, clip } = scene([
      move('a', 2, [0], 'g'),
      move('b', 2, [1], 'g'),
      move('c', 2, [2], 'g'),
      move('busy', 3.5, [1]),
      move('free', 6, [5]),
    ]);
    loadProject(project);
    return { project, clip };
  }

  it('is copied whole, as a group of its own, after it where all its blocks fit', () => {
    const { project, clip } = load();
    const plan = planGroupCopy(project, clip.id, 'b');
    if (!plan.ok) throw new Error(plan.reason);
    // Right after the group glyph 1 is busy from 3.5 s: the copy goes after that.
    expect(plan.actions.map((x) => [x.start, x.duration])).toEqual([
      [4.5, 1],
      [4.5, 1],
      [4.5, 1],
    ]);
    const group = groupOf(plan.actions[0]!);
    expect(group).toMatch(/^g_/);
    expect(group).not.toBe('g');
    expect(plan.actions.map((x) => groupOf(x))).toEqual([group, group, group]);
    expect(new Set(plan.actions.map((x) => x.id)).size).toBe(3);

    expect(duplicateGroup(clip.id, 'b').ok).toBe(true);
    expect(actions()).toHaveLength(8);
    const copies = actions().filter((x) => x.start === 4.5);
    expect(copies.map((x) => (x as PartTransformAction).glyphs)).toEqual([[0], [1], [2]]);
    // The copy of the block that was asked is selected: the copy is drawn as one block too.
    expect(selected()).toBe(copies[1]!.id);
    expect(foldedGroupOf(useProjectStore.getState().project.clips[0]!, selected()!)).toBe(
      groupOf(copies[0]!),
    );
    useProjectStore.temporal.getState().undo();
    expect(actions()).toHaveLength(5);
  });

  it('is copied as a block when the block is in no group', () => {
    const { project, clip } = load();
    const plan = planGroupCopy(project, clip.id, 'free');
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.actions).toHaveLength(1);
    expect('group' in plan.actions[0]!).toBe(false);
  });

  it('is refused a copy when there is no room for all of it', () => {
    // After the group, glyph 0 is free to the clip's end, but glyph 1 is busy from 9.5 s on:
    // `a` alone would fit, the group does not.
    const { project, clip } = scene([
      move('a', 8, [0], 'g'),
      move('b', 8, [1], 'g'),
      { ...move('late', 9.5, [1]), duration: 0.5 },
    ]);
    expect(planCopy(project, clip.id, 'a')).toMatchObject({ ok: true });
    expect(planGroupCopy(project, clip.id, 'a')).toMatchObject({ ok: false });
    loadProject(project);
    expect(duplicateGroup(clip.id, 'a')).toMatchObject({ ok: false });
    expect(actions()).toHaveLength(3);
    expect(planGroupCopy(project, clip.id, 'gone')).toMatchObject({ ok: false });
  });

  it('is deleted whole in one step, the selection going back to the clip', () => {
    const { clip } = load();
    useUiStore.getState().select({ kind: 'action', clipId: clip.id, actionId: 'c' });
    removeGroup(clip.id, 'a');
    expect(actions().map((x) => x.id)).toEqual(['busy', 'free']);
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [clip.id] });
    useProjectStore.temporal.getState().undo();
    expect(
      actions()
        .map((x) => [x.id, groupOf(x) ?? null])
        .slice(0, 3),
    ).toEqual([
      ['a', 'g'],
      ['b', 'g'],
      ['c', 'g'],
    ]);
  });

  it('is what the timeline acts on while it is folded, and the block itself once unfolded', () => {
    const { clip } = load();
    const now = useProjectStore.getState().project.clips[0]!;
    expect(foldedGroupOf(now, 'b')).toBe('g');
    expect(foldedGroupOf(now, 'b', new Set([groupKey(clip.id, 'g')]))).toBeNull();
    expect(foldedGroupOf(now, 'b', new Set([groupKey('another clip', 'g')]))).toBe('g');
    expect(foldedGroupOf(now, 'free')).toBeNull();
    expect(foldedGroupOf(now, 'gone')).toBeNull();
  });
});
