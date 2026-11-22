// @vitest-environment node
/* GrowArrow in the preview. A straight arrow (D145) grows from its start, tips and all — what is
 * drawn at a progress is the arrow scaled by it about that point —, and ManimCE grows the stroke
 * of its shaft with it while ManimGL keeps it (measured in both venvs). A bent one (D149) is
 * drawn along its own way, its tip on the end of what is drawn (`traceArrow.test.ts` has it point
 * for point against the export's helper run in both libraries). The export check renders arrows
 * that grow, straight and bent, in both libraries. */
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmptyProject,
  createEndsTween,
  createLineFormula,
  defaultIntro,
  defaultOutro,
  type LineCurve,
  type LineFormula,
  type Target,
  type Vec2,
} from '../../model';
import { settleScene } from '../attach';
import { exportEvaluator } from '../evaluator';
import { lineCentre, lineEndsAt } from '../lines';

/** A free arrow of `fields` over [0, 4) that grows over its first second, at a steady rate, with
 * a lag ratio of its own when `lagRatio` is given. */
function growing(target: Target, fields: Partial<LineFormula>, lagRatio: number | null = null) {
  const project = createEmptyProject();
  project.meta.target = target;
  const formula = createLineFormula({ name: 'l1', line: 'arrow', vector: [2, 1], ...fields });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 4, {
    intro: { ...defaultIntro('grow_arrow'), duration: 1, easing: 'linear', lagRatio },
    outro: defaultOutro('none'),
  });
  clip.initial.position = [0.5, -1];
  project.clips.push(clip);
  const local = refreshLocalRenders(project, new Map());
  const evaluator = exportEvaluator(local.project, local.formulas);
  return { evaluator, start: lineEndsAt(target, formula, clip.initial).start };
}

describe.each(['ce', 'gl'] as const)('an arrow that grows (%s)', (target) => {
  it.each([
    ['straight', {}],
    ['a double arrow with a dot', { line: 'double_arrow', startTip: 'dot' }],
    // Stealth tips have a stroke of their own, which ManimCE does not grow with the shaft's.
    [
      'a double arrow with stealth tips',
      { line: 'double_arrow', tip: 'stealth', startTip: 'stealth' },
    ],
  ] as [string, Partial<LineFormula>][])('%s: scaled about its start', (_name, fields) => {
    const { evaluator, start } = growing(target, fields);
    const whole = evaluator.evaluate(2);
    const half = evaluator.evaluate(0.5);
    expect(half).toHaveLength(whole.length);
    expect(evaluator.evaluate(0)).toHaveLength(0);
    half.forEach((drawable, index) => {
      const full = whole[index]!;
      const got = drawable.path.contours.flat();
      const want = full.path.contours.flat();
      expect(got).toHaveLength(want.length);
      got.forEach((v, k) =>
        expect(v, `member ${index}, number ${k}`).toBeCloseTo(
          start[k % 2]! + 0.5 * (want[k]! - start[k % 2]!),
          9,
        ),
      );
      // The shaft's stroke grows with it in ManimCE; a tip keeps its paint.
      const width = full.stroke?.width ?? 0;
      const grows = target === 'ce' && index === 0;
      expect(drawable.stroke?.width ?? 0).toBeCloseTo(grows ? width / 2 : width, 9);
      expect(drawable.fill?.opacity).toBe(full.fill?.opacity);
    });
  });

  it('with a lag ratio: the shaft first, then the tip at the end, then the one at the start', () => {
    // Manim's GrowArrow is a Transform: a `lag_ratio` staggers the members of the arrow as it
    // staggers the glyphs of a formula, and the export passes it on (audit A5-03; the export
    // check's `grow-arrow-lags` holds both libraries to this, frame by frame). At 0.5 over three
    // members each grows over half the second: the shaft over [0, 0.5), the tip at the end over
    // [0.25, 0.75), the one at the start over [0.5, 1).
    const { evaluator, start } = growing(target, { line: 'double_arrow' }, 0.5);
    const whole = evaluator.evaluate(2);
    const scaledBy = (t: number, index: number, s: number) => {
      const drawn = evaluator.evaluate(t).find((d) => d.glyph === index)!;
      const got = drawn.path.contours.flat();
      const want = whole[index]!.path.contours.flat();
      got.forEach((v, k) =>
        expect(v, `${t} s, member ${index}, number ${k}`).toBeCloseTo(
          start[k % 2]! + s * (want[k]! - start[k % 2]!),
          9,
        ),
      );
    };
    expect(evaluator.evaluate(0.2).map((d) => d.glyph)).toEqual([0]);
    scaledBy(0.2, 0, 0.4);
    expect(evaluator.evaluate(0.4).map((d) => d.glyph)).toEqual([0, 1]);
    scaledBy(0.4, 0, 0.8);
    scaledBy(0.4, 1, 0.3);
    scaledBy(0.7, 1, 0.9);
    scaledBy(0.7, 2, 0.4);
  });
});

const SPLINE = {
  shape: 'spline',
  nodes: [
    { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
    { at: [1, 0], in: [0.7, -0.4], out: null, smooth: false },
  ],
} as const;

describe.each(['ce', 'gl'] as const)('a bent arrow that grows (%s)', (target) => {
  /** How long the polygon through the points of a path is: the same however it is turned. */
  const span = (numbers: number[]): number => {
    let total = 0;
    for (let k = 2; k + 1 < numbers.length; k += 2) {
      total += Math.hypot(numbers[k]! - numbers[k - 2]!, numbers[k + 1]! - numbers[k - 1]!);
    }
    return total;
  };

  it.each([
    ['an arc', { curve: { shape: 'arc', degrees: 80, trim: 0 } }],
    ['a spline with two tips', { line: 'double_arrow', startTip: 'dot', curve: SPLINE }],
  ] as [string, Partial<LineFormula>][])(
    '%s: drawn along its way, its tip on the end of what is drawn',
    (_name, fields) => {
      const { evaluator, start } = growing(target, fields);
      const whole = evaluator.evaluate(2);
      expect(evaluator.evaluate(0)).toHaveLength(0);
      const half = evaluator.evaluate(0.5);
      expect(half).toHaveLength(whole.length);
      // The shaft: a cut of its path from its start, with its whole stroke in both libraries.
      const shaft = half[0]!.path.contours.flat();
      expect(half[0]!.partial).toBe(true);
      expect(shaft.slice(0, 2)[0]).toBeCloseTo(whole[0]!.path.contours[0]![0]!, 9);
      expect(shaft.slice(0, 2)[1]).toBeCloseTo(whole[0]!.path.contours[0]![1]!, 9);
      expect(half[0]!.stroke?.width).toBeCloseTo(whole[0]!.stroke!.width, 9);
      expect(span(shaft)).toBeLessThan(span(whole[0]!.path.contours.flat()));
      // The tip at the end: whole, away from where it ends, on the end of what is drawn.
      const tip = half[1]!.path.contours.flat();
      const end = shaft.slice(-2);
      expect(span(tip)).toBeCloseTo(span(whole[1]!.path.contours.flat()), 6);
      expect(Math.hypot(tip[0]! - end[0]!, tip[1]! - end[1]!)).toBeLessThan(0.36);
      const ending = whole[1]!.path.contours[0]!;
      expect(Math.hypot(tip[0]! - ending[0]!, tip[1]! - ending[1]!)).toBeGreaterThan(0.3);
      // It grows out of the start over the first quarter of the way: half its size at an eighth,
      // still near the start of an arrow more than two units long.
      const eighth = evaluator.evaluate(0.125);
      expect(span(eighth[1]!.path.contours.flat())).toBeCloseTo(span(tip) / 2, 6);
      expect(
        Math.hypot(...eighth[1]!.path.contours[0]!.slice(0, 2).map((v, k) => v - start[k]!)),
      ).toBeLessThan(1);
      // The tip at the start of a double arrow grows where it is, and stays.
      if (whole.length === 3) {
        expect(half[2]!.path.contours).toEqual(whole[2]!.path.contours);
        expect(span(eighth[2]!.path.contours.flat())).toBeCloseTo(
          span(whole[2]!.path.contours.flat()) / 2,
          6,
        );
      }
      // Once grown it is the arrow as it was built.
      const grown = evaluator.evaluate(1.5);
      grown.forEach((drawable, index) =>
        drawable.path.contours
          .flat()
          .forEach((v, k) =>
            expect(v, `member ${index}, number ${k}`).toBeCloseTo(
              whole[index]!.path.contours.flat()[k]!,
              9,
            ),
          ),
      );
    },
  );
});

/* A straight arrow grown again by an Appear block after a tween carried its ends (audit B4-02)
 * grows from the start the tween left: what is drawn at a progress is the arrow the tween left,
 * scaled by it about that point — not about the object's own start. The export check's
 * `arrows-regrown` has one in both libraries. */
describe.each(['ce', 'gl'] as const)(
  'an arrow grown again after a tween of its ends (%s)',
  (target) => {
    /** An arrow over [0, 10): carried to (−4, −2)–(−2, −2.5) over [1, 2), faded out at 3 s and
     * grown back over [5, 6) by an Appear block, at a steady rate. */
    function regrown() {
      const project = createEmptyProject();
      project.meta.target = target;
      const formula = createLineFormula({ name: 'l1', line: 'arrow', vector: [2, 0] });
      project.formulas.push(formula);
      const clip = createClip(formula.id, project.tracks[0]!.id, 0, 10, {
        intro: defaultIntro('none'),
        outro: defaultOutro('none'),
      });
      clip.initial.position = [0, 3];
      clip.actions.push(
        createEndsTween(
          1,
          1,
          { start: { point: [-4, -2] }, end: { point: [-2, -2.5] } },
          {},
          'linear',
        ),
        createDisappear(3, 'fade_out', 'all', { duration: 0.5 }),
        createAppear(5, 'grow_arrow', 'all', { duration: 1, easing: 'linear' }),
      );
      project.clips.push(clip);
      const local = refreshLocalRenders(project, new Map());
      const settled = settleScene(local.project, local.formulas, refreshLocalRenders);
      return exportEvaluator(settled.project, settled.formulas);
    }

    it('from the start the tween left', () => {
      const evaluator = regrown();
      const whole = evaluator.evaluate(6.5);
      expect(whole[0]!.path.contours[0]![0]).toBeCloseTo(-4, 9);
      expect(whole[0]!.path.contours[0]![1]).toBeCloseTo(-2, 9);
      for (const [t, s] of [
        [5.25, 0.25],
        [5.5, 0.5],
      ] as const) {
        const drawn = evaluator.evaluate(t);
        expect(drawn).toHaveLength(whole.length);
        drawn.forEach((drawable, index) => {
          const want = whole[index]!.path.contours.flat();
          drawable.path.contours.flat().forEach((v, k) => {
            const start = k % 2 === 0 ? -4 : -2;
            expect(v, `${t} s, member ${index}, number ${k}`).toBeCloseTo(
              start + s * (want[k]! - start),
              9,
            );
          });
        });
      }
    });
  },
);

/* A bent arrow grown again by an Appear block after a Transform carried its ends (audit A4-02)
 * grows as the arrow built between those ends grows: along the way the Transform left, its tip on
 * the end of what is drawn. ManimCE holds four points for each of its cubics, and the trace of the
 * line a Transform left read them as more curves than there are, which put the tip ahead of the
 * shaft. The export check's `arrows-regrown` holds both libraries to the preview. */
describe.each(['ce', 'gl'] as const)(
  'an arrow grown again after a Transform of its ends (%s)',
  (target) => {
    const arc = (degrees: number): LineCurve => ({ shape: 'arc', degrees, trim: 0 });
    const P: Vec2 = [-3, -1];
    const Q: Vec2 = [0.5, 0.6];

    /** The arrow `fields` over [0, 4): faded out at 0.2 s, its ends carried to P and Q (and its arc
     * to `degrees`) while away, grown back over [2, 3) by an Appear block, at a steady rate. */
    function regrown(fields: Partial<LineFormula>, degrees: number | null) {
      const project = createEmptyProject();
      project.meta.target = target;
      const formula = createLineFormula({ name: 'l1', line: 'arrow', vector: [2, 0.5], ...fields });
      project.formulas.push(formula);
      const clip = createClip(formula.id, project.tracks[0]!.id, 0, 4, {
        intro: defaultIntro('none'),
        outro: defaultOutro('none'),
      });
      clip.initial.position = [2, 2];
      clip.actions.push(
        createDisappear(0.2, 'fade_out', 'all', { duration: 0.3 }),
        createEndsTween(0.8, 0.4, { start: { point: P }, end: { point: Q }, degrees }),
        createAppear(2, 'grow_arrow', 'all', { duration: 1, easing: 'linear' }),
      );
      project.clips.push(clip);
      const local = refreshLocalRenders(project, new Map());
      const settled = settleScene(local.project, local.formulas, refreshLocalRenders);
      return exportEvaluator(settled.project, settled.formulas);
    }

    /** The arrow `fields` built between P and Q, grown over [2, 3) by its intro. */
    function fresh(fields: Partial<LineFormula>) {
      const project = createEmptyProject();
      project.meta.target = target;
      const vector: Vec2 = [Q[0] - P[0], Q[1] - P[1]];
      const formula = createLineFormula({ name: 'l1', line: 'arrow', ...fields, vector });
      project.formulas.push(formula);
      const clip = createClip(formula.id, project.tracks[0]!.id, 2, 4, {
        intro: { ...defaultIntro('grow_arrow'), duration: 1, easing: 'linear' },
        outro: defaultOutro('none'),
      });
      clip.initial.position = lineCentre(target, formula, P, vector);
      project.clips.push(clip);
      const local = refreshLocalRenders(project, new Map());
      return exportEvaluator(local.project, local.formulas);
    }

    it.each([
      ['an arc', { curve: arc(60) }, null],
      ['an arc that takes more degrees', { curve: arc(60) }, 120],
      [
        'a bent double arrow with a stealth tip',
        { line: 'double_arrow', tip: 'stealth', curve: arc(-80) },
        null,
      ],
    ] as [string, Partial<LineFormula>, number | null][])('%s', (_name, fields, degrees) => {
      const carried = regrown(fields, degrees);
      const built = fresh(degrees === null ? fields : { ...fields, curve: arc(degrees) });
      for (const t of [2.05, 2.1, 2.2, 2.4, 2.7, 2.95, 3.5]) {
        const got = carried.evaluate(t);
        const want = built.evaluate(t);
        expect(
          got.map((d) => d.glyph),
          `${t} s`,
        ).toEqual(want.map((d) => d.glyph));
        got.forEach((drawable, index) => {
          const a = drawable.path.contours.flat();
          const b = want[index]!.path.contours.flat();
          expect(a, `${t} s, member ${index}`).toHaveLength(b.length);
          a.forEach((v, k) =>
            expect(v, `${t} s, member ${index}, number ${k}`).toBeCloseTo(b[k]!, 9),
          );
        });
      }
    });
  },
);
