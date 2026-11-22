// @vitest-environment node
/* The style `fade_copy` (D185, format 33): a copy of the sources cross-fades into the targets —
 * Manim's `FadeTransform` of a copy — and the sources stay, as with `copy`. */
import { describe, expect, it } from 'vitest';
import {
  clipLifetimes,
  copiesSources,
  createRelation,
  crossFades,
  pairRoutes,
  parseProject,
  serializeProject,
  sourceRoles,
  sourceStyle,
  validateProject,
  type GlyphPair,
  type Relation,
  type RelationStyle,
} from '../../model';
import { createEvaluator } from '../evaluator';
import { byKey, centerOf, plainClip, sceneWith } from './sceneKit';

/** `a` (a+b=c) on [0, 6] and `b` (xy=z) on [1, 6]; the relation plays over [2, 3), linearly. */
async function twoClips(pairs: Relation['pairs'], fields: Partial<Relation> = {}) {
  const scene = await sceneWith({ a: 'a+b=c', b: 'xy=z' });
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

const pair = (from: number[], to: number[], more: Partial<GlyphPair> = {}): GlyphPair => ({
  from,
  to,
  style: null,
  ...more,
});

describe('the styles, by what they do with their sources and their groups', () => {
  it('fade_copy copies its sources, as copy does, and cross-fades, as fade does', () => {
    const all: RelationStyle[] = ['transform', 'copy', 'fade', 'fade_copy'];
    expect(all.filter(copiesSources)).toEqual(['copy', 'fade_copy']);
    expect(all.filter(crossFades)).toEqual(['fade', 'fade_copy']);
  });

  it('consumes no source: they are all copied, whatever the pair says of its extras', () => {
    expect(sourceRoles(pair([2, 0], [1]), 'fade_copy')).toEqual({
      consumed: [],
      copied: [0, 2],
      lead: null,
    });
    const copies = pair([0, 2], [1], { extras: 'copies', principal: 2 });
    expect(sourceRoles(copies, 'fade_copy').consumed).toEqual([]);
  });

  it('has the routes of a fade: a group goes whole, a source alone goes to its target', () => {
    expect(pairRoutes(pair([0], [1]), 'fade_copy')).toEqual([{ from: 0, to: 1 }]);
    expect(pairRoutes(pair([0, 1], [2, 3]), 'fade_copy')).toEqual([]);
    expect(pairRoutes(pair([0, 1], [2], { extras: 'merge' }), 'fade_copy')).toEqual([]);
    expect(pairRoutes(pair([0, 1], [2]), 'fade_copy')).toEqual([
      { from: 0, to: 2 },
      { from: 1, to: 2 },
    ]);
  });

  it('with copies, the principal plays the style and every other source a plain copy', () => {
    const copies = pair([0, 2, 4], [1], { extras: 'copies', principal: 2 });
    const played = (style: RelationStyle) => [0, 2, 4].map((g) => sourceStyle(copies, style, g));
    expect(played('transform')).toEqual(['copy', 'transform', 'copy']);
    expect(played('fade')).toEqual(['copy', 'fade', 'copy']);
    expect(played('fade_copy')).toEqual(['copy', 'fade_copy', 'copy']);
    expect(played('copy')).toEqual(['copy', 'copy', 'copy']);
    // Separate sources, and a pair where the option means nothing, play the style.
    expect(sourceStyle(pair([0, 2], [1]), 'fade_copy', 0)).toBe('fade_copy');
    expect(sourceStyle(pair([0], [1], { extras: 'copies', principal: 0 }), 'fade', 0)).toBe('fade');
  });
});

describe('a relation that fades a copy', () => {
  it('is kept by a save and a load, as the style of a relation and of a pair', async () => {
    const { scene } = await twoClips([pair([0], [0]), pair([1], [1], { style: 'fade_copy' })], {
      style: 'fade_copy',
    });
    const text = serializeProject(scene.project);
    const again = parseProject(text);
    if (!again.ok) throw new Error(again.error);
    expect(again.project.relations[0]!.style).toBe('fade_copy');
    expect(again.project.relations[0]!.pairs[1]!.style).toBe('fade_copy');
    expect(serializeProject(again.project)).toBe(text);
  });

  it('leaves the source on screen to the end of its clip, and brings the target', async () => {
    const { scene, a, b } = await twoClips([pair([0], [0], { style: 'fade_copy' })]);
    const lives = clipLifetimes(scene.project);
    expect(
      lives
        .get(a.id)!
        .stints.get(0)!
        .map((s) => [s.enter.start, s.exit.start]),
    ).toEqual([[0, 6]]);
    expect(lives.get(b.id)!.stints.get(0)![0]!.enter).toMatchObject({ start: 2, end: 3 });
  });

  it('draws the source whole, a copy of it that fades out and the target that fades in', async () => {
    const { a, b, ev } = await twoClips([pair([0], [0], { style: 'fade_copy' })]);
    const mid = byKey(ev.evaluate(2.5));
    const source = mid.get(`${a.id}:0`)!;
    const copy = mid.get(`${a.id}:0~`)!;
    const target = mid.get(`${b.id}:0`)!;
    expect(source.fill!.opacity).toBeCloseTo(1, 6);
    expect(copy.fill!.opacity).toBeCloseTo(0.5, 6);
    expect(target.fill!.opacity).toBeCloseTo(0.5, 6);
    // The copy belongs to the source's clip, and is on its way: no longer over the source.
    expect(copy.clipId).toBe(a.id);
    expect(copy.glyph).toBe(0);
    const [sx, sy] = centerOf(source);
    const [cx, cy] = centerOf(copy);
    expect(Math.hypot(cx - sx, cy - sy)).toBeGreaterThan(0.01);
    // It starts over the source, and at the end only the source and the target are left.
    const start = byKey(ev.evaluate(2 + 1e-5));
    centerOf(start.get(`${a.id}:0~`)!).forEach((v, k) =>
      expect(v).toBeCloseTo(centerOf(start.get(`${a.id}:0`)!)[k]!, 3),
    );
    expect(start.get(`${b.id}:0`)!.fill!.opacity).toBeCloseTo(0, 3);
    const after = byKey(ev.evaluate(3.5));
    expect(after.has(`${a.id}:0~`)).toBe(false);
    expect(after.get(`${a.id}:0`)!.fill!.opacity).toBeCloseTo(1, 6);
    expect(after.get(`${b.id}:0`)!.fill!.opacity).toBeCloseTo(1, 6);
  });

  it('plays as a fade does, but for the source that stays', async () => {
    const fade = await twoClips([pair([0, 1], [0, 1], { style: 'fade' })]);
    const copy = await twoClips([pair([0, 1], [0, 1], { style: 'fade_copy' })]);
    const pieces = (r: typeof fade, t: number) => {
      const drawn = byKey(r.ev.evaluate(t));
      // The pieces of the fade: the sources (or their copies) and the targets.
      const key = (glyph: number) => (r === copy ? `${r.a.id}:${glyph}~` : `${r.a.id}:${glyph}`);
      return [key(0), key(1), `${r.b.id}:0`, `${r.b.id}:1`].map((k) => {
        const d = drawn.get(k)!;
        return [...centerOf(d), d.fill!.opacity].map((v) => Math.round(v * 1e6) / 1e6);
      });
    };
    for (const t of [2.2, 2.5, 2.9]) expect(pieces(copy, t)).toEqual(pieces(fade, t));
  });

  it('draws each piece once, with several sources onto one target and with copies', async () => {
    const { ev } = await twoClips([
      pair([0, 1], [0], { style: 'fade_copy' }), // separate: a copy of each
      pair([2, 3], [1], { style: 'fade_copy', extras: 'copies', principal: 3 }),
      pair([4], [2, 3], { style: 'fade_copy' }),
    ]);
    for (let t = 0; t <= ev.duration; t += 0.05) {
      const keys = ev.evaluate(t).map((d) => d.key);
      expect(new Set(keys).size, `t=${t}`).toBe(keys.length);
    }
  });
});

describe('copies of one source faded by several transfers at a time (audit A3-02)', () => {
  /** `twoClips`'s two clips with two relations (format 31) over the same window [2, 3): each
   * fades a copy of a:0, the first into b:0, the second into `second`'s target. */
  async function twice(second: GlyphPair) {
    const scene = await sceneWith({ a: 'a+b=c', b: 'xy=z' });
    const a = plainClip(scene, 'a', 0, 0, 6);
    const b = plainClip(scene, 'b', 1, 1, 6);
    const window = { offset: 1, duration: 1, easing: 'linear' as const };
    const first = createRelation(a.id, b.id, {
      ...window,
      pairs: [pair([0], [0], { style: 'fade_copy' })],
    });
    scene.project.relations.push(first, createRelation(a.id, b.id, { ...window, pairs: [second] }));
    expect(validateProject(scene.project).filter((i) => i.severity === 'error')).toEqual([]);
    return { scene, a, b, ev: createEvaluator(scene.project, scene.formulas) };
  }

  it('draw each piece under a key of its own', async () => {
    const { a, ev } = await twice(pair([0], [1], { style: 'fade_copy' }));
    const keys = ev.evaluate(2.5).map((d) => d.key);
    // Both copies of a:0 are drawn (two pieces) ...
    expect(keys.filter((k) => k.startsWith(`${a.id}:0~`))).toHaveLength(2);
    // ... each under a key of its own.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('as does a copy that pads a pair of one source onto two: one key at every instant', async () => {
    // The second relation copies a:0 onto b:1 and b:2: its pieces pad the source (`a:0~`).
    const { ev } = await twice(pair([0], [1, 2], { style: 'transform' }));
    for (let t = 0; t <= ev.duration; t += 0.05) {
      const keys = ev.evaluate(t).map((d) => d.key);
      expect(new Set(keys).size, `t=${t}`).toBe(keys.length);
    }
  });

  it('keep the keys a transfer has alone when they play at other times', async () => {
    // The second relation fades a copy of a:0 too, but over [4, 5): never with the first.
    const { scene, a } = await twice(pair([0], [1], { style: 'fade_copy' }));
    const second = scene.project.relations[1]!;
    second.offset = 3;
    expect(validateProject(scene.project).filter((i) => i.severity === 'error')).toEqual([]);
    const ev = createEvaluator(scene.project, scene.formulas);
    const copies = (t: number) =>
      ev
        .evaluate(t)
        .map((d) => d.key)
        .filter((k) => k.startsWith(`${a.id}:0~`));
    expect(copies(2.5)).toEqual([`${a.id}:0~`]);
    expect(copies(4.5)).toEqual([`${a.id}:0~`]);
  });
});
