// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
} from '../../../model';
import { blockContext, clipContext, formulaContext, relationContext } from '../context';

function scene() {
  const project = createEmptyProject();
  const [t1, t2] = project.tracks;
  t1!.name = 'Equation';
  t2!.name = 'Factored';
  const eq = createFormula({ name: 'eq' });
  const fac = createFormula({ name: 'factored' });
  const lonely = createFormula({ name: 'lonely' });
  project.formulas.push(eq, fac, lonely);
  const a = createClip(eq.id, t1!.id, 0, 3);
  const b = createClip(fac.id, t2!.id, 2, 5);
  a.actions.push(createAppear(1, 'write', [0], { duration: 0.5 }));
  project.clips.push(a, b);
  project.relations.push(createRelation(a.id, b.id, { offset: 0.5, duration: 1 }));
  return { project, a, b, eq, fac, lonely };
}

describe('Animations panel context line', () => {
  it('says what a clip is and where', () => {
    const { project, a } = scene();
    expect(clipContext(project, a)).toEqual({
      kind: 'Clip',
      details: ['Equation', '0.00–3.00 s'],
    });
  });

  it('gives a block its animation, formula and time in the scene', () => {
    const { project, a } = scene();
    expect(blockContext(project, a, a.actions[0]!)).toEqual({
      kind: 'Animation block',
      details: ['Write', 'on eq', '1.00–1.50 s'],
    });
  });

  it('gives a relation its formulas and window', () => {
    const { project } = scene();
    expect(relationContext(project, project.relations[0]!)).toEqual({
      kind: 'Relation',
      details: ['eq → factored', '2.50–3.50 s'],
    });
  });

  it('numbers a relation among several of the same two clips', () => {
    const { project } = scene();
    const [first] = project.relations;
    const second = createRelation(first!.fromClipId, first!.toClipId, { offset: 1.5 });
    project.relations.push(second);
    expect(relationContext(project, first!).kind).toBe('Relation 1 of 2');
    expect(relationContext(project, second)).toEqual({
      kind: 'Relation 2 of 2',
      details: ['eq → factored', '3.50–4.50 s'],
    });
  });

  it('says whether a formula is on the timeline', () => {
    const { project, eq, lonely } = scene();
    expect(formulaContext(project, eq).details).toEqual(['on 1 clip']);
    expect(formulaContext(project, lonely).details).toEqual(['not on the timeline']);
    project.clips.push(createClip(eq.id, project.tracks[1]!.id, 6, 8));
    expect(formulaContext(project, eq).details).toEqual(['on 2 clips']);
  });
});
