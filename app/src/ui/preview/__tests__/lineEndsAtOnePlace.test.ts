// @vitest-environment node
/* A line whose two ends Manim finds at one place: both on one formula, each with the anchor Auto
 * (audit A5-01). `Line(a, a)` has no direction to look for an edge in: ManimCE draws a line of no
 * length and ManimGL stops the scene, while the attach sync, which cannot measure it either
 * (`manimLineEnds`), leaves the line as it was made. The line tool refuses it, as it refuses two
 * free points at one place, and a project that holds one — in a clip's attachment, or in the ends
 * a Transform carries the line to — reports it (`attach-line-ends`). */
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../../engine';
import { generatePython } from '../../../export/codegen';
import {
  createClip,
  createEndsAttach,
  createEndsTween,
  createLineFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  type Clip,
  type LineEnd,
  type Project,
  type Target,
  type TweenAction,
} from '../../../model';
import { attachmentIssues, settleScene, type SettledScene } from '../../../scene';
import { plainClip, sceneWith, type Scene } from '../../../scene/__tests__/sceneKit';
import { loadProject, useProjectStore, useRenderStore } from '../../../store';
import { usePreferences } from '../../preferences';
import { useNoticeStore } from '../../project/noticeStore';
import { moveLineEnd, planLine } from '../lineDraw';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
const defaults = () => ({
  introDuration: 1,
  standardScale: usePreferences.getState().standardScale,
});

/** "a+b=c" on the left and "x^2" on the right, both over [0, 8). */
async function twoFormulas(target: Target): Promise<{ scene: Scene; a: Clip; b: Clip }> {
  const scene = await sceneWith({ a: 'a+b=c', b: 'x^2' }, target);
  const a = plainClip(scene, 'a', 0, 0, 8);
  a.initial.position = [-3, 1];
  const b = plainClip(scene, 'b', 1, 0, 8);
  b.initial.position = [3, -1.5];
  return { scene, a, b };
}

/** The whole of the formula of `clip`, at `anchor`. */
const on = (clip: Clip, anchor: 'auto' | 'left' | 'right' = 'auto'): LineEnd => ({
  clipId: clip.id,
  glyphs: 'all',
  anchor,
});

/** An arrow over [0, 8) on a track of its own: `fields` of its clip (an attachment, a Transform). */
function addArrow(scene: Scene, fields: Partial<Pick<Clip, 'attach' | 'actions'>>): Clip {
  const formula = createLineFormula({ name: 'l1', line: 'arrow', vector: [2, 0] });
  scene.project.formulas.push(formula);
  const track = createTrack('Track of the line');
  scene.project.tracks.unshift(track);
  const clip = { ...createClip(formula.id, track.id, 0, 8, none), ...fields };
  clip.initial.position = [0, 3];
  scene.project.clips.push(clip);
  return clip;
}

const settle = (scene: Scene): SettledScene =>
  settleScene(scene.project, scene.formulas, refreshLocalRenders);

/** The errors the measures of `settled` give (`attachmentIssues`), as `code path`. */
const measuredErrors = (settled: SettledScene): string[] =>
  attachmentIssues(settled.project, settled.formulas)
    .filter((issue) => issue.severity === 'error')
    .map((issue) => `${issue.code} ${issue.path.join('.')}`);

const exportCodes = (settled: SettledScene, target: Target): string[] =>
  generatePython(settled.project, settled.formulas, {
    target,
    sceneName: 'S',
    indexing: 'auto',
    comments: false,
  }).issues.map((issue) => issue.code);

describe.each(['ce', 'gl'] as const)(
  'a line with both ends on one formula, Auto (%s)',
  (target) => {
    it('is refused by the line tool, as two free points at one place are', async () => {
      const { scene, a, b } = await twoFormulas(target);
      const plan = (start: LineEnd, end: LineEnd) =>
        planLine(scene.project, scene.formulas, 'arrow', start, end, 0, defaults());
      expect(plan(on(a), on(a))).toEqual({
        ok: false,
        reason: 'The two ends are at one place: click somewhere else for the end.',
      });
      // Two points of the same glyphs, or another formula, make a line.
      expect(plan(on(a, 'left'), on(a, 'right')).ok).toBe(true);
      expect(plan(on(a), on(b)).ok).toBe(true);
      // In ManimGL the edge Auto finds towards a point of the same box is that point: one place.
      if (target === 'gl') expect(plan(on(a), on(a, 'right')).ok).toBe(false);
    });

    it('is reported when a file holds it: the scene is not ready, the Python says so', async () => {
      const { scene, a, b } = await twoFormulas(target);
      const fine = addArrow(scene, { attach: createEndsAttach(on(a), on(b), 0.25) });
      expect(measuredErrors(settle(scene))).toEqual([]);
      const clip = scene.project.clips.find((c) => c.id === fine.id)!;
      clip.attach = createEndsAttach(on(a), on(a), 0.25);
      const settled = settle(scene);
      const index = settled.project.clips.findIndex((c) => c.id === clip.id);
      expect(measuredErrors(settled)).toEqual([`attach-line-ends clips.${index}.attach`]);
      expect(settled.readiness.pending).toContainEqual({ clipId: clip.id, reason: 'invalid-fit' });
      expect(exportCodes(settled, target)).toContain('attach-line-ends');
    });

    it('is reported in the ends a Transform carries the line to', async () => {
      const { scene, a, b } = await twoFormulas(target);
      const tween = createEndsTween(1, 1, { start: on(a), end: on(b), buff: 0.25 });
      const clip = addArrow(scene, { actions: [tween] });
      expect(measuredErrors(settle(scene))).toEqual([]);
      (clip.actions[0] as TweenAction).ends!.end = on(a);
      const settled = settle(scene);
      const index = settled.project.clips.findIndex((c) => c.id === clip.id);
      expect(measuredErrors(settled)).toEqual([`attach-line-ends clips.${index}.actions.0.ends`]);
      expect(exportCodes(settled, target)).toContain('attach-line-ends');
    });
  },
);

describe.each(['ce', 'gl'] as const)(
  'moving an end onto the formula of the other (%s)',
  (target) => {
    beforeEach(() => useNoticeStore.getState().clear());

    /** `scene` settled and loaded into the stores, as the app has it. */
    function load(scene: Scene): Project {
      const settled = settle(scene);
      loadProject(settled.project);
      useRenderStore.setState({ resolved: settled.formulas });
      return useProjectStore.getState().project;
    }
    const notices = () => useNoticeStore.getState().notices.map((n) => `${n.title}: ${n.message}`);

    it('is refused on the clip’s own ends, Auto against Auto', async () => {
      const { scene, a, b } = await twoFormulas(target);
      const clip = addArrow(scene, { attach: createEndsAttach(on(a), { point: [3, 1] }, 0.25) });
      const before = load(scene);
      expect(moveLineEnd(clip.id, 'end', on(a), false, 'clip')).toBe(false);
      expect(useProjectStore.getState().project).toBe(before);
      expect(notices()).toEqual(['The end stays: The two ends would be at one place.']);
      // Another formula is a line.
      expect(moveLineEnd(clip.id, 'end', on(b), false, 'clip')).toBe(true);
    });

    it('is refused on the ends a Transform carries the line to', async () => {
      const { scene, a, b } = await twoFormulas(target);
      const tween = createEndsTween(1, 1, { start: on(a), end: { point: [3, 1] }, buff: 0.25 });
      const clip = addArrow(scene, { actions: [tween] });
      const before = load(scene);
      expect(moveLineEnd(clip.id, 'end', on(a), false, { tween: tween.id })).toBe(false);
      expect(useProjectStore.getState().project).toBe(before);
      expect(notices()).toEqual(['The end stays: The two ends would be at one place.']);
      expect(moveLineEnd(clip.id, 'end', on(b), false, { tween: tween.id })).toBe(true);
    });
  },
);
