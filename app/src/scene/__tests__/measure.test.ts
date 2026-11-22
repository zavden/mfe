// @vitest-environment node
/* Manim's box rule (scene/measure.ts): on shapes whose control points bulge past their anchors, and
 * on real LaTeX glyphs recorded by each library (fixtures/manim/gen_boxes.py) — the whole formula and
 * a slice of it, as is, scaled, rotated and flipped, with where `next_to` put a second formula. */
import { describe, expect, it } from 'vitest';
import { lineTo, toPointPath, type Contour } from '../../geom';
import type { AttachSide, Target } from '../../model';
import {
  criticalPoint,
  manimBoxes,
  nextToPointShift,
  nextToShift,
  roundHalfEven,
  SIDE_VECTORS,
  type ManimBoxes,
} from '../measure';
import { contoursOf, type Pt } from './manimFixture';
import boxesCe from './fixtures/manim-boxes-ce.json';
import boxesGl from './fixtures/manim-boxes-gl.json';

interface Reading {
  center: Pt;
  dl: Pt;
  ur: Pt;
  width: number;
  height: number;
}
interface Fixture {
  lib: Target;
  labelPoints: Pt[][];
  transforms: {
    name: string;
    glyphs: Pt[][];
    whole: Reading;
    part: Reading;
    nextTo: { side: AttachSide; target: 'part' | 'whole'; buff: number; shift: Pt }[];
  }[];
}

/** A closed shape of one cubic from (0, 0) to (1, 0) whose handles reach y = 2, and a line back. */
function bulge(): Contour {
  const c: Contour = [0, 0, 0, 2, 1, 2, 1, 0];
  lineTo(c, 0, 0);
  return c;
}

describe('manimBoxes', () => {
  it('ManimCE reads corners and centres from the anchors, sizes from every point', () => {
    const boxes = manimBoxes([toPointPath([bulge()], 'ce')], 'ce')!;
    expect(boxes.size).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 2 });
    expect(boxes.critical).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 0 });
    expect(criticalPoint(boxes, [0, 0])).toEqual([0.5, 0]);
    expect(criticalPoint(boxes, [1, 1])).toEqual([1, 0]);
    expect(criticalPoint(boxes, [-1, 0])).toEqual([0, 0]);
  });

  it('ManimGL reads every point for both', () => {
    const boxes = manimBoxes([toPointPath([bulge()], 'gl')], 'gl')!;
    expect(boxes.critical).toBe(boxes.size);
    expect(boxes.size.minX).toBe(0);
    expect(boxes.size.maxX).toBe(1);
    expect(boxes.size.maxY).toBeGreaterThan(1); // the quadratic handles bulge too
  });

  it('is null without points, and unites the paths of a group', () => {
    expect(manimBoxes([], 'ce')).toBeNull();
    const shifted: Contour = bulge().map((v, i) => (i % 2 === 0 ? v + 3 : v)) as Contour;
    const boxes = manimBoxes([toPointPath([bulge()], 'ce'), toPointPath([shifted], 'ce')], 'ce')!;
    expect(boxes.critical).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 0 });
  });

  it('nextToShift lands the facing edge buff away, centred on the other axis', () => {
    const square = (x: number, y: number, s: number): ManimBoxes => {
      const box = { minX: x, minY: y, maxX: x + s, maxY: y + s };
      return { size: box, critical: box };
    };
    const target = square(0, 0, 2);
    const object = square(10, 10, 1);
    expect(nextToShift(object, target, 'down', 0.25)).toEqual([-9.5, -11.25]);
    expect(nextToShift(object, target, 'up', 0.25)).toEqual([-9.5, -7.75]);
    expect(nextToShift(object, target, 'left', 0.5)).toEqual([-11.5, -9.5]);
    expect(nextToShift(object, target, 'right', 0)).toEqual([-8, -9.5]);
    expect(SIDE_VECTORS.down).toEqual([0, -1]);
  });
});

describe.each([boxesCe, boxesGl] as unknown as Fixture[])(
  'Manim $lib boxes of real glyphs',
  (fx) => {
    // The GL fixture goes through the quadratic ↔ cubic conversions (1e-5 of noise, as in the morph
    // fixtures); the CE one keeps the very points.
    const tolerance = fx.lib === 'ce' ? 5e-6 : 2e-5;
    const close = (actual: number, expected: number, what: string) =>
      expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
        tolerance,
      );
    const pathsOf = (glyphs: Pt[][]) =>
      glyphs.map((points) => toPointPath(contoursOf(points, fx.lib), fx.lib));
    const check = (boxes: ManimBoxes, reading: Reading, what: string) => {
      const center = criticalPoint(boxes, [0, 0]);
      const dl = criticalPoint(boxes, [-1, -1]);
      const ur = criticalPoint(boxes, [1, 1]);
      close(center[0], reading.center[0], `${what} center x`);
      close(center[1], reading.center[1], `${what} center y`);
      close(dl[0], reading.dl[0], `${what} DL x`);
      close(dl[1], reading.dl[1], `${what} DL y`);
      close(ur[0], reading.ur[0], `${what} UR x`);
      close(ur[1], reading.ur[1], `${what} UR y`);
      close(boxes.size.maxX - boxes.size.minX, reading.width, `${what} width`);
      close(boxes.size.maxY - boxes.size.minY, reading.height, `${what} height`);
    };
    const label = () => manimBoxes(pathsOf(fx.labelPoints), fx.lib)!;

    for (const tr of fx.transforms) {
      it(`${tr.name}: the whole formula and a slice read as Manim reads them`, () => {
        check(manimBoxes(pathsOf(tr.glyphs), fx.lib)!, tr.whole, 'whole');
        check(manimBoxes(pathsOf(tr.glyphs.slice(2, 5)), fx.lib)!, tr.part, 'part');
      });

      it(`${tr.name}: next_to lands the label where Manim put it`, () => {
        const whole = manimBoxes(pathsOf(tr.glyphs), fx.lib)!;
        const part = manimBoxes(pathsOf(tr.glyphs.slice(2, 5)), fx.lib)!;
        for (const n of tr.nextTo) {
          const shift = nextToShift(label(), n.target === 'part' ? part : whole, n.side, n.buff);
          close(shift[0], n.shift[0], `${n.side} of ${n.target} x`);
          close(shift[1], n.shift[1], `${n.side} of ${n.target} y`);
        }
      });
    }

    it('the rotated formula tells the two rules apart', () => {
      const rotated = fx.transforms.find((t) => t.name === 'rotated')!;
      const boxes = manimBoxes(pathsOf(rotated.glyphs), fx.lib)!;
      const anchorsCentre = (boxes.critical.minY + boxes.critical.maxY) / 2;
      const everyCentre = (boxes.size.minY + boxes.size.maxY) / 2;
      if (fx.lib === 'ce') expect(Math.abs(anchorsCentre - everyCentre)).toBeGreaterThan(1e-3);
      else expect(anchorsCentre).toBe(everyCentre);
    });
  },
);

describe('roundHalfEven', () => {
  it('rounds as np.round does: halves to the even integer', () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 0.49, 0.51, -0.51, -0.9].map(roundHalfEven)).toEqual([
      0, 2, 2, -0, -2, 0, 1, -1, -1,
    ]);
  });
});

describe('nextToPointShift', () => {
  const boxes = (minX: number, minY: number, maxX: number, maxY: number): ManimBoxes => {
    const box = { minX, minY, maxX, maxY };
    return { size: box, critical: box };
  };
  it('puts the edge or the corner opposite the direction on the point, buff further along it', () => {
    const label = boxes(-1, -0.5, 1, 0.5);
    // Below a point: the top edge's centre lands 0.25 under it.
    expect(nextToPointShift(label, [2, 3], [0, -1], 0.25)).toEqual([2, 3 - 0.25 - 0.5]);
    // At a corner: the upper-left corner, 0.1 along both axes (Manim does not normalise).
    expect(nextToPointShift(label, [2, 3], [1, -1], 0.1)).toEqual([2 + 0.1 + 1, 3 - 0.1 - 0.5]);
    // nextToShift is the same, aimed at the target's edge.
    const target = boxes(0, 0, 4, 2);
    expect(nextToShift(label, target, 'up', 0.2)).toEqual(
      nextToPointShift(label, [2, 2], [0, 1], 0.2),
    );
  });
});
