/* The measurer of the placeholder boxes in a browser (`textBoxes.ts`): the canvas measures each
 * grapheme with the font the browser finds under the text's family name. That may not be the
 * font Pango would pick on the companion's machine (the browser falls back to its sans-serif when
 * it has no such family): the boxes are approximate, and say so. */
import type { TextFont } from '../model';
import { fixedTextMeasurer, type TextInk, type TextMeasurer } from './textBoxes';

/** Pixels per em while measuring: large enough for the canvas not to round the metrics away. */
const EM_PX = 100;

/** The CSS font of a canvas that measures `font` at `EM_PX`. */
export function canvasFont(font: TextFont): string {
  const family = `"${font.family.replace(/["\\]/g, '\\$&')}"`;
  const slant = font.slant === 'italic' ? 'italic ' : '';
  const weight = font.weight === 'bold' ? 'bold ' : '';
  return `${slant}${weight}${EM_PX}px ${family}, sans-serif`;
}

/** What of a 2D context the measurer uses. */
export interface MeasuringContext {
  font: string;
  measureText(text: string): TextMetrics;
}

/** A measurer over `context`, which it sets the font of; the measures of a grapheme are kept. */
export function createCanvasTextMeasurer(
  context: MeasuringContext,
  maxEntries = 4000,
): TextMeasurer {
  const inks = new Map<string, TextInk>();
  const heights = new Map<string, number>();
  const measure = (text: string, font: string): TextMetrics => {
    if (context.font !== font) context.font = font;
    return context.measureText(text);
  };
  return {
    ink(grapheme, font) {
      const css = canvasFont(font);
      const key = `${css}\n${grapheme}`;
      const known = inks.get(key);
      if (known) return known;
      const metrics = measure(grapheme, css);
      const ink: TextInk = {
        advance: metrics.width / EM_PX,
        left: metrics.actualBoundingBoxLeft / EM_PX,
        right: metrics.actualBoundingBoxRight / EM_PX,
        ascent: metrics.actualBoundingBoxAscent / EM_PX,
        descent: metrics.actualBoundingBoxDescent / EM_PX,
      };
      if (inks.size >= maxEntries) inks.clear();
      inks.set(key, ink);
      return ink;
    },
    lineHeight(font) {
      const css = canvasFont(font);
      const known = heights.get(css);
      if (known !== undefined) return known;
      const metrics = measure('x', css);
      const height = (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) / EM_PX;
      const value =
        Number.isFinite(height) && height > 0 ? height : fixedTextMeasurer.lineHeight(font);
      heights.set(css, value);
      return value;
    },
  };
}

/** The measurer of this environment: a canvas where there is one that measures text (a browser),
 * and otherwise the one that knows no font. */
export function environmentTextMeasurer(): TextMeasurer {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const context = new OffscreenCanvas(1, 1).getContext('2d');
      if (context) {
        context.textAlign = 'left';
        context.textBaseline = 'alphabetic';
        return createCanvasTextMeasurer(context);
      }
    }
  } catch {
    // A canvas that cannot be made (a locked-down page) is no canvas.
  }
  return fixedTextMeasurer;
}

let measurer: TextMeasurer | null = null;

/** The measurer the placeholder boxes are laid out with here (made on first use). */
export function textMeasurer(): TextMeasurer {
  return (measurer ??= environmentTextMeasurer());
}

/** Replace it (a test with known metrics); null goes back to the environment's. */
export function setTextMeasurer(next: TextMeasurer | null): void {
  measurer = next;
}
