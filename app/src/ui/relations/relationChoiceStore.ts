/* Relating two clips that may be related already (D165). «Create relation…» of the Animations
 * panel and the link ports of the timeline both ask for a relation from one clip to another:
 * when the two have none, the relation editor opens on a new one; when they have some, a menu
 * asks which to edit, or to add another (`RelationChoiceMenu`, mounted by `RelationChoiceHost`).
 * The menu's place on screen is a UI state, not part of the project. */
import { create } from 'zustand';
import type { ClipId, Project } from '../../model';
import { openRelationEditor } from './relationEditorStore';
import { relationsBetween } from './relationOps';

/** The two clips to relate, and where the menu goes (client pixels). */
export interface RelationChoice {
  fromClipId: ClipId;
  toClipId: ClipId;
  x: number;
  y: number;
}

interface RelationChoiceState {
  choice: RelationChoice | null;
  open(choice: RelationChoice): void;
  close(): void;
}

export const useRelationChoice = create<RelationChoiceState>()((set) => ({
  choice: null,
  open: (choice) => set({ choice }),
  close: () => set({ choice: null }),
}));

/** Relate `fromClipId` with `toClipId`: the editor on a new relation when they have none, else
 * the menu at `at` that asks which of theirs to edit, or to add another. */
export function relateClips(
  project: Project,
  fromClipId: ClipId,
  toClipId: ClipId,
  at: { x: number; y: number },
): void {
  if (relationsBetween(project, fromClipId, toClipId).length === 0) {
    openRelationEditor({ kind: 'create', fromClipId, toClipId });
  } else {
    useRelationChoice.getState().open({ fromClipId, toClipId, ...at });
  }
}
