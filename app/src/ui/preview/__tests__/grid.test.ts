// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  formatGridStep,
  GRID_STEPS,
  gridLines,
  gridSnapDelta,
  isGridAnchor,
  isGridStep,
  MAX_GRID_LINES,
  stepGrid,
} from '../grid';

const frame = { minX: -7.111111, minY: -4, maxX: 7.111111, maxY: 4 };

describe('grid steps', () => {
  it('go from 2 units down to 0.1, one notch at a time, and stop at the ends', () => {
    expect(GRID_STEPS).toEqual([2, 1, 0.5, 0.25, 0.1]);
    expect(stepGrid(1, 1)).toBe(0.5);
    expect(stepGrid(1, -1)).toBe(2);
    expect(stepGrid(2, -1)).toBe(2);
    expect(stepGrid(0.1, 1)).toBe(0.1);
    expect(formatGridStep(0.25)).toBe('0.25');
    expect(formatGridStep(1)).toBe('1');
  });

  it('recognise a stored step or anchor', () => {
    expect(isGridStep(0.5)).toBe(true);
    expect(isGridStep(0.3)).toBe(false);
    expect(isGridStep('1')).toBe(false);
    expect(isGridAnchor('edges')).toBe(true);
    expect(isGridAnchor('corner')).toBe(false);
  });
});

describe('gridLines', () => {
  it('lists the multiples of the step inside the frame, the origin among them', () => {
    expect(gridLines(frame, 2)).toEqual({ x: [-6, -4, -2, 0, 2, 4, 6], y: [-4, -2, 0, 2, 4] });
    expect(gridLines(frame, 0.5).x).toHaveLength(29); // -7 … 7
    expect(gridLines(frame, 0.5).y).toHaveLength(17); // -4 … 4, the edges included
    expect(gridLines(frame, 0.1).x[71]).toBe(0); // round6 keeps the multiples exact
    expect(gridLines(frame, 0.1).x).toContain(0.3);
  });

  it('draws nothing without a positive step', () => {
    expect(gridLines(frame, 0)).toEqual({ x: [], y: [] });
    expect(gridLines(frame, -1)).toEqual({ x: [], y: [] });
  });

  // A camera may look anywhere: its centre is any finite number, and the part of the world it
  // shows is the frame here. Past 2^53 a multiple of the step plus one is the same multiple
  // (B-12 of the final audit: the loop that stepped it never ended, and the tab hung).
  it('ends for a frame so far out that the multiples of the step cannot be told apart', () => {
    const far = { minX: 9999999999999992, minY: -4.5, maxX: 10000000000000008, maxY: 4.5 };
    const { x, y } = gridLines(far, 0.1);
    expect(x.length).toBeGreaterThan(0);
    expect(x.length).toBeLessThanOrEqual(MAX_GRID_LINES);
    expect(x.every((line) => line >= far.minX && line <= far.maxX)).toBe(true);
    expect(y).toHaveLength(91); // -4.5 … 4.5, as near the origin
    for (const step of GRID_STEPS) {
      expect(gridLines(far, step).x.length).toBeLessThanOrEqual(MAX_GRID_LINES);
    }
  });

  it('has MAX_GRID_LINES on an axis at most: more are thinned evenly, the origin’s kept', () => {
    // A million units across: ten million lines at 0.1.
    const wide = { minX: -500000, minY: -4, maxX: 500000, maxY: 4 };
    const { x, y } = gridLines(wide, 0.1);
    expect(x.length).toBeLessThanOrEqual(MAX_GRID_LINES);
    expect(x.length).toBeGreaterThan(MAX_GRID_LINES / 2);
    expect(x).toContain(0);
    // One of every 1221 multiples, 122.1 units apart, from one edge of the frame to the other.
    const gaps = new Set(x.slice(1).map((line, i) => Math.round((line - x[i]!) * 1e6) / 1e6));
    expect([...gaps]).toEqual([122.1]);
    expect(x[0]! - wide.minX).toBeLessThan(122.1);
    expect(wide.maxX - x.at(-1)!).toBeLessThan(122.1);
    expect(y).toHaveLength(81); // the other axis is not thinned
    // At the limit itself nothing is thinned.
    const most = gridLines({ minX: 0, minY: 0, maxX: MAX_GRID_LINES - 1, maxY: 0 }, 1).x;
    expect(most).toHaveLength(MAX_GRID_LINES);
    expect(most.slice(0, 3)).toEqual([0, 1, 2]);
    expect(gridLines({ minX: 0, minY: 0, maxX: MAX_GRID_LINES, maxY: 0 }, 1).x).toHaveLength(
      MAX_GRID_LINES / 2 + 1,
    );
  });

  it('ends for a frame of any size, and has no line where a bound is no number', () => {
    const vast = gridLines({ minX: -1e300, minY: NaN, maxX: 1e300, maxY: 4 }, 0.1);
    expect(vast.x.length).toBeLessThanOrEqual(MAX_GRID_LINES);
    expect(vast.x).toContain(0);
    expect(vast.y).toEqual([]);
    const endless = { minX: -Infinity, minY: 0, maxX: Infinity, maxY: Infinity };
    expect(gridLines(endless, 1)).toEqual({ x: [], y: [] });
    // A frame turned inside out holds nothing.
    expect(gridLines({ minX: 3, minY: 0, maxX: -3, maxY: 0 }, 1).x).toEqual([]);
  });
});

describe('gridSnapDelta', () => {
  it('moves the centre of the box onto the nearest node', () => {
    expect(gridSnapDelta({ minX: 0.3, minY: -0.9, maxX: 2.3, maxY: 0.1 }, 1, 'center')).toEqual([
      -0.3, 0.4,
    ]);
    expect(gridSnapDelta({ minX: 0.9, minY: 0, maxX: 2.3, maxY: 1 }, 0.5, 'center')).toEqual([
      -0.1, 0,
    ]);
    expect(gridSnapDelta({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, 0.25, 'center')).toEqual([0, 0]);
  });

  it('moves whichever edge is nearer to a line, the lower one on a tie', () => {
    // Left edge 1.2 (0.2 from 1), right edge 2.1 (0.1 from 2): the right one wins.
    expect(gridSnapDelta({ minX: 1.2, minY: 0, maxX: 2.1, maxY: 0.5 }, 1, 'edges')[0]).toBe(-0.1);
    // Both 0.25 away: the lower edge.
    expect(gridSnapDelta({ minX: 1.25, minY: 0, maxX: 2.25, maxY: 1 }, 1, 'edges')[0]).toBe(-0.25);
    expect(gridSnapDelta({ minX: 0, minY: 0.4, maxX: 1, maxY: 1.2 }, 1, 'edges')[1]).toBe(-0.2);
  });

  it('is nothing without a positive step, and rounds away float noise', () => {
    expect(gridSnapDelta({ minX: 0.3, minY: 0, maxX: 1, maxY: 1 }, 0, 'center')).toEqual([0, 0]);
    const [dx] = gridSnapDelta({ minX: 0.1, minY: 0, maxX: 0.5, maxY: 1 }, 0.1, 'center');
    expect(dx).toBe(0); // 0.30000000000000004 is a node
  });
});
