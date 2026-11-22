/* Test fixture: a formula resolved as rectangular glyphs, one per box, so that the preview's
 * geometry (every glyph where it is at the playhead) can be measured exactly. */
import type { ResolvedFormula } from '../../../engine';
import { boxCenter, boxSize, rectContour, unionBox, type Box } from '../../../geom';
import type { Formula, FormulaSnapshot } from '../../../model';

/** The snapshot of a formula made of these glyph boxes (canonical index = position). */
export function boxSnapshot(boxes: readonly Box[], label = 'x'): FormulaSnapshot {
  return {
    backend: 'mathjax',
    key: 'test',
    glyphs: boxes.map((b) => ({ label, center: boxCenter(b), size: boxSize(b) })),
  };
}

/** `formula` resolved with one rectangular glyph per box, as the engine would resolve it. */
export function resolvedBoxes(
  formula: Formula,
  boxes: readonly Box[],
  label = 'x',
): ResolvedFormula {
  const glyphs = boxes.map((box, index) => ({
    index,
    label,
    kind: 'char' as const,
    contours: [rectContour(box)],
    bbox: box,
  }));
  return {
    formula,
    render: {
      key: 'test',
      backend: 'mathjax',
      exact: false,
      target: 'ce',
      fontSize: 48,
      glyphs,
      bbox: unionBox(boxes),
      warnings: [],
    },
    canonToRender: glyphs.map((g) => g.index),
    confidence: 1,
  };
}
