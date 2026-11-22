/* The source panel of each kind of object (D61, R2d): what the formula editor shows under its
 * common header for the fields Apply commits. A new kind adds its panel here, beside its row in
 * `KINDS` (`model/kinds.ts`). */
import type { Formula, FormulaKind, FormulaOfKind } from '../../../model';
import { braceSource } from './BraceSource';
import { lineSource } from './LineSource';
import { mathSource } from './MathSource';
import { shapeSource } from './ShapeSource';
import { texSource, textSource } from './TextSource';
import type { SourceDraft, SourcePanel } from './types';

export type { SourceDraft, SourcePanel, SourcePanelProps } from './types';
export { LINE_KINDS, LINE_LABELS } from './LineSource';
export {
  DIAGONAL_LABELS,
  SHAPE_DIAGONALS,
  SHAPE_KINDS,
  SHAPE_LABELS,
  storedDiagonal,
} from './ShapeSource';

export const SOURCE_PANELS: { readonly [K in FormulaKind]: SourcePanel<FormulaOfKind<K>> } = {
  math: mathSource,
  tex: texSource,
  text: textSource,
  brace: braceSource,
  shape: shapeSource,
  line: lineSource,
};

export function sourcePanelOf(formula: Pick<Formula, 'kind'>): SourcePanel {
  return SOURCE_PANELS[formula.kind] as SourcePanel;
}

/** `formula` with the draft's fields in place of its own. */
export function withDraft(formula: Formula, draft: SourceDraft): Formula {
  return { ...formula, ...draft } as Formula;
}

/** Whether two drafts hold the same values, field by field. */
export function sameDraft(a: SourceDraft, b: SourceDraft): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const field = (draft: SourceDraft, key: string) => (draft as Record<string, unknown>)[key];
  return [...keys].every((key) => JSON.stringify(field(a, key)) === JSON.stringify(field(b, key)));
}
