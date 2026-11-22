/* What a pair editor keeps while its pairs are edited, shared by the relation editor and the
 * Morph block's pair editor (`usePairSession.ts` holds it in React): the draft pairs, each with
 * an identity of its own that survives re-bases, style changes and reordering (the pair
 * operations spread a pair they change, so the id travels with it); the snapshot revision the
 * glyph indices refer to, and how the draft follows a re-render of a formula underneath — the
 * render sync re-bases the formula's snapshot and remaps the project's pairs through a
 * transition, not what an open editor holds, so the editor takes its draft, the state the draft
 * is compared with, the selections and a suggestion through the same step, or holds Save back
 * when the step is not known. Pure. */
import { principalOf, prunePairRoutes, type FormulaId, type GlyphPair } from '../../model';
import type { GlyphTransition } from '../../store';
import {
  describeDropped,
  rebasePairs,
  rebaseSelection,
  transitionFor,
  type PairSide,
  type RebasedPairs,
} from './pairDraft';
import type { SideSelection } from './relationOps';

/** A pair of the draft: a glyph pair with an identity the editor gives it. */
export interface DraftPair extends GlyphPair {
  id: number;
}

/** `pairs` with an id on each: a pair that has one keeps it, the others take the next ids from
 * `next` on. The pairs as the project stores them (`stripIds`) have none. */
export function identified(
  pairs: readonly (GlyphPair & { id?: number })[],
  next: number,
): { pairs: DraftPair[]; next: number } {
  const out: DraftPair[] = [];
  for (const pair of pairs) {
    if (pair.id !== undefined) out.push(pair as DraftPair);
    else out.push({ ...pair, id: next++ });
  }
  return { pairs: out, next };
}

export function stripIds(pairs: readonly DraftPair[]): GlyphPair[] {
  return pairs.map(({ id, ...pair }) => {
    void id;
    return pair;
  });
}

/** The ids of the pairs at `indices` (places in the draft). */
export function idsAt(pairs: readonly DraftPair[], indices: readonly number[]): number[] {
  return indices.flatMap((i) => (pairs[i] ? [pairs[i]!.id] : []));
}

/** The places in the draft of the pairs with `ids`, in the draft's order (gone ones left out). */
export function indicesOf(pairs: readonly DraftPair[], ids: readonly number[]): number[] {
  return pairs.flatMap((pair, i) => (ids.includes(pair.id) ? [i] : []));
}

/** The snapshot keys the draft's glyph indices refer to, by side; null = no snapshot yet. */
export interface Revision {
  from: string | null;
  to: string | null;
}

/** A formula whose glyphs one side of the pairs indexes, as it is now. */
export interface SnapshotSide {
  id: FormulaId;
  name: string;
  key: string | null;
}

export type Sides = Record<PairSide, SnapshotSide>;

/** The parts of the editor's state that a re-base takes through the transition. */
export interface Rebaseable<P extends GlyphPair> {
  pairs: P[];
  /** What `pairs` is compared with to know whether the draft changed: the saved pairs. */
  base: P[];
  selection: SideSelection;
  /** Suggested pairs (no ids: they are not in the draft yet). */
  suggestion: GlyphPair[] | null;
}

export interface Reconciled<P extends GlyphPair> extends Rebaseable<P> {
  keys: Revision;
  /** Why Save is held back (a re-render whose step is not known), or null. */
  stale: string | null;
  /** Whether a side was re-based: what named pairs by their old places (an open menu, the
   * hovered row) is void. */
  rebased: boolean;
  /** What the re-base dropped, as a sentence per formula; null when nothing was. */
  dropped: string | null;
}

const staleMessage = (name: string) =>
  `“${name}” was re-rendered while you edited: close the editor and open it again.`;

/** The editor's state after the formulas changed underneath, if they did: a side whose
 * snapshot moved on by a known transition is taken through it (the pairs, their baseline, the
 * selection and a suggestion alike); one that moved by an unknown step makes the draft stale
 * until the snapshot comes back to the one the draft refers to; a first snapshot (there was
 * none) is adopted as it is. With `selfPairs` (a Morph block: both sides are the one formula) a
 * glyph that a re-base lands on both sides of a pair leaves both, as `remapGlyphRefs` does to
 * the project's pairs, since it cannot turn into itself. */
export function reconcile<P extends GlyphPair>(
  current: Rebaseable<P> & { keys: Revision },
  sides: Sides,
  transitions: Readonly<Record<string, GlyphTransition>>,
  selfPairs = false,
): Reconciled<P> {
  let { keys, pairs, base, selection, suggestion } = current;
  let stale: string | null = null;
  let rebased = false;
  const drops = new Map<string, { droppedPairs: number; droppedGlyphs: number }>();
  const note = (name: string, r: { droppedPairs: number; droppedGlyphs: number }) => {
    const sum = drops.get(name) ?? { droppedPairs: 0, droppedGlyphs: 0 };
    sum.droppedPairs += r.droppedPairs;
    sum.droppedGlyphs += r.droppedGlyphs;
    drops.set(name, sum);
  };
  for (const side of ['from', 'to'] as const) {
    const { id, name, key } = sides[side];
    const known = keys[side];
    if (known === key) continue;
    if (known === null) {
      keys = { ...keys, [side]: key };
      continue;
    }
    const transition = transitionFor(transitions, id, known, key);
    if (!transition) {
      stale ??= staleMessage(name);
      continue;
    }
    keys = { ...keys, [side]: key };
    const { map } = transition;
    const result = rebasePairs(pairs, side, map);
    pairs = result.pairs;
    base = rebasePairs(base, side, map).pairs;
    selection = { ...selection, [side]: rebaseSelection(selection[side], map) };
    suggestion = suggestion && rebasePairs(suggestion, side, map).pairs;
    rebased = true;
    note(name, result);
  }
  if (rebased && selfPairs) {
    const result = dropSharedGlyphs(pairs);
    pairs = result.pairs;
    base = dropSharedGlyphs(base).pairs;
    suggestion = suggestion && dropSharedGlyphs(suggestion).pairs;
    note(sides.from.name, result);
  }
  const dropped = [...drops]
    .filter(([, r]) => r.droppedPairs > 0 || r.droppedGlyphs > 0)
    .map(
      ([name, r]) =>
        `“${name}” was re-rendered: ${describeDropped({ pairs: [], ...r })} left the draft.`,
    )
    .join(' ');
  return {
    keys,
    pairs,
    base,
    selection,
    suggestion,
    stale,
    rebased,
    dropped: dropped || null,
  };
}

/** A glyph on both sides of a pair (two old glyphs merged into one) leaves both; a pair left
 * without a side goes. The counts say what left. */
export function dropSharedGlyphs<P extends GlyphPair>(pairs: readonly P[]): RebasedPairs<P> {
  const out: P[] = [];
  let droppedPairs = 0;
  let droppedGlyphs = 0;
  for (const pair of pairs) {
    const shared = pair.from.filter((g) => pair.to.includes(g));
    if (shared.length === 0) {
      out.push(pair);
      continue;
    }
    droppedGlyphs += 2 * shared.length;
    const kept = {
      ...pair,
      from: pair.from.filter((g) => !shared.includes(g)),
      to: pair.to.filter((g) => !shared.includes(g)),
    };
    if (pair.principal !== undefined || pair.extras === 'copies') {
      const principal = principalOf(pair);
      kept.principal = principal !== null && kept.from.includes(principal) ? principal : null;
    }
    const repairable = kept.extras === 'copies' && kept.principal === null;
    // A route goes with a glyph it named.
    if ((kept.from.length > 0 || repairable) && kept.to.length > 0) out.push(prunePairRoutes(kept));
    else droppedPairs++;
  }
  return { pairs: out, droppedPairs, droppedGlyphs };
}

/** Whether the draft differs from what it is compared with (the ids do not count: a pair
 * deleted and made again is the same pair to the project). */
export function changed(pairs: readonly DraftPair[], base: readonly DraftPair[]): boolean {
  return JSON.stringify(stripIds(pairs)) !== JSON.stringify(stripIds(base));
}
