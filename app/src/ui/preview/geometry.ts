/* Where the formulas are at the playhead, for the preview's editing tools: snapping, the
 * selection rectangle, the group handles, align, distribute, paste properties and align by
 * symbol. Every glyph counts where the clip's state and its part transforms put it, drawn or not
 * (`SceneEvaluator.geometry`): the tools measure what Manim's own boxes would be, and a glyph a
 * part transform has moved is where it is, not where the formula's render puts it. */
import type { Box } from '../../geom';
import type { ClipId } from '../../model';
import { createEvaluator, type ClipGeometry, type SceneEvaluator } from '../../scene';
import { useProjectStore, useRenderStore, useUiStore } from '../../store';

export type ClipGeometries = ReadonlyMap<ClipId, ClipGeometry>;

/** The clips on screen at `t` with their geometry, by id. */
export function geometryAt(evaluator: SceneEvaluator, t: number): ClipGeometries {
  return new Map(evaluator.geometry(t).map((g) => [g.clipId, g]));
}

/** The same at the playhead, from the stores: for the actions outside the panel (menus,
 * shortcuts, the align-by-symbol store), which have no evaluator at hand. */
export function geometryNow(): ClipGeometries {
  const { project } = useProjectStore.getState();
  const { resolved } = useRenderStore.getState();
  const { time } = useUiStore.getState();
  return geometryAt(createEvaluator(project, resolved), time);
}

/** The whole formulas' boxes alone, by clip (what the snapping and the marquee work on). */
export function formulaBoxes(geometry: ClipGeometries): Map<ClipId, Box> {
  return new Map([...geometry].map(([id, g]) => [id, g.box]));
}
