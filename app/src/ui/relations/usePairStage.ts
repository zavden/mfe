/* What a pair editor keeps of its drawing (GlyphLinkCanvas.tsx) while it is open: its layout and
 * its view. The editor holds them and hands them to the drawing, so that a drawing put away and
 * brought back (the relation editor's own previews take its place) comes back as it was left, and
 * so that what stands for the drawing (the raw preview) is laid out as it is. Nothing of it is
 * the project's, nor a preference: a new editor opens anew. */
import { useMemo, useState } from 'react';
import type { PairLayout } from './linkLayout';
import type { PairView } from './pairView';

export interface PairStage {
  /** How the two formulas are laid out; null until the drawing opens: it chooses the layout
   * that draws what takes part larger, once it knows its size. */
  layout: PairLayout | null;
  /** Lay the drawing out this way; it opens again, framed on what takes part. */
  setLayout(layout: PairLayout): void;
  /** The view of the drawing; null until the drawing opens — it frames what takes part — and
   * when it is asked to open again. */
  view: PairView | null;
  setView(view: PairView | null): void;
}

export function usePairStage(): PairStage {
  const [layout, setLayoutOnly] = useState<PairLayout | null>(null);
  const [view, setView] = useState<PairView | null>(null);
  return useMemo(
    () => ({
      layout,
      setLayout: (next) => {
        setLayoutOnly(next);
        setView(null);
      },
      view,
      setView,
    }),
    [layout, view],
  );
}
