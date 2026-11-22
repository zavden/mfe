// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAttach,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createShapeAttach,
  createShapeFormula,
  createEmptyProject,
  createEndsTween,
  createFitTween,
  createFormula,
  createLineFormula,
  createRelation,
  createTexFormula,
  createTipAttach,
  createAudioTrack,
  createTrack,
  createTween,
  defaultClipState,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Clip,
  type Project,
  type TweenAction,
} from '../../../model';
import {
  actionSlotAt,
  addClipAt,
  addClipIn,
  attachedClips,
  constrainMove,
  deleteClips,
  deleteTrack,
  duplicateClips,
  editableClips,
  endBounds,
  findFreeSlot,
  fitActions,
  fitsLosingTarget,
  freeActionWindows,
  freedClips,
  nearestFreeTrack,
  moveTrack,
  newAudioTrackName,
  newTrackName,
  regionClipBlocker,
  regionFreeOn,
  snapEdges,
  snapOffset,
  startBounds,
  trackGaps,
  trimEnd,
  trimStart,
} from '../clipOps';

/** Two tracks; track 1 holds clips at [1, 3] and [5, 8], track 2 one at [2, 4]. */
function scene(): { project: Project; a: Clip; b: Clip; c: Clip } {
  const project = createEmptyProject();
  const [t1, t2] = project.tracks;
  const a = createClip('f', t1!.id, 1, 3);
  const b = createClip('f', t1!.id, 5, 8);
  const c = createClip('f', t2!.id, 2, 4);
  project.clips.push(a, b, c);
  return { project, a, b, c };
}

describe('gaps and free slots', () => {
  it('lists the free time of a track, optionally ignoring clips', () => {
    const { project, a, b } = scene();
    const t1 = project.tracks[0]!.id;
    expect(trackGaps(project, t1)).toEqual([
      { start: 0, end: 1 },
      { start: 3, end: 5 },
      { start: 8, end: Infinity },
    ]);
    expect(trackGaps(project, t1, new Set([a.id, b.id]))).toEqual([{ start: 0, end: Infinity }]);
  });

  it('touching clips leave no gap', () => {
    const { project, a } = scene();
    project.clips.push(createClip('f', project.tracks[0]!.id, 3, 5));
    expect(trackGaps(project, a.trackId).map((g) => g.start)).toEqual([0, 8]);
  });

  it('finds the free start nearest to the wish that fits the length', () => {
    const { project } = scene();
    const t1 = project.tracks[0]!.id;
    expect(findFreeSlot(project, t1, 3.2, 1.5)).toBe(3.2); // fits in [3, 5]
    expect(findFreeSlot(project, t1, 4.5, 1.5)).toBe(3.5); // pushed back to fit before 5
    expect(findFreeSlot(project, t1, 2, 3)).toBe(8); // [3, 5] is too short, [0, 1] too
    expect(findFreeSlot(project, t1, 0, 1)).toBe(0);
    expect(findFreeSlot(project, project.tracks[1]!.id, 0, 3)).toBe(4);
  });
});

describe('constrainMove', () => {
  it('lets a clip move through free space', () => {
    const { project, a } = scene();
    expect(constrainMove(project, [{ clip: a, trackId: a.trackId }], 1.5)).toBe(1.5);
  });

  it('stops at neighbours, choosing the nearest allowed shift', () => {
    const { project, a } = scene();
    // a is [1, 3]; b starts at 5, so the furthest right is a.end = 5, shift 2.
    expect(constrainMove(project, [{ clip: a, trackId: a.trackId }], 2.9)).toBe(2);
    // Past b the next free slot starts at 8, shift 7: 6 is nearer to 2 than to 7 …
    expect(constrainMove(project, [{ clip: a, trackId: a.trackId }], 6)).toBe(7);
    // … and 4 is nearer to 2.
    expect(constrainMove(project, [{ clip: a, trackId: a.trackId }], 4)).toBe(2);
    // Not before time zero.
    expect(constrainMove(project, [{ clip: a, trackId: a.trackId }], -5)).toBe(-1);
  });

  it('checks the destination track', () => {
    const { project, a, c } = scene();
    // a [1, 3] onto track 2 overlaps c [2, 4]: allowed shifts are ≤ −1 (end ≤ 2) or ≥ 3.
    expect(constrainMove(project, [{ clip: a, trackId: c.trackId }], 0)).toBe(-1);
    expect(constrainMove(project, [{ clip: a, trackId: c.trackId }], 2)).toBe(3);
  });

  it('moves several clips by one shift, ignoring each other', () => {
    const { project, a, b } = scene();
    const t1 = a.trackId;
    // a and b together: b ends at 8; free to the right of everything.
    expect(
      constrainMove(
        project,
        [
          { clip: a, trackId: t1 },
          { clip: b, trackId: t1 },
        ],
        10,
      ),
    ).toBe(10);
    // Moving them one row down: both must clear c [2, 4] on track 2 → a [1,3] needs a shift,
    // b [5, 8] does not.
    const t2 = project.tracks[1]!.id;
    expect(
      constrainMove(
        project,
        [
          { clip: a, trackId: t2 },
          { clip: b, trackId: t2 },
        ],
        0,
      ),
    ).toBe(-1);
  });

  it('goes after everything when the track is full', () => {
    const { project, a } = scene();
    const t2 = project.tracks[1]!.id;
    project.clips.push(createClip('f', t2, 0, 100));
    expect(constrainMove(project, [{ clip: a, trackId: t2 }], 0)).toBe(99);
  });
});

describe('trimming', () => {
  it('bounds the edges by the neighbours and by intro + outro', () => {
    const { project, a, b } = scene();
    expect(startBounds(project, a)).toEqual([0, 1]); // length ≥ 2 (intro 1 + outro 1): start ≤ 1
    expect(startBounds(project, b)).toEqual([3, 6]);
    expect(endBounds(project, a)).toEqual([3, 5]);
    expect(endBounds(project, b)).toEqual([7, Infinity]);
  });

  it('keeps the absolute time of tween actions when the start moves', () => {
    const { a } = scene();
    a.end = 9; // [1, 9]
    a.actions = [createTween(2, 1, { rotation: 90 })]; // absolute [3, 4]
    trimStart(a, 0.5);
    expect(a.start).toBe(0.5);
    expect(a.actions[0]!.start).toBeCloseTo(2.5, 9);
    trimStart(a, 2); // intro now ends at 3
    expect(a.actions[0]!.start).toBeCloseTo(1, 9);
    expect(a.actions[0]!.start + a.start).toBeCloseTo(3, 9);
  });

  it('clamps tweens into [intro end, outro start] and drops the ones left too short', () => {
    const { a } = scene();
    a.start = 0;
    a.end = 10;
    a.actions = [
      createTween(0.5, 1, { rotation: 1 }), // [0.5, 1.5] overlaps the intro (ends at 1)
      createTween(8.6, 1, { rotation: 2 }), // [8.6, 9.6] overlaps the outro (starts at 9)
      createTween(4, 1, { rotation: 3 }),
    ];
    fitActions(a);
    // Sorted by start; the first lost its part inside the intro, the last its part in the outro.
    expect(a.actions.map((x) => [x.start, x.duration])).toEqual([
      [1, 0.5],
      [4, 1],
      [8.6, 0.4],
    ]);
    a.end = 9.4; // outro now starts at 8.4: the last tween no longer fits
    fitActions(a);
    expect(a.actions).toHaveLength(2);
    a.end = 5; // outro starts at 4: only [1, 1.5] fits
    fitActions(a);
    expect(a.actions.map((x) => x.start)).toEqual([1]);
  });

  it('trimEnd moves the end and refits the tweens', () => {
    const { a } = scene();
    a.end = 10; // [1, 10]
    a.actions = [createTween(4, 1.5, { rotation: 1 }), createTween(7.5, 1, { rotation: 2 })];
    trimEnd(a, 7); // outro starts at 6: first becomes [5, 6], the second [8.5, 9.5] is gone
    expect(a.end).toBe(7);
    expect(a.actions).toHaveLength(1);
    expect(a.actions[0]).toMatchObject({ start: 4, duration: 1 });
  });
});

describe('free time for tween actions', () => {
  it('excludes the intro, the outro, other actions and relation windows', () => {
    const project = createEmptyProject();
    const [t1, t2] = project.tracks;
    const a = createClip('f', t1!.id, 0, 10);
    a.actions = [createTween(3, 1, { rotation: 1 })]; // [3, 4]
    const b = createClip('f', t2!.id, 1, 9);
    project.clips.push(a, b);
    // Relation window [5, 6] (b.start 1 + offset 4).
    project.relations.push(createRelation(a.id, b.id, { offset: 4, duration: 1 }));
    expect(freeActionWindows(project, a)).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 5 },
      { start: 6, end: 9 },
    ]);
    expect(actionSlotAt(project, a, 2)).toEqual({ start: 2, end: 3 });
    expect(actionSlotAt(project, a, 3.5)).toBeNull();
    expect(actionSlotAt(project, a, 4.97)).toBeNull(); // too little room left
    expect(actionSlotAt(project, a, 9.5)).toBeNull(); // inside the outro
    expect(actionSlotAt(project, a, 0.5)).toBeNull(); // inside the intro
  });
});

describe('a new clip in the region of the timeline (D180)', () => {
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

  it('a track has the region free when none of its clips is in it', () => {
    const { project } = scene(); // track 1: [1, 3] and [5, 8]; track 2: [2, 4]
    const [t1, t2] = project.tracks.map((t) => t.id) as [string, string];
    expect(regionFreeOn(project, t1, { start: 3, end: 5 })).toBe(true); // between the two
    expect(regionFreeOn(project, t1, { start: 8, end: 20 })).toBe(true);
    expect(regionFreeOn(project, t1, { start: 2.5, end: 4 })).toBe(false);
    expect(regionFreeOn(project, t1, { start: 3, end: 5.1 })).toBe(false);
    expect(regionFreeOn(project, t1, { start: 0, end: 9 })).toBe(false);
    expect(regionFreeOn(project, t2, { start: 0, end: 2 })).toBe(true);
    expect(regionFreeOn(project, t2, { start: 3.9, end: 6 })).toBe(false);
  });

  it('takes the region whole on the first unlocked track that has it free', () => {
    const { project } = scene();
    const [t1, t2] = project.tracks.map((t) => t.id) as [string, string];
    const first = addClipIn(project, 'f', { start: 3, end: 5 }, none);
    expect(first).toMatchObject({ trackId: t1, start: 3, end: 5 });
    // Track 1 is taken there now: the next one goes to track 2, which has [4, ∞) free.
    const second = addClipIn(project, 'f', { start: 4, end: 5 }, none);
    expect(second).toMatchObject({ trackId: t2, start: 4, end: 5 });
    // A locked track takes none, free or not.
    project.tracks[0]!.locked = true;
    const third = addClipIn(project, 'f', { start: 9, end: 10 }, none);
    expect(third).toMatchObject({ trackId: t2, start: 9, end: 10 });
    expect(project.tracks).toHaveLength(2);
  });

  it('goes on a new track on top when no track has the region free', () => {
    const { project } = scene();
    const before = project.tracks.map((t) => t.id);
    const clip = addClipIn(project, 'f', { start: 2, end: 6 }, none);
    expect(project.tracks.map((t) => t.id)).toEqual([clip.trackId, ...before]);
    expect(clip).toMatchObject({ start: 2, end: 6 });
    // The one after it finds that new track taken too, and gets another.
    const next = addClipIn(project, 'f', { start: 2, end: 6 }, none);
    expect(project.tracks.map((t) => t.id)).toEqual([next.trackId, clip.trackId, ...before]);
  });

  it('no clip takes a region shorter than a clip may be', () => {
    expect(regionClipBlocker({ start: 1, end: 3 })).toBeNull();
    expect(regionClipBlocker({ start: 1, end: 1.1 })).toBeNull();
    expect(regionClipBlocker({ start: 1, end: 1.05 })).toBe(
      'The region (1.00–1.05 s) is too short for a clip: nothing was added.',
    );
  });
});

describe('deleting and duplicating', () => {
  it('deleting clips removes the relations attached to them', () => {
    const { project, a, c } = scene();
    project.relations.push(createRelation(a.id, c.id));
    deleteClips(project, new Set([c.id]));
    expect(project.clips).toHaveLength(2);
    expect(project.relations).toHaveLength(0);
  });

  it('deleting a clip takes the objects attached to it, and to those, with their relations', () => {
    const { project, a, b, c } = scene();
    // c hangs on a, b on c: deleting a takes both; b's relation goes with it.
    c.attach = createAttach(a.id, 'all');
    b.attach = createAttach(c.id, [0]);
    const d = addClipAt(project, 'f', 12, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    project.relations.push(createRelation(d.id, b.id));
    expect(attachedClips(project, new Set([a.id])).map((x) => x.id)).toEqual([c.id, b.id]);
    expect(attachedClips(project, new Set([b.id]))).toEqual([]);
    deleteClips(project, new Set([a.id]));
    expect(project.clips.map((x) => x.id)).toEqual([d.id]);
    expect(project.relations).toEqual([]);
  });

  it('a duplicate keeps its attachment, moved to the copy when the target is copied too', () => {
    const { project, a, c } = scene();
    c.attach = createAttach(a.id, [1], { side: 'up' });
    const [alone] = duplicateClips(project, [c]);
    expect(alone!.attach).toEqual(c.attach);
    expect(alone!.attach).not.toBe(c.attach);
    const [copyA, copyC] = duplicateClips(project, [a, c]);
    expect(copyC!.attach).toEqual({ ...c.attach, clipId: copyA!.id });
  });

  it('only clips on unlocked tracks may be edited', () => {
    const { project, a, c } = scene();
    project.tracks.find((t) => t.id === c.trackId)!.locked = true;
    expect(editableClips(project, [a.id, c.id]).map((x) => x.id)).toEqual([a.id]);
  });

  it('deleting a track takes its clips along', () => {
    const { project } = scene();
    deleteTrack(project, project.tracks[0]!.id);
    expect(project.tracks).toHaveLength(1);
    expect(project.clips).toHaveLength(1);
  });

  it('reorders and names tracks', () => {
    const { project } = scene();
    const [first, second] = project.tracks.map((t) => t.id);
    moveTrack(project, first!, 1);
    expect(project.tracks.map((t) => t.id)).toEqual([second, first]);
    moveTrack(project, first!, 1); // already last
    expect(project.tracks.map((t) => t.id)).toEqual([second, first]);
    expect(newTrackName(project.tracks)).toBe('Track 3');
  });

  it('names a new audio track with the first number no track has, never twice the same', () => {
    const project = createEmptyProject();
    expect(newAudioTrackName(project.tracks)).toBe('Audio 1');
    project.tracks.push(createAudioTrack(newAudioTrackName(project.tracks)));
    project.tracks.push(createAudioTrack(newAudioTrackName(project.tracks)));
    expect(project.tracks.map((t) => t.name).slice(-2)).toEqual(['Audio 1', 'Audio 2']);
    // «Audio 1» deleted: the next one takes its name, not a second «Audio 2».
    project.tracks = project.tracks.filter((t) => t.name !== 'Audio 1');
    expect(newAudioTrackName(project.tracks)).toBe('Audio 1');
    // A track of any kind renamed «Audio 3» keeps that name its own.
    project.tracks.push(createAudioTrack('Audio 1'), createTrack('Audio 3'));
    expect(newAudioTrackName(project.tracks)).toBe('Audio 4');
  });

  it('numbers the tracks of a new project from the bottom, like a stack', () => {
    const project = createEmptyProject();
    expect(project.tracks.map((t) => t.name)).toEqual(['Track 2', 'Track 1']);
    // A new track goes on top with the next number.
    project.tracks.unshift(createTrack(newTrackName(project.tracks)));
    expect(project.tracks.map((t) => t.name)).toEqual(['Track 3', 'Track 2', 'Track 1']);
  });

  it('duplicates into the nearest free space with fresh ids and keeps the project valid', () => {
    const { project, a, c } = scene();
    a.actions = [createTween(1, 0.5, { rotation: 10 })];
    a.intro = defaultIntro('write');
    a.outro = defaultOutro('fade_out');
    const [copy, copy2] = duplicateClips(project, [a, c]);
    project.clips.push(copy!, copy2!);
    expect(copy!.id).not.toBe(a.id);
    expect(copy!.actions[0]!.id).not.toBe(a.actions[0]!.id);
    expect((copy!.actions[0] as TweenAction).to).toEqual((a.actions[0] as TweenAction).to);
    // a is [1, 3]: the next free 2 s on track 1 begins at 3? No: b starts at 5 → [3, 5] fits.
    expect([copy!.start, copy!.end]).toEqual([3, 5]);
    expect([copy2!.start, copy2!.end]).toEqual([4, 6]);
    expect(validateProject(project).filter((i) => i.code === 'track-overlap')).toEqual([]);
    expect(copy!.actions).not.toBe(a.actions);
  });
});

describe('snapping', () => {
  const options = { points: [0, 2.2, 4.3], grid: 0.5, threshold: 0.1 };

  it('pulls an edge onto a point within the threshold, else onto the grid', () => {
    expect(snapOffset(2.25, options)).toBeCloseTo(-0.05, 9);
    expect(snapOffset(4.35, options)).toBeCloseTo(-0.05, 9);
    expect(snapOffset(3.1, options)).toBeCloseTo(-0.1, 9); // grid 3.0
    expect(snapOffset(3.3, options)).toBeCloseTo(0.2, 9); // grid 3.5
    expect(snapOffset(2.2, options)).toBe(0); // already on a point (the grid would pull it)
  });

  it('chooses among several edges the one closest to a point', () => {
    // Edges at 1.0 and 4.28: the end is 0.02 from 4.3.
    expect(snapEdges([1.0, 4.28], options)).toBeCloseTo(0.02, 9);
    // No point near: the first edge goes to the grid.
    expect(snapEdges([3.1, 3.45], options)).toBeCloseTo(-0.1, 9);
    expect(snapEdges([3.1], { ...options, grid: 0 })).toBe(0);
  });
});

describe('addClipAt', () => {
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

  it('puts the clip on the first unlocked track, at the free time nearest the playhead', () => {
    const p = createEmptyProject();
    const f = createFormula({ name: 'f' });
    p.formulas.push(f);
    const [top, bottom] = p.tracks;
    top!.locked = true;
    p.clips.push(createClip(f.id, bottom!.id, 1, 3, none));
    const clip = addClipAt(p, f.id, 2, none);
    expect(clip).toMatchObject({ formulaId: f.id, trackId: bottom!.id, start: 3, end: 6 });
    expect(p.clips).toContain(clip);
  });

  it('adds a track on top when every track is locked', () => {
    const p = createEmptyProject();
    const f = createFormula({ name: 'f' });
    for (const t of p.tracks) t.locked = true;
    const clip = addClipAt(p, f.id, 0, none);
    expect(p.tracks).toHaveLength(3);
    expect(p.tracks[0]!.id).toBe(clip.trackId);
    expect(p.tracks[0]!.locked).toBe(false);
  });

  it('starts the clip where its object keeps its new clips, else at the centre', () => {
    const p = createEmptyProject();
    const title = createTexFormula({ name: 't1', startPosition: [-5, 3] });
    const f = createFormula({ name: 'f' });
    p.formulas.push(title, f);
    const placed = addClipAt(p, title.id, 0, none);
    expect(placed.initial).toEqual({ ...defaultClipState(), position: [-5, 3] });
    // Its own array: moving the clip does not move where the next one starts.
    placed.initial.position[0] = 1;
    expect(title.startPosition).toEqual([-5, 3]);
    expect(addClipAt(p, title.id, 0, none).initial.position).toEqual([-5, 3]);
    expect(addClipAt(p, f.id, 0, none).initial).toEqual(defaultClipState());
  });
});

describe('nearestFreeTrack / braces', () => {
  it("finds the nearest track with room on its side, never the clip's own nor one across it", () => {
    const p = createEmptyProject();
    p.tracks = ['t4', 't3', 't2', 't1'].map((name) => ({ ...createTrack(name), id: name }));
    const f = createFormula({ name: 'f' });
    p.formulas.push(f);
    p.clips.push(createClip(f.id, 't2', 0, 6));
    expect(nearestFreeTrack(p, 't2', 2, 6)?.id).toBe('t3');
    expect(nearestFreeTrack(p, 't2', 2, 6, 'below')?.id).toBe('t1');
    p.clips.push(createClip(f.id, 't3', 1, 4)); // t3 busy over the window: the next one above
    expect(nearestFreeTrack(p, 't2', 2, 6)?.id).toBe('t4');
    p.clips.push(createClip(f.id, 't1', 5, 7));
    // Nothing below has room: none, though two tracks above are free then.
    expect(nearestFreeTrack(p, 't2', 2, 6, 'below')).toBeNull();
    p.tracks[0]!.locked = true;
    // Nor above, with the free one locked — though the track below is free before 5 s.
    expect(nearestFreeTrack(p, 't2', 2, 4.5)).toBeNull();
    expect(nearestFreeTrack(p, 't2', 2, 4.5, 'below')?.id).toBe('t1');
    expect(nearestFreeTrack(p, 't2', 7, 8)?.id).toBe('t3'); // room later on
    expect(nearestFreeTrack(p, 't4', 0, 1)).toBeNull(); // nothing is above the first track
    expect(nearestFreeTrack(p, 't1', 0, 1, 'below')).toBeNull(); // nor below the last
  });

  it('deleteClips removes a brace or shape object left without clips, not the others', () => {
    const p = createEmptyProject();
    const [t1, t2] = p.tracks;
    const f = createFormula({ name: 'f' });
    const b = createBraceFormula({ name: 'b1' });
    const s = createShapeFormula({ name: 's1' });
    const cf = createClip(f.id, t1!.id, 0, 6);
    const cb = createClip(b.id, t2!.id, 2, 6, { attach: createBraceAttach(cf.id, 'all') });
    const cs = createClip(s.id, t2!.id, 0, 2, { attach: createShapeAttach(cf.id, 'all') });
    p.formulas.push(f, b, s);
    p.clips.push(cf, cb, cs);
    const only = structuredClone(p);
    deleteClips(only, new Set([cb.id]));
    expect(only.formulas.map((x) => x.name)).toEqual(['f', 's1']);
    expect(only.clips.map((c) => c.id)).toEqual([cf.id, cs.id]);
    // Deleting the target takes the brace and shape clips, and so their objects, along.
    const target = structuredClone(p);
    deleteClips(target, new Set([cf.id]));
    expect(target.formulas.map((x) => x.name)).toEqual(['f']);
    expect(target.clips).toEqual([]);
  });
});

describe('a brace or a shape over glyphs of several clips (D117)', () => {
  /** Formulas f and g on two tracks; over glyphs of both, a brace `b1` — with a label `x` at its
   * tip — and a shape `s1`; and a brace `b2` on f alone. */
  function spanning() {
    const p = createEmptyProject();
    const [t1, t2] = p.tracks;
    const tracks = [createTrack('Track 3'), createTrack('Track 4'), createTrack('Track 5')];
    p.tracks.push(...tracks);
    const f = createFormula({ name: 'f' });
    const g = createFormula({ name: 'g' });
    const x = createFormula({ name: 'x' });
    const b1 = createBraceFormula({ name: 'b1', width: 3 });
    const b2 = createBraceFormula({ name: 'b2' });
    const s1 = createShapeFormula({ name: 's1' });
    p.formulas.push(f, g, x, b1, b2, s1);
    const cf = createClip(f.id, t1!.id, 0, 6);
    const cg = createClip(g.id, t2!.id, 0, 6);
    const over = [{ clipId: cg.id, glyphs: [0] }];
    const cb = createClip(b1.id, tracks[0]!.id, 2, 6, {
      attach: createBraceAttach(cf.id, [1, 2], { also: over }),
    });
    cb.initial.position = [1, -2];
    const cx = createClip(x.id, tracks[1]!.id, 2, 6, { attach: createTipAttach(cb.id) });
    const cs = createClip(s1.id, tracks[2]!.id, 2, 6, {
      attach: createShapeAttach(cg.id, 'all', 0.1, [{ clipId: cf.id, glyphs: [0] }]),
    });
    const cb2 = createClip(b2.id, tracks[2]!.id, 0, 2, { attach: createBraceAttach(cf.id, 'all') });
    p.clips.push(cf, cg, cb, cx, cs, cb2);
    return { p, cf, cg, cb, cx, cs, cb2 };
  }
  const ids = (clips: readonly Clip[]) => clips.map((c) => c.id);

  it('keeps a line whose Transform carried an end onto a deleted clip: that end is left free where it was drawn', () => {
    const { p, cf, cg } = spanning();
    const line = createLineFormula({ name: 'l1', line: 'arrow', vector: [2, 0] });
    p.formulas.push(line);
    const track = createTrack('Track 6');
    p.tracks.push(track);
    const cl = createClip(line.id, track.id, 0, 6);
    const tween = createEndsTween(1, 1, {
      start: { clipId: cf.id, glyphs: 'all', anchor: 'auto' },
      end: { clipId: cg.id, glyphs: [0], anchor: 'up' },
      buff: 0.25,
    });
    tween.ends.drawn = { start: [-1, 0.5], end: [2, 1], trim: 0, center: [0.5, 0.75] };
    cl.actions.push(tween);
    p.clips.push(cl);
    deleteClips(p, new Set([cf.id]));
    const kept = p.clips.find((c) => c.id === cl.id)!;
    expect(kept.actions).toHaveLength(1);
    expect(kept.actions[0]).toMatchObject({
      ends: { start: { point: [-1, 0.5] }, end: { clipId: cg.id, glyphs: [0], anchor: 'up' } },
    });
    expect(p.formulas.map((formula) => formula.name)).toContain('l1');
  });

  it('is not deleted with one of those clips: it is freed, where it is, with what hangs on it', () => {
    const { p, cf, cg, cb, cx, cs, cb2 } = spanning();
    // What goes with f: the brace that hangs on it alone. What is freed: the two that span g too.
    expect(ids(attachedClips(p, new Set([cf.id])))).toEqual([cb2.id]);
    expect(ids(freedClips(p, new Set([cf.id])))).toEqual([cb.id, cs.id]);
    deleteClips(p, new Set([cf.id]));
    expect(ids(p.clips)).toEqual([cg.id, cb.id, cx.id, cs.id]);
    const brace = p.clips.find((c) => c.id === cb.id)!;
    expect(brace.attach).toBeNull();
    expect(brace.initial.position).toEqual([1, -2]);
    expect(p.clips.find((c) => c.id === cs.id)!.attach).toBeNull();
    // The label still hangs at the tip of the brace, and the objects are all still there.
    expect(p.clips.find((c) => c.id === cx.id)!.attach).toEqual(createTipAttach(cb.id));
    expect(p.formulas.map((formula) => formula.name)).toEqual(['f', 'g', 'x', 'b1', 's1']);
    expect(p.formulas.find((formula) => formula.name === 'b1')).toMatchObject({ width: 3 });
  });

  it('is freed whichever of its clips goes, the one it hangs on or one of the others', () => {
    const { p, cg, cb, cs } = spanning();
    expect(ids(attachedClips(p, new Set([cg.id])))).toEqual([]);
    expect(ids(freedClips(p, new Set([cg.id])))).toEqual([cb.id, cs.id]);
    deleteClips(p, new Set([cg.id]));
    expect(p.clips.find((c) => c.id === cb.id)!.attach).toBeNull();
    expect(p.clips.find((c) => c.id === cs.id)!.attach).toBeNull();
  });

  it('goes like any clip when it is deleted itself, and its label with it', () => {
    const { p, cf, cg, cb, cs, cb2 } = spanning();
    expect(ids(attachedClips(p, new Set([cb.id])))).toEqual([expect.any(String)]);
    expect(freedClips(p, new Set([cb.id]))).toEqual([]);
    // Deleted along with one of its clips: not freed, gone.
    expect(ids(freedClips(p, new Set([cf.id, cb.id])))).toEqual([cs.id]);
    deleteClips(p, new Set([cb.id]));
    expect(ids(p.clips)).toEqual([cf.id, cg.id, cs.id, cb2.id]);
    // Its object goes with its only clip; the label's is a formula, which the Creator keeps.
    expect(p.formulas.map((formula) => formula.name)).toEqual(['f', 'g', 'x', 'b2', 's1']);
  });

  it('is freed when a track goes with one of its clips', () => {
    const { p, cf, cb } = spanning();
    deleteTrack(p, cf.trackId);
    expect(p.clips.find((c) => c.id === cb.id)!.attach).toBeNull();
  });

  it('hangs, duplicated, on the copies of the clips copied along and on the others as they are', () => {
    const { p, cf, cg, cb } = spanning();
    const [alone] = duplicateClips(p, [cb]);
    expect(alone!.attach).toEqual(cb.attach);
    expect(alone!.attach).not.toBe(cb.attach);
    // With g: the copy spans the copy of g, and f itself.
    const [copyG, copyB] = duplicateClips(p, [cg, cb]);
    expect(copyB!.attach).toEqual({
      ...cb.attach,
      also: [{ clipId: copyG!.id, glyphs: [0] }],
    });
    // With both: the copies of both. The original is as it was.
    const [copyF, copyG2, copyB2] = duplicateClips(p, [cf, cg, cb]);
    expect(copyB2!.attach).toMatchObject({
      clipId: copyF!.id,
      also: [{ clipId: copyG2!.id, glyphs: [0] }],
    });
    expect(cb.attach).toMatchObject({ clipId: cf.id, also: [{ clipId: cg.id, glyphs: [0] }] });
  });
});

describe('a tween that carries a shape to other glyphs (D123)', () => {
  /** Formulas f and g; a box `s1` around f whose tweens carry it to g, then to f and g. */
  function carried() {
    const p = createEmptyProject();
    const [t1, t2] = p.tracks;
    p.tracks.push(createTrack('Track 3'));
    const f = createFormula({ name: 'f' });
    const g = createFormula({ name: 'g' });
    const s1 = createShapeFormula({ name: 's1' });
    p.formulas.push(f, g, s1);
    const cf = createClip(f.id, t1!.id, 0, 8);
    const cg = createClip(g.id, t2!.id, 0, 8);
    const toG = createFitTween(2, 1, { clipId: cg.id, glyphs: [0] });
    const toBoth = createFitTween(4, 1, { clipId: cf.id, glyphs: 'all' }, [
      { clipId: cg.id, glyphs: 'all' },
    ]);
    const plain = createTween(6, 0.5, { opacity: 0.5 });
    const cs = createClip(s1.id, p.tracks[2]!.id, 1, 8, {
      attach: createShapeAttach(cf.id, 'all'),
      actions: [toG, toBoth, plain],
    });
    p.clips.push(cf, cg, cs);
    return { p, cf, cg, cs, toG, toBoth, plain };
  }
  const actionIds = (clip: Clip) => clip.actions.map((a) => a.id);

  it('goes when the clip it carried its shape to is deleted; the shape and its other tweens stay', () => {
    const { p, cg, cs, toG, toBoth, plain } = carried();
    expect(fitsLosingTarget(cs, new Set([cg.id])).map((t) => t.id)).toEqual([toG.id, toBoth.id]);
    expect(fitsLosingTarget(cs, new Set(['other']))).toEqual([]);
    deleteClips(p, new Set([cg.id]));
    const shape = p.clips.find((c) => c.id === cs.id)!;
    expect(actionIds(shape)).toEqual([plain.id]);
    expect(shape.attach).toEqual(createShapeAttach(p.clips[0]!.id, 'all'));
  });

  it('goes with the shape when the clip the shape hangs on is deleted', () => {
    const { p, cf, cg } = carried();
    deleteClips(p, new Set([cf.id]));
    expect(p.clips.map((c) => c.id)).toEqual([cg.id]);
  });

  it('goes to the copies of its targets when they are duplicated with the shape', () => {
    const { p, cf, cg, cs } = carried();
    const copies = duplicateClips(p, [cf, cg, cs]);
    const [f2, g2, s2] = copies;
    const fits = s2!.actions.flatMap((a) => (a.kind === 'tween' && a.fit ? [a.fit] : []));
    expect(fits.map((fit) => fit.clipId)).toEqual([g2!.id, f2!.id]);
    expect(fits[1]!.also).toEqual([{ clipId: g2!.id, glyphs: 'all' }]);
    // Duplicated alone, it still goes to the clips the original went to.
    const [alone] = duplicateClips(p, [cs]);
    const first = alone!.actions[0]!;
    expect(first.kind === 'tween' && first.fit?.clipId).toBe(cg.id);
  });
});
