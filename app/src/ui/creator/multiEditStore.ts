/* Which formulas the multi-formula editor is open on (a UI state, not part of the project). It is
 * mounted by CreatorEditorHost and opened from the right-click menu of selected formulas. */
import { create } from 'zustand';
import type { FormulaId } from '../../model';
import { onDocumentReplaced } from '../project/documentStore';

interface MultiEditState {
  ids: FormulaId[] | null;
  revision: number;
  open(ids: FormulaId[]): void;
  close(): void;
}

export const useMultiEdit = create<MultiEditState>()((set) => ({
  ids: null,
  revision: 0,
  open: (ids) => set((state) => ({ ids, revision: state.revision + 1 })),
  close: () => set({ ids: null }),
}));

/** Close the request with its document: the next one may reuse the formulas' ids (one of the
 * app's services, `useAppServices`). Returns the function that stops it. */
export function startMultiEditTracking(): () => void {
  return onDocumentReplaced(() => useMultiEdit.getState().close());
}
