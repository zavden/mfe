/* Frame timing of a video export (docs/ARCHITECTURE.md §7 and §8).
 *
 * The video has `round((r1 − r0) · fps)` frames; frame k shows the scene at `r0 + k / fps`. The
 * last frame of the whole scene is therefore at `duration − 1 / fps`: the end of the scene
 * (inclusive in the evaluator) is where the video stops, not a frame of it. */

/** The part of the scene to export, clamped to [0, duration]; null = the whole scene. */
export function resolveRange(duration: number, range: [number, number] | null): [number, number] {
  if (!range) return [0, duration];
  const start = Math.min(Math.max(range[0], 0), duration);
  const end = Math.min(Math.max(range[1], start), duration);
  return [start, end];
}

export function totalFrames(start: number, end: number, fps: number): number {
  return Math.max(0, Math.round((end - start) * fps));
}

/** Scene time of frame `k`. */
export function frameTime(k: number, start: number, fps: number): number {
  return start + k / fps;
}

/** Presentation timestamp of frame `k` in microseconds (what WebCodecs and muxers use). Rounded
 * from `k / fps`, so the gaps are 33333/33334 µs at 30 fps but the sum never drifts. */
export function timestampUs(k: number, fps: number): number {
  return Math.round((k * 1_000_000) / fps);
}

/** Duration of frame `k`: the distance to the next frame's timestamp. The last frame ends at
 * exactly `timestampUs(frames, fps)`, which is what makes the file last `frames / fps`. */
export function frameDurationUs(k: number, fps: number): number {
  return timestampUs(k + 1, fps) - timestampUs(k, fps);
}

/** Distance between forced keyframes: about every 2 s. */
export function keyFrameInterval(fps: number): number {
  return Math.max(1, Math.round(2 * fps));
}
