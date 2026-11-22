/* Editor defaults shared by ordinary objects and objects created for attachments. */
import {
  createFormulaOfKind,
  nextFormulaName,
  TAG_COLORS,
  type Formula,
  type FormulaKind,
  type FormulaOfKind,
} from '../../model';
import { newFontSize, type StandardScale } from './standardScale';
import { paletteRoleForKind, type PaletteColors } from '../colors/palette';

/** Create one object using the editor's current defaults without changing existing objects. */
export function createEditorFormula<K extends FormulaKind>(
  kind: K,
  formulas: readonly Formula[],
  standardScale: StandardScale,
  fields: Partial<Omit<FormulaOfKind<K>, 'id' | 'kind'>> = {},
  colors?: PaletteColors,
): Formula {
  const formula = createFormulaOfKind(kind, {
    name: nextFormulaName(kind, formulas),
    fontSize: newFontSize(kind, standardScale),
    tag: { color: TAG_COLORS[formulas.length % TAG_COLORS.length]!, icon: null },
    ...fields,
  });
  if (colors && fields.color === undefined) {
    formula.color =
      colors[paletteRoleForKind(kind, formula.kind === 'shape' ? formula.shape : undefined)];
  }
  return formula;
}
