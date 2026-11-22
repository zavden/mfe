// @vitest-environment node
/* Relations in the evaluator: the morph drawn between a source and a target clip (the Manim
 * numbers themselves are in manim-morph.test.ts), the lifetime of the glyphs around it, purity,
 * and the example projects. */
import { describe, expect, it } from 'vitest';
import { resolveFormula, toSnapshot } from '../../engine';
import {
  createRelation,
  parseProject,
  sceneDuration,
  validateProject,
  type PathSpline,
  type Project,
  type Relation,
  type RelationStyle,
  type Target,
} from '../../model';
import { straightSpline } from '../../geom';
import { readExample } from '../../test/examples';
import { createEvaluator, rateFunction, type Drawable } from '../index';
import { byKey, centerOf, mockRender, plainClip, sceneWith, expectReverseReplay } from './sceneKit';

/** a+b=c on track 1 (clip A, 0–6) and x=y on track 2 (clip B, 1–6): the window is [2, 3). */
async function twoClips(
  pairs: Relation['pairs'],
  fields: Partial<Relation> = {},
  target: Target = 'ce',
) {
  const scene = await sceneWith({ a: 'a+b=c', b: 'xy=z' }, target);
  const a = plainClip(scene, 'a', 0, 0, 6);
  const b = plainClip(scene, 'b', 1, 1, 6);
  const relation = createRelation(a.id, b.id, {
    offset: 1,
    duration: 1,
    easing: 'linear',
    pairs,
    ...fields,
  });
  scene.project.relations.push(relation);
  expect(validateProject(scene.project).filter((i) => i.severity === 'error')).toEqual([]);
  return { scene, a, b, relation, ev: createEvaluator(scene.project, scene.formulas) };
}

const flat = (d: Drawable) => d.path.contours.flat();

describe('relation morphs in the evaluator', () => {
  it("starts as the source glyph and ends as the target glyph, in their clips' own poses", async () => {
    const { scene, a, b } = await twoClips([{ from: [0], to: [1], style: 'transform' }]);
    // Pose the clips: A scaled and shifted, B elsewhere (static, so valid inside the window).
    a.initial = { ...a.initial, scale: 2, position: [-3, 1] };
    b.initial = { ...b.initial, position: [2, -1], color: '#FF0000' };
    const posed = createEvaluator(scene.project, scene.formulas);
    const plainA = byKey(posed.evaluate(1.9)).get(`${a.id}:0`)!;
    const plainB = byKey(posed.evaluate(3.1)).get(`${b.id}:1`)!;
    // Just inside the window the piece is the source; just before its end it is the target.
    const early = posed.evaluate(2 + 1e-4).find((d) => d.key === `${a.id}:0`)!;
    const late = posed.evaluate(3 - 1e-4).find((d) => d.key === `${a.id}:0`)!;
    centerOf(early).forEach((v, k) => expect(v).toBeCloseTo(centerOf(plainA)[k]!, 2));
    centerOf(late).forEach((v, k) => expect(v).toBeCloseTo(centerOf(plainB)[k]!, 2));
    expect(late.fill!.color).toBe('#FF0000');
    expect(early.fill!.color).toBe('#FFFFFF');
    // Halfway the colour is the blend and the glyph is between the two.
    const mid = posed.evaluate(2.5).find((d) => d.key === `${a.id}:0`)!;
    expect(mid.fill!.color).toBe('#FF8080');
    centerOf(mid).forEach((v, k) =>
      expect(v).toBeCloseTo((centerOf(plainA)[k]! + centerOf(plainB)[k]!) / 2, 1),
    );
  });

  it('is continuous with the plain drawing on both sides of the window', async () => {
    const { a, b, ev } = await twoClips([
      { from: [0, 1], to: [0], style: 'transform' },
      { from: [4], to: [1], style: 'copy' },
    ]);
    const near = (u: Drawable[], v: Drawable[]) => {
      const m = byKey(v);
      for (const d of u) {
        const o = m.get(d.key);
        expect(o, d.key).toBeDefined();
        centerOf(d).forEach((x, k) => expect(x).toBeCloseTo(centerOf(o!)[k]!, 2));
      }
    };
    // Target glyph 0 and copy target 1 (and every untouched glyph) arrive where they stay.
    const before = ev.evaluate(3 - 1e-4).filter((d) => d.clipId === b.id || d.key.startsWith(a.id));
    const after = ev.evaluate(3);
    const bKeys = new Set(after.filter((d) => d.clipId === b.id).map((d) => d.key));
    near(
      before.filter((d) => bKeys.has(d.key)),
      after,
    );
    expect(bKeys.has(`${b.id}:0`)).toBe(true);
    expect(bKeys.has(`${b.id}:1`)).toBe(true);
  });

  it('draws each piece once: keys are unique at every instant', async () => {
    const { ev } = await twoClips([
      { from: [0], to: [0, 1], style: 'transform' }, // split
      { from: [2, 3, 4], to: [2], style: 'fade' }, // merge by fade
    ]);
    for (let t = 0; t <= ev.duration; t += 0.05) {
      const keys = ev.evaluate(t).map((d) => d.key);
      expect(new Set(keys).size, `t=${t}`).toBe(keys.length);
    }
  });

  it('splits and merges: the glyph that has no partner flies to the same place and fades', async () => {
    const { a, b, ev } = await twoClips([
      { from: [0, 1], to: [0], style: 'transform', extras: 'merge' },
    ]);
    // 2 → 1: glyph 1 of A is paired with an invisible copy of target glyph 0.
    const start = byKey(ev.evaluate(2 + 1e-4));
    expect(start.get(`${a.id}:0`)!.fill!.opacity).toBeCloseTo(1, 3);
    expect(start.get(`${a.id}:1`)!.fill!.opacity).toBeCloseTo(1, 3);
    const mid = byKey(ev.evaluate(2.5));
    expect(mid.get(`${a.id}:0`)!.fill!.opacity).toBeCloseTo(1, 6);
    expect(mid.get(`${a.id}:1`)!.fill!.opacity).toBeCloseTo(0.5, 6);
    const end = ev.evaluate(3 - 1e-4);
    expect(end.find((d) => d.key === `${a.id}:1`)!.fill!.opacity).toBeLessThan(1e-3);
    // Both end on the target glyph's place.
    const target = byKey(ev.evaluate(3)).get(`${b.id}:0`)!;
    for (const key of [`${a.id}:0`, `${a.id}:1`]) {
      const d = end.find((x) => x.key === key)!;
      centerOf(d).forEach((v, k) => expect(v).toBeCloseTo(centerOf(target)[k]!, 2));
    }
  });

  it('several sources arrive separately by default: each flies to the target, none fades', async () => {
    const { a, b, ev } = await twoClips([{ from: [0, 1], to: [0], style: 'transform' }]);
    const mid = byKey(ev.evaluate(2.5));
    expect(mid.get(`${a.id}:0`)!.fill!.opacity).toBeCloseTo(1, 6);
    expect(mid.get(`${a.id}:1`)!.fill!.opacity).toBeCloseTo(1, 6);
    const end = byKey(ev.evaluate(3 - 1e-4));
    const target = byKey(ev.evaluate(3)).get(`${b.id}:0`)!;
    for (const key of [`${a.id}:0`, `${a.id}:1`]) {
      expect(end.get(key)!.fill!.opacity).toBeCloseTo(1, 3);
      centerOf(end.get(key)!).forEach((v, k) => expect(v).toBeCloseTo(centerOf(target)[k]!, 2));
    }
    // Both sources are consumed: after the window only the target remains.
    const after = ev.evaluate(3.5).map((d) => d.key);
    expect(after).not.toContain(`${a.id}:0`);
    expect(after).not.toContain(`${a.id}:1`);
    expect(after).toContain(`${b.id}:0`);
  });

  it('with copies, the first source transforms and the others send a copy and stay', async () => {
    const { a, b, ev } = await twoClips([
      { from: [1, 0], to: [0], style: 'transform', extras: 'copies' },
    ]);
    const mid = byKey(ev.evaluate(2.5));
    // Glyph 0 (the lowest index) is in transit; glyph 1 stays in place while its copy travels
    // under the target's key.
    expect(mid.has(`${a.id}:0`)).toBe(true);
    expect(mid.get(`${a.id}:1`)!.fill!.opacity).toBe(1);
    expect(centerOf(mid.get(`${a.id}:1`)!)).toEqual(
      centerOf(byKey(ev.evaluate(1.9)).get(`${a.id}:1`)!),
    );
    expect(mid.has(`${b.id}:0`)).toBe(true);
    const after = ev.evaluate(3.5).map((d) => d.key);
    expect(after).not.toContain(`${a.id}:0`);
    expect(after).toContain(`${a.id}:1`);
    expect(after).toContain(`${b.id}:0`);
  });

  it('a copy leaves its source in place and is drawn under the target key', async () => {
    const { a, b, ev } = await twoClips([{ from: [0], to: [0], style: 'copy' }]);
    const mid = byKey(ev.evaluate(2.5));
    expect(mid.has(`${a.id}:0`)).toBe(true);
    expect(mid.get(`${a.id}:0`)!.fill!.opacity).toBe(1);
    expect(mid.has(`${b.id}:0`)).toBe(true); // the copy, in transit
    const srcPlain = byKey(ev.evaluate(1.9)).get(`${a.id}:0`)!;
    expect(centerOf(mid.get(`${a.id}:0`)!)).toEqual(centerOf(srcPlain));
    // After the window the source is still there (nothing consumed it), the target is plain.
    const after = byKey(ev.evaluate(4));
    expect(after.has(`${a.id}:0`)).toBe(true);
    expect(after.has(`${b.id}:0`)).toBe(true);
  });

  it('consumed sources are gone after the window and targets are not drawn before it', async () => {
    const { a, b, ev } = await twoClips([{ from: [0], to: [0], style: 'transform' }]);
    expect(byKey(ev.evaluate(1.5)).has(`${b.id}:0`)).toBe(false);
    expect(byKey(ev.evaluate(1.5)).has(`${a.id}:0`)).toBe(true);
    expect(byKey(ev.evaluate(3.5)).has(`${a.id}:0`)).toBe(false);
    expect(byKey(ev.evaluate(3.5)).has(`${b.id}:0`)).toBe(true);
  });

  it('fade transform draws the source and the target at once, cross-fading', async () => {
    const { a, b, ev } = await twoClips([{ from: [0], to: [0], style: 'fade' }]);
    const mid = byKey(ev.evaluate(2.5));
    expect(mid.get(`${a.id}:0`)!.fill!.opacity).toBeCloseTo(0.5, 6);
    expect(mid.get(`${b.id}:0`)!.fill!.opacity).toBeCloseTo(0.5, 6);
    const start = byKey(ev.evaluate(2 + 1e-5));
    expect(start.get(`${a.id}:0`)!.fill!.opacity).toBeCloseTo(1, 3);
    expect(start.get(`${b.id}:0`)!.fill!.opacity).toBeCloseTo(0, 3);
  });

  it('path_arc bends the path: the middle leaves the straight line, the ends stay', async () => {
    const make = async (pathArc: number) => {
      const r = await twoClips([{ from: [0], to: [0], style: 'transform' }], { pathArc });
      r.b.initial = { ...r.b.initial, position: [3, -1] };
      return { ...r, ev: createEvaluator(r.scene.project, r.scene.formulas) };
    };
    const straight = await make(0);
    const arc = await make(90);
    const at = (r: typeof straight, t: number) =>
      centerOf(r.ev.evaluate(t).find((d) => d.key === `${r.a.id}:0`)!);
    const mid = [at(straight, 2.5), at(arc, 2.5)] as const;
    expect(Math.hypot(mid[0][0] - mid[1][0], mid[0][1] - mid[1][1])).toBeGreaterThan(0.5);
    for (const t of [2 + 1e-4, 3 - 1e-4]) {
      at(straight, t).forEach((v, k) => expect(v).toBeCloseTo(at(arc, t)[k]!, 2));
    }
  });

  it('a custom path bends the glyph off the straight line and the arc is ignored', async () => {
    const bump: PathSpline = {
      nodes: [
        { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
        { at: [1, 0], in: [0.7, 0.4], out: null, smooth: false },
      ],
    };
    const make = async (pair: Relation['pairs'][number], pathArc: number) => {
      const r = await twoClips([pair], { pathArc });
      r.b.initial = { ...r.b.initial, position: [3, -1] };
      return { ...r, ev: createEvaluator(r.scene.project, r.scene.formulas) };
    };
    const plain = { from: [0], to: [0], style: 'transform' as const };
    const straight = await make(plain, 0);
    const curved = await make({ ...plain, path: bump }, 0);
    const curvedArc = await make({ ...plain, path: bump }, 90);
    const chordOnly = await make({ ...plain, path: straightSpline() }, 90);
    const at = (r: typeof straight, t: number) =>
      centerOf(r.ev.evaluate(t).find((d) => d.key === `${r.a.id}:0`)!);
    const [s, c] = [at(straight, 2.5), at(curved, 2.5)];
    expect(Math.hypot(s[0] - c[0], s[1] - c[1])).toBeGreaterThan(0.5);
    // The shift is to the left of the chord (v > 0): above a chord that runs right and down.
    const [x0, y0] = at(straight, 2 + 1e-4);
    const [x1, y1] = at(straight, 3 - 1e-4);
    expect((c[0] - s[0]) * (y1 - y0) - (c[1] - s[1]) * (x1 - x0)).toBeLessThan(0);
    for (const t of [2 + 1e-4, 2.5, 3 - 1e-4]) {
      at(curved, t).forEach((v, k) => expect(v).toBeCloseTo(at(curvedArc, t)[k]!, 6));
      at(straight, t).forEach((v, k) => expect(v).toBeCloseTo(at(chordOnly, t)[k]!, 6));
    }
    for (const t of [2 + 1e-4, 3 - 1e-4]) {
      at(straight, t).forEach((v, k) => expect(v).toBeCloseTo(at(curved, t)[k]!, 2));
    }
  });

  it.each(['ce', 'gl'] as const)('the relation easing shapes the window (%s)', async (target) => {
    const linear = await twoClips([{ from: [0], to: [0], style: 'transform' }], {}, target);
    const smooth = await twoClips(
      [{ from: [0], to: [0], style: 'transform' }],
      { easing: 'smooth' },
      target,
    );
    const at = (r: Awaited<ReturnType<typeof twoClips>>, t: number) =>
      centerOf(r.ev.evaluate(t).find((d) => d.key === `${r.a.id}:0`)!)[0];
    const x0 = at(linear, 2 + 1e-4);
    const x1 = at(linear, 3 - 1e-4);
    const frac = (x: number) => (x - x0) / (x1 - x0);
    expect(frac(at(linear, 2.25))).toBeCloseTo(0.25, 2);
    expect(frac(at(smooth, 2.25))).toBeCloseTo(rateFunction('smooth', target)(0.25), 2);
  });

  it('is pure: the same time gives the same drawables, whatever was evaluated before', async () => {
    const { scene, ev } = await twoClips([
      { from: [0, 1], to: [0, 1, 2], style: 'transform' },
      { from: [4], to: [3], style: 'copy' },
    ]);
    const times = [0, 2.2, 2.5, 2.9, 3, 4, 6, 2.5, 0.5, 2.2];
    expectReverseReplay(ev, () => createEvaluator(scene.project, scene.formulas), times);
  });

  it('falls back to a plain cross-fade when a clip of the relation is not drawn', async () => {
    const { scene, a, b } = await twoClips([{ from: [0], to: [0], style: 'transform' }]);
    scene.project.tracks[0]!.hidden = true; // the source's track
    const ev = createEvaluator(scene.project, scene.formulas);
    const mid = byKey(ev.evaluate(2.5));
    expect([...mid.keys()].some((k) => k.startsWith(a.id))).toBe(false);
    expect(mid.get(`${b.id}:0`)!.fill!.opacity).toBeCloseTo(0.5, 6);
  });

  it('keeps the evaluator cheap: hundreds of glyphs per frame', async () => {
    const latex = 'a+b=c+d=e+f=g+h=i+j=k+l=m+n=o+p=q+r=s+t=u+v=w+x=y+z'.repeat(2);
    const scene = await sceneWith({ a: latex, b: latex.split('').reverse().join('') });
    const a = plainClip(scene, 'a', 0, 0, 6);
    const b = plainClip(scene, 'b', 1, 0, 6);
    const count = scene.formulas.get(scene.f.a!.id)!.render.glyphs.length;
    const pairs = Array.from({ length: count }, (_, i) => ({
      from: [i],
      to: [count - 1 - i],
      style: null,
    }));
    scene.project.relations.push(createRelation(a.id, b.id, { offset: 1, duration: 3, pairs }));
    const built = performance.now();
    const ev = createEvaluator(scene.project, scene.formulas);
    const buildMs = performance.now() - built;
    const start = performance.now();
    for (let k = 0; k < 120; k++) ev.evaluate(1 + (k / 120) * 3);
    const perFrame = (performance.now() - start) / 120;
    expect(count).toBeGreaterThan(80);
    expect(buildMs).toBeLessThan(1500);
    expect(perFrame).toBeLessThan(8);
  });
});

async function evaluatorFor(name: string) {
  const parsed = parseProject(readExample(name));
  if (!parsed.ok) throw new Error(parsed.error);
  const project: Project = parsed.project;
  const formulas = new Map();
  for (const formula of project.formulas) {
    // The mock engine lays out its own glyphs: take the snapshot from them (the example's
    // snapshot comes from MathJax), the order of tokens is the same.
    const render = await mockRender(formula.source, project.meta.target);
    formula.snapshot = toSnapshot(render);
    formulas.set(formula.id, resolveFormula(formula, render));
  }
  return { project, ev: createEvaluator(project, formulas) };
}

describe('the example projects', () => {
  it('hello: mx+y=0 becomes mx=-y, glyph by glyph, with the leftover 0 fading out', async () => {
    const { project, ev } = await evaluatorFor('hello.mfe.json');
    const [a, b] = project.clips;
    const relation = project.relations[0]!;
    expect(validateProject(project).filter((i) => i.severity === 'error')).toEqual([]);
    // Window [2, 3): everything of `a1` but the 0 (glyph 5) is in transit, drawn under the keys
    // of the sources; the 0 fades with the clip's outro.
    const mid = byKey(ev.evaluate(2.5));
    for (const g of [0, 1, 2, 3, 4]) expect(mid.has(`${a!.id}:${g}`), `source ${g}`).toBe(true);
    expect(mid.get(`${a!.id}:5`)!.fill!.opacity).toBeCloseTo(0.5, 2);
    for (const g of [0, 1, 2, 3, 4]) expect(mid.has(`${b!.id}:${g}`), `target ${g}`).toBe(false);
    // After the window only f2 is on screen (its own glyphs, placed by its tween).
    const after = ev.evaluate(3.2);
    expect(after.filter((d) => d.clipId === a!.id)).toHaveLength(0);
    expect(new Set(after.map((d) => d.glyph))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(relation.pairs).toHaveLength(4);
  });

  it('one-to-many: three copies leave a+b=c and f1 stays whole until its outro', async () => {
    const { project, ev } = await evaluatorFor('one-to-many.mfe.json');
    const [f1] = project.clips;
    expect(sceneDuration(project)).toBeGreaterThan(5);
    // Windows [1.5, 2.5), [2.5, 3.5), [3.5, 4.5): every source glyph stays through them.
    for (const t of [1.7, 2.7, 3.7, 4.7]) {
      const drawn = byKey(ev.evaluate(t));
      for (const g of [0, 1, 2, 3, 4])
        expect(drawn.has(`${f1!.id}:${g}`), `t=${t} glyph ${g}`).toBe(true);
    }
    // At 2.0 a copy of `a` is in transit under f2's key, and f2's other glyphs fade in.
    const mid = byKey(ev.evaluate(2.0));
    const f2 = project.clips[1]!;
    expect(mid.has(`${f2.id}:0`)).toBe(true);
    const copy = mid.get(`${f2.id}:0`)!;
    const src = mid.get(`${f1!.id}:0`)!;
    expect(centerOf(copy)[1]).toBeLessThan(centerOf(src)[1]); // on its way down
    // Whole scene: no glyph is ever drawn twice.
    for (let t = 0; t <= ev.duration; t += 1 / 30) {
      const keys = ev.evaluate(t).map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('styles', () => {
  const styles: RelationStyle[] = ['transform', 'copy', 'fade'];
  it.each(styles)('%s: nothing is drawn twice and nothing is left behind', async (style) => {
    const { ev, a, b } = await twoClips([{ from: [0, 1], to: [0, 1], style }]);
    for (let t = 0; t <= ev.duration; t += 0.1) {
      const drawn = ev.evaluate(t);
      const keys = drawn.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const d of drawn) expect(flat(d).every(Number.isFinite)).toBe(true);
    }
    // After the window a consuming style removed the source, a copy kept it.
    const after = byKey(ev.evaluate(4));
    expect(after.has(`${a.id}:0`)).toBe(style === 'copy');
    expect(after.has(`${b.id}:0`)).toBe(true);
  });
});
