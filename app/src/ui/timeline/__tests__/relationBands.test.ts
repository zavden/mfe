// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createTrack,
  type Clip,
  type Project,
} from '../../../model';
import { bandKey, bandSlots } from '../relationBands';

/** Three clips over [0, 10] on three tracks. */
function scene(): { project: Project; a: Clip; b: Clip; c: Clip } {
  const project = createEmptyProject();
  project.tracks.push(createTrack('Track 3'));
  const [a, b, c] = ['a', 'b', 'c'].map((name, i) => {
    const formula = createFormula({ name });
    project.formulas.push(formula);
    const clip = createClip(formula.id, project.tracks[i]!.id, 0, 10);
    project.clips.push(clip);
    return clip;
  }) as [Clip, Clip, Clip];
  return { project, a, b, c };
}

/** A relation over [start, start + duration) (the clips start at 0). */
const relate = (project: Project, from: Clip, to: Clip, start: number, duration = 1) => {
  const relation = createRelation(from.id, to.id, { offset: start, duration });
  project.relations.push(relation);
  return relation;
};

describe('the stripes of the relation bands of a clip', () => {
  it('gives a band nothing overlaps the whole lane, on both of its clips', () => {
    const { project, a, b } = scene();
    const first = relate(project, a, b, 1);
    const later = relate(project, a, b, 2); // starts where the first ends: no overlap
    const slots = bandSlots(project);
    for (const relation of [first, later]) {
      expect(slots.get(bandKey(relation.id, a.id))).toEqual({ slot: 0, of: 1 });
      expect(slots.get(bandKey(relation.id, b.id))).toEqual({ slot: 0, of: 1 });
    }
    expect(slots.size).toBe(4);
  });

  it('cuts the lane in two for two relations with the same window, in the project order', () => {
    const { project, a, b } = scene();
    const first = relate(project, a, b, 1);
    const second = relate(project, a, b, 1);
    const slots = bandSlots(project);
    for (const clip of [a, b]) {
      expect(slots.get(bandKey(first.id, clip.id))).toEqual({ slot: 0, of: 2 });
      expect(slots.get(bandKey(second.id, clip.id))).toEqual({ slot: 1, of: 2 });
    }
  });

  it('stripes windows that overlap in part, the earlier one on top', () => {
    const { project, a, b } = scene();
    const late = relate(project, a, b, 1.5); // made first, starts later
    const early = relate(project, a, b, 1);
    const slots = bandSlots(project);
    expect(slots.get(bandKey(early.id, b.id))).toEqual({ slot: 0, of: 2 });
    expect(slots.get(bandKey(late.id, b.id))).toEqual({ slot: 1, of: 2 });
  });

  it('counts the bands of a clip whatever the other clip is, and each clip by itself', () => {
    const { project, a, b, c } = scene();
    const ab = relate(project, a, b, 1, 2); // [1, 3)
    const cb = relate(project, c, b, 2, 2); // [2, 4): overlaps on b only
    const slots = bandSlots(project);
    // On b the two share the lane; a and c carry one band each.
    expect(slots.get(bandKey(ab.id, b.id))).toEqual({ slot: 0, of: 2 });
    expect(slots.get(bandKey(cb.id, b.id))).toEqual({ slot: 1, of: 2 });
    expect(slots.get(bandKey(ab.id, a.id))).toEqual({ slot: 0, of: 1 });
    expect(slots.get(bandKey(cb.id, c.id))).toEqual({ slot: 0, of: 1 });
  });

  it('reuses a stripe once its band has ended, within a group of chained overlaps', () => {
    const { project, a, b } = scene();
    const one = relate(project, a, b, 1, 2); // [1, 3)
    const two = relate(project, a, b, 2, 2); // [2, 4)
    const three = relate(project, a, b, 3, 2); // [3, 5): after one, during two
    const apart = relate(project, a, b, 6); // its own group
    const slots = bandSlots(project);
    expect(slots.get(bandKey(one.id, b.id))).toEqual({ slot: 0, of: 2 });
    expect(slots.get(bandKey(two.id, b.id))).toEqual({ slot: 1, of: 2 });
    expect(slots.get(bandKey(three.id, b.id))).toEqual({ slot: 0, of: 2 });
    expect(slots.get(bandKey(apart.id, b.id))).toEqual({ slot: 0, of: 1 });
  });

  it('has no band for a relation whose clip is missing', () => {
    const { project, a, b } = scene();
    const lost = createRelation(a.id, 'nope', { offset: 1 });
    project.relations.push(lost);
    relate(project, a, b, 1);
    const slots = bandSlots(project);
    expect(slots.has(bandKey(lost.id, a.id))).toBe(false);
    expect(slots.size).toBe(2);
  });
});
