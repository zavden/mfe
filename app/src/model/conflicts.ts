/* Where an animation block may play (docs/ARCHITECTURE.md §5, "Blocks that run at the same
 * time"): why a block cannot be where it is in its clip, as a typed reason, so that the timeline
 * gestures, the Timing fields of the Animations panel and the menus that add or duplicate a block
 * (`ui/animations/blockRange.ts`, which words the reasons and finds where an edit lands) agree
 * with validation.
 *
 * A block must lie inside its bounds (a tween between the end of the intro and the start of the
 * outro, the others inside the clip) and must not run while anything else animates a glyph it
 * animates. Which glyphs those are comes from the glyph lifetime (`clipLifetimes`), and for
 * appear / disappear blocks it depends on where the block is: an appear brings only the glyphs
 * that are off screen when it starts. So:
 *   - `rivalSpans` is what the block must not run alongside: the busy spans of the glyphs it
 *     animates now, other than its own, that `causesConflict` (validation's rule) holds against
 *     it — and, for a Morph block, the other transfers' spans the ownership rules would refuse.
 *     The UI drags a block up to them (`blockLimits`);
 *   - `actionConflicts` is the exact check, on a simulation of the clip with the block where it
 *     is: it says why the block cannot be there, or null. A morph block is also checked for what
 *     its pairs need: its sources fully on screen when it starts, its targets not on screen yet.
 *     Last, validation's own rules are asked: the block there must not give the project an error
 *     it does not have (the ownership of glyphs over the transfers in time, which the simulation
 *     does not carry — a copy of a source after the transfer that consumes it —, or an error on
 *     another block of the clip or an attachment measuring its glyphs);
 *   - `latestCopyStart` is where a copying morph stops exactly: the transfer that consumes one
 *     of its sources. */
import { issueIdentityNotWorse } from './diagnostics';
import { measuresOnly } from './kinds';
import { placementUses, usesAnyOf } from './placementRefs';
import {
  causesConflict,
  clipLifetimes,
  measuringConflicts,
  type Cause,
  type ClipLifetime,
  type Span,
} from './lifetime';
import {
  actionWindow,
  clipWindow,
  contains,
  introWindow,
  outroWindow,
  overlaps,
  TIME_EPSILON,
  type Window,
} from './time';
import { glyphTransfers, isMorphKey, sourceRoles, transferKey } from './transfers';
import type { ActionId, Clip, ClipAction, ClipId, MorphAction, Project } from './types';
import {
  attachIssues,
  cameraRegionIssues,
  clipLifetimeIssues,
  transferOwnershipIssues,
  type Issue,
} from './validate';

/** The window a block of this kind must stay in (absolute seconds). */
export function blockBounds(clip: Clip, action: ClipAction): Window {
  return action.kind === 'tween'
    ? { start: introWindow(clip).end, end: outroWindow(clip).start }
    : clipWindow(clip);
}

/** Simulate the edited lifetimes with their incident relations and partner Morphs. Attachments
 * consume these lifetimes but do not change them, so their clips need no simulation here. */
export function timingLifetimes(
  project: Project,
  clipIds: readonly ClipId[],
): Map<ClipId, ClipLifetime> {
  const ids = new Set(clipIds);
  const relations = project.relations.filter((r) => ids.has(r.fromClipId) || ids.has(r.toClipId));
  const near = new Set([...ids, ...relations.flatMap((r) => [r.fromClipId, r.toClipId])]);
  return clipLifetimes({
    ...project,
    clips: project.clips.filter((c) => near.has(c.id)),
    relations,
  });
}

/** One candidate clip's lifetime, at a fraction of the whole project's simulation cost. */
export function clipLifetimeOf(project: Project, clip: Clip): ClipLifetime {
  const candidate = { ...project, clips: project.clips.map((c) => (c.id === clip.id ? clip : c)) };
  return timingLifetimes(candidate, [clip.id]).get(clip.id)!;
}

/** Absolute instants at which the edited lifetimes are measured: their direct attachment
 * consumers and measuring-only Emphasis blocks. Descendants of an already attached clip do
 * not remeasure its ancestor: attachments keep their placement after their own start. */
export function timingMeasurementTimes(project: Project, clipIds: readonly ClipId[]): Set<number> {
  const ids = new Set(clipIds);
  const times = new Set<number>();
  for (const clip of project.clips) {
    // An attachment measures their glyphs when its clip starts; a tween that carries a shape to
    // them, when it starts.
    for (const use of placementUses(clip)) if (usesAnyOf(use, ids)) times.add(use.at);
    if (ids.has(clip.id)) {
      for (const action of clip.actions) {
        if (measuresOnly(action)) times.add(actionWindow(clip, action).start);
      }
    }
  }
  return times;
}

/** Whether a busy span is the block's own: its action, or the transfer pairs of a morph block. */
const isOwn = (cause: Cause, id: ActionId) =>
  (cause.kind === 'action' && cause.actionId === id) ||
  (cause.kind === 'transfer' && isMorphKey(cause.key) && cause.key === `morph:${id}`);

/** What the block must not run alongside: the busy spans of the glyphs it animates, other than its
 * own, each with its glyph — those `causesConflict` holds against the block (so a tween's bounds,
 * not these, keep it out of the intro and the outro), plus, for a morph, the spans of other
 * transfers on its glyphs, which the ownership rules keep apart. Two exceptions predict what the
 * lifetime says of the block once it has moved: for a morph that starts inside the outro, the
 * outro spans of its own targets do not count (they arrive there and leave with the clip, as
 * validation allows; a block that starts before or exactly when the outro does has the outro
 * take its targets, so those spans hold it back), nor does another transfer's span on a glyph
 * this morph only copies when the pair that span comes from also copies it or starts no earlier
 * than this block (the model's rule: a copy may run while a later consumption of the same glyph
 * begins). That pair is read on this clip's side: the glyph of another clip with the same number
 * is a different glyph. */
export function rivalSpans(
  project: Project,
  clip: Clip,
  life: ClipLifetime,
  action: ClipAction,
): { glyph: number; span: Span }[] {
  const morph = action.kind === 'morph' ? action : null;
  const own: Cause = morph
    ? {
        kind: 'transfer',
        key: transferKey({ kind: 'morph', clipId: clip.id, actionId: action.id }),
        pair: 0,
      }
    : { kind: 'action', actionId: action.id };
  const targets = new Set(morph?.pairs.flatMap((p) => p.to) ?? []);
  const copySources = new Set(
    morph?.pairs
      .flatMap((p) => sourceRoles(p, p.style ?? morph.style).copied)
      .filter((g) => !targets.has(g)) ?? [],
  );
  const transfers =
    copySources.size > 0 ? new Map(glyphTransfers(project).map((t) => [t.key, t])) : null;
  const start = morph ? actionWindow(clip, morph).start : 0;
  const insideOutro = morph !== null && start > outroWindow(clip).start + TIME_EPSILON;
  const allowedOnCopy = (cause: { key: string; pair: number }, glyph: number) => {
    const other = transfers?.get(cause.key);
    const pair = other?.pairs[cause.pair];
    if (!other || !pair) return false;
    // The span is the glyph's arrival through that pair (a target of this clip), or its use as a
    // source (the clip's own glyph: a transfer's span on a glyph of a clip comes from that side).
    if (other.toClipId === clip.id && pair.to.includes(glyph)) return false;
    return (
      sourceRoles(pair, pair.style).copied.includes(glyph) || other.start >= start - TIME_EPSILON
    );
  };
  return (life.actions.get(action.id)?.glyphs ?? []).flatMap((glyph) =>
    (life.busy.get(glyph) ?? [])
      .filter(
        (span) =>
          !isOwn(span.cause, action.id) &&
          (causesConflict(clip, own, span.cause) ||
            (morph !== null &&
              span.cause.kind === 'transfer' &&
              !(copySources.has(glyph) && allowedOnCopy(span.cause, glyph)))) &&
          !(span.cause.kind === 'outro' && insideOutro && targets.has(glyph)),
      )
      .map((span) => ({ glyph, span })),
  );
}

/** Why a block cannot be where it is (`actionConflicts`): outside its bounds; an Appear that
 * would bring back glyphs a transfer consumed; a Morph whose pairs cannot play there (a source
 * not fully on screen when it starts, still arriving through another transfer, or a target on
 * screen already); an Emphasis that measures its glyphs starting while something still draws them
 * (`half-drawn`); running while something else animates glyphs it animates; or giving the
 * project a validation error it does not have. Glyph lists are ascending without repeats. */
export type ActionConflict =
  | { kind: 'bounds' }
  | { kind: 'consumed'; glyphs: number[] }
  | { kind: 'absent-source'; glyphs: number[] }
  | { kind: 'arriving-source'; glyphs: number[] }
  | { kind: 'target-on-screen'; glyphs: number[] }
  | { kind: 'half-drawn'; cause: Cause; glyphs: number[] }
  | { kind: 'overlap'; cause: Cause; glyphs: number[] }
  | { kind: 'issue'; issue: Issue };

/** Why the block, where it is in `clip`, breaks a rule, or null when it breaks none. The clip is
 * passed explicitly so that a candidate position can be tried on a copy; `before`, the project's
 * own timing errors (`timingBaseline`), may be passed to reuse it over many candidates. */
export function actionConflicts(
  project: Project,
  clip: Clip,
  actionId: ActionId,
  before: readonly Issue[] = timingBaseline(project, clip.id),
): ActionConflict | null {
  const action = clip.actions.find((a) => a.id === actionId);
  if (!action) return null;
  const window = actionWindow(clip, action);
  if (!contains(blockBounds(clip, action), window)) return { kind: 'bounds' };
  const life = clipLifetimeOf(project, clip);
  const result = life.actions.get(actionId);
  if (!result) return null;
  const consumed = result.skipped.filter((s) => s.reason === 'consumed').map((s) => s.glyph);
  if (consumed.length > 0) return { kind: 'consumed', glyphs: unique(consumed) };
  if (action.kind === 'morph') {
    const reason = morphConflict(clip, action, life);
    if (reason) return reason;
  }
  if (measuresOnly(action)) {
    const [busy] = measuringConflicts(clip, life, result.glyphs, window.start);
    if (busy) return { kind: 'half-drawn', cause: busy.cause, glyphs: unique(busy.glyphs) };
  }
  const clashes = new Map<string, { cause: Cause; glyphs: number[] }>();
  for (const { glyph, span } of rivalSpans(project, clip, life, action)) {
    if (!overlaps(span, window)) continue;
    const key = JSON.stringify(span.cause);
    const clash = clashes.get(key);
    if (clash) clash.glyphs.push(glyph);
    else clashes.set(key, { cause: span.cause, glyphs: [glyph] });
  }
  const [clash] = clashes.values();
  if (clash) return { kind: 'overlap', cause: clash.cause, glyphs: unique(clash.glyphs) };
  const issue = newTimingError(project, clip, life, before);
  return issue ? { kind: 'issue', issue } : null;
}

/** What stops a morph's pairs from playing where the block is: a source that is not fully on
 * screen when the block starts (it would appear out of nowhere), one still arriving through
 * another transfer, or a target already on screen then (it arrives through this block, and one
 * way only). Null when they can play. */
function morphConflict(clip: Clip, action: MorphAction, life: ClipLifetime): ActionConflict | null {
  const key = transferKey({ kind: 'morph', clipId: clip.id, actionId: action.id });
  const absent = unique(life.absentSources.filter((a) => a.key === key).flatMap((a) => a.glyphs));
  if (absent.length > 0) return { kind: 'absent-source', glyphs: absent };
  const arriving = unique(
    life.arrivingSources.filter((a) => a.key === key).flatMap((a) => a.glyphs),
  );
  if (arriving.length > 0) return { kind: 'arriving-source', glyphs: arriving };
  const start = actionWindow(clip, action).start;
  const own = (cause: Cause) => cause.kind === 'transfer' && cause.key === key;
  const there = unique(action.pairs.flatMap((p) => p.to)).filter((glyph) =>
    (life.stints.get(glyph) ?? []).some(
      (stint) =>
        !own(stint.enter.cause) &&
        stint.enter.start <= start + TIME_EPSILON &&
        stint.exit.start > start + TIME_EPSILON,
    ),
  );
  return there.length > 0 ? { kind: 'target-on-screen', glyphs: there } : null;
}

/** The same semantic issue, regardless of presentation positions, names or timing text. */
export const issueKey = (issue: Issue): string =>
  issue.identity
    ? `${issue.code}|${JSON.stringify(issue.identity)}`
    : `${issue.code}|${issue.path.join('.')}|${issue.message}`;

/** The validation dependency closure of a timing edit: transfer ownership, the edited clip
 * lifetimes, and attachments measuring those lifetimes. Simulation is reduced; diagnostics use
 * the original project so paths, transfer references, identities and messages remain intact. */
export function timingIssues(
  project: Project,
  clipIds: readonly ClipId[],
  lifetimes: ReadonlyMap<ClipId, ClipLifetime> = timingLifetimes(project, clipIds),
): Issue[] {
  const ids = new Set(clipIds);
  const transferList = glyphTransfers(project);
  const transfers = new Map(transferList.map((t) => [t.key, t]));
  return [
    ...transferOwnershipIssues(project, transferList),
    ...project.clips.flatMap((clip, ci) => {
      const life = lifetimes.get(clip.id);
      return ids.has(clip.id) && life ? clipLifetimeIssues(project, ci, life, transfers) : [];
    }),
    ...attachIssues(project, lifetimes, transfers, ids),
    // The locked region of the scene's camera: what these clips animate while it moves.
    ...cameraRegionIssues(project, ids),
  ].filter((i) => i.severity === 'error');
}

/** Timing errors for a candidate block, reusing its already simulated clip lifetime. */
export function timingErrors(project: Project, clip: Clip, life: ClipLifetime): Issue[] {
  return timingIssues(project, [clip.id], new Map([[clip.id, life]]));
}

/** Stable keys for the timing dependency closure, useful for comparing equivalent simulations. */
export function timingErrorKeys(project: Project, clipIds: readonly ClipId[]): Set<string> {
  return new Set(timingIssues(project, clipIds).map(issueKey));
}

/** Existing problems in the edited lifetime's dependency closure. Retain metadata so an edit
 * that reduces the glyphs or participants of an imported problem can still proceed. */
export function timingBaseline(project: Project, clipId: ClipId): Issue[] {
  return timingIssues(project, [clipId]);
}

/** The problems of `issues` that `before` did not have, or had with less in them: an existing
 * problem may stay, or improve. */
export function addedIssues(issues: readonly Issue[], before: readonly Issue[]): Issue[] {
  return issues.filter(
    (issue) =>
      !before.some((old) =>
        issue.identity && old.identity
          ? issueIdentityNotWorse(issue, old)
          : issueKey(issue) === issueKey(old),
      ),
  );
}

/** The first new or worsened timing problem, allowing an existing problem to improve. */
export function addedTimingError(issues: readonly Issue[], before: readonly Issue[]): Issue | null {
  return addedIssues(issues, before)[0] ?? null;
}

/** The first validation error the project would have with `clip` in its place (`life`, its
 * lifetime there) and does not have now (`before`): a rule the checks of `actionConflicts` do not
 * carry — a copy of a source after the transfer that consumes it — or an error on another block
 * of the clip (an Appear block that would have to bring back a glyph the moved block consumes)
 * or an attachment that measures its glyphs.
 * Null when there is none; a project that already has errors keeps them, so a block in such a
 * conflict can still be moved. */
export function newTimingError(
  project: Project,
  clip: Clip,
  life: ClipLifetime,
  before: readonly Issue[],
): Issue | null {
  const candidate = { ...project, clips: project.clips.map((c) => (c.id === clip.id ? clip : c)) };
  return addedTimingError(timingErrors(candidate, clip, life), before);
}

/** The latest start (relative to the clip) a Morph block that copies glyphs may have before
 * another transfer consumes one of them — the model's rule: a source is copied before, or exactly
 * when, its consumption starts —, among the consumptions that start at or after the block does
 * (one that started before is a conflict the block is being moved out of). Null when none does. */
export function latestCopyStart(project: Project, clip: Clip, action: ClipAction): number | null {
  if (action.kind !== 'morph') return null;
  const targets = new Set(action.pairs.flatMap((p) => p.to));
  const copied = new Set(
    action.pairs
      .flatMap((p) => sourceRoles(p, p.style ?? action.style).copied)
      .filter((g) => !targets.has(g)),
  );
  if (copied.size === 0) return null;
  const own = transferKey({ kind: 'morph', clipId: clip.id, actionId: action.id });
  const start = actionWindow(clip, action).start;
  let latest: number | null = null;
  for (const other of glyphTransfers(project)) {
    if (other.fromClipId !== clip.id || other.key === own) continue;
    if (other.start < start - TIME_EPSILON || (latest !== null && other.start >= latest)) continue;
    if (other.pairs.some((p) => sourceRoles(p, p.style).consumed.some((g) => copied.has(g)))) {
      latest = other.start;
    }
  }
  return latest === null ? null : latest - clip.start;
}

const unique = (glyphs: Iterable<number>) => [...new Set(glyphs)].sort((a, b) => a - b);
