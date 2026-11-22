// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createPartTransform,
  createTween,
  type Project,
} from '../../../model';
import {
  applyEdit,
  startDrag,
  startGroupTransform,
  startTransform,
  writeTravel,
  type Drag,
  type HandlePress,
  type Press,
} from '../gesture';

const press = (clipId: string): Press => ({
  kind: 'press',
  clipId,
  startPixel: { clientX: 10, clientY: 10 },
  startScene: [1, 2],
  locked: false,
});
const handlePress = (clipId: string, handle: HandlePress['handle'] = 'se'): HandlePress => ({
  kind: 'handle-press',
  handle,
  clipId,
  startPixel: { clientX: 10, clientY: 10 },
  startScene: [1, 2],
  center: [0, 0],
});
const idle = { time: 0, editing: null, unlocked: [] };

describe('startDrag', () => {
  it('moves the keyframe in effect: the initial state of a plain clip', () => {
    const clip = createClip('f', 't', 0, 4);
    clip.initial.position = [0.5, -0.5];
    expect(startDrag(press(clip.id), clip, idle)).toEqual({
      kind: 'drag',
      clipId: clip.id,
      startScene: [1, 2],
      startPosition: [0.5, -0.5],
      ref: { kind: 'initial' },
      companions: [],
      cancelled: false,
    });
  });

  it('takes the other selected clips along, each at its own keyframe, skipping blocked ones', () => {
    const clip = createClip('f', 't', 0, 4);
    const plain = createClip('g', 't', 0, 4);
    plain.initial.position = [3, 1];
    const tweened = createClip('h', 't', 0, 4);
    const tween = createTween(1, 1, { position: [2, 0] });
    tweened.actions.push(tween);
    const during = { ...idle, time: 1.5 };
    // The tweened clip is locked after its transformation: it stays.
    expect(startDrag(press(clip.id), clip, during, [plain, tweened, clip])).toMatchObject({
      companions: [{ clipId: plain.id, ref: { kind: 'initial' }, startPosition: [3, 1] }],
    });
    // Unlocked, it moves its tween's end state.
    const unlocked = { ...during, unlocked: [tweened.id] };
    expect(startDrag(press(clip.id), clip, unlocked, [tweened])).toMatchObject({
      companions: [
        { clipId: tweened.id, ref: { kind: 'action', actionId: tween.id }, startPosition: [2, 0] },
      ],
    });
  });

  it('moves a part alone, with no companions', () => {
    const clip = createClip('f', 't', 0, 4);
    const part = createPartTransform(1, [0, 1], { shift: [0.3, 0.1] });
    clip.actions.push(part);
    const other = createClip('g', 't', 0, 4);
    const editing = { clipId: clip.id, actionId: part.id, time: 1 };
    expect(startDrag(press(clip.id), clip, { ...idle, editing }, [other])).toMatchObject({
      part: part.id,
      companions: [],
    });
  });

  it('is blocked on the tween of a locked clip, and edits it once the clip is unlocked', () => {
    const clip = createClip('f', 't', 0, 4);
    const tween = createTween(1, 1, { position: [2, 0] });
    clip.actions.push(tween);
    const during = { ...idle, time: 1.5 };
    expect(startDrag(press(clip.id), clip, during)).toBe('blocked');
    expect(startDrag(press(clip.id), clip, { ...during, unlocked: [clip.id] })).toMatchObject({
      ref: { kind: 'action', actionId: tween.id },
      startPosition: [2, 0],
    });
  });

  it('moves the shift of the part transform under edit', () => {
    const clip = createClip('f', 't', 0, 4);
    const part = createPartTransform(1, [0, 1], { shift: [0.3, 0.1] });
    clip.actions.push(part);
    const editing = { clipId: clip.id, actionId: part.id, time: 1 };
    expect(startDrag(press(clip.id), clip, { ...idle, editing })).toMatchObject({
      part: part.id,
      ref: { kind: 'initial' },
      startPosition: [0.3, 0.1],
    });
  });
});

describe('startTransform', () => {
  it("starts from the keyframe's scale, or its rotation for the rotate handle", () => {
    const clip = createClip('f', 't', 0, 4);
    clip.initial.scale = 2;
    clip.initial.rotation = 30;
    const scale = startTransform(handlePress(clip.id), clip, idle);
    expect(scale).toMatchObject({
      kind: 'transform',
      handle: 'se',
      ref: { kind: 'initial' },
      startValue: 2,
      cancelled: false,
    });
    expect(scale).toHaveProperty('tracker');
    expect(startTransform(handlePress(clip.id, 'rotate'), clip, idle)).toMatchObject({
      startValue: 30,
    });
  });

  it('starts from the part under edit, and is blocked like a drag', () => {
    const clip = createClip('f', 't', 0, 4);
    const part = createPartTransform(1, [0], { scale: 1.5, rotation: -10 });
    clip.actions.push(part);
    const editing = { clipId: clip.id, actionId: part.id, time: 1 };
    expect(startTransform(handlePress(clip.id), clip, { ...idle, editing })).toMatchObject({
      part: part.id,
      startValue: 1.5,
    });
    expect(
      startTransform(handlePress(clip.id, 'rotate'), clip, { ...idle, editing }),
    ).toMatchObject({ startValue: -10 });
    const locked = createClip('f', 't', 0, 4);
    locked.actions.push(createTween(1, 1, {}));
    expect(startTransform(handlePress(locked.id), locked, { ...idle, time: 1.5 })).toBe('blocked');
  });
});

describe('applyEdit', () => {
  it('patches the keyframe', () => {
    const clip = createClip('f', 't', 0, 4);
    applyEdit(clip, { ref: { kind: 'initial' } }, { position: [1, 1] });
    applyEdit(clip, { ref: { kind: 'initial' } }, { rotation: 45 });
    expect(clip.initial).toMatchObject({ position: [1, 1], rotation: 45 });
    const tween = createTween(1, 1, {});
    clip.actions.push(tween);
    applyEdit(clip, { ref: { kind: 'action', actionId: tween.id } }, { scale: 3 });
    expect(tween.to).toEqual({ scale: 3 });
  });

  it("writes to the part's end state, a position being its shift", () => {
    const clip = createClip('f', 't', 0, 4);
    const part = createPartTransform(1, [0]);
    clip.actions.push(part);
    const edit = { ref: { kind: 'initial' as const }, part: part.id };
    applyEdit(clip, edit, { position: [0.2, 0.4] });
    applyEdit(clip, edit, { scale: 2 });
    applyEdit(clip, edit, { rotation: 90 });
    expect(part).toMatchObject({ shift: [0.2, 0.4], scale: 2, rotation: 90 });
    expect(clip.initial).toEqual(createClip('f', 't', 0, 4).initial);
  });
});

describe('writeTravel', () => {
  /** A project with the clips of a drag: the dragged one and a companion. */
  function dragOf(start: [number, number], other: [number, number]) {
    const project = createEmptyProject('t');
    const clip = createClip('f', 't', 0, 4);
    clip.initial.position = start;
    const companion = createClip('g', 't', 0, 4);
    companion.initial.position = other;
    project.clips = [clip, companion];
    const drag = startDrag(press(clip.id), clip, idle, [companion]) as Drag;
    return { project, drag, ids: [clip.id, companion.id] };
  }
  const positions = (project: Project, ids: string[]) =>
    ids.map((id) => project.clips.find((c) => c.id === id)!.initial.position);

  it('moves the dragged clip and its companions by the travel, to six decimals', () => {
    const { project, drag, ids } = dragOf([0.1, -1], [3, 0.2]);
    writeTravel(project, drag, [0.2, 0.1]);
    // 0.1 + 0.2 is 0.30000000000000004 in floating point; 0.2 + 0.1 the same.
    expect(positions(project, ids)).toEqual([
      [0.3, -0.9],
      [3.2, 0.3],
    ]);
  });

  it('leaves a coordinate the travel does not move exactly as it was', () => {
    // A drag held to x: the y of each clip is not rounded, even with more than six decimals.
    const { project, drag, ids } = dragOf([1, 0.12345678], [-2, 1 / 3]);
    writeTravel(project, drag, [0.5, 0]);
    expect(positions(project, ids)).toEqual([
      [1.5, 0.12345678],
      [-1.5, 1 / 3],
    ]);
  });

  it("writes a part's shift when the drag moves a part", () => {
    const project = createEmptyProject('t');
    const clip = createClip('f', 't', 0, 4);
    const part = createPartTransform(1, [0, 1], { shift: [0.3, 0.1] });
    clip.actions.push(part);
    project.clips = [clip];
    const editing = { clipId: clip.id, actionId: part.id, time: 1 };
    const drag = startDrag(press(clip.id), clip, { ...idle, editing }) as Drag;
    writeTravel(project, drag, [0, -0.2]);
    expect(part.shift).toEqual([0.3, -0.1]);
    expect(clip.initial.position).toEqual([0, 0]);
  });
});

describe('startGroupTransform', () => {
  it('lists every member that can be edited, with where it began; the factor starts at 1', () => {
    const a = createClip('f', 't', 0, 4);
    a.initial.position = [-3, 0];
    a.initial.scale = 2;
    const b = createClip('g', 't', 0, 4);
    b.initial.position = [3, 1];
    b.initial.rotation = 45;
    const press = { ...handlePress(a.id), center: [0, 0.5] as [number, number] };
    const scale = startGroupTransform(press, [a, b], idle);
    expect(scale).toMatchObject({
      kind: 'transform',
      handle: 'se',
      clipId: a.id,
      center: [0, 0.5],
      startValue: 1,
      cancelled: false,
      members: [
        {
          clipId: a.id,
          ref: { kind: 'initial' },
          startPosition: [-3, 0],
          startScale: 2,
          startRotation: 0,
        },
        {
          clipId: b.id,
          ref: { kind: 'initial' },
          startPosition: [3, 1],
          startScale: 1,
          startRotation: 45,
        },
      ],
    });
    expect(startGroupTransform({ ...press, handle: 'rotate' }, [a, b], idle)).toMatchObject({
      startValue: 0,
    });
  });

  it('leaves out a member locked after its transformations or with a part under edit', () => {
    const a = createClip('f', 't', 0, 4);
    const locked = createClip('g', 't', 0, 4);
    locked.actions.push(createTween(1, 1, {}));
    const edited = createClip('h', 't', 0, 4);
    const part = createPartTransform(1, [0], {});
    edited.actions.push(part);
    const context = {
      ...idle,
      time: 1.5,
      editing: { clipId: edited.id, actionId: part.id, time: 1 },
    };
    const result = startGroupTransform(handlePress(a.id), [a, locked, edited], context);
    expect(result).toMatchObject({ members: [{ clipId: a.id }] });
    expect(startGroupTransform(handlePress(locked.id), [locked], context)).toBe('blocked');
    expect(startGroupTransform(handlePress(a.id), [], idle)).toBe('blocked');
  });
});
