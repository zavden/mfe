// @vitest-environment node
/* An arrow unwritten in the preview erases as Manim does (audit A4-01): ManimCE's `Unwrite`
 * inverts every list of submobjects (`invert(recursive=True)`) and a mobject stays before its own,
 * so an arrow's shaft — the line itself — goes first and its tips after it, the last one first;
 * the export's ManimGL `_Unwrite` takes them in the same order. A formula's glyphs still go from
 * the last. The export check's case `arrow-unwrites` holds both libraries to it frame by frame. */
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import {
  createClip,
  createEmptyProject,
  createLineFormula,
  defaultIntro,
  defaultOutro,
  type LineFormula,
  type Target,
} from '../../model';
import { exportEvaluator } from '../evaluator';
import type { Drawable } from '../types';

/** A free line object of `fields`, whole until its outro unwrites it, linearly, over [1, 2). */
function unwritten(target: Target, fields: Partial<LineFormula>) {
  const project = createEmptyProject();
  project.meta.target = target;
  const formula = createLineFormula({ name: 'l1', vector: [3, 1], ...fields });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 2, {
    intro: defaultIntro('none'),
    outro: { ...defaultOutro('unwrite'), duration: 1, easing: 'linear' },
  });
  project.clips.push(clip);
  const local = refreshLocalRenders(project, new Map());
  return exportEvaluator(local.project, local.formulas);
}

/** The glyphs of the line, in the order the outro starts to take them: the first instant each is
 * drawn otherwise than whole, sampled every 1/240 s. */
function erasedOrder(target: Target, fields: Partial<LineFormula>): number[] {
  const evaluator = unwritten(target, fields);
  const look = (d: Drawable) => JSON.stringify([d.path, d.fill, d.stroke]);
  const whole = new Map(evaluator.evaluate(0.5).map((d) => [d.glyph, look(d)]));
  const first = new Map<number, number>();
  for (let k = 0; k <= 240; k++) {
    const t = 1 + k / 240;
    const now = new Map(evaluator.evaluate(t).map((d) => [d.glyph, look(d)]));
    for (const [glyph, was] of whole) {
      if (!first.has(glyph) && now.get(glyph) !== was) first.set(glyph, t);
    }
  }
  expect(first.size).toBe(whole.size);
  return [...first].sort((a, b) => a[1] - b[1]).map(([glyph]) => glyph);
}

describe.each(['ce', 'gl'] as const)('an arrow unwritten (%s)', (target) => {
  it.each([
    ['an arrow', { line: 'arrow' }, [0, 1]],
    ['a double arrow', { line: 'double_arrow' }, [0, 2, 1]],
    [
      'a bent double arrow with stealth tips',
      {
        line: 'double_arrow',
        curve: { shape: 'arc', degrees: 70, trim: 0 },
        tip: 'stealth',
        startTip: 'stealth',
      },
      [0, 2, 1],
    ],
  ] as [string, Partial<LineFormula>, number[]][])(
    '%s: the shaft first, then the tips from the last',
    (_name, fields, order) => {
      expect(erasedOrder(target, fields)).toEqual(order);
    },
  );

  it('a dashed line: the last dash first', () => {
    const order = erasedOrder(target, { line: 'dashed', dashLength: 0.4 });
    expect(order.length).toBeGreaterThan(2);
    expect(order).toEqual([...order].sort((a, b) => b - a));
  });
});
