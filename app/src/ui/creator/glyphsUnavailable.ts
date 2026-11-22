/* Whether a glyph view has glyphs to show and, where it has none, why: in the words of the
 * formula editor, Edit together, the block glyph picker and the relation editor. Pure. */
import type { ResolvedFormula } from '../../engine';
import { isBlank, type Formula } from '../../model';
import type { FormulaRenderEntry } from '../../store';
import { describeRenderError } from './renderErrors';

/** The object was rendered and draws glyphs: there is something to show, colour and list. */
export function hasGlyphs(
  formula: Pick<Formula, 'snapshot'>,
  resolved: ResolvedFormula | null,
): resolved is ResolvedFormula {
  return resolved !== null && (formula.snapshot?.glyphs.length ?? 0) > 0;
}

export function glyphsUnavailable(
  formula: Pick<Formula, 'kind' | 'name' | 'source'> & { packages?: readonly string[] },
  entry: Pick<FormulaRenderEntry, 'status' | 'error'> | undefined,
): string {
  if (isBlank(formula)) return `${formula.name} is empty.`;
  if (entry?.status === 'error') {
    const why = entry.error ? describeRenderError(entry.error, formula) : 'unknown error';
    return `${formula.name} does not render: ${why}`;
  }
  if (entry?.status === 'ok') return `${formula.name} draws no glyphs.`;
  return 'Rendering the glyphs…';
}
