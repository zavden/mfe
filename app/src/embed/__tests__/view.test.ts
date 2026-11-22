// @vitest-environment node
/* Where the scene lands on a canvas: the whole frame as the Preview shows it at 100%, a region
 * fitted whole, the device and CSS pixels both ways, and a canvas's bitmap on whole pixels. */
import { describe, expect, it } from 'vitest';
import { bitmapSize, cameraBox, fitView, frameBox, padBox } from '../view';

const meta = { width: 1920, height: 1080 };

describe('a view', () => {
  it('shows the whole frame by default, as the Preview at 100%', () => {
    const view = fitView(meta, { width: 1280, height: 720 }, 2);
    expect(view.camera).toEqual({ frameWidth: 128 / 9, frameHeight: 8, center: [0, 0], zoom: 1 });
    expect(view.scale).toBeCloseTo(90, 9);
    expect(view.toPixel([0, 0])).toEqual([640, 360]);
    expect(view.toCss([0, 0])).toEqual([320, 180]);
    expect(view.toScene([1280, 720])).toEqual([64 / 9, -4]);
  });

  it('fits a region whole and centred', () => {
    const region = { minX: -1, minY: -0.25, maxX: 1, maxY: 0.25 };
    const view = fitView(meta, { width: 400, height: 200 }, 1, region);
    // 2 × 0.5 units into 400 × 200: the width limits, 200 pixels a unit.
    expect(view.scale).toBeCloseTo(200, 9);
    expect(view.toPixel([-1, 0])).toEqual([0, 100]);
    expect(view.toPixel([1, 0.25])).toEqual([400, 50]);
    expect(view.boxToCss(region)).toEqual({ left: 0, top: 50, width: 400, height: 100 });
  });

  it('goes from CSS pixels to the scene and back', () => {
    const view = fitView(meta, { width: 300, height: 300 }, 1.5, padBox(frameBox(meta), 1));
    const point: [number, number] = [1.25, -0.75];
    const [x, y] = view.fromCss(view.toCss(point));
    expect(x).toBeCloseTo(point[0], 9);
    expect(y).toBeCloseTo(point[1], 9);
  });

  it('shows the frame of a scene camera whole, and cuts at it', () => {
    // A camera 4 units tall about (3, 1): a frame of 64/9 × 4, twice as close as Manim's.
    const filmed = cameraBox(meta, { center: [3, 1], height: 4 });
    expect(filmed.minY).toBe(-1);
    expect(filmed.maxY).toBe(3);
    expect(filmed.maxX - filmed.minX).toBeCloseTo(64 / 9, 12);
    expect((filmed.minX + filmed.maxX) / 2).toBeCloseTo(3, 12);
    const view = fitView(meta, { width: 1280, height: 720 }, 1, undefined, filmed);
    expect(view.scale).toBeCloseTo(180, 9);
    const [x, y] = view.toPixel([3, 1]);
    expect(x).toBeCloseTo(640, 9);
    expect(y).toBeCloseTo(360, 9);
    expect(view.camera.frameHeight).toBe(4);
    expect(view.camera.frameCenter![0]).toBeCloseTo(3, 12);
    expect(view.camera.frameCenter![1]).toBe(1);
    expect(view.camera.zoom).toBeCloseTo(1, 12);
    // Manim's own frame is the box of a camera that never moved: the same view as ever.
    expect(cameraBox(meta, { center: [0, 0], height: 8 })).toEqual(frameBox(meta));
    expect(
      fitView(meta, { width: 1280, height: 720 }, 2, undefined, frameBox(meta)).camera,
    ).toEqual(fitView(meta, { width: 1280, height: 720 }, 2).camera);
    // A region inside it is shown as before, and the cut stays the camera's frame.
    const region = { minX: 2, minY: 0.5, maxX: 4, maxY: 1.5 };
    const part = fitView(meta, { width: 400, height: 200 }, 1, region, filmed);
    expect(part.scale).toBeCloseTo(200, 9);
    expect(part.camera.frameHeight).toBe(4);
    expect(part.camera.center).toEqual([3, 1]);
  });

  it('shows the whole frame for a region with no size', () => {
    const view = fitView(meta, { width: 320, height: 180 }, 1, {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    });
    expect(view.camera.zoom).toBe(1);
    expect(view.camera.center).toEqual([0, 0]);
  });
});

describe('a canvas bitmap', () => {
  it('is its CSS size on whole device pixels, at least one', () => {
    expect(bitmapSize(612.5, 344.5, 2)).toEqual({ width: 1225, height: 689 });
    expect(bitmapSize(0, 0, 1)).toEqual({ width: 1, height: 1 });
    expect(bitmapSize(100, 50, Number.NaN)).toEqual({ width: 100, height: 50 });
  });
});
