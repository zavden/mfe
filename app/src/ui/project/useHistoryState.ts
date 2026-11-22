import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { history, useProjectStore } from '../../store';
import { useTextComposition } from '../text/textCompositionStore';

/** Whether there is anything to undo / redo (re-renders when that changes). */
export function useHistoryState(): { canUndo: boolean; canRedo: boolean } {
  const canUndo = useStore(useProjectStore.temporal, (state) => state.pastStates.length > 0);
  const canRedo = useStore(useProjectStore.temporal, (state) => state.futureStates.length > 0);
  const active = useSyncExternalStore(history.subscribe, history.isGesturing);
  const composing = useTextComposition((state) => state.session !== null);
  return { canUndo: composing || active || canUndo, canRedo: composing || active || canRedo };
}
