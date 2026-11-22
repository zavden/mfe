/* Time windows derived from the model. All windows are absolute seconds, half-open. */
import type { Clip, ClipAction, Project, Relation } from './types';

export interface Window {
  start: number;
  end: number;
}

/** Tolerance for comparing times written by hand or produced by float arithmetic. */
export const TIME_EPSILON = 1e-6;

export function overlaps(a: Window, b: Window): boolean {
  return a.start < b.end - TIME_EPSILON && b.start < a.end - TIME_EPSILON;
}

export function contains(outer: Window, inner: Window): boolean {
  return inner.start >= outer.start - TIME_EPSILON && inner.end <= outer.end + TIME_EPSILON;
}

/** Whether `clip` is on screen at `t` in a scene of length `duration`: its window is half-open,
 * except that the end of the scene is inclusive (the evaluator still draws a clip that lasts until
 * then at t = duration). */
export function onScreenAt(
  clip: Pick<Clip, 'start' | 'end'>,
  t: number,
  duration: number,
): boolean {
  if (t < clip.start - TIME_EPSILON) return false;
  if (t < clip.end - TIME_EPSILON) return true;
  return clip.end >= duration - TIME_EPSILON && t >= duration - TIME_EPSILON;
}

export function clipWindow(clip: Clip): Window {
  return { start: clip.start, end: clip.end };
}

export function introWindow(clip: Clip): Window {
  return { start: clip.start, end: clip.start + clip.intro.duration };
}

export function outroWindow(clip: Clip): Window {
  return { start: clip.end - clip.outro.duration, end: clip.end };
}

export function actionWindow(clip: Clip, action: ClipAction): Window {
  const start = clip.start + action.start;
  return { start, end: start + action.duration };
}

/** [to.start + offset, to.start + offset + duration). */
export function relationWindow(relation: Relation, toClip: Clip): Window {
  const start = toClip.start + relation.offset;
  return { start, end: start + relation.duration };
}

/** Seconds of the project's sound after its last visual clip ends: the part of the scene that a
 * Manim render, which is the visual scene, does not have (0 when none; a set duration has none). */
export function soundTail(project: Project): number {
  return Math.max(0, sceneDuration(project) - sceneDuration(project, 'visual'));
}

/** When the last move of the scene's camera ends; 0 without a camera or without moves. */
export function cameraEnd(project: Pick<Project, 'camera'>): number {
  return (project.camera?.moves ?? []).reduce(
    (end, move) => Math.max(end, move.start + move.duration),
    0,
  );
}

/** Scene length: explicit duration applies to every export. Automatic duration includes audio
 * for playback/browser export; Manim uses the visual scope (or visualProject). A move of the
 * scene's camera is part of the picture: the scene lasts until the last of them ends. */
export function sceneDuration(project: Project, scope: 'all' | 'visual' = 'all'): number {
  if (project.meta.duration !== null) return project.meta.duration;
  const visualEnd = project.clips.reduce(
    (end, clip) => Math.max(end, clip.end),
    cameraEnd(project),
  );
  return scope === 'visual'
    ? visualEnd
    : project.audioClips.reduce((end, clip) => Math.max(end, clip.end), visualEnd);
}
