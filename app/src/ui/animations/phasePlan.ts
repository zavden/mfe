/* What giving a clip an intro or an outro from its menu would run into (D120), before it is
 * given: an intro or an outro animates the whole object, so it cannot share time with a
 * Transform of the whole formula — which `setPhaseKind` cuts or drops to make room —, with the
 * window of a transformation that takes glyphs from the clip (an intro) or brings them to it (an
 * outro), nor with a block or an attached object that needs those glyphs still. `planPhase` says
 * which of those the animation meets at its own length, in words for the user, and how long it
 * can be without meeting any: the menu asks before it goes on (`objectActions.ts`). The window of
 * a relation with a clip on a locked track stays where it plays: an animation that would run into
 * it can only be shortened (`locked`). Pure. */
import {
  actionWindow,
  addedIssues,
  cameraClashSentence,
  cameraMoveEdges,
  relationWindow,
  TIME_EPSILON,
  timingMeasurementTimes,
  validateProject,
  type Clip,
  type IntroKind,
  type Issue,
  type OutroKind,
  type Project,
} from '../../model';
import { lockedBreak, lockedTrackOf, type LockedRelation } from '../relations/lockedRelations';
import { MIN_ACTION_DURATION } from '../timeline/clipOps';
import { clipSubject } from './blockKinds';
import { setPhaseKind, type Phase } from './clipEdit';

export interface PhasePlan {
  /** The clip with the animation at its own length: what the Animations panel's select gives. */
  whole: Clip;
  /** What the animation runs into there, a sentence each; none when it can go in as it is. */
  conflicts: string[];
  /** The clip with the animation as long as it can be without running into any of that; null
   * when there is nothing to avoid, or no room for an animation before it. */
  fitted: Clip | null;
  /** The relation with a clip on a locked track whose window the animation would run into at its
   * own length (`lockedBreak`): such a window stays where it plays, so the animation cannot be
   * added over it anyway — only `fitted`. Null when there is none. */
  locked: LockedRelation | null;
}

const errorsOf = (project: Project): Issue[] =>
  validateProject(project).filter((issue) => issue.severity === 'error');

const withClip = (project: Project, clip: Clip): Project => ({
  ...project,
  clips: project.clips.map((c) => (c.id === clip.id ? clip : c)),
});

const seconds = (time: number) => `${time.toFixed(2)} s`;

/** `clip` with the animation `kind` as its intro or outro, `duration` long (default: its own). */
function given(clip: Clip, phase: Phase, kind: IntroKind | OutroKind, duration?: number): Clip {
  const next = structuredClone(clip);
  setPhaseKind(next, phase, kind, duration);
  return next;
}

const nameOf = (project: Project, clipId: string): string => {
  const clip = project.clips.find((c) => c.id === clipId);
  return project.formulas.find((f) => f.id === clip?.formulaId)?.name ?? clipId;
};

/** A problem the project would have, in the words of the menu's question. */
function describeIssue(project: Project, issue: Issue): string {
  // Validation states the rule; here the question is which transformation it is.
  if (issue.code === 'relation-window' && issue.path[0] === 'relations') {
    const relation = project.relations[issue.path[1] as number];
    const to = relation && project.clips.find((c) => c.id === relation.toClipId);
    if (relation && to) {
      const window = relationWindow(relation, to);
      const names = `${nameOf(project, relation.fromClipId)} → ${nameOf(project, relation.toClipId)}`;
      const track = lockedTrackOf(project, relation);
      const locked = track ? ` (track “${track.name}” is locked: it stays where it plays)` : '';
      return `The transformation ${names} runs from ${seconds(window.start)} to ${seconds(window.end)}${locked}.`;
    }
  }
  return cameraClashSentence(project, issue) ?? issue.message;
}

/** What `next` — `clip` with its new intro or outro — runs into, that the project did not have
 * (`before`, its errors). */
function conflictsOf(project: Project, clip: Clip, next: Clip, before: readonly Issue[]): string[] {
  const out: string[] = [];
  for (const action of clip.actions) {
    if (action.kind !== 'tween') continue;
    const kept = next.actions.find((a) => a.id === action.id);
    const at = seconds(actionWindow(clip, action).start);
    // A brace and a shape have one Transform: there is no part to tell it from (D123).
    const what =
      clipSubject(project, clip) === 'formula'
        ? `The Transform of the whole formula at ${at}`
        : `The Transform at ${at}`;
    if (!kept) {
      out.push(`${what} would be removed: it has no room left.`);
    } else if (kept.start !== action.start || kept.duration !== action.duration) {
      out.push(
        `${what} would be cut from ${seconds(action.duration)} to ${seconds(kept.duration)}.`,
      );
    }
  }
  const candidate = withClip(project, next);
  for (const issue of addedIssues(errorsOf(candidate), before)) {
    out.push(describeIssue(candidate, issue));
  }
  return out;
}

/** The lengths, longest first and shorter than `whole`, at which the animation would end (an
 * intro) or start (an outro) exactly where something of the clip starts or ends: a block, the
 * window of a transformation, an object attached to it, a move of the camera. */
function shorterLengths(project: Project, clip: Clip, phase: Phase, whole: number): number[] {
  const marks = new Set<number>(timingMeasurementTimes(project, [clip.id]));
  for (const action of clip.actions) {
    const window = actionWindow(clip, action);
    marks.add(window.start);
    marks.add(window.end);
  }
  for (const relation of project.relations) {
    if (relation.fromClipId !== clip.id && relation.toClipId !== clip.id) continue;
    const to = project.clips.find((c) => c.id === relation.toClipId);
    if (!to) continue;
    const window = relationWindow(relation, to);
    marks.add(window.start);
    marks.add(window.end);
  }
  // Nor does it run while the camera moves (the locked region, D190).
  for (const time of cameraMoveEdges(project)) marks.add(time);
  const lengths = [...marks]
    .map((time) => (phase === 'intro' ? time - clip.start : clip.end - time))
    .filter((d) => d >= MIN_ACTION_DURATION - TIME_EPSILON && d < whole - TIME_EPSILON);
  return [...new Set(lengths)].sort((a, b) => b - a);
}

/** What happens if `clip` (of `project`) gets the animation `kind` as its intro or its outro. */
export function planPhase(
  project: Project,
  clip: Clip,
  phase: Phase,
  kind: IntroKind | OutroKind,
): PhasePlan {
  const whole = given(clip, phase, kind);
  const before = errorsOf(project);
  const conflicts = conflictsOf(project, clip, whole, before);
  const locked = lockedBreak(project, whole);
  if (conflicts.length === 0 || whole[phase].kind === 'none') {
    return { whole, conflicts, fitted: null, locked };
  }
  for (const length of shorterLengths(project, clip, phase, whole[phase].duration)) {
    const shorter = given(clip, phase, kind, length);
    if (
      conflictsOf(project, clip, shorter, before).length === 0 &&
      !lockedBreak(project, shorter)
    ) {
      return { whole, conflicts, fitted: shorter, locked };
    }
  }
  return { whole, conflicts, fitted: null, locked };
}
