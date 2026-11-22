/* What the UI selection (store/uiStore `Selection`) covers, in the terms the panels need: the
 * formulas it holds, the clips it highlights, the block it names, and what is left of it once the
 * project changed under it. Pure, so it is tested without a DOM. */
import {
  formulaListOrder,
  type Clip,
  type ClipAction,
  type ClipId,
  type FormulaId,
  type Project,
} from '../model';
import type { Selection } from '../store';

/** The formulas a selection holds (none unless it is a formula selection). */
export function selectedFormulaIds(selection: Selection): FormulaId[] {
  if (selection.kind === 'formula') return [selection.id];
  if (selection.kind === 'formulas') return selection.ids;
  return [];
}

/** The selection of the formulas `ids`, in the order of `order` (the Creator list). */
export function formulaSelection(ids: Iterable<FormulaId>, order: readonly FormulaId[]): Selection {
  const set = new Set(ids);
  const sorted = order.filter((id) => set.has(id));
  if (sorted.length === 0) return { kind: 'none' };
  if (sorted.length === 1) return { kind: 'formula', id: sorted[0]! };
  return { kind: 'formulas', ids: sorted };
}

/** The order of a selection of formulas in `project`: the Creator list's (`formulaListOrder`,
 * which a group of formulas changes), then the objects the list does not show (a brace, a shape, a
 * line), which a selection may still hold, in the project's (audit B1-01). */
export function selectionOrder(project: Pick<Project, 'formulas' | 'formulaGroups'>): FormulaId[] {
  const listed = formulaListOrder(project);
  const shown = new Set(listed);
  return [...listed, ...project.formulas.map((f) => f.id).filter((id) => !shown.has(id))];
}

/** Whether a selection is of the scene's camera: one of its moves, a target camera, or the
 * camera itself (D190). */
export function isCameraSelection(selection: Selection): boolean {
  return (
    selection.kind === 'camera' ||
    selection.kind === 'cameraMove' ||
    selection.kind === 'targetCamera'
  );
}

/** The clips a selection highlights: the selected clips, or the clip of the selected block. */
export function highlightedClipIds(selection: Selection): ClipId[] {
  if (selection.kind === 'clips') return selection.ids;
  if (selection.kind === 'action') return [selection.clipId];
  return [];
}

/** The clip and the animation block an `action` selection names, while both exist. */
export function selectedBlock(
  selection: Selection,
  clips: readonly Clip[],
): { clip: Clip; action: ClipAction } | null {
  if (selection.kind !== 'action') return null;
  const clip = clips.find((c) => c.id === selection.clipId);
  const action = clip?.actions.find((a) => a.id === selection.actionId);
  return clip && action ? { clip, action } : null;
}

/** The selection without what no longer exists in `project` (deleted, or undone away). The same
 * object comes back when nothing is missing, so that a caller can tell. */
export function pruneSelection(selection: Selection, project: Project): Selection {
  switch (selection.kind) {
    case 'none':
      return selection;
    case 'formula':
      return project.formulas.some((f) => f.id === selection.id) ? selection : { kind: 'none' };
    case 'formulas': {
      const alive = selection.ids.filter((id) => project.formulas.some((f) => f.id === id));
      if (alive.length === selection.ids.length) return selection;
      return formulaSelection(alive, selectionOrder(project));
    }
    case 'clips': {
      const alive = selection.ids.filter((id) =>
        [...project.clips, ...project.audioClips].some((c) => c.id === id),
      );
      if (alive.length === selection.ids.length) return selection;
      return alive.length > 0 ? { kind: 'clips', ids: alive } : { kind: 'none' };
    }
    case 'relation':
      return project.relations.some((r) => r.id === selection.id) ? selection : { kind: 'none' };
    case 'action':
      return selectedBlock(selection, project.clips) ? selection : { kind: 'none' };
    case 'cameraMove':
      return project.camera?.moves.some((m) => m.id === selection.id)
        ? selection
        : { kind: 'none' };
    case 'targetCamera':
      return project.camera?.targets.some((t) => t.id === selection.id)
        ? selection
        : { kind: 'none' };
    case 'camera':
      return project.camera ? selection : { kind: 'none' };
  }
}
