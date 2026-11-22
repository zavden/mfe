/* Which relation the "Edit path" picker is open on (a UI state, not part of the project): the
 * band menu of the timeline opens it when a relation has too many pairs for the menu itself;
 * `PathPickerHost` mounts the dialog. */
import { create } from 'zustand';
import type { RelationId } from '../../model';
import { useProjectStore } from '../../store';
import { relationLock } from './relationOps';

interface PathPickerState {
  relationId: RelationId | null;
  open(relationId: RelationId): void;
  close(): void;
}

export const usePathPicker = create<PathPickerState>()((set) => ({
  relationId: null,
  open: (relationId) => {
    const { project } = useProjectStore.getState();
    const relation = project.relations.find((r) => r.id === relationId);
    if (relation && !relationLock(project, relation)) set({ relationId });
  },
  close: () => set({ relationId: null }),
}));

export const openPathPicker = (relationId: RelationId) => usePathPicker.getState().open(relationId);
