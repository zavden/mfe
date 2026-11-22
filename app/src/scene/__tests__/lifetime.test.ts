// @vitest-environment node
/* Glyph lifetime (docs/ARCHITECTURE.md §5): appearance through an incoming relation pair or the
 * intro, disappearance through an outgoing consuming pair or the outro. */
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createRelation,
  defaultIntro,
  defaultOutro,
  parseProject,
  sceneDuration,
  validateProject,
} from '../../model';
import { createEvaluator, rateFunction } from '../index';
import { readExample } from '../../test/examples';
import { byKey, mockRender, plainClip, sceneWith, summary } from './sceneKit';
import { resolveFormula, toSnapshot } from '../../engine';

async function relationScene() {
  const scene = await sceneWith({ a: 'abcd', b: 'xyz' });
  const [t1, t2] = scene.project.tracks;
  const a = createClip(scene.f.a!.id, t1!.id, 0, 6, {
    intro: defaultIntro('write'),
    outro: defaultOutro('fade_out'),
  });
  const b = createClip(scene.f.b!.id, t2!.id, 2, 8, {
    intro: defaultIntro('fade_in'),
    outro: defaultOutro('none'),
  });
  const relation = createRelation(a.id, b.id, {
    offset: 1, // window [3, 4)
    duration: 1,
    pairs: [
      { from: [0, 1], to: [0], style: 'transform', extras: 'merge' },
      { from: [2], to: [1], style: 'copy' },
    ],
  });
  scene.project.clips.push(a, b);
  scene.project.relations.push(relation);
  expect(validateProject(scene.project).filter((i) => i.severity === 'error')).toEqual([]);
  return { scene, a, b, ev: createEvaluator(scene.project, scene.formulas) };
}

describe('relations (glyph lifetime around the morph)', () => {
  it('keeps incoming targets invisible until their window and out of the intro', async () => {
    const { a, b, ev } = await relationScene();
    // B's intro (fade_in over [2, 3)) animates only glyph 2; glyphs 0 and 1 arrive by relation.
    const early = byKey(ev.evaluate(2.5));
    expect(early.has(`${b.id}:0`)).toBe(false);
    expect(early.has(`${b.id}:1`)).toBe(false);
    expect(early.get(`${b.id}:2`)!.fill!.opacity).toBeCloseTo(rateFunction('smooth', 'ce')(0.5), 9);
    // A is fully written by then.
    expect([0, 1, 2, 3].every((g) => early.get(`${a.id}:${g}`)!.fill!.opacity === 1)).toBe(true);
  });

  it('draws the morphs during the window: sources become targets, copies stay', async () => {
    const { a, b, ev } = await relationScene();
    const half = rateFunction('smooth', 'ce')(0.5);
    const mid = byKey(ev.evaluate(3.5));
    // [0, 1] → [0] (transform, merge): drawn under the source keys. Glyph 0 goes to glyph 0;
    // glyph 1 flies to the same place and fades out (the padding copy of the target).
    expect(mid.get(`${a.id}:0`)!.fill!.opacity).toBe(1);
    expect(mid.get(`${a.id}:1`)!.fill!.opacity).toBeCloseTo(1 - half, 9);
    expect(mid.has(`${b.id}:0`)).toBe(false); // the target glyph is not drawn on its own yet
    // [2] → [1] (copy): the source stays, the copy is drawn under the target's key.
    expect(mid.get(`${a.id}:2`)!.fill!.opacity).toBe(1);
    expect(mid.get(`${b.id}:1`)!.fill!.opacity).toBe(1);
    expect(mid.get(`${a.id}:3`)!.fill!.opacity).toBe(1); // untouched
    expect(mid.get(`${b.id}:2`)!.fill!.opacity).toBe(1); // intro finished
  });

  it('removes consumed sources after the window although the clip goes on', async () => {
    const { a, b, ev } = await relationScene();
    const after = byKey(ev.evaluate(4));
    expect(after.has(`${a.id}:0`)).toBe(false);
    expect(after.has(`${a.id}:1`)).toBe(false);
    expect(after.has(`${a.id}:2`)).toBe(true);
    expect(after.has(`${a.id}:3`)).toBe(true);
    expect([0, 1, 2].every((g) => after.get(`${b.id}:${g}`)!.fill!.opacity === 1)).toBe(true);
  });

  it('runs the source outro only on the glyphs that were not consumed', async () => {
    const { a, b, ev } = await relationScene();
    const t = 5.5; // half-way through A's fade_out over [5, 6)
    const drawn = byKey(ev.evaluate(t));
    const half = rateFunction('smooth', 'ce')(0.5);
    expect(drawn.has(`${a.id}:0`)).toBe(false);
    expect(drawn.has(`${a.id}:1`)).toBe(false);
    expect(drawn.get(`${a.id}:2`)!.fill!.opacity).toBeCloseTo(1 - half, 9);
    expect(drawn.get(`${a.id}:3`)!.fill!.opacity).toBeCloseTo(1 - half, 9);
    // B is unaffected by A's outro (its outro is none).
    expect(drawn.get(`${b.id}:0`)!.fill!.opacity).toBe(1);
    // The event lists agree with what was drawn.
    expect(ev.events.find((e) => e.id === `outro:${a.id}`)).toMatchObject({ except: [0, 1] });
    expect(ev.events.find((e) => e.id === `intro:${b.id}`)).toMatchObject({ except: [0, 1] });
  });

  it('draws the source and target of a morph at the same time, never twice', async () => {
    const { ev } = await relationScene();
    for (let t = 0; t <= ev.duration; t += 0.05) {
      const keys = ev.evaluate(t).map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('hidden glyphs (left out of the intro)', () => {
  it('never draws a hidden glyph that no relation brings in', async () => {
    const scene = await sceneWith({ a: 'abcd' });
    scene.f.a!.hiddenGlyphs = [1, 3];
    const clip = plainClip(scene, 'a', 0, 0, 4, {
      intro: defaultIntro('write'), // [0, 1)
      outro: defaultOutro('fade_out'), // [3, 4)
    });
    const ev = createEvaluator(scene.project, scene.formulas);
    const keys = (t: number) => ev.evaluate(t).map((d) => d.key);
    expect(keys(2)).toEqual([`${clip.id}:0`, `${clip.id}:2`]);
    for (let t = 0; t <= ev.duration; t += 0.05) {
      expect(keys(t).filter((k) => k.endsWith(':1') || k.endsWith(':3'))).toEqual([]);
    }
    expect(ev.events.find((e) => e.id === `intro:${clip.id}`)).toMatchObject({ except: [1, 3] });
    expect(ev.events.find((e) => e.id === `outro:${clip.id}`)).toMatchObject({ except: [1, 3] });
  });

  it('a relation still brings a hidden glyph in; the outro then takes it out', async () => {
    const { scene, b } = await relationScene(); // [0, 1] → b0, [2] → b1 over [3, 4)
    scene.f.b!.hiddenGlyphs = [0, 2];
    const ev = createEvaluator(scene.project, scene.formulas);
    // b2 was the only glyph of B's intro: nothing is faded in now.
    expect(byKey(ev.evaluate(2.5)).has(`${b.id}:2`)).toBe(false);
    const after = byKey(ev.evaluate(4.5));
    expect(after.get(`${b.id}:0`)!.fill!.opacity).toBe(1);
    expect(after.has(`${b.id}:1`)).toBe(true);
    expect(after.has(`${b.id}:2`)).toBe(false);
    expect(ev.events.find((e) => e.id === `intro:${b.id}`)).toMatchObject({ except: [0, 1, 2] });
    expect(ev.events.find((e) => e.id === `outro:${b.id}`)).toMatchObject({ except: [2] });
  });
});

describe('the example projects', () => {
  it.each(['hello.mfe.json', 'one-to-many.mfe.json'])('%s evaluates for every t', async (name) => {
    const parsed = parseProject(readExample(name));
    if (!parsed.ok) throw new Error(parsed.error);
    const project = parsed.project;
    const formulas = new Map();
    for (const formula of project.formulas) {
      const render = await mockRender(formula.source, project.meta.target);
      formulas.set(formula.id, resolveFormula(formula, render));
      void toSnapshot;
    }
    const ev = createEvaluator(project, formulas);
    expect(ev.duration).toBe(sceneDuration(project));
    let seen = 0;
    for (let t = 0; t <= ev.duration; t += 1 / 30) {
      const first = summary(ev.evaluate(t));
      expect(summary(ev.evaluate(t))).toEqual(first);
      seen += first.length;
    }
    expect(seen).toBeGreaterThan(0);
  });
});
