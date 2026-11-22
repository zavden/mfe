// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyToPoint } from '../../geom';
import {
  createClip,
  createFormula,
  createPartTransform,
  createTween,
  defaultIntro,
  defaultOutro,
  type TweenAction,
} from '../../model';
import {
  createEvaluator,
  exportEvaluator,
  glyphColor,
  keyframeAt,
  patchKeyframe,
  placementMatrix,
  rateFunction,
} from '../index';
import { byKey, centerOf, plainClip, sceneWith, summary } from './sceneKit';

describe('createEvaluator (static state)', () => {
  it('draws the clips active at t, front-most track last', async () => {
    const scene = await sceneWith({ a: 'a+b', b: 'xy' });
    const ca = plainClip(scene, 'a', 0, 0, 2);
    const cb = plainClip(scene, 'b', 1, 1, 3);
    const ev = createEvaluator(scene.project, scene.formulas);
    expect(ev.duration).toBe(3);
    expect(ev.evaluate(0.5).map((d) => d.key)).toEqual([0, 1, 2].map((g) => `${ca.id}:${g}`));
    const both = ev.evaluate(1.5);
    expect(both).toHaveLength(5);
    // Track 2 (index 1) is behind track 1 (index 0).
    expect(both.map((d) => d.clipId)).toEqual([
      ...Array<string>(2).fill(cb.id),
      ...Array<string>(3).fill(ca.id),
    ]);
    expect(both.map((d) => d.z)).toEqual([0, 0, 1, 1, 1]);
    expect(ev.evaluate(2).map((d) => d.clipId)).toEqual(Array(2).fill(cb.id)); // half-open
    expect(ev.evaluate(-1)).toEqual(ev.evaluate(0)); // clamped
  });

  it('places glyphs with the clip state', async () => {
    const scene = await sceneWith({ b: 'xy' });
    const clip = plainClip(scene, 'b', 0, 1, 3);
    clip.initial.position = [2, -1];
    const ev = createEvaluator(scene.project, scene.formulas);
    const render = scene.formulas.get(scene.f.b!.id)!.render;
    const center = centerOf(ev.evaluate(2)[0]!);
    const local = render.glyphs[0]!.bbox;
    expect(center[0]).toBeCloseTo((local.minX + local.maxX) / 2 + 2);
    expect(center[1]).toBeCloseTo((local.minY + local.maxY) / 2 - 1);
  });

  it('skips hidden tracks and formulas without a render', async () => {
    const scene = await sceneWith({ a: 'a+b', b: 'xy' });
    plainClip(scene, 'a', 0, 0, 2);
    plainClip(scene, 'b', 1, 1, 3);
    scene.project.tracks[0]!.hidden = true;
    expect(createEvaluator(scene.project, scene.formulas).evaluate(1.5)).toHaveLength(2);
    expect(
      createEvaluator(scene.project, scene.formulas, { includeHidden: true }).evaluate(1.5),
    ).toHaveLength(5);
    scene.formulas.delete(scene.f.b!.id);
    expect(createEvaluator(scene.project, scene.formulas).evaluate(1.5)).toHaveLength(0);
  });

  it('exportEvaluator draws hidden tracks too: hiding is a preview toggle', async () => {
    const scene = await sceneWith({ a: 'a+b', b: 'xy' });
    plainClip(scene, 'a', 0, 0, 2);
    plainClip(scene, 'b', 1, 1, 3);
    scene.project.tracks[0]!.hidden = true;
    const ev = exportEvaluator(scene.project, scene.formulas);
    expect(ev.duration).toBe(3);
    expect(ev.evaluate(1.5)).toHaveLength(5);
    expect(ev.evaluate(1.5)).toEqual(
      createEvaluator(scene.project, scene.formulas, { includeHidden: true }).evaluate(1.5),
    );
  });

  it('includes the end of the scene: a clip ending there keeps its final state', async () => {
    const scene = await sceneWith({ a: 'ab', b: 'xy' });
    const keep = plainClip(scene, 'a', 0, 0, 2); // no outro: still visible at the very end
    const fading = plainClip(scene, 'b', 1, 0, 2, { outro: defaultOutro('fade_out') });
    const ev = createEvaluator(scene.project, scene.formulas);
    expect(ev.duration).toBe(2);
    // At t = duration the clip with an outro of kind none is still there, the faded one is not.
    expect(ev.evaluate(2).map((d) => d.clipId)).toEqual([keep.id, keep.id]);
    expect(ev.evaluate(99)).toEqual(ev.evaluate(2));
    // Just before the end both are drawn (the fade is almost done).
    expect(new Set(ev.evaluate(1.999).map((d) => d.clipId))).toEqual(new Set([keep.id, fading.id]));
  });

  it('cuts clips that run past meta.duration', async () => {
    const scene = await sceneWith({ a: 'ab' });
    const clip = plainClip(scene, 'a', 0, 0, 5);
    scene.project.meta.duration = 2;
    const ev = createEvaluator(scene.project, scene.formulas);
    expect(ev.evaluate(5).every((d) => d.clipId === clip.id)).toBe(true);
    expect(ev.evaluate(5)).toHaveLength(2);
  });
});

describe('geometry', () => {
  it('places every glyph with the clip state, drawn or not, and unites them', async () => {
    const scene = await sceneWith({ a: 'ab' });
    const clip = plainClip(scene, 'a', 0, 0, 10, { intro: defaultIntro('write') });
    clip.initial.position = [1, 2];
    clip.initial.scale = 2;
    scene.f.a!.hiddenGlyphs = [1]; // hidden at the start: still part of the formula's box
    const ev = createEvaluator(scene.project, scene.formulas);
    const { bbox, glyphs } = scene.formulas.get(scene.f.a!.id)!.render;
    const [shape] = ev.geometry(5);
    expect(ev.geometry(5)).toHaveLength(1);
    expect(shape!.clipId).toBe(clip.id);
    expect(shape!.box.minX).toBeCloseTo(1 + 2 * bbox.minX);
    expect(shape!.box.maxX).toBeCloseTo(1 + 2 * bbox.maxX);
    expect(shape!.box.minY).toBeCloseTo(2 + 2 * bbox.minY);
    expect(shape!.box.maxY).toBeCloseTo(2 + 2 * bbox.maxY);
    expect([...shape!.glyphs.keys()]).toEqual([0, 1]);
    expect(shape!.glyphs.get(1)!.minX).toBeCloseTo(1 + 2 * glyphs[1]!.bbox.minX);
    // During the Write intro the drawing is partial; the geometry is the whole formula's.
    expect(ev.geometry(0.3)[0]!.box).toEqual(shape!.box);
    // t is clamped like evaluate's; at the end of the scene the clip still counts.
    expect(ev.geometry(-1)).toEqual(ev.geometry(0));
    expect(ev.geometry(10)).toHaveLength(1);
    expect(ev.geometry(99)).toEqual(ev.geometry(10));
  });

  it('follows a part transform: a shifted glyph takes the box with it', async () => {
    const scene = await sceneWith({ a: 'ab' });
    const clip = plainClip(scene, 'a', 0, 0, 10);
    clip.actions.push(
      createPartTransform(1, [1], { duration: 1, shift: [3, 0], easing: 'linear' }),
    );
    const ev = createEvaluator(scene.project, scene.formulas);
    const { bbox, glyphs } = scene.formulas.get(scene.f.a!.id)!.render;
    const before = ev.geometry(0.5)[0]!;
    expect(before.box.maxX).toBeCloseTo(bbox.maxX);
    const during = ev.geometry(1.5)[0]!;
    expect(during.glyphs.get(1)!.minX).toBeCloseTo(glyphs[1]!.bbox.minX + 1.5);
    expect(during.glyphs.get(0)!.minX).toBeCloseTo(glyphs[0]!.bbox.minX);
    const after = ev.geometry(5)[0]!;
    expect(after.glyphs.get(1)!.maxX).toBeCloseTo(glyphs[1]!.bbox.maxX + 3);
    expect(after.box.maxX).toBeCloseTo(bbox.maxX + 3);
    expect(after.box.minX).toBeCloseTo(bbox.minX);
  });

  it('leaves out clips on hidden tracks and formulas without a render, like evaluate', async () => {
    const scene = await sceneWith({ a: 'x', b: 'y' });
    plainClip(scene, 'a', 0, 0, 5);
    plainClip(scene, 'b', 1, 0, 5);
    scene.project.tracks[1]!.hidden = true;
    const ev = createEvaluator(scene.project, scene.formulas);
    expect(ev.geometry(1).map((g) => g.clipId)).toEqual([scene.project.clips[0]!.id]);
    const none = createEvaluator(scene.project, new Map());
    expect(none.geometry(1)).toEqual([]);
  });
});

describe('placement helpers', () => {
  it('applies flips and scale, then rotation, then translation', () => {
    const m = placementMatrix({
      position: [1, 2],
      scale: 2,
      rotation: 90,
      flipX: true,
      flipY: false,
    });
    // (1, 0) → flip/scale (-2, 0) → rotate 90° (0, -2) → translate (1, 0)
    const p = applyToPoint(m, [1, 0]);
    expect(p[0]).toBeCloseTo(1);
    expect(p[1]).toBeCloseTo(0);
  });

  it('resolves glyph colours by precedence', () => {
    const formula = createFormula({ color: '#111111', glyphColors: { '1': '#222222' } });
    const state = { opacity: 1, color: null, glyphColors: {} };
    expect(glyphColor(0, state, formula)).toBe('#111111');
    expect(glyphColor(1, state, formula)).toBe('#222222');
    expect(glyphColor(1, { ...state, color: '#333333' }, formula)).toBe('#333333');
    expect(
      glyphColor(1, { ...state, color: '#333333', glyphColors: { '1': '#444444' } }, formula),
    ).toBe('#444444');
  });
});

describe('keyframes', () => {
  it('edits the initial state before the first action, then the latest started action', () => {
    const clip = createClip('f', 't', 1, 9);
    clip.actions.push(createTween(4, 1, { position: [3, 0] }), createTween(2, 1, { scale: 2 }));
    const [late, early] = clip.actions as TweenAction[];

    expect(keyframeAt(clip, 2.5).ref).toEqual({ kind: 'initial' });
    expect(keyframeAt(clip, 3).ref).toEqual({ kind: 'action', actionId: early!.id });
    expect(keyframeAt(clip, 4.5)).toMatchObject({ state: { scale: 2 } });
    const atEnd = keyframeAt(clip, 8);
    expect(atEnd).toMatchObject({
      ref: { actionId: late!.id },
      state: { position: [3, 0], scale: 2 },
    });

    patchKeyframe(clip, atEnd.ref, { position: [3, 1] });
    expect(late!.to).toEqual({ position: [3, 1] });
    patchKeyframe(clip, { kind: 'initial' }, { position: [-1, 0] });
    expect(clip.initial.position).toEqual([-1, 0]);
  });
});

describe('tweens', () => {
  it('moves, scales and rotates with the eased alpha; before and after are the states', async () => {
    const scene = await sceneWith({ a: 'xy' });
    const clip = plainClip(scene, 'a', 0, 0, 5, {
      actions: [
        createTween(1, 2, { position: [4, -2], scale: 2, rotation: 90, opacity: 0.5 }, 'linear'),
      ],
    });
    const ev = createEvaluator(scene.project, scene.formulas);
    const at = (t: number) => byKey(ev.evaluate(t)).get(`${clip.id}:0`)!;
    const start = at(0.5).path.contours[0]!;
    for (const [t, alpha] of [
      [1.5, 0.25],
      [2, 0.5],
      [2.5, 0.75],
    ] as const) {
      const m = placementMatrix({
        position: [4 * alpha, -2 * alpha],
        scale: 1 + alpha,
        rotation: 90 * alpha,
        flipX: false,
        flipY: false,
      });
      const want = applyToPoint(m, [start[0]!, start[1]!]);
      const got = at(t).path.contours[0]!;
      expect(got[0]).toBeCloseTo(want[0], 9);
      expect(got[1]).toBeCloseTo(want[1], 9);
    }
    expect(at(2).fill!.opacity).toBeCloseTo(0.75, 9);
    expect(at(4).fill!.opacity).toBeCloseTo(0.5, 9);
    // After the tween the state is its target, and stays so.
    expect(at(3)).toEqual(at(4.9));
    // Before it, the initial state.
    expect(at(0)).toEqual(at(1));
    expect(centerOf(at(4))[0]).toBeGreaterThan(centerOf(at(0))[0] + 3);
  });

  it('rotates truly: points stay at their distance from the pivot', async () => {
    const scene = await sceneWith({ a: 'xy' });
    const clip = plainClip(scene, 'a', 0, 0, 3, {
      actions: [createTween(0, 2, { rotation: 180 }, 'linear')],
    });
    const ev = createEvaluator(scene.project, scene.formulas);
    const radius = (t: number) => {
      const c = byKey(ev.evaluate(t)).get(`${clip.id}:0`)!.path.contours[0]!;
      return Math.hypot(c[0]!, c[1]!);
    };
    // Linear interpolation of points would pass through 0 at the half-way mark.
    expect(radius(1)).toBeCloseTo(radius(0), 9);
    expect(radius(0.4)).toBeCloseTo(radius(0), 9);
  });

  it('flips by passing the scale linearly from +1 to -1', async () => {
    const scene = await sceneWith({ a: 'xy' });
    const clip = plainClip(scene, 'a', 0, 0, 3, {
      actions: [createTween(0, 2, { flipX: true }, 'linear')],
    });
    const ev = createEvaluator(scene.project, scene.formulas);
    const xs = (t: number) => {
      const d = byKey(ev.evaluate(t)).get(`${clip.id}:0`)!;
      return d.path.contours[0]!.filter((_, i) => i % 2 === 0);
    };
    const start = xs(0);
    expect(xs(1).map((x, i) => x / start[i]!)).toSatisfy((r: number[]) =>
      r.every((v) => Math.abs(v) < 1e-9 || Math.abs(v) === 0),
    ); // scale 0 at half-way
    const quarter = xs(0.5).map((x, i) => (Math.abs(start[i]!) > 1e-9 ? x / start[i]! : 0));
    quarter.filter((v) => v !== 0).forEach((v) => expect(v).toBeCloseTo(0.5, 9));
    xs(2).forEach((x, i) => expect(x).toBeCloseTo(-start[i]!, 9));
  });

  it('interpolates colours per glyph in RGB with the glyph colour precedence', async () => {
    const scene = await sceneWith({ a: 'xy' });
    scene.f.a!.color = '#000000';
    scene.f.a!.glyphColors = { '1': '#00FF00' };
    const clip = plainClip(scene, 'a', 0, 0, 3, {
      actions: [createTween(0, 2, { color: '#FFFFFF' }, 'linear')],
    });
    // Clip colour beats formula glyph colours (glyphColor precedence), so glyph 1 also goes white.
    const ev = createEvaluator(scene.project, scene.formulas);
    const at = (t: number, g: number) => byKey(ev.evaluate(t)).get(`${clip.id}:${g}`)!.fill!.color;
    expect(at(0, 0)).toBe('#000000');
    expect(at(0, 1)).toBe('#00FF00');
    expect(at(1, 0)).toBe('#808080');
    expect(at(1, 1)).toBe('#80FF80');
    expect(at(2, 1)).toBe('#FFFFFF');
  });

  it('applies the easing of the target library', async () => {
    for (const target of ['ce', 'gl'] as const) {
      const scene = await sceneWith({ a: 'x' }, target);
      const clip = plainClip(scene, 'a', 0, 0, 3, {
        actions: [createTween(0, 2, { opacity: 0 }, 'smooth')],
      });
      const ev = createEvaluator(scene.project, scene.formulas);
      const opacity = byKey(ev.evaluate(0.5)).get(`${clip.id}:0`)!.fill!.opacity;
      expect(opacity).toBeCloseTo(1 - rateFunction('smooth', target)(0.25), 9);
    }
  });
});

describe('determinism', () => {
  it('returns the same drawables for the same t whatever was evaluated before', async () => {
    const scene = await sceneWith({ a: 'a+b=c', b: 'xyz' });
    plainClip(scene, 'a', 0, 0, 4, {
      intro: defaultIntro('write'),
      outro: defaultOutro('unwrite'),
      actions: [createTween(1.5, 1, { position: [2, 1], rotation: 40 })],
    });
    plainClip(scene, 'b', 1, 1, 5, {
      intro: defaultIntro('fade_in'),
      outro: defaultOutro('shrink_to_center'),
    });
    const times = Array.from({ length: 41 }, (_, i) => i * 0.125);
    const reference = createEvaluator(scene.project, scene.formulas);
    const expected = times.map((t) => summary(reference.evaluate(t)));

    const shuffled = [...times.keys()].sort((x, y) => ((x * 7919) % 41) - ((y * 7919) % 41));
    const ev = createEvaluator(scene.project, scene.formulas);
    for (const i of shuffled) expect(summary(ev.evaluate(times[i]!))).toEqual(expected[i]);
    for (const i of [...shuffled].reverse()) {
      expect(summary(ev.evaluate(times[i]!))).toEqual(expected[i]);
    }
    // A fresh evaluator over the same data agrees too.
    expect(summary(createEvaluator(scene.project, scene.formulas).evaluate(2.3))).toEqual(
      summary(ev.evaluate(2.3)),
    );
  });
});
