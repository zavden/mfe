/* The source panel of a brace (`brace`): it has no source to write — its shape is Manim's,
 * fitted to the glyphs its clip hangs on — only ManimCE's sharpness and, once detached, its
 * width. The target, the direction and the gap belong to its clip (the Animations panel). */
import type { BraceFormula } from '../../../model';
import { CommitInput } from '../CommitInput';
import type { SourcePanel, SourcePanelProps } from './types';

const positive = (text: string, what: string) =>
  Number.isFinite(Number(text)) && Number(text) > 0 ? null : `A positive number${what}.`;

export function BraceSourcePanel({ draft, onChange }: SourcePanelProps<BraceFormula>) {
  return (
    <>
      <h3>Brace</h3>
      <p className="field-hint" data-testid="brace-source-hint">
        A brace has no source: it is fitted to the glyphs its clip hangs on. The target, the
        direction and the gap are set on the clip, in the Animations panel.
      </p>
      <div className="editor-fields">
        <span className="form-label">Sharpness</span>
        <span className="inline-fields">
          <CommitInput
            value={String(draft.sharpness)}
            label="Brace sharpness"
            testId="brace-sharpness"
            width="56px"
            validate={(text) => positive(text, '')}
            onCommit={(text) => onChange({ sharpness: Number(text) })}
          />
          <span className="field-hint">
            ManimCE only (2 is Manim&apos;s); ManimGL draws its brace from a font
          </span>
        </span>
        <span className="form-label">Width</span>
        <span className="inline-fields">
          <CommitInput
            value={String(+draft.width.toFixed(4))}
            label="Brace width"
            testId="brace-width"
            width="64px"
            validate={(text) => positive(text, ' of scene units')}
            onCommit={(text) => onChange({ width: Number(text) })}
          />
          <span className="field-hint">
            scene units; set by the target while the brace is attached
          </span>
        </span>
      </div>
    </>
  );
}

export const braceSource: SourcePanel<BraceFormula> = {
  draftOf: (formula) => ({
    source: formula.source,
    sharpness: formula.sharpness,
    width: formula.width,
  }),
  Panel: BraceSourcePanel,
};
