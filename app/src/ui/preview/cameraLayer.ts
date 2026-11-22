/* The scene's camera over the Preview's world view (D190): the frame the scene is filmed through
 * at the playhead — a sky-blue rectangle with a dash of its own («two long, two short»), the
 * corners of a viewfinder and its name —, the target cameras in pink with theirs, the frames the
 * moves go to on their own with the number of their move, the frame of 0 s, Manim's own frame,
 * the route that joins them and a veil over what the current camera leaves out. Drawn in device
 * pixels, each line over a halo, so that it reads on any background, as the guides are; it is UI,
 * and never reaches an export. The geometry it draws with is `cameraGeometry.ts`'s, which the
 * gestures hit-test with too. */
import type { Box, Vec2 } from '../../geom';
import { toPixel, type Camera, type Surface } from '../../render';
import type { CameraSceneModel } from '../camera/cameraScene';
import {
  cornerPoints,
  CORNER_MARK,
  CROSS_SIZE,
  HANDLE_SIZE,
  labelRect,
  samePiece,
  type CameraPart,
  type CameraPiece,
  type PixelRect,
} from './cameraGeometry';
import { haloOf } from './overlay';

/** The camera's sky blue and a target camera's pink: the same in both themes, as the guides'
 * colours are (the owner's choice). */
export const CAMERA_SKY = '#7DD3FC';
export const CAMERA_PINK = '#FF7AD9';
/** Manim's own frame, a quiet line. */
const ORIGIN_COLOR = '#C9D4DA';
/** What is outside the current camera: a mid grey that dims a dark background and a light one. */
const VEIL = 'rgba(128, 128, 128, 0.3)';
/** The dash of the current camera: two long, two short. */
const CAMERA_DASH = [12, 4, 12, 4, 3, 4, 3, 4];
/** How much of its strength a rectangle keeps while another one is isolated. */
export const FAINT = 0.3;

/** Where the camera's rectangles are on the canvas, as text (JSON: CSS px from the canvas corner
 * — left, top, width, height — and whose frame the current camera rests in): what the Preview
 * says of them for tests and tooling. */
export function describeCameraRects(
  model: CameraSceneModel,
  camera: Camera,
  surface: Surface,
  dpr: number,
): string {
  const css = (box: Box) => {
    const r = pixelRect(box, camera, surface);
    return [r.left, r.top, r.width, r.height].map((v) => Math.round((v / dpr) * 10) / 10);
  };
  return JSON.stringify({
    camera: css(model.current.box),
    owner: model.current.owner,
    start: css(model.start.box),
    origin: css(model.origin),
    targets: Object.fromEntries(model.targets.map((t) => [t.id, css(t.box)])),
    moves: Object.fromEntries(model.destinations.map((d) => [d.moveId, css(d.box)])),
  });
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CameraLayerOptions {
  /** Device pixels per CSS pixel. */
  dpr: number;
  /** Dim what the current camera leaves out. */
  veil: boolean;
  /** Draw the route between the frames. */
  route: boolean;
  /** The rectangle that is selected: drawn stronger, with a handle at each corner. */
  selected: CameraPiece | null;
  /** What the pointer is over, or holds. */
  hover: { piece: CameraPiece; part: CameraPart } | null;
  /** The rectangle of an isolated move (`viewStore.ts`): drawn last, over the others, which are
   * drawn faint, as the route is — they do not answer the pointer. */
  isolated?: CameraPiece | null;
}

/** A box of the scene as a rectangle of device pixels. */
export function pixelRect(box: Box, camera: Camera, surface: Surface): PixelRect {
  const [left, top] = toPixel([box.minX, box.maxY], camera, surface);
  const [right, bottom] = toPixel([box.maxX, box.minY], camera, surface);
  return { left, top, width: right - left, height: bottom - top };
}

export function drawCameraLayer(
  ctx: Context2D,
  camera: Camera,
  surface: Surface,
  model: CameraSceneModel,
  options: CameraLayerOptions,
): void {
  const { dpr } = options;
  const isolated = options.isolated ?? null;
  const rectOf = (box: Box) => pixelRect(box, camera, surface);
  const point = (p: Vec2) => toPixel(p, camera, surface);
  const current = rectOf(model.current.box);
  const owner = model.current.owner;
  const isSelected = (piece: CameraPiece) =>
    options.selected !== null && samePiece(options.selected, piece);
  const isHot = (piece: CameraPiece) =>
    options.hover !== null && samePiece(options.hover.piece, piece);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';

  /** Stroke the current path over its halo. */
  const stroke = (color: string, width: number, dash: readonly number[] = []) => {
    ctx.setLineDash([]);
    ctx.strokeStyle = haloOf(color);
    ctx.lineWidth = (width + 2) * dpr;
    ctx.stroke();
    ctx.setLineDash(dash.map((d) => d * dpr));
    ctx.strokeStyle = color;
    ctx.lineWidth = width * dpr;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  /** A rectangle on whole device pixels, so that a thin line is crisp. */
  const trace = (r: PixelRect) => {
    const x = Math.round(r.left) + 0.5;
    const y = Math.round(r.top) + 0.5;
    ctx.beginPath();
    ctx.rect(x, y, Math.round(r.width), Math.round(r.height));
  };
  /** A name on a small plate above the top-left corner of a rectangle. */
  const label = (r: PixelRect, text: string, color: string, ink: string) => {
    const plate = labelRect(r, text, dpr);
    ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
    const width = Math.max(plate.width, ctx.measureText(text).width + 12 * dpr);
    ctx.fillStyle = haloOf(color);
    ctx.fillRect(plate.left - dpr, plate.top - dpr, width + 2 * dpr, plate.height + 2 * dpr);
    ctx.fillStyle = color;
    ctx.fillRect(plate.left, plate.top, width, plate.height);
    ctx.fillStyle = ink;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, plate.left + 6 * dpr, plate.top + plate.height / 2 + dpr * 0.5);
  };
  /** The handles of the selected rectangle: a square at each corner. */
  const handles = (r: PixelRect, color: string, hot: CameraPart | null) => {
    const half = (HANDLE_SIZE / 2) * dpr;
    for (const [id, [x, y]] of Object.entries(cornerPoints(r)) as [CameraPart, Vec2][]) {
      ctx.beginPath();
      ctx.rect(Math.round(x - half) + 0.5, Math.round(y - half) + 0.5, 2 * half, 2 * half);
      ctx.strokeStyle = haloOf(color);
      ctx.lineWidth = 3 * dpr;
      ctx.stroke();
      ctx.fillStyle = hot === id ? color : '#10212c';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }
  };
  const hotPart = (piece: CameraPiece) =>
    options.hover !== null && samePiece(options.hover.piece, piece) ? options.hover.part : null;
  /** Draw a rectangle of the camera: faint while another one is isolated, and the isolated one
   * after them all, so that nothing lies over it. */
  const onTop: (() => void)[] = [];
  const paint = (piece: CameraPiece, draw: () => void) => {
    if (isolated && samePiece(piece, isolated)) {
      onTop.push(draw);
      return;
    }
    ctx.globalAlpha = isolated ? FAINT : 1;
    draw();
    ctx.globalAlpha = 1;
  };

  // What the current camera leaves out, dimmed: everything but its rectangle.
  if (options.veil) {
    ctx.beginPath();
    ctx.rect(0, 0, surface.width, surface.height);
    ctx.rect(current.left, current.top, current.width, current.height);
    ctx.fillStyle = VEIL;
    ctx.fill('evenodd');
  }

  // Manim's own frame.
  trace(rectOf(model.origin));
  stroke(ORIGIN_COLOR, 1, [2, 4]);

  // The route: a line from frame to frame, with an arrowhead half way.
  if (options.route) {
    ctx.globalAlpha = isolated ? FAINT : 1;
    for (const leg of model.route) {
      const [x0, y0] = point(leg.from);
      const [x1, y1] = point(leg.to);
      const length = Math.hypot(x1 - x0, y1 - y0);
      if (length < 6 * dpr) continue;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      stroke(CAMERA_SKY, leg.running ? 2 : 1, leg.running ? [] : [6, 4]);
      const [ux, uy] = [(x1 - x0) / length, (y1 - y0) / length];
      const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
      const head = 6 * dpr;
      ctx.beginPath();
      ctx.moveTo(mx + ux * head, my + uy * head);
      ctx.lineTo(mx - ux * head - uy * head * 0.7, my - uy * head + ux * head * 0.7);
      ctx.lineTo(mx - ux * head + uy * head * 0.7, my - uy * head - ux * head * 0.7);
      ctx.closePath();
      ctx.fillStyle = haloOf(CAMERA_SKY);
      ctx.fill();
      ctx.strokeStyle = CAMERA_SKY;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
      ctx.fillStyle = CAMERA_SKY;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The frame of 0 s, while the camera is somewhere else.
  if (owner?.kind !== 'initial') {
    const piece: CameraPiece = { kind: 'start' };
    paint(piece, () => {
      const start = rectOf(model.start.box);
      trace(start);
      stroke(CAMERA_SKY, isSelected(piece) ? 2 : isHot(piece) ? 1.5 : 1, [3, 3]);
      label(start, 'Start', CAMERA_SKY, '#06283a');
      if (isSelected(piece)) handles(start, CAMERA_SKY, hotPart(piece));
    });
  }

  // The frames the moves go to on their own, each with the number of its move.
  for (const destination of model.destinations) {
    const piece: CameraPiece = { kind: 'move', id: destination.moveId };
    if (owner?.kind === 'move' && owner.id === destination.moveId) continue;
    paint(piece, () => {
      const r = rectOf(destination.box);
      trace(r);
      stroke(CAMERA_PINK, isSelected(piece) || isHot(piece) ? 2 : 1, [5, 3]);
      label(r, String(destination.order), CAMERA_PINK, '#3a0627');
      if (isSelected(piece)) handles(r, CAMERA_PINK, hotPart(piece));
    });
  }

  // The target cameras, with their names.
  for (const target of model.targets) {
    const piece: CameraPiece = { kind: 'target', id: target.id };
    if (owner?.kind === 'target' && owner.id === target.id) continue;
    paint(piece, () => {
      const r = rectOf(target.box);
      trace(r);
      stroke(CAMERA_PINK, isSelected(piece) || isHot(piece) ? 2.5 : 1.5);
      label(r, target.name, CAMERA_PINK, '#3a0627');
      if (isSelected(piece)) handles(r, CAMERA_PINK, hotPart(piece));
    });
  }

  // The current camera: its dashed rectangle, the corners of a viewfinder, the cross of its
  // centre and its name — with the target camera's it rests on, when it rests on one.
  const cameraPiece: CameraPiece = { kind: 'camera' };
  paint(cameraPiece, () => {
    const strong = isSelected(cameraPiece) || isHot(cameraPiece);
    trace(current);
    stroke(CAMERA_SKY, strong ? 2.5 : 2, CAMERA_DASH);
    const mark = CORNER_MARK * dpr;
    const corners = cornerPoints(current);
    ctx.beginPath();
    for (const [id, [x, y]] of Object.entries(corners) as [CameraPart, Vec2][]) {
      const sx = id.endsWith('w') ? 1 : -1;
      const sy = id.startsWith('n') ? 1 : -1;
      ctx.moveTo(x + sx * mark, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * mark);
    }
    stroke(CAMERA_SKY, 3);
    const [cx, cy] = [current.left + current.width / 2, current.top + current.height / 2];
    const arm = (CROSS_SIZE / 2) * dpr;
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy);
    ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm);
    ctx.lineTo(cx, cy + arm);
    stroke(CAMERA_SKY, 1.5);
    const resting =
      owner?.kind === 'target' ? model.targets.find((t) => t.id === owner.id)?.name : undefined;
    label(current, resting ? `Camera · ${resting}` : 'Camera', CAMERA_SKY, '#06283a');
    if (isSelected(cameraPiece) && owner !== null) {
      handles(current, CAMERA_SKY, hotPart(cameraPiece));
    }
  });

  // The rectangle of an isolated move, over everything else.
  for (const draw of onTop) draw();

  ctx.restore();
}
