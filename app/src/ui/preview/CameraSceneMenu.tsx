/* The right-click menus of the scene's camera in the Preview's world view (D190). On a target
 * camera: «Move camera here» — a move to it at the playhead —, its name and deleting it. On the
 * other rectangles of the camera, and on the empty space of the scene: «Add target camera here» —
 * a target camera in that rectangle's frame, or centred where the click was and as large as the
 * camera is at the playhead — and «Add camera move». The current camera resting on a target
 * camera is that target camera's rectangle too: its menu names it and deletes it. A locked Camera
 * row greys every entry out and says why. While a move is isolated (`viewStore.ts`) each of these
 * menus ends with «Stop isolating». */
import { useMemo } from 'react';
import type { CameraFrame } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import {
  addCameraMove,
  addTargetCamera,
  deleteTargetCameraAsking,
  renameTargetCameraAsking,
  stopIsolating,
} from '../camera/cameraActions';
import { CAMERA_LOCKED_REASON, STOP_ISOLATING_TITLE } from '../camera/cameraOps';
import { cameraSceneAt } from '../camera/cameraScene';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { pieceMenuOf, type CameraPiece } from './cameraGeometry';
import { usePreviewView } from './viewStore';

interface CameraAddItemsProps {
  /** The frame a new target camera takes, asked for when the entry is chosen; null: none can be
   * told (the entry then does nothing). */
  frameAt(): CameraFrame | null;
  /** Whether «Add target camera here» is offered: not where a target camera already is. */
  target?: boolean;
  testIdPrefix: string;
  onClose(): void;
}

/** «Add target camera here» and «Add camera move»: the entries of every menu of the camera in the
 * preview, and of the menu of the scene's empty space while the multicamera is on. */
export function CameraAddItems({
  frameAt,
  target = true,
  testIdPrefix,
  onClose,
}: CameraAddItemsProps) {
  const locked = useProjectStore((state) => state.project.camera?.locked === true);
  return (
    <>
      {target && (
        <MenuItem
          testId={`${testIdPrefix}-add-target`}
          disabled={locked}
          title={
            locked
              ? CAMERA_LOCKED_REASON
              : 'A target camera in this frame: a rectangle with a name, which camera moves go to'
          }
          onClick={() => {
            const frame = frameAt();
            onClose();
            if (frame) addTargetCamera(frame);
          }}
        >
          Add target camera here
        </MenuItem>
      )}
      <MenuItem
        testId={`${testIdPrefix}-add-move`}
        disabled={locked}
        title={
          locked
            ? CAMERA_LOCKED_REASON
            : 'A camera move at the playhead: then drag the camera to where it arrives'
        }
        onClick={() => {
          onClose();
          addCameraMove();
        }}
      >
        Add camera move
      </MenuItem>
    </>
  );
}

/** «Stop isolating», under a line of its own: the last entry of the Preview's menus while a
 * camera move is isolated, and nothing while none is. */
export function StopIsolatingItem({ testId, onClose }: { testId: string; onClose(): void }) {
  const isolated = usePreviewView((state) => state.isolatedMove !== null);
  if (!isolated) return null;
  return (
    <>
      <hr className="ctx-sep" />
      <MenuItem
        testId={testId}
        title={STOP_ISOLATING_TITLE}
        onClick={() => {
          onClose();
          stopIsolating();
        }}
      >
        Stop isolating
      </MenuItem>
    </>
  );
}

interface CameraPieceMenuProps {
  x: number;
  y: number;
  /** The rectangle that was clicked. */
  piece: CameraPiece;
  onClose(): void;
}

/** The menu of a rectangle of the camera. */
export function CameraPieceMenu({ x, y, piece, onClose }: CameraPieceMenuProps) {
  const camera = useProjectStore((state) => state.project.camera);
  const meta = useProjectStore((state) => state.project.meta);
  const time = useUiStore((state) => state.time);
  const menu = useMemo(() => {
    const model = camera ? cameraSceneAt({ camera, meta }, time) : null;
    return model && pieceMenuOf(model, piece);
  }, [camera, meta, time, piece]);
  if (!camera || !menu) return null;
  const locked = camera.locked === true;
  const { target, frame } = menu;
  const act = (run: () => void) => () => {
    onClose();
    run();
  };
  return (
    <ContextMenu x={x} y={y} label={menu.title} testId="camera-menu" onClose={onClose}>
      <div className="ctx-header" data-testid="camera-menu-header">
        {menu.title}
      </div>
      {target && !menu.resting && (
        <MenuItem
          testId="camera-menu-move-here"
          disabled={locked}
          title={
            locked
              ? CAMERA_LOCKED_REASON
              : 'Add a camera move to this target camera, at the playhead'
          }
          onClick={act(() => addCameraMove(undefined, target.id))}
        >
          Move camera here
        </MenuItem>
      )}
      {(!target || menu.resting) && (
        <CameraAddItems
          frameAt={() => frame}
          target={!target}
          testIdPrefix="camera-menu"
          onClose={onClose}
        />
      )}
      {target && (
        <>
          {menu.resting && <hr className="ctx-sep" />}
          <MenuItem
            testId="camera-menu-rename"
            disabled={locked}
            title={locked ? CAMERA_LOCKED_REASON : undefined}
            onClick={act(() => void renameTargetCameraAsking(target.id))}
          >
            {menu.resting ? `Rename ${target.name}…` : 'Rename…'}
          </MenuItem>
          {!menu.resting && <hr className="ctx-sep" />}
          <MenuItem
            testId="camera-menu-delete"
            danger
            disabled={locked}
            title={locked ? CAMERA_LOCKED_REASON : undefined}
            onClick={act(() => void deleteTargetCameraAsking(target.id))}
          >
            {menu.resting ? `Delete ${target.name}` : 'Delete (Del)'}
          </MenuItem>
        </>
      )}
      <StopIsolatingItem testId="camera-menu-stop-isolating" onClose={onClose} />
    </ContextMenu>
  );
}
