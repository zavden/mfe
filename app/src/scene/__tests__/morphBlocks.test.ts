// @vitest-environment node
/* Morph blocks in the evaluator: a glyph transfer whose two clips are one clip (model/transfers.ts)
 * plays through the same code as a relation's (docs/ARCHITECTURE.md §5, "Relations in Manim").
 * What is checked here is what changes when both sides are glyphs of one formula: which glyphs are
 * drawn before, during and after the window, the keys of the pieces, continuity at both ends, the
 * depth, chains of morphs and purity. The morph looks themselves are pinned against Manim in
 * manim-morph.test.ts.
 *
 * The mock engine lays every token out in one row (and would draw `\\` as a glyph), so the owner's
 * `A &= x_1 \\ &= x_2 \\ &= x_3` is written here as `A=x_1=x_2=x_3`: the same ten glyphs in the
 * same order, A = x 1 = x 2 = x 3 — "row" 1 is 1–3, row 2 is 4–6, row 3 is 7–9. */
import { describe, expect, it } from 'vitest';
import { boxCenter, contoursBox, type Vec2 } from '../../geom';
import {
  createClip,
  createMorph,
  createTween,
  defaultIntro,
  defaultOutro,
  validateProject,
  type ClipAction,
  type GlyphPair,
  type Project,
  type RelationStyle,
} from '../../model';
import { createEvaluator, rateFunction, type Drawable, type SceneEvaluator } from '../index';
import { byKey, centerOf, plainClip, sceneWith, expectReverseReplay } from './sceneKit';

const errors = (project: Project) => validateProject(project).filter((i) => i.severity === 'error');

const EPS = 1e-4;

/** Pairs of single glyphs, `[from, to]`, with the block's style. */
const pairs = (...list: [number, number][]): GlyphPair[] =>
  list.map(([from, to]) => ({ from: [from], to: [to], style: null }));

/** The derivation on the back track (index 1) of a two-track project, 0–6 s, with a FadeIn intro
 * over [0, 1) and the subscripts 2 and 3 hidden; `actions` are its blocks. */
async function derivation(actions: ClipAction[]) {
  const scene = await sceneWith({ f: 'A=x_1=x_2=x_3' });
  scene.f.f!.hiddenGlyphs = [6, 9];
  const clip = plainClip(scene, 'f', 1, 0, 6, {
    intro: { ...defaultIntro('fade_in'), duration: 1 },
    actions,
  });
  expect(errors(scene.project)).toEqual([]);
  const ev = createEvaluator(scene.project, scene.formulas);
  const key = (g: number) => `${clip.id}:${g}`;
  return { scene, clip, ev, key };
}

/** "= x" of row 1 into row 2 during [2, 3), linear, in `style`. */
function firstMorph(style: RelationStyle, fields: Parameters<typeof createMorph>[1] = {}) {
  return createMorph(2, { style, easing: 'linear', pairs: pairs([1, 4], [2, 5]), ...fields });
}

/** Where glyph `g` of the clip sits at `t`, drawn or not. */
function placeOf(ev: SceneEvaluator, clipId: string, g: number, t: number): Vec2 {
  const geometry = ev.geometry(t).find((c) => c.clipId === clipId)!;
  return boxCenter(geometry.glyphs.get(g)!);
}

function expectNear(a: Vec2, b: Vec2, digits = 3) {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
}

const keysAt = (ev: SceneEvaluator, t: number) => ev.evaluate(t).map((d) => d.key);

describe('morph blocks in the evaluator', () => {
  it('leaves its targets out of the intro and draws none of them before the window', async () => {
    const { ev, clip, key } = await derivation([firstMorph('copy')]);
    const intro = ev.events.find((e) => e.kind === 'intro' && e.clipId === clip.id);
    expect(intro?.kind === 'intro' && intro.except).toEqual([4, 5, 6, 9]);
    const transfer = ev.events.find((e) => e.kind === 'transfer');
    expect(transfer).toMatchObject({ fromClipId: clip.id, toClipId: clip.id, start: 2, end: 3 });
    for (const t of [0, 0.5, 1, 1.5, 2 - EPS]) {
      const keys = keysAt(ev, t);
      expect(keys.includes(key(4)) || keys.includes(key(5)), `t=${t}`).toBe(false);
      // The intro brings the rest (glyph 0 fades in from t = 0).
      if (t > 0) expect(keys).toEqual(expect.arrayContaining([0, 1, 2, 3, 7, 8].map(key)));
    }
  });

  it('copy: the pieces carry the target keys and the source stays where it is', async () => {
    const { ev, clip, key } = await derivation([firstMorph('copy')]);
    const mid = byKey(ev.evaluate(2.5));
    for (const [src, dst] of [
      [1, 4],
      [2, 5],
    ] as const) {
      expectNear(centerOf(mid.get(key(src))!), placeOf(ev, clip.id, src, 2.5), 9);
      expect(mid.get(key(src))!.fill!.opacity).toBe(1);
      // The copy is halfway between the source and its target (linear, no path arc).
      const from = placeOf(ev, clip.id, src, 2);
      const to = placeOf(ev, clip.id, dst, 3);
      expectNear(centerOf(mid.get(key(dst))!), [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
    }
    // After the window the targets are drawn plainly and the sources are still there.
    for (const t of [3, 4, 6]) {
      const drawn = byKey(ev.evaluate(t));
      for (const g of [1, 2, 4, 5]) {
        expect(drawn.has(key(g)), `t=${t} glyph ${g}`).toBe(true);
        expectNear(centerOf(drawn.get(key(g))!), placeOf(ev, clip.id, g, t), 9);
      }
    }
  });

  it('transform: the pieces carry the source keys and the source is gone for good', async () => {
    const { ev, clip, key } = await derivation([firstMorph('transform')]);
    const mid = ev.evaluate(2.5);
    // One drawable per source (its piece), none for the targets.
    expect(mid.filter((d) => d.key === key(1))).toHaveLength(1);
    expect(mid.some((d) => d.key === key(4) || d.key === key(5))).toBe(false);
    const from = placeOf(ev, clip.id, 1, 2);
    const to = placeOf(ev, clip.id, 4, 3);
    expectNear(centerOf(byKey(mid).get(key(1))!), [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
    for (const t of [3, 4.5, 6]) {
      const keys = keysAt(ev, t);
      expect(keys.includes(key(1)) || keys.includes(key(2)), `t=${t}`).toBe(false);
      expect(keys).toEqual(expect.arrayContaining([key(4), key(5)]));
    }
  });

  it('fade: the source fades out and the target fades in, under their own keys', async () => {
    const { ev, key } = await derivation([firstMorph('fade')]);
    const mid = byKey(ev.evaluate(2.5));
    expect(mid.get(key(1))!.fill!.opacity).toBeCloseTo(0.5, 9);
    expect(mid.get(key(4))!.fill!.opacity).toBeCloseTo(0.5, 9);
    expect(byKey(ev.evaluate(3.5)).has(key(1))).toBe(false);
    expect(byKey(ev.evaluate(3.5)).get(key(4))!.fill!.opacity).toBe(1);
  });

  it.each(['copy', 'transform', 'fade'] as const)(
    'is continuous at both ends of the window (%s), after a tween moved the formula',
    async (style) => {
      // The tween moves the whole formula before the window: the targets, off screen, move along.
      const { ev, key } = await derivation([
        createTween(1.2, 0.5, { position: [1, -0.5], scale: 1.2 }),
        firstMorph(style, { easing: 'smooth' }),
      ]);
      const boxes = (t: number) =>
        new Map(ev.evaluate(t).map((d) => [d.key, contoursBox(d.path.contours)]));
      const near = (a: ReturnType<typeof contoursBox>, b: ReturnType<typeof contoursBox>) => {
        for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) {
          expect(a[k]).toBeCloseTo(b[k], 3);
        }
      };
      // Start: every glyph drawn before is drawn at the same place after; what the window adds
      // (copies, a fade's targets at no opacity) sits on its source.
      const before = boxes(2 - EPS);
      const start = boxes(2 + EPS);
      for (const [k, box] of before) near(start.get(k)!, box);
      if (style === 'copy') {
        near(start.get(key(4))!, before.get(key(1))!);
        near(start.get(key(5))!, before.get(key(2))!);
      }
      // End: what the window leaves drawn is where the plain glyphs are drawn afterwards.
      const late = boxes(3 - EPS);
      const after = boxes(3);
      const pieceOf = (dst: number) => (style === 'transform' ? key(dst - 3) : key(dst));
      for (const dst of [4, 5]) near(late.get(pieceOf(dst))!, after.get(key(dst))!);
      for (const k of [0, 3, 7, 8].map(key)) near(late.get(k)!, after.get(k)!);
      if (style === 'copy') for (const k of [1, 2].map(key)) near(late.get(k)!, after.get(k)!);
      else expect(after.has(key(1)) || after.has(key(2))).toBe(false);
    },
  );

  it("draws the pieces at the clip's depth, behind a clip on a front track", async () => {
    const scene = await sceneWith({ f: 'A=x_1=x_2=x_3', g: 'y=2' });
    const back = plainClip(scene, 'f', 1, 0, 6, { actions: [firstMorph('copy')] });
    const front = plainClip(scene, 'g', 0, 0, 6);
    expect(errors(scene.project)).toEqual([]);
    const ev = createEvaluator(scene.project, scene.formulas);
    const drawn = ev.evaluate(2.5);
    const depth = (clipId: string) =>
      new Set(drawn.filter((d) => d.clipId === clipId).map((d) => d.z));
    expect(depth(back.id)).toEqual(new Set([0]));
    expect(depth(front.id)).toEqual(new Set([1]));
    // Every glyph but the two targets, and the two copies.
    expect(drawn.filter((d) => d.clipId === back.id)).toHaveLength(10 - 2 + 2);
    // Back to front: the derivation's glyphs and pieces first.
    const firstFront = drawn.findIndex((d) => d.clipId === front.id);
    expect(drawn.slice(firstFront).every((d) => d.clipId === front.id)).toBe(true);
  });

  it('chains: row 1 → row 2, then row 2 → row 3', async () => {
    const { ev, clip, key } = await derivation([
      firstMorph('copy'), // [2, 3)
      createMorph(3, { easing: 'linear', pairs: pairs([4, 7], [5, 8]) }), // [3, 4)
    ]);
    const intro = ev.events.find((e) => e.kind === 'intro');
    expect(intro?.kind === 'intro' && intro.except).toEqual([4, 5, 6, 7, 8, 9]);
    // Before the second window, row 3 is not drawn.
    for (const t of [1, 2.5, 3 - EPS]) {
      expect(
        keysAt(ev, t).some((k) => k === key(7) || k === key(8)),
        `t=${t}`,
      ).toBe(false);
    }
    // At 3 the first morph has delivered row 2, which is the second one's source.
    const second = byKey(ev.evaluate(3.5));
    for (const [src, dst] of [
      [4, 7],
      [5, 8],
    ] as const) {
      expectNear(centerOf(second.get(key(src))!), placeOf(ev, clip.id, src, 3.5), 9);
      const from = placeOf(ev, clip.id, src, 3);
      const to = placeOf(ev, clip.id, dst, 4);
      expectNear(centerOf(second.get(key(dst))!), [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
    }
    // The first morph's pieces end on row 2, where the second morph's sources start.
    const late = byKey(ev.evaluate(3 - EPS));
    const start = byKey(ev.evaluate(3 + EPS));
    expectNear(centerOf(late.get(key(4))!), centerOf(start.get(key(4))!));
    expectNear(centerOf(start.get(key(7))!), centerOf(start.get(key(4))!));
    // Afterwards the three rows are drawn plainly.
    expect(keysAt(ev, 4.5).sort()).toEqual([0, 1, 2, 3, 4, 5, 7, 8].map(key).sort());
    // One drawable per key at every instant.
    for (let t = 0; t <= ev.duration + 1e-9; t += 0.05) {
      const keys = keysAt(ev, t);
      expect(new Set(keys).size, `t=${t}`).toBe(keys.length);
    }
  });

  it('follows the block easing', async () => {
    const { ev, clip, key } = await derivation([firstMorph('copy', { easing: 'smooth' })]);
    const x0 = placeOf(ev, clip.id, 1, 2)[0];
    const x1 = placeOf(ev, clip.id, 4, 3)[0];
    const x = centerOf(byKey(ev.evaluate(2.25)).get(key(4))!)[0];
    expect((x - x0) / (x1 - x0)).toBeCloseTo(rateFunction('smooth', 'ce')(0.25), 3);
  });

  it('is pure: the same time gives the same drawables, whatever was evaluated before', async () => {
    const { scene, ev } = await derivation([
      firstMorph('transform'),
      createMorph(3.2, { pairs: pairs([5, 8]), pathArc: 60 }),
    ]);
    const times = [0, 2.2, 2.5, 3, 3.6, 4.1, 6, 2.5, 0.5, 3.6];
    expectReverseReplay(ev, () => createEvaluator(scene.project, scene.formulas), times);
  });

  it('a morph during the outro: the consumed source leaves through the pair, the target with the clip', async () => {
    const scene = await sceneWith({ f: 'A=x_1=x_2=x_3' });
    const clip = createClip(scene.f.f!.id, scene.project.tracks[0]!.id, 0, 4, {
      intro: defaultIntro('none'),
      outro: { ...defaultOutro('fade_out'), duration: 1 },
      // Starts after the outro has: the target arrives during it and leaves with the clip end.
      actions: [createMorph(3.2, { duration: 0.8, style: 'transform', pairs: pairs([1, 4]) })],
    });
    scene.project.clips.push(clip);
    expect(errors(scene.project)).toEqual([]);
    const ev = createEvaluator(scene.project, scene.formulas);
    const outro = ev.events.find((e) => e.kind === 'outro');
    expect(outro?.kind === 'outro' && outro.except).toEqual([1, 4]);
    const mid: Drawable[] = ev.evaluate(3.5).filter((d) => d.key === `${clip.id}:1`);
    expect(mid).toHaveLength(1); // the piece, fully opaque, not faded by the outro
    expect(mid[0]!.fill!.opacity).toBe(1);
    expect(keysAt(ev, 4)).not.toContain(`${clip.id}:1`);
  });
});
