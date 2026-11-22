// @vitest-environment node
/* Shapes on the timeline (shapeActions.ts): adding one on the nearest free track — above the
 * target, below for a highlight —, fitted by the sync afterwards; the presets; editing its shape,
 * style and corners. */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  type Clip,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { usePreferences } from '../../preferences';
import { describeAttachment, detachClip, setAttachBuff } from '../braceActions';
import {
  addShape,
  isShapeClip,
  setShapeCornerRadius,
  setShapeDiagonal,
  setShapeKind,
  setShapeStyle,
  SHAPE_CHOICE_LABELS,
  SHAPE_CHOICES,
  SHAPE_PRESETS,
} from '../shapeActions';

const project = () => useProjectStore.getState().project;
const undoSteps = () => useProjectStore.temporal.getState().pastStates.length;

describe('the shape presets', () => {
  it('offer the five shapes and a highlight: a box filled with no stroke, behind', () => {
    expect(SHAPE_CHOICES).toEqual([
      'box',
      'circle',
      'underline',
      'cross',
      'cross_line',
      'highlight',
    ]);
    expect(SHAPE_CHOICES.map((c) => SHAPE_CHOICE_LABELS[c])).toEqual([
      'Box',
      'Circle',
      'Underline',
      'Cross',
      'Cross line',
      'Highlight',
    ]);
    expect(SHAPE_PRESETS.box).toEqual({ shape: 'box', buff: 0.1, below: false });
    expect(SHAPE_PRESETS.cross.buff).toBe(0);
    // A cross line is a cross in everything but the count of its lines: no gap either.
    expect(SHAPE_PRESETS.cross_line).toEqual({ shape: 'cross_line', buff: 0, below: false });
    expect(SHAPE_PRESETS.highlight).toMatchObject({
      shape: 'box',
      style: { fillOpacity: 0.3, strokeWidth: 0, strokeOpacity: 0 },
      buff: 0,
      below: true,
    });
  });
});

describe('addShape', () => {
  let ca: Clip;
  beforeEach(() => {
    const p = createEmptyProject();
    const f = createFormula({ name: 'f1', source: 'a+b' });
    p.tracks = [createTrack('Track 3'), createTrack('Track 2'), createTrack('Track 1')];
    ca = createClip(f.id, p.tracks[1]!.id, 0, 6, {
      intro: defaultIntro('write'),
      outro: defaultOutro('none'),
    });
    p.formulas.push(f);
    p.clips.push(ca);
    loadProject(p);
    useUiStore.getState().setTime(2);
    usePreferences.setState({ intro: { ...defaultIntro('write'), duration: 1.5 } });
  });

  it('adds a shape object and its clip on the track above, attached, with no intro, as one undo step', () => {
    const steps = undoSteps();
    const id = addShape(ca.id, 'all', 'box')!;
    const p = project();
    const shape = p.formulas[1]!;
    expect(shape).toMatchObject({ kind: 'shape', name: 's1', shape: 'box', color: '#FFFF00' });
    // No intro, whatever the preference: a shape is there when its clip starts.
    expect(shape.intro).toMatchObject({ kind: 'none', duration: 0 });
    const clip = p.clips.find((c) => c.id === id)!;
    expect(clip).toMatchObject({
      formulaId: shape.id,
      trackId: p.tracks[0]!.id, // the track above the target's
      start: 2,
      end: 6,
      intro: { kind: 'none', duration: 0 },
      outro: { kind: 'none' },
      attach: { clipId: ca.id, glyphs: 'all', rule: 'shape', buff: 0.1 },
    });
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [id] });
    expect(undoSteps()).toBe(steps + 1);
    expect(describeAttachment(p, clip)).toBe('Attached to f1 · all its glyphs');
    expect(isShapeClip(p, id)).toBe(true);
    expect(isShapeClip(p, ca.id)).toBe(false);
    // A cross on some glyphs, at no gap, named s2. The track above is taken now, and it never
    // goes behind its target: a new track right above the target's, though the one below is free.
    const second = addShape(ca.id, [0, 1], 'cross')!;
    const p2 = project();
    expect(p2.formulas[2]).toMatchObject({ name: 's2', shape: 'cross', color: '#FC6255' });
    expect(p2.tracks).toHaveLength(4);
    expect(p2.tracks[2]!.id).toBe(ca.trackId);
    expect(p2.clips.find((c) => c.id === second)).toMatchObject({
      trackId: p2.tracks[1]!.id,
      attach: { glyphs: [0, 1], rule: 'shape', buff: 0 },
    });
    // Later on, the first track above has room again: no new track then.
    useUiStore.getState().setTime(2);
    useProjectStore.getState().update((draft) => {
      draft.clips.find((c) => c.id === second)!.end = 4;
      draft.clips.find((c) => c.id === ca.id)!.end = 9;
    });
    useUiStore.getState().setTime(7);
    const third = addShape(ca.id, [2], 'underline')!;
    const p3 = project();
    expect(p3.tracks).toHaveLength(4);
    expect(p3.clips.find((c) => c.id === third)).toMatchObject({
      trackId: p3.tracks[1]!.id,
      start: 7,
      end: 9,
    });
  });

  it('lasts as long as the clip a trim still held leaves, not as long as the trim showed', () => {
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.clips[0]!.end = 12;
    });
    const id = addShape(ca.id, 'all', 'box')!;
    expect(gesture.active).toBe(false);
    expect(project().clips.find((c) => c.id === ca.id)!.end).toBe(6);
    expect(project().clips.find((c) => c.id === id)).toMatchObject({ start: 2, end: 6 });
  });

  it('puts a highlight behind the glyphs: the track below first, a new one below when none has room', () => {
    const id = addShape(ca.id, 'all', 'highlight')!;
    const p = project();
    expect(p.formulas[1]).toMatchObject({
      shape: 'box',
      style: { fillOpacity: 0.3, strokeWidth: 0, strokeOpacity: 0 },
      color: '#FFFF00',
    });
    const clip = p.clips.find((c) => c.id === id)!;
    expect(clip.trackId).toBe(p.tracks[2]!.id); // below the target's
    expect(clip.intro.kind).toBe('none');
    expect(clip.attach).toMatchObject({ rule: 'shape', buff: 0 });
    // The track below is taken, and a highlight never goes in front of its target: a new track
    // right below the target's, though the one above is free.
    const second = addShape(ca.id, [0], 'highlight')!;
    const p2 = project();
    expect(p2.tracks).toHaveLength(4);
    expect(p2.tracks[1]!.id).toBe(ca.trackId);
    expect(p2.clips.find((c) => c.id === second)!.trackId).toBe(p2.tracks[2]!.id);
    // And again: every track below is taken.
    const third = addShape(ca.id, [1], 'highlight')!;
    const p3 = project();
    expect(p3.tracks).toHaveLength(5);
    expect(p3.tracks[1]!.id).toBe(ca.trackId);
    expect(p3.clips.find((c) => c.id === third)!.trackId).toBe(p3.tracks[2]!.id);
  });

  it('is refused for a clip that is gone', () => {
    expect(addShape('nope', 'all', 'box')).toBeNull();
  });

  it('edits the shape, its style, its corners and its gap, and detaches it where it is', () => {
    const id = addShape(ca.id, 'all', 'box')!;
    const shapeId = project().formulas[1]!.id;
    setShapeKind(shapeId, 'circle');
    setShapeStyle(shapeId, { strokeWidth: 2 });
    setShapeStyle(shapeId, { fillOpacity: 0.5 });
    setShapeCornerRadius(shapeId, 0.25);
    setAttachBuff(id, 0.35);
    expect(project().formulas[1]).toMatchObject({
      shape: 'circle',
      style: { fillOpacity: 0.5, strokeWidth: 2, strokeOpacity: 1 },
      cornerRadius: 0.25,
    });
    expect(project().clips.find((c) => c.id === id)!.attach).toMatchObject({ buff: 0.35 });
    setShapeCornerRadius(shapeId, -1); // never negative
    expect(project().formulas[1]).toMatchObject({ cornerRadius: 0 });
    setShapeKind(ca.formulaId, 'cross'); // not a shape: nothing happens
    expect(project().formulas[0]!.kind).toBe('math');
    // A cross line's diagonal: the falling one is kept, the rising one is the absence of the
    // field, and a shape that is no cross line keeps none. One undo step each.
    setShapeDiagonal(shapeId, 'ul_dr'); // a circle has none
    expect(project().formulas[1]).not.toHaveProperty('diagonal');
    setShapeKind(shapeId, 'cross_line');
    const steps = undoSteps();
    setShapeDiagonal(shapeId, 'ul_dr');
    expect(project().formulas[1]).toMatchObject({ shape: 'cross_line', diagonal: 'ul_dr' });
    expect(undoSteps()).toBe(steps + 1);
    setShapeDiagonal(shapeId, 'dl_ur');
    expect(project().formulas[1]).not.toHaveProperty('diagonal');
    setShapeDiagonal(shapeId, 'ul_dr');
    setShapeKind(shapeId, 'cross');
    expect(project().formulas[1]).toMatchObject({ shape: 'cross' });
    expect(project().formulas[1]).not.toHaveProperty('diagonal');
    detachClip(id);
    const clip = project().clips.find((c) => c.id === id)!;
    expect(clip.attach).toBeNull();
    expect(describeAttachment(project(), clip)).toBeNull();
  });
});
