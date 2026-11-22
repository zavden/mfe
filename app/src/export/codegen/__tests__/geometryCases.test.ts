// @vitest-environment node
import { expect, it } from 'vitest';
import { geometryCases } from '../../../../../tests/export/geometryCases';
import {
  refreshLocalRenders,
  renderRequestFor,
  resolveFormula,
  toSnapshot,
  type ResolvedFormula,
} from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import { parseProject, serializeProject, validateProject } from '../../../model';
import { settleScene } from '../../../scene';
import { generatePython } from '..';

for (const target of ['ce', 'gl'] as const) {
  for (const fixture of geometryCases()) {
    it(`${target}: ${fixture.name} is valid, settled and exportable`, async () => {
      const project = fixture.project;
      project.meta.target = target;
      const renders = new Map<string, ResolvedFormula>();
      const engine = createMockEngine();
      for (const formula of project.formulas) {
        const result = await engine.render(renderRequestFor(formula, project.meta, 'auto'));
        if (!result.ok) throw new Error(result.error.message);
        formula.snapshot = toSnapshot(result.render);
        renders.set(formula.id, resolveFormula(formula, result.render));
      }
      const settled = settleScene(project, renders, refreshLocalRenders);
      expect(settled.readiness).toEqual({ ready: true, pending: [] });
      expect(validateProject(settled.project).filter((i) => i.severity === 'error')).toEqual([]);
      expect(parseProject(serializeProject(settled.project)).ok).toBe(true);
      const generated = generatePython(settled.project, settled.formulas, {
        target,
        indexing: 'auto',
        comments: false,
        sceneName: 'Geometry',
      });
      expect(generated.issues.filter((i) => i.severity === 'error')).toEqual([]);
    });
  }
}
