/* Which of the side and bottom panels are folded to their title bar (D62). The layout registers
 * each foldable panel's imperative handle while the resizable layout is up (none in the stacked
 * layout of a narrow window); View ▸ Panels and the headers' buttons go through `toggle`, and the
 * layout reports every size change through `report` — also a fold made by dragging a separator
 * past the panel's minimum — so `collapsed` is always what is on screen. The sizes, folded ones
 * included, are kept by the layout in the browser, so a fold comes back on reload.
 *
 * In Zen mode (D182, D188) the Creator and the Animations panel are the two halves of a drawer
 * over the Preview (`ZenStage.tsx`), each opened and closed by its button on the strip: the
 * drawer registers a handle of its own for each (`FoldHandle`) and reports their folds — a half
 * closed —, so the fold button of a panel, View ▸ Panels and whatever unfolds a panel it needs
 * work as they do in the usual layout. The store only knows which side of the Preview the strip
 * is on (`strip`), for the way a panel folds (`foldSide`). */
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { create } from 'zustand';

export type FoldablePanel = 'creator' | 'animations' | 'timeline';

/** The foldable panels, in the order of View ▸ Panels; `key` is the key that folds and unfolds
 * the panel, alone (D191; `project/shortcuts.ts`). */
export const FOLDABLE_PANELS: readonly { id: FoldablePanel; label: string; key?: string }[] = [
  { id: 'creator', label: 'Creator', key: 'C' },
  { id: 'animations', label: 'Animations', key: 'A' },
  { id: 'timeline', label: 'Timeline' },
];

/** The key that folds and unfolds a panel, for the tooltips that name it; undefined without. */
export const foldKey = (id: FoldablePanel): string | undefined =>
  FOLDABLE_PANELS.find((panel) => panel.id === id)?.key;

/** Where each panel folds to: a strip on that side of the window, or a bar at the bottom. */
export const FOLD_SIDE: Record<FoldablePanel, 'left' | 'right' | 'bottom'> = {
  creator: 'left',
  animations: 'right',
  timeline: 'bottom',
};

/** The side of the Preview Zen mode's tabs are on: the shared place opens from there. */
export type StripSide = 'top' | 'bottom';

/** Where a panel folds to now. In Zen mode (`strip`: the side of its tabs; null out of it) the
 * timeline is a column on the left, and the shared place closes towards its tabs. */
export function foldSide(
  id: FoldablePanel,
  strip: StripSide | null,
): 'left' | 'right' | 'bottom' | 'top' {
  if (strip === null) return FOLD_SIDE[id];
  return id === 'timeline' ? 'left' : strip;
}

/** What the store asks of a place that folds: the layout's panel, or Zen mode's drawer. */
export type FoldHandle = Pick<PanelImperativeHandle, 'collapse' | 'expand' | 'isCollapsed'>;

/** The size of a folded panel: its title bar, with the frame's two edges (CSS px; `.panel-header`
 * in styles.css is 36px high). */
export const FOLDED_PX = 38;

interface PanelsState {
  /** The panels that are not on screen: folded to their title bar, or — in Zen mode — a half of
   * the drawer that is closed. */
  collapsed: Record<FoldablePanel, boolean>;
  handles: Partial<Record<FoldablePanel, FoldHandle>>;
  /** In Zen mode, the side of the Preview its strip is on; null out of it. */
  strip: StripSide | null;
  /** The layout mounts (handle) or unmounts (null) a foldable panel. */
  register(id: FoldablePanel, handle: FoldHandle | null): void;
  /** Fold an open panel or unfold a folded one; nothing while it is not in the layout. */
  toggle(id: FoldablePanel): void;
  /** The layout's word on whether the panel is folded now. */
  report(id: FoldablePanel, collapsed: boolean): void;
  /** The layout enters Zen mode, its strip on that side of the Preview, moves the strip, or
   * leaves the mode (null). Entering or leaving, the panels are other panels: no fold of the
   * Creator or the Animations panel is carried over, each says its own as it mounts. */
  setStrip(strip: StripSide | null): void;
}

export const usePanels = create<PanelsState>()((set, get) => ({
  collapsed: { creator: false, animations: false, timeline: false },
  handles: {},
  strip: null,
  register: (id, handle) =>
    set((state) => {
      const handles = { ...state.handles };
      if (handle) handles[id] = handle;
      else delete handles[id];
      return { handles };
    }),
  toggle: (id) => {
    const handle = get().handles[id];
    if (!handle) return;
    if (handle.isCollapsed()) handle.expand();
    else handle.collapse();
  },
  report: (id, collapsed) =>
    set((state) =>
      state.collapsed[id] === collapsed
        ? state
        : { collapsed: { ...state.collapsed, [id]: collapsed } },
    ),
  setStrip: (strip) =>
    set((state) => {
      if (state.strip === strip) return state;
      if ((strip === null) === (state.strip === null)) return { strip };
      return { strip, collapsed: { ...state.collapsed, creator: false, animations: false } };
    }),
}));
