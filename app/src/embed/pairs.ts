/* What the relation editor does with the pairs of a relation, for the widgets of the web
 * documentation (`MFEPlayer.engine.relations`): a click on a glyph, linking glyphs into pairs
 * (one to one, several to one, one to several), the pairs the editor suggests, the glyphs no pair
 * takes, and the names and colours the editor shows. The player is built from the core alone and
 * cannot import `ui/`, so these are copies of the editor's own functions —
 * `ui/relations/relationOps.ts`, `pairGestures.ts`, `relationDraft.ts` (`unpairedGlyphs`),
 * `pairColors.ts`, `pairStyle.ts`, `styleOptions.ts` and `linkLayout.ts` —, which
 * `__tests__/pairs.test.ts` holds to the originals case by case: a change there fails it until this
 * file follows. Pure. */
import { boxSize, type Box } from '../geom';
import {
  clipLifetimes,
  initializePairPrincipal,
  principalOf,
  sourceRoles,
  type FormulaSnapshot,
  type GlyphPair,
  type PairExtras,
  type Project,
  type Relation,
  type RelationStyle,
} from '../model';

// ---- Names and colours (ui/relations/styleOptions.ts, pairStyle.ts, pairColors.ts) ----

/** The styles a relation or a pair can have, as the editor lists them. */
export const STYLE_OPTIONS: readonly { value: RelationStyle; label: string }[] = [
  { value: 'transform', label: 'Transform' },
  { value: 'copy', label: 'Copy (source stays)' },
  { value: 'fade', label: 'Fade transform' },
  { value: 'fade_copy', label: 'Fade copy (source stays)' },
];

/** A style's label without its parenthesis ("Copy"). */
export const styleLabel = (style: RelationStyle): string =>
  (STYLE_OPTIONS.find((o) => o.value === style)?.label ?? style).split(' (')[0]!;

/** How the sources of a pair of several onto one target reach it (`GlyphPair.extras`). */
export const EXTRAS_OPTIONS: readonly { value: PairExtras; label: string; title: string }[] = [
  {
    value: 'separate',
    label: 'Separate',
    title: 'Each source makes its own transform onto the target: all of them arrive.',
  },
  {
    value: 'merge',
    label: 'Merge (Manim)',
    title:
      "Manim's alignment of the two groups: the sources beyond the first fade into the target.",
  },
  {
    value: 'copies',
    label: 'Copies',
    title:
      'The authored principal transforms; the others send a copy and stay. Initially the lowest source index, preserved when glyph order changes.',
  },
];

const STYLE_LETTER: Record<RelationStyle, string> = {
  transform: 'T',
  copy: 'C',
  fade: 'F',
  fade_copy: 'FC',
};

/** The badge at the junction of a pair's links: "T", "C", "F", "FC", or "I:" and the relation's style's
 * letter when the pair inherits it. */
export function pairStyleBadge(pair: GlyphPair, defaultStyle: RelationStyle): string {
  return pair.style ? STYLE_LETTER[pair.style] : `I:${STYLE_LETTER[defaultStyle]}`;
}

/** The colours that tell the pairs of a relation apart in the editor (never a state). */
export const PAIR_COLORS = [
  '#58C4DD',
  '#83C167',
  '#FC6255',
  '#E6C229',
  '#FF862F',
  '#9A72AC',
  '#C55F73',
  '#D147BD',
] as const;

export const pairColor = (index: number): string => PAIR_COLORS[index % PAIR_COLORS.length]!;

// ---- Pairs (ui/relations/relationOps.ts) ----

/** The glyphs selected on each side of the editor. */
export interface SideSelection {
  from: ReadonlySet<number>;
  to: ReadonlySet<number>;
}

/** What holds glyph pairs with a default style: a relation, or a Morph block. */
export interface PairHolder {
  pairs: GlyphPair[];
  style: RelationStyle;
}

/** Ascending, without duplicates (the order the contract stores). */
export function sortedUnique(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/** A pair's style: its own, or the one of what holds it. */
export const styleOfPair = (pair: GlyphPair, relation: Pick<PairHolder, 'style'>): RelationStyle =>
  pair.style ?? relation.style;

/** The result of `linkPair`: the holder with the new pair — or, when the link joined an existing
 * pair, that pair grown, which one it was (`joined`) and a sentence saying so — or why the pair
 * cannot be made. */
export type LinkResult<T extends PairHolder = Relation> =
  { ok: true; relation: T; joined?: number; message?: string } | { ok: false; message: string };

/** Whether two lists name the same glyphs, in any order. */
export function sameGlyphs(a: readonly number[], b: readonly number[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((g) => right.has(g));
}

/** Adds the pair `from → to` to `relation`, as the editor's Link does. Linking onto the targets of
 * one existing pair adds the sources to that pair instead (two glyphs that become one), with the
 * pair's own style — unless the link is to stay `separate`: a pair of its own that brings the
 * same targets, as a link onto targets that several pairs bring already always is. Fails when
 * the targets belong to pairs that bring different glyphs or only some of them are linked, when a
 * source is in a pair of those targets already, or when a glyph that a pair already consumes
 * would be consumed again. */
export function linkPair<T extends PairHolder>(
  relation: T,
  from: readonly number[],
  to: readonly number[],
  style: RelationStyle | null = null,
  labels?: { from: (glyph: number) => string; to: (glyph: number) => string },
  options: { separate?: boolean } = {},
): LinkResult<T> {
  const src = sortedUnique(from);
  const dst = sortedUnique(to);
  if (src.length === 0 || dst.length === 0) {
    return { ok: false, message: 'Select at least one glyph on each side.' };
  }
  const name = (side: 'from' | 'to', glyph: number) =>
    `${labels?.[side](glyph) ?? ''} (${glyph})`.trim();
  const names = (side: 'from' | 'to', glyphs: readonly number[]) =>
    glyphs.map((g) => name(side, g)).join(', ');
  const consumedBy = (pair: GlyphPair) => sourceRoles(pair, styleOfPair(pair, relation)).consumed;
  const consumedElsewhere = (g: number, except: GlyphPair | null) =>
    relation.pairs.some((p) => p !== except && consumedBy(p).includes(g));

  // Targets that are linked already: all of them in one pair, and the link joins it — or in
  // pairs that bring those same targets, a join taken apart, and the link is one more of them.
  const holding = relation.pairs.filter((p) => p.to.some((g) => dst.includes(g)));
  const shared = holding.length > 0 && holding.every((p) => sameGlyphs(p.to, dst));
  if (holding.length > 1 && !shared) {
    return {
      ok: false,
      message: `Target glyphs ${names('to', dst)} are linked in different pairs: link onto the targets of one pair to add a source to it.`,
    };
  }
  const apart = holding.length > 1 || (options.separate === true && holding.length === 1);
  if (apart && !shared) {
    const index = relation.pairs.indexOf(holding[0]!);
    return {
      ok: false,
      message: `A separate pair brings the same targets as pair ${index + 1}: ${names('to', holding[0]!.to)}.`,
    };
  }
  if (apart) {
    for (const pair of holding) {
      const repeated = src.find((g) => pair.from.includes(g));
      if (repeated !== undefined) {
        return {
          ok: false,
          message: `Source glyph ${name('from', repeated)} is in pair ${relation.pairs.indexOf(pair) + 1} already.`,
        };
      }
    }
  }
  const owner = apart ? undefined : holding[0];
  if (owner) {
    const index = relation.pairs.indexOf(owner);
    const free = dst.filter((g) => !owner.to.includes(g));
    if (free.length > 0) {
      return {
        ok: false,
        message: `Target glyph ${names('to', free)} is not linked, while ${names('to', owner.to)} is in pair ${index + 1}: link onto the targets of that pair alone to add a source to it.`,
      };
    }
    const repeated = src.find((g) => owner.from.includes(g));
    if (repeated !== undefined) {
      return {
        ok: false,
        message: `Source glyph ${name('from', repeated)} is in pair ${index + 1} already.`,
      };
    }
    const grown: GlyphPair = { ...owner, from: sortedUnique([...owner.from, ...src]) };
    if (grown.extras === 'copies' || grown.principal !== undefined) {
      grown.principal = principalOf({ from: grown.from });
    }
    const consumedBefore = new Set(consumedBy(owner));
    for (const g of consumedBy(grown)) {
      if (!consumedBefore.has(g) && consumedElsewhere(g, owner)) {
        return {
          ok: false,
          message: `Source glyph ${name('from', g)} is already consumed by another pair. Make one of the pairs a copy.`,
        };
      }
    }
    return {
      ok: true,
      joined: index,
      message: `Glyph${src.length === 1 ? '' : 's'} ${names('from', src)} joined pair ${index + 1}: ${names('from', grown.from)} → ${names('to', grown.to)}.`,
      relation: { ...relation, pairs: relation.pairs.map((p) => (p === owner ? grown : p)) },
    };
  }

  for (const g of sourceRoles({ from: src, to: dst }, style ?? relation.style).consumed) {
    if (consumedElsewhere(g, null)) {
      return {
        ok: false,
        message: `Source glyph ${name('from', g)} is already consumed by another pair. Make one of the pairs a copy.`,
      };
    }
  }
  const made: GlyphPair = { from: src, to: apart ? [...holding[0]!.to] : dst, style };
  return {
    ok: true,
    ...(apart && options.separate !== true
      ? {
          message: `Glyph${src.length === 1 ? '' : 's'} ${names('from', src)} made a pair of ${src.length === 1 ? 'its' : 'their'} own onto ${names('to', dst)}, which ${holding.length} pairs bring already.`,
        }
      : {}),
    relation: { ...relation, pairs: [...relation.pairs, made] },
  };
}

/** `relation` without the pairs at `indices`. */
export function removePairs<T extends PairHolder>(relation: T, indices: readonly number[]): T {
  return { ...relation, pairs: relation.pairs.filter((_, i) => !indices.includes(i)) };
}

/** Gives the pairs at `indices` their own style (`null`: inherit the holder's). */
export function setPairsStyle<T extends PairHolder>(
  relation: T,
  indices: readonly number[],
  style: RelationStyle | null,
): T {
  return {
    ...relation,
    pairs: relation.pairs.map((p, i) => (indices.includes(i) ? { ...p, style } : p)),
  };
}

/** How the sources of pair `index` reach its one target. */
export function setPairExtras<T extends PairHolder>(
  relation: T,
  index: number,
  extras: PairExtras,
): T {
  return {
    ...relation,
    pairs: relation.pairs.map((p, i) =>
      i === index ? initializePairPrincipal({ ...p, extras }) : p,
    ),
  };
}

/** Glyph indices of a formula in reading order: left to right, then top to bottom. */
export function readingOrder(snapshot: FormulaSnapshot): number[] {
  return snapshot.glyphs
    .map((g, i) => ({ i, x: g.center[0], y: g.center[1] }))
    .sort((a, b) => a.x - b.x || b.y - a.y || a.i - b.i)
    .map((g) => g.i);
}

/** The editor's Suggest links by label: one-to-one pairs between glyphs with the same label, the
 * k-th "x" of the source (in reading order) with the k-th "x" of the target. Glyphs that already
 * take part in a pair are left out, and so are the glyphs of `taken`: those another relation or a
 * Morph block keeps from this one. */
export function suggestPairs(
  from: FormulaSnapshot,
  to: FormulaSnapshot,
  existing: readonly GlyphPair[],
  taken: { from?: Iterable<number>; to?: Iterable<number> } = {},
): GlyphPair[] {
  const usedFrom = new Set([...existing.flatMap((p) => p.from), ...(taken.from ?? [])]);
  const usedTo = new Set([...existing.flatMap((p) => p.to), ...(taken.to ?? [])]);
  const queue = new Map<string, number[]>();
  for (const g of readingOrder(from)) {
    if (usedFrom.has(g)) continue;
    const label = from.glyphs[g]!.label;
    queue.set(label, [...(queue.get(label) ?? []), g]);
  }
  const out: GlyphPair[] = [];
  for (const g of readingOrder(to)) {
    if (usedTo.has(g)) continue;
    const candidates = queue.get(to.glyphs[g]!.label);
    const source = candidates?.shift();
    if (source !== undefined) out.push({ from: [source], to: [g], style: null });
  }
  return out.sort((a, b) => a.to[0]! - b.to[0]!);
}

/** Label of a glyph for the UI: its snapshot label, or its index. */
export function glyphLabel(snapshot: FormulaSnapshot | null, glyph: number): string {
  const label = snapshot?.glyphs[glyph]?.label;
  return label && label !== '?' ? label : String(glyph);
}

/** "m x → m x": the glyphs of a pair as text. */
export function describePair(
  pair: GlyphPair,
  from: FormulaSnapshot | null,
  to: FormulaSnapshot | null,
): string {
  const side = (glyphs: number[], snapshot: FormulaSnapshot | null) =>
    glyphs.map((g) => glyphLabel(snapshot, g)).join(' ');
  return `${side(pair.from, from)} → ${side(pair.to, to)}`;
}

/** One line about a relation being edited: "4 linked pairs · 1 glyph leaves · 0 glyphs
 * arrive" — its pairs, the source glyphs no relation consumes and the target glyphs no relation
 * brings (`staysOut`: the target starts empty, so they "stay out"). */
export function relationSummary(
  pairs: number,
  leaving: number,
  arriving: number,
  staysOut = false,
): string {
  const glyphs = (n: number, one: string, many: string) =>
    `${n} glyph${n === 1 ? '' : 's'} ${n === 1 ? one : many}`;
  return [
    `${pairs} linked pair${pairs === 1 ? '' : 's'}`,
    glyphs(leaving, 'leaves', 'leave'),
    staysOut ? glyphs(arriving, 'stays out', 'stay out') : glyphs(arriving, 'arrives', 'arrive'),
  ].join(' · ');
}

// ---- The glyphs no pair takes (ui/relations/relationDraft.ts) ----

/** What the glyphs no pair carries do, as the scene plays them: the lifetimes of the project with
 * `relation` in place of its own of the same id, the clips' intros and outros as they are (the
 * editor's draft as it opens; audit A3-03). Those of the source that its outro takes away
 * (`leaving`: no relation, Morph block nor Disappear block of the clip took them before) and those
 * of the target that its intro brings (`entering`: no relation, Morph block nor Appear block brings
 * them, and the clip does not leave them out) — of a target that starts empty, those nothing
 * brings, which stay out. A copy pair leaves its source glyphs where they are. Of the first
 * `fromCount` and `toCount` glyphs of the two formulas, ascending. */
export function unpairedGlyphs(
  project: Project,
  relation: Relation,
  fromCount: number,
  toCount: number,
): { leaving: number[]; entering: number[] } {
  const exists = project.relations.some((r) => r.id === relation.id);
  const lifetimes = clipLifetimes({
    ...project,
    relations: exists
      ? project.relations.map((r) => (r.id === relation.id ? relation : r))
      : [...project.relations, relation],
  });
  const source = lifetimes.get(relation.fromClipId);
  const target = lifetimes.get(relation.toClipId);
  const empty = project.clips.find((c) => c.id === relation.toClipId)?.startsEmpty === true;
  return {
    leaving: (source?.outro ?? []).filter((glyph) => glyph < fromCount),
    entering: empty
      ? Array.from({ length: toCount }, (_, glyph) => glyph).filter(
          (glyph) => !target?.stints.has(glyph),
        )
      : (target?.intro ?? []).filter((glyph) => glyph < toCount),
  };
}

// ---- Clicks on glyphs (ui/relations/pairGestures.ts) ----

export type PairSide = 'from' | 'to';

export type GlyphClick =
  { kind: 'select'; selection: SideSelection } | { kind: 'link'; from: number[]; to: number[] };

/** A click on `glyph` of `side`. With Shift / Ctrl / ⌘ (`additive`) it toggles the glyph in the
 * selection of its side; on a side with nothing selected while the other side has a selection
 * it links at once; otherwise it selects that glyph alone (or nothing, when it was the only
 * selected glyph of its side). */
export function glyphClick(
  selection: SideSelection,
  side: PairSide,
  glyph: number,
  additive: boolean,
): GlyphClick {
  const mine = selection[side];
  const other = side === 'from' ? selection.to : selection.from;
  const put = (next: ReadonlySet<number>): GlyphClick => ({
    kind: 'select',
    selection: { ...selection, [side]: next },
  });
  if (additive) {
    const next = new Set(mine);
    if (next.has(glyph)) next.delete(glyph);
    else next.add(glyph);
    return put(next);
  }
  if (mine.size === 0 && other.size > 0) {
    return side === 'to'
      ? { kind: 'link', from: [...selection.from], to: [glyph] }
      : { kind: 'link', from: [glyph], to: [...selection.to] };
  }
  return put(mine.size === 1 && mine.has(glyph) ? new Set() : new Set([glyph]));
}

/** The pairs (by index) that hold a glyph of the selection on its side. */
export function pairsHolding(pairs: readonly GlyphPair[], selection: SideSelection): number[] {
  return pairs.flatMap((p, i) =>
    p.from.some((g) => selection.from.has(g)) || p.to.some((g) => selection.to.has(g)) ? [i] : [],
  );
}

// ---- The editor's drawing of the two formulas (ui/relations/linkLayout.ts) ----

/** How the relation editor's drawing lays its two formulas out: the source above the target,
 * or at its left. */
export type PairLayout = 'stacked' | 'side';

/** A translation of a formula's own coordinates into the drawing's. */
export interface LinkOffset {
  dx: number;
  dy: number;
}

/** Where the relation editor's drawing puts its two formulas (scene units, y up), with the
 * margins around them: stacked, both centred on x = 0, the source above a gap and the target
 * below it; side by side, both centred on y = 0, the source at the left of the gap. */
export interface LinkFrame {
  layout: PairLayout;
  /** What the spacing is proportional to: the gap between the formulas and the margins. */
  unit: number;
  from: LinkOffset;
  to: LinkOffset;
  /** Stacked: the free band between the formulas, where the junctions of the links go. Side by
   * side there is none across: both are 0. */
  gapTop: number;
  gapBottom: number;
  /** The box of the whole drawing. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The size of the text that glyphs of these boxes are: the median of their longer sides. 0
 * without glyphs. */
export function textSize(boxes: readonly Box[]): number {
  const sides = boxes
    .map((box) => Math.max(...boxSize(box)))
    .filter((side) => Number.isFinite(side) && side > 0)
    .sort((a, b) => a - b);
  if (sides.length === 0) return 0;
  const middle = sides.length >> 1;
  return sides.length % 2 === 1 ? sides[middle]! : (sides[middle - 1]! + sides[middle]!) / 2;
}

/** The frame of the drawing for the boxes of the source (`a`) and of the target (`b`), whose
 * text is `text` large (`textSize` of the glyphs of both). */
export function linkFrame(a: Box, b: Box, text: number, layout: PairLayout = 'stacked'): LinkFrame {
  const [w1, h1] = boxSize(a);
  const [w2, h2] = boxSize(b);
  const unit = Math.max(text, 0.05) * 0.6;
  const gap = unit * 5;
  const pad = unit * 0.8;
  // Room under the formulas for the index badge of a hovered glyph, and as much at least over a
  // stacked source.
  const labelRoom = unit;
  if (layout === 'side') {
    const halfH = Math.max(h1, h2) / 2;
    const left = -gap / 2 - w1 - pad;
    const right = gap / 2 + w2 + pad;
    return {
      layout,
      unit,
      from: { dx: -gap / 2 - a.maxX, dy: -(a.minY + a.maxY) / 2 },
      to: { dx: gap / 2 - b.minX, dy: -(b.minY + b.maxY) / 2 },
      gapTop: 0,
      gapBottom: 0,
      left,
      right,
      // Room over the formulas for the arcs of the pairs of their first line: a share of the
      // drawing's width.
      top: halfH + (right - left) * 0.15 + pad,
      bottom: -halfH - labelRoom - pad,
    };
  }
  const halfW = Math.max(w1, w2, unit * 4) / 2;
  const left = -halfW - pad;
  const right = halfW + pad;
  return {
    layout,
    unit,
    from: { dx: -(a.minX + a.maxX) / 2, dy: gap / 2 - a.minY },
    to: { dx: -(b.minX + b.maxX) / 2, dy: -gap / 2 - b.maxY },
    gapTop: gap / 2,
    gapBottom: -gap / 2,
    left,
    right,
    // Room over the source for the keys the editor has over the corner of its drawing: a share
    // of the drawing's width.
    top: gap / 2 + h1 + Math.max(labelRoom, (right - left) * 0.055) + pad,
    bottom: -gap / 2 - h2 - labelRoom - pad,
  };
}
