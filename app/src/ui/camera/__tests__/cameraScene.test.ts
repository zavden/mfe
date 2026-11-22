// @vitest-environment node
/* What the Preview draws of the scene's camera at an instant. */
import { describe, expect, it } from 'vitest';
import { createEmptyProject, type Project, type SceneCamera } from '../../../model';
import { cameraSceneAt, cameraSceneBoxes, frameBoxOf } from '../cameraScene';

/** To Camera 1 over [1, 2), to a frame of its own over [3, 4), there and back over [5, 6), back
 * to the start over [7, 8). 16:9. */
function project(patch: (camera: SceneCamera) => void = () => {}): Project {
  const p = createEmptyProject('test');
  Object.assign(p.meta, { width: 1920, height: 1080 });
  p.camera = {
    initial: { center: [0, 0], height: 8 },
    targets: [{ id: 'k1', name: 'Camera 1', center: [3, 1], height: 4 }],
    moves: [
      { id: 'n1', start: 1, duration: 1, easing: 'linear', to: { kind: 'target', target: 'k1' } },
      {
        id: 'n2',
        start: 3,
        duration: 1,
        easing: 'linear',
        to: { kind: 'frame', frame: { center: [-2, 0], height: 2 } },
      },
      {
        id: 'n3',
        start: 5,
        duration: 1,
        easing: 'there_and_back',
        to: { kind: 'frame', frame: { center: [0, 3], height: 2 } },
      },
      { id: 'n4', start: 7, duration: 1, easing: 'linear', to: { kind: 'start' } },
    ],
  };
  patch(p.camera);
  return p;
}

describe('the box of a frame', () => {
  it('is as tall as the frame and as wide as the picture’s shape makes it', () => {
    expect(frameBoxOf({ center: [1, -1], height: 4 }, 2)).toEqual({
      minX: -3,
      minY: -3,
      maxX: 5,
      maxY: 1,
    });
  });
});

describe('the camera’s scene at an instant', () => {
  it('is none without a camera', () => {
    expect(cameraSceneAt(createEmptyProject('test'), 0)).toBeNull();
  });

  it('has Manim’s frame, the frame of 0 s, the target cameras and the own destinations', () => {
    const model = cameraSceneAt(project(), 0)!;
    expect(model.aspect).toBeCloseTo(16 / 9, 9);
    expect(model.origin.maxY).toBe(4);
    expect(model.origin.maxX).toBeCloseTo(64 / 9, 9);
    expect(model.start.frame).toEqual({ center: [0, 0], height: 8 });
    expect(model.targets.map((t) => [t.id, t.name, t.box.maxY])).toEqual([['k1', 'Camera 1', 3]]);
    // The moves' own frames, each with the place of its move in the order they run.
    expect(model.destinations.map((d) => [d.moveId, d.order, d.frame.center])).toEqual([
      ['n2', 2, [-2, 0]],
      ['n3', 3, [0, 3]],
    ]);
  });

  it('has the current camera: whose frame it rests in, or on its way', () => {
    const at = (t: number) => cameraSceneAt(project(), t)!.current;
    expect(at(0)).toMatchObject({
      frame: { center: [0, 0], height: 8 },
      owner: { kind: 'initial' },
    });
    // Half way to Camera 1.
    expect(at(1.5).owner).toBeNull();
    expect(at(1.5).frame.center[0]).toBeCloseTo(1.5, 9);
    expect(at(1.5).frame.height).toBeCloseTo(6, 9);
    expect(at(2)).toMatchObject({ frame: { height: 4 }, owner: { kind: 'target', id: 'k1' } });
    expect(at(4.5).owner).toEqual({ kind: 'move', id: 'n2' });
    // There and back: where it was.
    expect(at(6.5)).toMatchObject({
      frame: { center: [-2, 0] },
      owner: { kind: 'move', id: 'n2' },
    });
    expect(at(9).owner).toEqual({ kind: 'initial' });
    expect(at(9).box).toEqual(cameraSceneAt(project(), 0)!.origin);
  });

  it('joins the frames in the order the moves run, a leg for each move that goes elsewhere', () => {
    const route = cameraSceneAt(project(), 3.5)!.route;
    expect(route.map((leg) => [leg.moveId, leg.from, leg.to, leg.running])).toEqual([
      ['n1', [0, 0], [3, 1], false],
      ['n2', [3, 1], [-2, 0], true],
      ['n3', [-2, 0], [0, 3], false],
      // After the move that came back, the camera leaves from where it was.
      ['n4', [-2, 0], [0, 0], false],
    ]);
    // A move onto the frame the camera is in has no leg.
    const idle = project((camera) => {
      camera.moves = [
        {
          id: 'n1',
          start: 1,
          duration: 1,
          easing: 'linear',
          to: { kind: 'frame', frame: { center: [0, 0], height: 8 } },
        },
      ];
    });
    expect(cameraSceneAt(idle, 0)!.route).toEqual([]);
    expect(cameraSceneAt(idle, 0)!.destinations).toHaveLength(1);
  });

  it('lists the boxes that stay, for a view that shows them all at any instant', () => {
    const model = cameraSceneAt(project(), 0)!;
    // Manim's frame, the frame of 0 s, a target camera and two destinations.
    expect(cameraSceneBoxes(model)).toHaveLength(5);
    expect(cameraSceneBoxes(model)).toContain(model.origin);
    expect(cameraSceneBoxes(model)).toContain(model.start.box);
    // The camera on its way is inside them: the list is the same then.
    expect(cameraSceneBoxes(cameraSceneAt(project(), 1.5)!)).toEqual(cameraSceneBoxes(model));
  });
});
