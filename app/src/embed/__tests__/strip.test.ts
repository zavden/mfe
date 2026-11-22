// @vitest-environment node
/* The timeline strip's layout: the rows of the visual tracks, the clips where their times are,
 * the intro and outro bands, the blocks in lanes, the relation windows on both clips with the
 * arrow between them, the ruler's ticks, a part of the scene, and time ↔ x. */
import { describe, expect, it } from 'vitest';
import { parseProject, type Project } from '../../model';
import { readExample } from '../../test/examples';
import {
  assignLanes,
  CLIP_INSET,
  FOOT_HEIGHT,
  HEADER_WIDTH,
  LANE_HEIGHT,
  layoutStrip,
  rulerTicks,
  timeToX,
  xToTime,
} from '../strip';

function example(name: string): Project {
  const parsed = parseProject(readExample(name));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.project;
}

describe('the strip of hello.mfe.json', () => {
  const project = example('hello.mfe.json'); // a1 on t_1 (0–3), f2 on t_2 (2–5), r: 2–3
  const layout = layoutStrip(project, { start: 0, end: 5 }, 576);

  it('has a row per visual track, the column of names, and 100 px a second', () => {
    expect(layout.header).toBe(HEADER_WIDTH);
    expect(layout.lanes).toBe(500);
    expect(layout.pxPerSecond).toBe(100);
    expect(layout.rows.map((r) => [r.name, r.top, r.lanes])).toEqual([
      ['Track 2', 0, 1],
      ['Track 1', layout.rows[0]!.height, 1],
    ]);
    expect(layout.rows[0]!.height).toBe(2 * CLIP_INSET + LANE_HEIGHT + FOOT_HEIGHT);
  });

  it('puts each clip at its times, in its tag colour, with its intro and outro bands', () => {
    const [a1] = layout.rows[0]!.clips;
    const [f2] = layout.rows[1]!.clips;
    expect(a1).toMatchObject({ name: 'a1', color: '#83C167', left: 0, width: 300 });
    expect(a1!.intro).toEqual({ left: 0, width: 100, label: 'Write' });
    expect(a1!.outro).toEqual({ left: 200, width: 100, label: 'FadeOut' });
    expect(f2).toMatchObject({ name: 'f2', left: 200, width: 300, intro: null });
    // Its tween, 1.2 s after its start for 0.6 s, in its first lane.
    expect(f2!.blocks).toHaveLength(1);
    const [tween] = f2!.blocks;
    expect(tween).toMatchObject({ category: 'transform', label: 'Transform', lane: 0 });
    expect(tween!.left).toBeCloseTo(120, 9);
    expect(tween!.width).toBeCloseTo(60, 9);
  });

  it('draws the relation window on both clips and an arrow down to the target', () => {
    expect(layout.relations).toHaveLength(1);
    const [relation] = layout.relations;
    const foot = (row: (typeof layout.rows)[number]) =>
      row.top + row.height - CLIP_INSET - FOOT_HEIGHT;
    expect(relation!.windows).toEqual([
      { left: 200, width: 100, top: foot(layout.rows[0]!), height: FOOT_HEIGHT },
      { left: 200, width: 100, top: foot(layout.rows[1]!), height: FOOT_HEIGHT },
    ]);
    expect(relation!.arrow).toMatch(/^M[\d.]+ [\d.]+ C/);
    expect(relation!.title).toBe('a1 → f2, 2.00 → 3.00 s, 4 pairs');
  });

  it('labels the ruler every second here, but where the end would cut the label', () => {
    expect(layout.ticks.filter((t) => t.major).map((t) => [t.label, t.x])).toEqual([
      ['0s', 0],
      ['1s', 100],
      ['2s', 200],
      ['3s', 300],
      ['4s', 400],
      ['', 500],
    ]);
  });

  it('maps time and x both ways, inside the range', () => {
    expect(timeToX(layout, 2.5)).toBe(250);
    expect(xToTime(layout, 250)).toBe(2.5);
    expect(xToTime(layout, -40)).toBe(0);
    expect(xToTime(layout, 900)).toBe(5);
  });
});

describe('a part of the scene', () => {
  it('shows only the clips and windows inside it, cut where it ends', () => {
    const project = example('hello.mfe.json');
    // Narrow: no column of names, the lanes the whole width.
    const layout = layoutStrip(project, { start: 2.5, end: 4.5 }, 200);
    expect(layout.pxPerSecond).toBe(100);
    const [a1] = layout.rows[0]!.clips;
    const [f2] = layout.rows[1]!.clips;
    expect(a1).toMatchObject({ left: 0, width: 50, cutStart: true, cutEnd: false });
    expect(f2).toMatchObject({ left: 0, width: 200, cutStart: true, cutEnd: true });
    expect(layout.relations[0]!.windows[0]).toMatchObject({ left: 0, width: 50 });
  });

  it('has no column of names on a narrow page', () => {
    const layout = layoutStrip(example('hello.mfe.json'), { start: 0, end: 5 }, 300);
    expect(layout.header).toBe(0);
    expect(layout.lanes).toBe(300);
  });
});

describe('the blocks of animation-blocks.mfe.json', () => {
  it('take lanes as the app gives them: overlapping blocks one over the other', () => {
    const project = example('animation-blocks.mfe.json');
    const layout = layoutStrip(project, { start: 0, end: 8 }, 876);
    const blocks = layout.rows.flatMap((r) => r.clips.flatMap((c) => c.blocks));
    expect(blocks.length).toBeGreaterThan(3);
    for (const row of layout.rows) {
      expect(row.height).toBe(2 * CLIP_INSET + row.lanes * LANE_HEIGHT + FOOT_HEIGHT);
    }
  });
});

describe('lanes and ticks', () => {
  it('stack blocks that overlap and share a lane between blocks that only touch', () => {
    const lanes = assignLanes([
      { id: 'a', start: 0, end: 1 },
      { id: 'b', start: 0.5, end: 1.5 },
      { id: 'c', start: 1, end: 2 },
      { id: 'd', start: 1.5, end: 3 },
    ]);
    expect(Object.fromEntries(lanes)).toEqual({ a: 0, b: 1, c: 0, d: 1 });
  });

  it('space the labelled ticks at least 56 px apart, with small ones between', () => {
    const ticks = rulerTicks({ start: 0, end: 12 }, 300);
    const labelled = ticks.filter((t) => t.major);
    expect(labelled.map((t) => t.label)).toEqual(['0s', '5s', '10s']);
    expect(ticks.length).toBeGreaterThan(labelled.length);
    const fine = rulerTicks({ start: 1, end: 2 }, 640).filter((t) => t.major);
    expect(fine.map((t) => t.label)).toEqual([
      '1s',
      '1.1s',
      '1.2s',
      '1.3s',
      '1.4s',
      '1.5s',
      '1.6s',
      '1.7s',
      '1.8s',
      '1.9s',
      '', // at the very end: its label would be cut
    ]);
  });
});
