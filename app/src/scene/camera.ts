/* Where the scene's camera is at an instant (format 34, D190): Manim's `self.camera.frame`.
 *
 * The camera rests in a frame — at 0 s its `initial` one — and each of its moves, in the order
 * they run, takes it from the frame it rests in to the frame the move names: a frame of its own,
 * a target camera or the initial frame again. Manim interpolates the centre and the height of the
 * frame in a straight line under the move's rate function, in ManimCE and in ManimGL alike
 * (measured: `cam.animate.replace(rect)` and `Restore(cam)`), so the same law here gives the
 * frame of every instant; the width follows from the project's aspect. A move whose easing ends
 * where it started (`endsAtStart`) leaves the camera in the frame it left, as a tween does a clip.
 *
 * The camera is not in the evaluator: it draws nothing and moves no object. What draws a scene
 * asks for the frame of the instant and looks through it (`cameraThrough`, render). Pure. */
import {
  cameraMoveWindow,
  destinationFrame,
  FRAME_HEIGHT,
  movesInOrder,
  TIME_EPSILON,
  type CameraFrame,
  type CameraMove,
  type SceneCamera,
  type Target,
} from '../model';
import { rateFunction } from './easing';
import { endsAtStart } from './state';

/** A move with the frames it joins. */
export interface CameraLeg {
  move: CameraMove;
  /** Absolute seconds, half-open. */
  start: number;
  end: number;
  /** The frame the camera rests in when the move starts. */
  from: CameraFrame;
  /** The frame the move goes to: `from` when its target camera does not exist (an error of the
   * project: the move then goes nowhere). */
  to: CameraFrame;
  /** The frame the camera rests in once the move has ended: `to`, or `from` again for an easing
   * that ends where it started. */
  rest: CameraFrame;
}

/** Manim's own frame, where the camera of a project without one always is. */
const MANIM_FRAME: CameraFrame = { center: [0, 0], height: FRAME_HEIGHT };

/** The moves of a camera in the order they run, each with the frame it leaves, the frame it goes
 * to and the frame the camera rests in after it. */
export function cameraLegs(camera: SceneCamera): CameraLeg[] {
  const legs: CameraLeg[] = [];
  let resting = camera.initial;
  for (const move of movesInOrder(camera)) {
    const { start, end } = cameraMoveWindow(move);
    const to = destinationFrame(camera, move.to) ?? resting;
    const rest = endsAtStart(move.easing) ? resting : to;
    legs.push({ move, start, end, from: resting, to, rest });
    resting = rest;
  }
  return legs;
}

/** Whether two frames are the same frame, to what a file keeps of a number. */
export function sameFrame(a: CameraFrame, b: CameraFrame): boolean {
  const near = (x: number, y: number) => Math.abs(x - y) <= 1e-9;
  return (
    near(a.center[0], b.center[0]) && near(a.center[1], b.center[1]) && near(a.height, b.height)
  );
}

/** The frame between two, `alpha` of the way: centre and height in a straight line. */
export function mixFrames(from: CameraFrame, to: CameraFrame, alpha: number): CameraFrame {
  const mix = (a: number, b: number) => a + (b - a) * alpha;
  return {
    center: [mix(from.center[0], to.center[0]), mix(from.center[1], to.center[1])],
    height: mix(from.height, to.height),
  };
}

/** What the camera is doing at `t`: resting in a frame, or on its way along a leg. */
export interface CameraState {
  /** The frame of the instant. */
  frame: CameraFrame;
  /** The move that runs at `t` (its window is half-open), or null while the camera rests. */
  leg: CameraLeg | null;
  /** While it rests: the last leg that ended, whose `rest` the frame is; null before the first
   * move, when the frame is the camera's `initial` one. Null while a move runs. */
  after: CameraLeg | null;
}

/** The state of the camera at `t`; `target` chooses the library whose rate functions the moves
 * follow, as it does for every animation. */
export function cameraStateAt(camera: SceneCamera, t: number, target: Target): CameraState {
  let after: CameraLeg | null = null;
  for (const leg of cameraLegs(camera)) {
    if (t < leg.start - TIME_EPSILON) break;
    if (t < leg.end - TIME_EPSILON) {
      const alpha = rateFunction(leg.move.easing, target)((t - leg.start) / (leg.end - leg.start));
      return { frame: mixFrames(leg.from, leg.to, alpha), leg, after: null };
    }
    after = leg;
  }
  return { frame: after ? after.rest : camera.initial, leg: null, after };
}

/** The frame the scene is seen through at `t`: the camera's, or Manim's own for a project without
 * a camera. */
export function cameraAt(camera: SceneCamera | undefined, t: number, target: Target): CameraFrame {
  return camera ? cameraStateAt(camera, t, target).frame : MANIM_FRAME;
}

/** The frame a scene is filmed through at `t` seconds. */
export type SceneFraming = (t: number) => CameraFrame;

/** How a project is filmed: through its camera, when it has one that does something
 * (`cameraActs`); null for a scene filmed through Manim's still frame, as every scene without a
 * camera is — what draws it then needs nothing of this module. */
export function sceneFraming(project: {
  camera?: SceneCamera | undefined;
  meta: { target: Target };
}): SceneFraming | null {
  const { camera } = project;
  if (!camera || !cameraActs(camera)) return null;
  const legs = cameraLegs(camera);
  const rate = legs.map((leg) => rateFunction(leg.move.easing, project.meta.target));
  // The legs are worked out once: a video asks for the frame of each of its frames.
  return (t) => {
    let frame = camera.initial;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i]!;
      if (t < leg.start - TIME_EPSILON) break;
      if (t < leg.end - TIME_EPSILON) {
        return mixFrames(leg.from, leg.to, rate[i]!((t - leg.start) / (leg.end - leg.start)));
      }
      frame = leg.rest;
    }
    return frame;
  };
}

/** Whether the camera makes the picture another one than Manim's still frame gives: its frame at
 * 0 s is not Manim's, or one of its moves goes somewhere else than where the camera is. A camera
 * that does neither — the multicamera just turned on, a move onto the frame it leaves — exports
 * the Python and the video of a project without one. */
export function cameraActs(camera: SceneCamera | undefined): boolean {
  if (!camera) return false;
  if (!sameFrame(camera.initial, MANIM_FRAME)) return true;
  return cameraLegs(camera).some((leg) => !sameFrame(leg.from, leg.to));
}
