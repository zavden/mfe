/* Editor overlays drawn on top of the scene: hover outline, selection boxes, the outlines of the
 * glyphs a selected animation block animates, the glyphs picked with Alt, the guide lines of a
 * snapped drag, the selection rectangle. They are UI, not part of the drawables, so they never reach a video export. The
 * scene's background is the author's choice, so every line is drawn twice: a contrasting halo,
 * then the colour on top — visible on any background. */
import { parseColor, type Box, type Vec2 } from '../../geom';
import {
  frameRect,
  pixelsPerUnit,
  sceneToPixelMatrix,
  traceContours,
  type Camera,
  type Surface,
} from '../../render';
import type { Drawable } from '../../scene';
import type { SplineNode } from '../../model';
import { CORNERS, HANDLE_SIZE, ROTATE_RADIUS, type HandleGeometry, type HandleId } from './handles';
import type { PathSelection } from './pathEdit';
import type { SnapGuide, SpanGuide } from './snap';

/** Transform handles of the selected clip (Shift held or a transform drag running). */
export interface TransformOverlay {
  geometry: HandleGeometry;
  /** The handle under the pointer, or the one being dragged. */
  active: HandleId | null;
}

/** A route of the pair that is not the one edited (D167), in the scene's frame: dimmed, thin. */
export interface RouteOverlay {
  /** The path it follows on its own chord, as a polyline. */
  curve: readonly Vec2[];
  /** It has a path of its own: drawn solid, with the dot of an edited path at `mark`; one that
   * follows the common path is dashed. */
  own: boolean;
  /** A point of the curve a third of the way along (`routeMark`), clear of the glyph the morph
   * draws halfway at the playhead. */
  mark: Vec2;
  /** A click here would choose it: drawn brighter. */
  hot: boolean;
}

/** The custom path under edit (`pathEdit.ts`), in the scene's frame. */
export interface PathOverlay {
  /** From the centre at the start to the centre at the end; null when they coincide (the curve
   * and its nodes are then empty: only the other routes are drawn). */
  chord: [Vec2, Vec2] | null;
  /** The curve as a polyline. */
  curve: readonly Vec2[];
  nodes: readonly SplineNode[];
  selected: PathSelection | null;
  hover: PathSelection | null;
  /** The pair's other routes, under the edited curve (none on a pair without routes). */
  routes?: readonly RouteOverlay[];
}

export interface OverlayModel {
  /** The glyph under the cursor. */
  hover: Drawable | null;
  /** Boxes of the selected clips. */
  selected: readonly Box[];
  /** Boxes of the clips that use the formula selected in the Creator. */
  related: readonly Box[];
  /** Oriented box and handles; the clip's plain selection box is left out of `selected`. */
  transform?: TransformOverlay | null;
  /** The glyphs (as drawn now) of the selected animation block, outlined in its colour. */
  block?: { drawables: readonly Drawable[]; color: string } | null;
  /** The glyphs picked with Alt (as drawn now): filled faintly and outlined in the colour of
   * the picks, `colors.pick` (D74, D132). */
  picked?: readonly Drawable[];
  /** Where a drag is snapped right now: a line along each shared edge or centre. */
  guides?: readonly SnapGuide[];
  /** The selection rectangle being drawn (scene units). */
  marquee?: Box | null;
  /** The rectangle picks glyphs (Alt) instead of selecting clips: it is drawn in the colour of
   * the picks. */
  glyphMarquee?: boolean;
  /** Glyphs to mark (the reference symbol of align by symbol), outlined in the guide colour. */
  marked?: readonly Drawable[];
  /** Boxes of the glyphs colours in order has copied from or pasted on (D129): each framed in
   * the guide colour, clear of its ink — the glyph's colour is what is being looked at. */
  framed?: readonly Box[];
  /** The reach of align by symbol around the pointer: a faint circle (scene units), in the
   * guide colour. The circle selector's is `selector`: in the accent and dashed, so that the two
   * read apart whatever guide colour is preferred. */
  halo?: { center: Vec2; radius: number; selector?: boolean } | null;
  /** The path being edited: its chord, curve, anchors and handles. */
  path?: PathOverlay | null;
  /** How wide the guide lines are, in CSS px (1 when absent), rounded to whole device pixels. */
  guideWidth?: number;
  /** `pick`: the colour of the glyphs picked with Alt and of their rectangle, a preference
   * (`pickColor`); the accent when absent. */
  colors: { accent: string; frame: string; handleFill: string; guide: string; pick?: string };
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A halo that contrasts with `color` ('#RRGGBB'): dark under a light colour, light under a dark
 * one. */
export function haloOf(color: string): string {
  const [r, g, b] = parseColor(color).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.18 ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.8)';
}

/** Stroke the current path in `color`, `width` CSS px wide, over its halo (`halo` CSS px wider
 * than the line, 2 unless said otherwise). */
function strokeWithHalo(ctx: Context2D, color: string, width: number, px: number, halo = 2): void {
  ctx.strokeStyle = haloOf(color);
  ctx.lineWidth = (width + halo) * px;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width * px;
  ctx.stroke();
}

/** The snap guides, as lines of whole device pixels laid on the pixel grid: a fine line that
 * straddles two pixels is half as bright on each, and a guide has to read at a glance. The
 * tuple is the scene-to-pixel matrix's `a`, `d`, `e` and `f` (the guides are axis-aligned).
 * Leaves the context with the identity transform. */
function drawGuides(
  ctx: Context2D,
  model: OverlayModel,
  [a, d, e, f]: [number, number, number, number],
  dpr: number,
): void {
  if (!model.guides) return;
  const line = Math.max(1, Math.round((model.guideWidth ?? 1) * dpr));
  // The middle of a pixel for an odd width, the edge between two for an even one.
  const align = (v: number) => (line % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v));
  // Past the boxes' ends, so that a guide shows beside what it aligns.
  const reach = 12 * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  for (const guide of model.guides) {
    if (guide.kind === 'span') continue;
    if (guide.axis === 'x') {
      const x = align(a * guide.at + e);
      const [y0, y1] = [d * guide.from + f, d * guide.to + f];
      ctx.moveTo(x, Math.min(y0, y1) - reach);
      ctx.lineTo(x, Math.max(y0, y1) + reach);
    } else {
      const y = align(d * guide.at + f);
      const [x0, x1] = [a * guide.from + e, a * guide.to + e];
      ctx.moveTo(Math.min(x0, x1) - reach, y);
      ctx.lineTo(Math.max(x0, x1) + reach, y);
    }
  }
  // The halo is one device pixel wider on each side, whatever the line's width.
  strokeWithHalo(ctx, model.colors.guide, line / dpr, dpr, 2 / dpr);
  drawSpans(ctx, model, [a, d, e, f], line, dpr);
}

/** The span guides (equal gaps, equal sizes): each stretch a bar with a tick at each end, on
 * the pixel grid like the lines, in the guide colour and width, set 8 px outside the band the
 * boxes share (below a row, right of a column) so that they read apart from the lines. */
function drawSpans(
  ctx: Context2D,
  model: OverlayModel,
  [a, d, e, f]: [number, number, number, number],
  line: number,
  dpr: number,
): void {
  const spans = (model.guides ?? []).filter((g): g is SpanGuide => g.kind === 'span');
  if (spans.length === 0) return;
  const align = (v: number) => (line % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v));
  const tick = 4 * dpr;
  const out = 8 * dpr;
  ctx.beginPath();
  for (const guide of spans) {
    for (const s of guide.spans) {
      if (guide.axis === 'x') {
        const y = align(d * s.at + f + out);
        const [x0, x1] = [align(a * s.from + e), align(a * s.to + e)];
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.moveTo(x0, y - tick);
        ctx.lineTo(x0, y + tick);
        ctx.moveTo(x1, y - tick);
        ctx.lineTo(x1, y + tick);
      } else {
        const x = align(a * s.at + e + out);
        const [y0, y1] = [align(d * s.from + f), align(d * s.to + f)];
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.moveTo(x - tick, y0);
        ctx.lineTo(x + tick, y0);
        ctx.moveTo(x - tick, y1);
        ctx.lineTo(x + tick, y1);
      }
    }
  }
  ctx.strokeStyle = haloOf(model.colors.guide);
  ctx.lineWidth = line + 2;
  ctx.stroke();
  ctx.strokeStyle = model.colors.guide;
  ctx.lineWidth = line;
  ctx.stroke();
}

export function drawOverlay(
  ctx: Context2D,
  camera: Camera,
  surface: Surface,
  model: OverlayModel,
  dpr: number,
): void {
  const scale = pixelsPerUnit(camera, surface);
  const px = dpr / scale; // one CSS pixel in scene units
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // The Manim frame boundary, visible when the view is zoomed out or panned (when the frame
  // fills the canvas, the element's own border already marks it).
  const frame = frameRect(camera, surface);
  const fillsCanvas =
    Math.abs(frame.x) < 1.5 &&
    Math.abs(frame.y) < 1.5 &&
    Math.abs(frame.width - surface.width) < 3 &&
    Math.abs(frame.height - surface.height) < 3;
  if (!fillsCanvas) {
    ctx.strokeStyle = model.colors.frame;
    ctx.lineWidth = dpr;
    ctx.strokeRect(frame.x + 0.5, frame.y + 0.5, frame.width - 1, frame.height - 1);
  }

  const [a, b, c, d, e, f] = sceneToPixelMatrix(camera, surface);
  ctx.setTransform(a, b, c, d, e, f);
  ctx.lineJoin = 'round';

  const pad = 4 * px;
  const strokeBoxes = (boxes: readonly Box[], dash: boolean, width: number, alpha: number) => {
    if (boxes.length === 0) return;
    ctx.globalAlpha = alpha;
    ctx.setLineDash(dash ? [5 * px, 4 * px] : []);
    ctx.beginPath();
    for (const box of boxes) {
      ctx.rect(
        box.minX - pad,
        box.minY - pad,
        box.maxX - box.minX + 2 * pad,
        box.maxY - box.minY + 2 * pad,
      );
    }
    strokeWithHalo(ctx, model.colors.accent, width, px);
  };

  strokeBoxes(model.related, true, 1, 0.7);
  strokeBoxes(model.selected, false, 1.5, 1);

  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  if (model.block && model.block.drawables.length > 0) {
    ctx.beginPath();
    for (const d of model.block.drawables) traceContours(ctx, d.path.contours);
    strokeWithHalo(ctx, model.block.color, 1.5, px);
  }

  if (model.picked && model.picked.length > 0) {
    ctx.beginPath();
    for (const d of model.picked) traceContours(ctx, d.path.contours);
    const color = model.colors.pick ?? model.colors.accent;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = color;
    ctx.fill('nonzero');
    ctx.globalAlpha = 1;
    strokeWithHalo(ctx, color, 1.5, px);
  }

  if (model.guides && model.guides.length > 0) {
    drawGuides(ctx, model, [a, d, e, f], dpr);
    ctx.setTransform(a, b, c, d, e, f);
  }

  if (model.halo) {
    ctx.beginPath();
    ctx.arc(model.halo.center[0], model.halo.center[1], model.halo.radius, 0, Math.PI * 2);
    const color = model.halo.selector ? model.colors.accent : model.colors.guide;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.fill();
    if (model.halo.selector) {
      // The accent is dark in the light theme and the scene is the author's: over its contrast,
      // like every line of the accent here.
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([4 * px, 3 * px]);
      strokeWithHalo(ctx, color, 1, px, 1.5);
    } else {
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([]);
      ctx.strokeStyle = color;
      ctx.lineWidth = px;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  if (model.marked && model.marked.length > 0) {
    ctx.beginPath();
    for (const d of model.marked) traceContours(ctx, d.path.contours);
    strokeWithHalo(ctx, model.colors.guide, 2, px);
  }

  if (model.framed && model.framed.length > 0) {
    const gap = 3 * px;
    ctx.beginPath();
    for (const box of model.framed) {
      ctx.rect(
        box.minX - gap,
        box.minY - gap,
        box.maxX - box.minX + 2 * gap,
        box.maxY - box.minY + 2 * gap,
      );
    }
    strokeWithHalo(ctx, model.colors.guide, 1, px);
  }

  if (model.marquee) {
    const m = model.marquee;
    // A rectangle that picks glyphs wears their colour; one that selects clips, the accent.
    const color = (model.glyphMarquee ? model.colors.pick : undefined) ?? model.colors.accent;
    ctx.beginPath();
    ctx.rect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash([4 * px, 3 * px]);
    strokeWithHalo(ctx, color, 1, px);
    ctx.setLineDash([]);
  }

  if (model.transform) drawTransformHandles(ctx, model.transform, model.colors, px);
  if (model.path) drawPath(ctx, model.path, model.colors, px);
  if (model.hover) {
    ctx.beginPath();
    traceContours(ctx, model.hover.path.contours);
    strokeWithHalo(ctx, model.colors.accent, 2, px);
  }
  ctx.restore();
}

/** The oriented box, the stem and the rotation circle, and the corner squares, in scene space
 * with sizes in CSS pixels (`px` = one CSS pixel in scene units). */
function drawTransformHandles(
  ctx: Context2D,
  { geometry, active }: TransformOverlay,
  colors: OverlayModel['colors'],
  px: number,
): void {
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  ctx.beginPath();
  CORNERS.forEach((id, i) => {
    const [x, y] = geometry.corners[id];
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.moveTo(geometry.stemStart[0], geometry.stemStart[1]);
  ctx.lineTo(geometry.rotate[0], geometry.rotate[1]);
  strokeWithHalo(ctx, colors.accent, 1.5, px);

  // Each handle: its halo, then the fill and the outline.
  const paint = (hot: boolean) => {
    ctx.strokeStyle = haloOf(colors.accent);
    ctx.lineWidth = 3.5 * px;
    ctx.stroke();
    ctx.fillStyle = hot ? colors.accent : colors.handleFill;
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5 * px;
    ctx.stroke();
  };

  ctx.beginPath();
  ctx.arc(geometry.rotate[0], geometry.rotate[1], ROTATE_RADIUS * px, 0, Math.PI * 2);
  paint(active === 'rotate');

  const half = (HANDLE_SIZE / 2) * px;
  for (const id of CORNERS) {
    const [x, y] = geometry.corners[id];
    ctx.beginPath();
    ctx.rect(x - half, y - half, 2 * half, 2 * half);
    paint(active === id);
  }
}

/** Radius of a handle's knob, CSS px. */
const KNOB_RADIUS = 3.5;

/** Radius of the dot that marks a route with a path of its own, CSS px (the size of the
 * `EditedPathDot` of the lists). */
const OWN_DOT_RADIUS = 3.5;

/** The routes that are not edited (D167), dimmed under the edited curve, in the accent colour
 * of a path: solid with a dot on it — as the lists mark an edited path — when the route has a
 * path of its own, dashed when it follows the common one; the one a click would choose, brighter
 * and wider. */
function drawRoutes(
  ctx: Context2D,
  routes: readonly RouteOverlay[],
  colors: OverlayModel['colors'],
  px: number,
): void {
  for (const route of routes) {
    if (route.curve.length < 2) continue;
    ctx.globalAlpha = route.hot ? 0.95 : 0.5;
    ctx.setLineDash(route.own ? [] : [5 * px, 4 * px]);
    ctx.beginPath();
    route.curve.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    strokeWithHalo(ctx, colors.accent, route.hot ? 2 : 1, px, 1.5);
    ctx.setLineDash([]);
    if (route.own) {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(route.mark[0], route.mark[1], OWN_DOT_RADIUS * px, 0, Math.PI * 2);
      ctx.fillStyle = colors.accent;
      ctx.fill();
      ctx.strokeStyle = haloOf(colors.accent);
      ctx.lineWidth = 1.5 * px;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** The path under edit: the other routes of its pair dimmed (`drawRoutes`), the chord dashed in
 * the guide colour, the curve in the accent colour, each handle as a stem from its anchor to a
 * round knob, each anchor a square (a circle when smooth) — the two ends, which are fixed, in the
 * guide colour. The selected part is filled, the hovered one drawn bolder. */
function drawPath(
  ctx: Context2D,
  path: PathOverlay,
  colors: OverlayModel['colors'],
  px: number,
): void {
  if (path.routes && path.routes.length > 0) drawRoutes(ctx, path.routes, colors, px);
  if (path.chord) {
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.beginPath();
    ctx.moveTo(path.chord[0][0], path.chord[0][1]);
    ctx.lineTo(path.chord[1][0], path.chord[1][1]);
    strokeWithHalo(ctx, colors.guide, 1, px);
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  if (path.curve.length > 1) {
    ctx.beginPath();
    path.curve.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    strokeWithHalo(ctx, colors.accent, 1.5, px);
  }
  const is = (sel: PathSelection | null, node: number, part: PathSelection['part']) =>
    sel !== null && sel.node === node && sel.part === part;
  const paint = (hot: boolean, bold: boolean, color: string) => {
    ctx.strokeStyle = haloOf(color);
    ctx.lineWidth = (bold ? 4.5 : 3.5) * px;
    ctx.stroke();
    ctx.fillStyle = hot ? color : colors.handleFill;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = (bold ? 2.5 : 1.5) * px;
    ctx.stroke();
  };
  path.nodes.forEach((node, i) => {
    for (const part of ['in', 'out'] as const) {
      const handle = node[part];
      if (!handle) continue;
      ctx.beginPath();
      ctx.moveTo(node.at[0], node.at[1]);
      ctx.lineTo(handle[0], handle[1]);
      strokeWithHalo(ctx, colors.accent, 1, px);
      ctx.beginPath();
      ctx.arc(handle[0], handle[1], KNOB_RADIUS * px, 0, Math.PI * 2);
      paint(is(path.selected, i, part), is(path.hover, i, part), colors.accent);
    }
  });
  const half = (HANDLE_SIZE / 2) * px;
  path.nodes.forEach((node, i) => {
    const fixed = i === 0 || i === path.nodes.length - 1;
    ctx.beginPath();
    if (node.smooth) ctx.arc(node.at[0], node.at[1], half, 0, Math.PI * 2);
    else ctx.rect(node.at[0] - half, node.at[1] - half, 2 * half, 2 * half);
    paint(
      !fixed && is(path.selected, i, 'at'),
      !fixed && is(path.hover, i, 'at'),
      fixed ? colors.guide : colors.accent,
    );
  });
}
