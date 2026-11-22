// @vitest-environment node
/* The Python of the scene's camera (D190, `camera.ts`): `cam = self.camera.frame`, a play of
 * its own for each move, and nothing at all for a camera that does nothing. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../../engine';
import {
  createClip,
  createEmphasis,
  createEmptyProject,
  createSceneCamera,
  createShapeFormula,
  defaultIntro,
  defaultOutro,
  setIdGenerator,
  type CameraMove,
  type Easing,
  type Project,
  type SceneCamera,
  type Target,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import { effectiveSceneName, generatePython, isValidSceneName } from '..';
import { CAMERA_SYMBOLS } from '../camera';

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

const move = (
  id: string,
  start: number,
  duration: number,
  to: CameraMove['to'],
  easing: Easing = 'smooth',
): CameraMove => ({ id, start, duration, easing, to });

/** A square `box` on screen over [0, 10] at 10 fps, appearing and going without an animation,
 * and the camera given. */
function scene(camera: SceneCamera | undefined, target: Target, name = 'box'): Project {
  const project = createEmptyProject('Camera');
  Object.assign(project.meta, { target, width: 1920, height: 1080, fps: 10 });
  const shape = createShapeFormula({ name, width: 2, height: 2 });
  project.formulas.push(shape);
  project.clips.push(
    createClip(shape.id, project.tracks[0]!.id, 0, 10, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    }),
  );
  if (camera) project.camera = camera;
  return project;
}

function python(project: Project, comments = true, sceneName = 'Demo') {
  const resolved = refreshLocalRenders(project, new Map());
  return generatePython(resolved.project, resolved.formulas, {
    target: project.meta.target,
    indexing: 'auto',
    sceneName,
    comments,
  });
}

/** To Camera 1 during [2, 3.5), to a frame of its own during [5, 6), back during [8, 9). */
function threeMoves(): SceneCamera {
  return {
    ...createSceneCamera(),
    targets: [{ id: 'k1', name: 'Camera 1', center: [3, 1], height: 4 }],
    moves: [
      move('n1', 2, 1.5, { kind: 'target', target: 'k1' }),
      move('n2', 5, 1, { kind: 'frame', frame: { center: [-2, 0], height: 16 / 3 } }, 'linear'),
      move('n3', 8, 1, { kind: 'start' }),
    ],
  };
}

describe.each(['ce', 'gl'] as const)('%s: the Python of a camera', (target) => {
  it('is nothing for a project without a camera or with one that does nothing', () => {
    const plain = python(scene(undefined, target)).code;
    expect(python(scene(createSceneCamera(), target)).code).toBe(plain);
    // Target cameras alone, and moves that go nowhere: the same file still.
    const idle: SceneCamera = {
      ...createSceneCamera(),
      targets: [{ id: 'k1', name: 'Camera 1', center: [3, 1], height: 4 }],
      moves: [
        move('n1', 2, 1, { kind: 'start' }),
        move('n2', 4, 1, { kind: 'frame', frame: { center: [0, 0], height: 8 } }),
      ],
    };
    expect(python(scene(idle, target)).code).toBe(plain);
    expect(plain).not.toContain('cam = ');
    expect(plain).not.toContain('MovingCameraScene');
    expect(plain).toContain('class Demo(Scene):');
  });

  it('plays each move alone: to a target camera, to a frame of its own, back to the start', () => {
    const { code, issues } = python(scene(threeMoves(), target));
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(code).toContain(
      target === 'ce' ? 'class Demo(MovingCameraScene):' : 'class Demo(Scene):',
    );
    const lines = code.split('\n').map((line) => line.trim());
    const at = (text: string) => lines.indexOf(text);
    // The set-up, before the mobjects: the frame, saved because a move goes back to it, and the
    // target camera as a rectangle of the picture's shape.
    expect(at('cam = self.camera.frame')).toBeGreaterThan(at('def construct(self):'));
    expect(at('cam.save_state()')).toBe(at('cam = self.camera.frame') + 1);
    expect(at('# target camera: Camera 1')).toBe(at('cam.save_state()') + 1);
    expect(at('camera_1 = Rectangle(width=7.111111, height=4).move_to([3, 1, 0])')).toBe(
      at('cam.save_state()') + 2,
    );
    expect(at('cam = self.camera.frame')).toBeLessThan(
      lines.findIndex((l) => l.startsWith('box =')),
    );
    // The three plays, each with its comment and its run time.
    expect(at('# 2 s – 3.5 s: camera → Camera 1')).toBeGreaterThan(0);
    expect(at('self.play(cam.animate.replace(camera_1), run_time=1.5)')).toBe(
      at('# 2 s – 3.5 s: camera → Camera 1') + 1,
    );
    expect(at('# 5 s – 6 s: camera → (-2, 0), 150 %')).toBeGreaterThan(0);
    expect(lines).toContain('self.play(');
    expect(lines).toContain(
      'cam.animate(rate_func=linear).replace(Rectangle(width=9.481481, height=5.333333).move_to([-2, 0, 0])),',
    );
    expect(at('# 8 s – 9 s: camera → start')).toBeGreaterThan(0);
    expect(at('self.play(Restore(cam), run_time=1)')).toBe(at('# 8 s – 9 s: camera → start') + 1);
    // The rectangles are what `replace` reads: never added to the scene.
    expect(code).not.toContain('self.add(camera_1');
    // The scene lasts as long as before: the waits between the moves fill it.
    expect(code).toContain('exactly 100 frames');
  });

  it('sets the frame of 0 s when it is not Manim’s, and saves it only for a move back', () => {
    const camera: SceneCamera = {
      ...createSceneCamera(),
      initial: { center: [1, -1], height: 4 },
    };
    const still = python(scene(camera, target)).code;
    expect(still).toContain('cam = self.camera.frame\n');
    expect(still).toContain(
      'cam.replace(Rectangle(width=7.111111, height=4).move_to([1, -1, 0]))\n',
    );
    expect(still).not.toContain('save_state');
    expect(still).not.toContain('self.play(');
    expect(still).toContain(
      target === 'ce' ? 'class Demo(MovingCameraScene):' : 'class Demo(Scene):',
    );
  });

  it('cuts a move into parts where something appears or goes without an animation', () => {
    const project = scene(
      {
        ...createSceneCamera(),
        moves: [move('n1', 2, 2, { kind: 'frame', frame: { center: [2, 0], height: 4 } })],
      },
      target,
    );
    // The box goes at 3 s, in the middle of the move.
    project.clips[0]!.end = 3;
    project.meta.duration = 6;
    const { code, issues } = python(project);
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(code).toContain(
      'cam_move = cam.animate.replace(Rectangle(width=7.111111, height=4).move_to([2, 0, 0])).build()',
    );
    expect(code).toContain('self.play(_Part(cam_move, 0, 0.5), run_time=1)');
    expect(code).toContain('self.remove(box)');
    expect(code).toContain('self.play(_Part(cam_move, 0.5, 1), run_time=1)');
    expect(code.indexOf('_Part(cam_move, 0,')).toBeLessThan(code.indexOf('self.remove(box)'));
    expect(code.indexOf('self.remove(box)')).toBeLessThan(code.indexOf('_Part(cam_move, 0.5,'));
  });

  it('keeps its names from the objects and the class of the scene, in a scene with a camera alone', () => {
    const camera: SceneCamera = {
      ...createSceneCamera(),
      targets: [{ id: 'k1', name: 'box', center: [3, 1], height: 4 }],
      moves: [move('n1', 2, 1, { kind: 'target', target: 'k1' })],
    };
    // An object called `cam`: renamed only where the camera takes the name.
    const taken = python(scene(camera, target, 'cam')).code;
    expect(taken).toContain('cam = self.camera.frame');
    expect(taken).toMatch(/^\s+cam_2 = Rectangle\(width=2, height=2/m);
    expect(python(scene(undefined, target, 'cam')).code).toMatch(/^\s+cam = /m);
    // A target camera named as an object takes the next free name: the object keeps its own.
    const twice = python(scene(camera, target)).code;
    expect(twice).toMatch(/^\s+box = /m);
    expect(twice).toContain('box_2 = Rectangle(width=7.111111, height=4).move_to([3, 1, 0])');
    expect(twice).toContain('cam.animate.replace(box_2)');
    // A scene class called as one of the camera's names is renamed, there alone.
    expect(python(scene(camera, target), true, 'Restore').code).toContain('class RestoreScene(');
    expect(python(scene(undefined, target), true, 'Restore').code).toContain('class Restore(');
  });

  // The class, the file the header names, the file the dialog downloads and a render request
  // are one name, the generator's (B-10 of the final audit): what asks for a name gets back the
  // one the class took.
  it.each(CAMERA_SYMBOLS)(
    'gives back the name its class took, for the camera’s name %s',
    (name) => {
      for (const target of ['ce', 'gl'] as const) {
        const camera: SceneCamera = {
          ...createSceneCamera(),
          initial: { center: [1, 0], height: 8 },
        };
        const withCamera = scene(camera, target);
        const taken = python(withCamera, true, name);
        expect(taken.sceneName).toBe(`${name}Scene`);
        expect(taken.code).toContain(`class ${name}Scene(`);
        expect(taken.code).toContain(`${name}Scene.py`);
        expect(effectiveSceneName(withCamera, name)).toBe(`${name}Scene`);
        expect(isValidSceneName(withCamera, name)).toBe(false);
        expect(isValidSceneName(withCamera, `${name}Scene`)).toBe(true);
        // What a render is asked for by is a name the companion takes (`SCENE_RE`).
        expect(taken.sceneName).toMatch(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);

        // Without a camera, or with one that does nothing, the scene takes the name as it is.
        for (const plain of [scene(undefined, target), scene(createSceneCamera(), target)]) {
          expect(python(plain, true, name).sceneName).toBe(name);
          expect(effectiveSceneName(plain, name)).toBe(name);
          expect(isValidSceneName(plain, name)).toBe(true);
        }
      }
    },
  );

  it('names the class as asked, as the project, or as a class name made of what was asked', () => {
    const camera: SceneCamera = { ...createSceneCamera(), initial: { center: [1, 0], height: 8 } };
    const project = scene(camera, 'ce');
    project.meta.name = 'Restore';
    expect(effectiveSceneName(project, 'Lesson')).toBe('Lesson');
    expect(effectiveSceneName(project, '')).toBe('RestoreScene'); // the project's name
    expect(effectiveSceneName(project, 'my lesson')).toBe('MyLesson');
    expect(effectiveSceneName(project, 'cam')).toBe('camScene');
    expect(python(project, true, '').sceneName).toBe('RestoreScene');
    // What is no class name is none with a camera either.
    expect(isValidSceneName(project, 'my lesson')).toBe(false);
    expect(isValidSceneName(project, 'class')).toBe(false);
    expect(isValidSceneName(project, 'Lesson')).toBe(true);
  });

  it('writes no comment when comments are off, and a rate function when it is not smooth', () => {
    const camera: SceneCamera = {
      ...createSceneCamera(),
      moves: [
        move('n1', 1, 1, { kind: 'frame', frame: { center: [0, 2], height: 8 } }, 'there_and_back'),
        move('n2', 3, 1, { kind: 'frame', frame: { center: [0, 2], height: 8 } }, 'rush_into'),
        move('n3', 5, 1, { kind: 'start' }, 'linear'),
      ],
    };
    const { code } = python(scene(camera, target), false);
    // Only the header of the file is a comment.
    const body = code.slice(code.indexOf('class Demo')).split('\n');
    expect(body.filter((line) => line.trim().startsWith('#'))).toEqual([]);
    expect(code).toContain(
      target === 'ce'
        ? 'self.camera.background_color = "#000000"\n        cam = self.camera.frame\n'
        : 'def construct(self):\n        cam = self.camera.frame\n',
    );
    const frame = 'Rectangle(width=14.222222, height=8).move_to([0, 2, 0])';
    // There and back: the camera is where it was, so the next move still goes somewhere.
    expect(code).toContain(`cam.animate(rate_func=there_and_back).replace(${frame})`);
    expect(code).toContain(`cam.animate(rate_func=rush_into).replace(${frame})`);
    expect(code).toContain('self.play(Restore(cam, rate_func=linear), run_time=1)');
  });
});

describe('the strokes of a scene whose camera zooms', () => {
  const zooming: SceneCamera = {
    ...createSceneCamera(),
    moves: [move('n1', 2, 1, { kind: 'frame', frame: { center: [0, 0], height: 4 } })],
  };
  const panning: SceneCamera = {
    ...createSceneCamera(),
    moves: [move('n1', 2, 1, { kind: 'frame', frame: { center: [3, 0], height: 8 } })],
  };
  const PATCH = 'VMobject.__init__ = _VMobject_init_scaled';

  it('thicken in ManimGL as in ManimCE: six lines right after the import, and a word on the version', () => {
    const { code, issues } = python(scene(zooming, 'gl'));
    const lines = code.split('\n');
    const imported = lines.indexOf('from manimlib import *');
    expect(lines.slice(imported + 1, imported + 14)).toEqual([
      '',
      '',
      '# Strokes thicken when the camera zooms in, as in ManimCE (ManimGL 1.7.2 or later).',
      '_VMobject_init = VMobject.__init__',
      '',
      '',
      'def _VMobject_init_scaled(self, *args, **kwargs):',
      '    _VMobject_init(self, *args, **kwargs)',
      '    self.set_scale_stroke_with_zoom(True, recurse=False)',
      '',
      '',
      'VMobject.__init__ = _VMobject_init_scaled',
      '',
    ]);
    // Before the scene and before every helper: nothing is made earlier.
    expect(code.indexOf(PATCH)).toBeLessThan(code.indexOf('class Demo'));
    expect(issues.filter((issue) => issue.code === 'export-camera')).toEqual([
      {
        severity: 'warning',
        code: 'export-camera',
        message:
          'The camera zooms: the scene makes ManimGL thicken its strokes with the zoom, as ManimCE does and as the preview shows. That needs ManimGL 1.7.2 or later.',
        path: ['camera'],
      },
    ]);
    // An initial frame closer than Manim's is a zoom too.
    const close: SceneCamera = { ...createSceneCamera(), initial: { center: [0, 0], height: 2 } };
    expect(python(scene(close, 'gl')).code).toContain(PATCH);
  });

  it('need nothing in ManimCE, nor in ManimGL while the camera keeps its distance', () => {
    const ce = python(scene(zooming, 'ce'));
    expect(ce.code).not.toContain('_VMobject_init');
    expect(ce.issues.filter((issue) => issue.code === 'export-camera')).toEqual([]);
    const pan = python(scene(panning, 'gl'));
    expect(pan.code).not.toContain('_VMobject_init');
    expect(pan.code).toContain('cam.animate.replace(');
    expect(pan.issues.filter((issue) => issue.code === 'export-camera')).toEqual([]);
  });
});

describe.each(['ce', 'gl'] as const)('%s: a FocusOn seen through the camera', (target) => {
  const focused = (camera: SceneCamera | undefined) => {
    const project = scene(camera, target);
    project.clips[0]!.actions.push(
      createEmphasis(5, 'focus_on', 'all', { duration: 1, easing: 'linear' }),
    );
    return python(project).issues.filter(
      (issue) => issue.code === 'export-camera' && issue.path[0] === 'clips',
    );
  };

  it('is reported when the camera is away from Manim’s own frame then', () => {
    const away: SceneCamera = {
      ...createSceneCamera(),
      moves: [move('n1', 2, 1, { kind: 'frame', frame: { center: [3, 0], height: 8 } })],
    };
    expect(focused(away)).toEqual([
      {
        severity: 'warning',
        code: 'export-camera',
        message:
          'A FocusOn runs at 5 s with the camera away from Manim’s own frame: Manim sizes its disc for that frame, so it does not start around the whole picture. The preview shows it as Manim renders it.',
        path: ['clips', 0, 'actions', 0],
      },
    ]);
  });

  it('is not when the camera is in that frame then, or when there is none', () => {
    expect(focused(undefined)).toEqual([]);
    // The camera leaves after the FocusOn, and comes back before another would run.
    const later: SceneCamera = {
      ...createSceneCamera(),
      moves: [
        move('n1', 7, 1, { kind: 'frame', frame: { center: [3, 0], height: 8 } }),
        move('n2', 8.5, 1, { kind: 'start' }),
      ],
    };
    expect(focused(later)).toEqual([]);
  });
});
