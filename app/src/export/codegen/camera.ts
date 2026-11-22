/* The scene's camera in the generated scene (ARCHITECTURE §12, "The Python of a camera"): Manim's
 * `self.camera.frame`, called `cam`.
 *
 * ManimGL keeps a stroke as wide on the screen when the camera closes in; a scene whose camera
 * zooms starts with the lines that make it thicken as ManimCE's does (`GL_STROKES_WITH_ZOOM`).
 *
 * A project whose camera does nothing (`cameraActs`) exports the file of a project without one,
 * byte for byte: no plan is made, no name is reserved, and nothing below runs. Otherwise:
 *   - `cam = self.camera.frame` at the top of `construct`; its frame at 0 s when that is not
 *     Manim's (`cam.replace(<rectangle>)`), and `cam.save_state()` when a move goes back to it;
 *   - each target camera a move goes to is a `Rectangle` of the frame's shape, never added to the
 *     scene: what `replace` reads is its centre and its width;
 *   - a move is a play of its own, `cam.animate.replace(<rectangle>)` — the same text in ManimCE
 *     and in ManimGL, and the law of the preview: centre and height in a straight line — or
 *     `Restore(cam)` back to the frame of 0 s. A move that goes nowhere is not written: its time
 *     is a wait. Something that only appears or goes during a move cuts it into `_Part` slices,
 *     as it cuts any animation;
 *   - ManimCE films it in a `MovingCameraScene`; ManimGL's `Scene` already can. */
import {
  FRAME_HEIGHT,
  type CameraFrame,
  type CameraTargetId,
  type Issue,
  type Project,
} from '../../model';
import { cameraActs, cameraAt, cameraLegs, sameFrame, type CameraLeg } from '../../scene';
import type { Codegen, Generated } from './context';
import { exportIssue } from './issues';
import {
  animateExpr,
  identifier,
  isValidClassName,
  num,
  point,
  pyComment,
  sceneClassName,
} from './python';

/** What the generator knows of a camera that acts. */
export interface CameraPlan {
  /** The moves that go somewhere, in the order they run. */
  readonly legs: readonly CameraLeg[];
  /** Whether a move goes back to the frame of 0 s: the frame is saved then. */
  readonly restores: boolean;
  /** Whether the camera is ever closer or farther than Manim's frame: strokes then show it. */
  readonly zooms: boolean;
  /** The Python name of each target camera a move goes to (`prepareCamera` fills it). */
  readonly targets: Map<CameraTargetId, string>;
}

/** The names a scene with a camera uses besides the usual ones: reserved in that scene alone, so
 * that an object called `cam` keeps its name in every other. */
export const CAMERA_SYMBOLS: readonly string[] = [
  'cam',
  'MovingCameraScene',
  'Restore',
  '_VMobject_init',
  '_VMobject_init_scaled',
];

/** Whether `name` is one of the names the camera of `project` takes in its scene: none when it
 * has no camera, or one that does nothing (`cameraPlan`). */
function isCameraName(project: Project, name: string): boolean {
  return CAMERA_SYMBOLS.includes(name) && cameraPlan(project) !== null;
}

/** The name the Scene class of an export of `project` takes when `requested` is asked for:
 * `requested` itself when it is a class name; else a class name made of it, or of the project's
 * name when nothing is asked (`sceneClassName`); and, in a scene with a camera, with `Scene`
 * after it when it is one of the camera's names. The class, the file named in the header, the
 * file the dialog downloads and a render request are all called this (`CodegenResult.sceneName`). */
export function effectiveSceneName(project: Project, requested: string): string {
  const named = isValidClassName(requested)
    ? requested
    : sceneClassName(requested || project.meta.name);
  return isCameraName(project, named) ? `${named}Scene` : named;
}

/** Whether the Scene class of an export of `project` can be called `name` as it is written: a
 * class name (`isValidClassName`) that the scene's camera does not use. */
export function isValidSceneName(project: Project, name: string): boolean {
  return isValidClassName(name) && !isCameraName(project, name);
}

/** ManimGL draws a stroke as wide on the screen however close the camera is; ManimCE draws it in
 * scene units, so it thickens as the camera closes in, and so does the preview. These lines,
 * right after the import, make every vectorized mobject of a ManimGL scene do as ManimCE's from
 * the moment it is made — those an animation makes too (a Circumscribe's frame, a Flash's lines),
 * which marking the scene's own mobjects one by one would miss, and through a Transform, which
 * interpolates the mark away. With the camera at Manim's own distance they change no pixel.
 * `set_scale_stroke_with_zoom` is there from ManimGL 1.7.2 on. */
export const GL_STROKES_WITH_ZOOM = `# Strokes thicken when the camera zooms in, as in ManimCE (ManimGL 1.7.2 or later).
_VMobject_init = VMobject.__init__


def _VMobject_init_scaled(self, *args, **kwargs):
    _VMobject_init(self, *args, **kwargs)
    self.set_scale_stroke_with_zoom(True, recurse=False)


VMobject.__init__ = _VMobject_init_scaled
`;

/** What every op of a scene with a camera shares when it is snapped to the frame grid: two
 * animations that did not overlap before never do after (`snapEvents`), a camera move and what
 * touches it among them — the locked region holds on the grid too. */
export const CAMERA_GROUP = '#camera';

const MANIM_FRAME: CameraFrame = { center: [0, 0], height: FRAME_HEIGHT };

/** The plan of the project's camera; null when it has none or it does nothing. */
export function cameraPlan(project: Project): CameraPlan | null {
  const camera = project.camera;
  if (!camera || !cameraActs(camera)) return null;
  const legs = cameraLegs(camera).filter((leg) => !sameFrame(leg.from, leg.to));
  const away = (frame: CameraFrame) => Math.abs(frame.height - FRAME_HEIGHT) > 1e-9;
  return {
    legs,
    restores: legs.some((leg) => leg.move.to.kind === 'start'),
    zooms: away(camera.initial) || legs.some((leg) => away(leg.to)),
    targets: new Map(),
  };
}

/** What the export says of a camera that zooms in a ManimGL scene: the lines that make its strokes
 * follow need a recent ManimGL. */
export function reportCamera(gen: Codegen): void {
  if (!gen.camera?.zooms || gen.target !== 'gl') return;
  gen.issues.push(
    exportIssue(
      'warning',
      'export-camera',
      'The camera zooms: the scene makes ManimGL thicken its strokes with the zoom, as ManimCE does and as the preview shows. That needs ManimGL 1.7.2 or later.',
      ['camera'],
    ),
  );
}

/** A FocusOn that runs with the camera away from Manim's own frame: Manim sizes its disc for
 * that frame, whatever the camera sees, and the preview draws what Manim does. Reported, since
 * the disc then does not start around the whole picture as it does without a camera. */
export function reportFocusOn(gen: Codegen, start: number, path: Issue['path']): void {
  const camera = gen.project.camera;
  if (!gen.camera || !camera) return;
  if (sameFrame(cameraAt(camera, start, gen.target), MANIM_FRAME)) return;
  gen.issues.push(
    exportIssue(
      'warning',
      'export-camera',
      `A FocusOn runs at ${num(start, 3)} s with the camera away from Manim’s own frame: Manim sizes its disc for that frame, so it does not start around the whole picture. The preview shows it as Manim renders it.`,
      path,
    ),
  );
}

/** A frame of the scene as the rectangle the camera's frame replaces: the picture's shape,
 * `height` tall about `center`. */
function frameRectangle(gen: Codegen, frame: CameraFrame): string {
  const aspect = gen.project.meta.width / gen.project.meta.height;
  return `Rectangle(width=${num(frame.height * aspect)}, height=${num(frame.height)}).move_to(${point(frame.center)})`;
}

/** The lines that set the camera up, put before those that make the mobjects. Called after the
 * mobjects were named: a formula keeps its name, and a target camera takes one that is free. */
export function prepareCamera(gen: Codegen): void {
  const plan = gen.camera;
  const camera = gen.project.camera;
  if (!plan || !camera) return;
  // Laid out as the mobjects are: a blank line and a comment before it, or neither.
  const lines: string[] = gen.options.comments
    ? ['', '# The camera: the frame the scene is filmed through.']
    : [];
  lines.push('cam = self.camera.frame');
  if (!sameFrame(camera.initial, MANIM_FRAME)) {
    lines.push(`cam.replace(${frameRectangle(gen, camera.initial)})`);
  }
  if (plan.restores) lines.push('cam.save_state()');
  for (const target of camera.targets) {
    const used = plan.legs.some(
      ({ move }) => move.to.kind === 'target' && move.to.target === target.id,
    );
    if (!used) continue;
    // "Camera 1" is `camera_1`: a variable, as the mobjects' names are.
    const name = gen.names.take(identifier(target.name.toLowerCase(), 'camera'));
    plan.targets.set(target.id, name);
    if (gen.options.comments) lines.push(pyComment(`target camera: ${target.name}`));
    lines.push(`${name} = ${frameRectangle(gen, target)}`);
  }
  gen.setup.unshift(...lines);
}

/** The animation of a camera move. */
export function cameraMove(gen: Codegen, leg: CameraLeg, sliced: boolean): Generated {
  const { move } = leg;
  const rate = move.easing === 'smooth' ? [] : [`rate_func=${move.easing}`];
  if (move.to.kind === 'start') {
    return { pre: [], anims: [`Restore(${['cam', ...rate].join(', ')})`], post: [] };
  }
  const to =
    move.to.kind === 'target'
      ? (gen.camera?.targets.get(move.to.target) ?? frameRectangle(gen, leg.to))
      : frameRectangle(gen, leg.to);
  return { pre: [], anims: [animateExpr('cam', rate, [`.replace(${to})`], sliced)], post: [] };
}

/** What a camera move is called in the comment of its play: "camera → Camera 1". */
export function describeCameraMove(gen: Codegen, leg: CameraLeg): string {
  const { to } = leg.move;
  if (to.kind === 'start') return 'camera → start';
  if (to.kind === 'target') {
    const target = gen.project.camera?.targets.find((t) => t.id === to.target);
    return `camera → ${(target?.name ?? 'target').replace(/\s+/g, ' ')}`;
  }
  const zoom = Math.round((FRAME_HEIGHT / leg.to.height) * 100);
  return `camera → (${num(leg.to.center[0], 3)}, ${num(leg.to.center[1], 3)}), ${zoom} %`;
}
