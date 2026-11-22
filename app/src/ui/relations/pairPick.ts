/* Which glyph of a pair editor's drawing a point means: the Preview's circle selector (`pickGlyph`,
 * ui/preview/interaction.ts) on the two formulas of the drawing (GlyphLinkCanvas.tsx). The glyph
 * with ink under the point; without one, the glyph whose box is nearest to it within the circle —
 * a point inside a box is at no distance from it, so the gap of an "=" and the bowl of an "o" mean
 * that glyph. Where several are as near (a letter under a radical, inside the radical's box), the
 * smallest: the one that cannot be aimed at any other way. Pure. */
import { boxSize, type Box, type Contour, type Vec2 } from '../../geom';
import { containsPoint, flattenContour, type FlatContour } from '../../render';
import type { PairSide, SideGlyph } from './pairGestures';

/** A glyph as the selector reads it: its outline and its box, in its formula's own coordinates. */
export interface AimedGlyph {
  /** Its canonical index. */
  index: number;
  box: Box;
  contours: readonly Contour[];
}

/** A formula of the drawing: its glyphs, and where the drawing puts its coordinates. */
export interface AimedSide {
  side: PairSide;
  dx: number;
  dy: number;
  glyphs: readonly AimedGlyph[];
}

const flatCache = new WeakMap<readonly Contour[], FlatContour[]>();

function flatOf(contours: readonly Contour[]): FlatContour[] {
  let flat = flatCache.get(contours);
  if (!flat) {
    flat = contours.map(flattenContour);
    flatCache.set(contours, flat);
  }
  return flat;
}

const areaOf = (box: Box): number => {
  const [w, h] = boxSize(box);
  return w * h;
};

/** Distances closer than this are the same distance (scene units). */
const SAME = 1e-9;

/** The glyph `point` (the drawing's coordinates, y up) means with a circle of `reach` units around
 * it, or null when none is within. */
export function pickPairGlyph(
  sides: readonly AimedSide[],
  point: Vec2,
  reach: number,
): SideGlyph | null {
  let inked: { glyph: SideGlyph; area: number } | null = null;
  let near: { glyph: SideGlyph; distance: number; area: number } | null = null;
  for (const { side, dx, dy, glyphs } of sides) {
    const own: Vec2 = [point[0] - dx, point[1] - dy];
    for (const { index, box, contours } of glyphs) {
      if (!Number.isFinite(box.minX)) continue;
      const distance = Math.hypot(
        Math.max(box.minX - own[0], 0, own[0] - box.maxX),
        Math.max(box.minY - own[1], 0, own[1] - box.maxY),
      );
      if (distance > reach) continue;
      const area = areaOf(box);
      if (distance === 0 && containsPoint(flatOf(contours), own)) {
        if (!inked || area < inked.area) inked = { glyph: { side, index }, area };
        continue;
      }
      const nearer =
        !near ||
        distance < near.distance - SAME ||
        (distance <= near.distance + SAME && area < near.area);
      if (nearer) near = { glyph: { side, index }, distance, area };
    }
  }
  return inked?.glyph ?? near?.glyph ?? null;
}
