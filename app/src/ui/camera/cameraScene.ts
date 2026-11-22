/* What the Preview draws of the scene's camera at an instant (D190), in scene units: the frame
 * the scene is filmed through then, the target cameras, the frames the moves go to on their own,
 * the frame of 0 s, and the route that joins them in the order the moves run. Pure: the layer
 * that draws it (`preview/cameraLayer.ts`) and the gestures that take hold of it
 * (`preview/useCameraGestures.ts`) read the same model, so that what is drawn is what answers. */
import type { Box, Vec2 } from '../../geom';
import {
  FRAME_HEIGHT,
  frameWidth,
  type CameraFrame,
  type CameraMoveId,
  type CameraTargetId,
  type ProjectMeta,
  type SceneCamera,
  type Target,
} from '../../model';
import { cameraLegs, cameraStateAt, sameFrame } from '../../scene';
import { restingFrameOwner, type FrameOwner } from './cameraOps';

/** The box of a frame of the scene: `height` tall about its centre, as wide as the picture's
 * shape makes it (`aspect`, width over height). */
export function frameBoxOf(frame: CameraFrame, aspect: number): Box {
  const halfHeight = frame.height / 2;
  const halfWidth = halfHeight * aspect;
  const [x, y] = frame.center;
  return { minX: x - halfWidth, minY: y - halfHeight, maxX: x + halfWidth, maxY: y + halfHeight };
}

/** One rectangle of the camera's scene. */
export interface CameraRect {
  frame: CameraFrame;
  box: Box;
}

/** A leg of the route: from the centre of the frame a move leaves to the centre of the one it
 * goes to. */
export interface RouteLeg {
  moveId: CameraMoveId;
  from: Vec2;
  to: Vec2;
  /** The move runs at the instant drawn. */
  running: boolean;
}

export interface CameraSceneModel {
  /** Width of a frame over its height: the project's. */
  aspect: number;
  /** Manim's own frame: where the picture is without a camera. */
  origin: Box;
  /** The frame the scene is filmed through at the instant: the current camera. */
  current: CameraRect & {
    /** Whose frame it rests in — what a drag of it edits —, or null while a move runs. */
    owner: FrameOwner | null;
  };
  /** The frame of 0 s, where a move «→ Start» comes back to. */
  start: CameraRect;
  targets: (CameraRect & { id: CameraTargetId; name: string })[];
  /** The frames that moves go to on their own, each with the place of its move in the order they
   * run (from 1). */
  destinations: (CameraRect & { moveId: CameraMoveId; order: number })[];
  /** The route of the camera: a leg for each move that goes somewhere else. */
  route: RouteLeg[];
}

/** The camera's scene at `time`; null for a project without a camera. */
export function cameraSceneAt(
  project: { camera?: SceneCamera | undefined; meta: ProjectMeta },
  time: number,
): CameraSceneModel | null {
  const { camera, meta } = project;
  if (!camera) return null;
  const aspect = meta.width / meta.height;
  const target: Target = meta.target;
  const rect = (frame: CameraFrame): CameraRect => ({ frame, box: frameBoxOf(frame, aspect) });
  const state = cameraStateAt(camera, time, target);
  const legs = cameraLegs(camera);
  const halfWidth = frameWidth(meta) / 2;
  return {
    aspect,
    origin: { minX: -halfWidth, minY: -FRAME_HEIGHT / 2, maxX: halfWidth, maxY: FRAME_HEIGHT / 2 },
    current: { ...rect(state.frame), owner: restingFrameOwner(camera, time) },
    start: rect(camera.initial),
    targets: camera.targets.map((t) => ({ ...rect(t), id: t.id, name: t.name })),
    destinations: legs.flatMap((leg, index) =>
      leg.move.to.kind === 'frame'
        ? [{ ...rect(leg.move.to.frame), moveId: leg.move.id, order: index + 1 }]
        : [],
    ),
    route: legs
      .filter((leg) => !sameFrame(leg.from, leg.to))
      .map((leg) => ({
        moveId: leg.move.id,
        from: [leg.from.center[0], leg.from.center[1]],
        to: [leg.to.center[0], leg.to.center[1]],
        running: state.leg?.move.id === leg.move.id,
      })),
  };
}

/** Every box of the model that stays where it is as the time goes: what «Fit» shows whole —
 * Manim's frame, the frame of 0 s, the target cameras and the moves' own destinations. The current
 * camera is always inside them (it rests in one, or is on its way between two), so the fit is the
 * same at every instant. */
export function cameraSceneBoxes(model: CameraSceneModel): Box[] {
  return [
    model.origin,
    model.start.box,
    ...model.targets.map((t) => t.box),
    ...model.destinations.map((d) => d.box),
  ];
}
