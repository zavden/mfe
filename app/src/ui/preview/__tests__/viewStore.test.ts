// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FIT_VIEW,
  isFitView,
  keptView,
  nearView,
  sameView,
  usePreviewView,
  viewFitting,
  viewThrough,
} from '../viewStore';

describe('the view of the Preview', () => {
  beforeEach(() => {
    usePreviewView.getState().fit();
    usePreviewView.getState().fit(true);
    usePreviewView.getState().setCameraView(false);
  });

  it('starts on the whole frame', () => {
    expect(usePreviewView.getState().view).toEqual({ center: [0, 0], zoom: 1 });
    expect(isFitView(usePreviewView.getState().view)).toBe(true);
  });

  it('takes a view, or the one that follows from the current', () => {
    const { setView } = usePreviewView.getState();
    setView({ center: [2, -1], zoom: 3 });
    expect(usePreviewView.getState().view).toEqual({ center: [2, -1], zoom: 3 });
    setView((current) => ({ center: current.center, zoom: current.zoom * 2 }));
    expect(usePreviewView.getState().view).toEqual({ center: [2, -1], zoom: 6 });
    expect(isFitView(usePreviewView.getState().view)).toBe(false);
  });

  it('goes back to the whole frame, which is never changed', () => {
    usePreviewView.getState().setView({ center: [5, 5], zoom: 0.5 });
    usePreviewView.getState().fit();
    expect(usePreviewView.getState().view).toBe(FIT_VIEW);
    expect(FIT_VIEW).toEqual({ center: [0, 0], zoom: 1 });
    // A pan alone is not the fit; nor is a zoom alone.
    expect(isFitView({ center: [0.5, 0], zoom: 1 })).toBe(false);
    expect(isFitView({ center: [0, 0], zoom: 1.5 })).toBe(false);
  });

  it('keeps a view of the picture apart, for the camera view', () => {
    const store = usePreviewView.getState();
    expect(store.cameraView).toBe(false);
    store.setCameraView(true);
    expect(usePreviewView.getState().cameraView).toBe(true);
    store.setView({ center: [1, 0], zoom: 2 }, true);
    store.setView((current) => ({ center: current.center, zoom: current.zoom * 2 }), true);
    expect(usePreviewView.getState().through).toEqual({ center: [1, 0], zoom: 4 });
    // The world's is another.
    expect(usePreviewView.getState().view).toBe(FIT_VIEW);
    store.setView({ center: [-3, 2], zoom: 0.5 });
    store.fit(true);
    expect(usePreviewView.getState().through).toBe(FIT_VIEW);
    expect(usePreviewView.getState().view).toEqual({ center: [-3, 2], zoom: 0.5 });
  });

  it('tells two views apart', () => {
    expect(sameView(FIT_VIEW, { center: [0, 0], zoom: 1 })).toBe(true);
    expect(sameView(FIT_VIEW, { center: [0, 0.1], zoom: 1 })).toBe(false);
    expect(sameView(FIT_VIEW, { center: [0, 0], zoom: 2 })).toBe(false);
  });
});

describe('a view through a frame of the camera', () => {
  it('is the kept view itself through Manim’s own frame', () => {
    const kept = { center: [1.5, -2] as [number, number], zoom: 3 };
    const manim = { center: [0, 0] as [number, number], height: 8 };
    expect(viewThrough(kept, manim)).toEqual(kept);
    expect(keptView(kept, manim)).toEqual(kept);
  });

  it('is about the frame’s centre, its pan in eighths of the frame’s height', () => {
    // A camera twice as close, at (3, 1): the fit looks at its centre.
    const frame = { center: [3, 1] as [number, number], height: 4 };
    expect(viewThrough(FIT_VIEW, frame)).toEqual({ center: [3, 1], zoom: 1 });
    // A pan of a unit is half a unit of this scene: the same part of the picture.
    expect(viewThrough({ center: [1, -2], zoom: 2 }, frame)).toEqual({ center: [3.5, 0], zoom: 2 });
    expect(keptView({ center: [3.5, 0], zoom: 2 }, frame)).toEqual({ center: [1, -2], zoom: 2 });
  });

  it('comes back from the scene’s view as it went', () => {
    const frame = { center: [-2.5, 0.75] as [number, number], height: 3 };
    const kept = { center: [0.4, -1.2] as [number, number], zoom: 1.25 };
    const back = keptView(viewThrough(kept, frame), frame);
    expect(back.center[0]).toBeCloseTo(0.4, 12);
    expect(back.center[1]).toBeCloseTo(-1.2, 12);
    expect(back.zoom).toBe(1.25);
  });
});

describe('the view that shows boxes whole', () => {
  /** Manim's frame at 16:9, and a canvas of the same shape: 100 px per unit at zoom 1. */
  const frame = { width: (8 * 16) / 9, height: 8 };
  const surface = { width: (800 * 16) / 9, height: 800 };
  const manim = { minX: -frame.width / 2, minY: -4, maxX: frame.width / 2, maxY: 4 };

  it('is the plain fit for Manim’s frame with no margin', () => {
    const view = viewFitting([manim], frame, surface, 0);
    expect(view.center).toEqual([0, 0]);
    expect(view.zoom).toBeCloseTo(1, 12);
  });

  it('keeps the margin free on every side', () => {
    // 40 px of 800 on each side: the 8 units get 720 px.
    const view = viewFitting([manim], frame, surface, 40);
    expect(view.center).toEqual([0, 0]);
    expect(view.zoom).toBeCloseTo(0.9, 12);
  });

  it('is centred on the boxes together, as close as the tighter side lets', () => {
    // A camera frame 4 tall about (8, 0) beside Manim's: wider in all, still 8 tall.
    const far = { minX: 8 - 32 / 9, minY: -2, maxX: 8 + 32 / 9, maxY: 2 };
    const view = viewFitting([manim, far], frame, surface, 0);
    const width = far.maxX - manim.minX;
    expect(view.center[0]).toBeCloseTo((far.maxX + manim.minX) / 2, 12);
    expect(view.center[1]).toBe(0);
    // The width rules: all of it across the canvas.
    expect(view.zoom).toBeCloseTo(surface.width / width / 100, 12);
  });

  it('is the plain fit with nothing to show, or nowhere to show it', () => {
    expect(viewFitting([], frame, surface, 10)).toBe(FIT_VIEW);
    expect(viewFitting([manim], frame, { width: 0, height: 0 }, 10)).toBe(FIT_VIEW);
    expect(viewFitting([{ minX: 1, minY: 1, maxX: 1, maxY: 1 }], frame, surface, 10)).toBe(
      FIT_VIEW,
    );
  });

  it('keeps half the canvas at least, however large the margin, and a zoom the view can have', () => {
    expect(viewFitting([manim], frame, surface, 5000).zoom).toBeCloseTo(0.5, 12);
    const tiny = { minX: 0, minY: 0, maxX: 1e-6, maxY: 1e-6 };
    expect(viewFitting([tiny], frame, surface, 0).zoom).toBe(64);
  });

  it('is told from another by more than a rounding', () => {
    const view = { center: [1, 2] as [number, number], zoom: 0.9 };
    expect(nearView(view, { center: [1 + 1e-9, 2], zoom: 0.9 + 1e-9 })).toBe(true);
    expect(nearView(view, { center: [1.001, 2], zoom: 0.9 })).toBe(false);
    expect(nearView(view, { center: [1, 2], zoom: 0.91 })).toBe(false);
  });
});
