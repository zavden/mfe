/* The editing sessions that live outside the project — the preview's glyph pick, Edit path,
 * align by symbol and the choice of what a shape's Transform goes to, what the formula,
 * multi-formula and text editors are open on, the groups of formulas the Creator has open, the
 * search of formulas, the groups of blocks unfolded on the timeline — name things of one document.
 * This service keeps them on it: each follows the changes that concern it (a re-render that
 * renumbers glyphs, a pair that goes away), and all of them end with the document, since the next
 * one may reuse its ids. One of the app's services (useAppServices.ts); a unit test that needs
 * one of them starts that one (test/services.ts). */
import { startFormulaEditorTracking } from '../creator/formulaEditorStore';
import { startGroupUiTracking } from '../creator/groups/groupUiStore';
import { startFormulaSearchTracking } from '../creator/search/formulaSearchStore';
import { startMultiEditTracking } from '../creator/multiEditStore';
import { startGlyphPickTracking } from '../preview/glyphPickStore';
import { startPathEditTracking } from '../preview/pathEdit';
import { startLineCurveTracking } from '../preview/lineCurve';
import { startLineDrawTracking } from '../preview/lineDraw';
import { startShapeRetargetTracking } from '../preview/shapeRetarget';
import { startSymbolAlignTracking } from '../preview/symbolAlign';
import { startTextCompositionTracking } from '../text/textCompositionStore';
import { startTimelineViewTracking } from '../timeline/timelineStore';

/** Start them all; the result stops them. */
export function startSessionTracking(): () => void {
  const stops = [
    startGlyphPickTracking(),
    startPathEditTracking(),
    startShapeRetargetTracking(),
    startLineDrawTracking(),
    startLineCurveTracking(),
    startSymbolAlignTracking(),
    startFormulaEditorTracking(),
    startMultiEditTracking(),
    startTextCompositionTracking(),
    startGroupUiTracking(),
    startFormulaSearchTracking(),
    startTimelineViewTracking(),
  ];
  return () => stops.forEach((stop) => stop());
}
