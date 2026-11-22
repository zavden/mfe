// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createClip, createEmptyProject } from '../../../model';
import { clipsInRect, timeRect } from '../marquee';
import { tracksLayout } from '../trackLayout';

/** Two tracks (Track 2 on top, Track 1 below); a on the top row 0–4 s, b below 2–6 s, c on the
 * top row 5–9 s. */
function build() {
  const project = createEmptyProject('t');
  const [top, bottom] = project.tracks;
  const a = createClip('f', top!.id, 0, 4);
  a.id = 'a';
  const b = createClip('f', bottom!.id, 2, 6);
  b.id = 'b';
  const c = createClip('f', top!.id, 5, 9);
  c.id = 'c';
  project.clips = [a, b, c];
  return { project, layout: tracksLayout(project) };
}

describe('timeRect', () => {
  it('is normalised whichever way the drag goes', () => {
    expect(timeRect([3, 40], [1, 10])).toEqual({ t0: 1, t1: 3, y0: 10, y1: 40 });
    expect(timeRect([1, 10], [3, 40])).toEqual({ t0: 1, t1: 3, y0: 10, y1: 40 });
  });
});

describe('clipsInRect', () => {
  const { project, layout } = build();
  const rows = layout.rows;
  const top = rows[0]!;
  const bottom = rows[1]!;

  it('takes the clips the rectangle touches in time and in rows, in the project order', () => {
    // Over both rows, 3 … 7 s: a (ends at 4), b and c (starts at 5).
    const both = { t0: 3, t1: 7, y0: top.top + 2, y1: bottom.top + 2 };
    expect(clipsInRect(project, layout, both)).toEqual(['a', 'b', 'c']);
    // The top row only, 4.5 … 7 s: c alone.
    const upper = { t0: 4.5, t1: 7, y0: top.top + 1, y1: top.top + top.height - 1 };
    expect(clipsInRect(project, layout, upper)).toEqual(['c']);
    // The bottom row only, 0 … 1 s: nothing (b starts at 2).
    const lower = { t0: 0, t1: 1, y0: bottom.top + 1, y1: bottom.top + 2 };
    expect(clipsInRect(project, layout, lower)).toEqual([]);
  });

  it('counts touching edges, in time and in rows', () => {
    const edge = { t0: 4, t1: 4.5, y0: top.top + 1, y1: top.top + 2 }; // a ends at 4
    expect(clipsInRect(project, layout, edge)).toEqual(['a']);
    const seam = { t0: 2.5, t1: 3, y0: top.top + top.height, y1: top.top + top.height + 1 };
    expect(clipsInRect(project, layout, seam)).toEqual(['a', 'b']); // the rows' shared edge
  });

  it('leaves out a clip whose track has no row', () => {
    const orphan = { ...project, clips: [{ ...project.clips[0]!, trackId: 'gone' }] };
    expect(clipsInRect(orphan, layout, { t0: 0, t1: 9, y0: 0, y1: 999 })).toEqual([]);
  });
});
