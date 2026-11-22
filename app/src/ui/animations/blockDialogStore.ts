/* Which animation block's dialog is open (a UI state, not part of the project): a double-click
 * on a block of the timeline opens it (R2, D75), `BlockDialogHost` mounts it. The dialog and the
 * Animations panel edit the same block through the same actions. */
import { create } from 'zustand';
import type { ActionId, ClipId } from '../../model';

export interface BlockDialogRequest {
  clipId: ClipId;
  actionId: ActionId;
}

interface BlockDialogState {
  request: BlockDialogRequest | null;
  open(request: BlockDialogRequest): void;
  close(): void;
}

export const useBlockDialogStore = create<BlockDialogState>()((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

/** Open the dialog of the block `actionId` of clip `clipId`. */
export const openBlockDialog = (clipId: ClipId, actionId: ActionId) =>
  useBlockDialogStore.getState().open({ clipId, actionId });
