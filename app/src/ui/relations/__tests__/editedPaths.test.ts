// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { arcSpline } from '../../../geom';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  type GlyphPair,
  type PathSpline,
  type Project,
  type Relation,
} from '../../../model';
import {
  editedPathCount,
  editedPathsText,
  hasEditedPath,
  pathOfPair,
  relationPathAction,
} from '../relationOps';

/* The marks of an edited path (D48): a pair has a path of its own when it was shaped in Edit
 * path, which keeps no path that is the chord itself or the arc of what holds it. */

const chord: PathSpline = {
  nodes: [
    { at: [0, 0], in: null, out: null, smooth: false },
    { at: [1, 0], in: null, out: null, smooth: false },
  ],
};
const bump: PathSpline = {
  nodes: [
    { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
    { at: [1, 0], in: [0.7, 0.4], out: null, smooth: false },
  ],
};
const pair = (path?: PathSpline): GlyphPair => ({
  from: [0],
  to: [0],
  style: null,
  ...(path ? { path } : {}),
});

describe('an edited path', () => {
  it("is a path of the pair's own: neither none, nor the chord, nor the holder's arc", () => {
    expect(hasEditedPath(pair(), { pathArc: 30 })).toBe(false);
    expect(hasEditedPath(pair(chord), { pathArc: 0 })).toBe(false);
    expect(hasEditedPath(pair(chord), { pathArc: 30 })).toBe(false);
    expect(hasEditedPath(pair(arcSpline(30)), { pathArc: 30 })).toBe(false);
    expect(hasEditedPath(pair(bump), { pathArc: 0 })).toBe(true);
    expect(hasEditedPath(pair(bump), { pathArc: 30 })).toBe(true);
    // An arc kept from before the holder's arc changed is the pair's own now.
    expect(hasEditedPath(pair(arcSpline(30)), { pathArc: 60 })).toBe(true);
  });

  it('is counted per holder, and said as the Relations list says it', () => {
    const holder = {
      pathArc: 30,
      pairs: [pair(bump), pair(chord), pair(), pair(arcSpline(30)), pair(arcSpline(-45))],
    };
    expect(editedPathCount(holder)).toBe(2);
    expect(editedPathCount({ pathArc: 0, pairs: [] })).toBe(0);
    expect(editedPathsText(0)).toBeNull();
    expect(editedPathsText(1)).toBe('1 path edited');
    expect(editedPathsText(2)).toBe('2 paths edited');
  });

  it('is what "custom path" says, and a stored path that is the arc reads as that arc', () => {
    expect(pathOfPair(pair(bump), { pathArc: 30 })).toBe('custom path');
    expect(pathOfPair(pair(arcSpline(30)), { pathArc: 30 })).toBe('arc 30°');
    expect(pathOfPair(pair(chord), { pathArc: 30 })).toBe('straight');
    expect(pathOfPair(pair(), { pathArc: 0 })).toBe('straight');
    expect(pathOfPair(pair(), { pathArc: -20 })).toBe('arc -20°');
  });
});

describe('«Edit path…» of a row of the Relations list', () => {
  /** f1 (clip a, track 1) → f2 (clip b, track 2), with the pairs given. */
  function scene(pairs: GlyphPair[]): { project: Project; relation: Relation } {
    const project = createEmptyProject();
    const fa = createFormula({ name: 'f1', source: 'x+y' });
    const fb = createFormula({ name: 'f2', source: 'y+x' });
    project.formulas.push(fa, fb);
    const a = createClip(fa.id, project.tracks[0]!.id, 0, 6);
    const b = createClip(fb.id, project.tracks[1]!.id, 2, 8);
    project.clips.push(a, b);
    const relation = createRelation(a.id, b.id, { pairs });
    project.relations.push(relation);
    return { project, relation };
  }

  it('opens the mode on the one pair, and the path picker for several', () => {
    const one = scene([pair()]);
    expect(relationPathAction(one.project, one.relation)).toEqual({ kind: 'pair', index: 0 });
    const two = scene([pair(), pair(bump)]);
    expect(relationPathAction(two.project, two.relation)).toEqual({ kind: 'picker' });
  });

  it('cannot without pairs, with a locked track or a formula that is gone, and says why', () => {
    const none = scene([]);
    expect(relationPathAction(none.project, none.relation)).toEqual({
      kind: 'blocked',
      reason: 'No pairs yet: open the pair editor to link glyphs.',
    });
    const { project, relation } = scene([pair(), pair()]);
    for (const index of [0, 1]) {
      const tracks = project.tracks.map((t, i) => (i === index ? { ...t, locked: true } : t));
      expect(relationPathAction({ ...project, tracks }, relation)).toEqual({
        kind: 'blocked',
        reason: `Track “${tracks[index]!.name}” is locked: unlock it on the timeline to create, edit or delete relations of its clips.`,
      });
    }
    const dangling = { ...project, formulas: project.formulas.slice(1) };
    expect(relationPathAction(dangling, relation)).toEqual({
      kind: 'blocked',
      reason: 'A formula of this relation no longer exists.',
    });
  });
});
