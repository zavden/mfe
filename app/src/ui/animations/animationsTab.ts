/* Which tab the clip view of the Animations panel shows. Kept for the session (not in the
 * project), so it survives selecting another clip; Relations comes first. */
import { create } from 'zustand';

export type AnimationsTab = 'relations' | 'timing';

interface AnimationsTabState {
  tab: AnimationsTab;
  setTab(tab: AnimationsTab): void;
}

export const useAnimationsTab = create<AnimationsTabState>()((set) => ({
  tab: 'relations',
  setTab: (tab) => set({ tab }),
}));
