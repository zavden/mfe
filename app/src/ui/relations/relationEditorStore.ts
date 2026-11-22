/* Which relation the relation editor is open on (a UI state, not part of the project). The
 * editor itself is mounted by `RelationEditorHost`. */
import { create } from 'zustand';
import type { ClipId, RelationId } from '../../model';

export type RelationEditorRequest =
  /** A new relation from one clip to another (nothing is added until the editor saves). */
  | { kind: 'create'; fromClipId: ClipId; toClipId: ClipId }
  /** An existing relation. */
  | { kind: 'edit'; relationId: RelationId };

interface RelationEditorState {
  request: RelationEditorRequest | null;
  open(request: RelationEditorRequest): void;
  close(): void;
}

export const useRelationEditor = create<RelationEditorState>()((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

export const openRelationEditor = (request: RelationEditorRequest) =>
  useRelationEditor.getState().open(request);
