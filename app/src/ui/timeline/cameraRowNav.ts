/* The keyboard model of the Camera row (pure): which of its moves holds the row's Tab stop, and
 * which one an arrow goes to. The moves are one line: ←/→ walk them in the order they run, Home
 * and End reach the first and the last. */
import { movesInOrder, type CameraMove, type CameraMoveId, type SceneCamera } from '../../model';

export type CameraNavKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

const NAV_KEYS: ReadonlySet<string> = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

export function isCameraNavKey(key: string): key is CameraNavKey {
  return NAV_KEYS.has(key);
}

/** The move with tabIndex 0: the selected one, else the first to run; null with no moves. */
export function cameraTabStop(
  camera: SceneCamera,
  selected: CameraMoveId | null,
): CameraMove | null {
  const moves = movesInOrder(camera);
  return moves.find((move) => move.id === selected) ?? moves[0] ?? null;
}

/** The move `key` goes to from `from`, or null when there is none that way (the first has none
 * before it) or `from` is not a move of the camera. */
export function cameraNavTarget(
  camera: SceneCamera,
  from: CameraMoveId,
  key: CameraNavKey,
): CameraMove | null {
  const moves = movesInOrder(camera);
  const index = moves.findIndex((move) => move.id === from);
  if (index < 0) return null;
  const to =
    key === 'Home'
      ? 0
      : key === 'End'
        ? moves.length - 1
        : key === 'ArrowLeft'
          ? index - 1
          : index + 1;
  return to === index ? null : (moves[to] ?? null);
}
