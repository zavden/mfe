// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import {
  createAttach,
  createClip,
  createEmptyProject,
  createShapeAttach,
  createShapeFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
} from '../../model';
import { deriveAttachments, settleScene } from '../attach';
import { plainClip, sceneWith } from './sceneKit';

describe('attachment dependency readiness', () => {
  it.each(['ce', 'gl'] as const)(
    'settles deep, branching chains in one operation (%s)',
    async (target) => {
      const scene = await sceneWith({ host: 'x' }, target);
      const host = plainClip(scene, 'host', 0, 0, 6);
      host.initial.position = [3, 1];
      let parent = host;
      for (let i = 0; i < 24; i++) {
        const track = createTrack(`Link ${i}`);
        scene.project.tracks.push(track);
        const clip = createClip(host.formulaId, track.id, 0, 6, {
          intro: defaultIntro('none'),
          outro: defaultOutro('none'),
          attach: createAttach(parent.id, 'all', { side: i % 2 ? 'right' : 'down', buff: 0.2 }),
        });
        scene.project.clips.push(clip);
        if (i % 3 !== 1) parent = clip;
      }
      // Dependency order cannot be inferred from project array order.
      scene.project.clips.reverse();
      const result = settleScene(scene.project, scene.formulas, refreshLocalRenders);
      expect(deriveAttachments(result.project, result.formulas)).toEqual([]);
      expect(result).toMatchObject({ readiness: { ready: true, pending: [] } });
      const second = settleScene(result.project, result.formulas, refreshLocalRenders);
      expect(second.project).toBe(result.project);
    },
  );

  it('distinguishes missing renders from a settled scene', async () => {
    const scene = await sceneWith({ host: 'x', label: 'y' });
    const host = plainClip(scene, 'host', 0, 0, 6);
    const label = plainClip(scene, 'label', 1, 0, 6, {
      attach: createAttach(host.id, 'all'),
    });
    const missing = new Map(scene.formulas);
    missing.delete(host.formulaId);
    const result = settleScene(scene.project, missing, refreshLocalRenders);
    expect(result.project.clips[1]!.initial).toEqual(label.initial);
    expect(result).toMatchObject({
      readiness: {
        ready: false,
        pending: [{ clipId: label.id, reason: 'missing-render', dependencyId: host.id }],
      },
    });
    const ready = settleScene(result.project, scene.formulas, refreshLocalRenders);
    expect(ready).toMatchObject({ readiness: { ready: true, pending: [] } });
    expect(deriveAttachments(ready.project, ready.formulas)).toEqual([]);
  });

  it.each(['ce', 'gl'] as const)(
    'refreshes local geometry throughout a deep fitted chain (%s)',
    (target) => {
      const project = createEmptyProject();
      project.meta.target = target;
      const root = createShapeFormula({ name: 'root', width: 2, height: 1 });
      const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
      let previous = createClip(root.id, project.tracks[0]!.id, 0, 6, none);
      previous.initial.position = [3, 1];
      project.formulas.push(root);
      project.clips.push(previous);
      for (let i = 0; i < 12; i++) {
        const shape = createShapeFormula({ name: `shape${i}` });
        const track = createTrack(`Link ${i}`);
        project.formulas.push(shape);
        project.tracks.push(track);
        const next = createClip(shape.id, track.id, 0, 6, {
          ...none,
          attach: createShapeAttach(previous.id, 'all', 0.1),
        });
        project.clips.push(next);
        previous = next;
      }
      const result = settleScene(project, new Map(), refreshLocalRenders);
      expect(result.readiness).toEqual({ ready: true, pending: [] });
      expect(deriveAttachments(result.project, result.formulas)).toEqual([]);
      const last = result.project.formulas.at(-1)!;
      expect(last.kind === 'shape' && last.width).toBeCloseTo(4.4, 9);
      expect(result.project.clips.at(-1)!.initial.position).toEqual([3, 1]);
    },
  );

  it('reports a cycle caused by shared fitted geometry without iterating it', () => {
    const project = createEmptyProject();
    const shape = createShapeFormula({ name: 'shared', width: 2, height: 1 });
    const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    const detached = createClip(shape.id, project.tracks[0]!.id, 0, 6, none);
    const attached = createClip(shape.id, project.tracks[1]!.id, 0, 6, {
      ...none,
      attach: createShapeAttach(detached.id, 'all', 0.1),
    });
    project.formulas.push(shape);
    project.clips.push(detached, attached);
    const result = settleScene(project, new Map(), refreshLocalRenders);
    expect(result.project.formulas[0]).toMatchObject({ width: 2, height: 1 });
    expect(result.readiness).toEqual({
      ready: false,
      pending: [{ clipId: attached.id, reason: 'cycle' }],
    });
  });
});
