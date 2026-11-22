// @vitest-environment node
/* Lines and arrows against what each library builds (fixtures/manim/gen_lines.py): where an end
 * that is on glyphs goes, what the buff leaves of the line, and every member — the line, its
 * dashes, its tips — point for point, with its stroke width. The expectations are the fixture's;
 * the glyphs of the two formulas are the fixture's too, so the ends are measured here as the
 * attach sync measures them. */
import { describe, expect, it } from 'vitest';
import { boxCenter, contoursBox, lineParts, type PointPath } from '../../geom';
import { createLineFormula, type LineKind, type Target, type Vec2 } from '../../model';
import { buffedEnds, manimLineEnds, type LineEndInput } from '../lines';
import { manimCurves, ourCurves, type Pt } from './manimFixture';
import linesCe from './fixtures/manim-lines-ce.json';
import linesGl from './fixtures/manim-lines-gl.json';

type EndJson = { point: Vec2 } | { formula: 'a' | 'b'; glyphs: number[] };
interface Member {
  cls: string;
  points: Pt[];
  fill: number[];
  stroke: number[];
  width: number;
}
interface Case {
  kind: LineKind;
  buff: number;
  transform: string;
  ends: string;
  from: EndJson;
  to: EndJson;
  options?: { strokeWidth: number | null; tipLength: number | null; dashLength: number | null };
  members: Member[];
  start: Vec2 | null;
  end: Vec2 | null;
  center: Vec2 | null;
}
interface Fixture {
  lib: Target;
  transforms: { name: string; a: Pt[][]; b: Pt[][] }[];
  cases: Case[];
}

const pathOf = (points: Pt[], lib: Target): PointPath => ({
  degree: lib === 'ce' ? 3 : 2,
  points: Float64Array.from(points.flat()),
});

/** The name of a case, as the fixture lists it. */
const named = (c: Case, index: number) =>
  `${index} ${c.kind} ${c.ends} ${c.transform} buff ${c.buff}`;

describe.each([linesCe, linesGl] as unknown as Fixture[])('Manim $lib lines', (fixture) => {
  const { lib } = fixture;
  // ManimGL holds its points as float32.
  const digits = lib === 'ce' ? 6 : 4;
  const glyphs = new Map(
    fixture.transforms.map((t) => [
      t.name,
      { a: t.a.map((g) => pathOf(g, lib)), b: t.b.map((g) => pathOf(g, lib)) },
    ]),
  );
  const input = (c: Case, end: EndJson): LineEndInput =>
    'point' in end
      ? { point: end.point }
      : { paths: end.glyphs.map((g) => glyphs.get(c.transform)![end.formula][g]!) };
  const optionsOf = (c: Case) => {
    const own = createLineFormula({ line: c.kind });
    return {
      strokeWidth: c.options?.strokeWidth ?? own.strokeWidth,
      tipLength: c.options?.tipLength ?? own.tipLength,
      dashLength: c.options?.dashLength ?? own.dashLength,
    };
  };
  const cases = fixture.cases.map((c, index) => [named(c, index), c] as const);

  it('samples every kind over every pair of ends', () => {
    expect(new Set(fixture.cases.map((c) => c.kind))).toEqual(
      new Set(['line', 'dashed', 'arrow', 'double_arrow']),
    );
    expect(new Set(fixture.cases.map((c) => c.ends)).size).toBe(8);
  });

  it.each(cases)('%s', (_name, c) => {
    const raw = manimLineEnds(lib, input(c, c.from), input(c, c.to));
    expect(raw, 'the ends can be read').not.toBeNull();
    const drawn = buffedEnds(lib, raw!, c.buff);
    const parts = lineParts(lib, c.kind, drawn.start, drawn.end, optionsOf(c));
    // As many members, each with the library's curves and its stroke width.
    expect(parts.map((p) => p.role).length, 'members').toBe(c.members.length);
    parts.forEach((part, k) => {
      const member = c.members[k]!;
      const want = manimCurves(member, lib);
      const have = ourCurves([part.contour]);
      expect(have.length, `member ${k}: curves`).toBe(want.length);
      have.forEach((curve, n) =>
        curve.forEach((v, j) =>
          expect(v, `member ${k} (${member.cls}) curve ${n}[${j}]`).toBeCloseTo(
            want[n]![j]!,
            digits,
          ),
        ),
      );
      expect(part.style.strokeWidth, `member ${k}: stroke width`).toBeCloseTo(member.width, 5);
      const filled = member.fill[3]! > 0;
      expect(part.style.fillOpacity > 0, `member ${k}: filled`).toBe(filled);
    });
    // What the library reads of the whole: its ends — a dashed line's are its first and last
    // dashes' — and the centre the clip is placed by.
    if (c.kind !== 'dashed' && c.start && c.end) {
      expect(drawn.start[0]).toBeCloseTo(c.start[0], digits);
      expect(drawn.start[1]).toBeCloseTo(c.start[1], digits);
      expect(drawn.end[0]).toBeCloseTo(c.end[0], digits);
      expect(drawn.end[1]).toBeCloseTo(c.end[1], digits);
    }
    if (c.center && parts.length > 0) {
      const centre = boxCenter(contoursBox(parts.map((p) => p.contour)));
      expect(centre[0]).toBeCloseTo(c.center[0], digits);
      expect(centre[1]).toBeCloseTo(c.center[1], digits);
    }
  });
});
