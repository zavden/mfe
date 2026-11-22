// @vitest-environment node
/* Where the scene's camera is at an instant (D190, `scene/camera.ts`): the chain of its moves and
 * Manim's law — the centre and the height in a straight line under the rate function. */
import { describe, expect, it } from 'vitest';
import {
  FRAME_HEIGHT,
  createSceneCamera,
  type CameraMove,
  type Easing,
  type SceneCamera,
} from '../../model';
import {
  cameraActs,
  cameraAt,
  cameraLegs,
  cameraStateAt,
  mixFrames,
  rateFunction,
  sameFrame,
  sceneFraming,
} from '..';

const move = (
  id: string,
  start: number,
  duration: number,
  to: CameraMove['to'],
  easing: Easing = 'linear',
): CameraMove => ({ id, start, duration, easing, to });

/** Manim's frame at 0 s; to Camera 1 during [1, 3); to a frame of its own during [4, 5); back to
 * the start during [7, 8). */
function camera(): SceneCamera {
  return {
    initial: { center: [0, 0], height: 8 },
    targets: [{ id: 'k1', name: 'Camera 1', center: [4, 2], height: 4 }],
    moves: [
      move('n3', 7, 1, { kind: 'start' }),
      move('n1', 1, 2, { kind: 'target', target: 'k1' }),
      move('n2', 4, 1, { kind: 'frame', frame: { center: [-2, 0], height: 16 } }),
    ],
  };
}

describe('the legs of a camera', () => {
  it('join the frame each move leaves to the frame it goes to, in the order they run', () => {
    const legs = cameraLegs(camera());
    expect(legs.map((leg) => [leg.move.id, leg.start, leg.end])).toEqual([
      ['n1', 1, 3],
      ['n2', 4, 5],
      ['n3', 7, 8],
    ]);
    expect(legs.map((leg) => [leg.from.center, leg.from.height])).toEqual([
      [[0, 0], 8],
      [[4, 2], 4],
      [[-2, 0], 16],
    ]);
    expect(legs.map((leg) => [leg.to.center, leg.to.height])).toEqual([
      [[4, 2], 4],
      [[-2, 0], 16],
      [[0, 0], 8],
    ]);
    expect(legs.every((leg) => leg.rest === leg.to)).toBe(true);
  });

  it('leave the camera where it was after a move that ends where it started', () => {
    const c = camera();
    c.moves.find((m) => m.id === 'n1')!.easing = 'there_and_back';
    const [first, second] = cameraLegs(c);
    expect(first!.to.center).toEqual([4, 2]);
    expect(first!.rest).toBe(c.initial);
    // The next move leaves from there.
    expect(second!.from).toBe(c.initial);
  });

  it('take a move to a target camera that does not exist nowhere', () => {
    const c = camera();
    c.targets = [];
    const [first, second] = cameraLegs(c);
    expect(first!.to).toBe(c.initial);
    expect(second!.from).toBe(c.initial);
  });

  it('follow a target camera that is moved', () => {
    const c = camera();
    c.targets[0]!.center = [1, 1];
    expect(cameraLegs(c)[0]!.to.center).toEqual([1, 1]);
  });
});

describe('the frame of the camera at an instant', () => {
  it('is the initial frame before the first move, and the frame reached between moves', () => {
    const c = camera();
    expect(cameraAt(c, 0, 'ce')).toEqual({ center: [0, 0], height: 8 });
    expect(cameraAt(c, 0.999, 'ce')).toEqual({ center: [0, 0], height: 8 });
    // Resting in a target camera, the frame is the target's own (with its name).
    expect(cameraAt(c, 3, 'ce')).toBe(c.targets[0]);
    expect(cameraAt(c, 3.5, 'ce')).toMatchObject({ center: [4, 2], height: 4 });
    expect(cameraAt(c, 6, 'ce')).toEqual({ center: [-2, 0], height: 16 });
    expect(cameraAt(c, 8, 'ce')).toEqual({ center: [0, 0], height: 8 });
    expect(cameraAt(c, 100, 'ce')).toEqual({ center: [0, 0], height: 8 });
  });

  it('goes in a straight line during a move: the centre and the height', () => {
    const c = camera();
    // Linear: half of the way at half of the time.
    expect(cameraAt(c, 2, 'ce')).toEqual({ center: [2, 1], height: 6 });
    expect(cameraAt(c, 1.5, 'gl')).toEqual({ center: [1, 0.5], height: 7 });
    // A move starts in the frame it leaves (its window is half-open at the end).
    expect(cameraAt(c, 1, 'ce')).toEqual({ center: [0, 0], height: 8 });
    expect(cameraAt(c, 4.25, 'ce')).toEqual({ center: [2.5, 1.5], height: 7 });
  });

  it('follows the rate function of the move, the library’s own', () => {
    const c = camera();
    c.moves.find((m) => m.id === 'n1')!.easing = 'smooth';
    for (const target of ['ce', 'gl'] as const) {
      const alpha = rateFunction('smooth', target)(0.25);
      const frame = cameraAt(c, 1.5, target);
      expect(frame.center[0]).toBeCloseTo(4 * alpha, 12);
      expect(frame.center[1]).toBeCloseTo(2 * alpha, 12);
      expect(frame.height).toBeCloseTo(8 - 4 * alpha, 12);
      // The aspect is the project's all along: centre and height alone are kept.
      expect(Object.keys(frame).sort()).toEqual(['center', 'height']);
    }
    // The two libraries' curves differ a little; a quarter of the way is not a quarter of the time.
    expect(cameraAt(c, 1.5, 'ce').height).not.toBe(7);
  });

  it('goes there and back with an easing that ends where it started', () => {
    const c = camera();
    c.moves.find((m) => m.id === 'n1')!.easing = 'there_and_back';
    const top = cameraAt(c, 2, 'ce');
    expect(top.center[0]).toBeCloseTo(4, 9);
    expect(top.height).toBeCloseTo(4, 9);
    expect(cameraAt(c, 3, 'ce')).toEqual({ center: [0, 0], height: 8 });
  });

  it('says whether the camera rests, and after which move', () => {
    const c = camera();
    const before = cameraStateAt(c, 0.5, 'ce');
    expect([before.leg, before.after]).toEqual([null, null]);
    expect(before.frame).toBe(c.initial);
    const during = cameraStateAt(c, 2, 'ce');
    expect(during.leg!.move.id).toBe('n1');
    expect(during.after).toBeNull();
    const resting = cameraStateAt(c, 3.5, 'ce');
    expect(resting.leg).toBeNull();
    expect(resting.after!.move.id).toBe('n1');
    // Resting in a target camera, the frame is the target's own object: what a drag changes.
    expect(resting.frame).toBe(c.targets[0]);
    expect(cameraStateAt(c, 9, 'ce').after!.move.id).toBe('n3');
  });

  it('is Manim’s own frame for a project without a camera', () => {
    expect(cameraAt(undefined, 3, 'ce')).toEqual({ center: [0, 0], height: FRAME_HEIGHT });
  });
});

describe('frames', () => {
  it('mix in a straight line and compare to what a file keeps', () => {
    const a = { center: [0, 0] as [number, number], height: 8 };
    const b = { center: [4, -2] as [number, number], height: 2 };
    expect(mixFrames(a, b, 0)).toEqual(a);
    expect(mixFrames(a, b, 1)).toEqual(b);
    expect(mixFrames(a, b, 0.5)).toEqual({ center: [2, -1], height: 5 });
    expect(sameFrame(a, { center: [0, 0], height: 8 })).toBe(true);
    expect(sameFrame(a, { center: [1e-12, 0], height: 8 })).toBe(true);
    expect(sameFrame(a, { center: [0, 0], height: 8.001 })).toBe(false);
    expect(sameFrame(a, { center: [0, 0.001], height: 8 })).toBe(false);
  });
});

describe('whether the camera does anything', () => {
  it('does not without a camera, nor with the camera a project starts with', () => {
    expect(cameraActs(undefined)).toBe(false);
    expect(cameraActs(createSceneCamera())).toBe(false);
  });

  it('does when its frame at 0 s is not Manim’s', () => {
    const c = createSceneCamera();
    c.initial.height = 4;
    expect(cameraActs(c)).toBe(true);
    c.initial = { center: [1, 0], height: 8 };
    expect(cameraActs(c)).toBe(true);
  });

  it('does when a move goes somewhere, and not when it goes to where the camera is', () => {
    const c = createSceneCamera();
    c.moves.push(move('n1', 1, 1, { kind: 'start' }));
    c.moves.push(move('n2', 3, 1, { kind: 'frame', frame: { center: [0, 0], height: 8 } }));
    expect(cameraActs(c)).toBe(false);
    // Target cameras alone do nothing: no move goes to them.
    c.targets.push({ id: 'k1', name: 'Camera 1', center: [3, 0], height: 4 });
    expect(cameraActs(c)).toBe(false);
    c.moves.push(move('n3', 5, 1, { kind: 'target', target: 'k1' }));
    expect(cameraActs(c)).toBe(true);
    // There and back is a move too: the picture changes on the way.
    const pulse = createSceneCamera();
    pulse.moves.push(
      move('n1', 1, 1, { kind: 'frame', frame: { center: [2, 0], height: 8 } }, 'there_and_back'),
    );
    expect(cameraActs(pulse)).toBe(true);
  });
});

describe('how a scene is filmed', () => {
  const project = (c: SceneCamera | undefined, target: 'ce' | 'gl' = 'ce') => ({
    camera: c,
    meta: { target },
  });

  it('is through Manim’s still frame without a camera, or with one that does nothing', () => {
    expect(sceneFraming(project(undefined))).toBeNull();
    expect(sceneFraming(project(createSceneCamera()))).toBeNull();
  });

  it('is through the camera’s frame of every instant when the camera does something', () => {
    for (const target of ['ce', 'gl'] as const) {
      const c = camera();
      c.moves.find((m) => m.id === 'n1')!.easing = 'smooth';
      c.moves.find((m) => m.id === 'n2')!.easing = 'there_and_back';
      const framing = sceneFraming(project(c, target))!;
      for (let t = 0; t <= 9; t += 0.125) {
        expect(framing(t), `t = ${t}`).toEqual(cameraAt(c, t, target));
      }
    }
  });
});
