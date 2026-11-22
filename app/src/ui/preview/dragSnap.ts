/* What a drag snaps with: the box that moves (the dragged clip with its companions, or the part
 * being moved) and the boxes it may stick to (the other clips on screen, the frame), captured
 * when the drag starts, from the full formula boxes of the clips at the playhead; and where the
 * drag goes for a travel of the pointer, held to one axis with Alt (`axisLock.ts`), snapped to
 * the objects and to the grid. Pure. */
import { unionBox, type Box, type Vec2 } from '../../geom';
import type { ClipId } from '../../model';
import { alongAxis, heldAxis, type DragAxis } from './axisLock';
import { gridSnapDelta, type GridAnchor } from './grid';
import { shiftBox, snapBox, type SnapGuide, type SnapTargets } from './snap';

export interface DragSnap {
  /** The moving box where the drag began (before any travel). */
  moving: Box;
  targets: SnapTargets;
}

/** The snap context of a drag of `movingIds` among the clips whose full boxes are `boxes`;
 * null when the dragged clips have no box (not rendered yet). `part` is the box of the part
 * being moved instead, when a part transform's end state is dragged. */
export function dragSnapOf(
  boxes: ReadonlyMap<ClipId, Box>,
  movingIds: readonly ClipId[],
  frame: Box | null,
  part: Box | null = null,
): DragSnap | null {
  const moving = new Set(movingIds);
  const movingBoxes: Box[] = [];
  const targets: Box[] = [];
  for (const [id, box] of boxes) {
    if (moving.has(id)) movingBoxes.push(box);
    else targets.push(box);
  }
  const movingBox = part ?? (movingBoxes.length > 0 ? unionBox(movingBoxes) : null);
  if (!movingBox) return null;
  return { moving: movingBox, targets: { boxes: targets, frame } };
}

/** The travel of a drag, corrected by the snap: the moving box travelled by `travel` sticks to
 * the targets within `threshold` (scene units); the guides say where. With `only`, along that
 * axis alone: the other component stays as it is. */
export function snappedTravel(
  snap: DragSnap,
  travel: readonly [number, number],
  threshold: number,
  only?: DragAxis,
): { travel: [number, number]; guides: SnapGuide[] } {
  const moved = shiftBox(snap.moving, travel[0], travel[1]);
  const result = snapBox(moved, snap.targets, threshold, only);
  return { travel: [travel[0] + result.dx, travel[1] + result.dy], guides: result.guides };
}

/** How a drag goes where the pointer takes it: what holds it, by the keys held now. */
export interface TravelRules {
  /** What the drag snaps with; null when its boxes are not known yet (nothing to snap to). */
  snap: DragSnap | null;
  /** Stick to the edges, centres and spacings of the others and of the frame (the magnet is on
   * and Ctrl/⌘ is not held). */
  objects: boolean;
  /** Scene units within which the box sticks. */
  threshold: number;
  /** The grid the box lands on: shown, and Ctrl/⌘ not held. */
  grid: { step: number; anchor: GridAnchor } | null;
  /** Alt held: along one axis alone. */
  lock: boolean;
}

/** Where a drag goes. */
export interface DragTravel {
  /** Added to where each dragged thing began. */
  travel: [number, number];
  guides: SnapGuide[];
  /** The axis the drag is held to, or null when it is free. */
  axis: DragAxis | null;
}

/** Where a drag goes for the pointer's `pointer` travel (scene units, from where the drag began):
 * held to the axis the pointer has gone further along when `lock` (Alt) is on; stuck to the
 * objects and the frame — along that axis alone when held, so that no snap pulls the box off its
 * line —; and on the grid, on the axes no object guide took, never across a held axis. Ctrl/⌘
 * turns the objects and the grid off (`objects`, `grid`), with the lock or without it. */
export function dragTravel(pointer: Vec2, rules: TravelRules): DragTravel {
  const axis = rules.lock ? heldAxis(pointer) : null;
  let travel: [number, number] = axis ? alongAxis(pointer, axis) : [pointer[0], pointer[1]];
  let guides: SnapGuide[] = [];
  const { snap } = rules;
  if (snap && rules.objects) {
    const snapped = snappedTravel(snap, travel, rules.threshold, axis ?? undefined);
    travel = snapped.travel;
    guides = snapped.guides;
  }
  // The grid holds the moving box (its centre, or its nearest edges) on the axes no object
  // guide took: a guide says the formula lines up with another, which is more specific.
  if (snap && rules.grid) {
    const moved = shiftBox(snap.moving, travel[0], travel[1]);
    const [dx, dy] = gridSnapDelta(moved, rules.grid.step, rules.grid.anchor);
    const held = new Set(guides.map((g) => g.axis));
    if (axis !== 'y' && !held.has('x')) travel[0] += dx;
    if (axis !== 'x' && !held.has('y')) travel[1] += dy;
  }
  return { travel, guides, axis };
}
