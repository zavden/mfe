/* Pure 2-D snapping for the preview's drag ("magnetic positioning"): given the dragged box and
 * the boxes of the other objects (plus the frame), the shift that aligns an edge or the centre of
 * the dragged box with an edge or centre of another one — or, on an axis no edge or centre took,
 * that puts it as far from two boxes as they are from it, or at the distance two neighbours
 * keep (spacing guides) — and the guides to draw. No DOM, no state. Units are scene units,
 * +y up. */
import type { Box, Vec2 } from '../../geom';

type Axis = 'x' | 'y';

/** A guide line drawn while a drag is snapped: `axis: 'x'` is a vertical line at x = `at`
 * spanning y from `from` to `to`; `axis: 'y'` a horizontal line at y = `at` spanning x. */
export interface LineGuide {
  kind?: undefined;
  axis: Axis;
  at: number;
  from: number;
  to: number;
}

/** Equal stretches a snap made: the gaps a spacing snap evened out, or two sizes made the same.
 * Each stretch runs along `axis` from `from` to `to`, lying at `at` on the other axis — just
 * outside what the boxes share there: below a row, right of a column — and is drawn as a bar with
 * a tick at each end. */
export interface SpanGuide {
  kind: 'span';
  axis: Axis;
  spans: { from: number; to: number; at: number }[];
}

export type SnapGuide = LineGuide | SpanGuide;

export interface SnapTargets {
  /** Boxes of the other objects on screen (the dragged one is not among them). */
  boxes: readonly Box[];
  /** The frame: its centre lines (x = 0, y = 0) and its four edges are targets too; null = none. */
  frame: Box | null;
}

export interface SnapResult {
  /** Added to the dragged position; 0 on an axis with no snap. */
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

/** Two coordinates closer than this are the same line. */
const SAME = 1e-6;
/** Distances closer than this are equal (ties) and are at the threshold (inside). */
const TIE = 1e-9;

/** The winning pairing on one axis. */
interface Pairing {
  /** Shift to apply along the axis. */
  d: number;
  /** Coordinate of the target line, after the shift. */
  at: number;
  /** Index of the target in `boxes`; `boxes.length` for the frame. */
  target: number;
  /** Both sides are centres. */
  centres: boolean;
}

const lo = (b: Box, axis: Axis): number => (axis === 'x' ? b.minX : b.minY);
const hi = (b: Box, axis: Axis): number => (axis === 'x' ? b.maxX : b.maxY);
const mid = (b: Box, axis: Axis): number => (lo(b, axis) + hi(b, axis)) / 2;
const across = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x');

/** Where `moving` snaps: on each axis independently, its min, centre and max are compared with
 * the min, centre and max of every target box and with the frame's edges and centre lines; the
 * pairing with the smallest distance wins when that distance is at most `threshold` (scene
 * units); among equal distances a centre-to-centre pairing wins, then the earlier target (frame
 * lines count as the last target). The guides are the lines the snapped coordinates make with
 * the moved box and with every target that has an edge or centre on the same line. An axis no
 * pairing took may snap to a spacing instead (`spacingPairing`), with span guides. With `only`
 * (a drag held to that axis, `axisLock.ts`) the other axis is left where it is: no shift, no
 * guide. */
export function snapBox(
  moving: Box,
  targets: SnapTargets,
  threshold: number,
  only?: Axis,
): SnapResult {
  const px = only === 'y' ? null : bestPairing(moving, targets, threshold, 'x');
  const py = only === 'x' ? null : bestPairing(moving, targets, threshold, 'y');
  const sx = px || only === 'y' ? null : spacingPairing(moving, targets.boxes, threshold, 'x');
  const sy = py || only === 'x' ? null : spacingPairing(moving, targets.boxes, threshold, 'y');
  const dx = px?.d ?? sx?.d ?? 0;
  const dy = py?.d ?? sy?.d ?? 0;
  const guides: SnapGuide[] = [];
  if (px || py) {
    const moved = shiftBox(moving, dx, dy);
    if (px) guides.push(guide(moved, targets, px, 'x'));
    if (py) guides.push(guide(moved, targets, py, 'y'));
  }
  if (sx) guides.push({ kind: 'span', axis: 'x', spans: sx.spans });
  if (sy) guides.push({ kind: 'span', axis: 'y', spans: sy.spans });
  return { dx, dy, guides };
}

/** A spacing pairing on one axis: the moving box between two boxes, as far from one as from the
 * other, or beside two neighbours at the distance those two keep (Keynote's spacing guides).
 * Only boxes that overlap the moving box on the other axis take part — things in a row, or in a
 * column; the span guides lie just outside what they share there. The nearest within `threshold`
 * wins; among equal distances the first found. */
function spacingPairing(
  moving: Box,
  boxes: readonly Box[],
  threshold: number,
  axis: Axis,
): { d: number; spans: SpanGuide['spans'] } | null {
  const other = across(axis);
  const near = boxes.filter(
    (b) => lo(b, other) < hi(moving, other) - SAME && hi(b, other) > lo(moving, other) + SAME,
  );
  const size = hi(moving, axis) - lo(moving, axis);
  let best: { d: number; spans: SpanGuide['spans'] } | null = null;
  const consider = (d: number, spans: () => SpanGuide['spans']): void => {
    if (Math.abs(d) > threshold + TIE) return;
    if (best && Math.abs(d) >= Math.abs(best.d) - TIE) return;
    best = { d, spans: spans() };
  };
  // Just outside what the moving box and the two boxes share on the other axis: the bottom of a
  // row's band, the right of a column's (the overlay sets the bars a few pixels further out).
  const at = (a: Box, b: Box): number =>
    axis === 'x'
      ? Math.max(lo(moving, other), lo(a, other), lo(b, other))
      : Math.min(hi(moving, other), hi(a, other), hi(b, other));
  for (const a of near) {
    for (const b of near) {
      if (a === b || hi(a, axis) > lo(b, axis) + SAME) continue; // a before b
      // Centred between a and b.
      const gap = (lo(b, axis) - hi(a, axis) - size) / 2;
      if (gap > SAME) {
        consider(hi(a, axis) + gap - lo(moving, axis), () => [
          { from: hi(a, axis), to: hi(a, axis) + gap, at: at(a, b) },
          { from: lo(b, axis) - gap, to: lo(b, axis), at: at(a, b) },
        ]);
      }
      // The gap a and b keep, repeated after b or before a.
      const g = lo(b, axis) - hi(a, axis);
      if (g > SAME) {
        consider(hi(b, axis) + g - lo(moving, axis), () => [
          { from: hi(a, axis), to: lo(b, axis), at: at(a, b) },
          { from: hi(b, axis), to: hi(b, axis) + g, at: at(a, b) },
        ]);
        consider(lo(a, axis) - g - hi(moving, axis), () => [
          { from: lo(a, axis) - g, to: lo(a, axis), at: at(a, b) },
          { from: hi(a, axis), to: lo(b, axis), at: at(a, b) },
        ]);
      }
    }
  }
  return best;
}

/** `box` moved by (dx, dy). */
export function shiftBox(box: Box, dx: number, dy: number): Box {
  return {
    minX: box.minX + dx,
    minY: box.minY + dy,
    maxX: box.maxX + dx,
    maxY: box.maxY + dy,
  };
}

function bestPairing(
  moving: Box,
  { boxes, frame }: SnapTargets,
  threshold: number,
  axis: Axis,
): Pairing | null {
  const m0 = lo(moving, axis);
  const m1 = mid(moving, axis);
  const m2 = hi(moving, axis);
  let best: Pairing | null = null;
  // Is the candidate better than the best so far? Smaller distance; equal distances: a
  // centre-to-centre pairing, then the earlier target (candidates arrive in target order).
  const consider = (value: number, centreLine: boolean, target: number): void => {
    for (let k = 0; k < 3; k++) {
      const mv = k === 0 ? m0 : k === 1 ? m1 : m2;
      const d = value - mv;
      const dist = Math.abs(d);
      if (dist > threshold + TIE) continue;
      const centres = centreLine && k === 1;
      if (best) {
        const bestDist = Math.abs(best.d);
        if (dist > bestDist + TIE) continue;
        if (dist >= bestDist - TIE && !(centres && !best.centres)) continue;
      }
      best = { d, at: value, target, centres };
    }
  };
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    consider(lo(b, axis), false, i);
    consider(mid(b, axis), true, i);
    consider(hi(b, axis), false, i);
  }
  if (frame) {
    consider(mid(frame, axis), true, boxes.length);
    consider(lo(frame, axis), false, boxes.length);
    consider(hi(frame, axis), false, boxes.length);
  }
  return best;
}

/** The guide for a winning pairing: the line at the snapped coordinate, from the lowest to the
 * highest extent (along the other axis) of the moved box, of every target box with an edge or
 * centre on that line, and, for a frame line, of the whole frame. */
function guide(moved: Box, { boxes, frame }: SnapTargets, p: Pairing, axis: Axis): LineGuide {
  const other = across(axis);
  let from = lo(moved, other);
  let to = hi(moved, other);
  const extend = (b: Box): void => {
    from = Math.min(from, lo(b, other));
    to = Math.max(to, hi(b, other));
  };
  for (const b of boxes) {
    if (
      Math.abs(lo(b, axis) - p.at) <= SAME ||
      Math.abs(mid(b, axis) - p.at) <= SAME ||
      Math.abs(hi(b, axis) - p.at) <= SAME
    ) {
      extend(b);
    }
  }
  if (frame && p.target === boxes.length) extend(frame);
  return { axis, at: p.at, from, to };
}

/** Where a corner drag's scale sticks (size guides): the factor — the box scaled by it about
 * `center` — at which the box's width or height equals a target's, when at `factor` the two
 * sizes differ by at most `threshold` (scene units); the nearest wins, width before height on a
 * tie. The guides show the two equal sizes as spans: the scaled box's below it (or right of it)
 * and the target's below (right of) the target. */
export function snapSize(
  box: Box,
  center: Vec2,
  factor: number,
  targets: readonly Box[],
  threshold: number,
): { factor: number; guides: SpanGuide[] } | null {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  let best: { factor: number; axis: Axis; target: Box; dist: number } | null = null;
  const consider = (k: number, dist: number, axis: Axis, target: Box): void => {
    if (dist > threshold + TIE) return;
    if (best && dist >= best.dist - TIE) return;
    best = { factor: k, axis, target, dist };
  };
  for (const t of targets) {
    const tw = t.maxX - t.minX;
    const th = t.maxY - t.minY;
    if (w > SAME && tw > SAME) consider(tw / w, Math.abs(w * factor - tw), 'x', t);
    if (h > SAME && th > SAME) consider(th / h, Math.abs(h * factor - th), 'y', t);
  }
  if (!best) return null;
  const { factor: k, axis, target: t } = best as { factor: number; axis: Axis; target: Box };
  const scaled: Box = {
    minX: center[0] + (box.minX - center[0]) * k,
    maxX: center[0] + (box.maxX - center[0]) * k,
    minY: center[1] + (box.minY - center[1]) * k,
    maxY: center[1] + (box.maxY - center[1]) * k,
  };
  const spans =
    axis === 'x'
      ? [
          { from: scaled.minX, to: scaled.maxX, at: scaled.minY },
          { from: t.minX, to: t.maxX, at: t.minY },
        ]
      : [
          { from: scaled.minY, to: scaled.maxY, at: scaled.maxX },
          { from: t.minY, to: t.maxY, at: t.maxX },
        ];
  return { factor: k, guides: [{ kind: 'span', axis, spans }] };
}
