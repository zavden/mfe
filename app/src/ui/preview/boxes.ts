/* Axis-aligned boxes of whole formulas as placed on the frame, and of the frame itself: what the
 * align and distribute commands measure. Pure: scene units (y up, degrees CCW), no DOM. */
import type { Box } from '../../geom';
import { FRAME_HEIGHT, frameWidth, type ProjectMeta, type SceneCamera } from '../../model';
import { cameraAt } from '../../scene';
import { orientedBox, type BoxPlacement, type OrientedBox } from './handles';

/** The axis-aligned box that encloses an oriented box (a formula turned by its rotation). */
export function enclosingBox(oriented: OrientedBox): Box {
  const r = (oriented.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // The corners are centre ± (±hw, ±hh) turned; their extremes are these half-extents.
  const halfX = Math.abs(oriented.halfWidth * cos) + Math.abs(oriented.halfHeight * sin);
  const halfY = Math.abs(oriented.halfWidth * sin) + Math.abs(oriented.halfHeight * cos);
  const [cx, cy] = oriented.center;
  return { minX: cx - halfX, minY: cy - halfY, maxX: cx + halfX, maxY: cy + halfY };
}

/** The whole formula's axis-aligned box as placed: every glyph, drawn or not (the box Manim's
 * align_to / arrange use). `local` is the render's box, centred on the origin. */
export function formulaBoxAt(local: Box, placement: BoxPlacement): Box {
  return enclosingBox(orientedBox(local, placement));
}

/** The frame as a box: x in ±width/2, y in ±4. */
export function frameBox(meta: Pick<ProjectMeta, 'width' | 'height'>): Box {
  const halfX = frameWidth(meta) / 2;
  const halfY = FRAME_HEIGHT / 2;
  return { minX: -halfX, minY: -halfY, maxX: halfX, maxY: halfY };
}

/** The frame the scene is seen through at `time`, as a box: Manim's own or, in a scene with a
 * camera (D190), the camera's at that instant — what «Align to frame» and the guides of the frame
 * refer to (the owner's answer): what is seen then, not where Manim's frame once was. */
export function sceneFrameBox(
  project: {
    meta: Pick<ProjectMeta, 'width' | 'height' | 'target'>;
    camera?: SceneCamera | undefined;
  },
  time: number,
): Box {
  const { meta, camera } = project;
  if (!camera) return frameBox(meta);
  const { center, height } = cameraAt(camera, time, meta.target);
  const halfY = height / 2;
  const halfX = (halfY * meta.width) / meta.height;
  return {
    minX: center[0] - halfX,
    minY: center[1] - halfY,
    maxX: center[0] + halfX,
    maxY: center[1] + halfY,
  };
}
