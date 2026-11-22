/* Formula renders for the current project: the bridge between the engine and the scene.
 *
 * A render sync service watches the project, asks the engine for a render of every formula
 * when something that affects it changes (its content, fontSize, meta.target,
 * meta.preamble, `prefer`, companion state) and writes the outcome here. It also maintains the
 * formula snapshots through `useProjectStore.amend` (docs/ARCHITECTURE.md, "Glyph index
 * spaces"). Everything that draws formulas reads `resolved`. Not undoable, not saved. */
import { create } from 'zustand';
import {
  resolveFormulaTransition,
  type RenderError,
  type ResolvedFormula,
  type ResolvedFormulas,
} from '../engine';
import type { Formula, FormulaId, RenderBackend } from '../model';

export type FormulaRenderStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface FormulaRenderEntry {
  status: FormulaRenderStatus;
  /** Latest successful resolution. Kept while a newer render loads and after a failed one, so
   * the preview does not flicker; null until the first success. */
  resolved: ResolvedFormula | null;
  /** The failure when status is 'error', else null. */
  error: RenderError | null;
}

/** How a formula's canonical glyphs moved when its snapshot was last re-based (`renderSync`):
 * old index → new index (null = the glyph is gone), from the snapshot `from` to the snapshot
 * `to` (render keys). The sync remaps every reference in the project through it; an editor that
 * holds a draft made on `from` re-bases it the same way (`ui/relations/pairDraft.ts`). */
export interface GlyphTransition {
  from: string;
  to: string;
  map: readonly (number | null)[];
}

export interface RenderState {
  /** 'auto' = exact LaTeX renders while the companion is online, MathJax otherwise. */
  prefer: 'auto' | RenderBackend;
  entries: Readonly<Record<FormulaId, FormulaRenderEntry>>;
  /** Formulas with a usable render (`entry.resolved !== null`), keyed by formula id. A new Map
   * whenever an entry changes, so subscribers can compare it by reference. */
  resolved: ResolvedFormulas;
  setPrefer(prefer: 'auto' | RenderBackend): void;
  setEntry(id: FormulaId, entry: FormulaRenderEntry): void;
  /** The last transition of each formula's snapshot, by formula id. */
  transitions: Readonly<Record<FormulaId, GlyphTransition>>;
  setTransition(id: FormulaId, transition: GlyphTransition): void;
  /** Forget every formula not in `ids` (deleted formulas, a newly opened project). */
  retain(ids: Iterable<FormulaId>): void;
  /** Give copies of formulas (`copies`: original id → copy, which has its original's snapshot)
   * the render their originals have, resolved for them, before the copies reach the project
   * (Duplicate, Unlink formula): whatever draws a copy has it at once, not when the render sync
   * has asked the engine again, and the sync keeps it as the copy's render meanwhile. An original
   * without a render gives nothing. */
  seedCopies(copies: ReadonlyMap<FormulaId, Formula>): void;
}

function resolvedMap(entries: Readonly<Record<FormulaId, FormulaRenderEntry>>): ResolvedFormulas {
  const map = new Map<FormulaId, ResolvedFormula>();
  for (const [id, entry] of Object.entries(entries)) {
    if (entry.resolved) map.set(id, entry.resolved);
  }
  return map;
}

export const useRenderStore = create<RenderState>()((set) => ({
  prefer: 'auto',
  entries: {},
  resolved: new Map(),
  transitions: {},
  setPrefer: (prefer) => set({ prefer }),
  setTransition: (id, transition) =>
    set((state) => ({ transitions: { ...state.transitions, [id]: transition } })),
  setEntry: (id, entry) =>
    set((state) => {
      const entries = { ...state.entries, [id]: entry };
      const changed = state.entries[id]?.resolved !== entry.resolved;
      return changed ? { entries, resolved: resolvedMap(entries) } : { entries };
    }),
  retain: (ids) =>
    set((state) => {
      const keep = new Set(ids);
      const kept = <T>(record: Readonly<Record<string, T>>) =>
        Object.fromEntries(Object.entries(record).filter(([id]) => keep.has(id)));
      const entries = kept(state.entries);
      const transitions = kept(state.transitions);
      if (
        Object.keys(entries).length === Object.keys(state.entries).length &&
        Object.keys(transitions).length === Object.keys(state.transitions).length
      ) {
        return state;
      }
      return { entries, resolved: resolvedMap(entries), transitions };
    }),
  seedCopies: (copies) =>
    set((state) => {
      let entries: Record<FormulaId, FormulaRenderEntry> | null = null;
      for (const [id, copy] of copies) {
        const entry = state.entries[id];
        if (!entry?.resolved) continue;
        entries ??= { ...state.entries };
        // The resolution the sync would give the original now, with the copy's own object.
        entries[copy.id] = {
          ...entry,
          resolved: resolveFormulaTransition(copy, entry.resolved, state.transitions[id]),
        };
      }
      return entries ? { entries, resolved: resolvedMap(entries) } : state;
    }),
}));
