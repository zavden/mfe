/* Transform handles of the preview (Shift held): the oriented bounding box of the selected clip,
 * four corner handles for uniform scale, a rotation handle above the top edge, and the maths that
 * turn a pointer drag into a new scale or rotation (in steps of 0.05 — the Preferences' scale
 * step — and 15° unless Ctrl/⌘ is held). Pure: scene units (y up, degrees CCW), no DOM.
 *
 * Handle sizes are in CSS pixels, so the geometry takes `unit`, the scene units one CSS pixel
 * spans at the current zoom: handles stay the same size on screen at any zoom. */
import {
  applyToPoint,
  boxCenter,
  contoursBox,
  multiply,
  rotate as rotationMatrix,
  transformContour,
  translate,
  type Box,
  type Contour,
  type Vec2,
} from '../../geom';
import type { Placement } from '../../model';
import { round6 } from '../time';

export type CornerId = 'nw' | 'ne' | 'se' | 'sw';
export type HandleId = CornerId | 'rotate';

export const CORNERS: readonly CornerId[] = ['nw', 'ne', 'se', 'sw'];

/** Side of the square corner handles, CSS px. */
export const HANDLE_SIZE = 9;
/** Radius of the rotation handle, CSS px. */
export const ROTATE_RADIUS = 5.5;
/** Distance from the top edge to the rotation handle's centre, CSS px. */
export const ROTATE_OFFSET = 24;
/** The box is drawn this far outside the formula (matches the plain selection box), CSS px. */
export const BOX_PAD = 4;
/** How close (CSS px) the pointer must be to a handle's centre to grab it. */
export const HIT_RADIUS = 9;

/** Smallest scale a drag can produce. */
export const MIN_SCALE = 0.05;
/** Rotation snap step in degrees, unless Ctrl/⌘ is held. */
export const ROTATION_SNAP = 15;
/** Scale snap step: a scale (or a group's factor) goes in multiples of it, unless Ctrl/⌘ is
 * held. Hard steps, like the rotation's: a magnet with a small tolerance went unnoticed. */
/** The default step of the scale (Preferences → Scale step chooses another). */
export const SCALE_SNAP = 0.05;

/** A rectangle rotated about its centre: the formula's box under the clip's placement. Sizes
 * are half-extents in scene units, already multiplied by the clip's scale, without padding. */
export interface OrientedBox {
  center: Vec2;
  /** Degrees, counter-clockwise. */
  rotation: number;
  halfWidth: number;
  halfHeight: number;
}

/** What the clip looks like: the part of `Placement` that positions its box. */
export type BoxPlacement = Pick<Placement, 'position' | 'rotation' | 'scale' | 'flipX' | 'flipY'>;

/** The formula's local box (renders are centred on the origin) under `placement`. Flips mirror
 * the formula about its centre; the box keeps its orientation, so "top" stays the upper edge of
 * the rotated frame, as in a graphics editor. */
export function orientedBox(local: Box, placement: BoxPlacement): OrientedBox {
  const s = placement.scale;
  const offset = applyToPoint(rotationMatrix(placement.rotation), [
    ((local.minX + local.maxX) / 2) * s * (placement.flipX ? -1 : 1),
    ((local.minY + local.maxY) / 2) * s * (placement.flipY ? -1 : 1),
  ]);
  return {
    center: [placement.position[0] + offset[0], placement.position[1] + offset[1]],
    rotation: placement.rotation,
    halfWidth: ((local.maxX - local.minX) / 2) * s,
    halfHeight: ((local.maxY - local.minY) / 2) * s,
  };
}

/** The smallest box turned by `rotation` degrees around `contours` (scene): how the handles frame
 * a part whose glyphs all turned by that angle, so they line up with the glyphs. */
export function turnedBox(contours: readonly Contour[], rotation: number): OrientedBox {
  const pivot = boxCenter(contoursBox(contours));
  const about = (degrees: number) =>
    multiply(
      translate(pivot[0], pivot[1]),
      multiply(rotationMatrix(degrees), translate(-pivot[0], -pivot[1])),
    );
  // Measured in the glyphs' own frame, then its centre turned back.
  const unturned = contoursBox(contours.map((c) => transformContour(about(-rotation), c)));
  return {
    center: applyToPoint(about(rotation), boxCenter(unturned)),
    rotation,
    halfWidth: (unturned.maxX - unturned.minX) / 2,
    halfHeight: (unturned.maxY - unturned.minY) / 2,
  };
}

export interface HandleGeometry {
  center: Vec2;
  /** Corners of the padded box in scene space. */
  corners: Record<CornerId, Vec2>;
  /** Middle of the top edge, where the stem starts. */
  stemStart: Vec2;
  /** Centre of the rotation handle. */
  rotate: Vec2;
}

/** Positions of the box corners and the rotation handle. `unit` is scene units per CSS pixel. */
export function handleGeometry(box: OrientedBox, unit: number): HandleGeometry {
  const hw = box.halfWidth + BOX_PAD * unit;
  const hh = box.halfHeight + BOX_PAD * unit;
  const m = rotationMatrix(box.rotation);
  const at = (x: number, y: number): Vec2 => {
    const [rx, ry] = applyToPoint(m, [x, y]);
    return [box.center[0] + rx, box.center[1] + ry];
  };
  return {
    center: box.center,
    corners: { nw: at(-hw, hh), ne: at(hw, hh), se: at(hw, -hh), sw: at(-hw, -hh) },
    stemStart: at(0, hh),
    rotate: at(0, hh + ROTATE_OFFSET * unit),
  };
}

/** The handle under `point` (scene), the nearest one within `HIT_RADIUS` CSS px. */
export function hitHandle(
  geometry: HandleGeometry,
  point: Vec2,
  unit: number,
  radius = HIT_RADIUS,
): HandleId | null {
  let best: HandleId | null = null;
  let bestDistance = radius * unit;
  const candidates: [HandleId, Vec2][] = [
    ...CORNERS.map((id): [HandleId, Vec2] => [id, geometry.corners[id]]),
    ['rotate', geometry.rotate],
  ];
  for (const [id, position] of candidates) {
    const distance = Math.hypot(point[0] - position[0], point[1] - position[1]);
    if (distance <= bestDistance) {
      best = id;
      bestDistance = distance;
    }
  }
  return best;
}

// --- Cursors ---------------------------------------------------------------------

/** A rotation arrow; CSS has no rotate cursor. Falls back to `grab` where data URLs fail. */
export const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M19 12a7 7 0 1 1-2.1-5" stroke="#fff" stroke-width="4.5"/>' +
    '<path d="M19 4.5v4.2h-4.2" stroke="#fff" stroke-width="4.5"/>' +
    '<path d="M19 12a7 7 0 1 1-2.1-5" stroke="#000" stroke-width="2"/>' +
    '<path d="M19 4.5v4.2h-4.2" stroke="#000" stroke-width="2"/></g></svg>',
)}") 12 12, grab`;

/** Resize cursor for a corner: the diagonal the corner points along on screen. It depends on the
 * box's rotation, not its aspect ratio, so a wide box still gets diagonal arrows. */
export function resizeCursor(corner: CornerId, rotation: number): string {
  const [x, y] = applyToPoint(rotationMatrix(rotation), [
    corner === 'ne' || corner === 'se' ? 1 : -1,
    corner === 'nw' || corner === 'ne' ? 1 : -1,
  ]);
  // Scene y points up, screen y down.
  const screen = (Math.atan2(-y, x) * 180) / Math.PI;
  const folded = ((screen % 180) + 180) % 180;
  switch (Math.round(folded / 45) % 4) {
    case 0:
      return 'ew-resize';
    case 1:
      return 'nwse-resize';
    case 2:
      return 'ns-resize';
    default:
      return 'nesw-resize';
  }
}

export function handleCursor(handle: HandleId, rotation: number): string {
  return handle === 'rotate' ? ROTATE_CURSOR : resizeCursor(handle, rotation);
}

// --- Drag maths ------------------------------------------------------------------

/** Uniform scale about `center`: the start scale times how much farther (or nearer) the
 * pointer is than where it started, never below `min`. */
export function scaleFromDrag(
  startScale: number,
  center: Vec2,
  start: Vec2,
  current: Vec2,
  min = MIN_SCALE,
): number {
  const before = Math.hypot(start[0] - center[0], start[1] - center[1]);
  const now = Math.hypot(current[0] - center[0], current[1] - center[1]);
  if (before < 1e-9) return startScale;
  return round6(Math.max(min, (startScale * now) / before));
}

/** Direction of `point` seen from `center`, degrees counter-clockwise (scene space, y up). */
export function angleAround(center: Vec2, point: Vec2): number {
  return (Math.atan2(point[1] - center[1], point[0] - center[0]) * 180) / Math.PI;
}

/** `delta` brought into (-180, 180]: the short way round. */
export function shortestAngle(delta: number): number {
  let d = delta % 360;
  if (d > 180) d -= 360;
  else if (d <= -180) d += 360;
  return d;
}

/** Running rotation of a drag. The pointer's angle is followed step by step, so turning past
 * ±180° keeps counting (400° is a turn and a bit) instead of jumping back. */
export interface RotationTracker {
  /** Angle of the pointer at the last update. */
  last: number;
  /** Total turned since the drag started, degrees counter-clockwise. */
  total: number;
}

export function beginRotation(center: Vec2, start: Vec2): RotationTracker {
  return { last: angleAround(center, start), total: 0 };
}

export function advanceRotation(
  tracker: RotationTracker,
  center: Vec2,
  current: Vec2,
): RotationTracker {
  const angle = angleAround(center, current);
  // Pointer exactly on the centre has no direction: keep the last angle.
  if (Math.hypot(current[0] - center[0], current[1] - center[1]) < 1e-9) return tracker;
  return { last: angle, total: tracker.total + shortestAngle(angle - tracker.last) };
}

/** Round to a multiple of `step` degrees (never -0). */
export function snapAngle(degrees: number, step = ROTATION_SNAP): number {
  return Math.round(degrees / step) * step + 0;
}

/** `value` rounded to the nearest multiple of `step`; the multiples start at `step` (never 0);
 * the result goes through round6 (1.2000000000000002 → 1.2). */
export function snapScale(value: number, step = SCALE_SNAP): number {
  if (!(step > 0)) return round6(value);
  return round6(Math.max(1, Math.round(value / step)) * step);
}

/** The scale (or a group's factor) a corner drag writes: `raw`, from scaleFromDrag, rounded to
 * a multiple of `step` (the preference's; SCALE_SNAP by default) unless `free` (Ctrl/⌘ held). A
 * step below `min`, the drag's floor (MIN_SCALE, or a group's minGroupFactor), is not taken:
 * `raw` stays. */
export function snappedScale(
  raw: number,
  free: boolean,
  min = MIN_SCALE,
  step = SCALE_SNAP,
): number {
  if (free) return raw;
  const snapped = snapScale(raw, step);
  return snapped < min ? raw : snapped;
}

/** The rotation a drag produces: the start rotation plus what the pointer turned, snapped to
 * `step` degrees (absolute, so 0° is reachable from any start) when `snap` is on. */
export function rotationFromDrag(startRotation: number, tracker: RotationTracker, snap: boolean) {
  const raw = startRotation + tracker.total;
  return round6(snap ? snapAngle(raw) : raw);
}

// --- Readout -----------------------------------------------------------------------

export function scaleReadout(scale: number): string {
  return `× ${scale.toFixed(2)}`;
}

export function rotationReadout(degrees: number): string {
  return `${(+degrees.toFixed(1)).toString()}°`;
}
