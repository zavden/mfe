/* Where the preview's frame sits inside its stage: the largest rectangle of the project's aspect
 * ratio that fits the stage minus its padding, with every side and its position on whole device
 * pixels. The canvas fills that frame, so its bitmap (CSS size × dpr) maps 1:1 onto the screen
 * and the compositor resamples nothing: glyphs stay sharp and a one-pixel line is one row. The
 * stage itself may sit at a fractional position (the panels split the window into fractional
 * columns), so the frame is aligned in viewport coordinates, not relative to the stage. Pure. */

/** The shape of the stage inside its padding, width over height: the frame of the world view
 * (D190), which takes all of it — `alignedFrame` with this aspect is the stage's own box, on
 * whole device pixels. 16:9 for a stage with no room. */
export function stageAspect(stage: Pick<Rect, 'width' | 'height'>, padding: number): number {
  const width = stage.width - 2 * padding;
  const height = stage.height - 2 * padding;
  return width > 0 && height > 0 ? width / height : 16 / 9;
}

/** A rectangle in CSS pixels. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The frame's rectangle, relative to the stage's box (`position: absolute` inside it), for a
 * stage at `stage` (viewport coordinates), a padding on every side, the frame's width / height
 * ratio and the device pixel ratio. Sides are rounded down to device pixels (each on its own: the
 * aspect may be off by under a pixel, which the camera's letterbox absorbs); the frame is centred
 * and then moved by under a pixel so that its viewport edges are whole device pixels. */
export function alignedFrame(stage: Rect, padding: number, aspect: number, dpr: number): Rect {
  const scale = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 16 / 9;
  const availableWidth = Math.max(0, stage.width - 2 * padding);
  const availableHeight = Math.max(0, stage.height - 2 * padding);
  // Whole device pixels, never more than the room there is: the limiting side first, the other
  // from it (so the aspect is off by under a device pixel).
  const whole = (v: number) => Math.floor(v * scale + 1e-9) / scale;
  let width: number;
  let height: number;
  if (availableWidth / ratio > availableHeight) {
    height = whole(availableHeight);
    width = whole(height * ratio);
  } else {
    width = whole(availableWidth);
    height = whole(width / ratio);
  }
  // Centred in the stage, then snapped so that the viewport edge lands on the pixel grid.
  const snap = (stageEdge: number, offset: number) =>
    Math.round((stageEdge + offset) * scale) / scale - stageEdge;
  return {
    left: snap(stage.left, padding + (availableWidth - width) / 2),
    top: snap(stage.top, padding + (availableHeight - height) / 2),
    width,
    height,
  };
}
