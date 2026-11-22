// @vitest-environment node
/* The brace shapes on their own (geom/brace.ts): the sizes and branches of each library's build.
 * Their points are checked against Manim's in scene/__tests__/brace.test.ts. */
import { describe, expect, it } from 'vitest';
import {
  braceShape,
  braceTip,
  braceTipIndex,
  CE_BRACE_MIN_WIDTH,
  ceBraceShape,
  contoursBox,
  glBraceShape,
  GL_BRACE_PIECES,
  rotate,
  toPointPath,
  translate,
} from '..';

const widthOf = (shape: ReturnType<typeof braceShape>) => {
  const box = contoursBox(shape);
  return box.maxX - box.minX;
};

describe('ceBraceShape', () => {
  it('is one closed contour of 25 cubics, as wide as asked, its corner at the origin', () => {
    for (const width of [0.3, 1, 2.5]) {
      const [contour] = ceBraceShape(width, 2);
      expect((contour!.length - 2) / 6).toBe(25);
      expect(contour![0]).toBeCloseTo(contour![contour!.length - 2]!, 6);
      // The corner is the anchors' (where ManimCE reads it); a handle bulges a hair past it.
      const box = contoursBox([contour!]);
      expect(box.minX).toBeCloseTo(0, 12);
      expect(box.maxY).toBeCloseTo(0, 6);
      expect(box.maxX).toBeCloseTo(width, 12);
    }
  });

  it('grows its straight runs with the sharpness, none below the minimum width', () => {
    const height = (sharpness: number) => {
      const box = contoursBox(ceBraceShape(1, sharpness));
      return box.maxY - box.minY;
    };
    // The runs only lengthen the flat parts: stretched back to the width, the ends get sharper
    // while the height stays the template's.
    expect(height(1)).toBeCloseTo(height(2), 12);
    expect(ceBraceShape(1, 2)).not.toEqual(ceBraceShape(1, 1));
    // Below the minimum width the template has no runs at all: the same shape, stretched.
    expect(ceBraceShape(1, 0.5)).toEqual(ceBraceShape(1, CE_BRACE_MIN_WIDTH * 0.99));
  });
});

describe('glBraceShape', () => {
  const natural = (() => {
    const all = GL_BRACE_PIECES.flat();
    const xs = all.filter((_, i) => i % 2 === 0);
    return Math.max(...xs) - Math.min(...xs);
  })();

  it('has six pieces whose rules stretch and whose hooks move for a wide target', () => {
    const narrow = glBraceShape(natural);
    const wide = glBraceShape(natural + 1);
    expect(wide).toHaveLength(6);
    expect(widthOf(wide)).toBeCloseTo(natural + 1, 12);
    // The tip (pieces 2 and 3) keeps its shape and its place relative to the centre.
    const tipOf = (shape: typeof wide) => contoursBox([shape[2]!, shape[3]!]);
    const centreOf = (shape: typeof wide) => {
      const box = contoursBox(shape);
      return (box.minX + box.maxX) / 2;
    };
    const a = tipOf(narrow);
    const b = tipOf(wide);
    expect(b.maxX - b.minX).toBeCloseTo(a.maxX - a.minX, 12);
    expect(b.minX - centreOf(wide)).toBeCloseTo(a.minX - centreOf(narrow), 12);
    // The rules grew by half a unit each.
    const ruleWidth = (shape: typeof wide, i: number) => {
      const box = contoursBox([shape[i]!]);
      return box.maxX - box.minX;
    };
    expect(ruleWidth(wide, 1) - ruleWidth(narrow, 1)).toBeCloseTo(0.5, 12);
    expect(ruleWidth(wide, 4) - ruleWidth(narrow, 4)).toBeCloseTo(0.5, 12);
  });

  it('squeezes the whole brace for a narrower target', () => {
    const shape = glBraceShape(natural / 2);
    expect(widthOf(shape)).toBeCloseTo(natural / 2, 12);
    const box = contoursBox(shape);
    expect(box.minX).toBeCloseTo(0, 12);
    expect(box.maxY).toBeCloseTo(0, 12);
    for (let i = 0; i < 6; i++) {
      const own = contoursBox([shape[i]!]);
      const was = contoursBox(glBraceShape(natural).slice(i, i + 1));
      expect(own.maxX - own.minX).toBeCloseTo((was.maxX - was.minX) / 2, 12);
    }
  });

  it('gives ManimGL its quadratics back exactly', () => {
    const shape = glBraceShape(2);
    shape.forEach((piece, i) => {
      expect(toPointPath([piece], 'gl').points.length / 2).toBe(GL_BRACE_PIECES[i]!.length / 2);
    });
  });
});

describe('braceShape', () => {
  it('builds the library asked for', () => {
    expect(braceShape('ce', 1, 2)).toHaveLength(1);
    expect(braceShape('gl', 1, 2)).toHaveLength(6);
    expect(widthOf(braceShape('gl', 1.7, 2))).toBeCloseTo(1.7, 12);
  });
});

describe('braceTipIndex', () => {
  it.each(['ce', 'gl'] as const)(
    'finds the tip in the piece lists, wherever the brace was moved since (%s)',
    (lib) => {
      const shape = braceShape(lib, 1.7, 2);
      const lists = shape.map((piece) => toPointPath([piece], lib));
      const at = braceTipIndex(lib, lists)!;
      // The tip half of ManimGL's six pieces holds it; ManimCE has one path.
      expect(at.path).toBe(lib === 'ce' ? 0 : 2);
      const tip = braceTip(lib, shape, translate(0, 0));
      expect([lists[at.path]!.points[at.offset], lists[at.path]!.points[at.offset + 1]]).toEqual(
        tip,
      );
      // Found where the brace points down, read where it is: braceTip moves the same point.
      const m = rotate(35);
      const moved = braceTip(lib, shape, m);
      const [x, y] = tip;
      expect(moved[0]).toBeCloseTo(m[0] * x + m[2] * y, 12);
      expect(moved[1]).toBeCloseTo(m[1] * x + m[3] * y, 12);
      expect(braceTipIndex(lib, [])).toBeNull();
    },
  );
});
