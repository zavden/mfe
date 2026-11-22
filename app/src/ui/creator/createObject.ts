/* «+ New»: make an object of a kind and open what edits it — the Creator's button and its menu,
 * and the same pair on Zen mode's strip. */
import type { FormulaKind } from '../../model';
import { useTextComposition } from '../text/textCompositionStore';
import { createNewFormula } from './formulaActions';
import { openFormulaEditor } from './formulaEditorStore';

export function createObject(kind: FormulaKind): void {
  // A text is composed before it exists: Apply adds it to the project.
  if (kind === 'text' || kind === 'tex') {
    useTextComposition.getState().open(undefined, undefined, kind);
    return;
  }
  const id = createNewFormula(kind);
  openFormulaEditor(id, true);
}
