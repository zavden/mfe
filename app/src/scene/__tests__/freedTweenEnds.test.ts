// @vitest-environment node
/* The end of the ends a Transform carries a line to, freed because its glyphs are gone — their clip
 * deleted, or a new render without them (audit A5-02): it is left "at the point it was drawn at"
 * (FORMAT, TweenEnds; D144). Beside an end that stays on glyphs, Manim leaves the gap at a free end
 * too, so the point it is given is the gap further out (`freedEndPoint`, as `pointForFreeEnd` gives
 * an end dropped by hand); beside a free end, the two are the points the line was drawn between —
 * two free ends have no gap. Either way the line is drawn where it was. */
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import {
  createClip,
  createEndsTween,
  createLineFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  remapGlyphRefs,
  type Clip,
  type LineCurve,
  type LineEnd,
  type Project,
  type Target,
  type TweenAction,
  type Vec2,
} from '../../model';
import { deleteClips } from '../../ui/timeline/clipOps';
import { freedEndPoint, settleScene, type SettledScene } from '../index';
import { plainClip, sceneWith } from './sceneKit';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** "a+b=c" up on the left and "x^2" down on the right, both over [0, 8), and an arrow over the
 * same time with a Transform at 1 s that carries its ends where `ends` says (a gap of 0.25),
 * settled: where the Transform draws the line is measured. */
async function carried(
  target: Target,
  ends: (a: Clip, b: Clip) => { start: LineEnd; end: LineEnd },
  curve: LineCurve | null = null,
) {
  const scene = await sceneWith({ a: 'a+b=c', b: 'x^2' }, target);
  const a = plainClip(scene, 'a', 0, 0, 8);
  a.initial.position = [-3, 1];
  const b = plainClip(scene, 'b', 1, 0, 8);
  b.initial.position = [3, -1.5];
  const formula = createLineFormula({ name: 'l1', line: 'arrow', vector: [2, 0], curve });
  scene.project.formulas.push(formula);
  const track = createTrack('Track of the line');
  scene.project.tracks.unshift(track);
  const clip = createClip(formula.id, track.id, 0, 8, none);
  clip.initial.position = [0, 3];
  const tween = createEndsTween(1, 1, { ...ends(a, b), buff: 0.25 }, {}, 'linear');
  clip.actions.push(tween);
  scene.project.clips.push(clip);
  const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
  return { settled, a, b, clip, tween };
}

const tweenOf = (project: Project, clipId: string) =>
  project.clips.find((c) => c.id === clipId)!.actions[0] as TweenAction;

/** How far each end the Transform draws the line to moved from `before`, once `settled` is
 * settled again. */
function moved(settled: SettledScene, project: Project, clipId: string) {
  const before = tweenOf(settled.project, clipId).ends!.drawn!;
  const after = tweenOf(settleScene(project, settled.formulas, refreshLocalRenders).project, clipId)
    .ends!.drawn!;
  const gap = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  return { start: gap(before.start, after.start), end: gap(before.end, after.end) };
}

const auto = (clip: Clip): LineEnd => ({ clipId: clip.id, glyphs: 'all', anchor: 'auto' });

describe.each(['ce', 'gl'] as const)('the end of a Transform’s ends freed (%s)', (target) => {
  it('stays where it was drawn when the clip of its glyphs is deleted', async () => {
    const { settled, a, b, clip } = await carried(target, (a, b) => ({
      start: auto(a),
      end: auto(b),
    }));
    const draft = structuredClone(settled.project);
    deleteClips(draft, new Set([b.id]), freedEndPoint(settled.project, settled.formulas));
    // The end is free now, and the other still on its glyphs.
    expect(tweenOf(draft, clip.id).ends).toMatchObject({
      start: { clipId: a.id },
      end: { point: expect.any(Array) },
    });
    const { start, end } = moved(settled, draft, clip.id);
    expect(start).toBeLessThan(1e-6);
    expect(end).toBeLessThan(1e-6);
  });

  it('stays where it was drawn on an arc too, whose gap Manim leaves along the arc', async () => {
    const { settled, b, clip } = await carried(
      target,
      (a, b) => ({ start: { ...auto(a), anchor: 'dr' }, end: auto(b) }),
      { shape: 'arc', degrees: 60, trim: 0 },
    );
    const draft = structuredClone(settled.project);
    deleteClips(draft, new Set([b.id]), freedEndPoint(settled.project, settled.formulas));
    const { start, end } = moved(settled, draft, clip.id);
    expect(start).toBeLessThan(1e-6);
    expect(end).toBeLessThan(1e-6);
  });

  it('beside a free end, leaves both where they were drawn: two free ends have no gap', async () => {
    const { settled, b, clip } = await carried(target, (_, b) => ({
      start: { point: [-4, -2] },
      end: auto(b),
    }));
    const draft = structuredClone(settled.project);
    deleteClips(draft, new Set([b.id]), freedEndPoint(settled.project, settled.formulas));
    const { start, end } = moved(settled, draft, clip.id);
    expect(start).toBeLessThan(1e-6);
    expect(end).toBeLessThan(1e-6);
  });

  it('stays where it was drawn when a new render loses its glyphs', async () => {
    // The end on the "2" of x^2, which a new render of "x" has not.
    const { settled, b, clip } = await carried(target, (a, b) => ({
      start: auto(a),
      end: { clipId: b.id, glyphs: [1], anchor: 'auto' },
    }));
    const draft = structuredClone(settled.project);
    const report = remapGlyphRefs(
      draft,
      b.formulaId,
      [0, null],
      freedEndPoint(settled.project, settled.formulas),
    );
    expect(report.detached).toBe(1);
    expect(tweenOf(draft, clip.id).ends!.end).toEqual({ point: expect.any(Array) });
    const { start, end } = moved(settled, draft, clip.id);
    expect(start).toBeLessThan(1e-6);
    expect(end).toBeLessThan(1e-6);
  });
});
