/* The pair editor of a Morph block (`MorphEditor.tsx`): which glyphs of the clip's formula can be
 * sources and targets of the block, the pairs "Suggest" proposes, linking with the rule of the
 * block (a glyph is never on both sides), and what validation would say of a draft of pairs. Pure.
 *
 * Eligibility and suggestions read the lifetime of the project with the block's own pairs taken
 * out (`withMorphPairs(…, [])`), so that what the author links never changes what is offered: a
 * source is fully on screen when the block starts; a target is off screen until then — or on
 * screen only because the intro brought it: a target arrives through its pair and skips the intro,
 * so the author hides nothing by hand — and nothing else brings it in (a target has one owner
 * among relations and Morph blocks). Neither may be animated by anything else during the block
 * (the intro aside, for a target), which validation would refuse (`action-overlap`). */
import {
  actionWindow,
  clipLifetimes,
  glyphTransfers,
  overlaps,
  TIME_EPSILON,
  type ActionId,
  type Clip,
  type ClipId,
  type Formula,
  type FormulaSnapshot,
  type GlyphPair,
  type Issue,
  type MorphAction,
  type Project,
  type RelationStyle,
  type Cause,
  type Severity,
  type Stint,
  type Window,
  sourceRoles,
} from '../../model';
import { animationName } from '../animations/blockKinds';
import { severities } from '../animations/issues';
import { rebasePairs, type RebasedPairs } from '../relations/pairDraft';
import { dropSharedGlyphs } from '../relations/pairSession';
import { involvesTransfer, transactionProblems } from '../relations/draftValidation';
import {
  glyphLabel,
  linkPair,
  sortedUnique,
  type LinkResult,
  type PairHolder,
} from '../relations/relationOps';

/** A Morph block of the project, where it is and what it animates. */
export interface FoundMorph {
  clip: Clip;
  action: MorphAction;
  formula: Formula | undefined;
  /** Its issue path, `['clips', ci, 'actions', ai]`. */
  path: ['clips', number, 'actions', number];
}

export function findMorph(project: Project, clipId: ClipId, actionId: ActionId): FoundMorph | null {
  const ci = project.clips.findIndex((c) => c.id === clipId);
  const clip = project.clips[ci];
  if (!clip) return null;
  const ai = clip.actions.findIndex((a) => a.id === actionId);
  const action = clip.actions[ai];
  if (!action || action.kind !== 'morph') return null;
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  return { clip, action, formula, path: ['clips', ci, 'actions', ai] };
}

/** Whether the editor can stay open on the block: it, its clip and the clip's formula exist. */
export function morphAlive(project: Project, clipId: ClipId, actionId: ActionId): boolean {
  return !!findMorph(project, clipId, actionId)?.formula;
}

/** Why a locked track keeps the pairs of the clip's Morph blocks from being edited, or null. */
export function morphLock(project: Project, clipId: ClipId): string | null {
  const clip = project.clips.find((c) => c.id === clipId);
  const track = clip && project.tracks.find((t) => t.id === clip.trackId);
  return track?.locked
    ? `Track “${track.name}” is locked: unlock it on the timeline to edit the pairs of its Morph blocks.`
    : null;
}

/** The pairs an editor opened on the block starts from, or why it cannot open. */
export function openMorphDraft(
  project: Project,
  clipId: ClipId,
  actionId: ActionId,
): { ok: true; pairs: GlyphPair[] } | { ok: false; message: string } {
  const found = findMorph(project, clipId, actionId);
  if (!found) return { ok: false, message: 'This Morph block no longer exists.' };
  if (!found.formula) {
    return {
      ok: false,
      message:
        'The formula of this clip no longer exists (the file refers to one that is not in the project): delete the clip.',
    };
  }
  const lock = morphLock(project, clipId);
  if (lock) return { ok: false, message: lock };
  return { ok: true, pairs: structuredClone(found.action.pairs) };
}

/** A copy of the project whose block has `pairs` (the project itself when the block is gone). */
export function withMorphPairs(
  project: Project,
  clipId: ClipId,
  actionId: ActionId,
  pairs: readonly GlyphPair[],
): Project {
  return {
    ...project,
    clips: project.clips.map((clip) =>
      clip.id !== clipId
        ? clip
        : {
            ...clip,
            actions: clip.actions.map((a) =>
              a.id === actionId && a.kind === 'morph' ? { ...a, pairs: [...pairs] } : a,
            ),
          },
    ),
  };
}

// --- Eligibility ---------------------------------------------------------------------------

export interface MorphEligibility {
  /** The block's window, absolute seconds. */
  window: Window;
  /** Glyphs that can be sources: fully on screen when the block starts (another transfer that
   * delivers one has ended by then: adjacent windows are fine), not consumed before, and animated
   * by nothing else during the block (Manim runs one animation per glyph at a time). */
  sources: number[];
  /** Glyphs that can be targets: off screen until the block starts, or on screen only because
   * the intro brought them (linked, they skip the intro and arrive through the block); not
   * consumed or used as a source by another transfer before, brought in by no other relation or
   * Morph block, and animated by nothing else during the block but the intro (linked, a target
   * leaves the intro). */
  targets: number[];
  /** Why each other glyph of the formula cannot be a source / a target. */
  notSource: ReadonlyMap<number, string>;
  notTarget: ReadonlyMap<number, string>;
  /** A hint about targets that something else would bring: the intro (`INTRO_TARGET`), or an
   * Appear block later (`appearTarget`), which then leaves them out. */
  targetNotes: ReadonlyMap<number, string>;
}

export const NOT_ELIGIBLE = {
  notYet: 'not on screen yet',
  arriving: 'still arriving',
  gone: 'off screen by then',
  consumed: 'consumed earlier',
  onScreen: 'on screen already',
  earlier: 'on screen earlier',
  relation: 'brought in by a relation',
  morph: 'brought in by another Morph block',
  source: 'a source of an earlier transfer',
  busy: 'busy during the block',
} as const;

/** The hint on a target the intro brings. */
export const INTRO_TARGET = 'brought by the intro: linked, it arrives through the block instead';

/** The hint on a target an Appear block brings later (`block`: "the Write block"). */
export const appearTarget = (block: string) =>
  `brought by ${block}: linked, that block leaves it out`;

/** Why a glyph a Disappear block took out before the block is no target: linked, it would skip
 * the intro and not be on screen before, so that block would have nothing to take out. A block
 * brings back such a glyph with an Appear block, not by a pair. */
export const takenOutEarlier = (block: string) =>
  `taken out earlier by ${block}: linked, it would not be on screen before this block, and that block would leave it out`;

/** Which glyphs of the formula (its snapshot's; other indices are ignored) can take part in the
 * block, from the lifetime without the block's own pairs; null when the block is gone. */
export function morphEligibility(
  project: Project,
  clipId: ClipId,
  actionId: ActionId,
): MorphEligibility | null {
  const found = findMorph(project, clipId, actionId);
  if (!found) return null;
  const { clip, action, formula } = found;
  const window = actionWindow(clip, action);
  const t = window.start;
  const base = withMorphPairs(project, clipId, actionId, []);
  const life = clipLifetimes(base).get(clipId);

  // Other transfers into this clip own their targets; consuming ones that start by then (here,
  // or a relation that takes the glyph to another clip) leave nothing to use; and a glyph another
  // transfer takes from by then must be on screen already (it cannot arrive here).
  const owner = new Map<number, 'relation' | 'morph'>();
  const consumed = new Set<number>();
  const usedBefore = new Set<number>();
  for (const transfer of glyphTransfers(base)) {
    for (const pair of transfer.pairs) {
      if (transfer.toClipId === clipId) {
        for (const g of pair.to) if (!owner.has(g)) owner.set(g, transfer.origin.kind);
      }
      if (transfer.fromClipId === clipId && transfer.start <= t + TIME_EPSILON) {
        const roles = sourceRoles(pair, pair.style);
        for (const g of roles.consumed) consumed.add(g);
        for (const g of roles.copied) usedBefore.add(g);
      }
    }
  }

  // What else animates a glyph during the block's window (the block's own pairs are out of
  // `base`, so none of its spans are there): "busy during the block (the outro)". A target may
  // overlap the intro, which it leaves once linked.
  const kinds = new Map(glyphTransfers(base).map((tr) => [tr.key, tr.origin.kind]));
  const what = (cause: Cause): string => {
    switch (cause.kind) {
      case 'intro':
        return 'the intro';
      case 'outro':
      case 'clip-end':
        return 'the outro';
      case 'transfer':
        return kinds.get(cause.key) === 'morph' ? 'another Morph block' : 'a relation window';
      case 'action': {
        const other = clip.actions.find((a) => a.id === cause.actionId);
        return other ? `the ${animationName(other)} block` : 'another block';
      }
    }
  };
  const busyDuring = (g: number, exceptIntro: boolean): string | null => {
    const span = (life?.busy.get(g) ?? []).find(
      (s) => !(exceptIntro && s.cause.kind === 'intro') && overlaps(s, window),
    );
    return span ? `${NOT_ELIGIBLE.busy} (${what(span.cause)})` : null;
  };

  const covers = (s: Stint) => s.enter.start <= t + TIME_EPSILON && s.exit.end > t + TIME_EPSILON;
  const sources: number[] = [];
  const targets: number[] = [];
  const notSource = new Map<number, string>();
  const notTarget = new Map<number, string>();
  const targetNotes = new Map<number, string>();
  const count = formula?.snapshot?.glyphs.length ?? 0;
  for (let g = 0; g < count; g++) {
    const stints = life?.stints.get(g) ?? [];
    const covering = stints.find(covers);
    const before = stints.some((s) => s.enter.start <= t + TIME_EPSILON);

    if (consumed.has(g)) notSource.set(g, NOT_ELIGIBLE.consumed);
    else if (covering && covering.enter.end <= t + TIME_EPSILON) {
      const busy = busyDuring(g, false);
      if (busy) notSource.set(g, busy);
      else sources.push(g);
    } else if (covering?.enter.cause.kind === 'transfer') notSource.set(g, NOT_ELIGIBLE.arriving);
    else if (covering || !before) notSource.set(g, NOT_ELIGIBLE.notYet);
    else notSource.set(g, NOT_ELIGIBLE.gone);

    const by = owner.get(g);
    if (by) notTarget.set(g, by === 'relation' ? NOT_ELIGIBLE.relation : NOT_ELIGIBLE.morph);
    else if (consumed.has(g)) notTarget.set(g, NOT_ELIGIBLE.consumed);
    else if (usedBefore.has(g)) notTarget.set(g, NOT_ELIGIBLE.source);
    else if (covering && covering.enter.cause.kind !== 'intro') {
      notTarget.set(
        g,
        covering.enter.end > t + TIME_EPSILON
          ? NOT_ELIGIBLE.arriving
          : `${NOT_ELIGIBLE.onScreen} (brought by ${what(covering.enter.cause)})`,
      );
    } else if (!covering && before) {
      const last = stints.filter((st) => st.enter.start <= t + TIME_EPSILON).at(-1);
      notTarget.set(
        g,
        last?.exit.cause.kind === 'action'
          ? takenOutEarlier(what(last.exit.cause))
          : NOT_ELIGIBLE.earlier,
      );
    } else {
      const busy = busyDuring(g, true);
      if (busy) notTarget.set(g, busy);
      else {
        targets.push(g);
        const later = stints.find((st) => st.enter.start > t + TIME_EPSILON);
        if (covering) targetNotes.set(g, INTRO_TARGET);
        else if (later?.enter.cause.kind === 'action') {
          targetNotes.set(g, appearTarget(what(later.enter.cause)));
        }
      }
    }
  }
  return { window, sources, targets, notSource, notTarget, targetNotes };
}

// --- Suggestions -----------------------------------------------------------------------------

/** Glyph indices of a formula line by line: the lines top to bottom, left to right within a
 * line. A glyph starts a new line when it lies wholly below every glyph of the current one, so
 * the rows of an aligned derivation are its lines (subscripts stay on theirs) whether or not
 * their columns line up; a fraction reads as its numerator, its main line, its denominator. */
export function lineOrder(snapshot: FormulaSnapshot): number[] {
  const glyphs = snapshot.glyphs
    .map((g, i) => ({
      i,
      x: g.center[0],
      y: g.center[1],
      top: g.center[1] + g.size[1] / 2,
      bottom: g.center[1] - g.size[1] / 2,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x || a.i - b.i);
  const lines: (typeof glyphs)[] = [];
  let bottom = Infinity;
  for (const g of glyphs) {
    const line = lines[lines.length - 1];
    if (line && g.top > bottom + TIME_EPSILON) {
      line.push(g);
      bottom = Math.min(bottom, g.bottom);
    } else {
      lines.push([g]);
      bottom = g.bottom;
    }
  }
  return lines.flatMap((line) => line.sort((a, b) => a.x - b.x || a.i - b.i).map((g) => g.i));
}

/** Pairs proposed by "Suggest": walking the eligible targets line by line (`lineOrder`), each
 * takes the nearest glyph before it with the same label that is an eligible source, not taken by
 * another proposal and not proposed as a target itself; a target without one is skipped. Glyphs
 * the `existing` pairs hold, on either side, take no part. On an aligned derivation each line
 * comes from the one above it: the first block of `A &= x_1 \\ &= x_2 \\ &= x_3` gets
 * = → = and x → x from row 1 to row 2, the next one (row 2 has arrived) from row 2 to row 3.
 * Style null (the block's); ordered by target. */
export function suggestMorphPairs(
  project: Project,
  clipId: ClipId,
  actionId: ActionId,
  existing: readonly GlyphPair[],
): GlyphPair[] {
  const eligibility = morphEligibility(project, clipId, actionId);
  const snapshot = findMorph(project, clipId, actionId)?.formula?.snapshot;
  if (!eligibility || !snapshot) return [];
  const used = new Set(existing.flatMap((p) => [...p.from, ...p.to]));
  const sources = new Set(eligibility.sources.filter((g) => !used.has(g)));
  const targets = new Set(eligibility.targets.filter((g) => !used.has(g)));
  const order = lineOrder(snapshot);
  const label = (g: number) => snapshot.glyphs[g]!.label;
  const taken = new Set<number>();
  const proposed = new Set<number>();
  const pairs: GlyphPair[] = [];
  order.forEach((target, k) => {
    if (!targets.has(target)) return;
    for (let j = k - 1; j >= 0; j--) {
      const g = order[j]!;
      if (label(g) !== label(target) || !sources.has(g) || taken.has(g) || proposed.has(g)) {
        continue;
      }
      taken.add(g);
      proposed.add(target);
      pairs.push({ from: [g], to: [target], style: null });
      return;
    }
  });
  return pairs.sort((a, b) => a.to[0]! - b.to[0]!);
}

/** Why `suggestMorphPairs` has nothing to offer, in the editor's words. */
export function whyNoSuggestion(
  project: Project,
  clipId: ClipId,
  actionId: ActionId,
  existing: readonly GlyphPair[],
): string {
  const eligibility = morphEligibility(project, clipId, actionId);
  if (!eligibility) return 'This Morph block no longer exists.';
  if (suggestMorphPairs(project, clipId, actionId, []).length > 0) {
    return 'Nothing more to suggest: the glyphs with a match are linked already.';
  }
  const used = new Set(existing.flatMap((p) => [...p.from, ...p.to]));
  // Every glyph busy (a block inside the outro or the intro): the block is in the wrong place.
  if (eligibility.sources.length === 0 && eligibility.targets.length === 0) {
    const reasons = [...eligibility.notSource.values(), ...eligibility.notTarget.values()];
    const busy = reasons.map((r) => /^busy during the block \((.*)\)$/.exec(r)?.[1]);
    if (busy.length > 0 && busy.every((b) => b !== undefined)) {
      return `Nothing to suggest: every glyph is busy during the block (${busy[0]}). Move the block first.`;
    }
  }
  if (eligibility.targets.filter((g) => !used.has(g)).length === 0) {
    return 'Nothing to suggest: no glyph is free to arrive with this block (another animation brings it in, or it is linked already).';
  }
  if (eligibility.sources.filter((g) => !used.has(g)).length === 0) {
    return 'Nothing to suggest: no glyph is fully on screen when the block starts.';
  }
  return 'Nothing to suggest: no glyph that can arrive has a glyph with the same label before it that is on screen when the block starts.';
}

// --- Linking ---------------------------------------------------------------------------------

/** `linkPair` (a new pair, or the sources added to the pair whose targets were linked onto) with
 * the rule of a Morph block on top: a glyph is never on both sides of one block (it cannot turn
 * into itself, nor be a source and a target of the same play). `label` names a glyph of the
 * formula in the messages; `style` is the new pair's own (null: the block's), and `separate`
 * keeps it a pair of its own onto the targets of a pair. */
export function linkMorphPair<T extends PairHolder>(
  holder: T,
  from: readonly number[],
  to: readonly number[],
  label?: (glyph: number) => string,
  style: RelationStyle | null = null,
  separate = false,
): LinkResult<T> {
  const src = sortedUnique(from);
  const dst = sortedUnique(to);
  const name = (g: number) => `${label?.(g) ?? ''} (${g})`.trim();
  const itself = src.find((g) => dst.includes(g));
  if (itself !== undefined) {
    return {
      ok: false,
      message: `Glyph ${name(itself)} cannot turn into itself: a glyph is never on both sides of one Morph block.`,
    };
  }
  for (const g of src) {
    const i = holder.pairs.findIndex((p) => p.to.includes(g));
    if (i >= 0) {
      return {
        ok: false,
        message: `Glyph ${name(g)} is a target of pair ${i + 1}: it cannot also be a source of this block.`,
      };
    }
  }
  for (const g of dst) {
    const i = holder.pairs.findIndex((p) => p.from.includes(g));
    if (i >= 0) {
      return {
        ok: false,
        message: `Glyph ${name(g)} is a source of pair ${i + 1}: it cannot also be a target of this block.`,
      };
    }
  }
  return linkPair(holder, src, dst, style, label && { from: label, to: label }, { separate });
}

/** A glyph's label for the editor (`glyphLabel` of the formula's snapshot). */
export function morphGlyphLabel(formula: Formula | undefined, glyph: number): string {
  return glyphLabel(formula?.snapshot ?? null, glyph);
}

/** A draft of pairs taken through a re-render of the formula (`pairDraft.ts`): both sides refer
 * to the one formula, so both go through the one transition; a glyph that lands on both sides of
 * a pair leaves both, and a pair that loses a side is dropped — as `remapGlyphRefs` does to the
 * project's pairs, so that the draft stays what the project has. */
export function rebaseMorphPairs(
  pairs: readonly GlyphPair[],
  map: readonly (number | null)[],
): RebasedPairs<GlyphPair> {
  const from = rebasePairs(pairs, 'from', map);
  const to = rebasePairs(from.pairs, 'to', map);
  // As `remapGlyphRefs` does to the project's pairs: a glyph that lands on both sides of a pair
  // (two old glyphs merged into one) leaves both, since it cannot turn into itself, and a pair
  // left without a side goes. The draft stays what the project has.
  const parted = dropSharedGlyphs(to.pairs);
  return {
    pairs: parted.pairs,
    droppedPairs: from.droppedPairs + to.droppedPairs + parted.droppedPairs,
    droppedGlyphs: from.droppedGlyphs + to.droppedGlyphs + parted.droppedGlyphs,
  };
}

// --- Problems --------------------------------------------------------------------------------

/** What validation would say once the block has `pairs`: the issues of the block (its path and
 * below), the `action-overlap` issues of its clip, and every other issue — error or warning,
 * anywhere in the project — that the project without the block's pairs does not have: the
 * pairs cause it there (a relation whose source now arrives, an Appear block that would bring
 * back a glyph the block consumes, a later transfer that owns a target too…). Save is held back
 * by the errors among them. */
export function morphProblems(
  project: Project,
  clipId: ClipId,
  actionId: ActionId,
  pairs: readonly GlyphPair[],
): Issue[] {
  const found = findMorph(project, clipId, actionId);
  if (!found) return [];
  const [, ci, , ai] = found.path;
  const candidate = withMorphPairs(project, clipId, actionId, pairs);
  const own = (i: Issue) =>
    i.path[0] === 'clips' && i.path[1] === ci && i.path[2] === 'actions' && i.path[3] === ai;
  return transactionProblems(
    project,
    candidate,
    (issue) => own(issue) || involvesTransfer(issue, `morph:${actionId}`),
  );
}

/** The pairs (by index) some of `problems` are about — those at the block's path
 * `['clips', ci, 'actions', ai]` + `['pairs', pi, …]`, and those holding a glyph on both sides
 * of the block (`morph-both-sides` names the block, not a pair) — each with the graver severity
 * of those, for the outlines: the danger red for an error, the warning colour for warnings
 * only. */
export function morphPairSeverities(
  problems: readonly Issue[],
  path: readonly (string | number)[],
  pairs: readonly GlyphPair[],
): Map<number, Severity> {
  const found: [number, Severity][] = [];
  const under = (p: Issue['path']) => path.every((step, k) => p[k] === step);
  for (const issue of problems) {
    if (under(issue.path) && issue.path[path.length] === 'pairs') {
      found.push([issue.path[path.length + 1] as number, issue.severity]);
    }
  }
  const both = problems.find((p) => p.code === 'morph-both-sides' && under(p.path));
  if (both) {
    const sources = new Set(pairs.flatMap((p) => p.from));
    const targets = new Set(pairs.flatMap((p) => p.to));
    pairs.forEach((pair, i) => {
      if (pair.from.some((g) => targets.has(g)) || pair.to.some((g) => sources.has(g))) {
        found.push([i, both.severity]);
      }
    });
  }
  return severities(found);
}

/** "2 pairs · 4 glyphs on screen to start from · 6 can arrive", for the line above the canvas. */
export function morphSummary(pairs: number, eligibility: MorphEligibility | null): string {
  const parts = [`${pairs} pair${pairs === 1 ? '' : 's'}`];
  if (eligibility) {
    const s = eligibility.sources.length;
    const t = eligibility.targets.length;
    parts.push(`${s} glyph${s === 1 ? '' : 's'} on screen to start from`);
    parts.push(`${t} can arrive`);
  }
  return parts.join(' · ');
}
