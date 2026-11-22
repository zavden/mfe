/* The view of the drawing that links glyphs (GlyphLinkCanvas.tsx): which part of the drawing its
 * element shows. A view is a centre and a zoom, as the Preview's: at zoom 1 the whole drawing
 * fits the element (`fitView`), and the same view shows the same thing in an element of another
 * size. The drawing is the frame of a camera (`render/camera.ts`), so the arithmetic of the zoom
 * and of the pan is the Preview's own. Pure. */
import type { Box, Vec2 } from '../../geom';
import type { PairLayout } from './linkLayout';
import {
  fitScale,
  panByPixels,
  pixelsPerUnit,
  toScene,
  type Camera,
  type Surface,
} from '../../render';

/** The box of a drawing, in its coordinates (y up): `LinkFrame` is one. */
export interface DrawingBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PairView {
  /** The point of the drawing at the centre of the element. */
  center: Vec2;
  /** 1: the whole drawing fits the element. */
  zoom: number;
}

/** The bounds of the zoom: out to a drawing half the size of the element, in to forty times. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 40;
/** What a press of the − and + keys zooms by, as in the Preview. */
export const ZOOM_STEP = 1.25;
/** The size on screen (CSS px) of the text beyond which a drawing does not open zoomed in: a
 * formula of two glyphs that take part is not opened with letters a hand tall. And beyond which
 * a layout is no better for drawing it larger (`preferredLayout`). */
export const OPENING_TEXT_PX = 32;

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** The view that shows the whole drawing. */
export function fitView(frame: DrawingBox): PairView {
  return { center: [(frame.left + frame.right) / 2, (frame.top + frame.bottom) / 2], zoom: 1 };
}

/** Whether a view is the one that shows the whole drawing. */
export function isFitView(frame: DrawingBox, view: PairView): boolean {
  const fit = fitView(frame);
  return (
    Math.abs(view.zoom - 1) < 1e-6 &&
    Math.abs(view.center[0] - fit.center[0]) < 1e-6 &&
    Math.abs(view.center[1] - fit.center[1]) < 1e-6
  );
}

/** The camera whose frame is the drawing, looking as the view says. */
export function viewCamera(frame: DrawingBox, view: PairView): Camera {
  return {
    frameWidth: frame.right - frame.left,
    frameHeight: frame.top - frame.bottom,
    center: view.center,
    zoom: view.zoom,
  };
}

/** A view with its centre inside the drawing: the drawing cannot be moved out of sight. */
function kept(frame: DrawingBox, view: PairView): PairView {
  return {
    zoom: view.zoom,
    center: [
      Math.min(frame.right, Math.max(frame.left, view.center[0])),
      Math.min(frame.top, Math.max(frame.bottom, view.center[1])),
    ],
  };
}

/** CSS pixels per unit of the drawing under a view, in an element of `surface`. */
export function viewScale(frame: DrawingBox, view: PairView, surface: Surface): number {
  return pixelsPerUnit(viewCamera(frame, view), surface);
}

/** What the element shows under a view, as an SVG viewBox (y down): x, y, width, height. */
export function viewBoxOf(
  frame: DrawingBox,
  view: PairView,
  surface: Surface,
): [number, number, number, number] {
  const scale = viewScale(frame, view, surface);
  const width = surface.width / scale;
  const height = surface.height / scale;
  return [view.center[0] - width / 2, -view.center[1] - height / 2, width, height];
}

/** The view zoomed by `factor` about `pixel` (CSS px from the element's corner): the point of the
 * drawing under it stays there. */
export function zoomedView(
  frame: DrawingBox,
  view: PairView,
  surface: Surface,
  pixel: Vec2,
  factor: number,
): PairView {
  const zoom = clampZoom(view.zoom * factor);
  if (zoom === view.zoom) return view;
  const camera = viewCamera(frame, view);
  const anchor = toScene(pixel, camera, surface);
  const scale = fitScale(camera, surface) * zoom;
  return kept(frame, {
    zoom,
    center: [
      anchor[0] - (pixel[0] - surface.width / 2) / scale,
      anchor[1] + (pixel[1] - surface.height / 2) / scale,
    ],
  });
}

/** The view zoomed by `factor` about the middle of the element: the − and + keys. */
export function steppedView(
  frame: DrawingBox,
  view: PairView,
  surface: Surface,
  factor: number,
): PairView {
  return zoomedView(frame, view, surface, [surface.width / 2, surface.height / 2], factor);
}

/** The view moved by a travel of the pointer in CSS pixels: the drawing follows it. */
export function pannedView(
  frame: DrawingBox,
  view: PairView,
  surface: Surface,
  dx: number,
  dy: number,
): PairView {
  const { center } = panByPixels(viewCamera(frame, view), surface, dx, dy);
  return kept(frame, { zoom: view.zoom, center });
}

/** The view a drawing opens with: `focus` — the box of what takes part, in the drawing's
 * coordinates — as large as the element shows it whole, with `margin` units around it. It never
 * opens zoomed out, nor in beyond a text of `OPENING_TEXT_PX` (`text`: the size of the drawing's
 * text, in units); a focus that is about the whole drawing, or none, opens on the whole drawing. */
export function openingView(
  frame: DrawingBox,
  focus: Box | null,
  surface: Surface,
  text: number,
  margin: number,
): PairView {
  const fit = fitView(frame);
  if (!focus || !(surface.width > 0 && surface.height > 0)) return fit;
  const width = focus.maxX - focus.minX + 2 * margin;
  const height = focus.maxY - focus.minY + 2 * margin;
  if (!(width > 0 && height > 0)) return fit;
  const whole = fitScale(viewCamera(frame, fit), surface);
  const most = text > 0 ? Math.max(1, OPENING_TEXT_PX / (text * whole)) : 1;
  const zoom = Math.min(
    most,
    MAX_ZOOM,
    Math.min(surface.width / width, surface.height / height) / whole,
  );
  // Hardly nearer than the whole drawing: the whole drawing, which «Fit» then need not offer.
  if (zoom < 1.05) return fit;
  return kept(frame, {
    zoom,
    center: [(focus.minX + focus.maxX) / 2, (focus.minY + focus.maxY) / 2],
  });
}

/** A layout a drawing could open with: its frame, the box of what takes part in it, and the
 * margin its opening view leaves around that. */
export interface LayoutCandidate {
  frame: DrawingBox;
  focus: Box | null;
  margin: number;
}

/** How much larger side by side must draw the text of what takes part to be the layout a
 * drawing opens with: stacked is the one every drawing had, and stays the one of a tie. */
const SIDE_ADVANTAGE = 1.1;

/** The layout a drawing opens with: the one whose opening view draws its text larger — stacked
 * for wide formulas, side by side for tall ones —, as far as `OPENING_TEXT_PX`: a short formula
 * that stacked already draws that large stays stacked. `text` is the size of the drawing's text,
 * in units. The element is `width` CSS px wide, and as tall as the whole drawing of a layout
 * makes it, up to `maxHeight`; with no such limit (null: a dialog that was given a size) it is
 * `height` tall whatever the layout. */
export function preferredLayout(
  candidates: Record<PairLayout, LayoutCandidate>,
  element: { width: number; height: number; maxHeight: number | null },
  text: number,
): PairLayout {
  const scale = ({ frame, focus, margin }: LayoutCandidate): number => {
    const whole = (frame.top - frame.bottom) / (frame.right - frame.left);
    const surface = {
      width: element.width,
      height:
        element.maxHeight === null
          ? element.height
          : Math.min(element.width * whole, element.maxHeight),
    };
    return viewScale(frame, openingView(frame, focus, surface, text, margin), surface);
  };
  /** What the size of its text is worth to a layout: its pixels, up to those that are enough. */
  const worth = (candidate: LayoutCandidate): number =>
    Math.min(scale(candidate) * text, OPENING_TEXT_PX);
  return worth(candidates.side) > worth(candidates.stacked) * SIDE_ADVANTAGE ? 'side' : 'stacked';
}
