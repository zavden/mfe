/* Splitting an animation block into blocks that run at the same time on different glyphs — the
 * way to animate two parts of a formula in parallel (ARCHITECTURE §5: two things may animate a
 * clip at once only on different glyphs). "Split into runs" gives one block per run of
 * consecutive glyph indices (the two members of an equation, say); "Split…" moves the chosen
 * glyphs to new blocks, one per part chosen. The pieces of a split are one group
 * (`model/groups.ts`): the timeline draws them as one block until they are unfolded or
 * ungrouped. Pure: what goes into the clip is computed here, `blockActions` applies it. */
import {
  newId,
  type AppearAction,
  type ClipAction,
  type ClipLifetime,
  type DisappearAction,
  type EmphasisAction,
  type PartTransformAction,
} from '../../model';
import { sortedGlyphs } from './blockGlyphs';

/** The blocks that name glyphs: those a split can divide. */
export type GlyphBlock = AppearAction | DisappearAction | PartTransformAction | EmphasisAction;

export function isGlyphBlock(action: ClipAction): action is GlyphBlock {
  return (
    action.kind === 'appear' ||
    action.kind === 'disappear' ||
    action.kind === 'transform' ||
    action.kind === 'emphasis'
  );
}

/** The glyphs a split divides, ascending: the block's explicit list; for `'all'`, the glyphs its
 * lifetime says it animates where it is (an Appear's off-screen ones, a Disappear's on-screen
 * ones), which the pieces then name explicitly — none without a lifetime. */
export function splittableGlyphs(action: GlyphBlock, life: ClipLifetime | undefined): number[] {
  if (action.glyphs !== 'all') return sortedGlyphs(action.glyphs);
  return life?.actions.get(action.id)?.glyphs ?? [];
}

/** Runs of consecutive indices in an ascending list: [0, 1, 3, 4] → [[0, 1], [3, 4]]. */
export function glyphRuns(glyphs: readonly number[]): number[][] {
  const runs: number[][] = [];
  for (const glyph of glyphs) {
    const last = runs[runs.length - 1];
    if (last && glyph === last[last.length - 1]! + 1) last.push(glyph);
    else runs.push([glyph]);
  }
  return runs;
}

/** What a split of the block can do where it is: how many glyphs it divides and how many runs
 * they make. Undefined for a tween or a morph, which name no glyph list. */
export interface SplitOptions {
  glyphs: number;
  runs: number;
}

export function splitOptions(
  action: ClipAction,
  life: ClipLifetime | undefined,
): SplitOptions | undefined {
  if (!isGlyphBlock(action)) return undefined;
  const glyphs = splittableGlyphs(action, life);
  return { glyphs: glyphs.length, runs: glyphRuns(glyphs).length };
}

/** The block as one block per list: the first list stays in the block (now an explicit list),
 * each further list goes to a new block with the same time, animation and settings, in this
 * order (so that, sorted by start, the pieces keep it and take the lanes in turn). The pieces
 * are one group: the one the block was in, where they join its other members, else a new one. */
function pieces(action: GlyphBlock, lists: readonly (readonly number[])[]): GlyphBlock[] {
  const group = action.group ?? newId('g');
  return lists.map(
    (glyphs, i) =>
      ({
        ...structuredClone(action),
        id: i === 0 ? action.id : newId('a'),
        glyphs: [...glyphs],
        group,
      }) as GlyphBlock,
  );
}

/** One block per run of consecutive glyphs (`glyphRuns`) of `glyphs`, the block's splittable
 * glyphs; null with fewer than two runs. */
export function splitIntoRuns(action: GlyphBlock, glyphs: readonly number[]): GlyphBlock[] | null {
  const runs = glyphRuns(glyphs);
  return runs.length >= 2 ? pieces(action, runs) : null;
}

/** The chosen glyphs in a new block (the second), the others left in the block (the first); null
 * unless the choice takes some of `glyphs` but not all of them. Glyphs the block does not animate
 * are ignored. */
export function splitByChoice(
  action: GlyphBlock,
  glyphs: readonly number[],
  picked: Iterable<number>,
): [GlyphBlock, GlyphBlock] | null {
  const split = splitByParts(action, glyphs, [[...picked]]);
  return split && split.length === 2 ? (split as [GlyphBlock, GlyphBlock]) : null;
}

/** The glyphs of each part in a new block, in the parts' order, the others left in the block
 * (the first piece). A glyph goes to the first part that names it; glyphs the block does not
 * animate and parts left empty are ignored. When the parts take every glyph, the first of them
 * is what stays in the block. Null unless that makes two pieces or more. */
export function splitByParts(
  action: GlyphBlock,
  glyphs: readonly number[],
  parts: readonly (readonly number[])[],
): GlyphBlock[] | null {
  const taken = new Set<number>();
  const lists: number[][] = [];
  for (const part of parts) {
    const wanted = new Set(part);
    const list = glyphs.filter((g) => wanted.has(g) && !taken.has(g));
    for (const g of list) taken.add(g);
    if (list.length > 0) lists.push(list);
  }
  const kept = glyphs.filter((g) => !taken.has(g));
  if (kept.length > 0) lists.unshift(kept);
  return lists.length >= 2 ? pieces(action, lists) : null;
}

/** The parts of a split being chosen, with `chosen` as one more, the last: a glyph is in one part
 * only, so the others give up what it takes, and a part left with nothing is gone. The parts
 * themselves when nothing is chosen. */
export function withPart(
  parts: readonly (readonly number[])[],
  chosen: readonly number[],
): number[][] {
  if (chosen.length === 0) return parts.map((part) => [...part]);
  const taken = new Set(chosen);
  return [
    ...parts.map((part) => part.filter((g) => !taken.has(g))).filter((part) => part.length > 0),
    [...chosen],
  ];
}
