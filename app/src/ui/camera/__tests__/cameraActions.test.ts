// @vitest-environment node
/* The commands of the scene's camera (D190), run against the stores. */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, defaultCameraFrame, type SceneCamera } from '../../../model';
import { smallProject } from '../../../model/__tests__/fixtures';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { useAnnouncer } from '../../announcer';
import { useNoticeStore } from '../../project/noticeStore';
import { usePreviewView } from '../../preview/viewStore';
import { useTimelineStore } from '../../timeline/timelineStore';
import { useDialogStore } from '../../project/dialogStore';
import {
  addCameraMove,
  addTargetCamera,
  deleteCameraMove,
  deleteTargetCameraAsking,
  duplicateCameraMove,
  isolateCameraMove,
  nudgeCameraFrame,
  nudgeCameraMove,
  renameTargetCamera,
  renameTargetCameraAsking,
  retimeCameraMove,
  setCameraFrame,
  setCameraFrameField,
  setCameraMoveDestination,
  setCameraMoveEasing,
  setCameraMoveTiming,
  stopIsolating,
  toggleCameraLock,
  toggleCameraView,
  toggleMulticamera,
} from '../cameraActions';

const camera = () => useProjectStore.getState().project.camera;
const notices = () =>
  useNoticeStore.getState().notices.map(({ title, message }) => [title, message]);

beforeEach(() => {
  loadProject(createEmptyProject('test'));
  useNoticeStore.getState().clear();
  useTimelineStore.getState().setRegion(null);
  useUiStore.getState().select({ kind: 'none' });
  useUiStore.getState().setTime(0);
  usePreviewView.getState().setCameraView(false);
  usePreviewView.getState().isolateMove(null);
});

describe('toggleMulticamera', () => {
  it('gives the project a camera in Manim’s own frame, and takes it away: a step each', () => {
    expect(camera()).toBeUndefined();
    expect(toggleMulticamera()).toBe(true);
    expect(camera()).toEqual({ initial: defaultCameraFrame(), targets: [], moves: [] });
    expect(useAnnouncer.getState().text).toBe('Multicamera on');
    expect(toggleMulticamera()).toBe(true);
    expect(camera()).toBeUndefined();
    expect('camera' in useProjectStore.getState().project).toBe(false);
    expect(useAnnouncer.getState().text).toBe('Multicamera off');
    history.undo();
    expect(camera()).toBeDefined();
    history.undo();
    expect(camera()).toBeUndefined();
    expect(history.canUndo()).toBe(false);
    expect(notices()).toEqual([]);
  });

  it('stays on while the camera has a move or a target camera, and says why', () => {
    const held: SceneCamera = {
      initial: defaultCameraFrame(),
      targets: [{ id: 'k1', name: 'Camera 1', center: [1, 0], height: 4 }],
      moves: [],
    };
    useProjectStore.getState().update((draft) => {
      draft.camera = held;
    });
    const before = useProjectStore.getState().project;
    expect(toggleMulticamera()).toBe(false);
    expect(useProjectStore.getState().project).toBe(before);
    expect(notices()).toEqual([
      [
        'Multicamera stays on',
        'Delete every target camera and camera move to turn Multicamera off (there is 1 target camera).',
      ],
    ]);
  });

  it('turns off a camera whose frame at 0 s was moved; undo brings the frame back', () => {
    const moved: SceneCamera = { initial: { center: [2, 1], height: 3 }, targets: [], moves: [] };
    useProjectStore.getState().update((draft) => {
      draft.camera = moved;
    });
    expect(toggleMulticamera()).toBe(true);
    expect(camera()).toBeUndefined();
    history.undo();
    expect(camera()).toEqual(moved);
  });
});

describe('isolating a camera move', () => {
  /** Two moves to frames of their own in the same place, one to a target camera that is gone. */
  const stacked = (): SceneCamera => ({
    initial: defaultCameraFrame(),
    targets: [],
    moves: [
      {
        id: 'n1',
        start: 1,
        duration: 1,
        easing: 'smooth',
        to: { kind: 'frame', frame: { center: [4, 0], height: 4 } },
      },
      {
        id: 'n2',
        start: 3,
        duration: 1,
        easing: 'smooth',
        to: { kind: 'frame', frame: { center: [4, 0], height: 4 } },
      },
      { id: 'n3', start: 5, duration: 1, easing: 'smooth', to: { kind: 'target', target: 'k9' } },
    ],
  });
  const give = (value: SceneCamera) =>
    useProjectStore.getState().update((draft) => {
      draft.camera = value;
    });

  it('isolates it in the world view and selects it, and changes nothing of the project', () => {
    give(stacked());
    usePreviewView.getState().setCameraView(true);
    const before = useProjectStore.getState().project;
    expect(isolateCameraMove('n1')).toBe(true);
    expect(usePreviewView.getState().isolatedMove).toBe('n1');
    // Its rectangle is in the world view.
    expect(usePreviewView.getState().cameraView).toBe(false);
    expect(useUiStore.getState().selection).toEqual({ kind: 'cameraMove', id: 'n1' });
    expect(useAnnouncer.getState().text).toBe(
      'Isolated: Camera move to 200 %, 1 s to 2 s. The other rectangles of the camera do not answer in the Preview',
    );
    expect(useProjectStore.getState().project).toBe(before);
    // Another one takes its place.
    expect(isolateCameraMove('n2')).toBe(true);
    expect(usePreviewView.getState().isolatedMove).toBe('n2');
  });

  it('is also a locked camera’s: nothing of it is edited', () => {
    give({ ...stacked(), locked: true });
    expect(isolateCameraMove('n1')).toBe(true);
    expect(usePreviewView.getState().isolatedMove).toBe('n1');
  });

  it('is not a move’s that is gone, nor one’s that goes to a target camera that is', () => {
    expect(isolateCameraMove('n1')).toBe(false);
    give(stacked());
    expect(isolateCameraMove('n9')).toBe(false);
    expect(isolateCameraMove('n3')).toBe(false);
    expect(usePreviewView.getState().isolatedMove).toBeNull();
  });

  it('ends on demand: once', () => {
    give(stacked());
    isolateCameraMove('n1');
    expect(stopIsolating()).toBe(true);
    expect(usePreviewView.getState().isolatedMove).toBeNull();
    expect(useAnnouncer.getState().text).toBe('Every rectangle of the camera answers again');
    // The move stays selected: its panel is still what is being worked on.
    expect(useUiStore.getState().selection).toEqual({ kind: 'cameraMove', id: 'n1' });
    expect(stopIsolating()).toBe(false);
  });
});

describe('toggleCameraView', () => {
  it('is nobody’s without a camera', () => {
    expect(toggleCameraView()).toBe(false);
    expect(usePreviewView.getState().cameraView).toBe(false);
  });

  it('goes through the camera and back to the world, and changes nothing of the project', () => {
    toggleMulticamera();
    const before = useProjectStore.getState().project;
    expect(toggleCameraView()).toBe(true);
    expect(usePreviewView.getState().cameraView).toBe(true);
    expect(useAnnouncer.getState().text).toBe('Camera view: what the video shows');
    expect(toggleCameraView()).toBe(true);
    expect(usePreviewView.getState().cameraView).toBe(false);
    expect(useAnnouncer.getState().text).toBe('World view: the camera and its frames');
    expect(useProjectStore.getState().project).toBe(before);
  });

  it('a multicamera turned on comes up in the world view', () => {
    toggleMulticamera();
    toggleCameraView();
    toggleMulticamera();
    // Off: the view asked for stays, and shows nothing of its own.
    expect(usePreviewView.getState().cameraView).toBe(true);
    toggleMulticamera();
    expect(usePreviewView.getState().cameraView).toBe(false);
  });
});

describe('toggleCameraLock', () => {
  it('locks the Camera row and unlocks it: the field is there only while it is locked', () => {
    toggleCameraLock();
    expect(camera()).toBeUndefined();
    toggleMulticamera();
    toggleCameraLock();
    expect(camera()!.locked).toBe(true);
    toggleCameraLock();
    expect('locked' in camera()!).toBe(false);
    history.undo();
    expect(camera()!.locked).toBe(true);
  });

  // The lock is a button the keyboard reaches, and a key can come while the mouse button is
  // still held on a move that is being dragged.
  it('gives a held drag up first: what is locked is the camera as it was before the drag', () => {
    const project = createEmptyProject('test');
    project.camera = {
      initial: defaultCameraFrame(),
      targets: [],
      moves: [
        {
          id: 'm1',
          start: 1,
          duration: 0.5,
          easing: 'linear',
          to: { kind: 'frame', frame: { center: [2, 0], height: 8 } },
        },
      ],
    } as SceneCamera;
    loadProject(project);
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.camera!.moves[0]!.start = 1.5;
    });
    toggleCameraLock();
    expect(gesture.active).toBe(false);
    expect(camera()).toMatchObject({ locked: true, moves: [{ start: 1 }] });
    history.undo();
    expect(camera()!.moves[0]!.start).toBe(1);
    expect('locked' in camera()!).toBe(false);
    expect(history.canUndo()).toBe(false);
    history.redo();
    expect(camera()).toMatchObject({ locked: true, moves: [{ start: 1 }] });
  });
});

describe('addCameraMove', () => {
  /** The small project — it animates during [0, 1), [2, 3), [3, 4) and [5, 6) — with a camera
   * closer than Manim's frame, off its centre. */
  const start = () => {
    const project = smallProject();
    project.camera = { initial: { center: [1, 0.5], height: 4 }, targets: [], moves: [] };
    loadProject(project);
  };

  it('adds a move of a second at the playhead, towards the frame the camera is in', () => {
    start();
    useUiStore.getState().setTime(1);
    const id = addCameraMove()!;
    expect(camera()!.moves).toEqual([
      {
        id,
        start: 1,
        duration: 1,
        easing: 'smooth',
        to: { kind: 'frame', frame: { center: [1, 0.5], height: 4 } },
      },
    ]);
    // Its frame is its own: not the very object of the frame of 0 s.
    const [move] = camera()!.moves;
    expect(move!.to.kind === 'frame' && move!.to.frame).not.toBe(camera()!.initial);
    // Selected, the playhead at its end; one step.
    expect(useUiStore.getState().selection).toEqual({ kind: 'cameraMove', id });
    expect(useUiStore.getState().time).toBe(2);
    expect(notices()).toEqual([]);
    expect(useAnnouncer.getState().text).toBe('Camera move added at 1 s, 1 s long');
    history.undo();
    expect(camera()!.moves).toEqual([]);
  });

  it('starts from where the camera rests then: the destination of the move before it', () => {
    start();
    useProjectStore.getState().update((draft) => {
      draft.camera!.moves.push({
        id: 'n1',
        start: 1,
        duration: 1,
        easing: 'smooth',
        to: { kind: 'frame', frame: { center: [-3, 2], height: 6 } },
      });
    });
    useUiStore.getState().setTime(4);
    addCameraMove();
    expect(camera()!.moves[1]!.to).toEqual({
      kind: 'frame',
      frame: { center: [-3, 2], height: 6 },
    });
  });

  it('goes where the scene is free, and says so', () => {
    start();
    // Inside the intro of the first clip: after it.
    useUiStore.getState().setTime(0.5);
    addCameraMove();
    expect(camera()!.moves[0]).toMatchObject({ start: 1, duration: 1 });
    expect(useUiStore.getState().time).toBe(2);
    expect(notices()).toEqual([
      [
        'Camera move added at 1 s',
        'Nothing else animates while the camera moves: the move starts where the scene is free.',
      ],
    ]);
    // Less room than a second, [4.5, 5): as long as the room.
    useNoticeStore.getState().clear();
    useUiStore.getState().setTime(4.5);
    addCameraMove();
    expect(camera()!.moves[1]).toMatchObject({ start: 4.5, duration: 0.5 });
    expect(notices()).toEqual([
      [
        'Camera move added, 0.5 s long',
        'Nothing else animates while the camera moves: that is the room before the next animation.',
      ],
    ]);
  });

  it('takes the region of the timeline, when one is marked', () => {
    start();
    useTimelineStore.getState().setRegion({ start: 6.5, end: 8.25 });
    useUiStore.getState().setTime(1);
    addCameraMove();
    expect(camera()!.moves[0]).toMatchObject({ start: 6.5, duration: 1.75 });
    expect(useUiStore.getState().time).toBe(8.25);
    expect(notices()).toEqual([]);
  });

  it('goes to the time given, a second long, whatever the region is', () => {
    start();
    useTimelineStore.getState().setRegion({ start: 6.5, end: 8.25 });
    addCameraMove(1.25);
    expect(camera()!.moves[0]).toMatchObject({ start: 1.25, duration: 0.75 });
    addCameraMove(9);
    expect(camera()!.moves[1]).toMatchObject({ start: 9, duration: 1 });
  });

  it('adds nothing to a locked row, nor without a camera', () => {
    expect(addCameraMove()).toBeNull();
    start();
    toggleCameraLock();
    expect(addCameraMove()).toBeNull();
    expect(camera()!.moves).toEqual([]);
    expect(notices()).toEqual([['The Camera row is locked', 'Unlock it to add a move.']]);
  });
});

describe('a move of the camera', () => {
  const start = (locked = false) => {
    const project = smallProject();
    project.camera = {
      initial: defaultCameraFrame(),
      targets: [],
      moves: [
        { id: 'n1', start: 1, duration: 0.5, easing: 'linear', to: { kind: 'start' } },
        {
          id: 'n2',
          start: 4,
          duration: 1,
          easing: 'smooth',
          to: { kind: 'frame', frame: { center: [1, 1], height: 4 } },
        },
      ],
      ...(locked ? { locked: true } : {}),
    };
    loadProject(project);
  };
  const times = () => camera()!.moves.map((m) => [m.id, m.start, m.duration]);

  it('takes the time it is given', () => {
    start();
    setCameraMoveTiming('n1', { start: 1.25, duration: 0.75 });
    expect(times()).toEqual([
      ['n1', 1.25, 0.75],
      ['n2', 4, 1],
    ]);
    history.undo();
    expect(times()[0]).toEqual(['n1', 1, 0.5]);
  });

  it('is deleted in one step, and leaves the selection', () => {
    start();
    useUiStore.getState().select({ kind: 'cameraMove', id: 'n1' });
    expect(deleteCameraMove('n1')).toBe(true);
    expect(times()).toEqual([['n2', 4, 1]]);
    expect(useUiStore.getState().selection).toEqual({ kind: 'none' });
    expect(useAnnouncer.getState().text).toBe('Camera move to Start, 1 s to 1.5 s deleted');
    expect(deleteCameraMove('gone')).toBe(false);
    history.undo();
    expect(times()).toHaveLength(2);
  });

  it('is copied into the first place it fits after it, and the copy selected', () => {
    start();
    const id = duplicateCameraMove('n1')!;
    // [1.5, 2) is free: the copy is as long as the move.
    expect(camera()!.moves[2]).toEqual({
      id,
      start: 1.5,
      duration: 0.5,
      easing: 'linear',
      to: { kind: 'start' },
    });
    expect(useUiStore.getState().selection).toEqual({ kind: 'cameraMove', id });
    // No room right after the second: past the last animation.
    const second = duplicateCameraMove('n2')!;
    expect(camera()!.moves.find((m) => m.id === second)).toMatchObject({ start: 6, duration: 1 });
  });

  it('is nudged by frames inside the free time it is in, and says where it went', () => {
    start(); // 60 fps; n1 over [1, 1.5), between the intro that ends at 1 s and the one at 2 s
    nudgeCameraMove('n1', 3);
    expect(times()[0]).toEqual(['n1', 1.05, 0.5]);
    expect(useAnnouncer.getState().text).toBe('Camera move moved to 1.05 s');
    // More than the room: as far as it goes.
    nudgeCameraMove('n1', 600);
    expect(times()[0]).toEqual(['n1', 1.5, 0.5]);
    // Against what stands there: nothing changes, and it says what it is.
    const before = useProjectStore.getState().project;
    nudgeCameraMove('n1', 1);
    expect(useProjectStore.getState().project).toBe(before);
    expect(useAnnouncer.getState().text).toBe(
      'The intro of "b" starts here, and nothing else animates while the camera moves.',
    );
    // Each nudge is a step.
    history.undo();
    expect(times()[0]).toEqual(['n1', 1.05, 0.5]);
  });

  it('is left alone while the row is locked', () => {
    start(true);
    nudgeCameraMove('n1', 3);
    expect(times()[0]).toEqual(['n1', 1, 0.5]);
  });

  it('is neither deleted nor copied while the row is locked', () => {
    start(true);
    expect(deleteCameraMove('n1')).toBe(false);
    expect(duplicateCameraMove('n1')).toBeNull();
    expect(times()).toHaveLength(2);
    expect(notices()).toEqual([
      ['The Camera row is locked', 'Unlock it to edit its moves.'],
      ['The Camera row is locked', 'Unlock it to edit its moves.'],
    ]);
  });
});

describe('the fields of the camera’s panel', () => {
  /** The small project — it animates during [0, 1), [2, 3), [3, 4) and [5, 6) — with a target
   * camera and two moves: to it over [1, 1.5), to a frame of its own over [4, 5). */
  const start = (locked = false) => {
    const project = smallProject();
    project.camera = {
      initial: defaultCameraFrame(),
      targets: [{ id: 'k1', name: 'Camera 1', center: [3, 1], height: 4 }],
      moves: [
        {
          id: 'n1',
          start: 1,
          duration: 0.5,
          easing: 'smooth',
          to: { kind: 'target', target: 'k1' },
        },
        {
          id: 'n2',
          start: 4,
          duration: 1,
          easing: 'smooth',
          to: { kind: 'frame', frame: { center: [1, 1], height: 4 } },
        },
      ],
      ...(locked ? { locked: true } : {}),
    };
    loadProject(project);
  };
  const moveOf = (id: string) => camera()!.moves.find((m) => m.id === id)!;

  it('give a move another start or another length, inside the free time it is in', () => {
    start();
    retimeCameraMove('n1', 'move', 1.25);
    expect(moveOf('n1')).toMatchObject({ start: 1.25, duration: 0.5 });
    // Past the animation that starts at 2 s: as far as it.
    retimeCameraMove('n1', 'move', 5);
    expect(moveOf('n1')).toMatchObject({ start: 1.5, duration: 0.5 });
    retimeCameraMove('n1', 'end', 0.25);
    expect(moveOf('n1')).toMatchObject({ start: 1.5, duration: 0.25 });
    retimeCameraMove('n1', 'end', 9);
    expect(moveOf('n1')).toMatchObject({ start: 1.5, duration: 0.5 });
    // Where it is already: no step.
    const before = useProjectStore.getState().project;
    retimeCameraMove('n1', 'end', 9);
    expect(useProjectStore.getState().project).toBe(before);
  });

  it('give a move another easing', () => {
    start();
    setCameraMoveEasing('n2', 'linear');
    expect(moveOf('n2').easing).toBe('linear');
    history.undo();
    expect(moveOf('n2').easing).toBe('smooth');
  });

  it('send a move to the start, to a target camera, or to a frame of its own where it went', () => {
    start();
    setCameraMoveDestination('n2', 'start');
    expect(moveOf('n2').to).toEqual({ kind: 'start' });
    setCameraMoveDestination('n2', { target: 'k1' });
    expect(moveOf('n2').to).toEqual({ kind: 'target', target: 'k1' });
    // A frame of its own: the target camera's, copied — nothing jumps.
    setCameraMoveDestination('n2', 'frame');
    expect(moveOf('n2').to).toEqual({ kind: 'frame', frame: { center: [3, 1], height: 4 } });
    // A target camera that does not exist is no destination.
    setCameraMoveDestination('n2', { target: 'gone' });
    expect(moveOf('n2').to.kind).toBe('frame');
    // From the start: the frame of 0 s, copied.
    setCameraMoveDestination('n1', 'start');
    setCameraMoveDestination('n1', 'frame');
    expect(moveOf('n1').to).toEqual({ kind: 'frame', frame: defaultCameraFrame() });
  });

  it('write a frame where its owner keeps it, within the bounds of a camera', () => {
    start();
    setCameraFrame({ kind: 'initial' }, { center: [1, -1], height: 2 });
    expect(camera()!.initial).toEqual({ center: [1, -1], height: 2 });
    setCameraFrame({ kind: 'target', id: 'k1' }, { center: [0, 0], height: 1e9 });
    expect(camera()!.targets[0]).toMatchObject({ center: [0, 0], height: 80 });
    setCameraFrame({ kind: 'move', id: 'n2' }, { center: [5, 5], height: 8 });
    expect(moveOf('n2').to).toEqual({ kind: 'frame', frame: { center: [5, 5], height: 8 } });
  });

  // A field of the panel commits one number. The panel shows the other two as the project has
  // them at that moment, and a drag that is still held — the wheel on the field beside it, the
  // frame's rectangle in the Preview — has them where it has moved them so far: the command gives
  // that drag up and writes its number over the frame as it was before it.
  describe('one number of a frame, while a drag still held shows the others moved', () => {
    const OWNERS = {
      'the frame of 0 s': { owner: { kind: 'initial' }, frame: { center: [0, 0], height: 8 } },
      'a target camera': {
        owner: { kind: 'target', id: 'k1' },
        frame: { center: [3, 1], height: 4 },
      },
      'a move’s own frame': {
        owner: { kind: 'move', id: 'n2' },
        frame: { center: [1, 1], height: 4 },
      },
    } as const;
    const FIELDS = {
      x: { value: 2, change: { center: [2, null] } },
      y: { value: -2, change: { center: [null, -2] } },
      zoom: { value: 50, change: { height: 16 } }, // half as large: twice the height of 8
    } as const;
    const frameOf = (owner: (typeof OWNERS)[keyof typeof OWNERS]['owner']) =>
      owner.kind === 'initial'
        ? camera()!.initial
        : owner.kind === 'target'
          ? (({ center, height }) => ({ center, height }))(camera()!.targets[0]!)
          : (moveOf('n2').to as { frame: unknown }).frame;

    for (const [ownerName, { owner, frame }] of Object.entries(OWNERS)) {
      for (const [field, { value, change }] of Object.entries(FIELDS)) {
        it(`${field} of ${ownerName}`, () => {
          start();
          // A drag has moved the whole frame, and holds it.
          const gesture = history.beginGesture();
          gesture.run(() => setCameraFrame(owner, { center: [7, 7], height: 2 }));
          expect(frameOf(owner)).toEqual({ center: [7, 7], height: 2 });
          setCameraFrameField(owner, field as keyof typeof FIELDS, value);
          expect(gesture.active).toBe(false);
          const [x, y] = 'center' in change ? change.center : [null, null];
          expect(frameOf(owner)).toEqual({
            center: [x ?? frame.center[0], y ?? frame.center[1]],
            height: 'height' in change ? change.height : frame.height,
          });
          // One step, over the frame as it was before the drag.
          history.undo();
          expect(frameOf(owner)).toEqual(frame);
          expect(history.canUndo()).toBe(false);
        });
      }
    }

    it('at the playhead, writes where the camera rests then: 0 s, a target camera, a move', () => {
      start();
      const playhead = { kind: 'playhead' } as const;
      setCameraFrameField(playhead, 'x', 5);
      expect(camera()!.initial.center).toEqual([5, 0]);
      useUiStore.getState().setTime(2); // after the move to Camera 1
      setCameraFrameField(playhead, 'y', 5);
      expect(camera()!.targets[0]).toMatchObject({ center: [3, 5], height: 4 });
      useUiStore.getState().setTime(5.5); // after the move to a frame of its own
      setCameraFrameField(playhead, 'zoom', 200);
      expect(moveOf('n2').to).toEqual({ kind: 'frame', frame: { center: [1, 1], height: 4 } });
      setCameraFrameField(playhead, 'zoom', 100);
      expect(moveOf('n2').to).toEqual({ kind: 'frame', frame: { center: [1, 1], height: 8 } });
      // While a move runs the camera is on its way: no frame to write.
      useUiStore.getState().setTime(4.5);
      const before = useProjectStore.getState().project;
      setCameraFrameField(playhead, 'x', 9);
      expect(useProjectStore.getState().project).toBe(before);
    });

    it('asks who keeps the frame once the drag is given up: it may be nobody', () => {
      start();
      // The move to Camera 1 runs over [1, 1.5); a drag holds it over [1.5, 2), so that at
      // 1.2 s the camera seems to rest in the frame of 0 s.
      useUiStore.getState().setTime(1.2);
      const drag = history.beginGesture();
      drag.run(() => setCameraMoveTiming('n1', { start: 1.5, duration: 0.5 }));
      const settled = history.depth();
      setCameraFrameField({ kind: 'playhead' }, 'x', 9);
      expect(drag.active).toBe(false);
      expect(moveOf('n1')).toMatchObject({ start: 1, duration: 0.5 });
      expect(camera()!.initial).toEqual(defaultCameraFrame());
      expect(history.depth()).toBe(settled);
      // And a move whose own frame the drag had made: it goes to its target camera again.
      const other = history.beginGesture();
      other.run(() => setCameraMoveDestination('n1', 'frame'));
      expect(moveOf('n1').to.kind).toBe('frame');
      setCameraFrameField({ kind: 'move', id: 'n1' }, 'x', 9);
      expect(moveOf('n1').to).toEqual({ kind: 'target', target: 'k1' });
      expect(history.depth()).toBe(settled);
    });

    it('is the wheel’s own step while the wheel turns its field: one step when it is let go', () => {
      start();
      const wheel = history.beginGesture();
      wheel.run(() => setCameraFrameField({ kind: 'initial' }, 'y', 0.1));
      wheel.run(() => setCameraFrameField({ kind: 'initial' }, 'y', 0.2));
      expect(wheel.active).toBe(true);
      wheel.end();
      expect(camera()!.initial).toEqual({ center: [0, 0.2], height: 8 });
      history.undo();
      expect(camera()!.initial).toEqual(defaultCameraFrame());
      expect(history.canUndo()).toBe(false);
    });

    it('writes nothing in a locked row, and says so', () => {
      start(true);
      setCameraFrameField({ kind: 'initial' }, 'x', 5);
      expect(camera()!.initial).toEqual(defaultCameraFrame());
      expect(notices().at(-1)![0]).toBe('The Camera row is locked');
    });
  });

  it('add a target camera with the frame the camera is in, name it, and select it', () => {
    start();
    // At 2 s the camera rests on Camera 1.
    useUiStore.getState().setTime(2);
    const id = addTargetCamera()!;
    expect(camera()!.targets[1]).toEqual({ id, name: 'Camera 2', center: [3, 1], height: 4 });
    expect(useUiStore.getState().selection).toEqual({ kind: 'targetCamera', id });
    renameTargetCamera(id, '  Wide  ');
    expect(camera()!.targets[1]!.name).toBe('Wide');
    // An empty name is none, and the same name is no step.
    const before = useProjectStore.getState().project;
    renameTargetCamera(id, '   ');
    renameTargetCamera(id, 'Wide');
    expect(useProjectStore.getState().project).toBe(before);
    expect(addTargetCamera({ center: [9, 9], height: 2 })).not.toBeNull();
    expect(camera()!.targets[2]).toMatchObject({ name: 'Camera 2', center: [9, 9], height: 2 });
  });

  it('add a move to a target camera («Move camera here»)', () => {
    start();
    const id = addCameraMove(6.5, 'k1')!;
    expect(moveOf(id)).toMatchObject({
      start: 6.5,
      duration: 1,
      to: { kind: 'target', target: 'k1' },
    });
  });

  it('ask for a target camera’s new name («Rename…») and give it', async () => {
    start();
    const asked = renameTargetCameraAsking('k1');
    const dialog = useDialogStore.getState().queue[0]!;
    expect(dialog.title).toBe('Rename Camera 1');
    expect(dialog.field).toMatchObject({ label: 'Name', value: 'Camera 1', maxLength: 40 });
    expect(dialog.field!.validate!('  ')).toBe('A target camera needs a name.');
    expect(dialog.field!.validate!('Wide')).toBeNull();
    useDialogStore.getState().settle(dialog.key, 'confirm', 'Wide');
    await expect(asked).resolves.toBe(true);
    expect(camera()!.targets[0]!.name).toBe('Wide');
    // Given up, or the same name: nothing.
    const before = useProjectStore.getState().project;
    const again = renameTargetCameraAsking('k1');
    useDialogStore.getState().settle(useDialogStore.getState().queue[0]!.key, 'cancel');
    await expect(again).resolves.toBe(false);
    const same = renameTargetCameraAsking('k1');
    useDialogStore.getState().settle(useDialogStore.getState().queue[0]!.key, 'confirm', 'Wide');
    await expect(same).resolves.toBe(false);
    expect(useProjectStore.getState().project).toBe(before);
    // One that is not there is not asked about.
    await expect(renameTargetCameraAsking('gone')).resolves.toBe(false);
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it('delete a target camera no move goes to at once', async () => {
    start();
    const id = addTargetCamera()!;
    await expect(deleteTargetCameraAsking(id)).resolves.toBe(true);
    expect(camera()!.targets.map((t) => t.id)).toEqual(['k1']);
    expect(useDialogStore.getState().queue).toHaveLength(0);
    // Its view goes back to the camera's.
    expect(useUiStore.getState().selection).toEqual({ kind: 'camera' });
  });

  it('ask before deleting one that moves go to: they keep going where it was', async () => {
    start();
    const asked = deleteTargetCameraAsking('k1');
    const dialog = useDialogStore.getState().queue[0]!;
    expect(dialog.title).toBe('Delete Camera 1?');
    expect(dialog.message).toBe(
      '1 camera move goes to it. It keeps going where it is, to a frame of its own.',
    );
    useDialogStore.getState().settle(dialog.key, 'cancel');
    await expect(asked).resolves.toBe(false);
    expect(camera()!.targets).toHaveLength(1);

    const again = deleteTargetCameraAsking('k1');
    const second = useDialogStore.getState().queue[0]!;
    useDialogStore.getState().settle(second.key, 'confirm');
    await expect(again).resolves.toBe(true);
    expect(camera()!.targets).toEqual([]);
    expect(moveOf('n1').to).toEqual({ kind: 'frame', frame: { center: [3, 1], height: 4 } });
    // One step: undo brings the target camera and its move back.
    history.undo();
    expect(camera()!.targets).toHaveLength(1);
    expect(moveOf('n1').to).toEqual({ kind: 'target', target: 'k1' });
  });

  it('change nothing of a locked camera', async () => {
    start(true);
    const before = useProjectStore.getState().project;
    retimeCameraMove('n1', 'move', 1.25);
    setCameraMoveEasing('n1', 'linear');
    setCameraMoveDestination('n1', 'start');
    setCameraFrame({ kind: 'initial' }, { center: [1, 1], height: 2 });
    expect(addTargetCamera()).toBeNull();
    renameTargetCamera('k1', 'Other');
    await expect(renameTargetCameraAsking('k1')).resolves.toBe(false);
    await expect(deleteTargetCameraAsking('k1')).resolves.toBe(false);
    expect(useProjectStore.getState().project).toBe(before);
  });
});

describe('the arrows on a frame of the camera', () => {
  const start = (locked = false) => {
    const project = smallProject();
    project.camera = {
      initial: { center: [1, 1], height: 4 },
      targets: [{ id: 'k1', name: 'Camera 1', center: [3, 1], height: 4 }],
      moves: [
        {
          id: 'n1',
          start: 1,
          duration: 0.5,
          easing: 'smooth',
          to: { kind: 'frame', frame: { center: [0, 0], height: 2 } },
        },
        { id: 'n2', start: 4, duration: 1, easing: 'smooth', to: { kind: 'start' } },
      ],
      ...(locked ? { locked: true } : {}),
    };
    loadProject(project);
  };

  it('move it by the step of the key, and a run of presses is one undo step', () => {
    start();
    expect(nudgeCameraFrame({ kind: 'initial' }, [0.01, 0])).toBe(true);
    expect(nudgeCameraFrame({ kind: 'initial' }, [0.01, 0])).toBe(true);
    expect(nudgeCameraFrame({ kind: 'initial' }, [0, -0.1])).toBe(true);
    expect(camera()!.initial).toEqual({ center: [1.02, 0.9], height: 4 });
    expect(useAnnouncer.getState().text).toBe('Camera frame moved down 0.1');
    history.undo();
    expect(camera()!.initial).toEqual({ center: [1, 1], height: 4 });
    expect(history.canUndo()).toBe(false);
  });

  it('start a new step for another frame, or after another edit', () => {
    start();
    nudgeCameraFrame({ kind: 'target', id: 'k1' }, [0.1, 0]);
    nudgeCameraFrame({ kind: 'move', id: 'n1' }, [0, 0.1]);
    expect(camera()!.targets[0]!.center).toEqual([3.1, 1]);
    expect(camera()!.moves[0]!.to).toEqual({
      kind: 'frame',
      frame: { center: [0, 0.1], height: 2 },
    });
    history.undo();
    expect(camera()!.targets[0]!.center).toEqual([3.1, 1]);
    expect(camera()!.moves[0]!.to).toMatchObject({ frame: { center: [0, 0] } });
    // An edit in between ends the run.
    nudgeCameraFrame({ kind: 'target', id: 'k1' }, [0.1, 0]);
    setCameraMoveEasing('n1', 'linear');
    nudgeCameraFrame({ kind: 'target', id: 'k1' }, [0.1, 0]);
    history.undo();
    expect(camera()!.targets[0]!.center).toEqual([3.2, 1]);
  });

  it('move nothing of a locked camera, nor a frame that is not there', () => {
    start(true);
    expect(nudgeCameraFrame({ kind: 'initial' }, [0.01, 0])).toBe(false);
    start();
    expect(nudgeCameraFrame({ kind: 'target', id: 'gone' }, [0.01, 0])).toBe(false);
    // A move that goes to the start has no frame of its own.
    expect(nudgeCameraFrame({ kind: 'move', id: 'n2' }, [0.01, 0])).toBe(false);
  });
});
