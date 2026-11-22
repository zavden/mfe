/* Scaling and turning several selected clips as one group (the group's transform handles): the
 * union box the handles frame, the smallest factor the group may shrink by, and where each member
 * ends up when the group is scaled or turned about its centre. Pure: scene units (y up, degrees
 * CCW), no DOM, no stores. A placement's position is the centre of the formula's box, so scaling
 * or turning a group about its centre moves each member's position exactly. */
import { applyToPoint, boxCenter, rotate, unionBox, type Box, type Vec2 } from '../../geom';
import type { ClipId } from '../../model';
import { round6 } from '../time';
import { MIN_SCALE, type OrientedBox } from './handles';

/** A selected clip when a group drag began: its keyframe's (or part's) placement then. */
export interface GroupMember {
  clipId: ClipId;
  startPosition: Vec2;
  startScale: number;
  startRotation: number;
}

/** round6 without -0 (a coordinate that rounds to zero from below). */
const clean = (x: number): number => round6(x) + 0;

/** The union of the boxes of `ids` that `boxes` knows; null when it knows none of them. */
export function groupBox(boxes: ReadonlyMap<ClipId, Box>, ids: readonly ClipId[]): Box | null {
  const known: Box[] = [];
  for (const id of ids) {
    const box = boxes.get(id);
    if (box) known.push(box);
  }
  return known.length > 0 ? unionBox(known) : null;
}

/** The group's handle box: upright (rotation 0), centred on the union box, half-extents of it. */
export function groupOrientedBox(box: Box): OrientedBox {
  return {
    center: boxCenter(box),
    rotation: 0,
    halfWidth: (box.maxX - box.minX) / 2,
    halfHeight: (box.maxY - box.minY) / 2,
  };
}

/** The smallest factor that keeps every member's scale at `min` or above (so that a group scale
 * never shrinks a member below MIN_SCALE); 1 for no members. It is above 1 when a member already
 * starts below `min`. Members whose scale is not positive no factor can help: they are left out
 * (1 when every member is such). */
export function minGroupFactor(members: readonly GroupMember[], min = MIN_SCALE): number {
  let smallest = Infinity;
  for (const { startScale } of members) {
    if (startScale > 0 && startScale < smallest) smallest = startScale;
  }
  return smallest === Infinity ? 1 : min / smallest;
}

/** Every member scaled uniformly by `k` about `center`: scale' = startScale·k and
 * position' = C + (startPosition − C)·k, both rounded with round6. */
export function scaledPlacements(
  members: readonly GroupMember[],
  center: Vec2,
  k: number,
): { clipId: ClipId; position: Vec2; scale: number }[] {
  const [cx, cy] = center;
  return members.map(({ clipId, startPosition: [x, y], startScale }) => ({
    clipId,
    position: [clean(cx + (x - cx) * k), clean(cy + (y - cy) * k)],
    scale: clean(startScale * k),
  }));
}

/** Every member turned by `degrees` (CCW) about `center`: rotation' = startRotation + degrees and
 * the position turned about C by the same angle, rounded with round6. */
export function rotatedPlacements(
  members: readonly GroupMember[],
  center: Vec2,
  degrees: number,
): { clipId: ClipId; position: Vec2; rotation: number }[] {
  const [cx, cy] = center;
  const turn = rotate(degrees);
  return members.map(({ clipId, startPosition: [x, y], startRotation }) => {
    const [dx, dy] = applyToPoint(turn, [x - cx, y - cy]);
    return {
      clipId,
      position: [clean(cx + dx), clean(cy + dy)],
      rotation: clean(startRotation + degrees),
    };
  });
}
