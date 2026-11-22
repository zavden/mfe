/* Renderer contract: draw drawables on a Canvas 2D context (docs/ARCHITECTURE.md, "Rendering").
 * The same code draws the preview and the frames of a video export. */
import type { Vec2 } from '../geom';
import type { Drawable } from '../scene';

/** What part of the scene is visible and where it lands on the canvas. */
export interface Camera {
  /** Scene units; the Manim frame is FRAME_HEIGHT (8) tall and frameWidth(meta) wide. */
  frameWidth: number;
  frameHeight: number;
  /** The scene point at the middle of the frame; absent, the origin, where Manim's frame is until
   * a scene camera moves it (`scene/camera.ts`). What looks through a scene camera has the frame
   * and the view on the same point (`cameraThrough`). */
  frameCenter?: Vec2;
  /** Scene point at the centre of the canvas (preview pan). [0, 0] for exports. */
  center: Vec2;
  /** 1 = the whole frame fits the canvas (letterboxed). >1 zooms in. */
  zoom: number;
}

export interface Surface {
  /** Canvas size in device pixels (CSS size × devicePixelRatio). */
  width: number;
  height: number;
}

export interface FrameStyle {
  background: string;
  /** Paint outside the Manim frame (preview letterbox); null = same as background. */
  outside: string | null;
  /** The whole surface is the scene's: the background covers it, `outside` paints nothing and
   * nothing is cut at the frame. The view of the world around a scene camera, which draws the
   * frame itself. */
  unclipped?: boolean;
  /** Drawn over the frame's background, clipped to the frame (to nothing when `unclipped`),
   * before the drawables: the preview's grid. Exports pass none, so nothing of it reaches a
   * video. */
  underlay?: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void;
}

export interface Renderer {
  draw(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    drawables: readonly Drawable[],
    camera: Camera,
    surface: Surface,
    style: FrameStyle,
  ): void;
  /** Topmost drawable of the project (`role: 'object'`) under the scene point: one whose fill
   * contains it, or whose stroke passes within half its width plus `slack` (scene units: the
   * preview's few pixels, so that a thin line can be clicked) of it. Null when nothing is. */
  pick(drawables: readonly Drawable[], scenePoint: Vec2, slack?: number): Drawable | null;
  /** Canvas pixel → scene point (inverse of the draw transform). */
  toScene(pixel: Vec2, camera: Camera, surface: Surface): Vec2;
}
