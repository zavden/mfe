/* Which block's "Split…" dialog is open (a UI state, not part of the project): the block menu
 * and the Animations panel open it, `SplitBlockHost` mounts the dialog. */
import { create } from 'zustand';
import type { ActionId, ClipId } from '../../model';

export interface SplitDialogRequest {
  clipId: ClipId;
  actionId: ActionId;
}

interface SplitDialogState {
  request: SplitDialogRequest | null;
  open(request: SplitDialogRequest): void;
  close(): void;
}

export const useSplitDialogStore = create<SplitDialogState>()((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

/** Open the "Split…" dialog of the block `actionId` of clip `clipId`. */
export const openSplitDialog = (clipId: ClipId, actionId: ActionId) =>
  useSplitDialogStore.getState().open({ clipId, actionId });
