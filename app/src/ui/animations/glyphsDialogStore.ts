/* «Add brace ▸ On some glyphs…» and «Add shape ▸ On some glyphs…»: which clip the glyph dialog
 * (GlyphsDialog) is open for, what it adds, and the glyphs it starts from — those picked in the
 * preview (D74), else every one. */
import { create } from 'zustand';
import type { ClipId } from '../../model';

export type GlyphsDialogWhat = 'brace' | 'shape';

interface GlyphsDialogState {
  clipId: ClipId | null;
  what: GlyphsDialogWhat;
  /** The glyphs picked when the dialog opens; null: every glyph. */
  glyphs: readonly number[] | null;
  open(clipId: ClipId, what: GlyphsDialogWhat, glyphs?: readonly number[]): void;
  close(): void;
}

export const useGlyphsDialog = create<GlyphsDialogState>()((set) => ({
  clipId: null,
  what: 'brace',
  glyphs: null,
  open: (clipId, what, glyphs) => set({ clipId, what, glyphs: glyphs ?? null }),
  close: () => set({ clipId: null }),
}));

export const openBraceDialog = (clipId: ClipId, glyphs?: readonly number[]) =>
  useGlyphsDialog.getState().open(clipId, 'brace', glyphs);
export const openShapeDialog = (clipId: ClipId, glyphs?: readonly number[]) =>
  useGlyphsDialog.getState().open(clipId, 'shape', glyphs);
