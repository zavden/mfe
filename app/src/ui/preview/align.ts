/* Align and distribute: how far each box moves so that edges meet or gaps become equal. Knows only
 * boxes (scene units, y up), nothing about clips or stores. Pure: deltas are exact floats, the
 * caller rounds. */
import { unionBox, type Box } from '../../geom';
import type { Vec2 } from '../../model';

export type AlignEdge = 'left' | 'centerX' | 'right' | 'top' | 'middle' | 'bottom';
export type Axis = 'x' | 'y';

export interface AlignItem {
  id: string;
  box: Box;
}

/** The coordinate of a box's edge (or centre line) on the edge's axis. */
export function edgeOf(box: Box, edge: AlignEdge): number {
  switch (edge) {
    case 'left':
      return box.minX;
    case 'centerX':
      return (box.minX + box.maxX) / 2;
    case 'right':
      return box.maxX;
    case 'top':
      return box.maxY;
    case 'middle':
      return (box.minY + box.maxY) / 2;
    case 'bottom':
      return box.minY;
  }
}

const isHorizontal = (edge: AlignEdge): boolean =>
  edge === 'left' || edge === 'centerX' || edge === 'right';

const moveOn = (axis: Axis, d: number): Vec2 => (axis === 'x' ? [d, 0] : [0, d]);

/** How far each item moves so that its `edge` meets the reference edge: the box enclosing all
 * the items (the outermost edge, or the centre of that box), or `reference` when given (the
 * frame). Only the edge's axis moves; the other delta is 0. Items that need no move are left out
 * of the map. One item with no reference does not move (the map is empty). */
export function alignDeltas(
  items: readonly AlignItem[],
  edge: AlignEdge,
  reference?: Box | null,
): Map<string, Vec2> {
  const deltas = new Map<string, Vec2>();
  if (items.length === 0 || (!reference && items.length < 2)) return deltas;
  const target = edgeOf(reference ?? unionBox(items.map((item) => item.box)), edge);
  const axis: Axis = isHorizontal(edge) ? 'x' : 'y';
  for (const { id, box } of items) {
    const d = target - edgeOf(box, edge);
    if (d !== 0) deltas.set(id, moveOn(axis, d));
  }
  return deltas;
}

/** 3+ items along `axis`: sorted by their centre on that axis, the first and last stay, and the
 * others are placed so that the gaps between neighbouring boxes are all equal (the total free
 * span divided by n−1; gaps may be negative when the boxes overlap). Fewer than 3 items: empty
 * map. Deltas are on `axis` only. */
export function distributeDeltas(items: readonly AlignItem[], axis: Axis): Map<string, Vec2> {
  const deltas = new Map<string, Vec2>();
  if (items.length < 3) return deltas;
  const lo = (box: Box) => (axis === 'x' ? box.minX : box.minY);
  const hi = (box: Box) => (axis === 'x' ? box.maxX : box.maxY);
  const sorted = [...items].sort((a, b) => lo(a.box) + hi(a.box) - (lo(b.box) + hi(b.box)));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const sizes = sorted.reduce((sum, { box }) => sum + hi(box) - lo(box), 0);
  const gap = (hi(last.box) - lo(first.box) - sizes) / (sorted.length - 1);
  let cursor = hi(first.box) + gap;
  for (const { id, box } of sorted.slice(1, -1)) {
    const d = cursor - lo(box);
    if (d !== 0) deltas.set(id, moveOn(axis, d));
    cursor += hi(box) - lo(box) + gap;
  }
  return deltas;
}
