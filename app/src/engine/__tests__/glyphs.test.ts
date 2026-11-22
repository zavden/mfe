// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { boxCenter, contoursSignedArea, rectContour, type Contour } from '../../geom';
import { buildGlyphs, displayLabel, normalizeLabel } from '../glyphs';

describe('buildGlyphs', () => {
  it('flips y, centres the union box and scales', () => {
    const { glyphs, bbox } = buildGlyphs(
      [
        {
          label: 'a',
          kind: 'char',
          contours: [rectContour({ minX: 0, minY: 0, maxX: 2, maxY: 1 })],
        },
        {
          label: '—',
          kind: 'rule',
          contours: [rectContour({ minX: 0, minY: 3, maxX: 4, maxY: 4 })],
        },
      ],
      0.5,
      'ce',
    );
    expect(bbox).toEqual({ minX: -1, minY: -1, maxX: 1, maxY: 1 });
    // SVG y down: the first glyph (y 0…1) is on top after the flip.
    expect(glyphs[0]!.bbox).toEqual({ minX: -1, minY: 0.5, maxX: 0, maxY: 1 });
    expect(glyphs.map((g) => g.index)).toEqual([0, 1]);
    expect(boxCenter(glyphs[1]!.bbox)).toEqual([0, -0.75]);
  });

  it('reverses clockwise glyphs for ManimGL (ensure_positive_orientation), keeps them for CE', () => {
    // A rule: Manim's Rectangle runs counter-clockwise, so it is clockwise once y is flipped.
    // A character outline from a Type 1 font runs clockwise in SVG space, counter-clockwise after.
    const rule = rectContour({ minX: 0, minY: 0, maxX: 4, maxY: 1 });
    const char: Contour = [0, 2];
    for (const [x, y] of [
      [1, 4],
      [2, 2],
      [0, 2],
    ] as [number, number][]) {
      char.push(x, y, x, y, x, y); // straight segments
    }
    const raw = [
      { label: '—', kind: 'rule' as const, contours: [rule] },
      { label: 'a', kind: 'char' as const, contours: [char] },
    ];
    const ce = buildGlyphs(raw, 1, 'ce').glyphs;
    const gl = buildGlyphs(raw, 1, 'gl').glyphs;
    expect(contoursSignedArea(ce[0]!.contours)).toBeLessThan(0);
    expect(contoursSignedArea(ce[1]!.contours)).toBeGreaterThan(0);
    expect(contoursSignedArea(gl[0]!.contours)).toBeGreaterThan(0);
    expect(gl[1]).toEqual(ce[1]);
    // The reversed rule starts where it did and runs the other way: its second anchor is the
    // CE contour's last-but-one.
    const ceRule = ce[0]!.contours[0]!;
    const glRule = gl[0]!.contours[0]!;
    expect(glRule.slice(0, 2)).toEqual(ceRule.slice(0, 2));
    expect(glRule.slice(6, 8)).toEqual(ceRule.slice(18, 20));
    expect(gl[0]!.bbox).toEqual(ce[0]!.bbox);
  });

  it('accepts an empty list', () => {
    expect(buildGlyphs([], 1, 'ce')).toEqual({
      glyphs: [],
      bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    });
  });
});

describe('labels', () => {
  it('shows math alphanumerics as plain letters', () => {
    expect(displayLabel('𝑎')).toBe('a');
    expect(displayLabel('ℎ')).toBe('h');
    expect(displayLabel('…')).toBe('…'); // NFKC would give three characters
  });

  it('treats TeX and MathJax variants as equal', () => {
    expect(normalizeLabel('-')).toBe(normalizeLabel('−'));
    expect(normalizeLabel('⃗')).toBe(normalizeLabel('→'));
    expect(normalizeLabel('ˆ')).toBe(normalizeLabel('^'));
    expect(normalizeLabel('–')).toBe('—');
    expect(normalizeLabel('a')).not.toBe(normalizeLabel('b'));
  });
});
