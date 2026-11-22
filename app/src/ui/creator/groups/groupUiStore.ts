/* What the Creator's view remembers about the groups of formulas, and the project does not:
 * which ones are open (a new group starts closed) and which one is being renamed in place (its
 * row shows the field; the menu's «Rename group» asks for it from outside the row). Both end
 * with the document: the groups of the next one start closed. */
import { create } from 'zustand';
import type { FormulaGroupId } from '../../../model';
import { onDocumentReplaced } from '../../project/documentStore';

interface GroupUiState {
  open: ReadonlySet<FormulaGroupId>;
  renaming: FormulaGroupId | null;
  setOpen(id: FormulaGroupId, open: boolean): void;
  toggle(id: FormulaGroupId): void;
  startRename(id: FormulaGroupId): void;
  stopRename(): void;
}

export const useGroupUi = create<GroupUiState>()((set) => ({
  open: new Set(),
  renaming: null,
  setOpen: (id, open) =>
    set((state) => {
      if (state.open.has(id) === open) return state;
      const next = new Set(state.open);
      if (open) next.add(id);
      else next.delete(id);
      return { open: next };
    }),
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.open);
      if (!next.delete(id)) next.add(id);
      return { open: next };
    }),
  startRename: (id) => set({ renaming: id }),
  stopRename: () => set({ renaming: null }),
}));

/** Forget the open groups and the rename with their document: the next one may reuse the ids
 * (one of the app's services, `sessionTracking.ts`). Returns the function that stops it. */
export function startGroupUiTracking(): () => void {
  return onDocumentReplaced(() => useGroupUi.setState({ open: new Set(), renaming: null }));
}
