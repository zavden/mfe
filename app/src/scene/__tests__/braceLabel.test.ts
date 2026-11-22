// @vitest-environment node
/* Labels at the tip of Manim's braces (scene/attach.ts, the `tip` rule) against what each library
 * did (fixtures/manim/gen_brace_labels.py): a brace over the whole formula or a slice of it, as is
 * or scaled and rotated, on the four sides and at angles that round to a side, to a corner or close
 * to a half, and a label put at its tip with `put_at_tip(label, buff=…)` — small or wide, as is or
 * turned — or made by `get_tex` with the gap each library leaves. The brace is built as
 * brace.test.ts builds it; its tip, its direction, the side `np.round` makes of it and the label's
 * shift must be Manim's. */
import { describe, expect, it } from 'vitest';
import {
  braceShape,
  multiply,
  rotate,
  toPointPath,
  transformContour,
  transformPointPath,
  translate,
  type Mat2D,
} from '../../geom';
import { BRACE_LABEL_BUFF, type Target } from '../../model';
import { putAtTipShift, readBraceTip } from '../attach';
import { criticalPoint, manimBoxes, roundHalfEven } from '../measure';
import { contoursOf, type Pt } from './manimFixture';
import labelsCe from './fixtures/manim-brace-labels-ce.json';
import labelsGl from './fixtures/manim-brace-labels-gl.json';

interface LabelCase {
  transform: string;
  slice: string;
  direction: string;
  degrees: number;
  label: string;
  labelTransform: string;
  labelBuff: number | null;
  targetGlyphs: number[];
  tip: Pt;
  dir: Pt;
  rounded: Pt;
  shift: Pt;
  center: Pt;
}
interface Fixture {
  lib: Target;
  transforms: { name: string; glyphs: Pt[][] }[];
  labels: { name: string; transform: string; glyphs: Pt[][] }[];
  cases: LabelCase[];
}

/** Where Manim puts a brace: its shape moved by the target's lower-left corner and 0.2 down in the
 * frame where it points down, then turned to its direction about the origin. */
function placement(left: Pt, degrees: number): Mat2D {
  return multiply(rotate(degrees), translate(left[0], left[1] - 0.2));
}

describe.each([labelsCe, labelsGl] as unknown as Fixture[])('Manim $lib brace labels', (fx) => {
  const lib = fx.lib;
  // ManimCE's points are doubles (nine decimals kept); ManimGL stores float32.
  const tolerance = lib === 'ce' ? 1e-8 : 4e-6;
  const targetPaths = new Map(
    fx.transforms.map((t) => [t.name, t.glyphs.map((g) => toPointPath(contoursOf(g, lib), lib))]),
  );
  const labelPaths = new Map(
    fx.labels.map((label) => [
      label,
      label.glyphs.map((g) => toPointPath(contoursOf(g, lib), lib)),
    ]),
  );

  it.each(fx.cases)(
    '$transform · $slice · $direction · $label $labelTransform · buff $labelBuff',
    (c) => {
      const frame = rotate(-c.degrees);
      const target = manimBoxes(
        c.targetGlyphs.map((g) => transformPointPath(frame, targetPaths.get(c.transform)![g]!)),
        lib,
      )!;
      const width = target.critical.maxX - target.critical.minX;
      const shape = braceShape(lib, width, 2);
      const m = placement([target.critical.minX, target.critical.minY], c.degrees);
      // The brace's pieces as the evaluator hands them over: as built and as placed.
      const lists = shape.map((piece) => ({
        local: toPointPath([piece], lib),
        placed: toPointPath([transformContour(m, piece)], lib),
      }));
      const reading = readBraceTip(lists, lib)!;
      expect(reading.tip[0]).toBeCloseTo(c.tip[0], 6);
      expect(reading.tip[1]).toBeCloseTo(c.tip[1], 6);
      expect(reading.direction[0]).toBeCloseTo(c.dir[0], 6);
      expect(reading.direction[1]).toBeCloseTo(c.dir[1], 6);
      // `np.round` of the direction: a side, a corner — at 60° the brace's own centre decides.
      expect(reading.side.map((v) => v + 0)).toEqual(c.rounded.map((v) => v + 0));

      const label = fx.labels.find((l) => l.name === c.label && l.transform === c.labelTransform)!;
      const boxes = manimBoxes(labelPaths.get(label)!, lib)!;
      const shift = putAtTipShift(boxes, reading, c.labelBuff ?? BRACE_LABEL_BUFF[lib]);
      expect(Math.abs(shift[0] - c.shift[0])).toBeLessThan(tolerance);
      expect(Math.abs(shift[1] - c.shift[1])).toBeLessThan(tolerance);
      const centre = criticalPoint(boxes, [0, 0]);
      expect(centre[0] + shift[0]).toBeCloseTo(c.center[0], 5);
      expect(centre[1] + shift[1]).toBeCloseTo(c.center[1], 5);
    },
  );

  it('covers every side and two corners, and angles that Manim rounds away from their own', () => {
    const sides = new Set(fx.cases.map((c) => c.rounded.map((v) => v + 0).join()));
    for (const side of ['0,-1', '0,1', '-1,0', '1,0', '1,-1', '-1,1'])
      expect(sides).toContain(side);
    expect(fx.cases.some((c) => c.labelBuff === null)).toBe(true);
    // A tilted brace's centre is off its axis, so the direction Manim reads turns a few degrees:
    // at 30° and 62° it rounds to a corner where the angle itself would round to a side (at 30°,
    // np.round(0.5) = 0). Only a direction measured on the brace's points gets these right.
    const ownSide = (degrees: number) =>
      [Math.sin((degrees * Math.PI) / 180), -Math.cos((degrees * Math.PI) / 180)]
        .map((v) => roundHalfEven(v) + 0)
        .join();
    const turned = fx.cases.filter(
      (c) => ownSide(c.degrees) !== c.rounded.map((v) => v + 0).join(),
    );
    expect(new Set(turned.map((c) => c.direction))).toEqual(new Set(['angle30', 'angle62']));
  });
});
