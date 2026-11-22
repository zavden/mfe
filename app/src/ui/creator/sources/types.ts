/* What a source panel is (D61, R2d): the part of the formula editor that depends on the kind of
 * object, under the common header (name, tag, size, colour, Appears with). The editor keeps the
 * draft, the preview render, Apply, Revert and the glyph column; the panel edits the draft. */
import type { ComponentType } from 'react';
import type { Formula, FormulaBase } from '../../../model';

/** The fields of an object that Apply commits as one undo step: its source and the fields its
 * kind adds to `FormulaBase` (a formula's packages, a text's layout), never the common ones. */
export type SourceDraft<F extends Formula = Formula> = F extends unknown
  ? Pick<F, 'source' | Exclude<keyof F, keyof FormulaBase>>
  : never;

export interface SourcePanelProps<F extends Formula = Formula> {
  draft: SourceDraft<F>;
  /** The object's colour, a common field the header edits: what a shape's fill starts from when
   * it is given a colour of its own. */
  color?: string;
  /** Some fields of the draft changed (merged into it, so a change never overwrites another). */
  onChange(patch: Partial<SourceDraft<F>>): void;
  /** The object was just created: the main field takes the focus. */
  autoFocus?: boolean;
  /** Apply, asked from inside the panel (the Apply key of the on-screen keypad): the draft as it
   * stands, every change of the panel told before. */
  onApply?(): void;
}

export interface SourcePanel<F extends Formula = Formula> {
  /** The draft of an object as it stands (a copy: editing it leaves the object alone). */
  draftOf(formula: F): SourceDraft<F>;
  Panel: ComponentType<SourcePanelProps<F>>;
}
