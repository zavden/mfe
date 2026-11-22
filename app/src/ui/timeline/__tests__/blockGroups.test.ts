// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmphasis,
  createEmptyProject,
  createPartTransform,
  createTween,
  type Clip,
  type ClipAction,
  type Project,
} from '../../../model';
import {
  ALL_FOLDED,
  drawnBlocks,
  groupCategory,
  groupDescription,
  groupKey,
  groupLabel,
  groupTitle,
} from '../blockGroups';
import { moveItem, type TimelineItem } from '../keyboardNav';
import { LANE_HEIGHT, ROW_HEIGHT } from '../layout';
import { clipLanes, tracksLayout } from '../trackLayout';

const write = (id: string, start: number, glyphs: number[], group?: string): ClipAction => ({
  ...createAppear(start, 'write', glyphs, { duration: 1 }),
  id,
  ...(group === undefined ? {} : { group }),
});

/** A clip `c` over [0, 10]: a group `g` of three Writes over [1, 2], a block `solo` over the
 * same time and one `late` over [3, 4], then a group `h` of two blocks of different kinds over
 * [5, 6] with `tail` right after its first member in the clip's order. */
function clip(): Clip {
  const c = createClip('f', 't1', 0, 10, {
    actions: [
      write('a', 1, [0], 'g'),
      write('solo', 1, [3]),
      write('b', 1, [1], 'g'),
      write('c', 1, [2], 'g'),
      write('late', 3, [4]),
      { ...createEmphasis(5, 'indicate', [0], { duration: 1 }), id: 'd', group: 'h' },
      { ...createTween(6.5, 1, {}), id: 'tail' },
      { ...createDisappear(5, 'fade_out', [1], { duration: 1 }), id: 'e', group: 'h' },
    ],
  });
  c.id = 'c';
  return c;
}

const shape = (c: Clip, unfolded?: ReadonlySet<string>) =>
  drawnBlocks(c, unfolded).map(({ id, group, members }) => [id, group, members.map((m) => m.id)]);

describe('what the timeline draws for the blocks of a clip', () => {
  it('is one block for a group, where its first member is, and a block for any other', () => {
    expect(shape(clip())).toEqual([
      ['a', 'g', ['a', 'b', 'c']],
      ['solo', null, ['solo']],
      ['late', null, ['late']],
      ['d', 'h', ['d', 'e']],
      ['tail', null, ['tail']],
    ]);
    expect(shape(clip(), ALL_FOLDED)).toEqual(shape(clip()));
  });

  it('is a block for each member of a group that is unfolded', () => {
    expect(shape(clip(), new Set([groupKey('c', 'g')]))).toEqual([
      ['a', null, ['a']],
      ['solo', null, ['solo']],
      ['b', null, ['b']],
      ['c', null, ['c']],
      ['late', null, ['late']],
      ['d', 'h', ['d', 'e']],
      ['tail', null, ['tail']],
    ]);
    // A group of the same name in another clip is another group.
    expect(shape(clip(), new Set([groupKey('other', 'g')]))).toEqual(shape(clip()));
  });
});

describe('the lanes of a clip with groups', () => {
  it('give a folded group one lane, whatever the number of its members', () => {
    const lanes = clipLanes(clip());
    // `a`, `b` and `c` are one block; `solo` runs with it and takes the lane below.
    expect(lanes.count).toBe(2);
    expect(Object.fromEntries(lanes.laneOf)).toEqual({
      a: 0,
      b: 0,
      c: 0,
      solo: 1,
      late: 0,
      d: 0,
      e: 0,
      tail: 0,
    });
    expect(Object.fromEntries(lanes.shownAs)).toEqual({
      a: 'a',
      b: 'a',
      c: 'a',
      solo: 'solo',
      late: 'late',
      d: 'd',
      e: 'd',
      tail: 'tail',
    });
  });

  it('give each member of an unfolded group a lane of its own', () => {
    const lanes = clipLanes(clip(), null, new Set([groupKey('c', 'g')]));
    expect(lanes.count).toBe(4);
    expect([lanes.laneOf.get('a'), lanes.laneOf.get('solo')]).toEqual([0, 1]);
    expect([lanes.laneOf.get('b'), lanes.laneOf.get('c')]).toEqual([2, 3]);
    expect(lanes.shownAs.get('b')).toBe('b');
    expect(lanes.shownAs.get('e')).toBe('d');
  });

  it('put a folded group on the top lane when one of its members was dragged last', () => {
    // `solo` comes first in start order only by its place; dragged last, the group lies over it.
    const lanes = clipLanes(
      createClip('f', 't1', 0, 10, {
        actions: [write('solo', 1, [3]), write('a', 1, [0], 'g'), write('b', 1, [1], 'g')],
      }),
      'b',
    );
    expect(Object.fromEntries(lanes.laneOf)).toEqual({ a: 0, b: 0, solo: 1 });
  });

  it('make a track as high as its folded groups need, and higher once one is unfolded', () => {
    const project: Project = createEmptyProject('t');
    const c = clip();
    c.trackId = project.tracks[0]!.id;
    project.clips = [c];
    const folded = tracksLayout(project);
    expect(folded.rows[0]!.height).toBe(ROW_HEIGHT + LANE_HEIGHT);
    const unfolded = new Set([groupKey('c', 'g')]);
    const open = tracksLayout(project, null, unfolded);
    expect(open.rows[0]!.height).toBe(ROW_HEIGHT + 3 * LANE_HEIGHT);
    // The layout of a project is kept for each way of drawing it.
    expect(tracksLayout(project)).toBe(folded);
    expect(tracksLayout(project, null, unfolded)).toBe(open);
  });
});

describe('the label of a folded group', () => {
  const members = (c: Clip, group: string) =>
    drawnBlocks(c).find((block) => block.group === group)!.members;

  it('names the animation its members share, or calls it a group', () => {
    expect(groupLabel(members(clip(), 'g'))).toBe('Write ×3');
    expect(groupLabel(members(clip(), 'h'))).toBe('Group ×2');
    expect(groupCategory(members(clip(), 'g'))).toBe('appear');
    expect(groupCategory(members(clip(), 'h'))).toBe('mixed');
    // Two animations of one family are still two animations.
    const fades = [
      createAppear(0, 'write', [0]),
      createAppear(0, 'fade_in', [1]),
      createPartTransform(0, [2]),
    ];
    expect(groupLabel(fades.slice(0, 2))).toBe('Group ×2');
    expect(groupCategory(fades.slice(0, 2))).toBe('appear');
    expect(groupCategory(fades)).toBe('mixed');
  });

  it('says what the group holds and when it runs', () => {
    const c = { ...clip(), start: 2 };
    expect(groupTitle(members(c, 'g'), c.start)).toBe(
      'Group of 3 animations that run together\n· Write · 1\n· Write · 1\n· Write · 1\n3.00 s → 4.00 s · 1.00 s',
    );
    expect(groupDescription(members(c, 'h'), c, 0, 2)).toBe(
      'Group of 2 animations: Indicate · 1, FadeOut · 1, 7.00 to 8.00 s, lane 1 of 2',
    );
    expect(groupDescription(members(c, 'h'), c, 0, 1)).toBe(
      'Group of 2 animations: Indicate · 1, FadeOut · 1, 7.00 to 8.00 s',
    );
  });
});

describe('the keyboard, on a clip with groups', () => {
  function scene(unfolded?: ReadonlySet<string>) {
    const project: Project = createEmptyProject('t');
    const c = clip();
    c.trackId = project.tracks[0]!.id;
    project.clips = [c];
    return { project, layout: tracksLayout(project, null, unfolded) };
  }
  const block = (actionId: string): TimelineItem => ({ kind: 'block', clipId: 'c', actionId });

  it('walks a lane with a folded group as one block, reached as its first member', () => {
    const { project, layout } = scene();
    // Lane 0: the group g, late, the group h, tail.
    expect(moveItem('ArrowRight', block('a'), project, layout)).toEqual(block('late'));
    expect(moveItem('ArrowRight', block('late'), project, layout)).toEqual(block('d'));
    expect(moveItem('ArrowRight', block('d'), project, layout)).toEqual(block('tail'));
    expect(moveItem('ArrowLeft', block('late'), project, layout)).toEqual(block('a'));
    expect(moveItem('End', block('a'), project, layout)).toEqual(block('tail'));
    expect(moveItem('Home', block('tail'), project, layout)).toEqual(block('a'));
    // From the lane below, up: the group, not one of its hidden members.
    expect(moveItem('ArrowUp', block('solo'), project, layout)).toEqual(block('a'));
    expect(moveItem('ArrowDown', block('a'), project, layout)).toEqual(block('solo'));
  });

  it('goes on from any member of a folded group as from the group', () => {
    const { project, layout } = scene();
    // The panel can select a member that is not the first: the block is the same one.
    expect(moveItem('ArrowRight', block('c'), project, layout)).toEqual(block('late'));
    expect(moveItem('ArrowLeft', block('e'), project, layout)).toEqual(block('late'));
    expect(moveItem('ArrowLeft', block('b'), project, layout)).toBeNull();
  });

  it('walks the members of an unfolded group as blocks', () => {
    const { project, layout } = scene(new Set([groupKey('c', 'g')]));
    expect(moveItem('ArrowDown', block('a'), project, layout)).toEqual(block('solo'));
    expect(moveItem('ArrowDown', block('solo'), project, layout)).toEqual(block('b'));
    expect(moveItem('ArrowDown', block('b'), project, layout)).toEqual(block('c'));
    expect(moveItem('ArrowUp', { kind: 'clip', clipId: 'c' }, project, layout)).toEqual(block('c'));
  });
});
