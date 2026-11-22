import { describe, expect, it } from 'vitest';
import type { TextSourceRange } from '../../model';
import { textGeometry } from '../../test/textGeometry';
import { fixedTextMeasurer, textBoxRanges, textBoxesRender } from '../textBoxes';
import { textArtifactRender } from '../pango';
import {
  matchTextGeometry,
  matchTextLayouts,
  textBoxesLayout,
  textGeometryLayout,
  textLayoutOf,
} from '../textMatch';

const exact = (source: string, ranges?: TextSourceRange[]) =>
  textGeometryLayout(textGeometry(source, ranges));
const boxes = (source: string) => textBoxesLayout(source);
const range = (start: number, end: number): TextSourceRange => ({ start, end });

/** "office" as a font with the ffi ligature shapes it: o, ffi, c, e. */
const OFFICE = [range(0, 1), range(1, 4), range(4, 5), range(5, 6)];

describe('the layout of a render', () => {
  it('is the one of its geometry', () => {
    const artifact = textGeometry('AB');
    expect(textLayoutOf(textArtifactRender(artifact))).toEqual({
      source: 'AB',
      glyphs: artifact.glyphs,
      boxes: false,
    });
  });

  it('is the one of its boxes, one glyph per range', () => {
    const font = { family: 'Any', weight: 'normal', slant: 'normal' } as const;
    const render = textBoxesRender(
      { source: 'a b', font, fontSize: 48, target: 'ce' },
      'k',
      fixedTextMeasurer,
    );
    expect(textLayoutOf(render)).toEqual({
      source: 'a b',
      glyphs: [
        { index: 0, sourceRanges: [range(0, 1)] },
        { index: 1, sourceRanges: [range(2, 3)] },
      ],
      boxes: true,
    });
    expect(textLayoutOf(render)).toEqual(textBoxesLayout('a b'));
  });

  it('is none for a render that knows no source range', () => {
    const render = { ...textArtifactRender(textGeometry('AB')), text: undefined };
    expect(textLayoutOf(render)).toBeNull();
  });
});

describe('from boxes to the glyphs a companion shaped', () => {
  it('is the identity where every character is one glyph', () => {
    const source = 'Hi there';
    expect(matchTextLayouts(boxes(source), exact(source))).toEqual({
      map: [0, 1, 2, 3, 4, 5, 6],
      confidence: 1,
    });
  });

  it('gives a ligature to the box of its first letter and leaves the others without one', () => {
    const match = matchTextLayouts(boxes('office'), exact('office', OFFICE));
    expect(match.map).toEqual([0, 1, null, null, 2, 3]);
    // Nothing is in doubt: the two boxes without a glyph are inside the ligature.
    expect(match.confidence).toBe(1);
  });

  it('gives the box of a letter to the first of the outlines its cluster has', () => {
    // An e with its accent drawn as a second outline: two glyphs of one cluster.
    const twice = exact('éx', [range(0, 2), range(0, 2), range(2, 3)]);
    expect(matchTextLayouts(boxes('éx'), twice).map).toEqual([0, 2]);
  });

  it('gives nothing to a box whose character the shaped text does not draw, and is less sure', () => {
    const match = matchTextLayouts(boxes('abc'), exact('abc', [range(0, 1), range(2, 3)]));
    expect(match.map).toEqual([0, null, 1]);
    expect(match.confidence).toBeCloseTo(2 / 3, 12);
  });
});

describe('from shaped glyphs to boxes', () => {
  it('is the identity where every character is one glyph', () => {
    expect(matchTextLayouts(exact('a bc'), boxes('a bc')).map).toEqual([0, 1, 2]);
  });

  it('gives the box of its first letter to a ligature', () => {
    expect(matchTextLayouts(exact('office', OFFICE), boxes('office')).map).toEqual([0, 1, 4, 5]);
  });

  it('gives the box to one outline of a cluster only', () => {
    const twice = exact('éx', [range(0, 2), range(0, 2), range(2, 3)]);
    expect(matchTextLayouts(twice, boxes('éx')).map).toEqual([0, null, 1]);
  });

  it('follows an edit: what stands before and after it keeps its box', () => {
    const match = matchTextLayouts(exact('AB'), boxes('AxyB'));
    expect(match.map).toEqual([0, 3]);
    // "office" shaped, then edited to "my office" with nothing to shape it.
    expect(matchTextLayouts(exact('office', OFFICE), boxes('my office')).map).toEqual([2, 3, 6, 7]);
  });

  it('drops the glyphs the edit touched', () => {
    expect(matchTextLayouts(exact('AxB'), boxes('AyB')).map).toEqual([0, null, 2]);
    // The ligature lost one of its letters: it is another cluster now.
    expect(matchTextLayouts(exact('office', OFFICE), boxes('ofice')).map).toEqual([0, null, 3, 4]);
  });
});

describe('a cluster with several outlines', () => {
  /** "éx" with its accent drawn apart and first: the mark (small), the letter (large), the x. */
  const marked = {
    source: 'éx',
    boxes: false,
    glyphs: [
      { index: 0, sourceRanges: [range(0, 2)], bbox: { minX: 0, minY: 0.8, maxX: 0.2, maxY: 1 } },
      { index: 1, sourceRanges: [range(0, 2)], bbox: { minX: 0, minY: 0, maxX: 0.5, maxY: 0.7 } },
      { index: 2, sourceRanges: [range(2, 3)], bbox: { minX: 0.6, minY: 0, maxX: 1.1, maxY: 0.7 } },
    ],
  };

  it('gives the box of the letter to the larger outline, whichever is drawn first', () => {
    const match = matchTextLayouts(boxes('éx'), marked);
    expect(match.map).toEqual([1, 2]);
    expect(match.confidence).toBe(1);
  });

  it('gives the box to the letter, not to its mark, on the way back', () => {
    expect(matchTextLayouts(marked, boxes('éx')).map).toEqual([null, 0, 1]);
  });

  it('still gives a ligature the box of its first letter', () => {
    // A ligature fi with a dot drawn apart: the large outline takes the f's box.
    const ligature = {
      source: 'fix',
      boxes: false,
      glyphs: [
        { index: 0, sourceRanges: [range(0, 2)], bbox: { minX: 0, minY: 0, maxX: 0.1, maxY: 0.1 } },
        { index: 1, sourceRanges: [range(0, 2)], bbox: { minX: 0, minY: 0, maxX: 0.8, maxY: 0.9 } },
        {
          index: 2,
          sourceRanges: [range(2, 3)],
          bbox: { minX: 0.9, minY: 0, maxX: 1.4, maxY: 0.6 },
        },
      ],
    };
    expect(matchTextLayouts(ligature, boxes('fix')).map).toEqual([1, 0, 2]);
    expect(matchTextLayouts(boxes('fix'), ligature).map).toEqual([1, 0, 2]);
  });
});

describe('text drawn right to left', () => {
  it('follows the source, not the order the glyphs are drawn in', () => {
    // Three Hebrew letters, shaped in visual order: the last of the source comes first.
    const shapedRtl = exact('אבג', [range(2, 3), range(1, 2), range(0, 1)]);
    expect(matchTextLayouts(boxes('אבג'), shapedRtl).map).toEqual([2, 1, 0]);
    expect(matchTextLayouts(shapedRtl, boxes('אבג')).map).toEqual([2, 1, 0]);
  });
});

describe('from boxes to boxes', () => {
  it('is the identity for the same source', () => {
    expect(matchTextLayouts(boxes('a b\nc'), boxes('a b\nc'))).toEqual({
      map: [0, 1, 2],
      confidence: 1,
    });
  });

  it('follows an insertion and a deletion', () => {
    expect(matchTextLayouts(boxes('AB'), boxes('AXB')).map).toEqual([0, 2]);
    expect(matchTextLayouts(boxes('AXB'), boxes('AB')).map).toEqual([0, null, 1]);
  });

  it('follows a new line break and new spaces: boxes are counted without them', () => {
    expect(matchTextLayouts(boxes('ab'), boxes('a\n b')).map).toEqual([0, 1]);
  });
});

describe('the correspondence', () => {
  it('never gives one glyph to two', () => {
    for (const [from, to] of [
      [boxes('office office'), exact('office office', [...OFFICE, ...OFFICE.map(shifted(7))])],
      [exact('office', OFFICE), boxes('office')],
      [boxes('aaa'), boxes('aa')],
    ] as const) {
      const targets = matchTextLayouts(from, to).map.filter((index) => index !== null);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });

  it('is sure of a text without glyphs', () => {
    expect(matchTextLayouts(boxes(''), exact('', []))).toEqual({ map: [], confidence: 1 });
  });

  it('between two geometries is what it was', () => {
    const ligature = textGeometry('office', OFFICE);
    expect(matchTextGeometry(ligature, textGeometry('office')).map).toEqual([0, null, 4, 5]);
    expect(matchTextGeometry(textGeometry('AB'), textGeometry('AXB')).map).toEqual([0, 2]);
  });

  it('of a long text takes no time to speak of', () => {
    const source = 'lorem ipsum dolor sit amet '.repeat(300);
    const ranges = textBoxRanges(source);
    expect(ranges.length).toBeGreaterThan(6000);
    const started = performance.now();
    const match = matchTextLayouts(boxes(source), exact(source, ranges));
    expect(performance.now() - started).toBeLessThan(500);
    expect(match.map).toEqual(ranges.map((_, index) => index));
  });
});

function shifted(by: number) {
  return ({ start, end }: TextSourceRange): TextSourceRange => ({
    start: start + by,
    end: end + by,
  });
}
