/* Pure operations on relations, shared by the relation editor, the Animations panel and the
 * timeline; the pair operations work on anything that holds pairs (`PairHolder`), so the pair
 * editor of Morph blocks (`ui/morph/`) uses them too. Nothing here touches stores or the DOM;
 * functions that change a project take a draft (inside a store `update` recipe) and mutate it.
 *
 * Window rules (docs/ARCHITECTURE.md §5): a relation window lies within [A.start + A.intro, A.end]
 * and [B.start, B.end − B.outro]; the offset is relative to B's start. `windowRange` is the
 * intersection of the two. When clips move or are trimmed, `fitRelationWindows` keeps the windows
 * of their relations inside that range (shifting first, then shortening); a pair of clips that no
 * longer overlap keeps its window and `validateProject` reports it. A relation with a clip on a
 * locked track is not fitted: the edits of its other clip stop where its window would no longer
 * fit (`lockedRelations.ts`). */
import { arcSpline, equalSplines, isStraightSpline } from '../../geom';
import {
  createRelation,
  initializePairPrincipal,
  KINDS,
  principalOf,
  introWindow,
  outroWindow,
  TIME_EPSILON,
  pairRoutes,
  type Clip,
  type ClipId,
  type FormulaSnapshot,
  type GlyphPair,
  type PairRoute,
  type Project,
  type Relation,
  type RelationId,
  type RelationStyle,
  type Window,
  sourceRoles,
  type PairExtras,
} from '../../model';
import { round6 } from '../time';
import { regionInside, regionLabel, type TimeRegion } from '../timeline/region';

/** A relation window is never shorter than this (seconds). */
export const MIN_WINDOW = 0.05;

/** Where a window between `from` and `to` may lie, or null when the clips leave no room. */
export function windowRange(from: Clip, to: Clip): Window | null {
  const start = Math.max(introWindow(from).end, to.start);
  const end = Math.min(from.end, outroWindow(to).start);
  return end - start >= MIN_WINDOW - TIME_EPSILON ? { start, end } : null;
}

export interface WindowSpec {
  offset: number;
  duration: number;
}

/** The window of a new relation: from the start of B (or the first moment both clips allow),
 * one second long when it fits. */
export function defaultWindow(from: Clip, to: Clip, duration = 1): WindowSpec | null {
  const range = windowRange(from, to);
  if (!range) return null;
  const length = Math.min(duration, range.end - range.start);
  return { offset: round6(range.start - to.start), duration: round6(length) };
}

/** An added relation is given a window after the ones its clips have only when at least this
 * much time (seconds) is left for it there. */
export const MIN_ADDED_WINDOW = 0.25;

/** The window of a relation added between two clips: the default one for their first relation;
 * for another one, right after the last window of those they have — one second long, or as long
 * as the clips leave —, so that it does not start out lying under them on the timeline, moving
 * the same instant. With no room left after them, the default window. */
export function addedWindow(
  project: Project,
  from: Clip,
  to: Clip,
  duration = 1,
): WindowSpec | null {
  const range = windowRange(from, to);
  if (!range) return null;
  const siblings = relationsBetween(project, from.id, to.id);
  if (siblings.length === 0) return defaultWindow(from, to, duration);
  const last = Math.max(...siblings.map((r) => to.start + r.offset + r.duration));
  const start = Math.max(last, range.start);
  if (range.end - start < MIN_ADDED_WINDOW - TIME_EPSILON) return defaultWindow(from, to, duration);
  return {
    offset: round6(start - to.start),
    duration: round6(Math.min(duration, range.end - start)),
  };
}

/** The window of a new relation that starts at `time` — where the playhead is —, a second long
 * or as long as the clips leave after it. Null when no window fits there: `time` is outside the
 * range the two clips allow, or less than `MIN_ADDED_WINDOW` of it is left. */
export function windowAt(from: Clip, to: Clip, time: number, duration = 1): WindowSpec | null {
  const range = windowRange(from, to);
  if (!range) return null;
  if (time < range.start - TIME_EPSILON) return null;
  const start = Math.max(time, range.start);
  if (range.end - start < MIN_ADDED_WINDOW - TIME_EPSILON) return null;
  return {
    offset: round6(start - to.start),
    duration: round6(Math.min(duration, range.end - start)),
  };
}

/** What the relation editor says of a new relation whose window could not start at the playhead
 * (`time`): where the playhead was, when the two clips allow a window, and where it starts
 * instead. */
export function playheadNote(from: Clip, to: Clip, time: number, window: WindowSpec): string {
  const range = windowRange(from, to);
  const shared = range ? `${range.start.toFixed(2)}–${range.end.toFixed(2)} s` : 'no time';
  return `No window fits at the playhead (${time.toFixed(2)} s): the two clips allow one within ${shared}. It starts at ${(to.start + window.offset).toFixed(2)} s instead.`;
}

/** The window of a new relation that takes the `region` marked on the timeline whole (D180), or
 * the sentence that says why it cannot: the two clips allow no window, or not all along the
 * region, or the region is shorter than a window may be. */
export function windowIn(from: Clip, to: Clip, region: TimeRegion): WindowSpec | string {
  const label = regionLabel(region);
  const range = windowRange(from, to);
  if (!range || !regionInside(region, range.start, range.end)) {
    const shared = range
      ? `the two clips allow one within ${range.start.toFixed(2)}–${range.end.toFixed(2)} s`
      : 'the two clips allow none';
    return `No window fits in the region (${label}): ${shared}. Nothing was created: move the region, or remove it (Esc) to start the relation at the playhead.`;
  }
  const duration = round6(region.end - region.start);
  if (duration < MIN_WINDOW - TIME_EPSILON) {
    return `The region (${label}) is too short for a relation’s window. Nothing was created.`;
  }
  return { offset: round6(region.start - to.start), duration };
}

/** `window` moved and shortened to lie inside the range of `from` and `to`; null when the
 * clips leave no room. */
export function fitWindow(window: WindowSpec, from: Clip, to: Clip): WindowSpec | null {
  const range = windowRange(from, to);
  if (!range) return null;
  const duration = Math.min(Math.max(window.duration, MIN_WINDOW), range.end - range.start);
  const start = Math.min(Math.max(to.start + window.offset, range.start), range.end - duration);
  return { offset: round6(start - to.start), duration: round6(duration) };
}

/** Keep the windows of the relations that touch `clipIds` (all of them when omitted) inside
 * their range after an edit of those clips (mutates a draft). A relation a locked track holds
 * (`relationLock`) is never fitted: its window stays where it plays, and the edits of its other
 * clip stop where it would no longer fit (`lockedRelations.ts`). */
export function fitRelationWindows(draft: Project, clipIds?: Iterable<ClipId>): void {
  const ids = clipIds ? new Set(clipIds) : null;
  const byId = new Map(draft.clips.map((c) => [c.id, c]));
  for (const relation of draft.relations) {
    if (ids && !ids.has(relation.fromClipId) && !ids.has(relation.toClipId)) continue;
    if (relationLock(draft, relation) !== null) continue;
    const from = byId.get(relation.fromClipId);
    const to = byId.get(relation.toClipId);
    if (!from || !to) continue;
    const fitted = fitWindow(relation, from, to);
    if (!fitted) continue;
    // Leave a window that already fits exactly as it is.
    if (Math.abs(fitted.offset - relation.offset) > 1e-9) relation.offset = fitted.offset;
    if (Math.abs(fitted.duration - relation.duration) > 1e-9) relation.duration = fitted.duration;
  }
}

/** Put the windows of `draft`'s relations back to what `original` had (gestures recompute from
 * the state at their start, so that moving a clip back undoes what fitting did on the way). */
export function restoreWindows(draft: Project, original: Project): void {
  const before = new Map(original.relations.map((r) => [r.id, r]));
  for (const relation of draft.relations) {
    const old = before.get(relation.id);
    if (!old) continue;
    relation.offset = old.offset;
    relation.duration = old.duration;
  }
}

/** Trimming the start edge of a target clip would drag its relation windows along (the offset
 * is relative to the start); compensate so that they keep their place in time. Call it after
 * the trim, with the start the clip had before. A window the trim has passed starts with its
 * target: an offset is never negative, or a window that nothing can fit — its source moved away —
 * would start before its target, and before the scene once the target is moved to 0 s. */
export function keepWindowsInPlace(draft: Project, clipId: ClipId, oldStart: number): void {
  const clip = draft.clips.find((c) => c.id === clipId);
  if (!clip) return;
  for (const relation of draft.relations) {
    if (relation.toClipId === clipId)
      relation.offset = Math.max(0, round6(relation.offset + oldStart - clip.start));
  }
}

// --- Querying -----------------------------------------------------------------------

/** The relations from `fromId` to `toId` in the order of their windows — the one that plays first
 * comes first; two that start together, in the project's order (the order they were made in).
 * Two clips can have several (format 31). They share their target clip, so the order of their
 * offsets is the order of their windows. */
export function relationsBetween(project: Project, fromId: ClipId, toId: ClipId): Relation[] {
  return project.relations
    .filter((r) => r.fromClipId === fromId && r.toClipId === toId)
    .sort((a, b) => (Math.abs(a.offset - b.offset) <= TIME_EPSILON ? 0 : a.offset - b.offset));
}

/** Where `relation` stands among the relations of its two clips in its direction, by the order
 * of their windows (`relationsBetween`): the `n`-th `of` them, counting from 1. The relation
 * counts as it is given — a draft with its window as it is now, whether the project holds it
 * (with another window, perhaps) or not —; among relations that start together, one the project
 * does not hold comes last. */
export function relationNumber(
  project: Project,
  relation: Pick<Relation, 'id' | 'fromClipId' | 'toClipId' | 'offset'>,
): { n: number; of: number } {
  const index = project.relations.findIndex((r) => r.id === relation.id);
  let before = 0;
  let others = 0;
  project.relations.forEach((other, i) => {
    if (
      other.id === relation.id ||
      other.fromClipId !== relation.fromClipId ||
      other.toClipId !== relation.toClipId
    )
      return;
    others += 1;
    const together = Math.abs(other.offset - relation.offset) <= TIME_EPSILON;
    if (together ? index < 0 || i < index : other.offset < relation.offset) before += 1;
  });
  return { n: before + 1, of: others + 1 };
}

/** "Relation" for the only one of its two clips, "Relation 2 of 3" among several: what tells
 * them apart wherever one is named by its clips. */
export function relationTitle(
  project: Project,
  relation: Pick<Relation, 'id' | 'fromClipId' | 'toClipId' | 'offset'>,
): string {
  const { n, of } = relationNumber(project, relation);
  return of > 1 ? `Relation ${n} of ${of}` : 'Relation';
}

/** The window and the pairs of a relation in a few words: "2.00–3.00 s · 3 pairs". */
export function windowAndPairs(project: Project, relation: Relation): string {
  const to = project.clips.find((c) => c.id === relation.toClipId);
  const start = (to?.start ?? 0) + relation.offset;
  const pairs = relation.pairs.length;
  return `${start.toFixed(2)}–${(start + relation.duration).toFixed(2)} s · ${pairs} pair${pairs === 1 ? '' : 's'}`;
}

/** Why a locked track keeps `relation` from being made, edited or deleted (saving a relation
 * writes to both of its clips, so either lock counts), or null. */
export function relationLock(
  project: Project,
  relation: Pick<Relation, 'fromClipId' | 'toClipId'>,
): string | null {
  for (const clipId of [relation.fromClipId, relation.toClipId]) {
    const clip = project.clips.find((c) => c.id === clipId);
    const track = clip && project.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) {
      return `Track “${track.name}” is locked: unlock it on the timeline to create, edit or delete relations of its clips.`;
    }
  }
  return null;
}

/** The kind of the object of `clip` ("brace", "shape", "line") when its glyphs cannot be sent or
 * received through a relation (`KINDS[kind].transfers`): it is one piece. Null for a formula or a
 * text, and for a clip whose formula is missing (`relationAlive` says so). */
function onePieceKind(project: Project, clip: Clip): string | null {
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  return formula && !KINDS[formula.kind].transfers ? KINDS[formula.kind].label.toLowerCase() : null;
}

/** Whether `clip` can take part in a relation: its object is a formula or a text. A brace, a
 * shape or a line has no Relations tab, no link port and is not offered to relate with. */
export function relatable(project: Project, clip: Clip): boolean {
  return onePieceKind(project, clip) === null;
}

/** Why `from → to` cannot be a relation, or null when it can. */
export function relationBlocker(project: Project, from: Clip, to: Clip): string | null {
  if (from.id === to.id) return 'A relation needs two different clips.';
  const piece = [from, to].map((clip) => onePieceKind(project, clip)).find((kind) => kind);
  if (piece) return `A ${piece} is one piece: a relation is between formulas and texts.`;
  if (from.trackId === to.trackId) return 'Clips on the same track cannot be related.';
  const lock = relationLock(project, { fromClipId: from.id, toClipId: to.id });
  if (lock) return lock;
  if (!windowRange(from, to)) {
    return 'The clips must overlap in time: the source must still be on screen (after its intro) while the target is (before its outro).';
  }
  return null;
}

/** Why `from` cannot be related with `to` at all, or null: what «Create relation…» and a link
 * port of the timeline ask before they go on (`relateClips`), and what marks the clips a link
 * can land on. Two clips that are related already can be asked about whenever their relations
 * can be edited — the menu says why another one cannot be added —; two that are not need what a
 * first relation needs (`relationBlocker`). */
export function relateBlocker(project: Project, from: Clip, to: Clip): string | null {
  return relationsBetween(project, from.id, to.id).length > 0
    ? relationLock(project, { fromClipId: from.id, toClipId: to.id })
    : relationBlocker(project, from, to);
}

/** Whether `relation` can be drawn and edited: its two clips and their formulas exist. A file
 * may refer to a formula that is not in it (`dangling-ref`): it opens so that it can be
 * repaired, and such a relation can only be deleted. */
export function relationAlive(
  project: Project,
  relation: Pick<Relation, 'fromClipId' | 'toClipId'>,
): boolean {
  const has = (clipId: ClipId) => {
    const clip = project.clips.find((c) => c.id === clipId);
    return !!clip && project.formulas.some((f) => f.id === clip.formulaId);
  };
  return has(relation.fromClipId) && has(relation.toClipId);
}

/** Why `relation` cannot be edited, though it plays and exports as it is: a side of it is a
 * brace, a shape or a line, one piece, which the editor relates nothing with (`relationBlocker`).
 * A saved project may hold one (`relation-kind`, a warning; audit A1-02): its pairs, paths and
 * settings stay as they are, and it can only be deleted. Null for a relation between formulas and
 * texts, and for one whose formula is missing (`relationAlive` says so). */
export function onePieceRelation(
  project: Project,
  relation: Pick<Relation, 'fromClipId' | 'toClipId'>,
): string | null {
  for (const clipId of [relation.fromClipId, relation.toClipId]) {
    const clip = project.clips.find((c) => c.id === clipId);
    const formula = clip && project.formulas.find((f) => f.id === clip.formulaId);
    if (formula && !KINDS[formula.kind].transfers) {
      return `"${formula.name}" is a ${KINDS[formula.kind].label.toLowerCase()}, one piece: a relation is between formulas and texts, so this one cannot be edited, only deleted.`;
    }
  }
  return null;
}

/** A pair's style: its own, or the one of what holds it (a relation or a Morph block). */
export const styleOfPair = (pair: GlyphPair, relation: Pick<PairHolder, 'style'>): RelationStyle =>
  pair.style ?? relation.style;

// --- Pairs ---------------------------------------------------------------------------

export interface SideSelection {
  from: ReadonlySet<number>;
  to: ReadonlySet<number>;
}

/** The relation editor's glyph selection after a marquee that touches the source glyphs
 * `touched.from` and the target glyphs `touched.to`, starting from `base`: a side it touches
 * becomes those glyphs (with `additive`: gains them), a side it does not touch keeps its
 * selection, so one side can be picked after the other. A marquee that touches nothing clears
 * both, as a press on the background does, unless `additive`. */
export function marqueeSides(
  base: SideSelection,
  touched: { from: readonly number[]; to: readonly number[] },
  additive: boolean,
): SideSelection {
  if (!additive && touched.from.length === 0 && touched.to.length === 0) {
    return { from: new Set(), to: new Set() };
  }
  const side = (mine: ReadonlySet<number>, hit: readonly number[]) =>
    hit.length === 0 ? mine : new Set(additive ? [...mine, ...hit] : hit);
  return { from: side(base.from, touched.from), to: side(base.to, touched.to) };
}

/** Ascending, without duplicates (the order the contract stores). */
export function sortedUnique(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/** What holds glyph pairs with a default style that pairs without their own inherit: a relation,
 * or a Morph block (or the draft of either). The pair operations below keep everything else of
 * the holder as it is. */
export interface PairHolder {
  pairs: GlyphPair[];
  style: RelationStyle;
}

/** The result of `linkPair`: the holder with the new pair (named `relation` for the relations,
 * which were the only holders once) — or, when the link joined an existing pair, the holder with
 * that pair grown and which pair it was (`joined`, its index) with a sentence saying so — or why
 * the pair cannot be made. */
export type LinkResult<T extends PairHolder = Relation> =
  { ok: true; relation: T; joined?: number; message?: string } | { ok: false; message: string };

/** Whether two lists name the same glyphs, in any order. */
export function sameGlyphs(a: readonly number[], b: readonly number[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((g) => right.has(g));
}

/** Add the pair `from → to` to `relation` (returns a new holder of the same kind). Linking onto
 * the targets of one existing pair adds the sources to that pair instead (D53: two glyphs that
 * become one, `ReplacementTransform(VGroup(a, b), c)`), with the pair's own style — unless the
 * link is to stay `separate` (D167): a pair of its own that brings the same targets, with its own
 * style, as a link onto targets that several pairs bring already always is. Fails when the
 * targets belong to pairs that bring different glyphs or only some of them are linked, when a
 * source is in that pair already, or when a glyph that a pair already consumes would be consumed
 * again; the last would be an error of `validateProject`. */
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
    // The same glyph twice onto one target, through two pairs, is one route played twice.
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
    // Explicit source authoring chooses the edited set's minimum (D54). Rebase/style helpers
    // never call this path: they retain the authored source or its recorded loss.
    if (grown.extras === 'copies' || grown.principal !== undefined) {
      grown.principal = principalOf({ from: grown.from });
    }
    // Every newly consumed source must be free, including an existing copied source that the
    // explicit edit makes principal. Unchanged preexisting consumption stays repairable.
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
    {
      if (consumedElsewhere(g, null)) {
        return {
          ok: false,
          message: `Source glyph ${name('from', g)} is already consumed by another pair. Make one of the pairs a copy.`,
        };
      }
    }
  }
  // A pair of its own onto targets other pairs bring keeps their order of the targets.
  const made: GlyphPair = { from: src, to: apart ? [...holding[0]!.to] : dst, style };
  return {
    ok: true,
    // Linked by a plain click onto targets that several pairs bring: say what happened.
    ...(apart && options.separate !== true
      ? {
          message: `Glyph${src.length === 1 ? '' : 's'} ${names('from', src)} made a pair of ${src.length === 1 ? 'its' : 'their'} own onto ${names('to', dst)}, which ${holding.length} pairs bring already.`,
        }
      : {}),
    relation: { ...relation, pairs: [...relation.pairs, made] },
  };
}

export function removePair<T extends PairHolder>(relation: T, index: number): T {
  return removePairs(relation, [index]);
}

export function removePairs<T extends PairHolder>(relation: T, indices: readonly number[]): T {
  return { ...relation, pairs: relation.pairs.filter((_, i) => !indices.includes(i)) };
}

/** How the sources of pair `index` reach its one target (`GlyphPair.extras`, D54). */
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

/** Whether a pair has a path of its own (D48): one shaped in Edit path, which is neither the
 * chord itself nor the arc of what holds it — the two paths that say nothing of their own, which
 * Edit path drops on leaving (`ui/preview/pathEdit.ts`). The pair's common path alone: the marks
 * of an edited path read `wearsEditedPath`, which counts its routes too. */
export function hasEditedPath(pair: GlyphPair, holder: { pathArc: number }): boolean {
  const { path } = pair;
  return (
    path !== undefined && !isStraightSpline(path) && !equalSplines(path, arcSpline(holder.pathArc))
  );
}

/** Whether a pair wears the mark of an edited path: it has a path of its own (`hasEditedPath`),
 * or one of its routes has (D167, `editedRoutes`). Every mark of an edited path reads it. */
export function wearsEditedPath(
  pair: GlyphPair,
  holder: { pathArc: number; style?: RelationStyle },
): boolean {
  return hasEditedPath(pair, holder) || editedRoutes(pair, holder).length > 0;
}

/** The routes of a pair with a path of their own that says something: one the pair plays (when
 * the holder's `style` is given: a stored route the pair does not play is ignored, as the
 * preview ignores it) whose path is not what the route would follow without it — the pair's
 * path, or the holder's arc. */
export function editedRoutes(
  pair: GlyphPair,
  holder: { pathArc: number; style?: RelationStyle },
): PairRoute[] {
  if (!pair.routes || pair.routes.length === 0) return [];
  const played =
    holder.style === undefined
      ? null
      : new Set(pairRoutes(pair, pair.style ?? holder.style).map((r) => `${r.from}>${r.to}`));
  const plain = pair.path ?? arcSpline(holder.pathArc);
  return pair.routes.filter(
    (route) =>
      (played === null || played.has(`${route.from}>${route.to}`)) &&
      !equalSplines(route.path, plain) &&
      !(isStraightSpline(route.path) && isStraightSpline(plain)),
  );
}

/** How many pairs of a relation (or Morph block) wear the mark of an edited path
 * (`wearsEditedPath`). */
export function editedPathCount(holder: {
  pairs: readonly GlyphPair[];
  pathArc: number;
  style?: RelationStyle;
}): number {
  return holder.pairs.filter((pair) => wearsEditedPath(pair, holder)).length;
}

/** What the Relations list says beside a relation with edited paths: "1 path edited",
 * "3 paths edited"; null for none. */
export function editedPathsText(count: number): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? 'path' : 'paths'} edited`;
}

/** What a pair's path reads as: its own custom path, else the holder's arc (0 = straight). A
 * stored path that is the chord itself counts as straight, and one that is the holder's arc as
 * that arc. */
export function pathOfPair(
  pair: GlyphPair,
  holder: { pathArc: number; style?: RelationStyle },
): string {
  if (hasEditedPath(pair, holder)) return 'custom path';
  const routes = editedRoutes(pair, holder).length;
  if (routes > 0)
    return routes === 1 ? 'custom path on a route' : `custom paths on ${routes} routes`;
  if ((pair.path && isStraightSpline(pair.path)) || holder.pathArc === 0) return 'straight';
  return `arc ${holder.pathArc}°`;
}

/** What «Edit path…» of a relation's row in the Relations list does (D48): the Edit-path mode on
 * its one pair at once, or the path picker to choose among several — or why it cannot, in the
 * words of the other entries that edit a path: a locked track, a formula the file refers to that
 * is not in it, an object of one piece on a side (`onePieceRelation`), no pairs yet. */
export type RelationPathAction =
  { kind: 'pair'; index: number } | { kind: 'picker' } | { kind: 'blocked'; reason: string };

export function relationPathAction(project: Project, relation: Relation): RelationPathAction {
  const lock = relationLock(project, relation);
  if (lock) return { kind: 'blocked', reason: lock };
  if (!relationAlive(project, relation)) {
    return { kind: 'blocked', reason: 'A formula of this relation no longer exists.' };
  }
  const piece = onePieceRelation(project, relation);
  if (piece) return { kind: 'blocked', reason: piece };
  if (relation.pairs.length === 0) {
    return { kind: 'blocked', reason: 'No pairs yet: open the pair editor to link glyphs.' };
  }
  return relation.pairs.length === 1 ? { kind: 'pair', index: 0 } : { kind: 'picker' };
}

/** The pairs at `indices` without their custom path, nor those of their routes (they follow the
 * holder's arc again). */
export function clearPairsPath<T extends PairHolder>(relation: T, indices: readonly number[]): T {
  return {
    ...relation,
    pairs: relation.pairs.map((p, i) => {
      if (!indices.includes(i) || (!p.path && !p.routes)) return p;
      const rest = { ...p };
      delete rest.path;
      delete rest.routes;
      return rest;
    }),
  };
}

export function setPairStyle<T extends PairHolder>(
  relation: T,
  index: number,
  style: RelationStyle | null,
): T {
  return setPairsStyle(relation, [index], style);
}

/** Give the pairs at `indices` their own style (`null`: inherit the holder's). */
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

/** Glyph indices of a formula in reading order: left to right, then top to bottom. */
export function readingOrder(snapshot: FormulaSnapshot): number[] {
  return snapshot.glyphs
    .map((g, i) => ({ i, x: g.center[0], y: g.center[1] }))
    .sort((a, b) => a.x - b.x || b.y - a.y || a.i - b.i)
    .map((g) => g.i);
}

/** One-to-one pairs between glyphs with the same label: the k-th "x" of the source (in reading
 * order) with the k-th "x" of the target. Glyphs that already take part in a pair are left out
 * (sources too, so that the suggestion never consumes a glyph twice), and so are the glyphs of
 * `taken`: those another relation or a Morph block keeps from this one. */
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

// --- Creating -------------------------------------------------------------------------

/** A new relation with a valid window, or a reason why there cannot be one. The window starts
 * at `playhead` (scene seconds) when one fits there (`windowAt`): a relation is made where the
 * user is on the timeline. Without a playhead, or when none fits there, it is the window of
 * `addedWindow` — the default one, or after the windows of the relations the two clips have —,
 * and `note` says so of a playhead that was given. With a `region` (D180) the window is the
 * region, whatever the playhead says, and there is no relation when it does not fit there. */
export function newRelation(
  project: Project,
  fromId: ClipId,
  toId: ClipId,
  playhead?: number,
  region?: TimeRegion | null,
): { ok: true; relation: Relation; note: string | null } | { ok: false; message: string } {
  const from = project.clips.find((c) => c.id === fromId);
  const to = project.clips.find((c) => c.id === toId);
  if (!from || !to) return { ok: false, message: 'A clip of the relation no longer exists.' };
  const blocker = relationBlocker(project, from, to);
  if (blocker) return { ok: false, message: blocker };
  if (region) {
    const inRegion = windowIn(from, to, region);
    if (typeof inRegion === 'string') return { ok: false, message: inRegion };
    return { ok: true, relation: createRelation(fromId, toId, inRegion), note: null };
  }
  const there = playhead === undefined ? null : windowAt(from, to, playhead);
  const window = there ?? addedWindow(project, from, to)!;
  const note = playhead !== undefined && !there ? playheadNote(from, to, playhead, window) : null;
  return { ok: true, relation: createRelation(fromId, toId, window), note };
}

export function copyRelation(relation: Relation): Relation {
  return structuredClone(relation);
}

/** A copy of the project with `relation` replacing the one of the same id (or appended). */
export function withRelation(project: Project, relation: Relation): Project {
  const exists = project.relations.some((r) => r.id === relation.id);
  return {
    ...project,
    relations: exists
      ? project.relations.map((r) => (r.id === relation.id ? relation : r))
      : [...project.relations, relation],
  };
}

export function deleteRelation(draft: Project, id: RelationId): void {
  draft.relations = draft.relations.filter((r) => r.id !== id);
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

/** A clip as the lists name it: formula · track · time range. */
export function clipLabel(project: Project, clip: Clip): string {
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  const track = project.tracks.find((t) => t.id === clip.trackId);
  return `${formula?.name ?? '?'} · ${track?.name ?? '?'} · ${clip.start.toFixed(1)}–${clip.end.toFixed(1)} s`;
}

/** One line about a relation: its window, style and number of pairs. */
export function summarize(project: Project, relation: Relation): string {
  const { pairs } = relation;
  const to = project.clips.find((c) => c.id === relation.toClipId);
  const start = (to?.start ?? 0) + relation.offset;
  return `${start.toFixed(2)}–${(start + relation.duration).toFixed(2)} s · ${relation.style} · ${pairs.length} pair${pairs.length === 1 ? '' : 's'}`;
}

/** One line about a relation being edited (D28): "4 linked pairs · 1 glyph leaves · 0 arrive" —
 * its pairs, the source glyphs no relation consumes (they leave with the outro) and the target
 * glyphs no relation brings (they arrive with the intro; `staysOut`: the target starts empty,
 * so they "stay out"). */
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
