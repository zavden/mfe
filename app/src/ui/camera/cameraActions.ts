/* The commands of the scene's camera (D190): what the menu, the keys, the timeline's Camera row and
 * the preview run. Each reads the stores, works the change out with `cameraOps.ts` and writes the
 * camera it gives as one undo step. */
import {
  destinationFrame,
  TIME_EPSILON,
  type CameraFrame,
  type CameraMoveId,
  type CameraTargetId,
  type Easing,
  type SceneCamera,
} from '../../model';
import { cameraStateAt } from '../../scene';
import { confirmDialog, promptDialog } from '../project/dialogStore';
import { useDocumentStore } from '../project/documentStore';
import { history, useProjectStore, useUiStore } from '../../store';
import { announce } from '../announcer';
import { notify } from '../project/noticeStore';
import { round6, snapToFrame } from '../time';
import { usePreviewView } from '../preview/viewStore';
import { useTimelineStore } from '../timeline/timelineStore';
import {
  clampMoveTiming,
  createCameraMove,
  createTargetCamera,
  DEFAULT_MOVE_DURATION,
  deleteTargetCamera,
  deleteCameraMove as removeCameraMove,
  duplicateCameraMove as copyOfCameraMove,
  findMoveSlot,
  MIN_MOVE_DURATION,
  moveDescription,
  moveFrameOwner,
  moveLimits,
  moveStopReason,
  movesToTarget,
  ownerFrame,
  patchCameraMove,
  restingFrameOwner,
  targetNameIssue,
  turnMulticameraOff,
  turnMulticameraOn,
  turnOffBlocker,
  withFrameField,
  writeFrame,
  type FrameField,
  type FrameOwner,
  type MoveTiming,
} from './cameraOps';

/** Write the project's camera — none takes it away — as one undo step. */
function writeCamera(camera: SceneCamera | undefined): void {
  useProjectStore.getState().update((draft) => {
    if (camera) draft.camera = camera;
    else delete draft.camera;
  });
}

/** Turn the multicamera on, or off: the project gets a camera in Manim's own frame, or loses the
 * one it has. Off only once every target camera and every camera move is deleted (the owner's
 * rule): until then a notice says what holds it on, and nothing changes. Whether it changed. */
export function toggleMulticamera(): boolean {
  // What a drag has moved so far is not what the command decides with.
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  if (!project.camera) {
    writeCamera(turnMulticameraOn(project).camera);
    // It comes up in the world view, where the camera is seen and put.
    usePreviewView.getState().setCameraView(false);
    announce('Multicamera on');
    return true;
  }
  const blocker = turnOffBlocker(project.camera);
  if (blocker !== null) {
    notify({ kind: 'info', title: 'Multicamera stays on', message: blocker });
    return false;
  }
  writeCamera(turnMulticameraOff(project).camera);
  announce('Multicamera off');
  return true;
}

/** Go to the camera view, or back to the world (D190, V): the Preview then looks through the
 * camera at the playhead, as the video does, and shows none of its rectangles. A view of the
 * Preview, not a change of the project. Only a scene with a camera has it — without one the
 * Preview is that view already —: whether the view changed. */
export function toggleCameraView(): boolean {
  if (!useProjectStore.getState().project.camera) return false;
  const view = usePreviewView.getState();
  const on = !view.cameraView;
  view.setCameraView(on);
  announce(on ? 'Camera view: what the video shows' : 'World view: the camera and its frames');
  return true;
}

/** Isolate a camera move in the Preview (`isolatedMove`, `preview/viewStore.ts`): the rectangle of
 * the frame it goes to answers the pointer alone there, for frames that lie one over another. The
 * move is selected and the Preview goes to the world view, where its rectangle is. A way of
 * looking, not a change of the project. Whether it was isolated: not a move that is gone, or that
 * goes to a target camera that is. */
export function isolateCameraMove(id: CameraMoveId): boolean {
  const { camera } = useProjectStore.getState().project;
  const move = camera?.moves.find((m) => m.id === id);
  if (!camera || !move || !moveFrameOwner(camera, id)) return false;
  const view = usePreviewView.getState();
  view.isolateMove(id);
  view.setCameraView(false);
  useUiStore.getState().select({ kind: 'cameraMove', id });
  announce(
    `Isolated: ${moveDescription(camera, move)}. The other rectangles of the camera do not answer in the Preview`,
  );
  return true;
}

/** Leave the isolation of a camera move: every rectangle of the camera answers again. Whether one
 * was isolated. */
export function stopIsolating(): boolean {
  const view = usePreviewView.getState();
  if (view.isolatedMove === null) return false;
  view.isolateMove(null);
  announce('Every rectangle of the camera answers again');
  return true;
}

/** Lock the Camera row, or unlock it: locked, its moves can be selected but not edited, as the
 * clips of a locked track. */
export function toggleCameraLock(): void {
  // The button is reached with the keys while a move is dragged: what the drag has moved so far
  // is not the camera that gets locked.
  history.cancelForeignGesture();
  const { camera } = useProjectStore.getState().project;
  if (!camera) return;
  const next: SceneCamera = { ...camera };
  if (camera.locked) delete next.locked;
  else next.locked = true;
  writeCamera(next);
}

const seconds = (t: number) => `${+t.toFixed(3)} s`;

/** Add a camera move (D190, «Add camera move»): at the playhead and one second long — or over the
 * timeline's region, when one is marked, as everything created next takes it; at `at` and a second
 * long when a time is given (the one clicked in the row) —, where the scene
 * is free: nothing else animates while the camera moves, so a move asked for where an animation
 * runs starts after it, and one with less room than it wants is as long as the room (a notice
 * says so, `findMoveSlot`). It goes to a frame of its own, the one the camera is in: the playhead
 * is taken to its end, where the camera is then put where the move should arrive — or, with `to`,
 * to that target camera («Move camera here»). The new move is selected. Its id, or null when none
 * was added. */
export function addCameraMove(at?: number, to?: CameraTargetId): CameraMoveId | null {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  const camera = project.camera;
  if (!camera) return null;
  if (camera.locked) {
    notify({
      kind: 'info',
      title: 'The Camera row is locked',
      message: 'Unlock it to add a move.',
    });
    return null;
  }
  const region = at === undefined ? useTimelineStore.getState().region : null;
  const from = at ?? (region ? region.start : useUiStore.getState().time);
  const wanted = region ? region.end - region.start : DEFAULT_MOVE_DURATION;
  const slot = findMoveSlot(project, from, Math.max(wanted, MIN_MOVE_DURATION));
  if (!slot) {
    notify({ kind: 'info', title: 'No room for a camera move', message: 'The scene ends here.' });
    return null;
  }
  const rest = cameraStateAt(camera, slot.start, project.meta.target).frame;
  const move = createCameraMove(
    slot.start,
    slot.duration,
    to !== undefined && camera.targets.some((target) => target.id === to)
      ? { kind: 'target', target: to }
      : { kind: 'frame', frame: { center: [rest.center[0], rest.center[1]], height: rest.height } },
  );
  writeCamera({ ...camera, moves: [...camera.moves, move] });
  useUiStore.getState().select({ kind: 'cameraMove', id: move.id });
  useUiStore.getState().setTime(slot.start + slot.duration);
  const shorter = slot.duration < wanted - TIME_EPSILON;
  if (slot.moved || shorter) {
    notify({
      kind: 'info',
      title: slot.moved
        ? `Camera move added at ${seconds(slot.start)}`
        : `Camera move added, ${seconds(slot.duration)} long`,
      message: slot.moved
        ? `Nothing else animates while the camera moves: the move starts where the scene is free${shorter ? `, and is ${seconds(slot.duration)} long, the room there` : ''}.`
        : 'Nothing else animates while the camera moves: that is the room before the next animation.',
    });
  }
  announce(`Camera move added at ${seconds(slot.start)}, ${seconds(slot.duration)} long`);
  return move.id;
}

/** Give a move another time, as a drag does step by step (inside its gesture) and the keyboard
 * in one. The caller answers for the time: nothing is clamped here. */
export function setCameraMoveTiming(moveId: CameraMoveId, timing: MoveTiming): void {
  const { camera } = useProjectStore.getState().project;
  if (!camera) return;
  writeCamera(patchCameraMove(camera, moveId, { start: timing.start, duration: timing.duration }));
}

/** Whether the Camera row can be edited now: it has a camera, and is not locked. A locked row
 * says so in a notice, for a command of the keyboard or of a menu. */
function editableCamera(): SceneCamera | null {
  const { camera } = useProjectStore.getState().project;
  if (!camera) return null;
  if (camera.locked) {
    notify({
      kind: 'info',
      title: 'The Camera row is locked',
      message: 'Unlock it to edit its moves.',
    });
    return null;
  }
  return camera;
}

/** Delete a camera move: one undo step, nothing asked — a move holds nothing but its time and
 * where it goes. */
export function deleteCameraMove(moveId: CameraMoveId): boolean {
  history.cancelForeignGesture();
  const camera = editableCamera();
  const move = camera?.moves.find((m) => m.id === moveId);
  if (!camera || !move) return false;
  writeCamera(removeCameraMove(camera, moveId));
  const { selection, select } = useUiStore.getState();
  if (selection.kind === 'cameraMove' && selection.id === moveId) select({ kind: 'none' });
  announce(`${moveDescription(camera, move)} deleted`);
  return true;
}

/** Duplicate a camera move into the first place it fits after it (`duplicateCameraMove`), and
 * select the copy. Its id, or null when there was no room (a notice says so). */
export function duplicateCameraMove(moveId: CameraMoveId): CameraMoveId | null {
  history.cancelForeignGesture();
  const camera = editableCamera();
  if (!camera) return null;
  const copy = copyOfCameraMove(useProjectStore.getState().project, moveId);
  if (!copy) {
    notify({ kind: 'info', title: 'No room for a copy of the camera move' });
    return null;
  }
  writeCamera({ ...camera, moves: [...camera.moves, copy] });
  useUiStore.getState().select({ kind: 'cameraMove', id: copy.id });
  announce(`${moveDescription(camera, copy)} added`);
  return copy.id;
}

/** Move a camera move by `frames` frames of the project (Alt+←/→), inside the free gap it is in;
 * one undo step. Told to assistive technology: where it went, or what stands in its way. A locked
 * row stays as it is, as the block of a locked track does. */
export function nudgeCameraMove(moveId: CameraMoveId, frames: number): void {
  history.cancelForeignGesture();
  const { project } = useProjectStore.getState();
  const move = project.camera?.moves.find((m) => m.id === moveId);
  const limits = moveLimits(project, moveId);
  if (!project.camera || !move || !limits || project.camera.locked) return;
  // A move that starts on a frame stays on the frames: no float noise piles up over the presses.
  const stepped = round6(move.start + frames / project.meta.fps);
  const onFrame = snapToFrame(stepped, project.meta.fps);
  const start = Math.abs(onFrame - stepped) <= 2e-6 ? onFrame : stepped;
  const current = { start: move.start, duration: move.duration };
  const timing = clampMoveTiming(limits, current, { start, duration: move.duration }, 'move');
  if (timing.start === move.start) {
    const wanted = { start, end: start + move.duration };
    announce(moveStopReason(project, moveId, wanted, timing, 'move'));
    return;
  }
  setCameraMoveTiming(moveId, { start: timing.start, duration: timing.duration });
  announce(`Camera move moved to ${timing.start.toFixed(2)} s`);
}

// --- The panel's edits -----------------------------------------------------------------

/** Give a move another start (`move`: its length stays) or another length (`end`: its start
 * stays), as a field of its panel asks: inside the free gap it is in, as a drag is — it does not
 * pass an animation nor another move. One undo step; nothing when it is already there. */
export function retimeCameraMove(moveId: CameraMoveId, edit: 'move' | 'end', value: number): void {
  history.cancelForeignGesture();
  const camera = editableCamera();
  const { project } = useProjectStore.getState();
  const move = camera?.moves.find((m) => m.id === moveId);
  const limits = moveLimits(project, moveId);
  if (!camera || !move || !limits) return;
  const current = { start: move.start, duration: move.duration };
  const wanted =
    edit === 'move'
      ? { start: value, duration: move.duration }
      : { start: move.start, duration: value };
  const timing = clampMoveTiming(limits, current, wanted, edit);
  if (timing.start === move.start && timing.duration === move.duration) return;
  setCameraMoveTiming(moveId, { start: timing.start, duration: timing.duration });
}

/** Give a move another easing. */
export function setCameraMoveEasing(moveId: CameraMoveId, easing: Easing): void {
  history.cancelForeignGesture();
  const camera = editableCamera();
  if (!camera?.moves.some((m) => m.id === moveId)) return;
  writeCamera(patchCameraMove(camera, moveId, { easing }));
}

/** Send a move somewhere else: back to the frame of 0 s (`start`), to a target camera (its id),
 * or to a frame of its own (`frame`) — the one it goes to now, copied, so that nothing jumps: the
 * move then keeps arriving where it did, and that frame is its own to edit. */
export function setCameraMoveDestination(
  moveId: CameraMoveId,
  to: 'frame' | 'start' | { target: CameraTargetId },
): void {
  history.cancelForeignGesture();
  const camera = editableCamera();
  const move = camera?.moves.find((m) => m.id === moveId);
  if (!camera || !move) return;
  if (to === 'start') {
    writeCamera(patchCameraMove(camera, moveId, { to: { kind: 'start' } }));
  } else if (to === 'frame') {
    if (move.to.kind === 'frame') return;
    const { project } = useProjectStore.getState();
    const now =
      destinationFrame(camera, move.to) ??
      cameraStateAt(camera, move.start, project.meta.target).frame;
    const frame: CameraFrame = { center: [now.center[0], now.center[1]], height: now.height };
    writeCamera(patchCameraMove(camera, moveId, { to: { kind: 'frame', frame } }));
  } else if (camera.targets.some((target) => target.id === to.target)) {
    writeCamera(patchCameraMove(camera, moveId, { to: { kind: 'target', target: to.target } }));
  }
}

/** Write a frame where its owner keeps it (`writeFrame`): the camera's at 0 s, a move's own
 * destination, a target camera's — within the bounds of a camera. One undo step. For what has
 * the whole frame in hand, as a drag of its rectangle in the Preview; a field of the panel has
 * one number of it (`setCameraFrameField`). */
export function setCameraFrame(owner: FrameOwner, frame: CameraFrame): void {
  history.cancelForeignGesture();
  const camera = editableCamera();
  if (!camera) return;
  writeCamera(writeFrame(camera, owner, frame));
}

/** Write one number of a frame — its centre's X or Y, or its zoom in per cent — where its owner
 * keeps it: what a field of the camera's panel commits. `playhead`: the frame the camera rests in
 * at the playhead, whoever keeps it. The other two numbers are the project's, read once a drag
 * that is still held was given up: the panel shows them as that drag has them, and they are not
 * what the field was typed for. So is the owner at the playhead, which a drag of a move can
 * change. One undo step; nothing for an owner that has no frame any more. */
export function setCameraFrameField(
  target: FrameOwner | { kind: 'playhead' },
  field: FrameField,
  value: number,
): void {
  history.cancelForeignGesture();
  const camera = editableCamera();
  if (!camera) return;
  const owner =
    target.kind === 'playhead' ? restingFrameOwner(camera, useUiStore.getState().time) : target;
  const frame = owner && ownerFrame(camera, owner);
  if (!owner || !frame) return;
  writeCamera(writeFrame(camera, owner, withFrameField(frame, field, value)));
}

/** Add a target camera — a frame with a name, set aside for moves to go to — and select it. Its
 * frame is the one given, else the one the camera is in at the playhead. Its id. */
export function addTargetCamera(frame?: CameraFrame): CameraTargetId | null {
  history.cancelForeignGesture();
  const camera = editableCamera();
  if (!camera) return null;
  const { project } = useProjectStore.getState();
  const at = cameraStateAt(camera, useUiStore.getState().time, project.meta.target).frame;
  const target = createTargetCamera(camera, frame ?? at);
  writeCamera({ ...camera, targets: [...camera.targets, target] });
  useUiStore.getState().select({ kind: 'targetCamera', id: target.id });
  announce(`${target.name} added`);
  return target.id;
}

/** Give a target camera another name; an empty one is not a name. */
export function renameTargetCamera(targetId: CameraTargetId, name: string): void {
  history.cancelForeignGesture();
  const camera = editableCamera();
  const wanted = name.trim();
  const target = camera?.targets.find((t) => t.id === targetId);
  if (!camera || !target || wanted === '' || wanted === target.name) return;
  writeCamera({
    ...camera,
    targets: camera.targets.map((t) => (t.id === targetId ? { ...t, name: wanted } : t)),
  });
}

/** Ask for a target camera's new name, as its menu in the preview does («Rename…»), and give it.
 * Whether it was renamed. */
export async function renameTargetCameraAsking(targetId: CameraTargetId): Promise<boolean> {
  history.cancelForeignGesture();
  const session = useDocumentStore.getState().session;
  const target = editableCamera()?.targets.find((t) => t.id === targetId);
  if (!target) return false;
  const name = await promptDialog({
    title: `Rename ${target.name}`,
    label: 'Name',
    value: target.name,
    validate: targetNameIssue,
    maxLength: 40,
    confirmLabel: 'Rename',
  });
  if (name === null || useDocumentStore.getState().session !== session) return false;
  // The camera may have changed while the question was open.
  const now = useProjectStore.getState().project.camera?.targets.find((t) => t.id === targetId);
  if (!now || now.name === name) return false;
  renameTargetCamera(targetId, name);
  return (
    useProjectStore
      .getState()
      .project.camera?.targets.some((t) => t.id === targetId && t.name === name) === true
  );
}

/** Delete a target camera. One that moves go to is asked about first (the owner's answer): those
 * moves stay, each going to a frame of its own where the target camera was, so that nothing they
 * showed is lost. Whether it was deleted. */
export async function deleteTargetCameraAsking(targetId: CameraTargetId): Promise<boolean> {
  history.cancelForeignGesture();
  const session = useDocumentStore.getState().session;
  const asked = editableCamera();
  const target = asked?.targets.find((t) => t.id === targetId);
  if (!asked || !target) return false;
  const users = movesToTarget(asked, targetId).length;
  if (users > 0) {
    const ok = await confirmDialog({
      title: `Delete ${target.name}?`,
      message: `${users} camera move${users === 1 ? ' goes' : 's go'} to it. ${
        users === 1 ? 'It keeps' : 'They keep'
      } going where it is, to a frame of ${users === 1 ? 'its' : 'their'} own.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok || useDocumentStore.getState().session !== session) return false;
  }
  // The camera may have changed while the question was open.
  const camera = useProjectStore.getState().project.camera;
  if (!camera || camera.locked || !camera.targets.some((t) => t.id === targetId)) return false;
  writeCamera(deleteTargetCamera(camera, targetId));
  const { selection, select } = useUiStore.getState();
  if (selection.kind === 'targetCamera' && selection.id === targetId) select({ kind: 'camera' });
  announce(`${target.name} deleted`);
  return true;
}

/** The run of presses of the arrows the last one was part of: the frame it moved, at the instant
 * it moved it, and the top of the undo stack its write left. */
const nudgeRun = { owner: '', time: Number.NaN, past: undefined as unknown };

/** Move a frame of the camera by `travel` (an arrow key's: scene units, +y up), as the arrows
 * move a selected clip: to six decimals, no snapping. A run of presses on the same frame at the
 * same instant is one undo step (`history.continueStep`), as it is for a clip. Whether it moved:
 * not a locked camera's. */
export function nudgeCameraFrame(owner: FrameOwner, travel: readonly [number, number]): boolean {
  history.cancelForeignGesture();
  const { camera } = useProjectStore.getState().project;
  if (!camera || camera.locked) return false;
  const frame =
    owner.kind === 'initial'
      ? camera.initial
      : owner.kind === 'target'
        ? camera.targets.find((target) => target.id === owner.id)
        : destinationOfMove(camera, owner.id);
  if (!frame) return false;
  const key = JSON.stringify(owner);
  const time = useUiStore.getState().time;
  const temporal = useProjectStore.temporal;
  const joins =
    nudgeRun.owner === key &&
    nudgeRun.time === time &&
    nudgeRun.past !== undefined &&
    temporal.getState().pastStates.at(-1) === nudgeRun.past;
  const next: CameraFrame = {
    center: [round6(frame.center[0] + travel[0]), round6(frame.center[1] + travel[1])],
    height: frame.height,
  };
  const before = useProjectStore.getState().project;
  const write = () => writeCamera(writeFrame(camera, owner, next));
  if (joins) history.continueStep(write);
  else write();
  if (useProjectStore.getState().project === before) return false;
  nudgeRun.owner = key;
  nudgeRun.time = time;
  nudgeRun.past = temporal.getState().pastStates.at(-1);
  const way = travel[0] > 0 ? 'right' : travel[0] < 0 ? 'left' : travel[1] > 0 ? 'up' : 'down';
  announce(`Camera frame moved ${way} ${Math.abs(travel[0] || travel[1])}`);
  return true;
}

/** The frame a move goes to on its own, or undefined for a move that goes elsewhere. */
function destinationOfMove(camera: SceneCamera, moveId: CameraMoveId): CameraFrame | undefined {
  const move = camera.moves.find((m) => m.id === moveId);
  return move?.to.kind === 'frame' ? move.to.frame : undefined;
}
