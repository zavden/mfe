/* Labelled renders (docs/ARCHITECTURE.md §4, "Labelled renders"): which glyphs of a render
 * each LaTeX pattern covers.
 *
 * The formula is rendered once more, by the same backend, with every occurrence of a pattern
 * wrapped in a colour group (`model/texPattern.ts`, `labelledLatex`); the fill of each glyph of
 * that render names its pattern. Both backends keep the glyph count and order — ManimGL's
 * `Tex(t2c=…)` relies on the same — though the spacing may shift a little (`{+}` is an Ord
 * atom), so the labels map to the plain render by index when the counts and labels agree, and
 * by position (`matchGlyphs`) when they do not. A fill the plain render has as well (a colour
 * the author wrote, ManimGL's `{{ }}` labels) is no label: only what the labelled render adds
 * names a pattern. */
import { labelOfFill } from '../model';
import { normalizeLabel } from './glyphs';
import { glyphLikes } from './key';
import { matchGlyphs } from './match';
import { producerOf } from './producers';
import type { FormulaEngine, FormulaRender, RenderError, RenderRequest } from './types';

export { withColorPackage } from './producers';

export interface GlyphLabels {
  /** For each glyph of the plain render (render index): the pattern it belongs to, or null. */
  labels: (number | null)[];
  /** How the labelled render's glyphs were matched to the plain render's. */
  by: 'index' | 'position';
  /** 1 by index; the match confidence by position (below 0.8 the result is doubtful). */
  confidence: number;
}

export type LabelOutcome = ({ ok: true } & GlyphLabels) | { ok: false; error: RenderError };

/** The labels of `plain`'s glyphs, read from the fills of `labelled`'s. */
export function mapLabels(plain: FormulaRender, labelled: FormulaRender): GlyphLabels {
  const agree =
    plain.glyphs.length === labelled.glyphs.length &&
    plain.glyphs.every((g, i) => {
      const a = normalizeLabel(g.label);
      const b = normalizeLabel(labelled.glyphs[i]!.label);
      return a === '?' || b === '?' || a === b;
    });
  const label = (i: number, j: number) => {
    const fill = labelled.glyphs[i]!.fill;
    return fill === plain.glyphs[j]!.fill ? null : labelOfFill(fill);
  };
  if (agree) {
    return { labels: plain.glyphs.map((_, i) => label(i, i)), by: 'index', confidence: 1 };
  }
  const match = matchGlyphs(glyphLikes(labelled), glyphLikes(plain), 'position');
  const labels: (number | null)[] = plain.glyphs.map(() => null);
  match.map.forEach((j, i) => {
    if (j !== null) labels[j] = label(i, j);
  });
  return { labels, by: 'position', confidence: match.confidence };
}

/** Label the glyphs of `plain`, the render of `request`, through a render of `labelledSource`
 * — the object's source with its colour groups — by the same backend; the producer of the
 * object's kind makes that request. A source without colour groups needs no render: nothing is
 * labelled. */
export async function labelGlyphs(
  engine: Pick<FormulaEngine, 'render'>,
  request: RenderRequest,
  plain: FormulaRender,
  labelledSource: string,
): Promise<LabelOutcome> {
  const labelled = producerOf(request.kind).labelled(request, labelledSource);
  if (!labelled) {
    return { ok: true, labels: plain.glyphs.map(() => null), by: 'index', confidence: 1 };
  }
  const result = await engine.render({ ...labelled, prefer: plain.backend });
  if (!result.ok) return result;
  return { ok: true, ...mapLabels(plain, result.render) };
}
