/* The pointer on the camera's rectangles in the Preview's world view (D190). They are asked first,
 * before the ordinary gestures, whether a press is theirs (`cameraGeometry.ts`: a rectangle is
 * taken by its edge, its name or the cross of the current camera's centre; a press on its inside
 * is none of the camera's, and none of the objects' either: there they are left alone,
 * `pointerReach.ts`):
 *   - a press selects the rectangle: the camera, a target camera, or the move whose own frame it
 *     is;
 *   - a drag of it moves the frame it stands for — the current camera's is the one it rests in at
 *     the playhead (`restingFrameOwner`: the frame of 0 s, a move's own destination or a target
 *     camera, the same rectangle for every move that goes to it); while a move runs the camera is
 *     on its way and is not dragged: a notice says to go to the move's end;
 *   - a drag of a corner of the selected rectangle scales it about its centre, the picture's
 *     shape kept.
 * Shift or Alt held keep a move to one axis; the rectangle sticks to the objects' boxes, to the
 * other rectangles of the camera and to Manim's frame, and to the grid when it is shown, and a
 * scaled one to the sizes of the others — Ctrl/⌘ suspends all of it. One drag is one undo step;
 * Escape gives it up. A locked camera is selected and nothing else. A right-click on a rectangle
 * selects it and opens its menu (`CameraSceneMenu.tsx`).
 *
 * While a move is isolated (`viewStore.ts`) the rectangle of the frame it goes to is the only one
 * that answers, whatever lies over it, and a press on it selects that move. */
import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { Box, Vec2 } from '../../geom';
import {
  MAX_CAMERA_HEIGHT,
  MIN_CAMERA_HEIGHT,
  type CameraFrame,
  type CameraMoveId,
} from '../../model';
import { toScene, type Camera, type Surface } from '../../render';
import { history, useUiStore, type ProjectGesture, type Selection } from '../../store';
import { setCameraFrame } from '../camera/cameraActions';
import type { FrameOwner } from '../camera/cameraOps';
import { frameBoxOf, type CameraSceneModel } from '../camera/cameraScene';
import { DRAG_THRESHOLD, isMainClick, trackPointer } from '../pointer';
import { notify } from '../project/noticeStore';
import { SNAP_DISTANCE } from '../timeline/layout';
import {
  hitCameraScene,
  samePiece,
  type CameraCorner,
  type CameraHit,
  type CameraPiece,
} from './cameraGeometry';
import { pixelRect } from './cameraLayer';
import { dragTravel } from './dragSnap';
import type { GridAnchor } from './grid';
import { snapSize, type SnapGuide } from './snap';

export interface CameraGestureContext {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  camera: Camera;
  surface: Surface;
  /** Device pixels per CSS pixel, and scene units per CSS pixel. */
  dpr: number;
  unit: number;
  /** The camera's scene at the playhead; null while the camera's rectangles do not answer the
   * pointer (`pointerReach.ts`: outside the world view, in a mode, while the scene plays): no
   * gesture is the camera's then. */
  model: CameraSceneModel | null;
  selected: CameraPiece | null;
  /** The move that is isolated and the rectangle of the frame it goes to, the only one that
   * answers then; null: they all do. */
  isolated: { move: CameraMoveId; piece: CameraPiece } | null;
  /** The camera is locked: its rectangles are selected and nothing else. */
  locked: boolean;
  /** The boxes of the objects on screen, which a rectangle sticks to. */
  objects: readonly Box[];
  /** The magnet is on. */
  snapObjects: boolean;
  /** The grid, when it is shown. */
  grid: { step: number; anchor: GridAnchor } | null;
}

/** The selection a rectangle stands for. */
export function selectionOfPiece(piece: CameraPiece): Selection {
  switch (piece.kind) {
    case 'target':
      return { kind: 'targetCamera', id: piece.id };
    case 'move':
      return { kind: 'cameraMove', id: piece.id };
    default:
      // The frame of 0 s is the camera's own: its view is the camera's.
      return { kind: 'camera' };
  }
}

/** The rectangle a selection names, or null: the current camera, a target camera, or the frame a
 * move goes to on its own. The frame the camera rests in is the camera's own rectangle — a target
 * camera or a move's frame it is on is not drawn apart —, so a selection of that one names the
 * camera: its handles are the ones on screen. */
export function pieceOfSelection(
  selection: Selection,
  model: CameraSceneModel | null,
): CameraPiece | null {
  const owner = model?.current.owner;
  switch (selection.kind) {
    case 'camera':
      return { kind: 'camera' };
    case 'targetCamera':
      return owner?.kind === 'target' && owner.id === selection.id
        ? { kind: 'camera' }
        : { kind: 'target', id: selection.id };
    case 'cameraMove':
      return owner?.kind === 'move' && owner.id === selection.id
        ? { kind: 'camera' }
        : { kind: 'move', id: selection.id };
    default:
      return null;
  }
}

/** The frame a rectangle keeps, and whose it is; null for the current camera while a move runs. */
export function frameOfPiece(
  model: CameraSceneModel,
  piece: CameraPiece,
): { owner: FrameOwner; frame: CameraFrame } | null {
  switch (piece.kind) {
    case 'camera':
      return model.current.owner
        ? { owner: model.current.owner, frame: model.current.frame }
        : null;
    case 'start':
      return { owner: { kind: 'initial' }, frame: model.start.frame };
    case 'target': {
      const target = model.targets.find((t) => t.id === piece.id);
      return target ? { owner: { kind: 'target', id: piece.id }, frame: target.frame } : null;
    }
    case 'move': {
      const destination = model.destinations.find((d) => d.moveId === piece.id);
      return destination
        ? { owner: { kind: 'move', id: piece.id }, frame: destination.frame }
        : null;
    }
  }
}

/** The boxes a dragged rectangle sticks to: the objects on screen, Manim's frame and the other
 * rectangles of the camera (not itself, nor the one it rests on, which moves with it). */
export function cameraSnapBoxes(
  model: CameraSceneModel,
  moving: FrameOwner,
  objects: readonly Box[],
): Box[] {
  const boxes: Box[] = [...objects, model.origin];
  if (moving.kind !== 'initial') boxes.push(model.start.box);
  for (const target of model.targets) {
    if (!(moving.kind === 'target' && moving.id === target.id)) boxes.push(target.box);
  }
  for (const destination of model.destinations) {
    if (!(moving.kind === 'move' && moving.id === destination.moveId)) boxes.push(destination.box);
  }
  return boxes;
}

/** The height a corner drag gives a frame: the pointer's distance from the centre over the
 * corner's, within the bounds of a camera. */
export function scaledHeight(frame: CameraFrame, aspect: number, pointer: Vec2): number {
  const halfHeight = frame.height / 2;
  const halfWidth = halfHeight * aspect;
  const corner = Math.hypot(halfWidth, halfHeight);
  const reach = Math.hypot(pointer[0] - frame.center[0], pointer[1] - frame.center[1]);
  const height = corner > 0 ? (frame.height * reach) / corner : frame.height;
  return Math.min(MAX_CAMERA_HEIGHT, Math.max(MIN_CAMERA_HEIGHT, height));
}

/** What the Preview says under a selected rectangle of the camera: how it is moved and scaled —
 * or, while a drag of it is held to an axis, which —, or why it is not: a locked camera, a camera
 * on its way. Null for a rectangle that is gone. */
export function cameraHint(
  model: CameraSceneModel,
  piece: CameraPiece,
  state: { locked: boolean; axis: 'x' | 'y' | null; isolated?: boolean },
): string | null {
  if (state.locked) {
    return 'The camera is locked: unlock it on the Camera row of the timeline to move it';
  }
  if (state.axis) {
    return `Moving ${state.axis === 'x' ? 'horizontally' : 'vertically'} only (Shift or Alt) · let it go to move freely · Ctrl/⌘ too: no snapping`;
  }
  if (!frameOfPiece(model, piece)) {
    return piece.kind === 'camera'
      ? 'The camera is on its way: go to the end of the move to put it where it arrives'
      : null;
  }
  const grip =
    piece.kind === 'camera' ? 'its edge, its name or its centre' : 'its edge or its name';
  const keys = `Drag it by ${grip} · a corner scales it · Shift: one axis · Ctrl/⌘: no snapping · the arrows move it 0.01 (Shift: 0.1)`;
  return state.isolated ? `${ISOLATED_HINT} · ${keys}` : keys;
}

/** What the Preview says first of the rectangle of an isolated move. */
export const ISOLATED_HINT = 'Isolated: the other rectangles of the camera do not answer';

/** What the Preview says in the world view while nothing of the camera is selected: whose the
 * pointer is there (`pointerReach.ts`), and how the objects are reached. */
export const WORLD_HINT =
  'The pointer takes the camera’s rectangles here · hold F for the objects, or select them in the camera view (V)';
/** What it says there while F is held (`useObjectsKey.ts`). */
export const OBJECTS_KEY_HINT =
  'F held: the pointer takes the objects, as in the camera view · let it go for the camera’s rectangles';

interface CameraDrag {
  pointerId: number;
  piece: CameraPiece;
  part: 'body' | CameraCorner;
  owner: FrameOwner;
  /** The frame as the drag found it. */
  frame: CameraFrame;
  /** Where the press was, in the scene and on the screen. */
  startScene: Vec2;
  startClient: Vec2;
  snapBoxes: Box[];
  gesture: ProjectGesture | null;
  dispose: () => void;
}

const CURSOR: Record<'body' | CameraCorner, string> = {
  body: 'move',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
};

export function useCameraGestures(context: CameraGestureContext) {
  /** What the gestures hit and edit, for a listener that outlives a render. */
  const latest = useRef(context);
  useLayoutEffect(() => {
    latest.current = context;
  });
  const drag = useRef<CameraDrag | null>(null);
  const [hover, setHover] = useState<CameraHit | null>(null);
  const [dragging, setDragging] = useState<CameraHit | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [axis, setAxis] = useState<'x' | 'y' | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; piece: CameraPiece } | null>(null);
  // What the pointer was over goes when the camera stops answering it (a mode, the scene played):
  // it may not be there when it answers again.
  const answers = context.model !== null;
  const [answered, setAnswered] = useState(answers);
  if (answers !== answered) {
    setAnswered(answers);
    if (!answers) setHover(null);
  }

  /** The point of the canvas (device pixels) and of the scene under a pointer event. */
  const pointOf = (event: { clientX: number; clientY: number }) => {
    const { canvasRef, camera, surface } = latest.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const pixel: Vec2 = [
      ((event.clientX - rect.left) * surface.width) / Math.max(1, rect.width),
      ((event.clientY - rect.top) * surface.height) / Math.max(1, rect.height),
    ];
    return { pixel, scene: toScene(pixel, camera, surface) };
  };

  const hitAt = (event: { clientX: number; clientY: number }): CameraHit | null => {
    const { model, camera, surface, dpr, selected, isolated } = latest.current;
    const at = pointOf(event);
    if (!model || !at) return null;
    return hitCameraScene(
      model,
      at.pixel,
      (box) => pixelRect(box, camera, surface),
      dpr,
      selected,
      isolated?.piece ?? null,
    );
  };

  /** What a press on a rectangle selects: the isolated move while one is — its rectangle is the
   * only one that answers —, else what the rectangle stands for. */
  const selectionAt = (piece: CameraPiece): Selection => {
    const { isolated } = latest.current;
    return isolated ? { kind: 'cameraMove', id: isolated.move } : selectionOfPiece(piece);
  };

  const finish = () => {
    drag.current = null;
    setDragging(null);
    setGuides([]);
    setAxis(null);
  };

  /** Where the dragged frame goes for a pointer event, by the keys held now. */
  const moved = (current: CameraDrag, event: PointerEvent): CameraFrame | null => {
    const { model, unit, snapObjects, grid } = latest.current;
    const at = pointOf(event);
    if (!model || !at) return null;
    const free = event.ctrlKey || event.metaKey;
    if (current.part === 'body') {
      const pointer: Vec2 = [
        at.scene[0] - current.startScene[0],
        at.scene[1] - current.startScene[1],
      ];
      const placed = dragTravel(pointer, {
        snap: {
          moving: frameBoxOf(current.frame, model.aspect),
          targets: { boxes: current.snapBoxes, frame: null },
        },
        objects: snapObjects && !free,
        threshold: SNAP_DISTANCE * unit,
        grid: grid && !free ? grid : null,
        // Shift, as the owner asked, or Alt, as a clip's drag has it.
        lock: event.shiftKey || event.altKey,
      });
      setGuides(placed.guides);
      setAxis(placed.axis);
      return {
        center: [
          current.frame.center[0] + placed.travel[0],
          current.frame.center[1] + placed.travel[1],
        ],
        height: current.frame.height,
      };
    }
    // A corner: about the centre, the picture's shape kept; it sticks to the sizes of the others.
    let height = scaledHeight(current.frame, model.aspect, at.scene);
    let sizeGuides: SnapGuide[] = [];
    if (snapObjects && !free) {
      const snapped = snapSize(
        frameBoxOf(current.frame, model.aspect),
        current.frame.center,
        height / current.frame.height,
        current.snapBoxes,
        SNAP_DISTANCE * unit,
      );
      if (snapped) {
        height = Math.min(
          MAX_CAMERA_HEIGHT,
          Math.max(MIN_CAMERA_HEIGHT, current.frame.height * snapped.factor),
        );
        sizeGuides = snapped.guides;
      }
    }
    setGuides(sizeGuides);
    return { center: current.frame.center, height };
  };

  /** A press on the canvas: whether it was the camera's (the ordinary gestures then leave it). */
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): boolean => {
    const { model, locked, objects } = latest.current;
    if (!model || !isMainClick(event)) return false;
    const hit = hitAt(event);
    const at = pointOf(event);
    if (!hit || !at) return false;
    event.preventDefault();
    useUiStore.getState().select(selectionAt(hit.piece));
    // The frame takes the keyboard, as a click on the scene gives it: the arrows nudge the
    // rectangle that was just selected.
    event.currentTarget.parentElement?.focus({ preventScroll: true });
    if (locked) return true;
    const kept = frameOfPiece(model, hit.piece);
    if (!kept) {
      notify({
        kind: 'info',
        title: 'The camera is on its way',
        message:
          'A move runs at the playhead: go to the end of the move to put the camera where it arrives.',
      });
      return true;
    }
    const canvas = event.currentTarget;
    const pointerId = event.pointerId;
    const current: CameraDrag = {
      pointerId,
      piece: hit.piece,
      part: hit.part,
      owner: kept.owner,
      frame: { center: [kept.frame.center[0], kept.frame.center[1]], height: kept.frame.height },
      startScene: at.scene,
      startClient: [event.clientX, event.clientY],
      snapBoxes: cameraSnapBoxes(model, kept.owner, objects),
      gesture: null,
      dispose: () => {},
    };
    drag.current = current;
    current.dispose = trackPointer(
      pointerId,
      {
        move: (ev) => {
          if (drag.current !== current) return;
          if (!current.gesture) {
            const travelled = Math.hypot(
              ev.clientX - current.startClient[0],
              ev.clientY - current.startClient[1],
            );
            if (travelled < DRAG_THRESHOLD) return;
            // Another command that takes the step over ends the drag.
            current.gesture = history.beginGesture(() => {
              current.dispose();
              if (drag.current === current) finish();
            });
            setDragging({ piece: current.piece, part: current.part });
          }
          const frame = moved(current, ev);
          if (frame) current.gesture.run(() => setCameraFrame(current.owner, frame));
        },
        end: (ev, cancelled) => {
          if (drag.current !== current) return;
          const owned = current.gesture;
          finish();
          // What the pointer is over is read again: a drag that left the canvas found nothing to
          // tell it so on the way (the leave came while it held the rectangle), and one given up
          // puts the rectangle back from under the pointer.
          const over = ev && document.elementFromPoint(ev.clientX, ev.clientY) === canvas;
          setHover(over && !cancelled ? hitAt(ev) : null);
          if (cancelled) owned?.cancel();
          else owned?.end();
        },
      },
      { target: canvas },
    );
    return true;
  };

  /** The pointer moves over the canvas with no button held: what of the camera it is over. Whether
   * it is over something of the camera (the ordinary hover then leaves it). */
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): boolean => {
    if (drag.current) return true;
    if (!latest.current.model || event.buttons !== 0) {
      if (hover) setHover(null);
      return false;
    }
    const hit = hitAt(event);
    setHover((was) =>
      was === hit || (was && hit && samePiece(was.piece, hit.piece) && was.part === hit.part)
        ? was
        : hit,
    );
    return hit !== null;
  };

  const onPointerLeave = () => {
    if (!drag.current && hover) setHover(null);
  };

  /** A right-click on the canvas: whether it was on a rectangle of the camera, which is then
   * selected and whose menu opens (the ordinary menus then leave it). */
  const onContextMenu = (event: ReactMouseEvent<Element>): boolean => {
    if (!latest.current.model || drag.current) return false;
    const hit = hitAt(event);
    if (!hit) return false;
    event.preventDefault();
    useUiStore.getState().select(selectionAt(hit.piece));
    setMenu({ x: event.clientX, y: event.clientY, piece: hit.piece });
    return true;
  };

  const active = dragging ?? hover;
  return {
    /** What the pointer is over, or holds: drawn stronger by the layer. */
    hover: active,
    dragging: dragging !== null,
    /** The guides of the snap of the drag that runs, and the axis it is held to. */
    guides,
    axis,
    /** The cursor over the camera's rectangles; null when the pointer is on none. */
    cursor: active ? (context.locked ? 'pointer' : CURSOR[active.part]) : null,
    /** The right-click menu of a rectangle: where it opens, and whose it is. */
    menu,
    closeMenu: () => setMenu(null),
    onPointerDown,
    onPointerMove,
    onPointerLeave,
    onContextMenu,
  };
}
