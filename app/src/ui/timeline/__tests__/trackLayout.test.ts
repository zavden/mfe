// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmptyProject,
  createFormula,
  createTween,
  type Project,
} from '../../../model';
import { CLIP_INSET, HANDLE_WIDTH, LANE_HEIGHT, ROW_HEIGHT } from '../layout';
import { laneHeight, STANDARD_SIZES, withTrackScale, withZoom } from '../rowSizes';
import { assignLanes, linkPortCenter, rowHeight, tracksLayout } from '../trackLayout';

const block = (id: string, start: number, end: number) => ({ id, start, end });

describe('assignLanes', () => {
  it('puts blocks that overlap in time in different lanes, in start order', () => {
    const lanes = assignLanes([block('a', 0, 2), block('b', 1, 3), block('c', 1.5, 2.5)]);
    expect(lanes.count).toBe(3);
    expect([...lanes.laneOf]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('reuses the first lane that is free, and lets blocks that only touch share one', () => {
    const lanes = assignLanes([block('a', 0, 1), block('b', 0.5, 1.5), block('c', 1, 2)]);
    expect(lanes.laneOf.get('a')).toBe(0);
    expect(lanes.laneOf.get('b')).toBe(1);
    expect(lanes.laneOf.get('c')).toBe(0); // starts exactly when a ends
    expect(lanes.count).toBe(2);
  });

  it('does not move a block because of one that starts after it', () => {
    const before = assignLanes([block('a', 0, 2), block('b', 1, 3)]);
    const after = assignLanes([block('a', 0, 2), block('b', 1, 3), block('z', 5, 6)]);
    expect(after.laneOf.get('a')).toBe(before.laneOf.get('a'));
    expect(after.laneOf.get('b')).toBe(before.laneOf.get('b'));
  });

  it('does not depend on the order of the list, and an empty strip is one lane tall', () => {
    const a = assignLanes([block('b', 1, 3), block('a', 0, 2)]);
    expect(a.laneOf.get('a')).toBe(0);
    expect(a.laneOf.get('b')).toBe(1);
    expect(assignLanes([]).count).toBe(1);
  });

  it('puts the top block (the one dragged last) on the first lane, the others around it', () => {
    const blocks = [block('a', 0, 2), block('b', 1, 3), block('c', 2.5, 4)];
    const top = assignLanes(blocks, 'b');
    expect(top.laneOf.get('b')).toBe(0);
    expect(top.laneOf.get('a')).toBe(1); // overlaps b
    expect(top.laneOf.get('c')).toBe(1); // after a on the second lane; b still runs
    expect(top.count).toBe(2);
    // A top block that overlaps nothing changes nothing; an unknown id is ignored.
    const alone = assignLanes(blocks, 'c');
    expect([...alone.laneOf]).toEqual([
      ['c', 0],
      ['a', 0],
      ['b', 1],
    ]);
    expect([...assignLanes(blocks, 'zzz').laneOf]).toEqual([...assignLanes(blocks).laneOf]);
  });
});

function sample(): { project: Project; clips: ReturnType<typeof createClip>[] } {
  const project = createEmptyProject();
  project.formulas.push(createFormula({ name: 'f' }));
  const [t1, t2] = project.tracks;
  const f = project.formulas[0]!.id;
  const clips = [
    createClip(f, t1!.id, 0, 10),
    createClip(f, t1!.id, 12, 20),
    createClip(f, t2!.id, 0, 10),
  ];
  project.clips.push(...clips);
  return { project, clips };
}

describe('tracksLayout', () => {
  it('keeps ROW_HEIGHT for tracks whose blocks fit in one lane', () => {
    const { project, clips } = sample();
    clips[0]!.actions.push(createAppear(1, 'write', [0]), createDisappear(3, 'fade_out', [0]));
    const layout = tracksLayout(project);
    expect(layout.rows.map((r) => [r.top, r.height, r.lanes])).toEqual([
      [0, ROW_HEIGHT, 1],
      [ROW_HEIGHT, ROW_HEIGHT, 1],
    ]);
    expect(layout.height).toBe(2 * ROW_HEIGHT);
  });

  it('grows a track by a lane height per extra lane, and only that track', () => {
    const { project, clips } = sample();
    clips[0]!.actions.push(
      createAppear(1, 'write', [0], { duration: 2 }),
      createDisappear(2, 'fade_out', [1], { duration: 2 }),
      createTween(2.5, 1, { rotation: 5 }),
    );
    clips[1]!.actions.push(createAppear(1, 'write', [0])); // the other clip of the track: 1 lane
    const layout = tracksLayout(project);
    expect(layout.clips.get(clips[0]!.id)!.count).toBe(3);
    expect(layout.clips.get(clips[1]!.id)!.count).toBe(1);
    expect(layout.rows[0]!.height).toBe(ROW_HEIGHT + 2 * LANE_HEIGHT);
    expect(layout.rows[0]!.height).toBe(rowHeight(3));
    expect(layout.rows[1]).toMatchObject({ top: rowHeight(3), height: ROW_HEIGHT });
    expect(layout.rowOf(project.tracks[1]!.id)).toBe(layout.rows[1]);
  });

  it('draws each track at the scale its sizes say: taller lanes, and a layout per sizes', () => {
    const { project, clips } = sample();
    clips[0]!.actions.push(
      createAppear(1, 'write', [0], { duration: 2 }),
      createDisappear(2, 'fade_out', [1], { duration: 2 }),
    );
    const [first, second] = project.tracks;
    const standard = tracksLayout(project);
    expect(standard.rows[0]).toMatchObject({ scale: 1, lane: LANE_HEIGHT });
    // Every track twice as tall: two lanes of blocks and the lower one, each 38 px.
    const zoomed = withZoom(STANDARD_SIZES, 2);
    const double = tracksLayout(project, null, undefined, zoomed);
    expect(double.rows[0]).toMatchObject({ scale: 2, lane: 2 * LANE_HEIGHT, lanes: 2 });
    expect(double.rows[0]!.height).toBe(2 * CLIP_INSET + 3 * 2 * LANE_HEIGHT);
    expect(double.rows[1]).toMatchObject({ top: double.rows[0]!.height, scale: 2 });
    expect(double.height).toBe(double.rows.reduce((sum, row) => sum + row.height, 0));
    // One track with a height of its own: the others keep theirs, and start after it.
    const own = withTrackScale(STANDARD_SIZES, first!.id, 1.5);
    const mixed = tracksLayout(project, null, undefined, own);
    expect(mixed.rowOf(first!.id)).toMatchObject({ scale: 1.5, lane: laneHeight(1.5) });
    expect(mixed.rowOf(second!.id)).toMatchObject({
      scale: 1,
      height: ROW_HEIGHT,
      top: mixed.rows[0]!.height,
    });
    // The row under a point follows the heights.
    expect(standard.indexAt(ROW_HEIGHT + LANE_HEIGHT + 2)).toBe(1);
    expect(double.indexAt(ROW_HEIGHT + LANE_HEIGHT + 2)).toBe(0);
    // Cached by the sizes object, as by the top block.
    expect(tracksLayout(project, null, undefined, zoomed)).toBe(double);
    expect(tracksLayout(project)).toBe(standard);
    // The link port of a clip is in the middle of its lower lane.
    const [, y] = linkPortCenter(clips[0]!, double.rows[0]!, 80);
    expect(y).toBe(double.rows[0]!.height - CLIP_INSET - LANE_HEIGHT);
  });

  it('lays the top block out on the first lane of its clip, and caches per top block', () => {
    const { project, clips } = sample();
    const first = createAppear(1, 'write', [0], { duration: 2 });
    const second = createDisappear(2, 'fade_out', [1], { duration: 2 });
    clips[0]!.actions.push(first, second);
    const plain = tracksLayout(project);
    expect(plain.clips.get(clips[0]!.id)!.laneOf.get(second.id)).toBe(1);
    const topped = tracksLayout(project, second.id);
    expect(topped.clips.get(clips[0]!.id)!.laneOf.get(second.id)).toBe(0);
    expect(topped.clips.get(clips[0]!.id)!.laneOf.get(first.id)).toBe(1);
    expect(topped.rows[0]!.height).toBe(plain.rows[0]!.height);
    expect(tracksLayout(project)).toBe(plain);
    expect(tracksLayout(project, second.id)).toBe(topped);
  });

  it('finds the row under a y position and clamps it', () => {
    const { project, clips } = sample();
    clips[0]!.actions.push(
      createAppear(1, 'write', [0], { duration: 2 }),
      createDisappear(2, 'fade_out', [1], { duration: 2 }),
    );
    const layout = tracksLayout(project); // rows: [0, 65), [65, 111)
    expect(layout.indexAt(-10)).toBe(0);
    expect(layout.indexAt(64)).toBe(0);
    expect(layout.indexAt(65)).toBe(1);
    expect(layout.indexAt(5000)).toBe(1);
    expect(tracksLayout({ ...project, tracks: [] }).indexAt(10)).toBe(-1);
  });
});

describe('linkPortCenter', () => {
  it('puts the port in the middle of the lower half, by the right end, below every lane', () => {
    const { project, clips } = sample();
    clips[0]!.actions.push(
      createAppear(8, 'write', [0], { duration: 2 }),
      createDisappear(8.5, 'fade_out', [1], { duration: 1.5 }),
    );
    const layout = tracksLayout(project);
    const row = layout.rows[0]!; // two lanes of blocks
    const [x, y] = linkPortCenter(clips[0]!, row, 50);
    expect(x).toBe(10 * 50 - HANDLE_WIDTH - 3 - 7);
    expect(y).toBe(row.top + row.height - CLIP_INSET - LANE_HEIGHT / 2);
    // Below the lowest lane of blocks.
    expect(y - 7).toBeGreaterThanOrEqual(row.top + CLIP_INSET + 2 * LANE_HEIGHT);
    const second = layout.rows[1]!;
    expect(linkPortCenter(clips[2]!, second, 50)[1]).toBe(
      second.top + ROW_HEIGHT - CLIP_INSET - LANE_HEIGHT / 2,
    );
  });

  it('keeps the port on a narrow clip, by its left end', () => {
    const { project, clips } = sample();
    const [x] = linkPortCenter(clips[1]!, tracksLayout(project).rows[0]!, 1);
    expect(x).toBe(12 + 7);
  });
});
