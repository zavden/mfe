import { describe, expect, it, vi } from 'vitest';
import { rectContour } from '../../geom';
import type { TextFont } from '../../model';
import {
  fixedTextMeasurer,
  layoutTextBoxes,
  savedBoxesRender,
  TEXT_BOXES_WARNING,
  TEXT_BOX_STYLE,
  TEXT_CE_GL_SIZE_RATIO,
  textBoxRanges,
  textBoxesRender,
  textEmUnits,
  textLinePitch,
  type TextMeasurer,
} from '../textBoxes';

const font: TextFont = { family: 'Any', weight: 'normal', slant: 'normal' };

/** Every grapheme half an em wide, its ink from the pen to its advance and 0.7 em tall. */
const square: TextMeasurer = {
  ink: () => ({ advance: 0.5, left: 0, right: 0.5, ascent: 0.7, descent: 0 }),
  lineHeight: () => 1.25,
};

const layout = (source: string, target: 'ce' | 'gl' = 'ce', measure = square) =>
  layoutTextBoxes({ source, font, fontSize: 72, target }, measure);

describe('which graphemes get a box', () => {
  it('is every grapheme that draws something, in source order', () => {
    expect(textBoxRanges('ab c')).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 3, end: 4 },
    ]);
  });

  it('leaves out spaces, tabs, line breaks and the characters that only steer the layout', () => {
    // A no-break space, a zero-width joiner, a left-to-right mark and a control character.
    expect(textBoxRanges(' \t\n ‍‎\u0007')).toEqual([]);
    expect(textBoxRanges('a\nb')).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ]);
  });

  it('gives one box to a letter with its combining accent, and to a character of two units', () => {
    expect(textBoxRanges('éx')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 3 },
    ]);
    expect(textBoxRanges('𝑥y')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 3 },
    ]);
  });

  it('keeps together what a joiner ties, an emoji with its modifier, and a flag', () => {
    const family = '👩‍💻';
    const thumb = '👍🏽';
    const flag = '🇪🇸';
    const heart = '❤️';
    const source = `${family}a${thumb}${flag}${flag}${heart}`;
    const labels = textBoxRanges(source).map(({ start, end }) => source.slice(start, end));
    expect(labels).toEqual([family, 'a', thumb, flag, flag, heart]);
  });

  it('gives a mark without a letter a box of its own, and a jamo each its own', () => {
    expect(textBoxRanges('́a')).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
    ]);
    // A Hangul syllable written jamo by jamo: three boxes here, the same in every browser.
    expect(textBoxRanges('한')).toHaveLength(3);
    expect(textBoxRanges('한')).toHaveLength(1);
  });

  it('does not ask the browser how to cut the text', () => {
    const segmenter = vi.spyOn(Intl, 'Segmenter');
    try {
      expect(textBoxRanges('é x')).toHaveLength(2);
      expect(segmenter).not.toHaveBeenCalled();
    } finally {
      segmenter.mockRestore();
    }
  });

  it('does not depend on the measurer', () => {
    const source = 'Fixed or not:\n the same boxes ñ é';
    const ranges = textBoxRanges(source);
    for (const measure of [square, fixedTextMeasurer]) {
      const { boxes } = layout(source, 'ce', measure);
      expect(boxes.map((box) => box.range)).toEqual(ranges);
      expect(boxes.map((box) => box.index)).toEqual(ranges.map((_, index) => index));
      expect(boxes.map((box) => box.label)).toEqual(
        ranges.map(({ start, end }) => source.slice(start, end)),
      );
    }
  });
});

describe('the units of a Text', () => {
  it('draws an em of ManimCE as font_size / 72 scene units', () => {
    expect(textEmUnits(72, 'ce')).toBe(1);
    expect(textEmUnits(48, 'ce')).toBeCloseTo(2 / 3, 12);
  });

  it('draws ManimGL the measured ratio smaller', () => {
    expect(textEmUnits(48, 'gl')).toBeCloseTo(48 / 72 / TEXT_CE_GL_SIZE_RATIO, 12);
    expect(textEmUnits(48, 'gl')).toBeCloseTo(0.4542, 4);
  });

  it('spaces the lines of ManimCE 0.975 em apart and ManimGL by the height of the font', () => {
    expect(textLinePitch('ce', 1.25)).toBe(0.975);
    expect(textLinePitch('gl', 1.25)).toBeCloseTo(1.2, 12);
  });
});

describe('the layout', () => {
  it('moves the pen by each advance, spaces included, and centres the whole', () => {
    const { boxes, bbox } = layout('ab c');
    // Pen at 0, 0.5 and 1.5 em; an em is one unit at font size 72 in ManimCE.
    expect(boxes.map(({ box }) => box.maxX - box.minX)).toEqual([0.5, 0.5, 0.5]);
    expect(boxes[1]!.box.minX - boxes[0]!.box.minX).toBeCloseTo(0.5, 12);
    expect(boxes[2]!.box.minX - boxes[0]!.box.minX).toBeCloseTo(1.5, 12);
    expect(bbox.minX).toBeCloseTo(-1, 12);
    expect(bbox.maxX).toBeCloseTo(1, 12);
    expect(bbox.minY).toBeCloseTo(-0.35, 12);
    expect(bbox.maxY).toBeCloseTo(0.35, 12);
  });

  it('starts every line at the left, one pitch below the last', () => {
    const ce = layout('ab\nc').boxes;
    expect(ce[2]!.box.minX).toBeCloseTo(ce[0]!.box.minX, 12);
    expect(ce[0]!.box.minY - ce[2]!.box.minY).toBeCloseTo(0.975, 12);
    const gl = layout('ab\nc', 'gl').boxes;
    const em = textEmUnits(72, 'gl');
    expect(gl[0]!.box.minY - gl[2]!.box.minY).toBeCloseTo(0.96 * 1.25 * em, 12);
  });

  it('keeps an empty line empty', () => {
    const { boxes } = layout('a\n\nb');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.box.minY - boxes[1]!.box.minY).toBeCloseTo(2 * 0.975, 12);
  });

  it('sets a tab as four spaces in ManimCE and to the next stop of eight in ManimGL', () => {
    const ce = layout('a\tb').boxes;
    expect(ce[1]!.box.minX - ce[0]!.box.minX).toBeCloseTo(0.5 + 4 * 0.5, 12);
    const em = textEmUnits(72, 'gl');
    const gl = layout('a\tb', 'gl').boxes;
    expect(gl[1]!.box.minX - gl[0]!.box.minX).toBeCloseTo(8 * 0.5 * em, 12);
    // Already on a stop: the tab goes on to the next one.
    const full = layout(`${'a'.repeat(8)}\tb`, 'gl').boxes;
    expect(full[8]!.box.minX - full[0]!.box.minX).toBeCloseTo(16 * 0.5 * em, 12);
  });

  it('uses the ink the measurer gives around the pen', () => {
    const measure: TextMeasurer = {
      ink: (grapheme) =>
        grapheme === 'g'
          ? { advance: 0.6, left: 0.1, right: 0.5, ascent: 0.5, descent: 0.2 }
          : { advance: 0.6, left: -0.1, right: 0.4, ascent: 0.7, descent: 0 },
      lineHeight: () => 1.2,
    };
    const { boxes } = layout('hg', 'ce', measure);
    // h: ink from 0.1 to 0.4; g: pen at 0.6, ink from 0.5 to 1.1, 0.2 below the baseline.
    expect(boxes[0]!.box.maxX - boxes[0]!.box.minX).toBeCloseTo(0.3, 12);
    expect(boxes[1]!.box.minX - boxes[0]!.box.minX).toBeCloseTo(0.4, 12);
    expect(boxes[1]!.box.maxX - boxes[1]!.box.minX).toBeCloseTo(0.6, 12);
    expect(boxes[0]!.box.minY - boxes[1]!.box.minY).toBeCloseTo(0.2, 12);
    expect(boxes[0]!.box.maxY - boxes[1]!.box.maxY).toBeCloseTo(0.2, 12);
  });

  it('still gives a box to a grapheme the measurer finds no ink for', () => {
    const blind: TextMeasurer = {
      ink: () => ({ advance: Number.NaN, left: 0, right: 0, ascent: 0, descent: 0 }),
      lineHeight: () => 1.2,
    };
    const { boxes } = layout('ab', 'ce', blind);
    expect(boxes).toHaveLength(2);
    for (const { box } of boxes) {
      expect(box.maxX - box.minX).toBeGreaterThan(0);
      expect(box.maxY - box.minY).toBeGreaterThan(0);
    }
    expect(boxes[1]!.box.minX).toBeGreaterThan(boxes[0]!.box.minX);
  });

  it('gives no box and an empty bounding box to a text that draws nothing', () => {
    expect(layout('')).toEqual({ boxes: [], bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } });
    expect(layout(' \n ').boxes).toEqual([]);
  });

  it('scales with the font size', () => {
    const small = layoutTextBoxes({ source: 'ab', font, fontSize: 36, target: 'ce' }, square);
    const large = layout('ab');
    expect(small.bbox.maxX).toBeCloseTo(large.bbox.maxX / 2, 12);
    expect(small.bbox.maxY).toBeCloseTo(large.bbox.maxY / 2, 12);
  });
});

describe('the measurer that knows no font', () => {
  it('gives every grapheme a plausible ink', () => {
    for (const grapheme of ['a', 'M', 'g', '.', 'é', '漢', '1', ' ']) {
      const ink = fixedTextMeasurer.ink(grapheme, font);
      expect(ink.advance).toBeGreaterThan(0);
      expect(ink.left + ink.right).toBeGreaterThan(0);
      expect(ink.ascent + ink.descent).toBeGreaterThan(0);
    }
    expect(fixedTextMeasurer.ink('g', font).descent).toBeGreaterThan(0);
    expect(fixedTextMeasurer.ink('h', font).ascent).toBeGreaterThan(
      fixedTextMeasurer.ink('x', font).ascent,
    );
  });
});

describe('a render of boxes', () => {
  const request = { source: 'Hi a', font, fontSize: 48, target: 'gl' as const };

  it('is a Pango render that is not exact and carries the range of each glyph', () => {
    const render = textBoxesRender(request, 'pango-key', square);
    expect(render).toMatchObject({
      key: 'pango-key',
      backend: 'pango',
      exact: false,
      target: 'gl',
      fontSize: 48,
      warnings: [TEXT_BOXES_WARNING],
      boxes: { source: 'Hi a', ranges: textBoxRanges('Hi a') },
    });
    expect(render.text).toBeUndefined();
    expect(render.glyphs.map((glyph) => glyph.label)).toEqual(['H', 'i', 'a']);
    expect(render.glyphs.map((glyph) => glyph.index)).toEqual([0, 1, 2]);
  });

  it('draws each glyph as the outline of its box, in the placeholder style', () => {
    const render = textBoxesRender(request, 'k', square);
    for (const glyph of render.glyphs) {
      expect(glyph.kind).toBe('char');
      expect(glyph.contours).toEqual([rectContour(glyph.bbox)]);
      expect(glyph.style).toEqual(TEXT_BOX_STYLE);
    }
    expect(render.bbox.minX).toBeCloseTo(-render.bbox.maxX, 12);
    expect(render.bbox.minY).toBeCloseTo(-render.bbox.maxY, 12);
  });

  it('of a text that draws nothing has no glyph', () => {
    const render = textBoxesRender({ ...request, source: '  ' }, 'k', square);
    expect(render.glyphs).toEqual([]);
    expect(render.boxes).toEqual({ source: '  ', ranges: [] });
  });
});

describe('boxes where the saved glyphs were', () => {
  it('draws one box per glyph of the snapshot, where it was and as large', () => {
    const render = savedBoxesRender(
      {
        backend: 'pango',
        key: 'pango-saved',
        glyphs: [
          { label: 'A', center: [-1, 0], size: [0.5, 1] },
          { label: 'fi', center: [1, 0.25], size: [1, 0.5] },
        ],
      },
      { target: 'ce', fontSize: 48 },
      'pango-boxes-of-saved',
    );
    expect(render).toMatchObject({
      key: 'pango-boxes-of-saved',
      backend: 'pango',
      exact: false,
      target: 'ce',
      fontSize: 48,
    });
    expect(render.boxes).toBeUndefined();
    expect(render.text).toBeUndefined();
    expect(render.glyphs.map((glyph) => [glyph.index, glyph.label, glyph.bbox])).toEqual([
      [0, 'A', { minX: -1.25, minY: -0.5, maxX: -0.75, maxY: 0.5 }],
      [1, 'fi', { minX: 0.5, minY: 0, maxX: 1.5, maxY: 0.5 }],
    ]);
    expect(render.bbox).toEqual({ minX: -1.25, minY: -0.5, maxX: 1.5, maxY: 0.5 });
    expect(render.warnings).toHaveLength(1);
  });

  it('of an empty snapshot is an empty render', () => {
    const render = savedBoxesRender(
      { backend: 'pango', key: 'k', glyphs: [] },
      { target: 'gl', fontSize: 30 },
      'k2',
    );
    expect(render.glyphs).toEqual([]);
    expect(render.bbox).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});
