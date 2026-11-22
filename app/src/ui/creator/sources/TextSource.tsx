/* The generic source registry remains exhaustive; a text (with a font, or LaTeX) is routed to the
 * composition workspace before a FormulaEditor is mounted (`formulaEditorStore.ts`), so these
 * panels only say so. */
import type { TexFormula, TextFormula } from '../../../model';
import type { SourcePanel } from './types';

export const textSource: SourcePanel<TextFormula> = {
  draftOf: (formula) => ({
    source: formula.source,
    font: { ...formula.font },
    geometry: formula.geometry,
  }),
  Panel: () => <p>Use the text composition editor to edit this object.</p>,
};

export const texSource: SourcePanel<TexFormula> = {
  draftOf: (formula) => ({ source: formula.source, layout: { ...formula.layout } }),
  Panel: () => <p>Use the text composition editor to edit this object.</p>,
};
