/* A join taken apart, and put back (D167). Several sources onto one target are one pair by
 * default — linking onto a target that has a pair joins it (`linkPair`, D53) —, and that pair has
 * one style. «Split into separate pairs» makes a pair of each source, all onto the same target,
 * so that each can have its own style and its own path; «Join into one pair» puts the pairs that
 * bring one target back into one, when one pair can play what they play. The model lets pairs of one relation (or Morph block) bring the
 * same targets when they bring exactly the same ones (`transferOwnershipIssues`).
 *
 * Both are about pairs of ONE target: with several, a pair per source would send each source to
 * every target, which is another animation, not the same one in parts. Pure. */
import { equalSplines } from '../../geom';
import {
  effectiveExtras,
  missingPrincipal,
  prunePairRoutes,
  routePath,
  sourceStyle,
  type GlyphPair,
  type PairRoute,
  type PathSpline,
  type RelationStyle,
} from '../../model';
import { sameGlyphs, sortedUnique, type PairHolder } from './relationOps';

const oneTarget = (pair: GlyphPair): boolean => new Set(pair.to).size === 1;

/** Whether a pair can be taken apart: several sources onto one target. Not a pair that plays
 * nothing (a `copies` pair that lost its principal): its parts would start playing, each a
 * transform, and that is a repair to make by hand. */
export function splittable(pair: GlyphPair): boolean {
  return oneTarget(pair) && new Set(pair.from).size > 1 && !missingPrincipal(pair);
}

/** The places of the pairs that bring the same one target as pair `index`, itself among them
 * and in their order; only itself when no other does, none when it has several targets. */
export function pairsOfTarget(pairs: readonly GlyphPair[], index: number): number[] {
  const pair = pairs[index];
  if (!pair || !oneTarget(pair)) return [];
  return pairs.flatMap((p, i) => (sameGlyphs(p.to, pair.to) ? [i] : []));
}

/** Whether pair `index` can be joined with others: more pairs bring its one target. */
export function joinable(pairs: readonly GlyphPair[], index: number): boolean {
  return pairsOfTarget(pairs, index).length > 1;
}

/** What each source of the pairs `members` plays, by the first of them that holds it: the style
 * of its pair, or `copy` for a source that only sends a copy. */
function playedStyles(holder: PairHolder, members: readonly GlyphPair[]) {
  const from = sortedUnique(members.flatMap((p) => p.from));
  const ownerOf = (source: number) => members.find((p) => p.from.includes(source))!;
  const styleOf = (source: number): RelationStyle => {
    const pair = ownerOf(source);
    return sourceStyle(pair, pair.style ?? holder.style, source);
  };
  const styles = from.map(styleOf);
  const same = styles.every((s) => s === styles[0]);
  const leads = from.filter((_, i) => styles[i] !== 'copy');
  return { from, ownerOf, same, leads, copies: !same && leads.length === 1 };
}

/** Why the pairs that bring the target of pair `index` cannot be joined, or null when they can
 * (or when there is nothing to join). One pair has one style: its sources all play it, or one
 * plays it and the others send copies. Pairs whose sources play otherwise — a transform and a
 * fade, two transforms and a copy — would play something else as one pair, with other glyphs
 * consumed; so would a pair that plays nothing as it is, two pairs that hold the same source, or
 * a pair that merges its sources into one group (`extras: 'merge'`). */
export function joinBlocker(holder: PairHolder, index: number): string | null {
  const group = pairsOfTarget(holder.pairs, index);
  if (group.length < 2) return null;
  const members = group.map((i) => holder.pairs[i]!);
  if (members.some(missingPrincipal)) {
    return 'One of the pairs has lost its principal source: repair it first.';
  }
  const sources = members.flatMap((p) => [...new Set(p.from)]);
  if (new Set(sources).size < sources.length) {
    return 'Two of the pairs hold the same source: one pair holds a glyph once.';
  }
  // A pair that merges its sources plays them as one group: the joined pair plays each source
  // apart (or one and copies), which is another animation, in the preview and in the Python.
  // (A pair of one source has nothing to merge: `effectiveExtras` says `merge` of it too.)
  if (members.some((p) => new Set(p.from).size > 1 && effectiveExtras(p) === 'merge')) {
    return 'One of the pairs merges its sources («Merge (Manim)»): joined with another, each source would arrive on its own. Set it to «Separate» first.';
  }
  const { same, copies } = playedStyles(holder, members);
  return same || copies
    ? null
    : 'The pairs have styles that one pair cannot hold: give them one style, or one style and copies.';
}

/** Pair `index` as one pair per source, in its place and in glyph order. Each keeps what it
 * played: the pair's style — or `copy`, for a source that only sent a copy (`copies`) — and the
 * path it followed, its route's own or the pair's. The same holder when the pair cannot be taken
 * apart. A pair that merged its sources (`merge`) plays differently once apart: every source
 * arrives. */
export function splitPair<T extends PairHolder>(holder: T, index: number): T {
  const pair = holder.pairs[index];
  if (!pair || !splittable(pair)) return holder;
  const target = pair.to[0]!;
  const style = pair.style ?? holder.style;
  const parts = sortedUnique(pair.from).map((source): GlyphPair => {
    const path = routePath(pair, source, target);
    return {
      from: [source],
      to: [target],
      // What it played: a copy for a source that only sent one, else the pair's own style (a
      // pair that inherited keeps inheriting).
      style: sourceStyle(pair, style, source) === style ? pair.style : 'copy',
      ...(path ? { path } : {}),
    };
  });
  return { ...holder, pairs: holder.pairs.flatMap((p, i) => (i === index ? parts : [p])) };
}

/** What `joinPairs` made. */
export interface Joined<T extends PairHolder> {
  holder: T;
  /** Where the one pair is now. */
  index: number;
  /** The places, before, of the pairs it was made of. */
  from: number[];
}

/** The pairs that bring the one target of pair `index`, as one pair in the place of the first:
 * all their sources, each on the path it had (a common path when they all followed the same
 * one, routes of their own otherwise) and playing what it played: the same style for all, or
 * one source that transforms while the others copy (`copies`, that source the principal). Null
 * when there is nothing to join, or when one pair could not play the same (`joinBlocker`). */
export function joinPairs<T extends PairHolder>(holder: T, index: number): Joined<T> | null {
  const group = pairsOfTarget(holder.pairs, index);
  if (group.length < 2 || joinBlocker(holder, index)) return null;
  const members = group.map((i) => holder.pairs[i]!);
  const first = members[0]!;
  const target = first.to[0]!;
  const { from, ownerOf, leads, copies } = playedStyles(holder, members);
  const pathOf = (source: number): PathSpline | null => routePath(ownerOf(source), source, target);
  const lead = copies ? ownerOf(leads[0]!) : first;

  const paths = from.map(pathOf);
  const [one] = paths;
  const common = paths.every((p) => (p && one ? equalSplines(p, one) : p === one));
  const routes: PairRoute[] = common
    ? []
    : from.flatMap((source, i) => (paths[i] ? [{ from: source, to: target, path: paths[i] }] : []));

  const joined: GlyphPair = prunePairRoutes({
    from,
    to: [target],
    // The principal's own style, where it had one; a pair that inherited keeps inheriting.
    style: lead.style,
    ...(copies ? { extras: 'copies' as const, principal: leads[0]! } : {}),
    ...(common && one ? { path: one } : {}),
    ...(routes.length > 0 ? { routes } : {}),
  });
  const pairs = holder.pairs.flatMap((p, i) =>
    i === group[0] ? [joined] : group.includes(i) ? [] : [p],
  );
  return { holder: { ...holder, pairs }, index: group[0]!, from: group };
}
