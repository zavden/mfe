// @vitest-environment node
/* Attached objects in the evaluator (scene/attach.ts): `measure` reads a clip's glyphs where its
 * state, tweens and part transforms put them, and `deriveAttachments` / `settleAttachments` place
 * each attached clip beside its target glyphs at the clip's start, chains included: a brace fitted
 * to its target, a label at a brace's tip, a shape fitted to its target. */
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import { rotate, type Box } from '../../geom';
import {
  BRACE_LABEL_BUFF,
  createAttach,
  createBraceAttach,
  type BraceAttach,
  createBraceFormula,
  createPartTransform,
  createShapeAttach,
  createShapeFormula,
  createTipAttach,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  type Clip,
  type Formula,
  type ShapeKind,
  type Target,
} from '../../model';
import {
  createEvaluator,
  deriveAttachments,
  exportEvaluator,
  readBraceTip,
  settleAttachments,
  settleScene,
} from '../index';
import type { ManimBoxes } from '../measure';
import { plainClip, sceneWith } from './sceneKit';

const near = (box: Box, expected: Box) => {
  for (const key of ['minX', 'minY', 'maxX', 'maxY'] as const) {
    expect(box[key], key).toBeCloseTo(expected[key], 9);
  }
};
const centreX = (b: Box) => (b.minX + b.maxX) / 2;
const centreY = (b: Box) => (b.minY + b.maxY) / 2;

describe('SceneEvaluator.measure', () => {
  it('reads the glyphs where the state, the tweens and the part transforms put them', async () => {
    const scene = await sceneWith({ a: 'a+b' });
    const clip = plainClip(scene, 'a', 0, 0, 4);
    clip.initial.position = [1, -1];
    clip.initial.scale = 2;
    clip.actions.push(
      createTween(1, 1, { position: [3, 0] }),
      createPartTransform(2.5, [2], { shift: [0, 1] }),
    );
    const ev = createEvaluator(scene.project, scene.formulas);
    const geometry = (t: number) => ev.geometry(t).find((g) => g.clipId === clip.id)!;
    // Mock glyphs are rectangles: the anchors box is the box of every point, the one geometry() has.
    const same = (boxes: ManimBoxes | null, box: Box) => {
      near(boxes!.size, box);
      near(boxes!.critical, box);
    };
    same(ev.measure(clip.id, 'all', 0), geometry(0).box);
    same(ev.measure(clip.id, 'all', 1.5), geometry(1.5).box); // mid-tween
    same(ev.measure(clip.id, [2], 3.5), geometry(3.5).glyphs.get(2)!); // the moved glyph
    // Turned by a frame first: a quarter turn swaps the box's axes.
    const whole = ev.measure(clip.id, 'all', 0)!.size;
    const turned = ev.measure(clip.id, 'all', 0, rotate(90))!.size;
    expect(turned.maxX - turned.minX).toBeCloseTo(whole.maxY - whole.minY, 9);
    expect(turned.maxY - turned.minY).toBeCloseTo(whole.maxX - whole.minX, 9);
    expect(turned.minX).toBeCloseTo(-whole.maxY, 9);
    const g0 = geometry(3.5).glyphs.get(0)!;
    const g1 = geometry(3.5).glyphs.get(1)!;
    same(ev.measure(clip.id, [0, 1], 3.5), {
      minX: Math.min(g0.minX, g1.minX),
      minY: Math.min(g0.minY, g1.minY),
      maxX: Math.max(g0.maxX, g1.maxX),
      maxY: Math.max(g0.maxY, g1.maxY),
    });
    expect(ev.measure(clip.id, [2], 3.5)!.size.minY).toBeCloseTo(
      geometry(2).glyphs.get(2)!.minY + 1,
      9,
    );
  });

  it('hands over the point lists it measures: as rendered and as placed, glyph by glyph', async () => {
    const scene = await sceneWith({ a: 'a+b' });
    const clip = plainClip(scene, 'a', 0, 0, 4);
    clip.initial.position = [1, -1];
    clip.initial.rotation = 30;
    const ev = createEvaluator(scene.project, scene.formulas);
    const lists = ev.points(clip.id, [0, 2], 1)!;
    expect(lists.map((l) => l.glyph)).toEqual([0, 2]);
    // Placed: the local points turned and moved as the glyphs are; the same boxes as measure.
    const measured = ev.measure(clip.id, [0, 2], 1)!;
    const xs = lists.flatMap((l) => [...l.placed.points].filter((_, i) => i % 2 === 0));
    expect(Math.min(...xs)).toBeCloseTo(measured.size.minX, 9);
    expect(Math.max(...xs)).toBeCloseTo(measured.size.maxX, 9);
    expect(lists[0]!.local.points.length).toBe(lists[0]!.placed.points.length);
    expect(lists[0]!.local.points[0]).not.toBeCloseTo(lists[0]!.placed.points[0]!, 3);
    expect(ev.points('nope', 'all', 1)).toBeNull();
  });

  it('is null for a clip it does not draw, or glyphs the formula does not have', async () => {
    const scene = await sceneWith({ a: 'a+b' });
    const clip = plainClip(scene, 'a', 0, 0, 4);
    const ev = createEvaluator(scene.project, scene.formulas);
    expect(ev.measure('nope', 'all', 1)).toBeNull();
    expect(ev.measure(clip.id, [7], 1)).toBeNull();
    expect(ev.measure(clip.id, [], 1)).toBeNull();
    // A hidden track is still measured by the export evaluator (hiding is a preview toggle).
    scene.project.tracks[0]!.hidden = true;
    expect(createEvaluator(scene.project, scene.formulas).measure(clip.id, 'all', 1)).toBeNull();
    expect(
      exportEvaluator(scene.project, scene.formulas).measure(clip.id, 'all', 1),
    ).not.toBeNull();
  });
});

describe('deriveAttachments / settleAttachments', () => {
  it('places an attached clip beside the target glyphs at its start, and settles a chain', async () => {
    const scene = await sceneWith({ a: 'a+b', x: 'x', y: 'y' });
    const ca = plainClip(scene, 'a', 0, 0, 6);
    ca.initial.position = [1, 1];
    ca.actions.push(createTween(1, 1, { position: [2, 0], scale: 1.5 }));
    const cx = plainClip(scene, 'x', 1, 3, 5, {
      attach: createAttach(ca.id, [2], { side: 'down', buff: 0.3 }),
    });
    cx.initial.position = [-4, 3];
    const cy = plainClip(scene, 'y', 1, 4.5, 5, {
      attach: createAttach(cx.id, 'all', { side: 'right', buff: 0.1 }),
    });
    // The first pass moves both (y measured against x where it was); the second moves y again.
    const first = deriveAttachments(scene.project, scene.formulas);
    expect(first.map((p) => p.clipId)).toEqual([cx.id, cy.id]);
    const settled = settleAttachments(scene.project, scene.formulas);
    expect(settled).not.toBe(scene.project);
    expect(deriveAttachments(settled, scene.formulas)).toEqual([]);
    expect(settleAttachments(settled, scene.formulas)).toBe(settled);

    const ev = createEvaluator(settled, scene.formulas);
    const at = (t: number, id: string) => ev.geometry(t).find((g) => g.clipId === id)!;
    // x hangs below glyph 2 (b) of a, as a is at 3 s: after its tween, scaled 1.5 at [2, 0].
    const target = at(3, ca.id).glyphs.get(2)!;
    const label = at(3, cx.id).box;
    expect(label.maxY).toBeCloseTo(target.minY - 0.3, 9);
    expect(centreX(label)).toBeCloseTo(centreX(target), 9);
    // y hangs to the right of x, where x settled.
    const xb = at(4.5, cx.id).box;
    const yb = at(4.5, cy.id).box;
    expect(yb.minX).toBeCloseTo(xb.maxX + 0.1, 9);
    expect(centreY(yb)).toBeCloseTo(centreY(xb), 9);
    // The project value is untouched; the settled one carries the positions.
    expect(cx.initial.position).toEqual([-4, 3]);
    expect(settled.clips[1]!.initial.position).not.toEqual([-4, 3]);
  });

  it('leaves alone what it cannot place: no render, a missing target, a chain that goes round', async () => {
    const scene = await sceneWith({ a: 'a+b', x: 'x' });
    const ca = plainClip(scene, 'a', 0, 0, 6);
    const cx = plainClip(scene, 'x', 1, 3, 5, { attach: createAttach('nope', 'all') });
    expect(deriveAttachments(scene.project, scene.formulas)).toEqual([]);
    cx.attach = createAttach(ca.id, 'all');
    ca.attach = createAttach(cx.id, 'all');
    expect(deriveAttachments(scene.project, scene.formulas)).toEqual([]);
    ca.attach = null;
    expect(deriveAttachments(scene.project, scene.formulas)).toHaveLength(1);
    expect(deriveAttachments(scene.project, new Map())).toEqual([]);
  });
});

describe('braces', () => {
  /** A brace object `b1` on track 1 over [2, 5), attached to glyph 2 (b) of `ca` with `fields`. */
  function braceOn(
    scene: Awaited<ReturnType<typeof sceneWith>>,
    ca: Clip,
    fields: { direction: number; buff: number },
    glyphs: number[] | 'all' = [2],
  ) {
    const brace = createBraceFormula({ name: 'b1' });
    scene.project.formulas.push(brace);
    scene.f.b1 = brace;
    const cb = plainClip(scene, 'b1', 1, 2, 5, {
      attach: createBraceAttach(ca.id, glyphs, fields),
    });
    return { brace, cb };
  }
  const widthOf = (formula: Formula) => (formula.kind === 'brace' ? formula.width : NaN);
  const boxOf = (
    settled: {
      project: Parameters<typeof createEvaluator>[0];
      formulas: Parameters<typeof createEvaluator>[1];
    },
    t: number,
    id: string,
  ) =>
    createEvaluator(settled.project, settled.formulas)
      .geometry(t)
      .find((g) => g.clipId === id)!;

  it.each(['ce', 'gl'] as Target[])(
    'fits a brace to its target glyphs: width, rotation and place, then its render (%s)',
    async (lib) => {
      const scene = await sceneWith({ a: 'a+b' }, lib);
      const ca = plainClip(scene, 'a', 0, 0, 6);
      ca.initial.position = [1, 0.5];
      ca.initial.scale = 1.5;
      const { brace, cb } = braceOn(scene, ca, { direction: 0, buff: 0.3 });
      const [p, ...rest] = deriveAttachments(scene.project, scene.formulas);
      expect(rest).toEqual([]);
      const g = boxOf(scene, 2, ca.id).glyphs.get(2)!;
      // Mock glyphs are rectangles: every box rule agrees on the width.
      expect(p!.width).toBeCloseTo(g.maxX - g.minX, 9);
      expect(p!.rotation).toBe(0);
      // Settled and rendered at that width: the brace hangs `buff` below the glyph, as wide and
      // centred on it (ManimCE: a handle bulges a hair past the corner the anchors give).
      const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
      expect(settled.project.formulas[1]).toMatchObject({ kind: 'brace', width: p!.width });
      expect(settled.project.formulas[1]!.snapshot?.glyphs).toHaveLength(lib === 'ce' ? 1 : 6);
      expect(settled.formulas.get(brace.id)!.render.glyphs).toHaveLength(lib === 'ce' ? 1 : 6);
      const box = boxOf(settled, 2, cb.id).box;
      expect(box.maxY).toBeCloseTo(g.minY - 0.3, 6);
      expect(box.maxX - box.minX).toBeCloseTo(g.maxX - g.minX, 6);
      expect(centreX(box)).toBeCloseTo(centreX(g), 6);
      expect(settled.project.clips[1]!.initial.rotation).toBe(0);
      expect(deriveAttachments(settled.project, settled.formulas)).toEqual([]);
      // The project and the renders given are untouched.
      expect(widthOf(scene.project.formulas[1]!)).toBe(0);
      expect(scene.formulas.has(brace.id)).toBe(false);
    },
  );

  it('points the brace where its direction says: above, to the right, at an angle', async () => {
    const scene = await sceneWith({ a: 'a+b' });
    const ca = plainClip(scene, 'a', 0, 0, 6);
    const { cb } = braceOn(scene, ca, { direction: 180, buff: 0.25 }, 'all');
    const g = boxOf(scene, 2, ca.id).box;
    let settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    let box = boxOf(settled, 2, cb.id).box;
    expect(box.minY).toBeCloseTo(g.maxY + 0.25, 6);
    expect(centreX(box)).toBeCloseTo(centreX(g), 6);
    expect(settled.project.clips[1]!.initial.rotation).toBe(180);
    // To the right: the width is the glyphs' height, and the brace stands beside them.
    cb.attach = createBraceAttach(ca.id, 'all', { direction: 90, buff: 0.1 });
    settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    box = boxOf(settled, 2, cb.id).box;
    expect(widthOf(settled.project.formulas[1]!)).toBeCloseTo(g.maxY - g.minY, 9);
    expect(box.minX).toBeCloseTo(g.maxX + 0.1, 6);
    expect(centreY(box)).toBeCloseTo(centreY(g), 6);
    expect(box.maxY - box.minY).toBeCloseTo(g.maxY - g.minY, 6);
    // At an angle: the width is the glyphs' extent across the direction.
    cb.attach = createBraceAttach(ca.id, 'all', { direction: 30, buff: 0.2 });
    settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    const w = g.maxX - g.minX;
    const h = g.maxY - g.minY;
    const across = w * Math.cos(Math.PI / 6) + h * Math.sin(Math.PI / 6);
    expect(widthOf(settled.project.formulas[1]!)).toBeCloseTo(across, 9);
    expect(settled.project.clips[1]!.initial.rotation).toBe(30);
  });

  it('settles a label hanging on the brace once the brace is rendered, and one width per object', async () => {
    const scene = await sceneWith({ a: 'a+b', x: 'x' });
    scene.project.tracks.push(createTrack('Track 3'), createTrack('Track 4'));
    const ca = plainClip(scene, 'a', 0, 0, 6);
    const { brace, cb } = braceOn(scene, ca, { direction: 0, buff: 0.2 });
    const cx = plainClip(scene, 'x', 2, 3, 5, {
      attach: createAttach(cb.id, 'all', { side: 'down', buff: 0.15 }),
    });
    // A second clip of the brace object, on every glyph: placed with the width the first fitted.
    const cb2 = plainClip(scene, 'b1', 3, 4, 5, {
      attach: createBraceAttach(ca.id, 'all', { direction: 0, buff: 0.2 }),
    });
    const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    const bb = boxOf(settled, 3, cb.id).box;
    const xb = boxOf(settled, 3, cx.id).box;
    expect(xb.maxY).toBeCloseTo(bb.minY - 0.15, 6);
    expect(centreX(xb)).toBeCloseTo(centreX(bb), 6);
    const g = boxOf(scene, 2, ca.id).glyphs.get(2)!;
    expect(widthOf(settled.project.formulas.find((f) => f.id === brace.id)!)).toBeCloseTo(
      g.maxX - g.minX,
      9,
    );
    const b2 = boxOf(settled, 4, cb2.id).box;
    expect(b2.maxX - b2.minX).toBeCloseTo(g.maxX - g.minX, 6);
    expect(deriveAttachments(settled.project, settled.formulas)).toEqual([]);
  });

  describe('labels at the tip', () => {
    /** b1 on track 1 over [2, 6) below glyph 2 of `ca`, and the label x hanging at its tip over
     * [start, 6) on track 2, with `buff` (null: Manim's). */
    async function labelled(lib: Target, direction: number, start = 2, buff: number | null = null) {
      const scene = await sceneWith({ a: 'a+b', x: 'x' }, lib);
      scene.project.tracks.push(createTrack('Track 3'));
      const ca = plainClip(scene, 'a', 0, 0, 6);
      ca.initial.position = [0.5, 1];
      const { cb } = braceOn(scene, ca, { direction, buff: 0.2 });
      cb.end = 6;
      const cx = plainClip(scene, 'x', 2, start, 6, { attach: createTipAttach(cb.id, buff) });
      return { scene, ca, cb, cx };
    }
    /** Rendered (a detached brace too: nothing else would render it here) and settled. */
    const settled = (scene: Awaited<ReturnType<typeof sceneWith>>) => {
      const fresh = refreshLocalRenders(scene.project, scene.formulas);
      return settleScene(fresh.project, fresh.formulas, refreshLocalRenders);
    };
    /** The brace's tip as the label reads it at t, and both clips' boxes there. */
    const readAt = (s: ReturnType<typeof settled>, cb: Clip, cx: Clip, t: number) => {
      const ev = createEvaluator(s.project, s.formulas);
      return {
        tip: readBraceTip(ev.points(cb.id, 'all', t)!, s.project.meta.target)!,
        brace: ev.measure(cb.id, 'all', t)!.critical,
        label: ev.measure(cx.id, 'all', t)!.critical,
      };
    };

    it.each(['ce', 'gl'] as Target[])(
      'puts the label where put_at_tip does, below or above, at the gap get_tex leaves (%s)',
      async (lib) => {
        const { scene, cb, cx } = await labelled(lib, 0);
        let s = settled(scene);
        let r = readAt(s, cb, cx, 3);
        // Below: the label's top `buff` under the tip — the brace's lowest point —, centred on it.
        expect(r.tip.side.map((v) => v + 0)).toEqual([0, -1]);
        expect(r.tip.tip[1]).toBeCloseTo(r.brace.minY, 9);
        expect(r.label.maxY).toBeCloseTo(r.tip.tip[1] - BRACE_LABEL_BUFF[lib], 9);
        expect(centreX(r.label)).toBeCloseTo(r.tip.tip[0], 9);
        expect(deriveAttachments(s.project, s.formulas)).toEqual([]);
        // Above, with a gap of its own.
        cb.attach = createBraceAttach((cb.attach as BraceAttach).clipId, [2], {
          direction: 180,
          buff: 0.2,
        });
        cx.attach = createTipAttach(cb.id, 0.4);
        s = settled(scene);
        r = readAt(s, cb, cx, 3);
        expect(r.tip.side.map((v) => v + 0)).toEqual([0, 1]);
        expect(r.label.minY).toBeCloseTo(r.tip.tip[1] + 0.4, 9);
        expect(centreX(r.label)).toBeCloseTo(r.tip.tip[0], 9);
      },
    );

    it('goes to a corner for a tilted brace, `buff` along both axes', async () => {
      const { scene, cb, cx } = await labelled('ce', 45, 2, 0.3);
      const s = settled(scene);
      const r = readAt(s, cb, cx, 3);
      expect(r.tip.side.map((v) => v + 0)).toEqual([1, -1]);
      // next_to(tip, [1, -1]): the label's upper-left corner at the tip, 0.3 right and 0.3 down.
      expect(r.label.minX).toBeCloseTo(r.tip.tip[0] + 0.3, 9);
      expect(r.label.maxY).toBeCloseTo(r.tip.tip[1] - 0.3, 9);
    });

    it('reads the brace where it is when the label starts: a tween of the brace counts', async () => {
      const { scene, cb, cx } = await labelled('ce', 0, 4);
      const first = settled(scene);
      const at = first.project.clips.find((c) => c.id === cb.id)!.initial.position;
      // The brace moves one unit right over [2.5, 3.5), before the label starts at 4 (a tween
      // starts relative to its clip, which starts at 2).
      cb.actions.push(createTween(0.5, 1, { position: [at[0] + 1, at[1]] }, 'linear'));
      const s = settled(scene);
      const r = readAt(s, cb, cx, 4);
      expect(centreX(r.label)).toBeCloseTo(r.tip.tip[0], 9);
      const before = readAt(first, cb, cx, 4);
      expect(centreX(r.label)).toBeCloseTo(centreX(before.label) + 1, 9);
    });

    it('hangs on a detached brace where its clip puts it', async () => {
      const scene = await sceneWith({ x: 'x' }, 'gl');
      const brace = createBraceFormula({ name: 'b1', width: 1.5 });
      scene.project.formulas.push(brace);
      scene.f.b1 = brace;
      const cb = plainClip(scene, 'b1', 0, 0, 5);
      cb.initial.position = [-1, 0.5];
      cb.initial.rotation = 90; // points right
      const cx = plainClip(scene, 'x', 1, 1, 5, { attach: createTipAttach(cb.id) });
      const s = settled(scene);
      const r = readAt(s, cb, cx, 2);
      expect(r.tip.side.map((v) => v + 0)).toEqual([1, 0]);
      expect(r.label.minX).toBeCloseTo(r.tip.tip[0] + BRACE_LABEL_BUFF.gl, 9);
      expect((r.label.minY + r.label.maxY) / 2).toBeCloseTo(r.tip.tip[1], 9);
    });

    it('leaves a tip rule on a clip that is not a brace alone, and a label with no glyphs', async () => {
      const scene = await sceneWith({ a: 'a+b', x: 'x' });
      const ca = plainClip(scene, 'a', 0, 0, 6);
      plainClip(scene, 'x', 1, 2, 5, { attach: createTipAttach(ca.id) });
      expect(deriveAttachments(scene.project, scene.formulas)).toEqual([]);
      const { scene: other, cb, cx } = await labelled('ce', 0);
      other.formulas.delete(other.f.x!.id); // not rendered yet
      const s = settled(other);
      expect(s.project.clips.find((c) => c.id === cx.id)!.initial.position).toEqual([0, 0]);
      expect(s.project.clips.find((c) => c.id === cb.id)!.initial.position).not.toEqual([0, 0]);
    });
  });

  it('leaves a brace rule on an object that is not a brace alone', async () => {
    const scene = await sceneWith({ a: 'a+b', x: 'x' });
    const ca = plainClip(scene, 'a', 0, 0, 6);
    plainClip(scene, 'x', 1, 2, 5, { attach: createBraceAttach(ca.id, [2]) });
    expect(deriveAttachments(scene.project, scene.formulas)).toEqual([]);
    expect(settleAttachments(scene.project, scene.formulas)).toBe(scene.project);
  });
});

describe('shapes', () => {
  /** A shape object `s1` of `shape` on track 1 over [2, 5), attached to `glyphs` of `ca`,
   * `buff` away. */
  function shapeOn(
    scene: Awaited<ReturnType<typeof sceneWith>>,
    ca: Clip,
    shape: ShapeKind,
    buff: number,
    glyphs: number[] | 'all' = [2],
  ) {
    const object = createShapeFormula({ name: 's1', shape });
    scene.project.formulas.push(object);
    scene.f.s1 = object;
    const cs = plainClip(scene, 's1', 1, 2, 5, { attach: createShapeAttach(ca.id, glyphs, buff) });
    return { object, cs };
  }
  const sizeOf = (formula: Formula) =>
    formula.kind === 'shape' ? [formula.width, formula.height] : [NaN, NaN];
  const boxOf = (
    settled: {
      project: Parameters<typeof createEvaluator>[0];
      formulas: Parameters<typeof createEvaluator>[1];
    },
    t: number,
    id: string,
  ) =>
    createEvaluator(settled.project, settled.formulas)
      .geometry(t)
      .find((g) => g.clipId === id)!;
  const grown = (box: Box, by: number): Box => ({
    minX: box.minX - by,
    minY: box.minY - by,
    maxX: box.maxX + by,
    maxY: box.maxY + by,
  });

  it.each(['ce', 'gl'] as Target[])(
    'fits a box to its target glyphs: size and place, then its render (%s)',
    async (lib) => {
      const scene = await sceneWith({ a: 'a+b' }, lib);
      const ca = plainClip(scene, 'a', 0, 0, 6);
      ca.initial.position = [1, 0.5];
      ca.initial.scale = 1.5;
      const { object, cs } = shapeOn(scene, ca, 'box', 0.2, [1, 2]);
      const [p, ...rest] = deriveAttachments(scene.project, scene.formulas);
      expect(rest).toEqual([]);
      const g = boxOf(scene, 2, ca.id).glyphs;
      const target: Box = {
        minX: Math.min(g.get(1)!.minX, g.get(2)!.minX),
        minY: Math.min(g.get(1)!.minY, g.get(2)!.minY),
        maxX: Math.max(g.get(1)!.maxX, g.get(2)!.maxX),
        maxY: Math.max(g.get(1)!.maxY, g.get(2)!.maxY),
      };
      // Mock glyphs are rectangles: every box rule agrees. The box is the gap wider all round.
      expect(p!.width).toBeCloseTo(target.maxX - target.minX + 0.4, 9);
      expect(p!.height).toBeCloseTo(target.maxY - target.minY + 0.4, 9);
      expect(p!.position[0]).toBeCloseTo(centreX(target), 9);
      expect(p!.position[1]).toBeCloseTo(centreY(target), 9);
      expect(p!.rotation).toBe(0);
      // Settled and rendered at that size: one glyph, the box around the two glyphs.
      const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
      expect(settled.project.formulas[1]).toMatchObject({
        kind: 'shape',
        width: p!.width,
        height: p!.height,
      });
      expect(settled.project.formulas[1]!.snapshot?.glyphs).toHaveLength(1);
      expect(settled.formulas.get(object.id)!.render.glyphs).toHaveLength(1);
      near(boxOf(settled, 2, cs.id).box, grown(target, 0.2));
      expect(deriveAttachments(settled.project, settled.formulas)).toEqual([]);
      // The project and the renders given are untouched.
      expect(sizeOf(scene.project.formulas[1]!)).toEqual([0, 0]);
      expect(scene.formulas.has(object.id)).toBe(false);
    },
  );

  it('fits each shape as Manim does: a circle through the corners, an underline below, a cross over', async () => {
    const fitted = async (shape: ShapeKind, buff: number) => {
      const scene = await sceneWith({ a: 'a+b' });
      const ca = plainClip(scene, 'a', 0, 0, 6);
      ca.initial.position = [-1, 1];
      const { object, cs } = shapeOn(scene, ca, shape, buff, 'all');
      const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
      return {
        target: boxOf(scene, 2, ca.id).box,
        box: boxOf(settled, 2, cs.id).box,
        glyphs: settled.formulas.get(object.id)!.render.glyphs.length,
        rotation: settled.project.clips[1]!.initial.rotation,
      };
    };
    const circle = await fitted('circle', 0.1);
    const w = circle.target.maxX - circle.target.minX;
    const h = circle.target.maxY - circle.target.minY;
    expect(circle.box.maxX - circle.box.minX).toBeCloseTo(Math.hypot(w, h) + 0.2, 6);
    expect(centreX(circle.box)).toBeCloseTo(centreX(circle.target), 6);
    expect(centreY(circle.box)).toBeCloseTo(centreY(circle.target), 6);
    expect(circle.glyphs).toBe(1);
    // An underline: as wide as the glyphs, its top `buff` below them, centred on them.
    const line = await fitted('underline', 0.15);
    expect(line.box.maxY).toBeCloseTo(line.target.minY - 0.15, 6);
    expect(line.box.maxY - line.box.minY).toBeCloseTo(0, 9);
    expect(line.box.maxX - line.box.minX).toBeCloseTo(w, 6);
    expect(centreX(line.box)).toBeCloseTo(centreX(line.target), 6);
    // A cross: two lines over the glyphs' box, whatever the gap.
    const cross = await fitted('cross', 0.5);
    near(cross.box, cross.target);
    expect(cross.glyphs).toBe(2);
    expect(cross.rotation).toBe(0);
    // A cross line: one line over the same box.
    const line1 = await fitted('cross_line', 0.5);
    near(line1.box, line1.target);
    expect(line1.glyphs).toBe(1);
    expect(line1.rotation).toBe(0);
  });

  it('fits the shape to the glyphs as they are when its clip starts, and keeps it there', async () => {
    const scene = await sceneWith({ a: 'a+b' });
    const ca = plainClip(scene, 'a', 0, 0, 6);
    ca.actions.push(createTween(1, 1, { position: [2, 0], scale: 2 }, 'smooth'));
    const { cs } = shapeOn(scene, ca, 'box', 0.1, 'all');
    const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    const g = boxOf(settled, 2, ca.id).box;
    expect(centreX(g)).toBeCloseTo(2, 6); // moved by 2 s already
    near(boxOf(settled, 2, cs.id).box, grown(g, 0.1));
    expect(boxOf(settled, 4, cs.id).box).toEqual(boxOf(settled, 2, cs.id).box);
  });

  it('places a second clip of a shape object with the size the first one fitted', async () => {
    const scene = await sceneWith({ a: 'a+b', b: 'x' });
    scene.project.tracks.push(createTrack('Track 3'), createTrack('Track 4'));
    const ca = plainClip(scene, 'a', 0, 0, 6);
    const cb = plainClip(scene, 'b', 2, 0, 6);
    cb.initial.position = [3, 0];
    const { object } = shapeOn(scene, ca, 'box', 0.1, 'all');
    const second = plainClip(scene, 's1', 3, 1, 4, { attach: createShapeAttach(cb.id, 'all') });
    const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    const a = boxOf(settled, 2, ca.id).box;
    const width = a.maxX - a.minX + 0.2;
    expect(sizeOf(settled.project.formulas.find((f) => f.id === object.id)!)[0]).toBeCloseTo(
      width,
      6,
    );
    const b = boxOf(settled, 2, cb.id).box;
    const box = boxOf(settled, 2, second.id).box;
    expect(centreX(box)).toBeCloseTo(centreX(b), 6);
    expect(box.maxX - box.minX).toBeCloseTo(width, 6); // the first clip's size, not x's
  });
});

describe('shapes under ManimGL intros', () => {
  /** A shape on `a`'s glyphs over [2, 5), created over 1 s and unwritten over the last 0.5 s,
   * settled: the drawables of its clip at `t`. */
  async function drawnAt(lib: Target, shape: ShapeKind, t: number) {
    const scene = await sceneWith({ a: 'a+b' }, lib);
    const ca = plainClip(scene, 'a', 0, 0, 6);
    const object = createShapeFormula({ name: 's1', shape });
    scene.project.formulas.push(object);
    scene.f.s1 = object;
    const cs = plainClip(scene, 's1', 1, 2, 5, {
      intro: defaultIntro('create'),
      outro: { ...defaultOutro('unwrite'), duration: 0.5 },
      attach: createShapeAttach(ca.id, 'all'),
    });
    const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    return createEvaluator(settled.project, settled.formulas)
      .evaluate(t)
      .filter((d) => d.clipId === cs.id);
  }

  it('creates a box from the start in ManimGL too: the mobject is its one glyph, no stagger slot', async () => {
    // smooth(0.3) ≈ 0.22 of the outline: on screen in both libraries, as a cut path.
    for (const lib of ['ce', 'gl'] as Target[]) {
      const drawn = await drawnAt(lib, 'box', 2.3);
      expect(drawn, lib).toHaveLength(1);
      expect(drawn[0]!.partial).toBe(true);
    }
    // A cross is a group of two lines: ManimGL staggers them after the group's slot (create's
    // lag ratio is 1), so halfway through only the first line is being drawn, half of it.
    expect(await drawnAt('gl', 'cross', 2.3)).toEqual([]);
    const cross = await drawnAt('gl', 'cross', 2.5);
    expect(cross.map((d) => [d.glyph, d.partial])).toEqual([[0, true]]);
    // ManimCE has no slot: halfway, the first line is whole and the second not started.
    expect((await drawnAt('ce', 'cross', 2.5)).map((d) => [d.glyph, d.partial])).toEqual([
      [0, false],
    ]);
  });

  it("keeps the slot under Unwrite: ManimGL's `_Unwrite` wraps the glyphs in a VGroup of their own", async () => {
    // The unwrite runs over [4.5, 5), linear: in ManimGL the circle (slot 1 of 2, lag 0.2) is
    // still whole at 4.55 s and thinning by 4.65 s; ManimCE's starts thinning at once.
    const width = async (lib: Target, t: number) =>
      (await drawnAt(lib, 'circle', t))[0]!.stroke!.width;
    expect(await width('gl', 4.55)).toBeCloseTo(4, 9);
    expect(await width('gl', 4.65)).toBeCloseTo(2 + 2 * (2 * (1 - (0.3 * 1.2 - 0.2)) - 1), 9);
    expect(await width('ce', 4.55)).toBeCloseTo(2 + 2 * (2 * 0.9 - 1), 9);
  });
});

describe('a brace or a shape over glyphs of several clips (format 21)', () => {
  type Kit = Awaited<ReturnType<typeof sceneWith>>;
  const geometryOf = (
    settled: {
      project: Parameters<typeof createEvaluator>[0];
      formulas: Parameters<typeof createEvaluator>[1];
    },
    id: string,
  ) =>
    createEvaluator(settled.project, settled.formulas)
      .geometry(2)
      .find((g) => g.clipId === id)!;
  const unionOf = (boxes: Box[]): Box => ({
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  });
  /** "a+b" up on the left and "xyz", bigger, down on the right, on two tracks over [0, 6); a
   * third track for what hangs on them. What spans both: glyph 2 of the first, glyphs 0 and 1 of
   * the second. */
  async function twoClips(lib: Target = 'ce') {
    const scene = await sceneWith({ a: 'a+b', c: 'xyz' }, lib);
    scene.project.tracks.push(createTrack('Track 3'));
    const ca = plainClip(scene, 'a', 0, 0, 6);
    ca.initial.position = [-2, 0.5];
    const cc = plainClip(scene, 'c', 1, 0, 6);
    cc.initial.position = [2, -1];
    cc.initial.scale = 1.5;
    const a = geometryOf(scene, ca.id).glyphs;
    const c = geometryOf(scene, cc.id).glyphs;
    const union = unionOf([a.get(2)!, c.get(0)!, c.get(1)!]);
    const also = [{ clipId: cc.id, glyphs: [0, 1] }];
    return { scene, ca, cc, union, also };
  }
  function braceOver(scene: Kit, attach: ReturnType<typeof createBraceAttach>) {
    const brace = createBraceFormula({ name: 'b1' });
    scene.project.formulas.push(brace);
    scene.f.b1 = brace;
    return { brace, cb: plainClip(scene, 'b1', 2, 2, 5, { attach }) };
  }

  it.each(['ce', 'gl'] as Target[])(
    'fits a brace to them as to one group: as wide as them all, under the lowest (%s)',
    async (lib) => {
      const { scene, ca, cc, union, also } = await twoClips(lib);
      const attach = createBraceAttach(ca.id, [2], { direction: 0, buff: 0.3, also });
      const { cb } = braceOver(scene, attach);
      const [p, ...rest] = deriveAttachments(scene.project, scene.formulas);
      expect(rest).toEqual([]);
      // Mock glyphs are rectangles: every box rule agrees on the width.
      expect(p!.width).toBeCloseTo(union.maxX - union.minX, 9);
      const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
      const box = geometryOf(settled, cb.id).box;
      expect(box.maxY).toBeCloseTo(union.minY - 0.3, 6);
      expect(box.maxX - box.minX).toBeCloseTo(union.maxX - union.minX, 6);
      expect(centreX(box)).toBeCloseTo(centreX(union), 6);
      expect(deriveAttachments(settled.project, settled.formulas)).toEqual([]);
      expect(settled.readiness).toEqual({ ready: true, pending: [] });
      // It follows each of its targets: moving the second one alone asks for a new fit.
      const moved = {
        ...settled.project,
        clips: settled.project.clips.map((clip) =>
          clip.id === cc.id
            ? { ...clip, initial: { ...clip.initial, position: [4, -1] as [number, number] } }
            : clip,
        ),
      };
      const again = deriveAttachments(moved, settled.formulas);
      expect(again.map((placement) => placement.clipId)).toEqual([cb.id]);
      expect(again[0]!.width).toBeCloseTo(union.maxX - union.minX + 2, 9);
    },
  );

  it('measures them turned, as one group, for a brace that points to a side', async () => {
    const { scene, ca, union, also } = await twoClips();
    const { cb } = braceOver(
      scene,
      createBraceAttach(ca.id, [2], { direction: 90, buff: 0.1, also }),
    );
    const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    const box = geometryOf(settled, cb.id).box;
    // To the right of them all: as tall as the group, beside its right edge.
    expect(box.minX).toBeCloseTo(union.maxX + 0.1, 6);
    expect(box.maxY - box.minY).toBeCloseTo(union.maxY - union.minY, 6);
    expect(centreY(box)).toBeCloseTo(centreY(union), 6);
    expect(settled.project.clips[2]!.initial.rotation).toBe(90);
  });

  it.each(['ce', 'gl'] as Target[])('fits a box around them all (%s)', async (lib) => {
    const { scene, ca, union, also } = await twoClips(lib);
    const object = createShapeFormula({ name: 's1', shape: 'box' });
    scene.project.formulas.push(object);
    scene.f.s1 = object;
    const cs = plainClip(scene, 's1', 2, 2, 5, {
      attach: createShapeAttach(ca.id, [2], 0.2, also),
    });
    const [p, ...rest] = deriveAttachments(scene.project, scene.formulas);
    expect(rest).toEqual([]);
    expect(p!.width).toBeCloseTo(union.maxX - union.minX + 0.4, 9);
    expect(p!.height).toBeCloseTo(union.maxY - union.minY + 0.4, 9);
    expect(p!.position[0]).toBeCloseTo(centreX(union), 9);
    expect(p!.position[1]).toBeCloseTo(centreY(union), 9);
    const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    near(geometryOf(settled, cs.id).box, {
      minX: union.minX - 0.2,
      minY: union.minY - 0.2,
      maxX: union.maxX + 0.2,
      maxY: union.maxY + 0.2,
    });
    expect(settled.readiness.ready).toBe(true);
  });

  it('is left where it is while one of them cannot be measured, and says which', async () => {
    const { scene, ca, cc, also } = await twoClips();
    const { cb } = braceOver(scene, createBraceAttach(ca.id, [2], { also }));
    // No render of the second formula yet.
    const missing = new Map(scene.formulas);
    missing.delete(cc.formulaId);
    expect(deriveAttachments(scene.project, missing)).toEqual([]);
    expect(settleScene(scene.project, missing, refreshLocalRenders).readiness).toEqual({
      ready: false,
      pending: [{ clipId: cb.id, reason: 'missing-render', dependencyId: cc.id }],
    });
    // One of the others is not a clip of the project.
    cb.attach = createBraceAttach(ca.id, [2], { also: [{ clipId: 'nope', glyphs: 'all' }] });
    expect(deriveAttachments(scene.project, scene.formulas)).toEqual([]);
    expect(settleScene(scene.project, scene.formulas, refreshLocalRenders).readiness).toEqual({
      ready: false,
      pending: [{ clipId: cb.id, reason: 'missing-target', dependencyId: 'nope' }],
    });
  });

  it('is not placed when the chain goes round through one of the others', async () => {
    const { scene, ca, cc, also } = await twoClips();
    const { cb } = braceOver(scene, createBraceAttach(ca.id, [2], { also }));
    // The second clip hangs beside the brace that spans two of its glyphs.
    cc.attach = createAttach(cb.id, 'all');
    expect(deriveAttachments(scene.project, scene.formulas)).toEqual([]);
    const { pending } = settleScene(scene.project, scene.formulas, refreshLocalRenders).readiness;
    expect(pending.map((p) => [p.clipId, p.reason])).toEqual([
      [cc.id, 'cycle'],
      [cb.id, 'cycle'],
    ]);
  });
});

describe('a brace on a shape, and over whole clips (D123)', () => {
  type Settled = {
    project: Parameters<typeof createEvaluator>[0];
    formulas: Parameters<typeof createEvaluator>[1];
  };
  const boxOf = (settled: Settled, id: string) =>
    createEvaluator(settled.project, settled.formulas)
      .geometry(3)
      .find((g) => g.clipId === id)!.box;
  /** "a+b" on track 0 over [0, 6); a shape `s1` fitted around it from 1 s, 0.1 away; a brace
   * `b1` from 2 s on what `attach` names. */
  async function shaped(lib: Target, shape: ShapeKind) {
    const scene = await sceneWith({ a: 'a+b' }, lib);
    scene.project.tracks.push(createTrack('Track 3'));
    const ca = plainClip(scene, 'a', 0, 0, 6);
    ca.initial.position = [-2, 0.5];
    const object = createShapeFormula({ name: 's1', shape });
    const brace = createBraceFormula({ name: 'b1' });
    scene.project.formulas.push(object, brace);
    Object.assign(scene.f, { s1: object, b1: brace });
    const cs = plainClip(scene, 's1', 1, 1, 6, { attach: createShapeAttach(ca.id, 'all', 0.1) });
    return { scene, ca, cs };
  }

  it.each([
    ['ce', 'box'],
    ['gl', 'box'],
    ['ce', 'circle'],
    ['gl', 'circle'],
    ['ce', 'underline'],
    ['gl', 'cross'],
  ] as [Target, ShapeKind][])(
    'fits a brace to a shape as to any object: as wide as it, under it (%s, %s)',
    async (lib, shape) => {
      const { scene, cs } = await shaped(lib, shape);
      const cb = plainClip(scene, 'b1', 2, 2, 6, {
        attach: createBraceAttach(cs.id, 'all', { direction: 0, buff: 0.2 }),
      });
      const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
      expect(settled.readiness).toEqual({ ready: true, pending: [] });
      // The shape's own points, without its stroke: what `Brace(shape, DOWN)` measures.
      const target = boxOf(settled, cs.id);
      const box = boxOf(settled, cb.id);
      expect(target.maxX - target.minX).toBeGreaterThan(0.5);
      expect(box.maxX - box.minX).toBeCloseTo(target.maxX - target.minX, 6);
      expect(centreX(box)).toBeCloseTo(centreX(target), 6);
      expect(box.maxY).toBeCloseTo(target.minY - 0.2, 6);
      expect(deriveAttachments(settled.project, settled.formulas)).toEqual([]);
    },
  );

  it('fits one brace over a formula and a shape, each whole, as over one group', async () => {
    const { scene, ca, cs } = await shaped('ce', 'box');
    // A second formula apart, and the brace on the left of the box and of it.
    const other = createShapeFormula({ name: 's2', shape: 'circle', width: 1, height: 1 });
    scene.project.formulas.push(other);
    scene.f.s2 = other;
    const co = plainClip(scene, 's2', 0, 0, 6);
    co.initial.position = [3, -2];
    const cb = plainClip(scene, 'b1', 2, 2, 6, {
      attach: createBraceAttach(cs.id, 'all', {
        direction: 0,
        buff: 0.25,
        also: [
          { clipId: co.id, glyphs: 'all' },
          { clipId: ca.id, glyphs: 'all' },
        ],
      }),
    });
    const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    expect(settled.readiness).toEqual({ ready: true, pending: [] });
    const boxes = [cs, co, ca].map((clip) => boxOf(settled, clip.id));
    const union = {
      minX: Math.min(...boxes.map((b) => b.minX)),
      maxX: Math.max(...boxes.map((b) => b.maxX)),
      minY: Math.min(...boxes.map((b) => b.minY)),
    };
    const box = boxOf(settled, cb.id);
    expect(box.maxX - box.minX).toBeCloseTo(union.maxX - union.minX, 6);
    expect(centreX(box)).toBeCloseTo((union.minX + union.maxX) / 2, 6);
    expect(box.maxY).toBeCloseTo(union.minY - 0.25, 6);
  });
});
