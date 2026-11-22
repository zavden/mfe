/* The block dialog's own preview (R2, D75): the block's clip alone, looping from a little before
 * the block to a little after it, drawn by the same scene engine as the preview in a canvas of
 * its own. Pure: the span it loops over, where a clock lands in it, how far through the block a
 * time is, and a camera that frames a box. */
import type { Box } from '../../geom';
import {
  FRAME_HEIGHT,
  frameWidth,
  type Clip,
  type ClipAction,
  type ProjectMeta,
} from '../../model';
import type { Camera } from '../../render';

export interface TimeSpan {
  start: number;
  end: number;
}

/** Seconds shown before and after the block, so that the loop shows what it starts from and
 * what it leaves (inside the clip). */
export const SPAN_PAD = 0.3;

/** The scene seconds the loop runs over: the block's span padded by `SPAN_PAD`, within its clip;
 * never empty. */
export function previewSpan(clip: Clip, action: ClipAction, pad = SPAN_PAD): TimeSpan {
  // To the microsecond, so that the playhead's bounds read as the times they are.
  const round = (t: number) => Math.round(t * 1e6) / 1e6;
  const start = round(Math.max(clip.start, clip.start + action.start - pad));
  const end = round(Math.min(clip.end, clip.start + action.start + action.duration + pad));
  return { start, end: Math.max(end, start + 0.001) };
}

/** The seconds a looping preview has played when the frame stamped `now` comes, having started
 * at `startedAt` (both by the clock of `performance.now()`). The browser stamps a frame with the
 * instant it began, which may be before the preview started in that same frame: no time has
 * passed then, and the loop is at its start — a moment before it would be its end. */
export function playedSeconds(now: number, startedAt: number): number {
  return Math.max(0, now - startedAt) / 1000;
}

/** Where a clock that has run `seconds` since the span's start lands in it, looping. */
export function loopTime(seconds: number, span: TimeSpan): number {
  const length = span.end - span.start;
  const into = ((seconds % length) + length) % length;
  return span.start + into;
}

/** How far through the block the scene time `time` is: 0 before it, 1 after it. */
export function blockProgress(time: number, clip: Clip, action: ClipAction): number {
  if (action.duration <= 0) return time >= clip.start + action.start ? 1 : 0;
  const t = (time - clip.start - action.start) / action.duration;
  return Math.min(1, Math.max(0, t));
}

/** The zooms the block preview frames its clip at: closer than the whole frame would leave a
 * small formula tiny; much closer, a single glyph would fill it. */
const FIT_ZOOM = { min: 0.5, max: 8 };

/** A camera that frames `box` in the middle of the canvas with `margin` (a fraction of the box)
 * around it, within `FIT_ZOOM`; the whole frame when there is no box. */
export function fitCamera(box: Box | null, meta: ProjectMeta, margin = 0.35): Camera {
  const width = frameWidth(meta);
  const camera: Camera = { frameWidth: width, frameHeight: FRAME_HEIGHT, center: [0, 0], zoom: 1 };
  if (!box || !Number.isFinite(box.minX) || box.maxX <= box.minX || box.maxY <= box.minY) {
    return camera;
  }
  const w = (box.maxX - box.minX) * (1 + margin);
  const h = (box.maxY - box.minY) * (1 + margin);
  const zoom = Math.min(width / w, FRAME_HEIGHT / h);
  return {
    ...camera,
    center: [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2],
    zoom: Math.min(FIT_ZOOM.max, Math.max(FIT_ZOOM.min, zoom)),
  };
}
