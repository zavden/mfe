// @vitest-environment node
/* The whole Python the exporter writes, pinned in files (`__snapshots__/python/`) for the projects
 * of the export check and for the examples. A refactor of the code generator must leave them
 * unchanged; a change meant to alter the output updates them (`npx vitest run -u`) and the diff
 * shows what moved.
 *
 * The export-check projects carry no glyphs: here they get the mock engine's (one box per token),
 * with the snapshot marked as LaTeX (direct indexing) or as MathJax (indexing through the
 * positional helper), and their attached objects placed from those glyphs. The examples keep their own snapshots (exact ManimCE ones) and are exported
 * with both indexing modes: `auto` addresses the glyphs literally for CE and, as for any export to
 * the other library, through the helper for GL. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BACKEND_VERSIONS,
  renderKey,
  refreshLocalRenders,
  renderRequestFor,
  resolveFormula,
  toSnapshot,
  textArtifactRender,
  type ResolvedFormula,
  type ResolvedFormulas,
} from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import {
  parseProject,
  setIdGenerator,
  validateTextGeometryArtifact,
  type Project,
  type RenderBackend,
  type Target,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import { settleScene } from '../../../scene';
import { syntheticCases } from '../../../../../tests/export/projects';
import type { CodegenOptions } from '../../types';
import { generatePython } from '..';
import { textGeometry } from '../../../test/textGeometry';

const EXAMPLES = [
  'hello',
  'one-to-many',
  'animation-blocks',
  'multiline',
  'completing-the-square',
  'match-colors',
  'custom-paths',
  'text-title',
  'braces',
  'emphasis',
  'shapes',
  'lines',
  'camera',
];
const TARGETS: Target[] = ['ce', 'gl'];

const engine = createMockEngine();

/** The export-check projects with ids that stay the same from run to run: events at the same
 * time are written in the order of their ids. */
function syntheticProjects(): ReturnType<typeof syntheticCases> {
  const restore = setIdGenerator(sequentialIds());
  try {
    return syntheticCases();
  } finally {
    restore();
  }
}

/** A copy of `project` made for `target`, whose formulas have mock glyphs with their snapshot
 * marked as `backend` — with the key a render by that backend would have, so that a LaTeX
 * snapshot counts as exact for the export (`isExactSnapshot`). */
async function withMockGlyphs(
  project: Project,
  backend: RenderBackend,
  target: Target,
): Promise<{ project: Project; resolved: ResolvedFormulas }> {
  const copy = structuredClone(project);
  copy.meta.target = target;
  const resolved = new Map<string, ResolvedFormula>();
  for (const formula of copy.formulas) {
    // What the formula's kind asks for (a brace is geometry: its producer builds it, exact).
    const request = renderRequestFor(formula, copy.meta, 'auto');
    if (formula.kind === 'text') {
      const artifact = textGeometry(formula.source, undefined, target);
      artifact.basis.font = formula.font;
      artifact.basis.fontSize = formula.fontSize;
      const render = textArtifactRender(artifact);
      formula.snapshot = toSnapshot(render);
      resolved.set(formula.id, resolveFormula(formula, render));
      continue;
    }
    const result = await engine.render(request);
    if (!result.ok) throw new Error(`${formula.name}: ${result.error.message}`);
    const exact = request.kind === 'brace';
    const render = exact
      ? result.render
      : { ...result.render, backend, key: renderKey(request, backend, BACKEND_VERSIONS[backend]) };
    formula.snapshot = toSnapshot(render);
    resolved.set(formula.id, resolveFormula(formula, render));
  }
  // Attached objects sit where the attach sync would have put them, braces fitted and rendered.
  const settled = settleScene(copy, resolved, refreshLocalRenders);
  return { project: settled.project, resolved: settled.formulas };
}

function example(name: string): Project {
  const parsed = parseProject(
    readFileSync(new URL(`../../../../../examples/${name}.mfe.json`, import.meta.url), 'utf8'),
  );
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.project;
}

function python(
  project: Project,
  resolved: ResolvedFormulas,
  target: Target,
  indexing: CodegenOptions['indexing'],
): string {
  const exported = { ...project, meta: { ...project.meta, target } };
  return generatePython(exported, resolved, {
    target,
    sceneName: 'Pinned',
    indexing,
    comments: true,
  }).code;
}

const file = (name: string) => `./__snapshots__/python/${name}.py`;

describe('generated Python, pinned', () => {
  for (const { name, project } of syntheticProjects()) {
    const backends: RenderBackend[] = project.formulas.some((formula) => formula.kind === 'text')
      ? ['pango']
      : ['latex', 'mathjax'];
    for (const backend of backends) {
      it(`${name}, ${backend} snapshot`, async () => {
        for (const target of TARGETS) {
          const { project: p, resolved } = await withMockGlyphs(project, backend, target);
          await expect(python(p, resolved, target, 'auto')).toMatchFileSnapshot(
            file(`${name}.${backend}.${target}`),
          );
        }
      });
    }
  }

  // A font text exported for the library that did not shape it: the same `Text` by the same
  // glyph indices, at a converted size, with the count of its glyphs as the scene's only check.
  it('pango-line, shaped by the other library', async () => {
    const { project } = syntheticProjects().find((entry) => entry.name === 'pango-line')!;
    for (const target of TARGETS) {
      const shaper = target === 'ce' ? 'gl' : 'ce';
      const { project: p, resolved } = await withMockGlyphs(project, 'pango', shaper);
      await expect(python(p, resolved, target, 'auto')).toMatchFileSnapshot(
        file(`pango-line.pango-other.${target}`),
      );
    }
  });

  // An example whose file carries the geometry of its font texts: they are drawn from it, as
  // when the file is opened, so the scene checks each `Text` against the fingerprint the file
  // holds (for ManimCE, which shaped them; ManimGL gets them at a converted size, on trust).
  it('example text-pango, drawn from the geometry in its file', async () => {
    const parsed = parseProject(
      readFileSync(new URL('../../../../../examples/text-pango.mfe.json', import.meta.url), 'utf8'),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const resolved = new Map<string, ResolvedFormula>();
    for (const formula of parsed.project.formulas) {
      if (formula.kind !== 'text' || !formula.geometry) continue;
      const artifact = validateTextGeometryArtifact(
        parsed.textGeometry[formula.geometry.contentHash],
      );
      resolved.set(formula.id, resolveFormula(formula, textArtifactRender(artifact)));
    }
    expect(resolved.size).toBe(2);
    for (const target of TARGETS) {
      await expect(python(parsed.project, resolved, target, 'auto')).toMatchFileSnapshot(
        file(`example-text-pango.auto.${target}`),
      );
    }
  });

  for (const name of EXAMPLES) {
    it(`example ${name}`, async () => {
      const project = example(name);
      for (const target of TARGETS) {
        for (const indexing of ['auto', 'positional'] as const) {
          await expect(python(project, new Map(), target, indexing)).toMatchFileSnapshot(
            file(`example-${name}.${indexing}.${target}`),
          );
        }
      }
    });
  }
});
