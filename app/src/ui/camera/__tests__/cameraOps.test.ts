// @vitest-environment node
/* What the editor does to the scene's camera (D190): the multicamera on and off, the time a move
 * may take among the animations, moves and target cameras, and whose frame a drag edits. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FRAME_HEIGHT,
  MAX_CAMERA_HEIGHT,
  MAX_SCENE_SECONDS,
  MIN_CAMERA_HEIGHT,
  animationWindows,
  defaultCameraFrame,
  setIdGenerator,
  validateProject,
  type CameraMove,
  type Project,
  type SceneCamera,
} from '../../../model';
import { sequentialIds } from '../../../test/sequentialIds';
import { smallProject } from '../../../model/__tests__/fixtures';
import {
  DEFAULT_MOVE_DURATION,
  MIN_MOVE_DURATION,
  busyThings,
  busyWindows,
  clampFrame,
  clampMoveTiming,
  createCameraMove,
  createTargetCamera,
  deleteCameraMove,
  deleteTargetCamera,
  duplicateCameraMove,
  findMoveSlot,
  frameAfterMove,
  freeGap,
  heightOfZoom,
  moveDescription,
  moveFrameOwner,
  moveLabel,
  moveLimits,
  moveSnapPoints,
  moveStopReason,
  movesToTarget,
  nextTargetName,
  ownerFrame,
  patchCameraMove,
  restingFrameOwner,
  sameOwner,
  targetNameIssue,
  turnMulticameraOff,
  turnMulticameraOn,
  turnOffBlocker,
  withFrameField,
  writeFrame,
  zoomPercent,
} from '../cameraOps';

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
  easing: CameraMove['easing'] = 'smooth',
): CameraMove => ({ id, start, duration, easing, to });

const OWN: CameraMove['to'] = { kind: 'frame', frame: { center: [-2, 0], height: 4 } };

/** A camera with a target camera and three moves: to the target, to a frame of its own, back. */
function camera(): SceneCamera {
  return {
    initial: defaultCameraFrame(),
    targets: [{ id: 'k1', name: 'Camera 1', center: [3, 1], height: 4 }],
    moves: [
      move('n1', 1, 1, { kind: 'target', target: 'k1' }),
      move('n2', 4, 1, OWN),
      move('n3', 7, 1, { kind: 'start' }),
    ],
  };
}

/** `smallProject` animates during [0, 1), [2, 3), [3, 4) and [5, 6): the intro of its first clip,
 * the intro of the second and the relation into it, the outro of the first and the outro of the
 * second. */
function project(moves: CameraMove[] = []): Project {
  const p = smallProject();
  p.camera = { initial: defaultCameraFrame(), targets: [], moves };
  return p;
}

describe('the fixture', () => {
  it('animates in the windows the tests below count on', () => {
    const windows = animationWindows(project())
      .map(({ window }) => [window.start, window.end])
      .sort((a, b) => a[0]! - b[0]!);
    expect(windows).toEqual([
      [0, 1],
      [2, 3],
      [2, 3],
      [3, 4],
      [5, 6],
    ]);
  });
});

describe('the multicamera', () => {
  it('turns on with a camera in Manim’s own frame, and leaves a camera that is there', () => {
    const off = smallProject();
    const on = turnMulticameraOn(off);
    expect(on.camera).toEqual({
      initial: { center: [0, 0], height: FRAME_HEIGHT },
      targets: [],
      moves: [],
    });
    expect(off.camera).toBeUndefined();
    expect(turnMulticameraOn(on)).toBe(on);
    expect(validateProject(on).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('turns off only once every target camera and every move is deleted', () => {
    const p = project();
    p.camera!.initial = { center: [2, 1], height: 3 };
    expect(turnOffBlocker(p.camera!)).toBeNull();
    const off = turnMulticameraOff(p);
    expect('camera' in off).toBe(false);
    expect(p.camera).toBeDefined();

    const held = { ...p, camera: camera() };
    expect(turnMulticameraOff(held)).toBe(held);
    expect(turnOffBlocker(held.camera)).toBe(
      'Delete every target camera and camera move to turn Multicamera off (there are 1 target camera and 3 camera moves).',
    );
    expect(turnOffBlocker({ ...camera(), targets: [], moves: [move('n1', 1, 1, OWN)] })).toBe(
      'Delete every target camera and camera move to turn Multicamera off (there is 1 camera move).',
    );
    expect(turnOffBlocker({ ...camera(), moves: [] })).toBe(
      'Delete every target camera and camera move to turn Multicamera off (there is 1 target camera).',
    );
    const without = smallProject();
    expect(turnMulticameraOff(without)).toBe(without);
  });
});

describe('frames', () => {
  it('keeps a frame within the bounds of a camera', () => {
    expect(clampFrame({ center: [1, -2], height: 4 })).toEqual({ center: [1, -2], height: 4 });
    expect(clampFrame({ center: [1, -2], height: 0 }).height).toBe(MIN_CAMERA_HEIGHT);
    expect(clampFrame({ center: [1, -2], height: 1e9 }).height).toBe(MAX_CAMERA_HEIGHT);
    expect(clampFrame({ center: [NaN, Infinity], height: NaN })).toEqual({
      center: [0, 0],
      height: FRAME_HEIGHT,
    });
  });

  it('shows the zoom in per cent of Manim’s own frame', () => {
    expect(zoomPercent({ height: FRAME_HEIGHT })).toBe(100);
    expect(zoomPercent({ height: 4 })).toBe(200);
    expect(zoomPercent({ height: 16 })).toBe(50);
    expect(heightOfZoom(200)).toBe(4);
    expect(heightOfZoom(50)).toBe(16);
    expect(heightOfZoom(0)).toBe(MAX_CAMERA_HEIGHT);
    expect(heightOfZoom(-5)).toBe(MAX_CAMERA_HEIGHT);
    expect(heightOfZoom(1e9)).toBe(MIN_CAMERA_HEIGHT);
  });
});

describe('the time of a move', () => {
  it('cannot run alongside the animations nor the other moves', () => {
    const p = project([move('n1', 1, 0.5, OWN), move('n2', 4, 1, OWN)]);
    const spans = (except?: string) => busyWindows(p, except).map((w) => [w.start, w.end]);
    expect(spans()).toEqual([
      [0, 1],
      [1, 1.5],
      [2, 3],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ]);
    expect(spans('n1')).not.toContainEqual([1, 1.5]);
    expect(busyWindows(smallProject()).map((w) => [w.start, w.end])).toEqual([
      [0, 1],
      [2, 3],
      [2, 3],
      [3, 4],
      [5, 6],
    ]);
  });

  it('knows what each busy window is: another move, or an animation with its owner', () => {
    const p = project([move('n1', 1, 0.5, OWN)]);
    const things = busyThings(p).map((thing) =>
      thing.kind === 'move' ? `move ${thing.move.id}` : thing.animation.owner.kind,
    );
    expect(things).toEqual(['intro', 'move n1', 'intro', 'relation', 'outro', 'outro']);
    expect(busyThings(p, 'n1').some((thing) => thing.kind === 'move')).toBe(false);
  });

  it('snaps to the playhead, to what it cannot run alongside and to the ends of the clips', () => {
    const p = project([move('n1', 1.2, 0.5, OWN), move('n2', 4.25, 0.5, OWN)]);
    const points = moveSnapPoints(p, 'n1', 7.7);
    // The playhead; the other move; the animations; the clips over [0, 4] and [2, 6].
    for (const t of [7.7, 4.25, 4.75, 0, 1, 2, 3, 4, 5, 6]) expect(points).toContain(t);
    // Not its own edges.
    expect(points).not.toContain(1.2);
    expect(points).not.toContain(1.7);
  });

  it('says what a move stops against', () => {
    const p = project([
      move('n1', 1.2, 0.5, OWN),
      move('n2', 4, 0.5, OWN),
      move('n3', 4.5, 0.25, OWN),
    ]);
    const why = (
      id: string,
      wanted: [number, number],
      got: [number, number],
      edit: 'move' | 'start' | 'end',
    ) =>
      moveStopReason(
        p,
        id,
        { start: wanted[0], end: wanted[1] },
        { start: got[0], duration: got[1] - got[0] },
        edit,
      );
    // Pushed on, into the intro of the second clip and the relation into it, at 2 s.
    expect(why('n1', [1.8, 2.3], [1.5, 2], 'move')).toBe(
      'The intro of "b" starts here, and nothing else animates while the camera moves.',
    );
    expect(why('n1', [1.2, 2.4], [1.2, 2], 'end')).toBe(
      'The intro of "b" starts here, and nothing else animates while the camera moves.',
    );
    // Pushed back, into the intro of the first clip, which ends at 1 s.
    expect(why('n1', [0.6, 1.1], [1, 1.5], 'move')).toBe(
      'The intro of "a" ends here, and nothing else animates while the camera moves.',
    );
    expect(why('n1', [0.6, 1.7], [1, 1.7], 'start')).toBe(
      'The intro of "a" ends here, and nothing else animates while the camera moves.',
    );
    // Against another move.
    expect(why('n2', [4.2, 4.7], [4, 4.5], 'move')).toBe(
      'Another camera move starts here, and nothing else animates while the camera moves.',
    );
    expect(why('n3', [4.3, 4.55], [4.5, 4.75], 'move')).toBe(
      'Another camera move ends here, and nothing else animates while the camera moves.',
    );
    // An edge pushed past the shortest a move is.
    expect(why('n1', [1.69, 1.7], [1.65, 1.7], 'start')).toBe(
      'A camera move lasts at least 0.05 s.',
    );
    expect(why('n1', [1.2, 1.21], [1.2, 1.25], 'end')).toBe('A camera move lasts at least 0.05 s.');
    // The start of the scene.
    const early = project([move('n1', 0.2, 0.3, OWN)]);
    early.clips = [];
    early.relations = [];
    expect(
      moveStopReason(early, 'n1', { start: -0.4, end: -0.1 }, { start: 0, duration: 0.3 }, 'move'),
    ).toBe('The scene starts at 0 s.');
  });

  it('has the free gap around it: from what ends before it to what starts after it', () => {
    const busy = [
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 5, end: 6 },
    ];
    expect(freeGap(busy, { start: 1.2, end: 1.6 })).toEqual({ start: 1, end: 2 });
    // Touching is not overlapping.
    expect(freeGap(busy, { start: 1, end: 2 })).toEqual({ start: 1, end: 2 });
    expect(freeGap(busy, { start: 3, end: 4 })).toEqual({ start: 3, end: 5 });
    expect(freeGap(busy, { start: 7, end: 8 })).toEqual({ start: 6, end: MAX_SCENE_SECONDS });
    expect(freeGap([], { start: 7, end: 8 })).toEqual({ start: 0, end: MAX_SCENE_SECONDS });
    // What it overlaps does not bound it: a move in the wrong place can be taken out.
    expect(freeGap(busy, { start: 2.5, end: 4 })).toEqual({ start: 1, end: 5 });
  });

  it('gives a move the limits of the gap it is in', () => {
    const p = project([
      move('n1', 1.2, 0.5, OWN),
      move('n2', 4, 0.5, OWN),
      move('n3', 4.5, 0.25, OWN),
    ]);
    expect(moveLimits(p, 'n1')).toEqual({ start: 1, end: 2 });
    expect(moveLimits(p, 'n2')).toEqual({ start: 4, end: 4.5 });
    expect(moveLimits(p, 'n3')).toEqual({ start: 4.5, end: 5 });
    expect(moveLimits(p, 'n9')).toBeNull();
    expect(moveLimits(smallProject(), 'n1')).toBeNull();
  });

  it('moves a move within its gap, keeping its length', () => {
    const limits = { start: 1, end: 2 };
    const current = { start: 1.2, duration: 0.5 };
    const moved = (start: number) =>
      clampMoveTiming(limits, current, { start, duration: 0.5 }, 'move');
    expect(moved(1.3)).toEqual({ start: 1.3, duration: 0.5, stopped: false });
    expect(moved(0.2)).toEqual({ start: 1, duration: 0.5, stopped: true });
    expect(moved(1.9)).toEqual({ start: 1.5, duration: 0.5, stopped: true });
    // A move longer than its gap (a project in error) is cut to it.
    expect(
      clampMoveTiming(limits, { start: 1, duration: 3 }, { start: 1.5, duration: 3 }, 'move'),
    ).toEqual({ start: 1, duration: 1, stopped: true });
  });

  it('stretches an edge as far as the gap, and no shorter than a move can be', () => {
    const limits = { start: 1, end: 2 };
    const current = { start: 1.2, duration: 0.5 };
    const start = (at: number) =>
      clampMoveTiming(limits, current, { start: at, duration: 1.7 - at }, 'start');
    expect(start(1.1)).toEqual({ start: 1.1, duration: 0.6, stopped: false });
    expect(start(0.5)).toEqual({ start: 1, duration: 0.7, stopped: true });
    expect(start(1.69)).toEqual({ start: 1.65, duration: MIN_MOVE_DURATION, stopped: true });
    const end = (duration: number) =>
      clampMoveTiming(limits, current, { start: 1.2, duration }, 'end');
    expect(end(0.7)).toEqual({ start: 1.2, duration: 0.7, stopped: false });
    expect(end(3)).toEqual({ start: 1.2, duration: 0.8, stopped: true });
    expect(end(0.01)).toEqual({ start: 1.2, duration: MIN_MOVE_DURATION, stopped: true });
    expect(end(-1)).toEqual({ start: 1.2, duration: MIN_MOVE_DURATION, stopped: true });
  });

  it('finds where a new move fits: at the time asked, shorter there, or in the next gap', () => {
    const p = project();
    // Room at the time asked.
    expect(findMoveSlot(p, 6.5)).toEqual({ start: 6.5, duration: 1, moved: false });
    expect(findMoveSlot(p, 1)).toEqual({ start: 1, duration: 1, moved: false });
    expect(findMoveSlot(p, 1, 0.5)).toEqual({ start: 1, duration: 0.5, moved: false });
    // Less room than wanted, and worth it: what is left of the gap.
    expect(findMoveSlot(p, 1.5)).toEqual({ start: 1.5, duration: 0.5, moved: false });
    // Not worth it: the next gap, [4, 5).
    expect(findMoveSlot(p, 1.9)).toEqual({ start: 4, duration: 1, moved: true });
    // Inside an animation: the gap after it.
    expect(findMoveSlot(p, 0.4)).toEqual({ start: 1, duration: 1, moved: true });
    expect(findMoveSlot(p, 2.5)).toEqual({ start: 4, duration: 1, moved: true });
    // A longer move than the gaps: the first one worth it, as long as it is.
    expect(findMoveSlot(p, 0, 3)).toEqual({ start: 1, duration: 1, moved: true });
    // The other moves count.
    const busy = project([move('n1', 1, 1, OWN), move('n2', 4, 0.9, OWN)]);
    expect(findMoveSlot(busy, 1)).toEqual({ start: 6, duration: 1, moved: true });
    expect(findMoveSlot(busy, -3)).toEqual({ start: 6, duration: 1, moved: true });
    // A scene without animations has room anywhere.
    const empty = smallProject();
    empty.clips = [];
    empty.relations = [];
    expect(findMoveSlot(empty, 2.25)).toEqual({ start: 2.25, duration: 1, moved: false });
    expect(DEFAULT_MOVE_DURATION).toBe(1);
    expect(findMoveSlot(empty, MAX_SCENE_SECONDS)).toBeNull();
  });
});

describe('moves', () => {
  it('makes a move at Manim’s defaults, with a new id', () => {
    const made = createCameraMove(1.0000004, 0.5000001, { kind: 'start' });
    expect(made).toEqual({
      id: 'n_1',
      start: 1,
      duration: 0.5,
      easing: 'smooth',
      to: { kind: 'start' },
    });
    expect(createCameraMove(0, 1, OWN, 'linear').easing).toBe('linear');
  });

  it('patches and deletes a move, leaving the others', () => {
    const c = camera();
    const patched = patchCameraMove(c, 'n2', { start: 5, easing: 'linear' });
    expect(patched.moves.map((m) => [m.id, m.start, m.easing])).toEqual([
      ['n1', 1, 'smooth'],
      ['n2', 5, 'linear'],
      ['n3', 7, 'smooth'],
    ]);
    expect(patched.moves[0]).toBe(c.moves[0]);
    expect(c.moves[1]!.start).toBe(4);
    expect(deleteCameraMove(c, 'n2').moves.map((m) => m.id)).toEqual(['n1', 'n3']);
    expect(deleteCameraMove(c, 'n9').moves).toHaveLength(3);
  });

  it('duplicates a move into the first place it fits after it', () => {
    const p = project([move('n1', 1, 0.5, OWN, 'linear')]);
    const copy = duplicateCameraMove(p, 'n1')!;
    // [1.5, 2) is free, and has room for it.
    expect(copy).toMatchObject({ start: 1.5, duration: 0.5, easing: 'linear', to: OWN });
    // A gap too short for it is passed over: the copy is as long as the move.
    const long = project([move('n1', 1, 0.25, OWN), move('n2', 1.25, 0.5, OWN)]);
    expect(duplicateCameraMove(long, 'n2')).toMatchObject({ start: 4, duration: 0.5 });
    expect(findMoveSlot(long, 1.75, 0.5)).toEqual({ start: 1.75, duration: 0.25, moved: false });
    expect(findMoveSlot(long, 1.75, 0.5, true)).toEqual({ start: 4, duration: 0.5, moved: true });
    expect(copy.id).not.toBe('n1');
    expect(copy.to).not.toBe(OWN);
    expect((copy.to as { frame: unknown }).frame).not.toBe((OWN as { frame: unknown }).frame);
    // No room right after it: the next gap.
    const tight = project([move('n1', 1, 1, { kind: 'target', target: 'k1' })]);
    expect(duplicateCameraMove(tight, 'n1')).toMatchObject({
      start: 4,
      duration: 1,
      to: { kind: 'target', target: 'k1' },
    });
    expect(duplicateCameraMove(p, 'n9')).toBeNull();
  });

  it('knows the frame the camera is in after a move', () => {
    const c = camera();
    expect(frameAfterMove(c, 'n1')).toMatchObject({ center: [3, 1], height: 4 });
    expect(frameAfterMove(c, 'n2')).toEqual({ center: [-2, 0], height: 4 });
    expect(frameAfterMove(c, 'n3')).toEqual(c.initial);
    expect(frameAfterMove(c, 'n9')).toBeNull();
    // There and back: where it was.
    c.moves[1] = move('n2', 4, 1, OWN, 'there_and_back');
    expect(frameAfterMove(c, 'n2')).toMatchObject({ center: [3, 1], height: 4 });
  });
});

describe('target cameras', () => {
  it('names a new one after the first free number', () => {
    const c = camera();
    expect(nextTargetName(c)).toBe('Camera 2');
    c.targets.push({ id: 'k2', name: 'Camera 3', center: [0, 0], height: 8 });
    expect(nextTargetName(c)).toBe('Camera 2');
    c.targets[0]!.name = 'Wide';
    expect(nextTargetName(c)).toBe('Camera 1');
    const made = createTargetCamera(c, { center: [1, 2], height: 1e9 });
    expect(made).toEqual({
      id: 'k_1',
      name: 'Camera 1',
      center: [1, 2],
      height: MAX_CAMERA_HEIGHT,
    });
  });

  it('takes any name that says something', () => {
    expect(targetNameIssue('Wide')).toBeNull();
    expect(targetNameIssue('   ')).toBe('A target camera needs a name.');
    expect(targetNameIssue('')).toBe('A target camera needs a name.');
  });

  it('lists the moves that go to one, in the order they run', () => {
    const c = camera();
    c.moves.push(move('n4', 0, 0.5, { kind: 'target', target: 'k1' }));
    expect(movesToTarget(c, 'k1').map((m) => m.id)).toEqual(['n4', 'n1']);
    expect(movesToTarget(c, 'k9')).toEqual([]);
  });

  it('deleted, leaves its moves going where it was, to a frame of their own', () => {
    const c = camera();
    c.moves.push(move('n4', 9, 0.5, { kind: 'target', target: 'k1' }));
    const without = deleteTargetCamera(c, 'k1');
    expect(without.targets).toEqual([]);
    const own = { kind: 'frame', frame: { center: [3, 1], height: 4 } };
    expect(without.moves.map((m) => m.to)).toEqual([own, OWN, { kind: 'start' }, own]);
    // Each its own: editing one leaves the other.
    const [first, , , last] = without.moves;
    expect((first!.to as { frame: unknown }).frame).not.toBe(
      (last!.to as { frame: unknown }).frame,
    );
    expect(without.moves[1]).toBe(c.moves[1]);
    expect(c.targets).toHaveLength(1);
    expect(deleteTargetCamera(c, 'k9')).toBe(c);
  });
});

describe('the frame a drag edits', () => {
  it('is the one the camera rests in: the last destination reached', () => {
    const c = camera();
    expect(restingFrameOwner(c, 0)).toEqual({ kind: 'initial' });
    expect(restingFrameOwner(c, 0.99)).toEqual({ kind: 'initial' });
    // On its way: none.
    expect(restingFrameOwner(c, 1)).toBeNull();
    expect(restingFrameOwner(c, 1.5)).toBeNull();
    // A move's window is half-open: at its end the camera is there.
    expect(restingFrameOwner(c, 2)).toEqual({ kind: 'target', id: 'k1' });
    expect(restingFrameOwner(c, 3.9)).toEqual({ kind: 'target', id: 'k1' });
    expect(restingFrameOwner(c, 5)).toEqual({ kind: 'move', id: 'n2' });
    expect(restingFrameOwner(c, 7.5)).toBeNull();
    expect(restingFrameOwner(c, 8)).toEqual({ kind: 'initial' });
    expect(restingFrameOwner(c, 100)).toEqual({ kind: 'initial' });
  });

  it('stays whose it was after a move that goes and comes back, or goes nowhere', () => {
    const c = camera();
    c.moves[1] = move('n2', 4, 1, OWN, 'there_and_back');
    expect(restingFrameOwner(c, 5)).toEqual({ kind: 'target', id: 'k1' });
    // A target camera that does not exist: the move goes nowhere.
    const lost = camera();
    lost.moves[0] = move('n1', 1, 1, { kind: 'target', target: 'k9' });
    expect(restingFrameOwner(lost, 2)).toEqual({ kind: 'initial' });
  });

  it('knows whose frame a move goes to: its own, its target camera’s, the frame of 0 s', () => {
    const c = camera();
    expect(moveFrameOwner(c, 'n1')).toEqual({ kind: 'target', id: 'k1' });
    expect(moveFrameOwner(c, 'n2')).toEqual({ kind: 'move', id: 'n2' });
    expect(moveFrameOwner(c, 'n3')).toEqual({ kind: 'initial' });
    // A move that is gone, or whose target camera is, goes to no frame.
    expect(moveFrameOwner(c, 'n9')).toBeNull();
    c.moves[0] = move('n1', 1, 1, { kind: 'target', target: 'k9' });
    expect(moveFrameOwner(c, 'n1')).toBeNull();
  });

  it('tells two owners apart', () => {
    expect(sameOwner({ kind: 'initial' }, { kind: 'initial' })).toBe(true);
    expect(sameOwner({ kind: 'move', id: 'n1' }, { kind: 'move', id: 'n1' })).toBe(true);
    expect(sameOwner({ kind: 'move', id: 'n1' }, { kind: 'move', id: 'n2' })).toBe(false);
    // A move and a target camera may have the same id: they are not the same frame.
    expect(sameOwner({ kind: 'move', id: 'a' }, { kind: 'target', id: 'a' })).toBe(false);
    expect(sameOwner(null, null)).toBe(true);
    expect(sameOwner(null, { kind: 'initial' })).toBe(false);
  });

  it('writes a frame where its owner keeps it', () => {
    const c = camera();
    const frame = { center: [5, -1] as [number, number], height: 2 };
    expect(writeFrame(c, { kind: 'initial' }, frame).initial).toEqual(frame);
    expect(writeFrame(c, { kind: 'target', id: 'k1' }, frame).targets).toEqual([
      { id: 'k1', name: 'Camera 1', ...frame },
    ]);
    const moved = writeFrame(c, { kind: 'move', id: 'n2' }, frame);
    expect(moved.moves[1]!.to).toEqual({ kind: 'frame', frame });
    expect(moved.moves[0]).toBe(c.moves[0]);
    expect(c.moves[1]!.to).toEqual(OWN);
    // Within the bounds of a camera, whatever is asked.
    expect(writeFrame(c, { kind: 'initial' }, { center: [0, 0], height: 0 }).initial.height).toBe(
      MIN_CAMERA_HEIGHT,
    );
  });

  it('reads the frame an owner keeps: none for one that has no frame of its own any more', () => {
    const c = camera();
    expect(ownerFrame(c, { kind: 'initial' })).toEqual(c.initial);
    const [k1] = c.targets;
    expect(ownerFrame(c, { kind: 'target', id: 'k1' })).toEqual({
      center: k1!.center,
      height: k1!.height,
    });
    expect(ownerFrame(c, { kind: 'move', id: 'n2' })).toEqual((OWN as { frame: unknown }).frame);
    // A move that goes to a target camera, or to the start, keeps no frame; nor what is gone.
    for (const move of c.moves.filter((m) => m.to.kind !== 'frame')) {
      expect(ownerFrame(c, { kind: 'move', id: move.id })).toBeNull();
    }
    expect(ownerFrame(c, { kind: 'move', id: 'gone' })).toBeNull();
    expect(ownerFrame(c, { kind: 'target', id: 'gone' })).toBeNull();
  });

  it('changes one number of a frame and leaves the other two', () => {
    const frame = { center: [1, 2] as [number, number], height: 4 };
    expect(withFrameField(frame, 'x', 5)).toEqual({ center: [5, 2], height: 4 });
    expect(withFrameField(frame, 'y', 5)).toEqual({ center: [1, 5], height: 4 });
    // The zoom is in per cent of Manim's own frame, 8 units tall.
    expect(withFrameField(frame, 'zoom', 200)).toEqual({ center: [1, 2], height: 4 });
    expect(withFrameField(frame, 'zoom', 50)).toEqual({ center: [1, 2], height: 16 });
    expect(frame).toEqual({ center: [1, 2], height: 4 });
  });
});

describe('the name of a move', () => {
  it('says where it goes', () => {
    const c = camera();
    expect(c.moves.map((m) => moveLabel(c, m))).toEqual(['→ Camera 1', '→ 200 %', '→ Start']);
    expect(moveLabel(c, move('n4', 0, 1, { kind: 'target', target: 'k9' }))).toBe(
      '→ (missing camera)',
    );
    expect(
      moveLabel(c, move('n4', 0, 1, { kind: 'frame', frame: { center: [0, 0], height: 3 } })),
    ).toBe('→ 267 %');
  });

  it('reads with its time for assistive technology', () => {
    const c = camera();
    expect(c.moves.map((m) => moveDescription(c, m))).toEqual([
      'Camera move to Camera 1, 1 s to 2 s',
      'Camera move to 200 %, 4 s to 5 s',
      'Camera move to Start, 7 s to 8 s',
    ]);
    expect(moveDescription(c, move('n4', 0.1, 0.2, { kind: 'start' }))).toBe(
      'Camera move to Start, 0.1 s to 0.3 s',
    );
  });
});
