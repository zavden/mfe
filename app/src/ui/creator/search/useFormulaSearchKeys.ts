/* Escape closes the search of formulas (FormulaSearchPanel) wherever the focus is — the search is
 * no dialog, the rest of the app stays in use beside it — unless the key is somebody else's: a
 * dialog's, a menu's, a field's that takes an edit back with it, a drag's. Those hear it first
 * and stop it, or are told here by what has the focus. */
import { useEffect } from 'react';
import { inOpenMenu } from '../../focus';
import { fieldOwnsEscape, isModalOpen } from '../../project/modalStack';
import { closeFormulaSearch } from './formulaSearchStore';

/** Whether an Escape is for something other than the search. */
function escapeIsTaken(event: KeyboardEvent): boolean {
  return (
    event.defaultPrevented ||
    isModalOpen() ||
    fieldOwnsEscape(event.target) ||
    inOpenMenu(event.target)
  );
}

/** While the search is open (the hook of its panel). */
export function useFormulaSearchKeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (escapeIsTaken(event)) return;
      // Also for the field itself: a search field would empty itself on Escape, and its text is
      // kept for the next time.
      event.preventDefault();
      closeFormulaSearch();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
