// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  cameraThrough,
  clampZoom,
  frameRect,
  MAX_ZOOM,
  MIN_ZOOM,
  panByPixels,
  pixelsPerUnit,
  sceneToPixelMatrix,
  toPixel,
  toScene,
  zoomAbout,
  type Camera,
} from '..';

const camera: Camera = { frameWidth: 16, frameHeight: 8, center: [0, 0], zoom: 1 };
const surface = { width: 1600, height: 900 };

describe('camera', () => {
  it('fits the whole frame, letterboxed on the longer side', () => {
    // 1600 / 16 = 100 px/unit; 900 / 8 = 112.5 → the width limits.
    expect(pixelsPerUnit(camera, surface)).toBeCloseTo(100);
    const rect = frameRect(camera, surface);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(1600);
    expect(rect.height).toBeCloseTo(800);
    expect(rect.y).toBeCloseTo(50);
  });

  it('has its frame about the origin, or about the point a scene camera moved it to', () => {
    // The view is at the origin and sees twice the frame: the frame is a quarter of the surface,
    // in the middle, or three units to the right and one up.
    const out: Camera = { ...camera, zoom: 0.5 };
    const still = frameRect(out, surface);
    expect([still.x, still.y, still.width, still.height]).toEqual([400, 250, 800, 400]);
    const moved = frameRect({ ...out, frameCenter: [3, 1] }, surface);
    expect([moved.x, moved.y, moved.width, moved.height]).toEqual([550, 200, 800, 400]);
  });

  it('looks through a frame of the scene, which then fills the surface', () => {
    // A scene camera 4 units tall about (3, 1), in a 16:9 project.
    const through = cameraThrough({ center: [3, 1], height: 4 }, 16 / 9);
    expect(through.frameHeight).toBe(4);
    expect(through.frameWidth).toBeCloseTo(64 / 9);
    expect(through.zoom).toBe(1);
    const video = { width: 1920, height: 1080 };
    // Twice the pixels per unit of the frame of 8, and the frame's centre in the middle.
    expect(pixelsPerUnit(through, video)).toBeCloseTo(270);
    expect(toPixel([3, 1], through, video)).toEqual([960, 540]);
    const rect = frameRect(through, video);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(1920);
    expect(rect.height).toBeCloseTo(1080);
    // It is a camera of its own: the frame it was made from can change after.
    const frame = { center: [0, 0] as [number, number], height: 8 };
    const made = cameraThrough(frame, 2);
    frame.center[0] = 5;
    expect(made.center).toEqual([0, 0]);
    expect(made.frameCenter).toEqual([0, 0]);
  });

  it('maps the scene origin to the canvas centre and flips y', () => {
    expect(toPixel([0, 0], camera, surface)).toEqual([800, 450]);
    const up = toPixel([0, 1], camera, surface);
    expect(up[1]).toBeCloseTo(350);
    const right = toPixel([1, 0], camera, surface);
    expect(right[0]).toBeCloseTo(900);
  });

  it('toScene inverts toPixel under pan and zoom', () => {
    const view: Camera = { ...camera, center: [1.5, -2], zoom: 2.5 };
    for (const p of [
      [0, 0],
      [3, 1],
      [-4, 2.5],
    ] as const) {
      const back = toScene(toPixel([p[0], p[1]], view, surface), view, surface);
      expect(back[0]).toBeCloseTo(p[0]);
      expect(back[1]).toBeCloseTo(p[1]);
    }
  });

  it('sceneToPixelMatrix is a scale and a shift with y flipped: its six coefficients', () => {
    // 100 px a unit at zoom 1, so 300 here; the centre [1, 2] is the middle of the surface, which
    // puts the origin at 800 - 1 × 300 across and 450 + 2 × 300 down. No shear: a canvas given a
    // matrix takes all six, whatever `toPixel` reads of them.
    const view: Camera = { ...camera, center: [1, 2], zoom: 3 };
    expect(sceneToPixelMatrix(view, surface)).toEqual([300, 0, 0, -300, 500, 1050]);
    expect(toPixel([1, 2], view, surface)).toEqual([800, 450]);
    expect(toPixel([2, -1], view, surface)).toEqual([1100, 1350]);
  });

  it('zoomAbout keeps the point under the cursor fixed', () => {
    const pixel: [number, number] = [1200, 300];
    const before = toScene(pixel, camera, surface);
    const zoomed = zoomAbout(camera, surface, pixel, 2);
    expect(zoomed.zoom).toBe(2);
    const after = toScene(pixel, zoomed, surface);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it('clamps the zoom range', () => {
    expect(clampZoom(1e9)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(zoomAbout({ ...camera, zoom: MAX_ZOOM }, surface, [0, 0], 2)).toEqual({
      ...camera,
      zoom: MAX_ZOOM,
    });
  });

  it('panByPixels moves the content with the pointer', () => {
    const panned = panByPixels(camera, surface, 100, 50);
    // Content moved right/down → the view centre moved left/up... in scene coordinates.
    expect(panned.center[0]).toBeCloseTo(-1);
    expect(panned.center[1]).toBeCloseTo(0.5);
  });
});
