/* The preview's grid: the spacings it offers (Manim units), the lines to draw inside the frame,
 * and where a dragged box lands when it snaps to the nearest node — by its centre, or by
 * whichever of its edges is nearer to a line on each axis. Pure: scene units, no DOM. */
import type { Box } from '../../geom';
import { round6 } from '../time';

/** The spacings the transport bar steps through, sparsest first (the default is 1, Manim's
 * unit). */
export const GRID_STEPS = [2, 1, 0.5, 0.25, 0.1] as const;
export type GridStep = (typeof GRID_STEPS)[number];

/** What the grid holds while a formula is dragged. */
export type GridAnchor = 'center' | 'edges';
export const GRID_ANCHORS: readonly GridAnchor[] = ['center', 'edges'];

export function isGridStep(x: unknown): x is GridStep {
  return GRID_STEPS.some((step) => step === x);
}

export function isGridAnchor(x: unknown): x is GridAnchor {
  return x === 'center' || x === 'edges';
}

/** The spacing one notch denser (+1) or sparser (-1) than `step`; `step` itself at either end. */
export function stepGrid(step: GridStep, direction: 1 | -1): GridStep {
  const at = GRID_STEPS.indexOf(step);
  const next = Math.min(GRID_STEPS.length - 1, Math.max(0, at + direction));
  return GRID_STEPS[next]!;
}

/** The spacing for a label: "2", "1", "0.5", "0.25", "0.1". */
export function formatGridStep(step: number): string {
  return String(step);
}

/** The most lines the grid has on an axis. A canvas is a few thousand device pixels across (a 4K
 * screen at twice the pixel ratio is 7680), so more lines than these stand less than a pixel
 * apart: a haze, however many they are. */
export const MAX_GRID_LINES = 8192;

/** The grid lines inside `frame`: the multiples of `step` on each axis, ascending, the origin's
 * among them (so that a snapped formula lands on round Manim coordinates). `MAX_GRID_LINES` on an
 * axis at most: a frame that holds more — the part of the world a camera far out shows — gets one
 * of every few, evenly, the origin's still among them. None for a frame that is no stretch of the
 * scene (a bound that is not a number, or not finite). */
export function gridLines(frame: Box, step: number): { x: number[]; y: number[] } {
  const along = (min: number, max: number): number[] => {
    const out: number[] = [];
    if (!(step > 0)) return out;
    const first = Math.ceil(min / step - 1e-9);
    const last = Math.floor(max / step + 1e-9);
    const count = last - first + 1;
    if (!(count > 0) || !Number.isFinite(count)) return out;
    // Too many to tell apart: every `every`-th multiple, from one that the origin's is among.
    const every = Math.ceil(count / MAX_GRID_LINES);
    const start = Math.ceil(first / every) * every;
    const lines = Math.min(MAX_GRID_LINES, Math.floor((last - start) / every) + 1);
    // Counted by the line, not by its multiple: past 2^53 a multiple plus one is the same
    // multiple, and a loop that steps the multiple itself never ends.
    for (let i = 0; i < lines; i++) out.push(round6((start + i * every) * step));
    return out;
  };
  return { x: along(frame.minX, frame.maxX), y: along(frame.minY, frame.maxY) };
}

/** The nearest multiple of `step` to `v`. */
const nearest = (v: number, step: number): number => Math.round(v / step) * step;

/** The shift that puts `box` on the grid: its centre on the nearest node, or (`edges`) on each
 * axis whichever of its two edges is nearer to a line (the lower one on a tie). Nothing without
 * a positive step. */
export function gridSnapDelta(box: Box, step: number, anchor: GridAnchor): [number, number] {
  if (!(step > 0)) return [0, 0];
  const axis = (min: number, max: number): number => {
    if (anchor === 'center') {
      const centre = (min + max) / 2;
      return nearest(centre, step) - centre;
    }
    const low = nearest(min, step) - min;
    const high = nearest(max, step) - max;
    return Math.abs(low) <= Math.abs(high) ? low : high;
  };
  return [round6(axis(box.minX, box.maxX)), round6(axis(box.minY, box.maxY))];
}
