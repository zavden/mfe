// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAttach,
  createClip,
  createEmptyProject,
  createRelation,
  createTextFormula,
  type TextGeometryRef,
} from '../../model';
import { textGeometry } from '../../test/textGeometry';
import { textArtifactRender } from '../../engine/pango';
import { toSnapshot } from '../../engine/key';
import { applyTextGeometryCommit, planTextGeometryCommit } from '../textGeometryCommit';

function fixture() {
  const previous = textGeometry('AB');
  const next = textGeometry('ACB');
  const formula = createTextFormula({
    source: 'AB',
    snapshot: toSnapshot(textArtifactRender(previous)),
    glyphColors: { '1': '#FF0000' },
    hiddenGlyphs: [1],
  });
  const project = createEmptyProject();
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 4);
  project.clips.push(clip);
  const reference: TextGeometryRef = {
    contentHash: 'a'.repeat(64),
    byteLength: 100,
    key: next.key,
    basisKey: next.basisKey,
  };
  return { project, formula, clip, previous, next, reference };
}

describe('atomic text appearance commits', () => {
  it('plans source-cluster transitions and remaps existing paint, hidden glyphs and attachments', () => {
    const { project, formula, clip, previous, next, reference } = fixture();
    const follower = createClip(formula.id, project.tracks[0]!.id, 5, 9);
    follower.attach = createAttach(clip.id, [1]);
    project.clips.push(follower);
    clip.initial.glyphColors = { '1': '#00FF00' };
    const plan = planTextGeometryCommit(formula, textArtifactRender(previous), next);
    expect(plan.transition).toEqual({ from: previous.key, to: next.key, map: [0, 2] });
    formula.source = next.basis.source;
    const report = applyTextGeometryCommit(project, formula.id, reference, plan);
    expect(report.droppedColors).toBe(0);
    expect(formula.glyphColors).toEqual({ '2': '#FF0000' });
    expect(formula.hiddenGlyphs).toEqual([2]);
    expect(clip.initial.glyphColors).toEqual({ '2': '#00FF00' });
    expect(follower.attach?.glyphs).toEqual([2]);
    expect(formula.snapshot?.key).toBe(next.key);
    expect(formula.geometry).toEqual(reference);
  });

  it('retains a deleted copies principal for repair instead of electing the surviving source', () => {
    const { project, formula, clip, previous } = fixture();
    const next = textGeometry('B');
    const target = createTextFormula({
      source: 'X',
      snapshot: toSnapshot(textArtifactRender(textGeometry('X'))),
    });
    project.formulas.push(target);
    const toClip = createClip(target.id, project.tracks[0]!.id, 4, 8);
    project.clips.push(toClip);
    const relation = createRelation(clip.id, toClip.id);
    relation.pairs = [{ from: [0, 1], to: [0], style: null, extras: 'copies', principal: 0 }];
    project.relations.push(relation);
    const plan = planTextGeometryCommit(formula, textArtifactRender(previous), next);
    formula.source = 'B';
    applyTextGeometryCommit(
      project,
      formula.id,
      { contentHash: 'a'.repeat(64), byteLength: 100, key: next.key, basisKey: next.basisKey },
      plan,
    );
    expect(relation.pairs).toEqual([
      { from: [0], to: [0], style: null, extras: 'copies', principal: null },
    ]);
  });

  it('uses explicit repair when the prior artifact does not belong to the canonical snapshot', () => {
    const { formula, next } = fixture();
    const plan = planTextGeometryCommit(formula, textArtifactRender(textGeometry('XY')), next);
    expect(plan.match).toEqual({ map: [null, null], confidence: 0 });
  });

  it('remaps only the rebound independent occurrence and preserves the original shared object', () => {
    const { project, formula, clip, previous, next, reference } = fixture();
    const other = createClip(formula.id, project.tracks[0]!.id, 5, 9);
    other.initial.glyphColors = { '1': '#00FF00' };
    project.clips.push(other);
    const copy = { ...structuredClone(formula), id: 'independent-text', name: 'p2' };
    project.formulas.push(copy);
    clip.formulaId = copy.id;
    const plan = planTextGeometryCommit(copy, textArtifactRender(previous), next);
    copy.source = next.basis.source;
    applyTextGeometryCommit(project, copy.id, reference, plan);
    expect(formula.snapshot?.key).toBe(previous.key);
    expect(formula.glyphColors).toEqual({ '1': '#FF0000' });
    expect(other.initial.glyphColors).toEqual({ '1': '#00FF00' });
    expect(copy.glyphColors).toEqual({ '2': '#FF0000' });
  });

  it.each(['snapshot', 'source', 'target', 'reference'] as const)(
    'refuses a stale %s before mutating canonical references',
    (field) => {
      const { project, formula, previous, next, reference } = fixture();
      const plan = planTextGeometryCommit(formula, textArtifactRender(previous), next);
      formula.source = next.basis.source;
      if (field === 'snapshot') formula.snapshot!.key = 'changed-snapshot';
      if (field === 'source') formula.source = 'different source';
      if (field === 'target') project.meta.target = 'gl';
      if (field === 'reference') reference.key = 'wrong-render';
      const before = structuredClone(project);
      expect(() => applyTextGeometryCommit(project, formula.id, reference, plan)).toThrow();
      expect(project).toEqual(before);
    },
  );
});
