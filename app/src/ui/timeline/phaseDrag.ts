/* Dragging the inner edge of a clip's intro or outro on the timeline (D119): how long the
 * animation may get and what its edge snaps to. Pure; the gesture is `phaseGestures.ts`. */
import { cameraGap, introWindow, outroWindow, type Clip, type Project } from '../../model';
import { maxPhaseDuration, type Phase } from '../animations/clipEdit';
import { lockedPhaseRoom } from '../relations/lockedRelations';
import { round6 } from '../time';
import { blockSnapPoints } from './blockSnap';
import { MIN_ACTION_DURATION } from './clipOps';

export interface PhaseLimits {
  min: number;
  max: number;
}

/** The absolute time of the inner edge of a clip's intro (where it ends) or outro (where it
 * starts): what a drag moves. */
export function phaseEdge(clip: Pick<Clip, 'start' | 'end' | 'intro' | 'outro'>, phase: Phase) {
  return phase === 'intro' ? clip.start + clip.intro.duration : clip.end - clip.outro.duration;
}

/** How short and how long a drag can make the intro (or the outro) of `clip`: no shorter than the
 * shortest animation; no longer than the clip leaves beside the other one, and never over a
 * Transform of the whole formula (a tween), which cannot share its time with the intro or the
 * outro — the edge stops where the first of them starts (for the outro, where the last ends).
 * With the `project` of the clip, never over the window of a relation with a clip on a locked
 * track either, which stays where it plays (`lockedPhaseRoom`), nor over a move of the camera,
 * during which nothing else animates (`cameraPhaseRoom`). */
export function phaseLimits(clip: Clip, phase: Phase, project?: Project): PhaseLimits {
  const length = clip.end - clip.start;
  let max = maxPhaseDuration(clip, phase);
  for (const action of clip.actions) {
    if (action.kind !== 'tween') continue;
    const room = phase === 'intro' ? action.start : length - (action.start + action.duration);
    max = Math.min(max, room);
  }
  if (project) {
    max = Math.min(
      max,
      lockedPhaseRoom(project, clip, phase),
      cameraPhaseRoom(project, clip, phase),
    );
  }
  // A phase already longer than that (a file edited by hand) is not made shorter by a press.
  max = Math.max(max, clip[phase].duration, MIN_ACTION_DURATION);
  return { min: Math.min(MIN_ACTION_DURATION, max), max: round6(max) };
}

/** How long the intro (or the outro) of `clip` may be beside the camera's moves (the locked
 * region, D190): as far as the first move that starts once the intro has ended — for an outro,
 * the last that ends before it starts. A move the animation runs into already (an error of the
 * project) does not hold it: it can be dragged out of it. Infinite when no move is in its way. */
export function cameraPhaseRoom(
  project: Pick<Project, 'camera'>,
  clip: Clip,
  phase: Phase,
): number {
  const gap = cameraGap(project, phase === 'intro' ? introWindow(clip) : outroWindow(clip));
  return phase === 'intro' ? gap.end - clip.start : clip.end - gap.start;
}

/** The duration of the intro (or the outro) with its inner edge at absolute time `edge`, within
 * `limits`. */
export function phaseDurationAt(
  clip: Pick<Clip, 'start' | 'end'>,
  phase: Phase,
  edge: number,
  limits: PhaseLimits,
): number {
  const wanted = phase === 'intro' ? edge - clip.start : clip.end - edge;
  return round6(Math.min(Math.max(wanted, limits.min), limits.max));
}

/** What the edge snaps to (absolute seconds): the playhead, the edges of the clip's blocks and of
 * the windows of its relations, the clip's own edges and the edge of the other one of the two
 * (`blockSnapPoints`). The ruler grid is added by the caller. */
export function phaseSnapPoints(project: Project, clip: Clip, playhead: number): number[] {
  return blockSnapPoints(project, clip, '', playhead);
}
