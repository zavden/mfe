/* A small example for the tests of the DOM player, built in the browser's way (jsdom reads no
 * file): two formulas rendered by the mock engine, one clip each on two tracks, a relation from
 * the first to the second — the shape of examples/hello.mfe.json, 5 s long. */
import { resolveFormula, toSnapshot, type ResolvedFormula } from '../../engine';
import { createMockEngine } from '../../test/mockEngine';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  defaultIntro,
  defaultOutro,
} from '../../model';
import { packScene, type ExampleData } from '../data';

export async function mockExampleData(slug = 'hello'): Promise<ExampleData> {
  const project = createEmptyProject('Hello: one-to-one');
  const engine = createMockEngine();
  const resolved = new Map<string, ResolvedFormula>();
  const formulas = [
    createFormula({ name: 'a1', source: 'mx+y=0', tag: { color: '#83C167', icon: null } }),
    createFormula({ name: 'f2', source: 'mx=-y', tag: { color: '#58C4DD', icon: null } }),
  ];
  for (const formula of formulas) {
    const result = await engine.render({
      kind: 'math',
      latex: formula.source,
      packages: [],
      preamble: '',
      target: 'ce',
      fontSize: 48,
      prefer: 'auto',
    });
    if (!result.ok) throw new Error(result.error.message);
    formula.snapshot = toSnapshot(result.render);
    resolved.set(formula.id, resolveFormula(formula, result.render));
    project.formulas.push(formula);
  }
  const [top, bottom] = project.tracks;
  const a = createClip(formulas[0]!.id, top!.id, 0, 3, {
    intro: defaultIntro('write'),
    outro: defaultOutro('fade_out'),
  });
  const b = createClip(formulas[1]!.id, bottom!.id, 2, 5, {
    intro: defaultIntro('none'),
    outro: defaultOutro('fade_out'),
  });
  project.clips.push(a, b);
  project.relations.push(
    createRelation(a.id, b.id, {
      offset: 0,
      duration: 1,
      pairs: [
        { from: [0, 1], to: [0, 1], style: null },
        { from: [4], to: [2], style: null },
      ],
    }),
  );
  const data: ExampleData = {
    meta: {
      slug,
      title: project.meta.name,
      description: 'A test example.',
      duration: 5,
      fps: project.meta.fps,
      width: project.meta.width,
      height: project.meta.height,
      background: project.meta.background,
      target: project.meta.target,
      files: {
        project: `examples/${slug}.mfe.json`,
        ce: `examples/${slug}.ce.py`,
        gl: `examples/${slug}.gl.py`,
      },
    },
    python: { ce: '# ce', gl: '# gl' },
    player: packScene(project, resolved),
  };
  return JSON.parse(JSON.stringify(data)) as ExampleData;
}
