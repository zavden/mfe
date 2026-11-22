/* Whether something covers the Preview panel: the search of formulas comes up in its place
 * (creator/search/). While it does, the keys of the Preview wait — the modes that take Enter and
 * Escape, the shortcuts that act on the scene: nothing they do would be seen — and whatever mode
 * was on stays as it is underneath, for when the Preview is back. */
import { isFormulaSearchOpen } from '../creator/search/formulaSearchStore';

export const isPreviewCovered = (): boolean => isFormulaSearchOpen();
