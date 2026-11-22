/* What the editor does to the scene's camera (D190), as pure functions on a project: turning the
 * multicamera on and off, the time a camera move may take — the free gap between the other moves
 * and every animation, since nothing else animates while the camera moves (the locked region,
 * `model/camera.ts`) —, adding, retiming, duplicating and deleting moves, the target cameras, and
 * which frame a drag of the resting camera edits. The timeline's Camera row, the preview's camera
 * gestures and the panel all go through here, so they agree. Nothing here writes the store. */
import {
  animationOwnerName,
  animationWindows,
  cameraMoveWindow,
  createSceneCamera,
  FRAME_HEIGHT,
  MAX_CAMERA_HEIGHT,
  MAX_SCENE_SECONDS,
  MIN_CAMERA_HEIGHT,
  movesInOrder,
  newId,
  TIME_EPSILON,
  type AnimationWindow,
  type CameraDestination,
  type CameraFrame,
  type CameraMove,
  type CameraMoveId,
  type CameraTargetId,
  type Easing,
  type Project,
  type SceneCamera,
  type TargetCamera,
  type Window,
} from '../../model';
import { cameraLegs } from '../../scene';
import { round6 } from '../time';

/** How long a new camera move is, when there is room: Manim's own `run_time`. */
export const DEFAULT_MOVE_DURATION = 1;
/** The shortest a camera move can be made, as an animation block's. */
export const MIN_MOVE_DURATION = 0.05;
/** A gap of this length or more is worth a new move; a shorter one is passed over. */
export const MIN_USABLE_GAP = 0.25;

// --- The multicamera ------------------------------------------------------------

/** The project with its multicamera on: a camera in Manim's own frame. Unchanged when it has one. */
export function turnMulticameraOn(project: Project): Project {
  return project.camera ? project : { ...project, camera: createSceneCamera() };
}

/** Why the multicamera cannot be turned off, or null when it can: the owner's rule is that every
 * target camera and every camera move is deleted first. A frame of 0 s that was moved does not
 * hold it (turning off puts the scene back in Manim's frame; undo brings the camera back). */
export function turnOffBlocker(camera: SceneCamera): string | null {
  const targets = camera.targets.length;
  const moves = camera.moves.length;
  if (targets === 0 && moves === 0) return null;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const what = [
    ...(targets > 0 ? [count(targets, 'target camera', 'target cameras')] : []),
    ...(moves > 0 ? [count(moves, 'camera move', 'camera moves')] : []),
  ].join(' and ');
  return `Delete every target camera and camera move to turn Multicamera off (there ${
    targets + moves === 1 ? 'is' : 'are'
  } ${what}).`;
}

/** The project with its multicamera off: without a camera. Unchanged while something holds it
 * on (`turnOffBlocker`). */
export function turnMulticameraOff(project: Project): Project {
  if (!project.camera || turnOffBlocker(project.camera) !== null) return project;
  const rest = { ...project };
  delete rest.camera;
  return rest;
}

// --- Frames ------------------------------------------------------------------------

/** A frame a camera can have: its height within the bounds of a camera, its numbers finite. */
export function clampFrame(frame: CameraFrame): CameraFrame {
  const finite = (value: number, otherwise: number) => (Number.isFinite(value) ? value : otherwise);
  return {
    center: [finite(frame.center[0], 0), finite(frame.center[1], 0)],
    height: Math.min(
      MAX_CAMERA_HEIGHT,
      Math.max(MIN_CAMERA_HEIGHT, finite(frame.height, FRAME_HEIGHT)),
    ),
  };
}

/** The zoom the app shows for a frame, in per cent: Manim's own frame is 100. */
export function zoomPercent(frame: Pick<CameraFrame, 'height'>): number {
  return (FRAME_HEIGHT / frame.height) * 100;
}

/** The height of the frame of a zoom given in per cent, within the bounds of a camera. */
export function heightOfZoom(percent: number): number {
  const height = percent > 0 ? (FRAME_HEIGHT * 100) / percent : MAX_CAMERA_HEIGHT;
  return Math.min(MAX_CAMERA_HEIGHT, Math.max(MIN_CAMERA_HEIGHT, height));
}

// --- The time of a move ------------------------------------------------------------

/** Something a camera move cannot run alongside: another move, or an animation of the scene. */
export type BusyThing =
  | { window: Window; kind: 'move'; move: CameraMove }
  | { window: Window; kind: 'animation'; animation: AnimationWindow };

/** What a camera move cannot run alongside: the other moves and every animation of the scene
 * (`animationWindows`), in the order they start. `except` leaves a move out: itself. */
export function busyThings(project: Project, except?: CameraMoveId): BusyThing[] {
  const moves = (project.camera?.moves ?? [])
    .filter((move) => move.id !== except)
    .map((move): BusyThing => ({ window: cameraMoveWindow(move), kind: 'move', move }));
  const animations = animationWindows(project).map((animation): BusyThing => ({
    window: animation.window,
    kind: 'animation',
    animation,
  }));
  return [...moves, ...animations].sort(
    (a, b) => a.window.start - b.window.start || a.window.end - b.window.end,
  );
}

/** The windows of `busyThings`. */
export function busyWindows(project: Project, except?: CameraMoveId): Window[] {
  return busyThings(project, except).map((thing) => thing.window);
}

/** The free gap around `window` among `busy`: from the end of what runs before it to the start
 * of what runs after it. What overlaps the window itself (a project in error) does not bound it,
 * so that a move in the wrong place can still be taken out of it. */
export function freeGap(busy: readonly Window[], window: Window): Window {
  let start = 0;
  let end = MAX_SCENE_SECONDS;
  for (const other of busy) {
    if (other.end <= window.start + TIME_EPSILON) start = Math.max(start, other.end);
    else if (other.start >= window.end - TIME_EPSILON) end = Math.min(end, other.start);
  }
  return { start, end };
}

/** How far a move can be dragged or stretched: the free gap around where it is now. */
export function moveLimits(project: Project, moveId: CameraMoveId): Window | null {
  const move = project.camera?.moves.find((m) => m.id === moveId);
  if (!move) return null;
  return freeGap(busyWindows(project, moveId), cameraMoveWindow(move));
}

/** Which part of a move an edit changes: the whole move, its start edge or its end edge. */
export type MoveEdit = 'move' | 'start' | 'end';

export interface MoveTiming {
  start: number;
  duration: number;
}

/** A wanted timing of a move brought inside its limits: a moved one keeps its length while the
 * gap has room for it, a stretched one stops at the gap's edge and at the shortest a move is.
 * `stopped` says the wish was not granted whole. */
export function clampMoveTiming(
  limits: Window,
  current: MoveTiming,
  wanted: MoveTiming,
  edit: MoveEdit,
): MoveTiming & { stopped: boolean } {
  const room = limits.end - limits.start;
  let start = wanted.start;
  let duration = wanted.duration;
  if (edit === 'move') {
    duration = Math.min(current.duration, room);
    start = Math.min(Math.max(start, limits.start), limits.end - duration);
  } else if (edit === 'start') {
    // The end stays; the start goes no further than the gap, nor past the shortest move.
    const end = current.start + current.duration;
    start = Math.min(Math.max(start, limits.start), end - MIN_MOVE_DURATION);
    duration = end - start;
  } else {
    start = current.start;
    duration = Math.min(Math.max(duration, MIN_MOVE_DURATION), limits.end - start);
  }
  start = round6(start);
  duration = round6(duration);
  const stopped =
    Math.abs(start - round6(wanted.start)) > TIME_EPSILON ||
    Math.abs(duration - round6(wanted.duration)) > TIME_EPSILON;
  return { start, duration, stopped };
}

/** Where a new move fits nearest to `at`: at `at` with the wanted length; at `at`, shorter (what
 * is left of the gap, if it is worth it); else at the start of the next gap that is, with the
 * wanted length or what the gap has. With `whole`, only where the wanted length fits: the gaps too
 * short for it are passed over (a copy of a move is as long as the move). Null when the scene has
 * no room at or after `at` — it always has, past the last animation, so only a time past the
 * longest scene gets it. */
export function findMoveSlot(
  project: Project,
  at: number,
  duration = DEFAULT_MOVE_DURATION,
  whole = false,
): (MoveTiming & { moved: boolean }) | null {
  const from = Math.max(0, round6(at));
  // The gaps between what is busy, from `from` on.
  let cursor = from;
  let first = true;
  const tryGap = (start: number, end: number): (MoveTiming & { moved: boolean }) | null => {
    const room = end - start;
    if (room >= duration - TIME_EPSILON) {
      return { start: round6(start), duration: round6(duration), moved: !first };
    }
    if (!whole && room >= MIN_USABLE_GAP - TIME_EPSILON) {
      return { start: round6(start), duration: round6(room), moved: !first };
    }
    return null;
  };
  for (const window of busyWindows(project)) {
    if (window.end <= cursor + TIME_EPSILON) continue;
    if (window.start > cursor + TIME_EPSILON) {
      const found = tryGap(cursor, window.start);
      if (found) return found;
    }
    cursor = Math.max(cursor, window.end);
    first = false;
  }
  if (cursor >= MAX_SCENE_SECONDS) return null;
  return tryGap(cursor, MAX_SCENE_SECONDS);
}

/** The times (absolute seconds) a move being dragged or stretched snaps to: the playhead, the
 * edges of what it cannot run alongside — the other moves and every animation —, and where the
 * clips start and end. The ruler's grid is added by the caller. */
export function moveSnapPoints(project: Project, moveId: CameraMoveId, playhead: number): number[] {
  const points = [playhead];
  for (const { window } of busyThings(project, moveId)) points.push(window.start, window.end);
  for (const clip of [...project.clips, ...project.audioClips]) points.push(clip.start, clip.end);
  return points;
}

/** Why a move stopped at `got` when the pointer asked for `wanted` (absolute seconds): the
 * shortest a move is, when an edge was pushed past it; the start of the scene; else what stands
 * where it stopped — another move, or the animation that starts or ends there. */
export function moveStopReason(
  project: Project,
  moveId: CameraMoveId,
  wanted: Window,
  got: MoveTiming,
  edit: MoveEdit,
): string {
  if (edit !== 'move' && wanted.end - wanted.start < MIN_MOVE_DURATION - TIME_EPSILON) {
    return `A camera move lasts at least ${MIN_MOVE_DURATION} s.`;
  }
  const gotEnd = got.start + got.duration;
  const forward = edit === 'end' ? wanted.end > gotEnd : wanted.start > got.start;
  const at = forward ? gotEnd : got.start;
  if (!forward && at <= TIME_EPSILON) return 'The scene starts at 0 s.';
  const near = (t: number) => Math.abs(t - at) <= TIME_EPSILON;
  const blocker = busyThings(project, moveId).find((thing) =>
    near(forward ? thing.window.start : thing.window.end),
  );
  if (!blocker) return 'The camera move cannot go further.';
  const what =
    blocker.kind === 'move'
      ? 'Another camera move'
      : animationOwnerName(project, blocker.animation.owner);
  return `${what} ${forward ? 'starts' : 'ends'} here, and nothing else animates while the camera moves.`;
}

// --- Moves -----------------------------------------------------------------------

/** A new move, at Manim's defaults. */
export function createCameraMove(
  start: number,
  duration: number,
  to: CameraDestination,
  easing: Easing = 'smooth',
): CameraMove {
  return { id: newId('n'), start: round6(start), duration: round6(duration), easing, to };
}

const withMoves = (camera: SceneCamera, moves: CameraMove[]): SceneCamera => ({ ...camera, moves });

/** The camera with `patch` on one of its moves. */
export function patchCameraMove(
  camera: SceneCamera,
  moveId: CameraMoveId,
  patch: Partial<Omit<CameraMove, 'id'>>,
): SceneCamera {
  return withMoves(
    camera,
    camera.moves.map((move) => (move.id === moveId ? { ...move, ...patch } : move)),
  );
}

export function deleteCameraMove(camera: SceneCamera, moveId: CameraMoveId): SceneCamera {
  return withMoves(
    camera,
    camera.moves.filter((move) => move.id !== moveId),
  );
}

/** A copy of a move for the first place it fits after the move, as long as the move is: the same
 * destination and easing (`findMoveSlot`, whole). A destination of its own is copied, not shared.
 * Null when the move does not exist or the scene has no room left. */
export function duplicateCameraMove(project: Project, moveId: CameraMoveId): CameraMove | null {
  const move = project.camera?.moves.find((m) => m.id === moveId);
  if (!move) return null;
  const slot = findMoveSlot(project, move.start + move.duration, move.duration, true);
  if (!slot) return null;
  const to: CameraDestination =
    move.to.kind === 'frame'
      ? {
          kind: 'frame',
          frame: { center: [...move.to.frame.center], height: move.to.frame.height },
        }
      : { ...move.to };
  return createCameraMove(slot.start, slot.duration, to, move.easing);
}

/** The frame the camera is in once `moveId` has ended: where a new move of its own would start
 * from, and what a destination of its own shows before it is dragged. */
export function frameAfterMove(camera: SceneCamera, moveId: CameraMoveId): CameraFrame | null {
  return cameraLegs(camera).find((leg) => leg.move.id === moveId)?.rest ?? null;
}

// --- Target cameras ----------------------------------------------------------------

/** "Camera 1", "Camera 2"…: the first such name no target camera has. */
export function nextTargetName(camera: SceneCamera): string {
  const taken = new Set(camera.targets.map((target) => target.name));
  for (let n = 1; ; n++) {
    if (!taken.has(`Camera ${n}`)) return `Camera ${n}`;
  }
}

/** A new target camera with the frame given, named after the next free number. */
export function createTargetCamera(camera: SceneCamera, frame: CameraFrame): TargetCamera {
  const { center, height } = clampFrame(frame);
  return { id: newId('k'), name: nextTargetName(camera), center, height };
}

/** Why a command of the camera is greyed out in a menu while the Camera row is locked. */
export const CAMERA_LOCKED_REASON = 'The Camera row is locked.';

/** Why a name cannot be a target camera's, or null: it has to say something. */
export function targetNameIssue(name: string): string | null {
  return name.trim() === '' ? 'A target camera needs a name.' : null;
}

/** The moves that go to a target camera, in the order they run. */
export function movesToTarget(camera: SceneCamera, targetId: CameraTargetId): CameraMove[] {
  return movesInOrder(camera).filter(
    (move) => move.to.kind === 'target' && move.to.target === targetId,
  );
}

/** The camera without a target camera. The moves that went to it keep going where it was, to a
 * frame of their own (the owner's answer: the moves stay, nothing they showed is lost). */
export function deleteTargetCamera(camera: SceneCamera, targetId: CameraTargetId): SceneCamera {
  const target = camera.targets.find((t) => t.id === targetId);
  if (!target) return camera;
  const frame: CameraFrame = {
    center: [target.center[0], target.center[1]],
    height: target.height,
  };
  return {
    ...camera,
    targets: camera.targets.filter((t) => t.id !== targetId),
    moves: camera.moves.map((move) =>
      move.to.kind === 'target' && move.to.target === targetId
        ? { ...move, to: { kind: 'frame', frame: { ...frame, center: [...frame.center] } } }
        : move,
    ),
  };
}

// --- The frame a drag edits -----------------------------------------------------------

/** Whose frame the camera rests in: the camera's own at 0 s, a move's own destination, or a
 * target camera. */
export type FrameOwner =
  { kind: 'initial' } | { kind: 'move'; id: CameraMoveId } | { kind: 'target'; id: CameraTargetId };

/** Whose frame the camera is in at `t`: what a drag of the camera edits then. While the camera
 * rests, the destination of the last move that ended — its own frame, its target camera, or the
 * frame of 0 s for a move back to the start — and the frame of 0 s before any move; a move that
 * goes there and back leaves the owner it found. Null while a move runs: the camera is on its
 * way, and there is no frame of its own to edit. */
export function restingFrameOwner(camera: SceneCamera, t: number): FrameOwner | null {
  let owner: FrameOwner = { kind: 'initial' };
  for (const leg of cameraLegs(camera)) {
    if (t < leg.start - TIME_EPSILON) break;
    if (t < leg.end - TIME_EPSILON) return null;
    if (leg.rest !== leg.to) continue; // there and back: where it was
    const { to } = leg.move;
    if (to.kind === 'start') owner = { kind: 'initial' };
    else if (to.kind === 'frame') owner = { kind: 'move', id: leg.move.id };
    else if (camera.targets.some((target) => target.id === to.target)) {
      owner = { kind: 'target', id: to.target };
    }
  }
  return owner;
}

/** Whose frame a move goes to: its own, its target camera's, or the frame of 0 s — the rectangle
 * of the Preview that stands for where the move arrives, the one an isolated move leaves alone to
 * answer the pointer (`preview/viewStore.ts`). Null for a move that is gone, or whose target camera
 * is. */
export function moveFrameOwner(camera: SceneCamera, moveId: CameraMoveId): FrameOwner | null {
  const to = camera.moves.find((move) => move.id === moveId)?.to;
  if (!to) return null;
  if (to.kind === 'start') return { kind: 'initial' };
  if (to.kind === 'frame') return { kind: 'move', id: moveId };
  return camera.targets.some((target) => target.id === to.target)
    ? { kind: 'target', id: to.target }
    : null;
}

/** Whether two owners are the same frame's. */
export function sameOwner(a: FrameOwner | null, b: FrameOwner | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === 'initial' || a.id === (b as typeof a).id;
}

/** The frame `owner` keeps as its own, as the project holds it: null for an owner that has none
 * any more — a target camera that is gone, a move that is gone or goes elsewhere now. */
export function ownerFrame(camera: SceneCamera, owner: FrameOwner): CameraFrame | null {
  switch (owner.kind) {
    case 'initial':
      return camera.initial;
    case 'target': {
      const target = camera.targets.find((t) => t.id === owner.id);
      return target ? { center: target.center, height: target.height } : null;
    }
    case 'move': {
      const to = camera.moves.find((move) => move.id === owner.id)?.to;
      return to?.kind === 'frame' ? to.frame : null;
    }
  }
}

/** One of the three numbers a frame is edited by: its centre's X or Y, or its zoom in per cent. */
export type FrameField = 'x' | 'y' | 'zoom';

/** `frame` with one of its numbers changed, the others as they are. */
export function withFrameField(frame: CameraFrame, field: FrameField, value: number): CameraFrame {
  const [x, y] = frame.center;
  if (field === 'x') return { center: [value, y], height: frame.height };
  if (field === 'y') return { center: [x, value], height: frame.height };
  return { center: [x, y], height: heightOfZoom(value) };
}

/** The camera with `frame` written where `owner` keeps its own. */
export function writeFrame(
  camera: SceneCamera,
  owner: FrameOwner,
  frame: CameraFrame,
): SceneCamera {
  const { center, height } = clampFrame(frame);
  switch (owner.kind) {
    case 'initial':
      return { ...camera, initial: { center, height } };
    case 'target':
      return {
        ...camera,
        targets: camera.targets.map((target) =>
          target.id === owner.id ? { ...target, center, height } : target,
        ),
      };
    case 'move':
      return patchCameraMove(camera, owner.id, {
        to: { kind: 'frame', frame: { center, height } },
      });
  }
}

// --- Words ---------------------------------------------------------------------------

/** What a move is called on its block and in its panel: where it goes. */
export function moveLabel(camera: SceneCamera, move: CameraMove): string {
  const { to } = move;
  if (to.kind === 'start') return '→ Start';
  if (to.kind === 'target') {
    return `→ ${camera.targets.find((target) => target.id === to.target)?.name ?? '(missing camera)'}`;
  }
  return `→ ${Math.round(zoomPercent(to.frame))} %`;
}

/** What «Isolate in the Preview» does, and «Stop isolating»: their tooltips. */
export const ISOLATE_TITLE =
  'Only the rectangle of the frame this move goes to answers the pointer in the Preview, and the others are drawn faint: for frames that lie one over another';
export const STOP_ISOLATING_TITLE = 'Every rectangle of the camera answers the pointer again (Esc)';

const seconds = (t: number) => `${+t.toFixed(3)} s`;

/** How a move reads to assistive technology, and in its tooltip: where it goes and when. */
export function moveDescription(camera: SceneCamera, move: CameraMove): string {
  const to = moveLabel(camera, move).replace(/^→ /, '');
  return `Camera move to ${to}, ${seconds(move.start)} to ${seconds(move.start + move.duration)}`;
}
