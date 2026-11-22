/* The designer's view of the Preview: where it looks at the scene from and how close. It is the
 * Preview's own — no file keeps it, undo does not touch it, and it stays as it is from one
 * project to the next — and it lives in a store so that what is not the panel can read it and
 * set it: a shortcut, a menu, the multicamera's «Fit» (D190). The panel's gestures write it.
 *
 * A scene with a camera (D190) has two: the view of the world, where the camera's rectangles are
 * edited, and the **camera view** (`cameraView`), which looks through the camera at the playhead
 * as the video does. Each keeps a zoom and a pan of its own — the world's is about the scene, the
 * camera view's about the picture (`through`, kept in frames of the picture so that it holds
 * while the camera moves and zooms: `viewThrough`). The world view may have one of the camera's
 * moves isolated (`isolatedMove`). */
import { create } from 'zustand';
import type { Box, Vec2 } from '../../geom';
import { FRAME_HEIGHT, type CameraMoveId } from '../../model';
import { clampZoom } from '../../render';

/** A view of the scene: the scene point at the middle of the canvas and the zoom (1 = the whole
 * frame fits). */
export interface ViewState {
  center: Vec2;
  zoom: number;
}

/** The whole frame, centred. */
export const FIT_VIEW: ViewState = { center: [0, 0], zoom: 1 };

/** Whether a view is the fit: nothing to put back. */
export const isFitView = (view: ViewState): boolean =>
  view.zoom === 1 && view.center[0] === 0 && view.center[1] === 0;

/** Whether two views are the same view. */
export const sameView = (a: ViewState, b: ViewState): boolean =>
  a.zoom === b.zoom && a.center[0] === b.center[0] && a.center[1] === b.center[1];

/** Whether two views show the same, to what the eye and a rounding can tell: a view worked out
 * again (the fit of the world, after a pan back) is the one it was. */
export const nearView = (a: ViewState, b: ViewState): boolean =>
  Math.abs(a.zoom - b.zoom) <= 1e-6 * Math.max(1, b.zoom) &&
  Math.abs(a.center[0] - b.center[0]) <= 1e-6 &&
  Math.abs(a.center[1] - b.center[1]) <= 1e-6;

/** The view that shows `boxes` whole (scene units) on a canvas of `surface` pixels, `margin`
 * pixels kept free on every side: «Fit» in the world view of a scene with a camera (D190), whose
 * boxes are Manim's frame and every frame of the camera. `frame` is the size of Manim's frame —
 * what a zoom of 1 fits. No boxes, or no canvas: the plain fit. */
export function viewFitting(
  boxes: readonly Box[],
  frame: { width: number; height: number },
  surface: { width: number; height: number },
  margin: number,
): ViewState {
  if (boxes.length === 0 || !(surface.width > 0) || !(surface.height > 0)) return FIT_VIEW;
  const minX = Math.min(...boxes.map((b) => b.minX));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width + height)) return FIT_VIEW;
  // Pixels per unit at zoom 1, and the ones that fit the boxes inside the margin.
  const unit = Math.min(surface.width / frame.width, surface.height / frame.height);
  const room = (side: number) => Math.max(side / 2, side - 2 * margin);
  const wanted = Math.min(room(surface.width) / width, room(surface.height) / height);
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2],
    zoom: clampZoom(wanted / unit),
  };
}

/** A frame the scene is looked at through: a scene camera's at an instant. */
interface Lens {
  readonly center: Vec2;
  readonly height: number;
}

/** The view of the scene a kept view of the picture is, through `frame`: its pan is kept in
 * units of Manim's own frame — a pan of 1 is an eighth of the picture's height, whatever the
 * camera's zoom —, about the frame's centre. Through Manim's frame the two are the same. */
export function viewThrough(kept: ViewState, frame: Lens): ViewState {
  const k = frame.height / FRAME_HEIGHT;
  return {
    center: [frame.center[0] + kept.center[0] * k, frame.center[1] + kept.center[1] * k],
    zoom: kept.zoom,
  };
}

/** The view of the picture to keep for a view of the scene through `frame`: `viewThrough`'s
 * inverse. */
export function keptView(view: ViewState, frame: Lens): ViewState {
  const k = frame.height / FRAME_HEIGHT;
  return {
    center: [(view.center[0] - frame.center[0]) / k, (view.center[1] - frame.center[1]) / k],
    zoom: view.zoom,
  };
}

type ViewUpdate = ViewState | ((current: ViewState) => ViewState);

interface PreviewViewState {
  /** The view of the scene — of the world, when the scene has a camera. */
  view: ViewState;
  /** The view of the picture in the camera view (`viewThrough`). */
  through: ViewState;
  /** The camera view is asked for (D190): the Preview looks through the scene's camera at the
   * playhead, as the video does. It shows while the project has a camera; without one the
   * Preview is that view already. */
  cameraView: boolean;
  setCameraView(on: boolean): void;
  /** The camera move that is isolated, or null: in the world view the rectangle of the frame it
   * goes to (`moveFrameOwner`) answers the pointer alone, and the others are drawn faint — for
   * frames that lie one over another, of which only the one on top could be taken. A way of
   * looking, as the camera view is: nothing of the project changes, and the panel drops it once
   * its move is gone. */
  isolatedMove: CameraMoveId | null;
  isolateMove(id: CameraMoveId | null): void;
  /** A new view, or the one that follows from the current — of the picture (`through`), when
   * said so. */
  setView(update: ViewUpdate, through?: boolean): void;
  /** Back to the whole frame. */
  fit(through?: boolean): void;
}

export const usePreviewView = create<PreviewViewState>()((set) => ({
  view: FIT_VIEW,
  through: FIT_VIEW,
  cameraView: false,
  setCameraView: (on) => set({ cameraView: on }),
  isolatedMove: null,
  isolateMove: (id) => set({ isolatedMove: id }),
  setView: (update, through = false) =>
    set((state) => {
      const current = through ? state.through : state.view;
      const next = typeof update === 'function' ? update(current) : update;
      return through ? { through: next } : { view: next };
    }),
  fit: (through = false) => set(through ? { through: FIT_VIEW } : { view: FIT_VIEW }),
}));
