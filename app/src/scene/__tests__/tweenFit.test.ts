// @vitest-environment node
/* A tween that carries a shape to surround other glyphs (`TweenFit`, D123), in the model's chain
 * of states and in the attach sync: the target is measured when the tween starts and fitted as an
 * attached shape's is; the tween then leaves the shape on that fit, unturned and at scale 1. */
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import type { Box } from '../../geom';
import {
  createBraceAttach,
  createBraceFormula,
  createFitTween,
  createShapeAttach,
  createShapeFormula,
  createTrack,
  createTween,
  validateProject,
  type Clip,
  type ShapeKind,
  type Target,
  type TweenAction,
} from '../../model';
import {
  actionStates,
  attachmentReadiness,
  createEvaluator,
  deriveAttachments,
  fitGap,
  settleScene,
} from '../index';
import { plainClip, sceneWith } from './sceneKit';

type Kit = Awaited<ReturnType<typeof sceneWith>>;
type Settled = ReturnType<typeof settleScene>;

/** "a+b" up on the left (track 0) and "xyz", bigger, down on the right (track 1), both over
 * [0, 8); a shape `s1` of `shape` around the whole of the first from 1 s (track 2), `gap` away —
 * or hanging on nothing, where the project puts it, with `gap` null. */
async function scene(shape: ShapeKind = 'box', gap: number | null = 0.2, lib: Target = 'ce') {
  const kit = await sceneWith({ a: 'a+b', c: 'xyz' }, lib);
  kit.project.tracks.push(createTrack('Track 3'));
  const ca = plainClip(kit, 'a', 0, 0, 8);
  ca.initial.position = [-2, 1];
  const cc = plainClip(kit, 'c', 1, 0, 8);
  cc.initial.position = [2, -1];
  cc.initial.scale = 1.5;
  const object = createShapeFormula({ name: 's1', shape, width: 1, height: 1 });
  kit.project.formulas.push(object);
  kit.f.s1 = object;
  const cs = plainClip(kit, 's1', 2, 1, 8, {
    attach: gap === null ? null : createShapeAttach(ca.id, 'all', gap),
  });
  return { kit, ca, cc, cs };
}

const settle = (kit: Kit) => settleScene(kit.project, kit.formulas, refreshLocalRenders);
const clipOf = (settled: Settled, id: string) => settled.project.clips.find((c) => c.id === id)!;
const tweenOf = (settled: Settled, clip: Clip, index = 0) =>
  clipOf(settled, clip.id).actions[index] as TweenAction;
/** The box of `glyphs` of a clip at `t`, as the evaluator has it. */
function glyphsBox(settled: Settled, id: string, t: number, glyphs?: number[]): Box {
  const g = createEvaluator(settled.project, settled.formulas)
    .geometry(t)
    .find((x) => x.clipId === id)!;
  const boxes = glyphs ? glyphs.map((i) => g.glyphs.get(i)!) : [g.box];
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}
const mid = (a: number, b: number) => (a + b) / 2;

describe.each(['ce', 'gl'] as const)('the fit of a tween (%s)', (lib) => {
  it('is the target’s box as it is when the tween starts, the shape’s gap wider all round', async () => {
    const { kit, cc, cs } = await scene('box', 0.2, lib);
    // From 3 s of the scene, to the first two glyphs of "xyz".
    cs.actions.push(createFitTween(2, 1, { clipId: cc.id, glyphs: [0, 1] }));
    expect((cs.actions[0] as TweenAction).fit!.fitted).toBeNull();
    const settled = settle(kit);
    expect(settled.readiness).toEqual({ ready: true, pending: [] });
    const target = glyphsBox(settled, cc.id, 3, [0, 1]);
    const { fitted } = tweenOf(settled, cs).fit!;
    // Mock glyphs are rectangles: every box rule agrees.
    expect(fitted!.width).toBeCloseTo(target.maxX - target.minX + 0.4, 9);
    expect(fitted!.height).toBeCloseTo(target.maxY - target.minY + 0.4, 9);
    expect(fitted!.center[0]).toBeCloseTo(mid(target.minX, target.maxX), 9);
    expect(fitted!.center[1]).toBeCloseTo(mid(target.minY, target.maxY), 9);
    // The shape's own size and place are still those of what it hangs on.
    const own = glyphsBox(settled, cs.id, 1.5);
    const first = glyphsBox(settled, kit.project.clips[0]!.id, 1.5);
    expect(own.minX).toBeCloseTo(first.minX - 0.2, 6);
    expect(deriveAttachments(settled.project, settled.formulas)).toEqual([]);
  });

  it('follows its target: measured again when the target is elsewhere at that instant', async () => {
    const { kit, cc, cs } = await scene('box', 0.2, lib);
    cc.actions.push(createTween(2, 1, { position: [3, 2] }, 'linear'));
    // Starts at 2.5 s of the scene (its clip starts at 1 s): half-way through the target's own
    // move from (2, −1) to (3, 2).
    cs.actions.push(createFitTween(1.5, 1, { clipId: cc.id, glyphs: 'all' }));
    const settled = settle(kit);
    const { fitted } = tweenOf(settled, cs).fit!;
    expect(fitted!.center[0]).toBeCloseTo(2.5, 6);
    expect(fitted!.center[1]).toBeCloseTo(0.5, 6);
    // The target moved for good: one more pass asks for the new fit, and no other.
    const moved = {
      ...settled.project,
      clips: settled.project.clips.map((clip) =>
        clip.id === cc.id ? { ...clip, actions: [] } : clip,
      ),
    };
    const again = deriveAttachments(moved, settled.formulas);
    expect(again.map((p) => [p.clipId, p.actionId])).toEqual([[cs.id, cs.actions[0]!.id]]);
    expect(again[0]!.position[0]).toBeCloseTo(2, 6);
  });

  it('spans the glyphs of several clips, as an attachment does', async () => {
    const { kit, ca, cc, cs } = await scene('box', 0.1, lib);
    cs.actions.push(
      createFitTween(2, 1, { clipId: cc.id, glyphs: [2] }, [{ clipId: ca.id, glyphs: [0] }]),
    );
    const settled = settle(kit);
    const a = glyphsBox(settled, ca.id, 3, [0]);
    const c = glyphsBox(settled, cc.id, 3, [2]);
    const { fitted } = tweenOf(settled, cs).fit!;
    expect(fitted!.width).toBeCloseTo(Math.max(a.maxX, c.maxX) - Math.min(a.minX, c.minX) + 0.2, 9);
    expect(fitted!.height).toBeCloseTo(
      Math.max(a.maxY, c.maxY) - Math.min(a.minY, c.minY) + 0.2,
      9,
    );
  });
});

describe('the gap of a fit', () => {
  it('is the shape’s own, and the one a new shape gets when it hangs on nothing', async () => {
    const box = createShapeFormula({ shape: 'box' });
    const cross = createShapeFormula({ shape: 'cross' });
    expect(fitGap({ attach: createShapeAttach('c1', 'all', 0.35) }, box)).toBe(0.35);
    expect(fitGap({ attach: null }, box)).toBe(0.1);
    expect(fitGap({ attach: null }, cross)).toBe(0);
    // A detached circle: through the corners of the target's box, 0.1 further out.
    const { kit, cc, cs } = await scene('circle', null);
    cs.initial.position = [0, 3];
    cs.actions.push(createFitTween(2, 1, { clipId: cc.id, glyphs: 'all' }));
    const settled = settle(kit);
    const target = glyphsBox(settled, cc.id, 3);
    const { fitted } = tweenOf(settled, cs).fit!;
    const diameter = Math.hypot(target.maxX - target.minX, target.maxY - target.minY) + 0.2;
    expect(fitted).toMatchObject({ width: diameter, height: diameter });
    // An underline hangs the gap below its target; its height is none.
    const line = await scene('underline', 0.3);
    line.cs.actions.push(createFitTween(2, 1, { clipId: line.cc.id, glyphs: 'all' }));
    const under = settle(line.kit);
    const below = glyphsBox(under, line.cc.id, 3);
    expect(tweenOf(under, line.cs).fit!.fitted).toMatchObject({
      height: 0,
      width: below.maxX - below.minX,
    });
    expect(tweenOf(under, line.cs).fit!.fitted!.center[1]).toBeCloseTo(below.minY - 0.3, 6);
  });
});

describe('the states of a clip with a fit', () => {
  it('leave the shape on the fit: unturned, at scale 1, whatever came before; the paint goes on', async () => {
    const { kit, cc, cs } = await scene();
    cs.actions.push(
      createTween(1, 0.5, { scale: 2, rotation: 40, flipX: true, strokeWidth: 9, opacity: 0.5 }),
      // A position in `to` is not the fit's to give: it is ignored.
      createFitTween(2, 1, { clipId: cc.id, glyphs: 'all' }, [], {
        fillOpacity: 0.4,
        position: [9, 9],
        scale: 3,
      }),
      createTween(4, 1, { scale: 1.5 }),
    );
    const settled = settle(kit);
    const clip = clipOf(settled, cs.id);
    const [turned, fitted, grown] = actionStates(clip);
    const box = tweenOf(settled, cs, 1).fit!.fitted!;
    expect(turned!.fit).toBeUndefined();
    expect(fitted!.from).toMatchObject({ scale: 2, rotation: 40, flipX: true });
    expect(fitted!.to).toMatchObject({
      position: box.center,
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      // What it was painted with goes on, and the fit's own appearance is added.
      strokeWidth: 9,
      opacity: 0.5,
      fillOpacity: 0.4,
    });
    // The object's own size until it arrives; the fit's from then on.
    expect(fitted!.fit).toEqual({
      from: null,
      to: { width: box.width, height: box.height },
      after: { width: box.width, height: box.height },
    });
    // A later tween starts from the fit.
    expect(grown!.from).toBe(fitted!.to);
    expect(grown!.to).toMatchObject({ position: box.center, scale: 1.5, rotation: 0 });
  });

  it('chain: a second fit starts from the size of the first; one that comes back gives it back', async () => {
    const { kit, ca, cc, cs } = await scene();
    cs.actions.push(
      createFitTween(1, 1, { clipId: cc.id, glyphs: 'all' }),
      createFitTween(3, 1, { clipId: ca.id, glyphs: [0] }, [], {}, 'there_and_back'),
      createFitTween(5, 1, { clipId: ca.id, glyphs: [2] }),
    );
    const settled = settle(kit);
    const [first, pulse, last] = actionStates(clipOf(settled, cs.id));
    expect(pulse!.fit!.from).toEqual(first!.fit!.to);
    expect(pulse!.fit!.to).not.toEqual(pulse!.fit!.from);
    // There and back: the shape ends where it started, at the size it had.
    expect(pulse!.after).toBe(pulse!.from);
    expect(pulse!.fit!.after).toEqual(first!.fit!.to);
    expect(last!.fit!.from).toEqual(first!.fit!.to);
    expect(last!.from).toBe(first!.to);
  });

  it('a fit not measured yet moves nothing', async () => {
    const { cc, cs } = await scene();
    cs.actions.push(createFitTween(2, 1, { clipId: cc.id, glyphs: 'all' }, [], { opacity: 0.5 }));
    const [state] = actionStates(cs);
    expect(state!.fit).toBeUndefined();
    expect(state!.to.position).toEqual(cs.initial.position);
    expect(state!.to.opacity).toBe(0.5);
  });
});

describe('what a fit depends on', () => {
  it('is placed after its target: a shape carried to a brace that hangs on another clip', async () => {
    const { kit, cc, cs } = await scene();
    kit.project.tracks.push(createTrack('Track 4'));
    const brace = createBraceFormula({ name: 'b1' });
    kit.project.formulas.push(brace);
    kit.f.b1 = brace;
    const cb = plainClip(kit, 'b1', 3, 1, 8, {
      attach: createBraceAttach(cc.id, 'all', { direction: 0, buff: 0.2 }),
    });
    cs.actions.push(createFitTween(2, 1, { clipId: cb.id, glyphs: 'all' }));
    const settled = settle(kit);
    expect(settled.readiness).toEqual({ ready: true, pending: [] });
    const target = glyphsBox(settled, cb.id, 3);
    const { fitted } = tweenOf(settled, cs).fit!;
    expect(fitted!.width).toBeCloseTo(target.maxX - target.minX + 0.4, 6);
    expect(fitted!.center[1]).toBeCloseTo(mid(target.minY, target.maxY), 6);
  });

  it('cannot go round: carried to what hangs on it, neither is placed and validation says so', async () => {
    const { kit, cs } = await scene();
    kit.project.tracks.push(createTrack('Track 4'));
    const brace = createBraceFormula({ name: 'b1' });
    kit.project.formulas.push(brace);
    kit.f.b1 = brace;
    const cb = plainClip(kit, 'b1', 3, 2, 8, {
      attach: createBraceAttach(cs.id, 'all', { direction: 0, buff: 0.2 }),
    });
    cs.actions.push(createFitTween(3, 1, { clipId: cb.id, glyphs: 'all' }));
    const settled = settle(kit);
    expect(tweenOf(settled, cs).fit!.fitted).toBeNull();
    const pending = attachmentReadiness(settled.project, settled.formulas).pending;
    expect(pending.map((p) => [p.clipId, p.reason]).sort()).toEqual(
      [
        [cb.id, 'cycle'],
        [cs.id, 'cycle'],
      ].sort(),
    );
    const cycles = validateProject(settled.project).filter((i) => i.code === 'attach-cycle');
    expect(cycles).toHaveLength(2);
    expect(cycles[0]!.message).toMatch(/goes round/);
  });
});

describe.each(['ce', 'gl'] as const)('a shape carried by a tween, as it is drawn (%s)', (lib) => {
  const grown = (box: Box, by: number): Box => ({
    minX: box.minX - by,
    minY: box.minY - by,
    maxX: box.maxX + by,
    maxY: box.maxY + by,
  });
  const near = (box: Box, expected: Box, digits = 6) => {
    for (const key of ['minX', 'minY', 'maxX', 'maxY'] as const) {
      expect(box[key], key).toBeCloseTo(expected[key], digits);
    }
  };
  const between = (a: Box, b: Box, t: number): Box => ({
    minX: a.minX + (b.minX - a.minX) * t,
    minY: a.minY + (b.minY - a.minY) * t,
    maxX: a.maxX + (b.maxX - a.maxX) * t,
    maxY: a.maxY + (b.maxY - a.maxY) * t,
  });
  /** What is drawn of the shape's clip at `t`: its paths, glyph by glyph. */
  const drawn = (settled: Settled, id: string, t: number) =>
    createEvaluator(settled.project, settled.formulas)
      .evaluate(t)
      .filter((d) => d.clipId === id);

  it('is its own shape until the tween starts, and the fit of the target once it has ended', async () => {
    const { kit, ca, cc, cs } = await scene('box', 0.2, lib);
    // Over [3, 4) of the scene, to the whole of "xyz".
    cs.actions.push(createFitTween(2, 1, { clipId: cc.id, glyphs: 'all' }, [], {}, 'linear'));
    const settled = settle(kit);
    const first = grown(glyphsBox(settled, ca.id, 2), 0.2);
    const second = grown(glyphsBox(settled, cc.id, 3), 0.2);
    near(glyphsBox(settled, cs.id, 2.9), first);
    near(glyphsBox(settled, cs.id, 4), second);
    near(glyphsBox(settled, cs.id, 7), second);
    // What is drawn is the box of that size, where the fit put it.
    const [after, ...rest] = drawn(settled, cs.id, 5);
    expect(rest).toEqual([]);
    expect(after!.path.contours).toHaveLength(1);
    const xs = after!.path.contours[0]!.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeCloseTo(second.minX, 6);
    expect(Math.max(...xs)).toBeCloseTo(second.maxX, 6);
  });

  it('goes point by point from the one to the other while the tween runs', async () => {
    const { kit, ca, cc, cs } = await scene('box', 0.2, lib);
    cs.actions.push(createFitTween(2, 1, { clipId: cc.id, glyphs: 'all' }, [], {}, 'linear'));
    const settled = settle(kit);
    const first = grown(glyphsBox(settled, ca.id, 2), 0.2);
    const second = grown(glyphsBox(settled, cc.id, 3), 0.2);
    // Two boxes, unturned: every point between its two places is the box between the two.
    for (const alpha of [0.25, 0.5, 0.75]) {
      near(glyphsBox(settled, cs.id, 3 + alpha), between(first, second, alpha));
    }
    const start = drawn(settled, cs.id, 2.5)[0]!.path.contours[0]!;
    const end = drawn(settled, cs.id, 5)[0]!.path.contours[0]!;
    const half = drawn(settled, cs.id, 3.5)[0]!.path.contours[0]!;
    expect(half).toHaveLength(start.length);
    half.forEach((value, i) => expect(value).toBeCloseTo((start[i]! + end[i]!) / 2, 9));
  });

  it('starts from the shape as the tweens before left it: turned and scaled, its points cut across', async () => {
    const { kit, cc, cs } = await scene('box', 0.2, lib);
    cs.actions.push(
      createTween(0.5, 0.5, { rotation: 90, scale: 2 }, 'linear'),
      createFitTween(2, 1, { clipId: cc.id, glyphs: 'all' }, [], {}, 'linear'),
    );
    const settled = settle(kit);
    const turned = drawn(settled, cs.id, 2.9)[0]!.path.contours[0]!;
    const arrived = drawn(settled, cs.id, 4.5)[0]!.path.contours[0]!;
    const quarter = drawn(settled, cs.id, 3.25)[0]!.path.contours[0]!;
    quarter.forEach((value, i) =>
      expect(value).toBeCloseTo(turned[i]! + (arrived[i]! - turned[i]!) * 0.25, 9),
    );
    // Arrived, it is the new box, unturned: as wide as the target and the gap.
    const target = glyphsBox(settled, cc.id, 3);
    near(glyphsBox(settled, cs.id, 4.5), grown(target, 0.2));
  });

  it('a circle passes through the circle of the mean radius, not the one around the box between', async () => {
    const { kit, ca, cc, cs } = await scene('circle', 0.1, lib);
    cs.actions.push(createFitTween(2, 1, { clipId: cc.id, glyphs: 'all' }, [], {}, 'linear'));
    const settled = settle(kit);
    const diameterOf = (box: Box) => Math.hypot(box.maxX - box.minX, box.maxY - box.minY) + 0.2;
    const a = diameterOf(glyphsBox(settled, ca.id, 2));
    const b = diameterOf(glyphsBox(settled, cc.id, 3));
    const mid = glyphsBox(settled, cs.id, 3.5);
    expect(mid.maxX - mid.minX).toBeCloseTo((a + b) / 2, 6);
    expect(mid.maxY - mid.minY).toBeCloseTo((a + b) / 2, 6);
  });

  it('a cross carries its two lines, and an underline its one', async () => {
    const cross = await scene('cross', 0, lib);
    cross.cs.actions.push(
      createFitTween(2, 1, { clipId: cross.cc.id, glyphs: 'all' }, [], {}, 'linear'),
    );
    const crossed = settle(cross.kit);
    expect(drawn(crossed, cross.cs.id, 3.5)).toHaveLength(2);
    near(glyphsBox(crossed, cross.cs.id, 4.2), glyphsBox(crossed, cross.cc.id, 3));
    const line = await scene('underline', 0.3, lib);
    line.cs.actions.push(
      createFitTween(2, 1, { clipId: line.cc.id, glyphs: 'all' }, [], {}, 'linear'),
    );
    const under = settle(line.kit);
    const target = glyphsBox(under, line.cc.id, 3);
    const after = glyphsBox(under, line.cs.id, 4.2);
    expect([after.minX, after.maxX]).toEqual([
      expect.closeTo(target.minX, 6),
      expect.closeTo(target.maxX, 6),
    ]);
    expect(after.maxY).toBeCloseTo(target.minY - 0.3, 6);
  });

  it('comes back with an easing that returns, and a later tween starts from the fit', async () => {
    const { kit, ca, cc, cs } = await scene('box', 0.2, lib);
    cs.actions.push(
      createFitTween(1, 1, { clipId: cc.id, glyphs: 'all' }, [], {}, 'there_and_back'),
      createFitTween(3, 1, { clipId: cc.id, glyphs: [0] }, [], {}, 'linear'),
      createTween(5, 1, { position: [0, 0], scale: 2 }, 'linear'),
    );
    const settled = settle(kit);
    const first = grown(glyphsBox(settled, ca.id, 2), 0.2);
    // There and back over [2, 3): away at the middle, home at the end.
    expect(glyphsBox(settled, cs.id, 2.5).minX).toBeGreaterThan(first.minX + 1);
    near(glyphsBox(settled, cs.id, 3.2), first);
    const glyph = grown(glyphsBox(settled, cc.id, 4, [0]), 0.2);
    near(glyphsBox(settled, cs.id, 5.5), glyph);
    // Then a plain tween of that shape: moved to the origin at twice its size.
    const end = glyphsBox(settled, cs.id, 7.5);
    expect(end.maxX - end.minX).toBeCloseTo(2 * (glyph.maxX - glyph.minX), 6);
    expect((end.minX + end.maxX) / 2).toBeCloseTo(0, 6);
  });

  it('keeps its paint on the way, and takes the one the tween brings', async () => {
    const { kit, cc, cs } = await scene('box', 0.2, lib);
    cs.actions.push(
      createTween(0.5, 0.5, { strokeWidth: 10 }, 'linear'),
      createFitTween(2, 1, { clipId: cc.id, glyphs: 'all' }, [], { fillOpacity: 1 }, 'linear'),
    );
    const settled = settle(kit);
    const half = drawn(settled, cs.id, 3.5)[0]!;
    expect(half.stroke!.width).toBe(10);
    expect(half.fill!.opacity).toBeCloseTo(0.5, 9);
    expect(drawn(settled, cs.id, 5)[0]!.fill!.opacity).toBe(1);
  });

  it('is measured where it is: a brace made on it afterwards hangs under the new place', async () => {
    const { kit, cc, cs } = await scene('box', 0.2, lib);
    kit.project.tracks.push(createTrack('Track 4'));
    cs.actions.push(createFitTween(2, 1, { clipId: cc.id, glyphs: 'all' }));
    const brace = createBraceFormula({ name: 'b1' });
    kit.project.formulas.push(brace);
    kit.f.b1 = brace;
    const cb = plainClip(kit, 'b1', 3, 5, 8, {
      attach: createBraceAttach(cs.id, 'all', { direction: 0, buff: 0.25 }),
    });
    const settled = settle(kit);
    expect(settled.readiness).toEqual({ ready: true, pending: [] });
    const box = grown(glyphsBox(settled, cc.id, 3), 0.2);
    const under = glyphsBox(settled, cb.id, 6);
    expect(under.maxY).toBeCloseTo(box.minY - 0.25, 6);
    expect(under.maxX - under.minX).toBeCloseTo(box.maxX - box.minX, 6);
    expect((under.minX + under.maxX) / 2).toBeCloseTo((box.minX + box.maxX) / 2, 6);
  });
});
