/* The source panel of a formula (`math`): its LaTeX, in a MathLive field and the raw textarea kept
 * in sync, under their title and the key of the on-screen keyboard (`LatexInput`), and its packages
 * (`PackagePicker`). */
import type { MathFormula } from '../../../model';
import { LatexInput } from '../LatexInput';
import { PackagePicker } from '../PackagePicker';
import type { SourcePanel, SourcePanelProps } from './types';

export function MathSourcePanel({
  draft,
  onChange,
  autoFocus,
  onApply,
}: SourcePanelProps<MathFormula>) {
  return (
    <>
      <LatexInput
        value={draft.source}
        packages={draft.packages}
        autoFocus={autoFocus}
        onChange={(latex) => onChange({ source: latex })}
        onApply={onApply}
      />

      <h3>Packages</h3>
      <PackagePicker packages={draft.packages} onChange={(packages) => onChange({ packages })} />
    </>
  );
}

export const mathSource: SourcePanel<MathFormula> = {
  draftOf: (formula) => ({ source: formula.source, packages: [...formula.packages] }),
  Panel: MathSourcePanel,
};
