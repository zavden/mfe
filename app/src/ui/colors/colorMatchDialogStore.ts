/* Which match colour list the Match colors dialog shows, or null while it is closed. Opened
 * from the Edit menu (a list, or "Create match colors…" for a new one) and from the right-click
 * menus when the project has no list yet. */
import { create } from 'zustand';
import type { ColorMatchId } from '../../model';
import { createColorMatchList, createPaletteMatchList } from './colorMatchActions';
import { getActivePalette } from './paletteStore';

interface ColorMatchDialogState {
  /** The list shown; null = closed. */
  shown: ColorMatchId | null;
  focusFirstPattern: boolean;
  open(id: ColorMatchId): void;
  /** Create a list (one undo step) and open the dialog on it. */
  openNew(): void;
  openNewFromPalette(): void;
  close(): void;
}

export const useColorMatchDialog = create<ColorMatchDialogState>()((set) => ({
  shown: null,
  focusFirstPattern: false,
  open: (id) => set({ shown: id, focusFirstPattern: false }),
  openNew: () => set({ shown: createColorMatchList(), focusFirstPattern: false }),
  openNewFromPalette: () => {
    const palette = getActivePalette();
    if (palette)
      set({
        shown: createPaletteMatchList(palette.displayName, palette.source.colors),
        focusFirstPattern: true,
      });
  },
  close: () => set({ shown: null, focusFirstPattern: false }),
}));
