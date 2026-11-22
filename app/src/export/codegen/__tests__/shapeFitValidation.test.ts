// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../../engine';
import {
  createClip,
  createEmptyProject,
  createShapeAttach,
  createShapeFormula,
  defaultIntro,
  defaultOutro,
  parseProject,
  serializeProject,
} from '../../../model';
import { settleScene } from '../../../scene';
import { generatePython } from '..';

describe.each(['ce', 'gl'] as const)('shape fit export validation (%s)', (target) => {
  it.each(['box', 'circle'] as const)(
    'reports unsupported %s insets without corrupting saved geometry',
    (shape) => {
      const project = createEmptyProject();
      project.meta.target = target;
      const host = createShapeFormula({ name: 'host', width: 2, height: 2 });
      const fitted = createShapeFormula({ name: 'fitted', shape, width: 1, height: 1 });
      project.formulas.push(host, fitted);
      const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
      const a = createClip(host.id, project.tracks[0]!.id, 0, 4, none);
      const b = createClip(fitted.id, project.tracks[1]!.id, 0, 4, {
        ...none,
        attach: createShapeAttach(a.id, 'all', -2),
      });
      project.clips.push(a, b);
      const local = refreshLocalRenders(project, new Map());
      const settled = settleScene(local.project, local.formulas, refreshLocalRenders);
      const options = { target, sceneName: 'FitCheck', indexing: 'auto' as const, comments: false };
      expect(generatePython(settled.project, settled.formulas, options).issues).toContainEqual(
        expect.objectContaining({ code: 'attach-shape-fit', severity: 'error' }),
      );
      expect(parseProject(serializeProject(settled.project)).ok).toBe(true);

      const repaired = structuredClone(settled.project);
      repaired.clips[1]!.attach!.buff = -0.25;
      const valid = settleScene(repaired, settled.formulas, refreshLocalRenders);
      expect(
        generatePython(valid.project, valid.formulas, options).issues.filter(
          (i) => i.severity === 'error',
        ),
      ).toEqual([]);
      expect(parseProject(serializeProject(valid.project)).ok).toBe(true);
    },
  );
});
