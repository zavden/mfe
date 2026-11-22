// @vitest-environment node
/* How a frame of a video is drawn (`frames.ts`): through Manim's still frame, or through the
 * scene camera's frame of its instant (D190). */
import { describe, expect, it, vi } from 'vitest';
import type { Camera, Renderer } from '../../../render';
import type { SceneEvaluator } from '../../../scene';
import { exportCamera, frameDrawer, planFrames } from '../frames';

/** A renderer and an evaluator that record what they were asked. */
function recording() {
  const cameras: Camera[] = [];
  const times: number[] = [];
  const renderer = {
    draw: vi.fn((_ctx, _drawables, camera: Camera) => void cameras.push(camera)),
  } as unknown as Renderer;
  const evaluator = {
    duration: 10,
    evaluate: (t: number) => {
      times.push(t);
      return [];
    },
  } as unknown as SceneEvaluator;
  return { renderer, evaluator, cameras, times };
}

const ctx = {} as CanvasRenderingContext2D;
const output = { width: 1920, height: 1080, fps: 10, background: '#000000' };

describe('the camera of a video frame', () => {
  it('is Manim’s whole frame, centred, for a scene without a camera', () => {
    expect(exportCamera(1920, 1080)).toEqual({
      frameWidth: (8 * 1920) / 1080,
      frameHeight: 8,
      center: [0, 0],
      zoom: 1,
    });
    const { renderer, evaluator, cameras, times } = recording();
    const draw = frameDrawer(renderer, evaluator, output, 2);
    draw(ctx, 0);
    draw(ctx, 5);
    expect(times).toEqual([2, 2.5]);
    expect(cameras).toEqual([exportCamera(1920, 1080), exportCamera(1920, 1080)]);
    // The same without a framing as with none.
    const again = recording();
    frameDrawer(again.renderer, again.evaluator, { ...output, framing: null }, 0)(ctx, 0);
    expect(again.cameras).toEqual([exportCamera(1920, 1080)]);
  });

  it('is the scene camera’s frame of each instant, which fills the picture', () => {
    const { renderer, evaluator, cameras, times } = recording();
    // A camera that goes right a unit a second and closes in from 8 to 4 units in 4 s.
    const framing = (t: number) => ({ center: [t, 0] as [number, number], height: 8 - t });
    const draw = frameDrawer(renderer, evaluator, { ...output, framing }, 1);
    draw(ctx, 0);
    draw(ctx, 10);
    draw(ctx, 30);
    expect(times).toEqual([1, 2, 4]);
    expect(cameras.map((c) => [c.center, c.frameCenter, c.frameHeight, c.zoom])).toEqual([
      [[1, 0], [1, 0], 7, 1],
      [[2, 0], [2, 0], 6, 1],
      [[4, 0], [4, 0], 4, 1],
    ]);
    // The frame has the shape of the video, whatever its size.
    for (const camera of cameras) {
      expect(camera.frameWidth / camera.frameHeight).toBeCloseTo(1920 / 1080, 12);
    }
    const tall = recording();
    frameDrawer(
      tall.renderer,
      tall.evaluator,
      { ...output, width: 1080, height: 1920, framing },
      0,
    )(ctx, 0);
    expect(tall.cameras[0]!.frameWidth).toBeCloseTo(4.5, 12);
    expect(tall.cameras[0]!.frameHeight).toBe(8);
  });
});

describe('the frames of an export', () => {
  it('are those of the range, or of the scene', () => {
    expect(planFrames(4, null, 10)).toEqual({ start: 0, total: 40 });
    expect(planFrames(4, [1, 2.5], 10)).toEqual({ start: 1, total: 15 });
    expect(() => planFrames(4, [1, 1.01], 10)).toThrow('shorter than a frame');
  });
});
