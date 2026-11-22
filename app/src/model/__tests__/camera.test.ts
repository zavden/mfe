// @vitest-environment node
/* The scene's camera in the file and in the rules of a project (format 34, D190): a frame at
 * 0 s, target cameras and moves; absent while the multicamera is off. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FORMAT_VERSION,
  FRAME_HEIGHT,
  MAX_CAMERA_HEIGHT,
  MIN_CAMERA_HEIGHT,
  animationWindows,
  cameraClashSentence,
  cameraEnd,
  cameraGap,
  cameraMoveEdges,
  cameraMoveWindow,
  cameraRegionClashes,
  cameraRegionIssues,
  createAppear,
  createSceneCamera,
  defaultCameraFrame,
  destinationFrame,
  movesInOrder,
  multicameraOn,
  parseProject,
  projectIdEntries,
  sceneDuration,
  serializeProject,
  setIdGenerator,
  timingIssues,
  validateProject,
  type CameraMove,
  type IssueCode,
  type Project,
  type SceneCamera,
} from '../index';
import { sequentialIds } from '../../test/sequentialIds';
import { smallProject } from './fixtures';

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};

const issuesOf = (project: Project, code: IssueCode) =>
  validateProject(project).filter((issue) => issue.code === code);

const move = (id: string, start: number, duration: number, to: CameraMove['to']): CameraMove => ({
  id,
  start,
  duration,
  easing: 'smooth',
  to,
});

/** A camera with a target camera and three moves: to the target, to a frame of its own, back. */
function camera(): SceneCamera {
  return {
    initial: defaultCameraFrame(),
    targets: [{ id: 'k1', name: 'Camera 1', center: [3, 1], height: 4 }],
    moves: [
      move('n1', 1, 1.5, { kind: 'target', target: 'k1' }),
      move('n2', 4, 1, { kind: 'frame', frame: { center: [-2, 0], height: 16 / 3 } }),
      move('n3', 7, 1, { kind: 'start' }),
    ],
  };
}

/** `smallProject` — clips over [0, 4] and [2, 6] — with that camera. Its relation runs during
 * [2, 3), so its first move is given a time of its own by the tests that need a valid project. */
function withCamera(patch: (camera: SceneCamera) => void = () => {}): Project {
  const p = smallProject();
  p.camera = camera();
  patch(p.camera);
  return p;
}

describe('the scene’s camera in the file', () => {
  it('is kept by a save and a load, as the last field of the project', () => {
    const text = serializeProject(withCamera());
    const again = opened(text);
    expect(again.camera).toEqual(camera());
    expect(serializeProject(again)).toBe(text);
    expect(Object.keys(again).at(-1)).toBe('camera');
    expect(again.version).toBe(FORMAT_VERSION);
  });

  it('is absent from a project whose multicamera is off, and from its file', () => {
    expect(multicameraOn(smallProject())).toBe(false);
    expect(multicameraOn(withCamera())).toBe(true);
    // On, whatever the camera does: the one a project starts with is a camera.
    expect(multicameraOn({ camera: createSceneCamera() })).toBe(true);
    const text = serializeProject(smallProject());
    expect(text).not.toContain('"camera"');
    expect('camera' in opened(text)).toBe(false);
  });

  it('is not in a file of format 33, which opens as it is', () => {
    const before = JSON.parse(serializeProject(smallProject())) as { version: number };
    before.version = 33;
    const migrated = parseProject(JSON.stringify(before));
    expect(migrated.ok && migrated.migratedFrom).toBe(33);
    expect(migrated.ok && migrated.project.version).toBe(FORMAT_VERSION);
    expect(migrated.ok && 'camera' in migrated.project).toBe(false);
    expect(migrated.ok && migrated.issues).toEqual([]);
  });

  it('keeps the lock of its row, and has none while it is not locked', () => {
    expect('locked' in opened(serializeProject(withCamera())).camera!).toBe(false);
    const locked = opened(serializeProject(withCamera((c) => (c.locked = true))));
    expect(locked.camera!.locked).toBe(true);
  });

  it('refuses a camera that is not one: a frame without a height, a move without a destination', () => {
    const broken = (patch: (camera: Record<string, unknown>) => void) => {
      const raw = JSON.parse(serializeProject(withCamera())) as { camera: Record<string, unknown> };
      patch(raw.camera);
      return parseProject(JSON.stringify(raw)).ok;
    };
    expect(broken(() => {})).toBe(true);
    expect(broken((c) => (c.initial = { center: [0, 0] }))).toBe(false);
    expect(broken((c) => (c.initial = { center: [0, 0], height: 0 }))).toBe(false);
    expect(broken((c) => (c.initial = { center: [0, 0], height: -8 }))).toBe(false);
    expect(broken((c) => ((c.moves as { to: unknown }[])[0]!.to = { kind: 'elsewhere' }))).toBe(
      false,
    );
    expect(broken((c) => ((c.moves as { duration: number }[])[0]!.duration = 0))).toBe(false);
    expect(broken((c) => ((c.targets as { name: string }[])[0]!.name = ''))).toBe(false);
    // A number a file can write and no frame can have.
    const text = serializeProject(withCamera()).replace('"height": 8', '"height": 1e999');
    expect(parseProject(text).ok).toBe(false);
  });

  it('has its target cameras and its moves in the project’s ids', () => {
    const ids = projectIdEntries(withCamera()).filter((entry) => entry.path[0] === 'camera');
    expect(ids.map((entry) => [entry.id, entry.kind])).toEqual([
      ['k1', 'k'],
      ['n1', 'n'],
      ['n2', 'n'],
      ['n3', 'n'],
    ]);
    // An id used twice is the project's error, wherever the two are.
    const twice = withCamera((c) => (c.moves[1]!.id = 'n1'));
    expect(issuesOf(twice, 'duplicate-id')).toHaveLength(1);
  });
});

describe('the camera a project starts with', () => {
  it('is Manim’s frame, with no target camera and no move', () => {
    expect(createSceneCamera()).toEqual({
      initial: { center: [0, 0], height: FRAME_HEIGHT },
      targets: [],
      moves: [],
    });
    // Each call makes its own: one project's frame is not another's.
    expect(createSceneCamera().initial).not.toBe(createSceneCamera().initial);
    const p = smallProject();
    p.camera = createSceneCamera();
    expect(validateProject(p)).toEqual(validateProject(smallProject()));
  });
});

describe('the moves of a camera', () => {
  it('are windows of the scene’s time, in the order they run', () => {
    const c = camera();
    expect(cameraMoveWindow(c.moves[0]!)).toEqual({ start: 1, end: 2.5 });
    c.moves.reverse();
    expect(movesInOrder(c).map((m) => m.id)).toEqual(['n1', 'n2', 'n3']);
    // Two that start together keep the order of their ids, whatever the file's: n3 with n2.
    c.moves[0]!.start = 4;
    expect(movesInOrder(c).map((m) => m.id)).toEqual(['n1', 'n2', 'n3']);
    // The camera's own list is left as it was.
    expect(c.moves.map((m) => m.id)).toEqual(['n3', 'n2', 'n1']);
  });

  it('go to a frame of their own, to a target camera or back to the frame of 0 s', () => {
    const c = camera();
    expect(destinationFrame(c, c.moves[0]!.to)).toBe(c.targets[0]);
    expect(destinationFrame(c, c.moves[1]!.to)).toEqual({ center: [-2, 0], height: 16 / 3 });
    expect(destinationFrame(c, c.moves[2]!.to)).toBe(c.initial);
    expect(destinationFrame(c, { kind: 'target', target: 'gone' })).toBeNull();
  });

  it('make the scene last until the last of them ends', () => {
    // The clips end at 6 s; the last move at 8 s.
    expect(sceneDuration(smallProject())).toBe(6);
    expect(cameraEnd(smallProject())).toBe(0);
    const p = withCamera();
    expect(cameraEnd(p)).toBe(8);
    expect(sceneDuration(p)).toBe(8);
    // It is part of the picture: of the scene Manim renders too.
    expect(sceneDuration(p, 'visual')).toBe(8);
    p.camera!.moves = [];
    expect(sceneDuration(p)).toBe(6);
    // A duration that is set is the scene's, and says so when a move ends after it.
    const set = withCamera();
    set.meta.duration = 7;
    expect(sceneDuration(set)).toBe(7);
    expect(issuesOf(set, 'scene-duration').map((issue) => issue.message)).toEqual([
      'The scene ends before the last camera move does.',
    ]);
    set.meta.duration = 8;
    expect(issuesOf(set, 'scene-duration')).toEqual([]);
  });
});

describe('the rules of the scene’s camera', () => {
  it('keep every frame within what a camera can be', () => {
    expect(issuesOf(withCamera(), 'camera-frame')).toEqual([]);
    const edge = withCamera((c) => {
      c.initial.height = MIN_CAMERA_HEIGHT;
      c.targets[0]!.height = MAX_CAMERA_HEIGHT;
    });
    expect(issuesOf(edge, 'camera-frame')).toEqual([]);
    const past = withCamera((c) => {
      c.initial.height = MIN_CAMERA_HEIGHT / 2;
      c.targets[0]!.height = MAX_CAMERA_HEIGHT * 2;
      (c.moves[1]!.to as { frame: { height: number } }).frame.height = 1000;
    });
    const issues = issuesOf(past, 'camera-frame');
    expect(issues.map((issue) => issue.path)).toEqual([
      ['camera', 'initial', 'height'],
      ['camera', 'targets', 0, 'height'],
      ['camera', 'moves', 1, 'to', 'frame', 'height'],
    ]);
    expect(issues.every((issue) => issue.severity === 'error')).toBe(true);
    expect(issues[0]!.message).toBe(
      'A camera’s frame is 0.125 to 80 units tall (a zoom of 6400 % to 10 %); this one is 0.0625.',
    );
  });

  it('want the target camera of a move to be one of the project’s', () => {
    expect(issuesOf(withCamera(), 'dangling-ref')).toEqual([]);
    const gone = withCamera((c) => (c.targets = []));
    expect(issuesOf(gone, 'dangling-ref')).toEqual([
      {
        severity: 'error',
        code: 'dangling-ref',
        message: 'Unknown target camera "k1".',
        path: ['camera', 'moves', 0, 'to', 'target'],
      },
    ]);
  });

  it('let two moves touch and never overlap', () => {
    expect(issuesOf(withCamera(), 'camera-move-overlap')).toEqual([]);
    // n2 starts as n1 ends: they touch.
    const touching = withCamera((c) => (c.moves[1]!.start = 2.5));
    expect(issuesOf(touching, 'camera-move-overlap')).toEqual([]);
    // n2 starts while n1 runs: the later one is in error, whatever the order of the file.
    const over = withCamera((c) => {
      c.moves[1]!.start = 2;
      c.moves.reverse();
    });
    expect(issuesOf(over, 'camera-move-overlap')).toEqual([
      {
        severity: 'error',
        code: 'camera-move-overlap',
        message: 'Camera moves cannot overlap.',
        path: ['camera', 'moves', 1, 'start'],
      },
    ]);
    // A long move over two short ones: both are in error.
    const long = withCamera((c) => {
      c.moves[0]!.duration = 7;
    });
    expect(issuesOf(long, 'camera-move-overlap').map((issue) => issue.path[2])).toEqual([1, 2]);
  });

  it('warn about two target cameras of one name, which the Python tells apart', () => {
    const twins = withCamera((c) => c.targets.push({ ...c.targets[0]!, id: 'k2' }));
    expect(issuesOf(twins, 'duplicate-name')).toEqual([
      {
        severity: 'warning',
        code: 'duplicate-name',
        message: 'Target camera name "Camera 1" is used more than once.',
        path: ['camera', 'targets', 1, 'name'],
      },
    ]);
  });

  it('take a move that ends past a day for a number of a file', () => {
    const far = withCamera((c) => (c.moves[2]!.start = 90_000));
    expect(issuesOf(far, 'scene-length').map((issue) => issue.path)).toEqual([
      ['camera', 'moves', 2, 'duration'],
    ]);
  });
});

/* `smallProject`: clip a over [0, 4] with a Write intro [0, 1) and a FadeOut outro [3, 4); clip b
 * over [2, 6] with a FadeIn intro [2, 3) and a FadeOut outro [5, 6); the relation a → b runs
 * during [2, 3). */
describe('the locked region of the camera: while it moves, nothing else animates', () => {
  it('knows every window in which something animates', () => {
    const p = smallProject();
    const all = animationWindows(p);
    expect(all.map((a) => [a.owner.kind, a.window.start, a.window.end, a.path.join('.')])).toEqual([
      ['intro', 0, 1, 'clips.0.intro'],
      ['outro', 3, 4, 'clips.0.outro'],
      ['intro', 2, 3, 'clips.1.intro'],
      ['outro', 5, 6, 'clips.1.outro'],
      ['relation', 2, 3, 'relations.0'],
    ]);
    // Of one clip: its own, and the relation it is an end of.
    const ofA = animationWindows(p, new Set([p.clips[0]!.id]));
    expect(ofA.map((a) => a.path.join('.'))).toEqual([
      'clips.0.intro',
      'clips.0.outro',
      'relations.0',
    ]);
    // An intro of kind none is no animation: the clip just appears. A block is one.
    p.clips[0]!.intro = { ...p.clips[0]!.intro, kind: 'none', duration: 0 };
    p.clips[1]!.actions.push(createAppear(1.5, 'write', [0], { duration: 0.5 }));
    expect(animationWindows(p).map((a) => a.path.join('.'))).toEqual([
      'clips.0.outro',
      'clips.1.intro',
      'clips.1.outro',
      'clips.1.actions.0',
      'relations.0',
    ]);
    expect(animationWindows(p)[3]!.window).toEqual({ start: 3.5, end: 4 });
  });

  it('is an error on each animation a move overlaps; one that touches the move is none', () => {
    // n1 runs during [1, 2.5): it touches the intro of a, which ends at 1, and overlaps the intro
    // of b and the relation, which start at 2. n2 [4, 5) touches the outro of a and the one of b.
    const p = withCamera();
    expect(cameraRegionClashes(p).map((c) => [c.animation.path.join('.'), c.move.id])).toEqual([
      ['clips.1.intro', 'n1'],
      ['relations.0', 'n1'],
    ]);
    const issues = issuesOf(p, 'camera-region');
    expect(issues.map((issue) => [issue.severity, issue.path.join('.'), issue.message])).toEqual([
      [
        'error',
        'clips.1.intro',
        'The intro of "b" runs while the camera moves (1 s – 2.5 s): nothing else animates during a camera move. Move one of the two, or make it shorter.',
      ],
      [
        'error',
        'relations.0',
        'The relation "a" → "b" runs while the camera moves (1 s – 2.5 s): nothing else animates during a camera move. Move one of the two, or make it shorter.',
      ],
    ]);
    // The move made shorter, it ends as they start: the region is free again.
    p.camera!.moves[0]!.duration = 1;
    expect(issuesOf(p, 'camera-region')).toEqual([]);
  });

  it('holds for a block and for an outro, each once per move it overlaps', () => {
    const p = withCamera((c) => {
      c.moves[0]!.duration = 1; // [1, 2)
      c.moves[1]!.start = 3.5; // [3.5, 4.5): over the outro of a
    });
    // A block of a over [1.5, 3.75): over both moves.
    p.clips[0]!.actions.push(createAppear(1.5, 'write', [0], { duration: 2.25 }));
    const issues = issuesOf(p, 'camera-region');
    expect(issues.map((issue) => issue.path.join('.'))).toEqual([
      'clips.0.outro',
      'clips.0.actions.0',
      'clips.0.actions.0',
    ]);
    expect(issues[1]!.message).toMatch(
      /^The Write block of "a" runs while the camera moves \(1 s – 2 s\)/,
    );
    expect(issues[2]!.message).toMatch(/\(3\.5 s – 4\.5 s\)/);
    // Each is its own problem: the two of the block differ by the move.
    expect(new Set(issues.map((issue) => JSON.stringify(issue.identity))).size).toBe(3);
  });

  it('is nothing without a camera or without moves', () => {
    expect(cameraRegionIssues(smallProject())).toEqual([]);
    const p = smallProject();
    p.camera = createSceneCamera();
    expect(cameraRegionIssues(p)).toEqual([]);
  });

  it('is part of what the planner of blocks asks before an edit comes in', () => {
    const p = withCamera();
    const [a, b] = p.clips;
    const codes = (ids: string[]) =>
      timingIssues(p, ids)
        .filter((issue) => issue.code === 'camera-region')
        .map((issue) => issue.path.join('.'));
    // Of a: the relation it is an end of. Of b: its intro and the relation.
    expect(codes([a!.id])).toEqual(['relations.0']);
    expect(codes([b!.id])).toEqual(['clips.1.intro', 'relations.0']);
    expect(cameraRegionIssues(p, new Set())).toEqual([]);
  });
});

describe('the edges of the locked region', () => {
  it('lists where the moves start and end', () => {
    expect(cameraMoveEdges(withCamera())).toEqual([1, 2.5, 4, 5, 7, 8]);
    expect(cameraMoveEdges(smallProject())).toEqual([]);
  });

  it('gives the free time around a window among the moves', () => {
    const p = withCamera(); // moves over [1, 2.5), [4, 5) and [7, 8)
    expect(cameraGap(p, { start: 3, end: 3.5 })).toEqual({ start: 2.5, end: 4 });
    // Touching is not overlapping.
    expect(cameraGap(p, { start: 2.5, end: 4 })).toEqual({ start: 2.5, end: 4 });
    expect(cameraGap(p, { start: 0, end: 0.5 })).toEqual({ start: -Infinity, end: 1 });
    expect(cameraGap(p, { start: 9, end: 10 })).toEqual({ start: 8, end: Infinity });
    // A move it overlaps does not bound it: it can be taken out.
    expect(cameraGap(p, { start: 3, end: 4.5 })).toEqual({ start: 2.5, end: 7 });
    expect(cameraGap(smallProject(), { start: 3, end: 4 })).toEqual({
      start: -Infinity,
      end: Infinity,
    });
  });

  it('words a clash for an edit that runs into it: when the camera moves', () => {
    const p = withCamera();
    const [issue] = issuesOf(p, 'camera-region');
    expect(issue).toBeDefined();
    expect(cameraClashSentence(p, issue!)).toMatch(
      /^The camera moves from \d+\.\d\d s to \d+\.\d\d s, and nothing else animates while it does\.$/,
    );
    // Not another issue, nor one whose move is gone.
    expect(cameraClashSentence(p, { ...issue!, code: 'camera-frame' })).toBeNull();
    expect(cameraClashSentence(smallProject(), issue!)).toBeNull();
  });
});
