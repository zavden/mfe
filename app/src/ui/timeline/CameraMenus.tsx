/* The right-click menus of the timeline's Camera row: a move's own — isolating it in the Preview,
 * a copy of it, deleting it — and the lane's, which adds a move where it was clicked. A locked
 * row's say why they are greyed out; isolating a move changes nothing of the camera, so a locked
 * row has it too. */
import type { CameraMoveId } from '../../model';
import { useProjectStore } from '../../store';
import {
  addCameraMove,
  deleteCameraMove,
  duplicateCameraMove,
  isolateCameraMove,
  stopIsolating,
} from '../camera/cameraActions';
import {
  ISOLATE_TITLE,
  CAMERA_LOCKED_REASON as LOCKED,
  moveFrameOwner,
  moveLabel,
  STOP_ISOLATING_TITLE,
} from '../camera/cameraOps';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { keyHint } from '../platform';
import { usePreviewView } from '../preview/viewStore';

interface CameraMoveMenuProps {
  x: number;
  y: number;
  moveId: CameraMoveId;
  onClose(): void;
}

export function CameraMoveMenu({ x, y, moveId, onClose }: CameraMoveMenuProps) {
  const camera = useProjectStore((state) => state.project.camera);
  const move = camera?.moves.find((m) => m.id === moveId);
  const isolated = usePreviewView((state) => state.isolatedMove === moveId);
  if (!camera || !move) return null;
  const locked = camera.locked === true;
  const reachable = moveFrameOwner(camera, moveId) !== null;
  const act = (run: () => void) => () => {
    onClose();
    run();
  };
  return (
    <ContextMenu
      x={x}
      y={y}
      label={`Camera move ${moveLabel(camera, move)}`}
      testId="camera-move-menu"
      onClose={onClose}
    >
      {isolated ? (
        <MenuItem
          testId="camera-move-menu-stop-isolating"
          title={STOP_ISOLATING_TITLE}
          onClick={act(() => void stopIsolating())}
        >
          Stop isolating
        </MenuItem>
      ) : (
        <MenuItem
          testId="camera-move-menu-isolate"
          disabled={!reachable}
          title={reachable ? ISOLATE_TITLE : 'The target camera this move goes to is missing'}
          onClick={act(() => void isolateCameraMove(moveId))}
        >
          Isolate in the Preview
        </MenuItem>
      )}
      <hr className="ctx-sep" />
      <MenuItem
        testId="camera-move-menu-duplicate"
        disabled={locked}
        title={locked ? LOCKED : 'A copy in the first place it fits after this move'}
        onClick={act(() => duplicateCameraMove(moveId))}
      >
        Duplicate ({keyHint('Mod+D')})
      </MenuItem>
      <MenuItem
        testId="camera-move-menu-delete"
        danger
        disabled={locked}
        title={locked ? LOCKED : undefined}
        onClick={act(() => deleteCameraMove(moveId))}
      >
        Delete (Del)
      </MenuItem>
    </ContextMenu>
  );
}

interface CameraLaneMenuProps {
  x: number;
  y: number;
  /** The time that was clicked, seconds. */
  time: number;
  onClose(): void;
}

export function CameraLaneMenu({ x, y, time, onClose }: CameraLaneMenuProps) {
  const locked = useProjectStore((state) => state.project.camera?.locked === true);
  return (
    <ContextMenu x={x} y={y} label="Camera" testId="camera-lane-menu" onClose={onClose}>
      <MenuItem
        testId="camera-lane-menu-add"
        disabled={locked}
        title={locked ? LOCKED : undefined}
        onClick={() => {
          onClose();
          addCameraMove(time);
        }}
      >
        Add camera move here ({+time.toFixed(2)} s)
      </MenuItem>
    </ContextMenu>
  );
}
