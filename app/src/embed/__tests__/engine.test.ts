// @vitest-environment node
/* The player's engine: a revived example draws what the app's evaluator draws on the renders it
 * came from (to within the packing's quantum), modified copies of its project play, a change of
 * what an object is made of is refused, the glyphs of a formula come in canonical order with
 * their boxes, and drawing maps the scene onto the canvas as the Preview does. */
import { describe, expect, it } from 'vitest';
import { producerOf, renderRequestFor, type RenderMeta } from '../../engine';
import {
  createBraceFormula,
  createFormula,
  createLineFormula,
  createSceneCamera,
  createShapeFormula,
  createTexFormula,
  createTextFormula,
  type Formula,
  type ShapeKind,
} from '../../model';
import { createEvaluator, type Drawable } from '../../scene';
import { QUANTUM } from '../data';
import { changedMakeup, reviveExample } from '../engine';
import { exampleData, renderedExample } from './fixtures';

/** A drawable reduced to what is compared: its key, its paint and its outline's numbers. */
function summary(d: Drawable) {
  return {
    key: d.key,
    z: d.z,
    role: d.role,
    fill: d.fill && { color: d.fill.color, opacity: Number(d.fill.opacity.toFixed(6)) },
    stroke: d.stroke && {
      color: d.stroke.color,
      opacity: Number(d.stroke.opacity.toFixed(6)),
      width: Number(d.stroke.width.toFixed(6)),
    },
    lengths: d.path.contours.map((c) => c.length),
  };
}

const flat = (d: Drawable) => d.path.contours.flat();

/** A 2D context that records what is asked of it (Node has no canvas). */
function recordingCanvas(width: number, height: number) {
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_target, name) {
        if (typeof name !== 'string') return undefined;
        return (...args: unknown[]) => {
          calls.push(name);
          void args;
        };
      },
      set(_target, name) {
        calls.push(`set ${String(name)}`);
        return true;
      },
    },
  );
  const canvas = { width, height, getContext: () => ctx } as unknown as OffscreenCanvas;
  return { canvas, calls };
}

describe('a revived example', () => {
  for (const name of ['hello.mfe.json', 'completing-the-square.mfe.json', 'shapes.mfe.json']) {
    it(`draws what the app draws: ${name}`, async () => {
      const rendered = await renderedExample(name);
      const app = createEvaluator(rendered.project, rendered.resolved);
      const scene = reviveExample('x', exampleData(rendered)).scene();
      expect(scene.duration).toBeCloseTo(app.duration, 9);
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = (app.duration * i) / steps;
        const expected = app.evaluate(t);
        const actual = scene.evaluate(t);
        expect(actual.map(summary), `t = ${t}`).toEqual(expected.map(summary));
        actual.forEach((d, k) => {
          const want = flat(expected[k]!);
          flat(d).forEach((v, j) =>
            // A point moves by the quantum times the clip's scale (and a morph's spread), a
            // tenth of a pixel of a 1080p frame at most here.
            expect(Math.abs(v - want[j]!), `${d.key} at t = ${t}`).toBeLessThan(10 * QUANTUM),
          );
        });
      }
    });
  }

  it('plays a copy of its project with other relation pairs', async () => {
    const example = reviveExample('hello', exampleData(await renderedExample('hello.mfe.json')));
    const project = example.cloneProject();
    const relation = project.relations[0]!;
    // Only m and x go across; the rest of f2 comes in with its intro (none: at once).
    relation.pairs = [{ from: [0, 1], to: [0, 1], style: null }];
    expect(example.validate(project).filter((i) => i.severity === 'error')).toEqual([]);
    const scene = example.scene(project);
    const before = example.scene();
    const window = relation.offset + project.clips.find((c) => c.id === relation.toClipId)!.start;
    const mid = window + relation.duration / 2;
    const keys = (ds: Drawable[]) => ds.map((d) => d.key).sort();
    expect(keys(scene.evaluate(mid))).not.toEqual(keys(before.evaluate(mid)));
    // The example's own project is left alone, and its scene is made once.
    expect(example.project.relations[0]!.pairs).toHaveLength(4);
    expect(example.scene()).toBe(before);
  });

  it('tells what the app tells of a project that cannot play', async () => {
    const example = reviveExample('hello', exampleData(await renderedExample('hello.mfe.json')));
    const project = example.cloneProject();
    // Two pairs that share one of their targets and not the other.
    project.relations[0]!.pairs = [
      { from: [0], to: [0], style: null },
      { from: [1], to: [0, 1], style: null },
    ];
    const errors = example.validate(project).filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/./);
  });

  it('refuses a formula whose source changed: its render is not in the data', async () => {
    const example = reviveExample('hello', exampleData(await renderedExample('hello.mfe.json')));
    const project = example.cloneProject();
    project.formulas[0]!.source = 'mx+y=1';
    expect(() => example.scene(project)).toThrow(/changed what it is made of/);
    // Its colour may change: the scene draws it.
    const recoloured = example.cloneProject();
    recoloured.formulas[0]!.color = '#FF0000';
    const drawn = example.scene(recoloured).evaluate(1);
    expect(drawn.find((d) => d.key.endsWith(':0'))?.fill?.color).toBe('#FF0000');
  });

  it('refuses a brace whose width changed, and says so', async () => {
    const example = reviveExample('braces', exampleData(await renderedExample('braces.mfe.json')));
    const project = example.cloneProject();
    const brace = project.formulas.find((f) => f.kind === 'brace');
    if (brace?.kind !== 'brace') throw new Error('the example has no brace');
    brace.width += 1;
    expect(() => example.scene(project)).toThrow(/changed what it is made of \(its width\)/);
  });

  it('refuses a shape whose height or target changed, and draws one recoloured', async () => {
    const example = reviveExample('shapes', exampleData(await renderedExample('shapes.mfe.json')));
    const taller = example.cloneProject();
    const shape = taller.formulas.find((f) => f.kind === 'shape');
    if (shape?.kind !== 'shape') throw new Error('the example has no shape');
    shape.height += 1;
    expect(() => example.scene(taller)).toThrow(/changed what it is made of \(its height\)/);
    const other = example.cloneProject();
    other.meta.target = other.meta.target === 'ce' ? 'gl' : 'ce';
    expect(() => example.scene(other)).toThrow(
      /changed what it is made of \(the project’s target\)/,
    );
    // Its colours are not what it is made of.
    const recoloured = example.cloneProject();
    const painted = recoloured.formulas.find((f) => f.id === shape.id)!;
    painted.color = '#FF0000';
    if (painted.kind === 'shape') painted.fillColor = '#00FF00';
    expect(() => example.scene(recoloured)).not.toThrow();
  });

  it('gives the glyphs of a formula in canonical order, by name or by id', async () => {
    const rendered = await renderedExample('hello.mfe.json');
    const example = reviveExample('hello', exampleData(rendered));
    const formula = rendered.project.formulas[0]!;
    const glyphs = example.glyphs('a1');
    expect(example.glyphs(formula.id)).toEqual(glyphs);
    expect(glyphs.map((g) => g.label)).toEqual(formula.snapshot!.glyphs.map((g) => g.label));
    const resolved = rendered.resolved.get(formula.id)!;
    glyphs.forEach((g, i) => {
      const own = resolved.render.glyphs[resolved.canonToRender[i]!]!;
      expect(g.index).toBe(i);
      expect(g.box.minX).toBeCloseTo(own.bbox.minX, 3);
      expect(g.center[0]).toBeCloseTo((own.bbox.minX + own.bbox.maxX) / 2, 3);
      expect(g.size[1]).toBeCloseTo(own.bbox.maxY - own.bbox.minY, 3);
      expect(g.contours).not.toBeNull();
    });
    expect(() => example.glyphs('nope')).toThrow(/has no formula "nope"/);
    expect(example.formulas().map((f) => [f.name, f.glyphs, f.clips.length])).toEqual([
      ['a1', 6, 1],
      ['f2', 5, 1],
    ]);
  });

  it('makes a scene of one formula alone, whose content box frames it', async () => {
    const example = reviveExample('hello', exampleData(await renderedExample('hello.mfe.json')));
    const alone = example.formulaScene('f2');
    const drawn = alone.evaluate(0);
    expect(drawn).toHaveLength(5);
    expect(drawn.every((d) => d.clipId === alone.clip)).toBe(true);
    const box = alone.contentBox(0)!;
    // Centred on the origin, as a fresh MathTex.
    expect((box.minX + box.maxX) / 2).toBeCloseTo(0, 2);
    const geometry = alone.geometry(0);
    expect(geometry).toHaveLength(1);
    expect(geometry[0]!.glyphs.size).toBe(5);
  });
});

describe('what an object is made of', () => {
  /** What the app's render key hashes of a formula: its producer's identity of its request. */
  const identity = (formula: Formula, meta: RenderMeta) =>
    JSON.stringify(producerOf(formula.kind).identity(renderRequestFor(formula, meta, 'auto')));

  /** The paths of the leaves of a plain object: its numbers, strings, flags, lists and nulls. */
  function leaves(node: unknown, path: string[] = []): string[][] {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return [path];
    return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]));
  }
  /** `root` with the leaf at `path` changed: a number grown, a string or a list longer, a flag
   * turned, a null given a value. */
  function changedAt<T extends object>(root: T, path: string[]): T {
    const copy = structuredClone(root) as Record<string, unknown>;
    let node = copy;
    for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>;
    const key = path[path.length - 1]!;
    const value = node[key];
    node[key] =
      typeof value === 'number'
        ? value + 0.25
        : typeof value === 'string'
          ? `${value}x`
          : typeof value === 'boolean'
            ? !value
            : Array.isArray(value)
              ? [...value, 'more']
              : 1;
    return copy as T;
  }

  const SHAPES: ShapeKind[] = ['box', 'circle', 'underline', 'cross', 'cross_line'];
  const math = createFormula({ name: 'm', source: 'x^2', packages: ['amssymb'] });
  const brace = createBraceFormula({ name: 'b', width: 2, sharpness: 2 });
  const formulas: Formula[] = [
    math,
    createTexFormula({
      name: 't',
      source: 'Hi',
      layout: { width: 4, align: 'left', lineSpacing: 1 },
    }),
    createTextFormula({ name: 'f', source: 'Hello' }),
    brace,
    ...SHAPES.map((shape) =>
      createShapeFormula({ name: shape, shape, width: 2, height: 1, cornerRadius: 0.1 }),
    ),
  ];

  it('is what the app’s render key hashes, field by field, for every kind but a line', () => {
    const meta: RenderMeta = { target: 'ce', preamble: '' };
    for (const formula of formulas) {
      const variants: { what: string; formula: Formula; meta: RenderMeta }[] = [
        ...leaves(formula)
          .filter((path) => path[0] !== 'id' && path[0] !== 'kind')
          .map((path) => ({ what: path.join('.'), formula: changedAt(formula, path), meta })),
        // Fields a formula may lack, and the project's settings.
        { what: 'diagonal', formula: { ...formula, diagonal: 'ul_dr' } as Formula, meta },
        { what: 'fillColor', formula: { ...formula, fillColor: '#00FF00' } as Formula, meta },
        { what: 'startPosition', formula: { ...formula, startPosition: [1, 2] }, meta },
        { what: 'target', formula, meta: { ...meta, target: 'gl' } },
        { what: 'preamble', formula, meta: { ...meta, preamble: '\\usepackage{xcolor}' } },
      ];
      let refused = 0;
      for (const variant of variants) {
        const app = identity(variant.formula, variant.meta) !== identity(formula, meta);
        const reason = changedMakeup(variant.formula, variant.meta, formula, meta);
        expect(reason !== null, `${formula.kind} ${formula.name}: ${variant.what}`).toBe(app);
        if (reason !== null) refused++;
      }
      // Each kind has fields of both sorts: some the player refuses, some (the colour) it takes.
      expect(refused, formula.name).toBeGreaterThan(1);
      expect(refused, formula.name).toBeLessThan(variants.length);
    }
  });

  it('names what changed, the kind first', () => {
    const meta: RenderMeta = { target: 'ce', preamble: '' };
    expect(changedMakeup(brace, meta, math, meta)).toBe('its kind');
    expect(changedMakeup({ ...math, fontSize: 60 }, meta, math, meta)).toBe('its font size');
    expect(changedMakeup({ ...brace, sharpness: 1 }, meta, brace, meta)).toBe('its sharpness');
    expect(changedMakeup(math, { ...meta, preamble: '%' }, math, meta)).toBe(
      'the project’s preamble',
    );
    expect(changedMakeup({ ...math, color: '#FF0000' }, meta, math, meta)).toBeNull();
    // A line's glyphs are built again by the player (lines.ts): nothing of it is refused.
    const line = createLineFormula({ name: 'l', vector: [2, 0] });
    expect(changedMakeup({ ...line, vector: [3, 1] }, meta, line, meta)).toBeNull();
    expect(changedMakeup(line, { ...meta, target: 'gl' }, line, meta)).toBeNull();
  });
});

describe('drawing', () => {
  it('fills the canvas with the background and maps the frame onto it', async () => {
    const example = reviveExample('hello', exampleData(await renderedExample('hello.mfe.json')));
    const scene = example.scene();
    const { canvas, calls } = recordingCanvas(1280, 720);
    const view = scene.draw(canvas, 1.5);
    expect(calls).toContain('fillRect');
    expect(calls.filter((c) => c === 'fill').length).toBeGreaterThan(0);
    // The whole frame, 14.22 × 8 units, into 1280 × 720: 90 pixels a unit, the origin centred.
    expect(view.scale).toBeCloseTo(90, 6);
    expect(view.toPixel([0, 0])).toEqual([640, 360]);
    expect(view.toPixel([-64 / 9, 4])).toEqual([0, 0]);
  });

  it('shows a region of the scene when asked: a formula large', async () => {
    const example = reviveExample('hello', exampleData(await renderedExample('hello.mfe.json')));
    const alone = example.formulaScene('a1');
    const box = alone.contentBox(0)!;
    const { canvas } = recordingCanvas(400, 100);
    const view = alone.draw(canvas, 0, { region: box });
    const [left, top] = view.toPixel([box.minX, box.maxY]);
    const [right, bottom] = view.toPixel([box.maxX, box.minY]);
    // Fitted whole and centred: it touches two opposite sides of the canvas.
    const touchesWidth = Math.abs(left) < 1e-6 && Math.abs(right - 400) < 1e-6;
    const touchesHeight = Math.abs(top) < 1e-6 && Math.abs(bottom - 100) < 1e-6;
    expect(touchesWidth || touchesHeight).toBe(true);
    expect((left + right) / 2).toBeCloseTo(200, 6);
    expect((top + bottom) / 2).toBeCloseTo(50, 6);
  });

  it('looks through the scene’s camera at each instant when the project has one that moves', async () => {
    const example = reviveExample('hello', exampleData(await renderedExample('hello.mfe.json')));
    const still = example.scene();
    expect(still.frameAt(0)).toEqual(still.frame);
    expect(still.frameAt(3)).toBe(still.frame);
    // A move to a frame half as tall about (2, 1), during [1, 2), linear.
    const project = example.cloneProject();
    project.camera = {
      ...createSceneCamera(),
      moves: [
        {
          id: 'n1',
          start: 1,
          duration: 1,
          easing: 'linear',
          to: { kind: 'frame', frame: { center: [2, 1], height: 4 } },
        },
      ],
    };
    const scene = example.scene(project);
    expect(scene.frame).toEqual(still.frame);
    expect(scene.frameAt(0)).toEqual(still.frame);
    expect(scene.frameAt(1.5).maxY - scene.frameAt(1.5).minY).toBeCloseTo(6, 9);
    const { canvas } = recordingCanvas(1280, 720);
    // At 0 s, Manim's frame: 90 pixels a unit, the origin in the middle.
    const before = scene.draw(canvas, 0);
    expect(before.scale).toBeCloseTo(90, 6);
    expect(before.toPixel([0, 0])).toEqual([640, 360]);
    // Once there: 180 pixels a unit, (2, 1) in the middle. The view of an instant is the one
    // its drawing returns.
    const after = scene.draw(canvas, 2);
    expect(after.scale).toBeCloseTo(180, 6);
    expect(after.toPixel([2, 1])).toEqual([640, 360]);
    expect(scene.view(canvas, {}, 2).camera).toEqual(after.camera);
    expect(scene.view(canvas).camera).toEqual(before.camera);
  });

  it('adjusts what it draws when asked', async () => {
    const example = reviveExample('hello', exampleData(await renderedExample('hello.mfe.json')));
    const scene = example.scene();
    const { canvas, calls } = recordingCanvas(320, 180);
    scene.draw(canvas, 1.5, { adjust: () => [] });
    expect(calls.filter((c) => c === 'fill')).toHaveLength(0);
  });
});
