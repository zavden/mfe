/* The scene's camera in the model (format 34, D190): its moves as windows of time, the frame a
 * move goes to, and the locked region — while the camera moves, nothing else animates. Where the
 * camera is at an instant — the chain of its moves, the easing — is the scene's
 * (`scene/camera.ts`). Pure. */
import {
  actionWindow,
  introWindow,
  outroWindow,
  overlaps,
  relationWindow,
  TIME_EPSILON,
  type Window,
} from './time';
import type {
  ActionId,
  CameraDestination,
  CameraFrame,
  CameraMove,
  ClipId,
  Project,
  RelationId,
  SceneCamera,
} from './types';

/** Whether the multicamera is on: the project has a camera, whatever it does. */
export function multicameraOn(project: Pick<Project, 'camera'>): boolean {
  return project.camera !== undefined;
}

/** The time a camera move takes: absolute seconds, half-open. */
export function cameraMoveWindow(move: Pick<CameraMove, 'start' | 'duration'>): Window {
  return { start: move.start, end: move.start + move.duration };
}

/** The moves of a camera in the order they run; two that start together (an error of the
 * project) keep the order of their ids, so that the answer is the same whatever the order of the
 * file. */
export function movesInOrder(camera: SceneCamera): CameraMove[] {
  return [...camera.moves].sort(
    (a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The times at which a camera move starts or ends: the edges of the locked region, where what
 * may not run alongside a move can start or stop, and what an edit that stops against it lands
 * on. None while the multicamera is off. */
export function cameraMoveEdges(project: Pick<Project, 'camera'>): number[] {
  return (project.camera?.moves ?? []).flatMap((move) => [move.start, move.start + move.duration]);
}

/** The free time around `window` among the camera's moves: from the end of the last move before
 * it to the start of the first one after it (touching a move is not overlapping it). What an
 * animation dragged or stretched stays inside: it does not pass a camera move, as it does not
 * pass another animation of its glyphs. A move the window overlaps already (an error of the
 * project) does not bound it, so that an animation in the wrong place can be taken out. Without
 * a move on a side, that side has no end. */
export function cameraGap(project: Pick<Project, 'camera'>, window: Window): Window {
  let start = -Infinity;
  let end = Infinity;
  for (const move of project.camera?.moves ?? []) {
    const taken = cameraMoveWindow(move);
    if (taken.end <= window.start + TIME_EPSILON) start = Math.max(start, taken.end);
    else if (taken.start >= window.end - TIME_EPSILON) end = Math.min(end, taken.start);
  }
  return { start, end };
}

/** The frame a move goes to: its own, its target camera's, or the camera's frame at 0 s. Null for
 * a target camera that does not exist (an error of the project, `dangling-ref`). */
export function destinationFrame(camera: SceneCamera, to: CameraDestination): CameraFrame | null {
  switch (to.kind) {
    case 'frame':
      return to.frame;
    case 'start':
      return camera.initial;
    case 'target':
      return camera.targets.find((target) => target.id === to.target) ?? null;
  }
}

/** What animates in a window of time of its own: the intro or the outro of a clip, one of its
 * blocks, or a relation. */
export type AnimationOwner =
  | { kind: 'intro' | 'outro'; clipId: ClipId }
  | { kind: 'action'; clipId: ClipId; actionId: ActionId }
  | { kind: 'relation'; relationId: RelationId };

export interface AnimationWindow {
  owner: AnimationOwner;
  /** Absolute seconds, half-open. */
  window: Window;
  /** Where it is in the project, as an issue names it. */
  path: (string | number)[];
}

/** Every window of the project in which something animates: the intros and the outros that are
 * animations (kind `none` takes no time), every block, and every relation whose clips exist. A
 * clip that is simply on screen is none, and a clip that starts or ends without an animation
 * animates nothing: it only appears or goes. With `clipIds`, those of these clips alone (a
 * relation with either of its clips among them). */
export function animationWindows(
  project: Project,
  clipIds?: ReadonlySet<ClipId>,
): AnimationWindow[] {
  const windows: AnimationWindow[] = [];
  const wanted = (id: ClipId) => clipIds === undefined || clipIds.has(id);
  project.clips.forEach((clip, ci) => {
    if (!wanted(clip.id)) return;
    if (clip.intro.kind !== 'none' && clip.intro.duration > TIME_EPSILON) {
      windows.push({
        owner: { kind: 'intro', clipId: clip.id },
        window: introWindow(clip),
        path: ['clips', ci, 'intro'],
      });
    }
    if (clip.outro.kind !== 'none' && clip.outro.duration > TIME_EPSILON) {
      windows.push({
        owner: { kind: 'outro', clipId: clip.id },
        window: outroWindow(clip),
        path: ['clips', ci, 'outro'],
      });
    }
    clip.actions.forEach((action, ai) => {
      windows.push({
        owner: { kind: 'action', clipId: clip.id, actionId: action.id },
        window: actionWindow(clip, action),
        path: ['clips', ci, 'actions', ai],
      });
    });
  });
  const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
  project.relations.forEach((relation, ri) => {
    const to = clips.get(relation.toClipId);
    if (!to || !(wanted(relation.fromClipId) || wanted(relation.toClipId))) return;
    windows.push({
      owner: { kind: 'relation', relationId: relation.id },
      window: relationWindow(relation, to),
      path: ['relations', ri],
    });
  });
  return windows;
}

/** An animation that runs while the camera moves. */
export interface CameraRegionClash {
  animation: AnimationWindow;
  move: CameraMove;
}

/** The locked region (D190): the animations that overlap a camera move — touching one is not
 * overlapping it. Every clash is an error of the project (`camera-region`): Manim would have to
 * play the two at once, and the editor exports a camera move as a play of its own. Each animation
 * comes once per move it overlaps, in the order of `animationWindows` and then of the moves. */
export function cameraRegionClashes(
  project: Project,
  clipIds?: ReadonlySet<ClipId>,
): CameraRegionClash[] {
  const camera = project.camera;
  if (!camera || camera.moves.length === 0) return [];
  const moves = movesInOrder(camera);
  return animationWindows(project, clipIds).flatMap((animation) =>
    moves
      .filter((move) => overlaps(animation.window, cameraMoveWindow(move)))
      .map((move) => ({ animation, move })),
  );
}
