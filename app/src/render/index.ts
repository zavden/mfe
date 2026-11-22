/* Public API of the renderer: the contract types plus the Canvas 2D implementation. */
export type * from './types';
export {
  cameraThrough,
  clampZoom,
  fitScale,
  frameRect,
  MAX_ZOOM,
  MIN_ZOOM,
  panByPixels,
  pixelsPerUnit,
  sceneToPixelMatrix,
  toPixel,
  toScene,
  zoomAbout,
} from './camera';
export { createCanvasRenderer, MITER_LIMIT, STROKE_UNIT, traceContours } from './canvasRenderer';
export { containsPoint, flattenContour } from './hitTest';
export type { FillRule, FlatContour } from './hitTest';
