// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import {
  fitView,
  isFitView,
  MAX_ZOOM,
  MIN_ZOOM,
  openingView,
  pannedView,
  preferredLayout,
  steppedView,
  viewBoxOf,
  viewScale,
  zoomedView,
  ZOOM_STEP,
  type DrawingBox,
} from '../pairView';

// A drawing 8 wide and 20 tall about the origin, in an element of 400 × 400 px: at the fit the
// height binds, 20 px a unit.
const FRAME: DrawingBox = { left: -4, right: 4, top: 10, bottom: -10 };
const SURFACE = { width: 400, height: 400 };
const FIT = fitView(FRAME);

describe('the view of the drawing', () => {
  it('fits the whole drawing in the element at zoom 1, centred', () => {
    expect(FIT).toEqual({ center: [0, 0], zoom: 1 });
    expect(isFitView(FRAME, FIT)).toBe(true);
    expect(viewScale(FRAME, FIT, SURFACE)).toBe(20);
    // The element is wider than the drawing: it shows 20 units across, the drawing in its middle.
    expect(viewBoxOf(FRAME, FIT, SURFACE)).toEqual([-10, -10, 20, 20]);
    // A drawing off the origin is centred on its own middle (the viewBox is y down).
    const off: DrawingBox = { left: 0, right: 8, top: 30, bottom: 10 };
    expect(fitView(off).center).toEqual([4, 20]);
    expect(viewBoxOf(off, fitView(off), SURFACE)).toEqual([-6, -30, 20, 20]);
  });

  it('zooms about the pointer: the point under it stays under it', () => {
    // The pointer 100 px right of and 100 px above the middle: the point (5, 5).
    const pixel: [number, number] = [300, 100];
    const near = zoomedView(FRAME, FIT, SURFACE, pixel, 2);
    expect(near.zoom).toBe(2);
    expect(viewScale(FRAME, near, SURFACE)).toBe(40);
    const [x, y, width, height] = viewBoxOf(FRAME, near, SURFACE);
    expect(x + (300 / 400) * width).toBeCloseTo(5);
    expect(-(y + (100 / 400) * height)).toBeCloseTo(5);
    // And back.
    const back = zoomedView(FRAME, near, SURFACE, pixel, 0.5);
    expect(back.zoom).toBe(1);
    expect(back.center[0]).toBeCloseTo(0);
    expect(back.center[1]).toBeCloseTo(0);
    expect(isFitView(FRAME, near)).toBe(false);
  });

  it('keeps the zoom within its bounds, and the same view at a bound', () => {
    const far = zoomedView(FRAME, FIT, SURFACE, [200, 200], 0.01);
    expect(far.zoom).toBe(MIN_ZOOM);
    expect(zoomedView(FRAME, far, SURFACE, [0, 0], 0.5)).toBe(far);
    const close = zoomedView(FRAME, FIT, SURFACE, [200, 200], 1000);
    expect(close.zoom).toBe(MAX_ZOOM);
    expect(zoomedView(FRAME, close, SURFACE, [0, 0], 2)).toBe(close);
  });

  it('steps about the middle of the element with the − and + keys', () => {
    const view = { center: [1, -3] as [number, number], zoom: 2 };
    const nearer = steppedView(FRAME, view, SURFACE, ZOOM_STEP);
    expect(nearer.zoom).toBeCloseTo(2.5);
    expect(nearer.center[0]).toBeCloseTo(1);
    expect(nearer.center[1]).toBeCloseTo(-3);
    expect(steppedView(FRAME, nearer, SURFACE, 1 / ZOOM_STEP).zoom).toBeCloseTo(2);
  });

  it('pans with the pointer: the drawing follows it', () => {
    const view = { center: [0, 0] as [number, number], zoom: 2 };
    // 40 px a unit: 80 px to the right and 40 px down move the drawing 2 right and 1 down.
    const moved = pannedView(FRAME, view, SURFACE, 80, 40);
    expect(moved.zoom).toBe(2);
    expect(moved.center[0]).toBeCloseTo(-2);
    expect(moved.center[1]).toBeCloseTo(1);
  });

  it('never moves the drawing out of sight: the centre stays inside it', () => {
    const view = { center: [0, 0] as [number, number], zoom: 4 };
    expect(pannedView(FRAME, view, SURFACE, -100000, 0).center).toEqual([4, 0]);
    expect(pannedView(FRAME, view, SURFACE, 100000, 100000).center).toEqual([-4, 10]);
    // Zooming about a corner far outside does not either.
    const corner = zoomedView(FRAME, { center: [4, 10], zoom: 1 }, SURFACE, [400, 0], 0.5);
    expect(corner.center[0]).toBeLessThanOrEqual(4);
    expect(corner.center[1]).toBeLessThanOrEqual(10);
  });

  it('shows the same part of the drawing in an element of another size', () => {
    const view = { center: [1, 2] as [number, number], zoom: 2 };
    const small = viewBoxOf(FRAME, view, SURFACE);
    const large = viewBoxOf(FRAME, view, { width: 800, height: 800 });
    expect(large).toEqual(small);
    expect(viewScale(FRAME, view, { width: 800, height: 800 })).toBe(80);
  });
});

describe('openingView', () => {
  // The text of the drawing: 0.25 units, 5 px at the fit.
  const TEXT = 0.25;
  const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
    minX,
    minY,
    maxX,
    maxY,
  });

  it('frames what takes part as large as the element shows it whole, with its margin', () => {
    // Two lines of the source and one of the target: 6 wide, 8 tall, about (0, 1).
    const focus = box(-3, -3, 3, 5);
    const view = openingView(FRAME, focus, SURFACE, TEXT, 1);
    // 8 + 2 by 10 + 2 units in 400 px: 33.3 px a unit, the height binding.
    expect(viewScale(FRAME, view, SURFACE)).toBeCloseTo(400 / 10);
    expect(view.zoom).toBeCloseTo(2);
    expect(view.center).toEqual([0, 1]);
  });

  it('opens on the whole drawing when what takes part is about all of it, or nothing', () => {
    expect(openingView(FRAME, box(-4, -10, 4, 10), SURFACE, TEXT, 0.5)).toEqual(FIT);
    expect(openingView(FRAME, box(-4, -9.5, 4, 9.5), SURFACE, TEXT, 0.2)).toEqual(FIT);
    expect(openingView(FRAME, null, SURFACE, TEXT, 1)).toEqual(FIT);
    // A drawing that is not measured yet.
    expect(openingView(FRAME, box(0, 0, 1, 1), { width: 0, height: 0 }, TEXT, 1)).toEqual(FIT);
    // A focus larger than the drawing never opens it zoomed out.
    expect(openingView(FRAME, box(-40, -40, 40, 40), SURFACE, TEXT, 1)).toEqual(FIT);
  });

  it('does not open nearer than a text of 32 px', () => {
    // A single glyph takes part: the element could show it 300 px tall.
    const view = openingView(FRAME, box(0, 0, 0.2, 0.3), SURFACE, TEXT, 0.5);
    expect(viewScale(FRAME, view, SURFACE) * TEXT).toBeCloseTo(32);
    expect(view.center[0]).toBeCloseTo(0.1);
    // A drawing whose text is that large at the fit opens on the whole of it.
    expect(openingView(FRAME, box(0, 0, 0.2, 0.3), SURFACE, 2, 0.5)).toEqual(FIT);
  });
});

describe('preferredLayout', () => {
  const TEXT = 0.25;
  const whole = (frame: DrawingBox) => ({
    frame,
    focus: { minX: frame.left, maxX: frame.right, minY: frame.bottom, maxY: frame.top },
    margin: 0,
  });
  /** Two formulas `w` × `h` stacked (a gap of 1 between them) and side by side. */
  const both = (w: number, h: number) => ({
    stacked: whole({ left: -w / 2, right: w / 2, top: h + 0.5, bottom: -h - 0.5 }),
    side: whole({ left: -w - 0.5, right: w + 0.5, top: h / 2, bottom: -h / 2 }),
  });
  const element = { width: 660, height: 400, maxHeight: 560 };

  it('stacks wide formulas and puts tall ones side by side: whichever draws them larger', () => {
    // 8 × 1: stacked the drawing is 8 × 3 (82 px a unit), side by side 17 × 1 (39 px).
    expect(preferredLayout(both(8, 1), element, TEXT)).toBe('stacked');
    // 4 × 6: stacked it is 4 × 13 (43 px a unit, by the height), side by side 9 × 6 (73 px).
    expect(preferredLayout(both(4, 6), element, TEXT)).toBe('side');
  });

  it('stays stacked unless side by side is clearly larger', () => {
    // 4 × 2.8: stacked 4 × 6.6 → 84.8 px a unit in a height of 560; side by side 9 × 2.8 → 73.
    expect(preferredLayout(both(4, 2.8), element, TEXT)).toBe('stacked');
    // 4 × 3.3: 73.7 px against 73.3: no tenth more.
    expect(preferredLayout(both(4, 3.3), element, TEXT)).toBe('stacked');
  });

  it('stays stacked where stacked draws the text large: beyond 32 px, larger is worth nothing', () => {
    // 4 × 6 again: 43 px a unit stacked, 73 side by side. A text of 0.25 is 11 px stacked and
    // 18 side by side; one of 1 is 43 px stacked already.
    expect(preferredLayout(both(4, 6), element, 0.25)).toBe('side');
    expect(preferredLayout(both(4, 6), element, 1)).toBe('stacked');
    // 30 px stacked: the 32 px that count side by side are no tenth more.
    expect(preferredLayout(both(4, 6), element, 0.7)).toBe('stacked');
    // 26 px stacked: they are.
    expect(preferredLayout(both(4, 6), element, 0.6)).toBe('side');
    // Two glyphs over one, as `xx → x²`: both layouts draw them a hand tall.
    expect(preferredLayout(both(0.5, 0.3), element, 0.25)).toBe('stacked');
  });

  it('compares what takes part, not the whole drawings', () => {
    const candidates = both(4, 6);
    // Stacked, what takes part is the last line of the source and the first of the target.
    const near = {
      ...candidates,
      stacked: { ...candidates.stacked, focus: { minX: -2, maxX: 2, minY: -1.5, maxY: 1.5 } },
    };
    expect(preferredLayout(candidates, element, TEXT)).toBe('side');
    expect(preferredLayout(near, element, 0.05)).toBe('stacked');
  });

  it('takes the element as it is when its height is not the drawing’s to choose', () => {
    // A dialog given a size: 660 × 2000 for either layout. Stacked, 4 × 13 fits 153.8 px a
    // unit by its height… and 165 by its width: 153.8; side by side 9 × 6 fits 73.3.
    const sized = { width: 660, height: 2000, maxHeight: null };
    expect(preferredLayout(both(4, 6), sized, 0.01)).toBe('stacked');
    expect(preferredLayout(both(4, 6), element, 0.01)).toBe('side');
  });
});
