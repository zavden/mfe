/* A draft of glyph pairs edited while its formulas may be re-rendered underneath (the companion
 * comes online, the font size changes…): the render sync then re-bases the formula's snapshot and
 * remaps every reference in the project through a transition (`useRenderStore.transitions`), but
 * not what an open editor holds. These helpers re-base the editor's pairs and selections the same
 * way, or say that the step is not known. Pure. */
import {
  prunePairRoutes,
  remapIndices,
  remapPairPrincipal,
  remapPairRoutes,
  type GlyphPair,
} from '../../model';
import type { GlyphTransition } from '../../store';

export type PairSide = 'from' | 'to';

export interface RebasedPairs<P extends GlyphPair> {
  pairs: P[];
  /** Pairs left out because their `side` lost every glyph. */
  droppedPairs: number;
  /** Glyphs left out of the pairs that stayed. */
  droppedGlyphs: number;
}

/** The pairs with their `side` taken through `map`, in their order. */
export function rebasePairs<P extends GlyphPair>(
  pairs: readonly P[],
  side: PairSide,
  map: readonly (number | null)[],
): RebasedPairs<P> {
  const out: P[] = [];
  let droppedPairs = 0;
  let droppedGlyphs = 0;
  for (const pair of pairs) {
    const { kept, dropped } = remapIndices(pair[side], map);
    const principal = side === 'from' ? remapPairPrincipal(pair, map) : pair.principal;
    const repairable = side === 'from' && pair.extras === 'copies' && principal === null;
    if (kept.length === 0 && !repairable) {
      droppedPairs++;
      continue;
    }
    droppedGlyphs += dropped;
    // The routes with a path of their own follow their glyphs, and go with one that is gone.
    const routes = pair.routes && remapPairRoutes(pair.routes, side, map);
    out.push(
      prunePairRoutes({
        ...pair,
        [side]: kept,
        ...(principal === undefined ? {} : { principal }),
        ...(routes ? { routes } : {}),
      }),
    );
  }
  return { pairs: out, droppedPairs, droppedGlyphs };
}

/** A glyph selection taken through `map`. */
export function rebaseSelection(
  selected: ReadonlySet<number>,
  map: readonly (number | null)[],
): Set<number> {
  return new Set(remapIndices([...selected], map).kept);
}

/** The transition that takes glyph indices made on the snapshot `key` to the formula's current
 * snapshot `currentKey`, when the store's last transition is exactly that step; null when it is
 * not (two re-bases while the editor was open, another project under the same ids…). */
export function transitionFor(
  transitions: Readonly<Record<string, GlyphTransition>>,
  formulaId: string,
  key: string | null,
  currentKey: string | null,
): GlyphTransition | null {
  const transition = transitions[formulaId];
  if (!transition || key === null || transition.from !== key || transition.to !== currentKey) {
    return null;
  }
  return transition;
}

/** "2 pairs and 1 glyph" and the like, for the message after a re-base. */
export function describeDropped({ droppedPairs, droppedGlyphs }: RebasedPairs<GlyphPair>): string {
  const parts: string[] = [];
  if (droppedPairs > 0) parts.push(`${droppedPairs} pair${droppedPairs === 1 ? '' : 's'}`);
  if (droppedGlyphs > 0) parts.push(`${droppedGlyphs} glyph${droppedGlyphs === 1 ? '' : 's'}`);
  return parts.join(' and ');
}
