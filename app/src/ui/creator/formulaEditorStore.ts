/* Which formula the formula editor is open on (a UI state, not part of the project). The editor
 * is mounted by CreatorEditorHost; the Creator list and a clip's double-click on the timeline
 * open it. A text (with a font, or LaTeX) is not edited there: its editor is the composition
 * workspace, which this opens in its place. */
import { create } from 'zustand';
import type { FormulaId } from '../../model';
import { useProjectStore } from '../../store';
import { onDocumentReplaced } from '../project/documentStore';
import { isCompositionFormula } from '../text/textCompositionModel';
import { useTextComposition } from '../text/textCompositionStore';

interface FormulaEditorState {
  /** `isNew`: the formula was just created (the editor focuses its LaTeX input). */
  editing: { id: FormulaId; isNew: boolean } | null;
  /** A fresh local editor lifetime, even when a replacement document reuses an id. */
  revision: number;
  open(id: FormulaId, isNew?: boolean, clipId?: string): void;
  close(): void;
}

export const useFormulaEditor = create<FormulaEditorState>()((set) => ({
  editing: null,
  revision: 0,
  open: (id, isNew = false, clipId) => {
    if (
      isCompositionFormula(
        useProjectStore.getState().project.formulas.find((formula) => formula.id === id),
      )
    ) {
      set({ editing: null });
      useTextComposition.getState().open(id, clipId);
      return;
    }
    set((state) => ({ editing: { id, isNew }, revision: state.revision + 1 }));
  },
  close: () => set({ editing: null }),
}));

export const openFormulaEditor = (id: FormulaId, isNew = false, clipId?: string) =>
  useFormulaEditor.getState().open(id, isNew, clipId);

/** Close the request with its document: the next one may reuse the formula's id (one of the
 * app's services, `useAppServices`). Returns the function that stops it. */
export function startFormulaEditorTracking(): () => void {
  return onDocumentReplaced(() => useFormulaEditor.getState().close());
}
