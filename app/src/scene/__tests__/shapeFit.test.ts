// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import {
  createClip,
  createEmptyProject,
  createShapeAttach,
  createShapeFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  parseProject,
  serializeProject,
  type Project,
  type ShapeKind,
  type Target,
} from '../../model';
import { applyAttachments, attachmentIssues, settleScene } from '../attach';

function scene(shape: ShapeKind, target: Target, buff: number) {
  const project = createEmptyProject();
  project.meta.target = target;
  const host = createShapeFormula({ name: 'host', shape: 'box', width: 4, height: 2 });
  const fitted = createShapeFormula({ name: 'fitted', shape, width: 1, height: 1 });
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  const a = createClip(host.id, project.tracks[0]!.id, 0, 6, none);
  const b = createClip(fitted.id, project.tracks[1]!.id, 0, 6, {
    ...none,
    attach: createShapeAttach(a.id, 'all', buff),
  });
  a.initial.position = [3, 2];
  project.formulas.push(host, fitted);
  project.clips.push(a, b);
  return { project, fitted, b };
}

function settle(project: Project) {
  const first = refreshLocalRenders(project, new Map());
  return settleScene(first.project, first.formulas, refreshLocalRenders);
}

describe.each(['ce', 'gl'] as const)('safe shape fits (%s)', (target) => {
  it.each(['box', 'circle'] as const)('keeps a valid negative %s inset', (shape) => {
    const { project } = scene(shape, target, -0.5);
    const fitted = settle(project).project;
    const object = fitted.formulas[1]!;
    expect(object).toMatchObject({
      width: shape === 'box' ? 3 : Math.hypot(4, 2) - 1,
      height: shape === 'box' ? 1 : Math.hypot(4, 2) - 1,
    });
    expect(parseProject(serializeProject(fitted)).ok).toBe(true);
  });

  it.each(['box', 'circle'] as const)('accepts the exact zero %s boundary', (shape) => {
    const buff = shape === 'box' ? -1 : -Math.hypot(4, 2) / 2;
    const { project } = scene(shape, target, buff);
    const fitted = settle(project).project;
    expect(fitted.formulas[1]).toMatchObject({ height: 0 });
    expect(parseProject(serializeProject(fitted)).ok).toBe(true);
  });

  it.each(['box', 'circle'] as const)(
    'retains the last valid geometry below the %s boundary',
    (shape) => {
      const buff = (shape === 'box' ? -1 : -Math.hypot(4, 2) / 2) - 1e-6;
      const { project, fitted, b } = scene(shape, target, buff);
      const settled = settle(project);
      const result = settled.project;
      expect(result.formulas[1]).toMatchObject({ width: fitted.width, height: fitted.height });
      expect(result.clips[1]!.initial).toEqual(b.initial);
      expect(parseProject(serializeProject(result)).ok).toBe(true);
      expect(attachmentIssues(result, settled.formulas)).toEqual([
        expect.objectContaining({
          severity: 'error',
          code: 'attach-shape-fit',
          path: ['clips', 1, 'attach', 'buff'],
        }),
      ]);
    },
  );

  it.each(['box', 'circle'] as const)(
    'keeps a %s serializable when its target shrinks past the inset',
    (shape) => {
      const { project } = scene(shape, target, -0.5);
      const valid = settle(project).project;
      const smaller = {
        ...valid,
        clips: valid.clips.map((clip, i) =>
          i === 0 ? { ...clip, initial: { ...clip.initial, scale: 0.1 } } : clip,
        ),
      };
      const result = settle(smaller).project;
      expect(result.formulas[1]).toEqual(valid.formulas[1]);
      expect(result.clips[1]!.initial).toEqual(valid.clips[1]!.initial);
      expect(parseProject(serializeProject(result)).ok).toBe(true);
    },
  );

  it('does not commit dimensions that overflow from a finite gap', () => {
    const { project, fitted } = scene('box', target, Number.MAX_VALUE);
    const result = settle(project).project;
    expect(result.formulas[1]).toMatchObject({ width: fitted.width, height: fitted.height });
    expect(parseProject(serializeProject(result)).ok).toBe(true);
  });

  it('keeps negative underline gaps and ignores the gap of a cross and of a cross line', () => {
    for (const shape of ['underline', 'cross', 'cross_line'] as const) {
      const { project } = scene(shape, target, -5);
      const result = settle(project);
      expect(attachmentIssues(result.project, result.formulas)).toEqual([]);
      expect(result.project.formulas[1]).toMatchObject({
        width: 4,
        height: shape === 'underline' ? 0 : 2,
      });
      expect(parseProject(serializeProject(result.project)).ok).toBe(true);
    }
  });

  it('places a reused shape with its first attached clip’s fitted size', () => {
    const { project, b } = scene('box', target, -0.5);
    project.tracks.push(createTrack('Reuse'));
    const second = createClip(b.formulaId, project.tracks[2]!.id, 0, 6, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
      attach: createShapeAttach(project.clips[0]!.id, 'all', -5),
    });
    project.clips.push(second);
    const result = settle(project);
    expect(result.project.formulas[1]).toMatchObject({ width: 3, height: 1 });
    expect(result.project.clips[2]!.initial.position).toEqual([3, 2]);
    expect(attachmentIssues(result.project, result.formulas)).toEqual([]);
    expect(parseProject(serializeProject(result.project)).ok).toBe(true);
  });
});

it('refuses invalid placement dimensions at the draft commit boundary', () => {
  for (const width of [-1, Infinity, NaN]) {
    const { project, fitted, b } = scene('box', 'ce', 0.1);
    const before = structuredClone({ fitted, initial: b.initial });
    applyAttachments(project, [{ clipId: b.id, position: [1, 2], width, height: 1 }]);
    expect(project.formulas[1]).toEqual(before.fitted);
    expect(project.clips[1]!.initial).toEqual(before.initial);
    expect(parseProject(serializeProject(project)).ok).toBe(true);
  }
});
