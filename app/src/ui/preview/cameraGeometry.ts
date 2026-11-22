/* The geometry of the camera's rectangles on the Preview, in device pixels: where the name plate
 * of one is, where its corners are, and which rectangle — and which part of it — a point of the
 * screen is on. The layer draws with it (`cameraLayer.ts`) and the gestures hit-test with it
 * (`useCameraGestures.ts`), so that what is drawn is what answers. A rectangle is taken by its
 * edge, its name or, for the current camera, the cross of its centre: its inside lets a press
 * through to the objects of the scene. Pure. */
import type { Box, Vec2 } from '../../geom';
import type { CameraFrame, CameraMoveId, CameraTargetId } from '../../model';
import { sameOwner, type FrameOwner } from '../camera/cameraOps';
import type { CameraSceneModel } from '../camera/cameraScene';

/** A rectangle of the camera's scene: the current camera, the frame of 0 s, a target camera, or
 * the frame a move goes to on its own. */
export type CameraPiece =
  | { kind: 'camera' }
  | { kind: 'start' }
  | { kind: 'target'; id: CameraTargetId }
  | { kind: 'move'; id: CameraMoveId };

/** The part of a rectangle a point is on: a corner scales it, the rest moves it. */
export type CameraCorner = 'nw' | 'ne' | 'se' | 'sw';
export type CameraPart = 'body' | CameraCorner;

/** Sizes in CSS pixels. */
export const HANDLE_SIZE = 9;
export const CORNER_MARK = 14;
export const CROSS_SIZE = 14;
export const LABEL_HEIGHT = 18;
/** How far from an edge a press still takes it. */
export const EDGE_REACH = 5;

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function samePiece(a: CameraPiece, b: CameraPiece): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === 'camera' || a.kind === 'start' || a.id === (b as typeof a).id;
}

/** The rectangle that stands for the frame `owner` keeps: the current camera's while the camera
 * rests in it — that frame is not drawn apart —, else the frame of 0 s, the target camera or the
 * move's own frame. */
export function pieceOfOwner(model: CameraSceneModel, owner: FrameOwner): CameraPiece {
  if (sameOwner(model.current.owner, owner)) return { kind: 'camera' };
  return owner.kind === 'initial' ? { kind: 'start' } : { kind: owner.kind, id: owner.id };
}

/** The four corners of a rectangle, by the compass. */
export function cornerPoints(rect: PixelRect): Record<CameraCorner, Vec2> {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  return {
    nw: [rect.left, rect.top],
    ne: [right, rect.top],
    se: [right, bottom],
    sw: [rect.left, bottom],
  };
}

/** The plate a rectangle's name is on: above its top-left corner, or inside it when there is no
 * room above. As wide as its text is taken to be (the layer may draw it a little wider). */
export function labelRect(rect: PixelRect, text: string, dpr: number): PixelRect {
  const height = LABEL_HEIGHT * dpr;
  const gap = 3 * dpr;
  const above = rect.top - height - gap;
  return {
    left: rect.left,
    top: above >= 0 ? above : rect.top + gap,
    width: Math.round((text.length * 6.6 + 12) * dpr),
    height,
  };
}

const inside = (rect: PixelRect, [x, y]: Vec2, slack = 0): boolean =>
  x >= rect.left - slack &&
  x <= rect.left + rect.width + slack &&
  y >= rect.top - slack &&
  y <= rect.top + rect.height + slack;

/** Whether a point is on the edge of a rectangle: within `reach` of its outline. */
export function onEdge(rect: PixelRect, point: Vec2, reach: number): boolean {
  if (!inside(rect, point, reach)) return false;
  const inner: PixelRect = {
    left: rect.left + reach,
    top: rect.top + reach,
    width: rect.width - 2 * reach,
    height: rect.height - 2 * reach,
  };
  return inner.width <= 0 || inner.height <= 0 || !inside(inner, point);
}

/** The corner of a rectangle a point is on, by its handle. */
export function cornerAt(rect: PixelRect, point: Vec2, dpr: number): CameraCorner | null {
  const reach = (HANDLE_SIZE / 2 + 2) * dpr;
  for (const [id, [x, y]] of Object.entries(cornerPoints(rect)) as [CameraCorner, Vec2][]) {
    if (Math.abs(point[0] - x) <= reach && Math.abs(point[1] - y) <= reach) return id;
  }
  return null;
}

export interface CameraHit {
  piece: CameraPiece;
  part: CameraPart;
}

/** What of the camera's scene a point of the canvas (device pixels) is on, or null: first a
 * corner of the selected rectangle, then the current camera — its name, the cross of its centre,
 * its edge —, the target cameras, the moves' own frames and the frame of 0 s, each by its name or
 * its edge. `rectOf` gives a box of the scene its rectangle on the canvas. The current camera
 * answers for the frame it rests in: a target camera or a destination it rests on is not offered
 * apart (they are the same rectangle), and neither is the frame of 0 s while the camera is there.
 * With `only` (the rectangle of an isolated move), that rectangle alone answers: the others let
 * the press through, whatever lies over it. */
export function hitCameraScene(
  model: CameraSceneModel,
  point: Vec2,
  rectOf: (box: Box) => PixelRect,
  dpr: number,
  selected: CameraPiece | null,
  only: CameraPiece | null = null,
): CameraHit | null {
  const reach = EDGE_REACH * dpr;
  const owner = model.current.owner;
  const current = rectOf(model.current.box);
  const pieces: { piece: CameraPiece; rect: PixelRect; name: string }[] = [];
  const restingName =
    owner?.kind === 'target' ? model.targets.find((t) => t.id === owner.id)?.name : undefined;
  pieces.push({
    piece: { kind: 'camera' },
    rect: current,
    name: restingName ? `Camera · ${restingName}` : 'Camera',
  });
  for (const target of [...model.targets].reverse()) {
    if (owner?.kind === 'target' && owner.id === target.id) continue;
    pieces.push({
      piece: { kind: 'target', id: target.id },
      rect: rectOf(target.box),
      name: target.name,
    });
  }
  for (const destination of [...model.destinations].reverse()) {
    if (owner?.kind === 'move' && owner.id === destination.moveId) continue;
    pieces.push({
      piece: { kind: 'move', id: destination.moveId },
      rect: rectOf(destination.box),
      name: String(destination.order),
    });
  }
  if (owner?.kind !== 'initial') {
    pieces.push({ piece: { kind: 'start' }, rect: rectOf(model.start.box), name: 'Start' });
  }
  const answering = only ? pieces.filter((entry) => samePiece(entry.piece, only)) : pieces;

  // The corners of the selected rectangle come first: they lie over everything.
  if (selected) {
    const found = answering.find((entry) => samePiece(entry.piece, selected));
    const scalable = found && (found.piece.kind !== 'camera' || owner !== null);
    const corner = found && scalable ? cornerAt(found.rect, point, dpr) : null;
    if (found && corner) return { piece: found.piece, part: corner };
  }
  for (const { piece, rect, name } of answering) {
    if (inside(labelRect(rect, name, dpr), point)) return { piece, part: 'body' };
    if (piece.kind === 'camera') {
      const arm = (CROSS_SIZE / 2 + 2) * dpr;
      const [cx, cy] = [rect.left + rect.width / 2, rect.top + rect.height / 2];
      if (Math.abs(point[0] - cx) <= arm && Math.abs(point[1] - cy) <= arm) {
        return { piece, part: 'body' };
      }
    }
    if (onEdge(rect, point, reach)) return { piece, part: 'body' };
  }
  return null;
}

/** What the right-click menu of a rectangle is about: its title, the frame the rectangle shows —
 * the one «Add target camera here» copies —, and the target camera it stands for: itself, or the
 * one the current camera rests on (`resting`: the two are the same rectangle). */
export interface PieceMenu {
  title: string;
  frame: CameraFrame;
  target: { id: CameraTargetId; name: string } | null;
  resting: boolean;
}

/** The menu of a rectangle of the camera's scene; null for one that is gone. */
export function pieceMenuOf(model: CameraSceneModel, piece: CameraPiece): PieceMenu | null {
  switch (piece.kind) {
    case 'camera': {
      const owner = model.current.owner;
      const target =
        owner?.kind === 'target' ? model.targets.find((t) => t.id === owner.id) : undefined;
      return {
        title: target ? `Camera · ${target.name}` : 'Camera',
        frame: model.current.frame,
        target: target ? { id: target.id, name: target.name } : null,
        resting: target !== undefined,
      };
    }
    case 'start':
      return { title: 'Camera at 0 s', frame: model.start.frame, target: null, resting: false };
    case 'target': {
      const target = model.targets.find((t) => t.id === piece.id);
      return target
        ? {
            title: target.name,
            frame: target.frame,
            target: { id: target.id, name: target.name },
            resting: false,
          }
        : null;
    }
    case 'move': {
      const destination = model.destinations.find((d) => d.moveId === piece.id);
      return destination
        ? {
            title: `Camera move ${destination.order}`,
            frame: destination.frame,
            target: null,
            resting: false,
          }
        : null;
    }
  }
}
