// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canvasBox, drawGrid, GRID_AXIS, GRID_LINE } from '../gridLayer';

/** A 2D context that only records what is drawn. */
function recorder() {
  const calls: { name: string; args: unknown[] }[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_, name: string) =>
      name === 'calls'
        ? calls
        : (...args: unknown[]) => {
            calls.push({ name, args });
            return undefined;
          },
    set: (_, name: string, value: unknown) => {
      calls.push({ name: `set ${name}`, args: [value] });
      return true;
    },
  });
  return ctx as unknown as CanvasRenderingContext2D & { calls: typeof calls };
}

const camera = { frameWidth: 16, frameHeight: 8, center: [0, 0] as [number, number], zoom: 1 };
const surface = { width: 1600, height: 800 };
const frame = { minX: -8, minY: -4, maxX: 8, maxY: 4 };

describe('drawGrid', () => {
  it('draws one crisp pixel line per multiple of the step, the axes in a stronger colour', () => {
    const ctx = recorder();
    drawGrid(ctx, camera, surface, frame, 2);
    const moves = ctx.calls.filter((c) => c.name === 'moveTo').map((c) => c.args);
    // x in -8 … 8 step 2 (9 lines) and y in -4 … 4 (5 lines): 14 lines, 2 of them axes.
    expect(moves).toHaveLength(14);
    const colours = ctx.calls.filter((c) => c.name === 'set strokeStyle').map((c) => c.args[0]);
    expect(colours).toEqual([GRID_LINE, GRID_AXIS]);
    expect(ctx.calls.filter((c) => c.name === 'stroke')).toHaveLength(2);
    // Pixel centres: x = 0 is column 800 → 800.5; y = 2 is row 200 → 200.5.
    expect(moves).toContainEqual([800.5, 0.5]);
    expect(moves).toContainEqual([0.5, 200.5]);
    expect(ctx.calls[0]).toMatchObject({ name: 'save' });
    expect(ctx.calls.at(-1)).toMatchObject({ name: 'restore' });
  });

  it('draws nothing for a step of zero', () => {
    const ctx = recorder();
    drawGrid(ctx, camera, surface, frame, 0);
    expect(ctx.calls.some((c) => c.name === 'moveTo')).toBe(false);
  });
});

describe('canvasBox', () => {
  it('is the frame itself at the fit', () => {
    expect(canvasBox(camera, surface)).toEqual(frame);
  });

  it('is the part of the scene a zoomed and panned canvas shows', () => {
    // Twice as close about (3, 1): half the frame each way.
    expect(canvasBox({ ...camera, center: [3, 1], zoom: 2 }, surface)).toEqual({
      minX: -1,
      minY: -1,
      maxX: 7,
      maxY: 3,
    });
    // A canvas wider than the frame shows more to the sides.
    expect(canvasBox(camera, { width: 2000, height: 800 })).toEqual({
      minX: -10,
      minY: -4,
      maxX: 10,
      maxY: 4,
    });
  });
});
