/* Pure helpers for the preview's mouse interaction (no DOM): which clip is under a point, the
 * box of a clip, what a click selects, which clips are on screen, and where a dragged clip ends
 * up. */
import { contoursBox, unionBox, type Box, type Vec2 } from '../../geom';
import type { Renderer } from '../../render';
import { onScreenAt, sceneDuration, type ClipId, type Project } from '../../model';
import type { Drawable } from '../../scene';
import type { Selection } from '../../store';
import { highlightedClipIds } from '../selection';

export interface ClipBox {
  clipId: ClipId;
  box: Box;
  /** z of the clip's drawables (front-most wins when boxes overlap). */
  z: number;
  /** Index of the clip's last drawable (later = drawn on top among equal z). */
  order: number;
}

/** Union box of each clip's drawables at the current instant. */
export function clipBoxes(drawables: readonly Drawable[]): Map<ClipId, ClipBox> {
  const boxes = new Map<ClipId, ClipBox>();
  drawables.forEach((drawable, index) => {
    const box = contoursBox(drawable.path.contours);
    if (!Number.isFinite(box.minX)) return;
    const existing = boxes.get(drawable.clipId);
    boxes.set(drawable.clipId, {
      clipId: drawable.clipId,
      box: existing ? unionBox([existing.box, box]) : box,
      z: Math.max(existing?.z ?? -Infinity, drawable.z),
      order: index,
    });
  });
  return boxes;
}

export interface ClipHit {
  clipId: ClipId;
  /** The glyph under the point, or null when the point is inside the clip's box only. */
  drawable: Drawable | null;
}

/** CSS pixels either side of a stroke that still hit it: a 4-wide stroke is two or three pixels
 * at the preview's usual size, too thin to aim at on its own. */
export const STROKE_SLACK = 3;

export interface PickOptions {
  /** Scene units the clip's box is padded by, so thin glyphs and the gaps between glyphs are
   * easy to hit. */
  pad?: number;
  /** Scene units either side of a stroke that still hit it (`STROKE_SLACK` in pixels). */
  slack?: number;
  /** The circle selector: scene units around the point within which the nearest glyph counts
   * as the one under it (`pickGlyph`). Absent: only the ink under the point does. */
  reach?: number;
}

/** Whether a contour comes back to where it starts: an outline, with an inside. */
function closed(contour: readonly number[]): boolean {
  const n = contour.length;
  return (
    n >= 8 &&
    Math.abs(contour[0]! - contour[n - 2]!) <= 1e-9 &&
    Math.abs(contour[1]! - contour[n - 1]!) <= 1e-9
  );
}

/** Whether a glyph encloses an area: a filled one, or a closed outline. An open stroke (a line,
 * the shaft of an arrow, the lines of a cross) does not: its box is mostly empty space. */
function encloses(drawable: Drawable): boolean {
  return (!!drawable.fill && drawable.fill.opacity > 0) || drawable.path.contours.some(closed);
}

/** The box of each clip that a point inside it can mean, for `pickClip`: the union of its glyphs
 * that enclose an area, and whether any of them is filled. */
function enclosingBoxes(drawables: readonly Drawable[]): (ClipBox & { filled: boolean })[] {
  const boxes = new Map<ClipId, ClipBox & { filled: boolean }>();
  drawables.forEach((drawable, index) => {
    const filled = !!drawable.fill && drawable.fill.opacity > 0;
    if (!encloses(drawable)) return;
    const box = contoursBox(drawable.path.contours);
    if (!Number.isFinite(box.minX)) return;
    const existing = boxes.get(drawable.clipId);
    boxes.set(drawable.clipId, {
      clipId: drawable.clipId,
      box: existing ? unionBox([existing.box, box]) : box,
      z: Math.max(existing?.z ?? -Infinity, drawable.z),
      order: index,
      filled: filled || (existing?.filled ?? false),
    });
  });
  return [...boxes.values()];
}

/** Click target: the glyph under the point (topmost) — with a `reach`, else the glyph nearest
 * to the point within it —, else the clip the point is beside: one with filled glyphs whose padded
 * box contains it, before an open stroke that passes within the padding, before a hollow outline
 * whose box contains it — the gap between two glyphs of a formula is the formula's, not the box's
 * drawn around it, and the box of a line is not the line —, the front-most of each. */
export function pickClip(
  renderer: Renderer,
  drawables: readonly Drawable[],
  point: Vec2,
  { pad = 0.08, slack = 0, reach }: PickOptions = {},
): ClipHit | null {
  const glyph =
    reach === undefined
      ? renderer.pick(drawables, point, slack)
      : pickGlyph(renderer, drawables, point, reach, slack);
  if (glyph) return { clipId: glyph.clipId, drawable: glyph };
  let best: (ClipBox & { filled: boolean }) | null = null;
  for (const entry of enclosingBoxes(drawables)) {
    const { box } = entry;
    const inside =
      point[0] >= box.minX - pad &&
      point[0] <= box.maxX + pad &&
      point[1] >= box.minY - pad &&
      point[1] <= box.maxY + pad;
    if (!inside) continue;
    const inFront =
      !best ||
      (entry.filled !== best.filled
        ? entry.filled
        : entry.z > best.z || (entry.z === best.z && entry.order > best.order));
    if (inFront) best = entry;
  }
  if (best?.filled) return { clipId: best.clipId, drawable: null };
  // An open stroke has no box to be inside of: it is hit along its line, as generously.
  const open = drawables.filter((drawable) => !encloses(drawable));
  const beside = open.length > 0 ? renderer.pick(open, point, pad) : null;
  if (beside) return { clipId: beside.clipId, drawable: null };
  return best ? { clipId: best.clipId, drawable: null } : null;
}

/** The glyph a click or a hover means in align by symbol and with the circle selector: the one
 * whose ink is under the
 * pointer, else the nearest one whose box lies within `reach` scene units of the point (inside
 * the box counts as 0: the gap of an "=" or the bowl of an "o" pick that glyph). */
export function pickGlyph(
  renderer: Renderer,
  drawables: readonly Drawable[],
  point: Vec2,
  reach: number,
  slack = 0,
): Drawable | null {
  const inked = renderer.pick(drawables, point, slack);
  if (inked) return inked;
  let best: Drawable | null = null;
  let bestDistance = reach;
  for (const drawable of drawables) {
    const box = contoursBox(drawable.path.contours);
    if (!Number.isFinite(box.minX)) continue;
    const dx = Math.max(box.minX - point[0], 0, point[0] - box.maxX);
    const dy = Math.max(box.minY - point[1], 0, point[1] - box.maxY);
    const distance = Math.hypot(dx, dy);
    if (distance <= bestDistance) {
      best = drawable;
      bestDistance = distance;
    }
  }
  return best;
}

/** The selection after a click on `clipId`. With `additive` (Ctrl/⌘ or Shift held) the clip
 * joins the clips highlighted now, or leaves them when it was among them. A plain click selects
 * it alone, unless it is already among the selected clips or its block is selected: then the
 * selection stays (a drag moves the group; a block under edit stays under edit). */
export function clickSelection(current: Selection, clipId: ClipId, additive: boolean): Selection {
  const ids = highlightedClipIds(current);
  if (additive) {
    const next = ids.includes(clipId) ? ids.filter((id) => id !== clipId) : [...ids, clipId];
    return next.length > 0 ? { kind: 'clips', ids: next } : { kind: 'none' };
  }
  return ids.includes(clipId) ? current : { kind: 'clips', ids: [clipId] };
}

/** The selection a marquee produces from the clips `ids` it touches (merged with the clips
 * selected before, when it adds): those clips, or none. When the clips are exactly the ones
 * `before` highlighted, `before` itself comes back, so that a selected block stays selected while
 * the rectangle touches nothing new. */
export function marqueeSelection(before: Selection, ids: readonly ClipId[]): Selection {
  if (sameIds(highlightedClipIds(before), ids)) return before;
  return ids.length > 0 ? { kind: 'clips', ids: [...ids] } : { kind: 'none' };
}

/** Whether two selections name the same thing (the store is only written when they differ). */
export function sameSelection(a: Selection, b: Selection): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'none':
      return true;
    case 'camera':
      return true;
    case 'formula':
    case 'relation':
    case 'cameraMove':
    case 'targetCamera':
      return a.id === (b as typeof a).id;
    case 'formulas':
    case 'clips':
      return sameIds(a.ids, (b as typeof a).ids);
    case 'action':
      return a.clipId === (b as typeof a).clipId && a.actionId === (b as typeof a).actionId;
  }
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** The clips on screen at `t` (Select all): the playhead is inside them (the end of the scene
 * included, as the evaluator draws them) and their track is shown, in the project's order. */
export function clipsOnScreen(project: Project, t: number): ClipId[] {
  const hidden = new Set(project.tracks.filter((track) => track.hidden).map((track) => track.id));
  const duration = sceneDuration(project);
  return project.clips
    .filter((clip) => !hidden.has(clip.trackId) && onScreenAt(clip, t, duration))
    .map((clip) => clip.id);
}

/** New position of a dragged clip: where its keyframe was, moved by the pointer's travel. */
export function draggedPosition(start: Vec2, pointerStart: Vec2, pointer: Vec2): Vec2 {
  return [start[0] + pointer[0] - pointerStart[0], start[1] + pointer[1] - pointerStart[1]];
}

/** Where the clip's formula sits at time t (shared with the scene module). */
export { placementAt } from '../../scene';
