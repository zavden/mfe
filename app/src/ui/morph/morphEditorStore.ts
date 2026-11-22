/* Which morph block's pair editor is open (a UI state, not part of the project): the Animations
 * panel and the block menu open it, `MorphEditorHost` mounts the editor. */
import { create } from 'zustand';
import type { ActionId, ClipId } from '../../model';

export interface MorphEditorRequest {
  clipId: ClipId;
  actionId: ActionId;
}

interface MorphEditorState {
  request: MorphEditorRequest | null;
  open(request: MorphEditorRequest): void;
  close(): void;
}

export const useMorphEditorStore = create<MorphEditorState>()((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

/** Open the pair editor of the morph block `actionId` of clip `clipId`. */
export const openMorphEditor = (clipId: ClipId, actionId: ActionId) =>
  useMorphEditorStore.getState().open({ clipId, actionId });
