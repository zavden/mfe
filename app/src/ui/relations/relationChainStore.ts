/* Whether the "related relations" dialog is open, and around which clip (a UI state, not part of
 * the project). The dialog is mounted by `RelationChainHost`. */
import { create } from 'zustand';
import type { ClipId } from '../../model';

interface RelationChainState {
  clipId: ClipId | null;
  open(clipId: ClipId): void;
  close(): void;
}

export const useRelationChain = create<RelationChainState>()((set) => ({
  clipId: null,
  open: (clipId) => set({ clipId }),
  close: () => set({ clipId: null }),
}));

export const openRelationChain = (clipId: ClipId) => useRelationChain.getState().open(clipId);
