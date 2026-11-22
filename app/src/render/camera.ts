/* Camera maths: how scene units (y up) map to canvas pixels (y down).
 *
 * The camera shows `1 / zoom` of the largest letterboxed fit of the Manim frame: at zoom 1 and
 * centre (0, 0) the whole frame fits the surface (letterboxed on the longer side). All
 * functions are pure and need no DOM, so the preview, hit-testing and the video export agree. */
import type { Mat2D, Vec2 } from '../geom';
import type { Camera, Surface } from './types';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 64;

/** Pixels per scene unit at zoom 1: the frame fits the surface completely. */
export function fitScale(camera: Camera, surface: Surface): number {
  return Math.min(surface.width / camera.frameWidth, surface.height / camera.frameHeight);
}

/** Pixels per scene unit. */
export function pixelsPerUnit(camera: Camera, surface: Surface): number {
  return fitScale(camera, surface) * camera.zoom;
}

/** Scene → pixel matrix in canvas order (y flipped). */
export function sceneToPixelMatrix(camera: Camera, surface: Surface): Mat2D {
  const s = pixelsPerUnit(camera, surface);
  return [
    s,
    0,
    0,
    -s,
    surface.width / 2 - camera.center[0] * s,
    surface.height / 2 + camera.center[1] * s,
  ];
}

export function toPixel(point: Vec2, camera: Camera, surface: Surface): Vec2 {
  const [a, , , d, e, f] = sceneToPixelMatrix(camera, surface);
  return [a * point[0] + e, d * point[1] + f];
}

export function toScene(pixel: Vec2, camera: Camera, surface: Surface): Vec2 {
  const s = pixelsPerUnit(camera, surface);
  return [
    camera.center[0] + (pixel[0] - surface.width / 2) / s,
    camera.center[1] - (pixel[1] - surface.height / 2) / s,
  ];
}

/** The Manim frame as a pixel rectangle. */
export function frameRect(
  camera: Camera,
  surface: Surface,
): { x: number; y: number; width: number; height: number } {
  const s = pixelsPerUnit(camera, surface);
  const [cx, cy] = camera.frameCenter ?? [0, 0];
  const [x, y] = toPixel(
    [cx - camera.frameWidth / 2, cy + camera.frameHeight / 2],
    camera,
    surface,
  );
  return { x, y, width: camera.frameWidth * s, height: camera.frameHeight * s };
}

/** The camera that looks through a frame of the scene — a scene camera's, `height` tall about
 * `center` — and sees nothing else: the frame fills the surface, as it fills the video. `aspect`
 * is the width of a frame over its height, the project's. */
export function cameraThrough(
  frame: { readonly center: Vec2; readonly height: number },
  aspect: number,
): Camera {
  return {
    frameWidth: frame.height * aspect,
    frameHeight: frame.height,
    frameCenter: [frame.center[0], frame.center[1]],
    center: [frame.center[0], frame.center[1]],
    zoom: 1,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Zoom by `factor` keeping the scene point under `pixel` where it is (cursor-anchored zoom). */
export function zoomAbout(camera: Camera, surface: Surface, pixel: Vec2, factor: number): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  if (zoom === camera.zoom) return camera;
  const anchor = toScene(pixel, camera, surface);
  const s = fitScale(camera, surface) * zoom;
  return {
    ...camera,
    zoom,
    center: [
      anchor[0] - (pixel[0] - surface.width / 2) / s,
      anchor[1] + (pixel[1] - surface.height / 2) / s,
    ],
  };
}

/** Move the view by a pixel delta (content follows the pointer). */
export function panByPixels(camera: Camera, surface: Surface, dx: number, dy: number): Camera {
  const s = pixelsPerUnit(camera, surface);
  return { ...camera, center: [camera.center[0] - dx / s, camera.center[1] + dy / s] };
}
