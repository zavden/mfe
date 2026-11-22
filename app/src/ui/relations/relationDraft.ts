/* The relation editor's draft (ui/relations/RelationEditor.tsx): what a session edits, what it
 * would make of the project, which glyphs it leaves unpaired and what validation would say.
 * Pure. */
import {
  type Clip,
  type ClipLifetime,
  type GlyphTransfer,
  type IntroSpec,
  type Issue,
  type OutroSpec,
  type Project,
  type Relation,
  type Severity,
  clipLifetimes,
  glyphTransfers,
  sourceRoles,
  TIME_EPSILON,
} from '../../model';
import { setPhaseDuration, setStartsEmpty } from '../animations/clipEdit';
import { severities } from '../animations/issues';
import { round6 } from '../time';
import { fitActions } from '../timeline/clipOps';
import { relationNumber, withRelation } from './relationOps';
import { involvesTransfer, transactionProblems } from './draftValidation';

/** What the editor changes before it saves: the relation, and the outro of the source and the
 * intro of the target, which decide what the glyphs that are not paired do — or, for those of
 * the target, that they stay out (the target starts empty). */
export interface RelationDraft {
  relation: Relation;
  /** Outro of the source clip: what the glyphs that are not consumed do. */
  outro: OutroSpec;
  /** Intro of the target clip: what the glyphs that are not brought in do. */
  intro: IntroSpec;
  /** The target clip starts empty (`Clip.startsEmpty`): the glyphs that are not brought in stay
   * out, and its intro animates none. */
  startsEmpty: boolean;
  /** Run the outro / intro over the relation window. */
  matchOut: boolean;
  matchIn: boolean;
}

/** The outro that runs over the relation window: it ends where the source clip ends and starts
 * with the window (as far as the clip allows). */
function matchedOutro(clip: Clip, spec: OutroSpec, windowStart: number): OutroSpec {
  if (spec.kind === 'none') return spec;
  const wanted = round6(clip.end - windowStart);
  const probe = structuredClone(clip);
  probe.outro = structuredClone(spec);
  setPhaseDuration(probe, 'outro', wanted);
  return probe.outro;
}

/** The intro that runs over the relation window: it starts with the target clip and ends with
 * the window. */
function matchedIntro(clip: Clip, spec: IntroSpec, windowEnd: number): IntroSpec {
  if (spec.kind === 'none') return spec;
  const wanted = round6(windowEnd - clip.start);
  const probe = structuredClone(clip);
  probe.intro = structuredClone(spec);
  setPhaseDuration(probe, 'intro', wanted);
  return probe.intro;
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-4;

export function initialDraft(relation: Relation, from: Clip, to: Clip): RelationDraft {
  const w0 = to.start + relation.offset;
  const w1 = w0 + relation.duration;
  return {
    relation,
    outro: structuredClone(from.outro),
    intro: structuredClone(to.intro),
    startsEmpty: to.startsEmpty === true,
    matchOut:
      from.outro.kind !== 'none' &&
      close(from.outro.duration, matchedOutro(from, from.outro, w0).duration),
    matchIn:
      to.intro.kind !== 'none' && close(to.intro.duration, matchedIntro(to, to.intro, w1).duration),
  };
}

/** The draft with the matched durations applied. The intro of a target that starts empty has no
 * glyph to animate and its fields wait in the editor: it is left as it is, whatever `matchIn`
 * says, so that moving the window does not stretch it over the blocks of the clip unseen. */
export function resolveDraft(draft: RelationDraft, from: Clip, to: Clip): RelationDraft {
  const w0 = to.start + draft.relation.offset;
  const w1 = w0 + draft.relation.duration;
  return {
    ...draft,
    outro: draft.matchOut ? matchedOutro(from, draft.outro, w0) : draft.outro,
    intro: draft.matchIn && !draft.startsEmpty ? matchedIntro(to, draft.intro, w1) : draft.intro,
  };
}

/** The project as it would be after saving the draft. */
export function projectWithDraft(project: Project, draft: RelationDraft): Project {
  const withRel = withRelation(project, draft.relation);
  return {
    ...withRel,
    clips: withRel.clips.map((clip) => {
      if (clip.id !== draft.relation.fromClipId && clip.id !== draft.relation.toClipId) return clip;
      const copy = structuredClone(clip);
      if (clip.id === draft.relation.fromClipId) copy.outro = structuredClone(draft.outro);
      if (clip.id === draft.relation.toClipId) {
        copy.intro = structuredClone(draft.intro);
        setStartsEmpty(copy, draft.startsEmpty);
      }
      fitActions(copy);
      return copy;
    }),
  };
}

/** What the glyphs no pair carries do once the draft is saved, as the scene plays them (the
 * lifetimes of `projectWithDraft`, audit A3-03): those of the source that its outro takes away
 * (`leaving`: no relation, Morph block nor Disappear block of the clip took them before) and
 * those of the target that its intro brings (`entering`: no relation, Morph block nor Appear
 * block brings them, and the clip does not leave them out) — of a target that starts empty, those
 * nothing brings, which stay out (`neverShownGlyphs`). A copy pair leaves its source glyphs where
 * they are. Of the first `fromCount` and `toCount` glyphs of the two formulas, ascending. */
export function unpairedGlyphs(
  project: Project,
  draft: RelationDraft,
  fromCount: number,
  toCount: number,
): { leaving: number[]; entering: number[] } {
  const lifetimes = clipLifetimes(projectWithDraft(project, draft));
  const source = lifetimes.get(draft.relation.fromClipId);
  const target = lifetimes.get(draft.relation.toClipId);
  return {
    leaving: (source?.outro ?? []).filter((glyph) => glyph < fromCount),
    entering: draft.startsEmpty
      ? neverShown(target, toCount)
      : (target?.intro ?? []).filter((glyph) => glyph < toCount),
  };
}

/** The first `count` glyphs of a clip that never come on screen in its lifetime `life`. */
const neverShown = (life: ClipLifetime | undefined, count: number): number[] =>
  Array.from({ length: count }, (_, glyph) => glyph).filter((glyph) => !life?.stints.has(glyph));

/** The glyphs of the target clip (the first `count` of its formula) that never come on screen
 * once the draft is saved: of a target that starts empty, those nothing brings — no pair of any
 * relation, no Morph block, no Appear block of the clip. */
export function neverShownGlyphs(project: Project, draft: RelationDraft, count: number): number[] {
  const lifetimes = clipLifetimes(projectWithDraft(project, draft));
  return neverShown(lifetimes.get(draft.relation.toClipId), count);
}

/** What the other transfers of the project already do with the glyphs of a relation's two clips,
 * for the drawing that links them: the glyphs a pair of this relation could not take without an
 * error (`ineligible`, drawn dimmed, each with its reason) and the sources it could only copy
 * (`notes`, a hint). Two clips can have several relations, so this is the usual way to find a
 * glyph taken; it holds as well for a relation of another clip and for a Morph block. */
export interface RelationEligibility {
  ineligible: { from: Map<number, string>; to: Map<number, string> };
  notes: { from: Map<number, string> };
  /** Among the noted sources, those another transfer consumes: the drawing outlines them as it
   * does the sources a pair of the relation itself consumes (D184). */
  consumed: { from: Map<number, string> };
}

/** How the reason names another transfer: "the relation f1 → f2", "relation 1 of 2 (f1 → f2)"
 * among several of the same two clips, "a Morph block". */
function transferName(project: Project, transfer: GlyphTransfer): string {
  const { origin } = transfer;
  if (origin.kind === 'morph') return 'a Morph block';
  const relation = project.relations.find((r) => r.id === origin.relationId);
  const name = (clipId: string) => {
    const clip = project.clips.find((c) => c.id === clipId);
    return project.formulas.find((f) => f.id === clip?.formulaId)?.name ?? '?';
  };
  const names = `${name(transfer.fromClipId)} → ${name(transfer.toClipId)}`;
  const { n, of } = relation ? relationNumber(project, relation) : { n: 1, of: 1 };
  return of > 1 ? `relation ${n} of ${of} (${names})` : `the relation ${names}`;
}

/** The glyphs of the two clips of `relation` (the draft, with its window as it is now) that the
 * other transfers of `project` keep from it — the rules of `validateProject` about what a glyph
 * may do (`transferOwnershipIssues`, and the sources still arriving of the lifetime), read before
 * a pair is made instead of after. With [s, e) the draft's window and t the start of another
 * transfer:
 *
 * - a target is dimmed when another transfer brings it in (whenever: a glyph arrives through one
 *   pair), when one consumed it by s (it is part of other glyphs), and when one takes it — to
 *   consume or to copy — at s ≤ t < e, while the draft would still be bringing it;
 * - a source is dimmed when another transfer consumed it before s, and when one is still
 *   bringing it in at s;
 * - a source is only noted — it can be copied, not consumed — when another transfer consumes it
 *   at s or later (a copy must start no later than the window that consumes; those are `consumed`
 *   too), when one copies it after s (for the same reason, seen from the other side), and when
 *   one brings it in after s: consumed here, it could not arrive there, and copied here it is not
 *   on screen yet.
 *
 * The other relations are named as they will be numbered once the draft is saved. */
export function relationEligibility(project: Project, relation: Relation): RelationEligibility {
  const out: RelationEligibility = {
    ineligible: { from: new Map(), to: new Map() },
    notes: { from: new Map() },
    consumed: { from: new Map() },
  };
  const target = project.clips.find((c) => c.id === relation.toClipId);
  if (!target) return out;
  const start = target.start + relation.offset;
  const end = start + relation.duration;
  const keep = (map: Map<number, string>, glyph: number, reason: string) => {
    if (!map.has(glyph)) map.set(glyph, reason);
  };
  const saved = withRelation(project, relation);
  const others = glyphTransfers({
    ...project,
    relations: project.relations.filter((r) => r.id !== relation.id),
  });
  for (const transfer of others) {
    const who = transferName(saved, transfer);
    const startsBy = transfer.start <= start + TIME_EPSILON;
    const startsAfter = transfer.start > start + TIME_EPSILON;
    const during = transfer.start >= start - TIME_EPSILON && transfer.start < end - TIME_EPSILON;
    for (const pair of transfer.pairs) {
      const { consumed, copied } = sourceRoles(pair, pair.style);
      // Into the target clip.
      if (transfer.toClipId === relation.toClipId) {
        for (const g of pair.to) keep(out.ineligible.to, g, `brought in by ${who}`);
      }
      // Out of the target clip.
      if (transfer.fromClipId === relation.toClipId) {
        if (startsBy) {
          for (const g of consumed) keep(out.ineligible.to, g, `consumed earlier by ${who}`);
        }
        if (during) {
          for (const g of [...consumed, ...copied]) {
            keep(out.ineligible.to, g, `${who} takes it before it would have arrived`);
          }
        }
      }
      // Out of the source clip.
      if (transfer.fromClipId === relation.fromClipId) {
        const earlier = start > transfer.start + TIME_EPSILON;
        for (const g of consumed) {
          if (earlier) keep(out.ineligible.from, g, `consumed earlier by ${who}`);
          else {
            keep(out.notes.from, g, `${who} consumes it: here it can only be copied`);
            keep(out.consumed.from, g, `${who} consumes it: here it can only be copied`);
          }
        }
        if (startsAfter) {
          for (const g of copied) {
            keep(out.notes.from, g, `${who} copies it later: here it can only be copied`);
          }
        }
      }
      // Into the source clip.
      if (transfer.toClipId === relation.fromClipId) {
        for (const g of pair.to) {
          if (startsAfter) {
            keep(out.notes.from, g, `${who} brings it in later: it is not on screen yet`);
          } else if (transfer.end > start + TIME_EPSILON) {
            keep(out.ineligible.from, g, `still arriving through ${who}`);
          }
        }
      }
    }
  }
  // A reason to dim says more than a note.
  for (const g of out.ineligible.from.keys()) {
    out.notes.from.delete(g);
    out.consumed.from.delete(g);
  }
  return out;
}

/** What validation would say once the (resolved) draft is saved: the relation's own issues and
 * the block overlaps its outro or intro would cause on the two clips. */
export function draftProblems(project: Project, draft: RelationDraft): Issue[] {
  const next = projectWithDraft(project, draft);
  const index = next.relations.findIndex((r) => r.id === draft.relation.id);
  return transactionProblems(project, next, (issue) => {
    if (involvesTransfer(issue, `relation:${draft.relation.id}`)) return true;
    if (issue.path[0] === 'relations') return issue.path[1] === index;
    if (issue.path[0] === 'clips') {
      const clip = next.clips[issue.path[1] as number];
      return (
        (clip?.id === draft.relation.fromClipId && issue.path[2] === 'outro') ||
        (clip?.id === draft.relation.toClipId &&
          (issue.path[2] === 'intro' ||
            issue.path[2] === 'startsEmpty' ||
            // Of the glyphs the target leaves out itself, only that nothing brings any: the
            // rest (a glyph that does not exist, a kind that takes no list) is not the draft's.
            issue.code === 'start-hidden-unused'))
      );
    }
    return false;
  });
}

/** The pairs (by index) that some of `problems` are about, each with the graver severity of
 * those: outlined in the danger red with an error, in the warning colour with only warnings. */
export function pairSeverities(
  problems: readonly Issue[],
  relationIndex?: number,
): Map<number, Severity> {
  return severities(
    problems.flatMap((p) =>
      p.path[0] === 'relations' &&
      p.path[2] === 'pairs' &&
      (relationIndex === undefined || p.path[1] === relationIndex)
        ? [[p.path[3] as number, p.severity] as const]
        : [],
    ),
  );
}
