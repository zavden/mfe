// @vitest-environment node
/* Lines with ends on glyphs in the player (`lines.ts`): the glyphs of a line are the ones the
 * app's producer builds (`engine/producers.ts`), a line whose ends were put elsewhere lands where
 * the attach sync puts it (`scene/attach.ts`), the points of the compass are the boxes' points
 * Manim reads, and the compass is named as the Preview's. Through the engine too: a revived
 * example places its lines and draws them as the app draws the settled project. */
import { describe, expect, it } from 'vitest';
import { producerOf, refreshLocalRenders, renderRequestFor } from '../../engine';
import {
  createClip,
  createEndsAttach,
  createLineFormula,
  createTrack,
  type Clip,
  type LineAnchor,
  type LineEndSpec,
  type LineFormula,
  type LineKind,
  type Project,
  type Target,
} from '../../model';
import { createEvaluator, type Drawable } from '../../scene';
import { settleScene } from '../../scene/attach';
import { criticalPoint } from '../../scene/measure';
import { plainClip, sceneWith } from '../../scene/__tests__/sceneKit';
import {
  DIRECTION_ARROWS,
  DIRECTION_LABELS,
  DIRECTIONS,
  type Direction,
} from '../../ui/preview/glyphAlign';
import { anchorLabel, AUTO_ANCHOR_HINT as APP_AUTO_HINT } from '../../ui/preview/lineDraw';
import { QUANTUM } from '../data';
import { reviveExample } from '../engine';
import {
  ANCHOR_ARROWS,
  ANCHOR_LABELS,
  anchorPoints,
  AUTO_ANCHOR_HINT,
  COMPASS_ANCHORS,
  lineEnds,
  lineRender,
  placeLines,
} from '../lines';
import { exampleData, renderProject } from './fixtures';

const direction = (anchor: Exclude<LineAnchor, 'auto'>) => anchor.toUpperCase() as Direction;

describe('the compass of a line’s end in the player', () => {
  it('has the Preview’s nine points, in its order, with its names and arrows', () => {
    expect(COMPASS_ANCHORS.map(direction)).toEqual([...DIRECTIONS]);
    for (const anchor of COMPASS_ANCHORS) {
      expect(ANCHOR_LABELS[anchor]).toBe(DIRECTION_LABELS[direction(anchor)]);
      expect(ANCHOR_ARROWS[anchor]).toBe(DIRECTION_ARROWS[direction(anchor)]);
      expect(ANCHOR_LABELS[anchor]).toBe(anchorLabel(anchor));
    }
    expect(ANCHOR_LABELS.auto).toBe(anchorLabel('auto'));
    expect(AUTO_ANCHOR_HINT).toBe(APP_AUTO_HINT);
  });
});

describe('the glyphs of a line in the player', () => {
  const shapes: Partial<LineFormula>[] = [
    { line: 'line' },
    { line: 'dashed', vector: [3, 1] },
    { line: 'dashed', vector: [0, 0] },
    { line: 'arrow', vector: [2.5, -1.2] },
    { line: 'arrow', vector: [0.3, 0.1] },
    { line: 'arrow', vector: [-2, 0.5], tip: 'stealth' },
    { line: 'double_arrow', vector: [1, 3], tip: 'dot', startTip: 'stealth' },
    { line: 'arrow', vector: [3, 0], curve: { shape: 'arc', degrees: 60, trim: 0.05 } },
    {
      line: 'line',
      vector: [2, 1],
      curve: {
        shape: 'spline',
        nodes: [
          { at: [0, 0], in: null, out: [0.2, 0.3], smooth: true },
          { at: [0.5, 0.4], in: null, out: null, smooth: true },
          { at: [1, 0], in: [0.8, -0.2], out: null, smooth: false },
        ],
      },
    },
  ];
  for (const target of ['ce', 'gl'] as const) {
    shapes.forEach((fields, i) => {
      it(`are the producer’s (${target}, ${i}: ${fields.line})`, () => {
        const formula = createLineFormula({ ...fields, strokeWidth: 5 });
        const meta = { target, preamble: '' } as Project['meta'];
        const result = producerOf('line').free(renderRequestFor(formula, meta, 'latex'), 'k');
        if (!result.ok) throw new Error(result.error.message);
        const { key: _wanted, ...want } = result.render;
        const { key: _own, ...have } = lineRender(formula, target);
        void _wanted;
        void _own;
        expect(have).toEqual(want);
      });
    });
  }
});

/** "a+b=c" up on the left and "x^2" down on the right, larger, both over [0, 6); a line of `kind`
 * over [2, 6) between `start` and `end` at `buff`, settled by the app's attach sync. */
async function settledLine(
  target: Target,
  kind: LineKind,
  ends: (a: Clip, b: Clip) => [LineEndSpec, LineEndSpec],
  buff: number,
) {
  const scene = await sceneWith({ a: 'a+b=c', b: 'x^2' }, target);
  const a = plainClip(scene, 'a', 0, 0, 6);
  a.initial.position = [-3, 1];
  const b = plainClip(scene, 'b', 1, 0, 6);
  b.initial.position = [3, -1.5];
  b.initial.scale = 1.5;
  const formula = createLineFormula({ name: 'l1', line: kind });
  scene.project.formulas.push(formula);
  const track = createTrack('Track of the line');
  scene.project.tracks.unshift(track);
  const [start, end] = ends(a, b);
  const clip = createClip(formula.id, track.id, 2, 6, {
    attach: createEndsAttach(start, end, buff),
  });
  scene.project.clips.push(clip);
  const settled = settleScene(scene.project, scene.formulas, refreshLocalRenders);
  return { ...settled, lineId: formula.id, clipId: clip.id, a, b };
}

/** The same project with the ends of the line's clip at other anchors. */
function withAnchors(project: Project, clipId: string, start: LineAnchor, end: LineAnchor) {
  const next = structuredClone(project);
  const clip = next.clips.find((c) => c.id === clipId)!;
  if (clip.attach?.rule !== 'ends') throw new Error('not a line on glyphs');
  if ('clipId' in clip.attach.start) clip.attach.start.anchor = start;
  if ('clipId' in clip.attach.end) clip.attach.end.anchor = end;
  return next;
}

const close = (have: readonly number[], want: readonly number[], digits = 9) =>
  have.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, digits));

describe.each(['ce', 'gl'] as const)('a line put elsewhere in the player (%s)', (target) => {
  const pairs: [LineAnchor, LineAnchor][] = [
    ['auto', 'auto'],
    ['dr', 'ul'],
    ['right', 'left'],
    ['up', 'down'],
    ['center', 'auto'],
    ['auto', 'ur'],
  ];
  it('lands where the attach sync puts it, for every pair of anchors', async () => {
    for (const kind of ['arrow', 'line', 'double_arrow'] as const) {
      const base = await settledLine(
        target,
        kind,
        (a, b) => [
          { clipId: a.id, glyphs: [0, 1] },
          { clipId: b.id, glyphs: 'all' },
        ],
        0.25,
      );
      for (const [start, end] of pairs) {
        const moved = withAnchors(base.project, base.clipId, start, end);
        const want = settleScene(moved, base.formulas, refreshLocalRenders).project;
        const evaluator = createEvaluator(moved, base.formulas, { includeHidden: true });
        const have = placeLines(moved, evaluator);
        const line = (p: Project) => p.formulas.find((f) => f.id === base.lineId) as LineFormula;
        const clip = (p: Project) => p.clips.find((c) => c.id === base.clipId)!;
        close(line(have).vector, line(want).vector);
        close(clip(have).initial.position, clip(want).initial.position);
        expect(clip(have).initial.rotation).toBe(clip(want).initial.rotation);
        expect(line(have).curve).toEqual(line(want).curve);
        expect(line(have).snapshot?.glyphs.map((g) => g.label)).toEqual(
          line(want).snapshot?.glyphs.map((g) => g.label),
        );
        // The ends it reports are the ones the line is drawn between.
        const ends = lineEnds(moved, evaluator, clip(moved))!;
        close(line(have).vector, [
          ends.drawn.end[0] - ends.drawn.start[0],
          ends.drawn.end[1] - ends.drawn.start[1],
        ]);
      }
    }
  });

  it('puts the points of the compass where Manim reads the box of the glyphs', async () => {
    const base = await settledLine(
      target,
      'arrow',
      (a, b) => [
        { clipId: a.id, glyphs: [0, 1] },
        { clipId: b.id, glyphs: 'all' },
      ],
      0.25,
    );
    const evaluator = createEvaluator(base.project, base.formulas, { includeHidden: true });
    const points = anchorPoints(base.project, evaluator, { clipId: base.a.id, glyphs: [0, 1] }, 2)!;
    const boxes = evaluator.measure(base.a.id, [0, 1], 2)!;
    const vectors: Record<string, [number, number]> = {
      ul: [-1, 1],
      up: [0, 1],
      ur: [1, 1],
      left: [-1, 0],
      center: [0, 0],
      right: [1, 0],
      dl: [-1, -1],
      down: [0, -1],
      dr: [1, -1],
    };
    for (const anchor of COMPASS_ANCHORS) {
      close(points[anchor], criticalPoint(boxes, vectors[anchor]!));
    }
  });
});

describe('an example whose line is put elsewhere', () => {
  it('places it and draws it as the app draws the settled project', async () => {
    const base = await settledLine(
      'ce',
      'arrow',
      (a, b) => [
        { clipId: a.id, glyphs: 'all', anchor: 'right' },
        { clipId: b.id, glyphs: 'all', anchor: 'left' },
      ],
      0.2,
    );
    // The example as the documentation's tool packs it: MathJax renders, settled lines.
    const rendered = await renderProject(base.project);
    const example = reviveExample('lines', exampleData(rendered));
    const moved = withAnchors(example.cloneProject(), base.clipId, 'dr', 'up');
    const placed = example.placeLines(moved);
    expect(example.validate(placed).filter((i) => i.severity === 'error')).toEqual([]);
    const want = settleScene(moved, rendered.resolved, refreshLocalRenders);
    const app = createEvaluator(want.project, want.formulas);
    const scene = example.scene(placed);
    const of = (list: Drawable[]) => list.filter((d) => d.clipId === base.clipId);
    for (const t of [3.5, 4.2, 5.9]) {
      const expected = of(app.evaluate(t));
      const actual = of(scene.evaluate(t));
      expect(actual.map((d) => d.key)).toEqual(expected.map((d) => d.key));
      expect(expected.length).toBe(2);
      actual.forEach((d, k) => {
        const wanted = expected[k]!.path.contours.flat();
        d.path.contours.flat().forEach((v, j) => {
          expect(Math.abs(v - wanted[j]!)).toBeLessThan(10 * QUANTUM);
        });
      });
    }
    // Unchanged, it keeps the example's own render.
    expect(example.scene(example.cloneProject()).evaluate(3).length).toBe(
      example.scene().evaluate(3).length,
    );
  });
});
