// @vitest-environment node
/* The camera's rectangles on the Preview: where their names and corners are, which one a point
 * of the screen is on, and what the gestures make of it. */
import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import {
  createEmptyProject,
  MAX_CAMERA_HEIGHT,
  MIN_CAMERA_HEIGHT,
  type CameraMove,
} from '../../../model';
import { cameraSceneAt, type CameraSceneModel } from '../../camera/cameraScene';
import {
  cornerAt,
  cornerPoints,
  hitCameraScene,
  labelRect,
  onEdge,
  pieceMenuOf,
  pieceOfOwner,
  samePiece,
  type CameraPiece,
  type PixelRect,
} from '../cameraGeometry';
import {
  cameraHint,
  ISOLATED_HINT,
  cameraSnapBoxes,
  frameOfPiece,
  pieceOfSelection,
  scaledHeight,
  selectionOfPiece,
} from '../useCameraGestures';

/** 100 px per unit of the scene, the origin at (1000, 500), y down. */
const rectOf = (box: Box): PixelRect => ({
  left: 1000 + box.minX * 100,
  top: 500 - box.maxY * 100,
  width: (box.maxX - box.minX) * 100,
  height: (box.maxY - box.minY) * 100,
});

/** A square picture. The frame of 0 s is 2 tall about the origin; «Camera 1» is 2 tall about
 * (4, 0); a move over [1, 2) goes to a frame of its own, 2 tall about (0, 3). */
function scene(time: number): CameraSceneModel {
  const project = createEmptyProject('test');
  Object.assign(project.meta, { width: 1000, height: 1000 });
  project.camera = {
    initial: { center: [0, 0], height: 2 },
    targets: [{ id: 'k1', name: 'Camera 1', center: [4, 0], height: 2 }],
    moves: [
      {
        id: 'n1',
        start: 1,
        duration: 1,
        easing: 'linear',
        to: { kind: 'frame', frame: { center: [0, 3], height: 2 } },
      },
    ],
  };
  return cameraSceneAt(project, time)!;
}

const hit = (model: CameraSceneModel, x: number, y: number, selected = null as never) =>
  hitCameraScene(model, [x, y], rectOf, 1, selected);

describe('a rectangle on the screen', () => {
  const rect: PixelRect = { left: 100, top: 200, width: 300, height: 150 };

  it('has its corners by the compass', () => {
    expect(cornerPoints(rect)).toEqual({
      nw: [100, 200],
      ne: [400, 200],
      se: [400, 350],
      sw: [100, 350],
    });
    expect(cornerAt(rect, [398, 203], 1)).toBe('ne');
    expect(cornerAt(rect, [250, 200], 1)).toBeNull();
  });

  it('has its name above its top-left corner, or inside when there is no room above', () => {
    expect(labelRect(rect, 'Camera', 1)).toMatchObject({ left: 100, top: 179, height: 18 });
    expect(labelRect({ ...rect, top: 10 }, 'Camera', 1).top).toBe(13);
    expect(labelRect(rect, 'Camera 12', 1).width).toBeGreaterThan(
      labelRect(rect, 'Camera', 1).width,
    );
    // Twice the pixels: twice the plate.
    expect(labelRect(rect, 'Camera', 2).height).toBe(36);
  });

  it('is taken by its edge, not by its inside', () => {
    expect(onEdge(rect, [100, 275], 5)).toBe(true);
    expect(onEdge(rect, [104, 275], 5)).toBe(true);
    expect(onEdge(rect, [250, 352], 5)).toBe(true);
    expect(onEdge(rect, [250, 275], 5)).toBe(false);
    expect(onEdge(rect, [90, 275], 5)).toBe(false);
  });
});

describe('what a point of the canvas is on', () => {
  it('is the current camera by its edge, its name or the cross of its centre', () => {
    const model = scene(0); // the camera rests in the frame of 0 s: x 900–1100, y 400–600
    expect(hit(model, 900, 500)).toEqual({ piece: { kind: 'camera' }, part: 'body' });
    expect(hit(model, 1000, 500)).toEqual({ piece: { kind: 'camera' }, part: 'body' });
    expect(hit(model, 910, 388)).toEqual({ piece: { kind: 'camera' }, part: 'body' });
    // Its inside, away from the cross, is the scene's.
    expect(hit(model, 950, 450)).toBeNull();
    // The frame of 0 s is not offered apart while the camera is there.
    expect(hitCameraScene(model, [900, 500], rectOf, 1, { kind: 'start' })?.piece.kind).toBe(
      'camera',
    );
  });

  it('is a target camera or a move’s own frame by its edge or its name', () => {
    const model = scene(0);
    // «Camera 1»: x 1300–1500, y 400–600.
    expect(hit(model, 1500, 450)).toEqual({ piece: { kind: 'target', id: 'k1' }, part: 'body' });
    // The move's own frame: x 900–1100, y 100–300; its plate above it says «1».
    expect(hit(model, 1000, 300)).toEqual({ piece: { kind: 'move', id: 'n1' }, part: 'body' });
    expect(hit(model, 905, 88)).toEqual({ piece: { kind: 'move', id: 'n1' }, part: 'body' });
    expect(hit(model, 1400, 500)).toBeNull();
    expect(hit(model, 200, 200)).toBeNull();
  });

  it('is a corner of the selected rectangle, which scales it', () => {
    const model = scene(0);
    expect(hitCameraScene(model, [1500, 600], rectOf, 1, { kind: 'target', id: 'k1' })).toEqual({
      piece: { kind: 'target', id: 'k1' },
      part: 'se',
    });
    // Not selected: its edge, which moves it.
    expect(hit(model, 1500, 600)).toEqual({ piece: { kind: 'target', id: 'k1' }, part: 'body' });
  });

  it('once the camera has left, offers the frame of 0 s apart, and the camera for where it rests', () => {
    const model = scene(2); // the camera rests on the move's own frame
    expect(model.current.owner).toEqual({ kind: 'move', id: 'n1' });
    expect(hit(model, 900, 500)).toEqual({ piece: { kind: 'start' }, part: 'body' });
    // The destination it rests on is the camera's rectangle now.
    expect(hit(model, 1000, 300)).toEqual({ piece: { kind: 'camera' }, part: 'body' });
    // On its way, the camera has no corner to scale it by.
    const moving = scene(1.5);
    expect(moving.current.owner).toBeNull();
    const corner = rectOf(moving.current.box);
    expect(
      hitCameraScene(moving, [corner.left, corner.top], rectOf, 1, { kind: 'camera' }),
    ).toEqual({ piece: { kind: 'camera' }, part: 'body' });
  });

  it('tells two rectangles apart', () => {
    expect(samePiece({ kind: 'camera' }, { kind: 'camera' })).toBe(true);
    expect(samePiece({ kind: 'camera' }, { kind: 'start' })).toBe(false);
    expect(samePiece({ kind: 'target', id: 'a' }, { kind: 'target', id: 'a' })).toBe(true);
    expect(samePiece({ kind: 'target', id: 'a' }, { kind: 'move', id: 'a' })).toBe(false);
    expect(samePiece({ kind: 'move', id: 'a' }, { kind: 'move', id: 'b' })).toBe(false);
  });
});

/** The owner's case: the camera goes to the same place again and again, each move to a frame of
 * its own — n1 and n3 to a frame 2 tall about (4, 0), n2 and n4 back about the origin, where the
 * frame of 0 s is. Four rectangles in two places, one over another. */
function stacked(time: number): CameraSceneModel {
  const project = createEmptyProject('test');
  Object.assign(project.meta, { width: 1000, height: 1000 });
  const to = (x: number): CameraMove['to'] => ({
    kind: 'frame',
    frame: { center: [x, 0], height: 2 },
  });
  project.camera = {
    initial: { center: [0, 0], height: 2 },
    targets: [],
    moves: [
      { id: 'n1', start: 1, duration: 1, easing: 'linear', to: to(4) },
      { id: 'n2', start: 3, duration: 1, easing: 'linear', to: to(0) },
      { id: 'n3', start: 5, duration: 1, easing: 'linear', to: to(4) },
      { id: 'n4', start: 7, duration: 1, easing: 'linear', to: to(0) },
    ],
  };
  return cameraSceneAt(project, time)!;
}

describe('an isolated rectangle', () => {
  const only = (model: CameraSceneModel, x: number, y: number, piece: CameraPiece) =>
    hitCameraScene(model, [x, y], rectOf, 1, piece, piece);

  it('is the one a frame’s owner has on screen: the camera’s while the camera rests in it', () => {
    expect(pieceOfOwner(stacked(0), { kind: 'move', id: 'n1' })).toEqual({
      kind: 'move',
      id: 'n1',
    });
    expect(pieceOfOwner(stacked(2), { kind: 'move', id: 'n1' })).toEqual({ kind: 'camera' });
    expect(pieceOfOwner(stacked(2), { kind: 'initial' })).toEqual({ kind: 'start' });
    expect(pieceOfOwner(stacked(0), { kind: 'initial' })).toEqual({ kind: 'camera' });
    expect(pieceOfOwner(scene(0), { kind: 'target', id: 'k1' })).toEqual({
      kind: 'target',
      id: 'k1',
    });
  });

  it('lies under the one drawn last when none is isolated: only that one is taken', () => {
    // At 0 s the camera is about the origin. The right edge of the frames about (4, 0) is at
    // x = 1500: the last move that goes there has it, the first never does.
    expect(hit(stacked(0), 1500, 500)?.piece).toEqual({ kind: 'move', id: 'n3' });
    // Selected (on the timeline), the one under still gets its corners alone.
    expect(hit(stacked(0), 1500, 500, { kind: 'move', id: 'n1' } as never)?.piece).toEqual({
      kind: 'move',
      id: 'n3',
    });
  });

  it('answers alone, by its edge, its name and its corners, whatever lies over it', () => {
    const n1: CameraPiece = { kind: 'move', id: 'n1' };
    expect(only(stacked(0), 1500, 500, n1)).toEqual({ piece: n1, part: 'body' });
    expect(only(stacked(0), 1500, 600, n1)).toEqual({ piece: n1, part: 'se' });
    // Its name, the place of its move, above its top-left corner.
    expect(only(stacked(0), 1305, 388, n1)).toEqual({ piece: n1, part: 'body' });
    // The frame about the origin, under the camera and under n4's.
    const n2: CameraPiece = { kind: 'move', id: 'n2' };
    expect(hit(stacked(0), 1100, 500)?.piece).toEqual({ kind: 'camera' });
    expect(only(stacked(0), 1100, 500, n2)).toEqual({ piece: n2, part: 'body' });
  });

  it('leaves the others without an answer, the current camera too', () => {
    const n1: CameraPiece = { kind: 'move', id: 'n1' };
    // The camera's edge, its centre and its name, the frame of 0 s once the camera has left.
    expect(only(stacked(0), 1100, 500, n1)).toBeNull();
    expect(only(stacked(0), 1000, 500, n1)).toBeNull();
    expect(only(stacked(0), 905, 388, n1)).toBeNull();
    expect(only(stacked(6), 1100, 500, n1)).toBeNull();
  });

  it('is the camera’s rectangle while the camera rests in its frame', () => {
    // After n1 the camera rests in n1's own frame: isolated, that rectangle is the camera's, and
    // n3's — the same place — does not answer.
    const piece = pieceOfOwner(stacked(2), { kind: 'move', id: 'n1' });
    expect(only(stacked(2), 1500, 500, piece)).toEqual({ piece: { kind: 'camera' }, part: 'body' });
    expect(only(stacked(2), 1400, 500, piece)).toEqual({ piece: { kind: 'camera' }, part: 'body' });
    expect(frameOfPiece(stacked(2), piece)?.owner).toEqual({ kind: 'move', id: 'n1' });
  });

  it('says so before how it is moved', () => {
    const said = cameraHint(
      stacked(0),
      { kind: 'move', id: 'n1' },
      { locked: false, axis: null, isolated: true },
    );
    expect(said).toBe(
      `${ISOLATED_HINT} · Drag it by its edge or its name · a corner scales it · Shift: one axis · Ctrl/⌘: no snapping · the arrows move it 0.01 (Shift: 0.1)`,
    );
    // What keeps it from moving is said alone.
    expect(
      cameraHint(
        stacked(0),
        { kind: 'move', id: 'n1' },
        { locked: true, axis: null, isolated: true },
      ),
    ).toBe('The camera is locked: unlock it on the Camera row of the timeline to move it');
  });
});

describe('what the gestures make of a rectangle', () => {
  it('selects the camera, a target camera or the move whose frame it is', () => {
    expect(selectionOfPiece({ kind: 'camera' })).toEqual({ kind: 'camera' });
    expect(selectionOfPiece({ kind: 'start' })).toEqual({ kind: 'camera' });
    expect(selectionOfPiece({ kind: 'target', id: 'k1' })).toEqual({
      kind: 'targetCamera',
      id: 'k1',
    });
    expect(selectionOfPiece({ kind: 'move', id: 'n1' })).toEqual({ kind: 'cameraMove', id: 'n1' });
  });

  it('edits the frame the rectangle stands for', () => {
    const model = scene(0);
    expect(frameOfPiece(model, { kind: 'camera' })).toEqual({
      owner: { kind: 'initial' },
      frame: { center: [0, 0], height: 2 },
    });
    expect(frameOfPiece(model, { kind: 'target', id: 'k1' })?.owner).toEqual({
      kind: 'target',
      id: 'k1',
    });
    expect(frameOfPiece(model, { kind: 'move', id: 'n1' })?.frame.center).toEqual([0, 3]);
    expect(frameOfPiece(model, { kind: 'target', id: 'gone' })).toBeNull();
    // The camera where it rests after the move; none while it is on its way.
    expect(frameOfPiece(scene(2), { kind: 'camera' })?.owner).toEqual({ kind: 'move', id: 'n1' });
    expect(frameOfPiece(scene(2), { kind: 'start' })?.owner).toEqual({ kind: 'initial' });
    expect(frameOfPiece(scene(1.5), { kind: 'camera' })).toBeNull();
  });

  it('sticks to the objects, to Manim’s frame and to the other rectangles, not to itself', () => {
    const model = scene(0);
    const object: Box = { minX: 5, minY: 5, maxX: 6, maxY: 6 };
    const forTarget = cameraSnapBoxes(model, { kind: 'target', id: 'k1' }, [object]);
    expect(forTarget).toContain(object);
    expect(forTarget).toContain(model.origin);
    expect(forTarget).toContain(model.start.box);
    expect(forTarget).toContain(model.destinations[0]!.box);
    expect(forTarget).not.toContain(model.targets[0]!.box);
    const forStart = cameraSnapBoxes(model, { kind: 'initial' }, []);
    expect(forStart).not.toContain(model.start.box);
    expect(forStart).toContain(model.targets[0]!.box);
    expect(cameraSnapBoxes(model, { kind: 'move', id: 'n1' }, [])).not.toContain(
      model.destinations[0]!.box,
    );
  });

  it('scales a frame by how far the pointer is from its centre, within a camera’s bounds', () => {
    const frame = { center: [1, 1] as [number, number], height: 2 };
    // A square picture: the corner is at (2, 2), √2 away.
    expect(scaledHeight(frame, 1, [2, 2])).toBeCloseTo(2, 9);
    expect(scaledHeight(frame, 1, [3, 3])).toBeCloseTo(4, 9);
    expect(scaledHeight(frame, 1, [1.5, 1.5])).toBeCloseTo(1, 9);
    expect(scaledHeight(frame, 1, [1, 1])).toBe(MIN_CAMERA_HEIGHT);
    expect(scaledHeight(frame, 1, [900, 900])).toBe(MAX_CAMERA_HEIGHT);
    // 16:9: the corner is further out, and the same reach gives a lower frame.
    expect(scaledHeight(frame, 16 / 9, [3, 3])).toBeLessThan(4);
  });
});

describe('the menu of a rectangle', () => {
  it('is the target camera’s own on a target camera', () => {
    expect(pieceMenuOf(scene(0), { kind: 'target', id: 'k1' })).toEqual({
      title: 'Camera 1',
      frame: { id: 'k1', name: 'Camera 1', center: [4, 0], height: 2 },
      target: { id: 'k1', name: 'Camera 1' },
      resting: false,
    });
    expect(pieceMenuOf(scene(0), { kind: 'target', id: 'gone' })).toBeNull();
  });

  it('copies the frame the rectangle shows: the camera’s, on its way too', () => {
    expect(pieceMenuOf(scene(0), { kind: 'camera' })).toEqual({
      title: 'Camera',
      frame: { center: [0, 0], height: 2 },
      target: null,
      resting: false,
    });
    // Half way of the move: no frame is the camera's to edit, but the rectangle shows one.
    expect(pieceMenuOf(scene(1.5), { kind: 'camera' })!.frame.center[1]).toBeCloseTo(1.5, 6);
    expect(pieceMenuOf(scene(3), { kind: 'start' })).toMatchObject({
      title: 'Camera at 0 s',
      frame: { center: [0, 0], height: 2 },
      target: null,
    });
    expect(pieceMenuOf(scene(0), { kind: 'move', id: 'n1' })).toMatchObject({
      title: 'Camera move 1',
      frame: { center: [0, 3], height: 2 },
      target: null,
    });
    expect(pieceMenuOf(scene(0), { kind: 'move', id: 'gone' })).toBeNull();
  });

  it('names the target camera the current camera rests on: the same rectangle', () => {
    const project = createEmptyProject('test');
    project.camera = {
      initial: { center: [0, 0], height: 8 },
      targets: [{ id: 'k1', name: 'Wide', center: [4, 0], height: 2 }],
      moves: [
        { id: 'n1', start: 1, duration: 1, easing: 'linear', to: { kind: 'target', target: 'k1' } },
      ],
    };
    expect(pieceMenuOf(cameraSceneAt(project, 2)!, { kind: 'camera' })).toMatchObject({
      title: 'Camera · Wide',
      target: { id: 'k1', name: 'Wide' },
      resting: true,
    });
  });
});

describe('what is said of a selected rectangle', () => {
  const free = { locked: false, axis: null };

  it('says how the camera is moved and scaled, by its centre too', () => {
    expect(cameraHint(scene(0), { kind: 'camera' }, free)).toBe(
      'Drag it by its edge, its name or its centre · a corner scales it · Shift: one axis · Ctrl/⌘: no snapping · the arrows move it 0.01 (Shift: 0.1)',
    );
    expect(cameraHint(scene(0), { kind: 'target', id: 'k1' }, free)).toContain(
      'Drag it by its edge or its name ·',
    );
    expect(cameraHint(scene(0), { kind: 'move', id: 'n1' }, free)).toContain(
      'Drag it by its edge or its name ·',
    );
  });

  it('says why it does not move: on its way, locked, gone', () => {
    expect(cameraHint(scene(1.5), { kind: 'camera' }, free)).toBe(
      'The camera is on its way: go to the end of the move to put it where it arrives',
    );
    expect(cameraHint(scene(0), { kind: 'camera' }, { locked: true, axis: null })).toBe(
      'The camera is locked: unlock it on the Camera row of the timeline to move it',
    );
    expect(cameraHint(scene(0), { kind: 'target', id: 'gone' }, free)).toBeNull();
  });

  it('says which axis a drag is held to', () => {
    expect(cameraHint(scene(0), { kind: 'camera' }, { locked: false, axis: 'x' })).toContain(
      'Moving horizontally only (Shift or Alt)',
    );
    expect(cameraHint(scene(0), { kind: 'camera' }, { locked: false, axis: 'y' })).toContain(
      'Moving vertically only',
    );
  });
});

describe('the rectangle a selection names', () => {
  it('is the camera, a target camera, or the frame a move goes to on its own', () => {
    expect(pieceOfSelection({ kind: 'camera' }, scene(0))).toEqual({ kind: 'camera' });
    expect(pieceOfSelection({ kind: 'targetCamera', id: 'k1' }, scene(0))).toEqual({
      kind: 'target',
      id: 'k1',
    });
    expect(pieceOfSelection({ kind: 'cameraMove', id: 'n1' }, scene(0))).toEqual({
      kind: 'move',
      id: 'n1',
    });
    expect(pieceOfSelection({ kind: 'none' }, scene(0))).toBeNull();
    expect(pieceOfSelection({ kind: 'clips', ids: ['a'] }, scene(0))).toBeNull();
    expect(pieceOfSelection({ kind: 'camera' }, null)).toEqual({ kind: 'camera' });
  });

  it('is the camera itself for the frame the camera rests in: they are one rectangle', () => {
    // After the move the camera rests in the move's own frame.
    expect(pieceOfSelection({ kind: 'cameraMove', id: 'n1' }, scene(3))).toEqual({
      kind: 'camera',
    });
    // On its way it rests in none.
    expect(pieceOfSelection({ kind: 'cameraMove', id: 'n1' }, scene(1.5))).toEqual({
      kind: 'move',
      id: 'n1',
    });
  });
});
