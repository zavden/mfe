import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextFont } from '../../model';
import { fixedTextMeasurer } from '../textBoxes';
import {
  canvasFont,
  createCanvasTextMeasurer,
  environmentTextMeasurer,
  setTextMeasurer,
  textMeasurer,
  type MeasuringContext,
} from '../textMeasure';

const font: TextFont = { family: 'DejaVu Sans', weight: 'normal', slant: 'normal' };

/** A context that answers in pixels at 100 px per em, as a canvas does. */
function fakeContext(fontBox: { ascent?: number; descent?: number } = { ascent: 93, descent: 24 }) {
  const context: MeasuringContext & { calls: [string, string][] } = {
    font: '',
    calls: [],
    measureText(text: string) {
      context.calls.push([context.font, text]);
      return {
        width: 60,
        actualBoundingBoxLeft: -5,
        actualBoundingBoxRight: 55,
        actualBoundingBoxAscent: 73,
        actualBoundingBoxDescent: 1,
        fontBoundingBoxAscent: fontBox.ascent,
        fontBoundingBoxDescent: fontBox.descent,
      } as TextMetrics;
    },
  };
  return context;
}

describe('the CSS font of the canvas', () => {
  it('names the family, the weight and the slant at 100 px, with a fallback', () => {
    expect(canvasFont(font)).toBe('100px "DejaVu Sans", sans-serif');
    expect(canvasFont({ family: 'Noto Serif', weight: 'bold', slant: 'italic' })).toBe(
      'italic bold 100px "Noto Serif", sans-serif',
    );
  });

  it('escapes what would close the family name', () => {
    expect(canvasFont({ ...font, family: 'A "quoted" \\ name' })).toBe(
      '100px "A \\"quoted\\" \\\\ name", sans-serif',
    );
  });
});

describe('the canvas measurer', () => {
  it('gives the ink of a grapheme in em', () => {
    const measure = createCanvasTextMeasurer(fakeContext());
    expect(measure.ink('a', font)).toEqual({
      advance: 0.6,
      left: -0.05,
      right: 0.55,
      ascent: 0.73,
      descent: 0.01,
    });
  });

  it('measures a grapheme once per font', () => {
    const context = fakeContext();
    const measure = createCanvasTextMeasurer(context);
    measure.ink('a', font);
    measure.ink('a', font);
    measure.ink('a', { ...font, weight: 'bold' });
    expect(context.calls).toEqual([
      ['100px "DejaVu Sans", sans-serif', 'a'],
      ['bold 100px "DejaVu Sans", sans-serif', 'a'],
    ]);
  });

  it('forgets its measures when it holds too many', () => {
    const context = fakeContext();
    const measure = createCanvasTextMeasurer(context, 2);
    for (const grapheme of ['a', 'b', 'c', 'a']) measure.ink(grapheme, font);
    expect(context.calls.map(([, text]) => text)).toEqual(['a', 'b', 'c', 'a']);
  });

  it('takes the line height from the font box, once per font', () => {
    const context = fakeContext();
    const measure = createCanvasTextMeasurer(context);
    expect(measure.lineHeight(font)).toBeCloseTo(1.17, 12);
    measure.lineHeight(font);
    expect(context.calls).toHaveLength(1);
  });

  it('falls back on a usual line height where the canvas does not give the font box', () => {
    const measure = createCanvasTextMeasurer(fakeContext({}));
    expect(measure.lineHeight(font)).toBe(fixedTextMeasurer.lineHeight(font));
  });
});

describe('the measurer of the environment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setTextMeasurer(null);
  });

  it('knows no font where there is no canvas that measures text', () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(environmentTextMeasurer()).toBe(fixedTextMeasurer);
  });

  it('uses the canvas where there is one', () => {
    const context = fakeContext();
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return context;
        }
      },
    );
    expect(environmentTextMeasurer().ink('a', font).advance).toBe(0.6);
  });

  it('knows no font where the canvas cannot be made', () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor() {
          throw new Error('no canvas here');
        }
      },
    );
    expect(environmentTextMeasurer()).toBe(fixedTextMeasurer);
  });

  it('is made once, and can be replaced', () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(textMeasurer()).toBe(textMeasurer());
    const other = createCanvasTextMeasurer(fakeContext());
    setTextMeasurer(other);
    expect(textMeasurer()).toBe(other);
    setTextMeasurer(null);
    expect(textMeasurer()).toBe(fixedTextMeasurer);
  });
});
