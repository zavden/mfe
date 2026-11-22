/* Test helpers of the player: a project rendered as the app renders it without the companion
 * (MathJax for the formulas, the local producers for braces, shapes and lines), each formula
 * resolved against its snapshot as the render store does (`resolveFormula`), and the example data
 * the documentation's tool would pack of it. Node only (the examples are read from disk). */
import {
  createEngine,
  renderRequestFor,
  resolveFormula,
  toSnapshot,
  type ResolvedFormula,
} from '../../engine';
import { parseProject, visualProject, type Project } from '../../model';
import { readExample } from '../../test/examples';
import { packScene, type ExampleData } from '../data';

export interface Rendered {
  project: Project;
  resolved: Map<string, ResolvedFormula>;
}

/** `project` with every formula rendered as the app renders it with no companion: a formula
 * without a snapshot takes the render's (as the render sync does), one with a snapshot keeps it
 * and is resolved against the render by position. */
export async function renderProject(source: Project): Promise<Rendered> {
  const project = structuredClone(source);
  const engine = createEngine({ companion: { fetch: null } });
  const resolved = new Map<string, ResolvedFormula>();
  try {
    for (const formula of project.formulas) {
      const result = await engine.render(renderRequestFor(formula, project.meta, 'mathjax'));
      if (!result.ok) throw new Error(`${formula.name}: ${result.error.message}`);
      if (!formula.snapshot) formula.snapshot = toSnapshot(result.render);
      resolved.set(formula.id, resolveFormula(formula, result.render));
    }
  } finally {
    engine.dispose();
  }
  return { project, resolved };
}

/** An example project of the repository (`examples/<name>`), rendered. */
export async function renderedExample(name: string): Promise<Rendered> {
  const parsed = parseProject(readExample(name));
  if (!parsed.ok) throw new Error(parsed.error);
  return renderProject(visualProject(parsed.project));
}

/** The data `tools/examples.mjs build` would write of a rendered project, through JSON as the
 * page reads it. */
export function exampleData(rendered: Rendered, slug = 'test'): ExampleData {
  const { project } = rendered;
  const data: ExampleData = {
    meta: {
      slug,
      title: project.meta.name,
      description: 'A test example.',
      duration: project.clips.reduce((end, clip) => Math.max(end, clip.end), 0),
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
    player: packScene(project, rendered.resolved),
  };
  return JSON.parse(JSON.stringify(data)) as ExampleData;
}
