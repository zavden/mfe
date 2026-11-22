/* Keep glyph references valid when a formula's canonical index space changes: after a LaTeX
 * edit, or when its snapshot is re-based on a higher-fidelity render (docs/ARCHITECTURE.md,
 * "Glyph index spaces"). */
import { freeTweenEnd, type FreedEndPoint } from './kinds';
import { placementUses } from './placementRefs';
import { principalOf, prunePairRoutes, remapPairRoutes } from './transfers';
import type { FormulaId, GlyphPair, Project } from './types';

export interface RemapReport {
  /** Glyph colours (formula and clip) removed because their glyph has no counterpart. */
  droppedColors: number;
  /** Hidden glyphs of the formula, and glyphs its clips leave out of their intro
   * (`Clip.startHidden`), removed for the same reason. */
  droppedHidden: number;
  /** Glyph indices removed from the pairs of relations and morph blocks. */
  droppedPairGlyphs: number;
  /** Pairs (of relations and morph blocks) removed because one of their sides became empty. */
  droppedPairs: number;
  /** Glyph indices removed from the glyph lists of actions (appear, disappear, transform). */
  droppedActionGlyphs: number;
  /** Glyph indices removed from the glyphs an object is attached to (`clip.attach`). */
  droppedAttachGlyphs: number;
  /** Attachments left without a glyph: the object was detached (it stays where it is). */
  detached: number;
  /** Tweens that carried a shape to glyphs none of which is left: removed (`TweenFit`). */
  droppedFits: number;
}

/** A report of a remap that dropped nothing. */
export function emptyRemapReport(): RemapReport {
  return {
    droppedColors: 0,
    droppedHidden: 0,
    droppedPairGlyphs: 0,
    droppedPairs: 0,
    droppedActionGlyphs: 0,
    droppedAttachGlyphs: 0,
    detached: 0,
    droppedFits: 0,
  };
}

/** How many references a remap dropped, of every kind. */
export function droppedTotal(report: RemapReport): number {
  return (
    report.droppedColors +
    report.droppedHidden +
    report.droppedPairGlyphs +
    report.droppedPairs +
    report.droppedActionGlyphs +
    report.droppedAttachGlyphs +
    report.detached +
    report.droppedFits
  );
}

/** `indices` through `map` (old index → new index; null or out of range = the glyph is gone),
 * without duplicates and in the order they come: what one side of a pair or an action's glyph
 * list becomes, and how many indices were lost. */
export function remapIndices(
  indices: readonly number[],
  map: readonly (number | null)[],
): { kept: number[]; dropped: number } {
  const kept: number[] = [];
  let dropped = 0;
  for (const i of indices) {
    const j = map[i] ?? null;
    if (j === null) dropped++;
    else if (!kept.includes(j)) kept.push(j);
  }
  return { kept, dropped };
}

/** Remap before changing the source side. Ordinary uninitialized pairs need no principal;
 * copies pairs first capture their authored minimum, and a lost principal remains null. */
export function remapPairPrincipal(
  pair: Pick<GlyphPair, 'from' | 'extras' | 'principal'>,
  map: readonly (number | null)[],
): number | null | undefined {
  if (pair.principal === undefined && pair.extras !== 'copies') return undefined;
  const principal = principalOf(pair);
  return principal === null ? null : (map[principal] ?? null);
}

/**
 * Rewrite every canonical glyph reference of `formulaId` through `map` (old index → new index;
 * null or out of range = the glyph is gone): the formula's glyph colours and hidden glyphs, the glyph colours of
 * its clips (initial state and tween targets), the glyphs they leave out of their intro
 * (`startHidden`), the glyph lists of their actions (an action left
 * without glyphs stays, and validation warns), both sides of the pairs of their morph blocks and
 * the matching side of every relation pair on those clips, including its authored principal
 * and the routes with a path of their own (a route that loses a glyph goes).
 * A lost principal becomes null; its copies pair stays for manual repair even with no sources.
 * Other pairs left without a side are dropped; retained pairs keep their order. Also remaps the
 * glyphs of the objects attached to those clips
 * (`clip.attach`; one left without a glyph is detached and stays where it is). Mutates `project`
 * in place, so it works inside an immer recipe. When two old glyphs map onto one new glyph, the
 * later colour wins and pair indices are de-duplicated. `freed` gives the point an end a tween
 * carried a line to is left at once its glyphs are gone (`freeTweenEnd`), worked out from the
 * project before the remap (`freedEndPoint`); without it, the point the end was drawn at.
 */
export function remapGlyphRefs(
  project: Project,
  formulaId: FormulaId,
  map: readonly (number | null)[],
  freed?: FreedEndPoint,
): RemapReport {
  const report = emptyRemapReport();
  const lookup = (i: number): number | null => map[i] ?? null;

  const remapColors = (colors: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, color] of Object.entries(colors)) {
      const j = lookup(Number(key));
      if (j === null) report.droppedColors++;
      else out[String(j)] = color;
    }
    return out;
  };

  const remapSide = (glyphs: number[]): number[] => {
    const { kept, dropped } = remapIndices(glyphs, map);
    report.droppedPairGlyphs += dropped;
    return kept;
  };
  /** The pairs with the chosen sides remapped, preserving a lost copies principal for repair.
   * Other pairs left with an empty side are dropped. Within a
   * formula (`disjoint`: a morph block's pairs) a glyph that lands on both sides is dropped from
   * both: it cannot turn into itself. */
  const remapPairs = <P extends GlyphPair>(
    pairs: P[],
    sides: { from: boolean; to: boolean },
    disjoint = false,
  ): P[] => {
    const kept: P[] = [];
    for (const pair of pairs) {
      if (sides.from) {
        const principal = remapPairPrincipal(pair, map);
        if (principal !== undefined) pair.principal = principal;
        pair.from = remapSide(pair.from);
        if (pair.routes) pair.routes = remapPairRoutes(pair.routes, 'from', map);
      }
      if (sides.to) {
        pair.to = remapSide(pair.to);
        if (pair.routes) pair.routes = remapPairRoutes(pair.routes, 'to', map);
      }
      if (disjoint) {
        const shared = pair.from.filter((g) => pair.to.includes(g));
        if (shared.length > 0) {
          pair.from = pair.from.filter((g) => !shared.includes(g));
          pair.to = pair.to.filter((g) => !shared.includes(g));
          report.droppedPairGlyphs += 2 * shared.length;
        }
      }
      if (
        pair.principal !== undefined &&
        pair.principal !== null &&
        !pair.from.includes(pair.principal)
      ) {
        pair.principal = null;
      }
      // A route goes with a glyph it named, and two that land on one couple leave the first;
      // the one route of a pair left with one glyph on each side gives its path to the pair.
      const pruned = prunePairRoutes(pair);
      if (pruned.routes) pair.routes = pruned.routes;
      else delete pair.routes;
      if (pruned.path) pair.path = pruned.path;
      const repairable = pair.extras === 'copies' && pair.principal === null;
      if ((pair.from.length > 0 || repairable) && pair.to.length > 0) kept.push(pair);
      else report.droppedPairs++;
    }
    return kept;
  };

  for (const formula of project.formulas) {
    if (formula.id !== formulaId) continue;
    formula.glyphColors = remapColors(formula.glyphColors);
    const hidden = new Set<number>();
    for (const i of formula.hiddenGlyphs) {
      const j = lookup(i);
      if (j === null) report.droppedHidden++;
      else hidden.add(j);
    }
    formula.hiddenGlyphs = [...hidden].sort((a, b) => a - b);
  }

  const clipIds = new Set<string>();
  for (const clip of project.clips) {
    if (clip.formulaId !== formulaId) continue;
    clipIds.add(clip.id);
    clip.initial.glyphColors = remapColors(clip.initial.glyphColors);
    if (clip.startHidden) {
      const { kept, dropped } = remapIndices(clip.startHidden, map);
      report.droppedHidden += dropped;
      if (kept.length > 0) clip.startHidden = kept.sort((a, b) => a - b);
      else delete clip.startHidden;
    }
    for (const action of clip.actions) {
      if (action.kind === 'tween') {
        if (action.to.glyphColors) action.to.glyphColors = remapColors(action.to.glyphColors);
      } else if (action.kind === 'morph') {
        action.pairs = remapPairs(action.pairs, { from: true, to: true }, true);
      } else if (action.glyphs !== 'all') {
        const glyphs = new Set<number>();
        for (const i of action.glyphs) {
          const j = lookup(i);
          if (j === null) report.droppedActionGlyphs++;
          else glyphs.add(j);
        }
        action.glyphs = [...glyphs].sort((a, b) => a - b);
      }
    }
  }

  for (const relation of project.relations) {
    const fromSide = clipIds.has(relation.fromClipId);
    const toSide = clipIds.has(relation.toClipId);
    if (!fromSide && !toSide) continue;
    relation.pairs = remapPairs(relation.pairs, { from: fromSide, to: toSide });
  }

  // What places a clip by those glyphs names them the same way, each of its targets on its own.
  // Left without a glyph of one of its clips, an attachment is freed — the object stays where it
  // is, as when that clip is deleted —, a tween that carried a shape there (`TweenFit`) goes — it
  // has nowhere to carry its shape — and the end a tween carried a line to (`TweenEnds`) is freed
  // where it was drawn.
  for (const clip of project.clips) {
    const lostFits = new Set<string>();
    for (const use of placementUses(clip)) {
      let emptied = false;
      const lostEnds: ('start' | 'end')[] = [];
      for (const { target, path } of use.spots) {
        if (target.glyphs === 'all' || !clipIds.has(target.clipId)) continue;
        const { kept, dropped } = remapIndices(target.glyphs, map);
        report.droppedAttachGlyphs += dropped;
        if (kept.length > 0) target.glyphs = kept.sort((a, b) => a - b);
        else if (use.owner.kind === 'ends') lostEnds.push(path.at(-1) as 'start' | 'end');
        else emptied = true;
      }
      if (use.owner.kind === 'ends') {
        const { tween } = use.owner;
        for (const side of lostEnds) {
          freeTweenEnd(tween, side, freed?.(clip.id, tween.id, side) ?? null);
        }
        report.detached += lostEnds.length;
        continue;
      }
      if (!emptied) continue;
      if (use.owner.kind === 'fit') {
        lostFits.add(use.owner.tween.id);
        report.droppedFits++;
      } else {
        clip.attach = null;
        report.detached++;
      }
    }
    if (lostFits.size > 0) clip.actions = clip.actions.filter((a) => !lostFits.has(a.id));
  }

  return report;
}
