/* The Creator's Duplicate, run from the menu of the selected formulas (it has no key of its own:
 * Ctrl/⌘+D is the timeline's, for clips and blocks). Copies keep the existing object capabilities
 * and do not duplicate timeline clips. The selected copy receives keyboard focus. */
import { history, useUiStore } from '../../store';
import { announce } from '../announcer';
import { isModalOpen } from '../project/modalStack';
import { selectedFormulaIds } from '../selection';
import { duplicateFormulas } from './formulaActions';

export function duplicateSelectedFormulas(): boolean {
  if (isModalOpen()) return false;
  history.cancelGesture();
  const ids = selectedFormulaIds(useUiStore.getState().selection);
  if (ids.length === 0) return false;
  const copies = duplicateFormulas(ids);
  if (copies.length === 0) return true;
  announce(copies.length === 1 ? 'Formula duplicated' : `${copies.length} formulas duplicated`);
  requestAnimationFrame(() => {
    if (isModalOpen() || !selectedFormulaIds(useUiStore.getState().selection).includes(copies[0]!))
      return;
    document
      .querySelector<HTMLElement>(
        `[data-testid="formula-list"] [data-formula-id="${CSS.escape(copies[0]!)}"]`,
      )
      ?.focus();
  });
  return true;
}
