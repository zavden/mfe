/* SVG geometry of a resolved formula, shared by the list thumbnails and the glyph view (and the
 * frames of the view's glyphs, which keep a size on screen). */
import { boxSize, contoursToSvgPath, type Box } from '../../geom';
import type { Glyph, ResolvedFormula } from '../../engine';
import { TEXT_STYLE, type GlyphStyle } from '../../model';

export interface DrawnGlyph {
  /** Canonical index (the project's index space). */
  canonical: number;
  /** Position in the render's glyph list. */
  renderIndex: number;
  label: string;
  kind: Glyph['kind'];
  /** SVG path data in formula-local scene units (y up: draw inside a y-flipped group). */
  d: string;
  bbox: Box;
  /** How the glyph paints its path: a text glyph is filled, the outline of a box and the shaft
   * of an arrow are stroked and empty. */
  style: Readonly<GlyphStyle>;
}

const pathCache = new WeakMap<Glyph, string>();
const drawnCache = new WeakMap<ResolvedFormula, readonly DrawnGlyph[]>();

function pathOf(glyph: Glyph): string {
  let d = pathCache.get(glyph);
  if (d === undefined) {
    d = contoursToSvgPath(glyph.contours, 4);
    pathCache.set(glyph, d);
  }
  return d;
}

/** The glyphs of a resolution in canonical order; canonical glyphs this render lacks are left
 * out. */
export function drawnGlyphs(resolved: ResolvedFormula): readonly DrawnGlyph[] {
  const cached = drawnCache.get(resolved);
  if (cached) return cached;
  const snapshot = resolved.formula.snapshot;
  const out: DrawnGlyph[] = [];
  resolved.canonToRender.forEach((renderIndex, canonical) => {
    const glyph = renderIndex === null ? undefined : resolved.render.glyphs[renderIndex];
    if (!glyph) return;
    out.push({
      canonical,
      renderIndex: glyph.index,
      label: snapshot?.glyphs[canonical]?.label ?? glyph.label,
      kind: glyph.kind,
      d: pathOf(glyph),
      bbox: glyph.bbox,
      style: glyph.style ?? TEXT_STYLE,
    });
  });
  drawnCache.set(resolved, out);
  return out;
}

/** SVG viewBox (minX, minY, width, height) for a y-flipped formula, with a small margin. */
export function viewBoxRect(bbox: Box, margin = 0.1): [number, number, number, number] {
  const [w, h] = boxSize(bbox);
  const pad = Math.max(w, h, 0.2) * margin;
  return [bbox.minX - pad, -bbox.maxY - pad, w + 2 * pad, h + 2 * pad];
}

/** `viewBoxRect` as the attribute's text ("minX minY width height"). */
export function viewBoxOf(bbox: Box, margin = 0.1): string {
  return viewBoxRect(bbox, margin).join(' ');
}

/** CSS pixels per unit of a drawing whose viewBox is `viewWidth` × `viewHeight`, shown whole
 * (`preserveAspectRatio="xMidYMid meet"`) in a box of `width` × `height` CSS pixels; null while
 * either has no size (not laid out yet, hidden). */
export function meetScale(
  width: number,
  height: number,
  viewWidth: number,
  viewHeight: number,
): number | null {
  if (!(width > 0 && height > 0 && viewWidth > 0 && viewHeight > 0)) return null;
  return Math.min(width / viewWidth, height / viewHeight);
}

/** The box grown evenly around its centre to at least `minWidth` × `minHeight`: a side already
 * that long stays as it is. */
export function atLeastSize(box: Box, minWidth: number, minHeight: number): Box {
  const grow = (min: number, max: number, least: number): [number, number] => {
    const missing = least - (max - min);
    return missing > 0 ? [min - missing / 2, max + missing / 2] : [min, max];
  };
  const [minX, maxX] = grow(box.minX, box.maxX, minWidth);
  const [minY, maxY] = grow(box.minY, box.maxY, minHeight);
  return { minX, minY, maxX, maxY };
}
