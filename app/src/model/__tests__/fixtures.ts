/* Pure, fresh project fixtures shared by Node and DOM tests. */
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  defaultIntro,
  defaultOutro,
  type FormulaSnapshot,
  type Project,
} from '../index';

export function boxSnapshot(labels: string[]): FormulaSnapshot {
  return {
    backend: 'latex',
    key: 'test',
    glyphs: labels.map((label, i) => ({ label, center: [i * 0.3, 0], size: [0.2, 0.3] })),
  };
}

/** Two formulas (5 and 4 glyphs) on two tracks, related by one valid relation. */
export function smallProject(): Project {
  const p = createEmptyProject('test');
  const [t1, t2] = p.tracks;
  const a = createFormula({
    name: 'a',
    source: 'a+b=c',
    snapshot: boxSnapshot(['a', '+', 'b', '=', 'c']),
  });
  const b = createFormula({
    name: 'b',
    source: 'c=b+a',
    snapshot: boxSnapshot(['c', '=', 'b', '+']),
  });
  const ca = createClip(a.id, t1!.id, 0, 4, {
    intro: defaultIntro('write'),
    outro: defaultOutro('fade_out'),
  });
  const cb = createClip(b.id, t2!.id, 2, 6, {
    intro: defaultIntro('fade_in'),
    outro: defaultOutro('fade_out'),
  });
  const r = createRelation(ca.id, cb.id, { pairs: [{ from: [0], to: [3], style: null }] });
  p.formulas.push(a, b);
  p.clips.push(ca, cb);
  p.relations.push(r);
  return p;
}
