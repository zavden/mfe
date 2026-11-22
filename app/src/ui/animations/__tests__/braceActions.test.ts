// @vitest-environment node
/* Brace and label action adapters: the store edit, selection, editor opening and attachment
 * editing. Pure clip-window and intro cases live in attachmentCreation.test.ts. */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createTrack,
  defaultClipState,
  defaultIntro,
  defaultOutro,
  type Clip,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { useFormulaEditor } from '../../creator/formulaEditorStore';
import { usePreferences } from '../../preferences';
import {
  addBrace,
  addBraceLabel,
  describeAttachment,
  detachClip,
  isBraceClip,
  labelsOf,
  setAttachBuff,
  setBraceDirection,
  setBraceSharpness,
  setLabelBuff,
} from '../braceActions';

const project = () => useProjectStore.getState().project;
const undoSteps = () => useProjectStore.temporal.getState().pastStates.length;

describe('addBrace', () => {
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

  it('adds a brace object and its clip on the nearest free track above, attached, as one undo step', () => {
    const steps = undoSteps();
    const id = addBrace(ca.id, 'all', 180)!;
    const p = project();
    const brace = p.formulas[1]!;
    expect(brace).toMatchObject({ kind: 'brace', name: 'b1' });
    // No intro, whatever the preference: a brace is there when its clip starts.
    expect(brace.intro).toMatchObject({ kind: 'none', duration: 0 });
    const clip = p.clips.find((c) => c.id === id)!;
    expect(clip).toMatchObject({
      formulaId: brace.id,
      trackId: p.tracks[0]!.id, // the track above the target's
      start: 2,
      end: 6,
      intro: { kind: 'none', duration: 0 },
      outro: { kind: 'none' },
      attach: { clipId: ca.id, glyphs: 'all', rule: 'brace', direction: 180, buff: 0.2 },
    });
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [id] });
    expect(undoSteps()).toBe(steps + 1);
    expect(describeAttachment(p, clip)).toBe('Attached to f1 · all its glyphs');
    // A second one on some glyphs, named b2. The track above is taken now, and a brace never
    // goes behind its target: a new track right above the target's, though the one below is free.
    const second = addBrace(ca.id, [0, 1], 0)!;
    const p2 = project();
    expect(p2.formulas[2]!.name).toBe('b2');
    expect(p2.tracks).toHaveLength(4);
    expect(p2.tracks[2]!.id).toBe(ca.trackId);
    expect(p2.clips.find((c) => c.id === second)!.trackId).toBe(p2.tracks[1]!.id);
    expect(
      describeAttachment(
        p2,
        p2.clips.find((c) => c.id === second)!,
      ),
    ).toBe('Attached to f1 · glyphs 0, 1');
    // No track above with room: another new one above the target's.
    const third = addBrace(ca.id, [2], 90)!;
    const p3 = project();
    expect(p3.tracks).toHaveLength(5);
    expect(p3.clips.find((c) => c.id === third)!.trackId).toBe(p3.tracks[2]!.id);
    expect(p3.tracks[3]!.id).toBe(ca.trackId);
  });

  it('is refused for a clip that is gone', () => {
    expect(addBrace('nope', 'all', 0)).toBeNull();
  });

  it('uses the restored tracks when adding a brace cancels an active track gesture', () => {
    const before = project();
    const steps = undoSteps();
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.tracks.splice(1, 0, createTrack('Preview track'));
    });

    const id = addBrace(ca.id, 'all', 0)!;
    expect(gesture.active).toBe(false);
    expect(project().tracks).toEqual(before.tracks);
    expect(project().clips.find((c) => c.id === id)!.trackId).toBe(before.tracks[0]!.id);
    expect(undoSteps()).toBe(steps + 1);
    history.undo();
    expect(project()).toBe(before);
  });

  it('lasts as long as the clip a trim still held leaves, not as long as the trim showed', () => {
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.clips[0]!.end = 12;
    });
    const id = addBrace(ca.id, 'all', 180)!;
    expect(gesture.active).toBe(false);
    expect(project().clips.find((c) => c.id === ca.id)!.end).toBe(6);
    expect(project().clips.find((c) => c.id === id)).toMatchObject({ start: 2, end: 6 });
  });

  it('points, spaces and sharpens a brace, and detaches it where it is', () => {
    const id = addBrace(ca.id, 'all', 0)!;
    const braceId = project().formulas[1]!.id;
    setBraceDirection(id, 45);
    setAttachBuff(id, 0.35);
    setBraceSharpness(braceId, 1.2);
    let clip = project().clips.find((c) => c.id === id)!;
    expect(clip.attach).toMatchObject({ direction: 45, buff: 0.35 });
    expect(project().formulas[1]).toMatchObject({ sharpness: 1.2 });
    detachClip(id);
    clip = project().clips.find((c) => c.id === id)!;
    expect(clip.attach).toBeNull();
    expect(describeAttachment(project(), clip)).toBeNull();
    setBraceDirection(id, 90); // nothing to point any more
    expect(project().clips.find((c) => c.id === id)!.attach).toBeNull();
  });
});

describe('addBraceLabel', () => {
  let ca: Clip;
  beforeEach(() => {
    const p = createEmptyProject();
    const f = createFormula({ name: 'f1', source: 'a+b' });
    p.tracks = [createTrack('Track 2'), createTrack('Track 1')];
    ca = createClip(f.id, p.tracks[1]!.id, 0, 6, {
      intro: defaultIntro('write'),
      outro: defaultOutro('none'),
    });
    p.formulas.push(f);
    p.clips.push(ca);
    loadProject(p);
    useUiStore.getState().setTime(2);
    usePreferences.setState({ intro: { ...defaultIntro('write'), duration: 0.5 } });
    useFormulaEditor.getState().close();
  });

  it('adds an empty object at the tip of the brace, with its clip, as one undo step, and opens it', () => {
    const braceClip = addBrace(ca.id, 'all', 0)!;
    expect(isBraceClip(project(), braceClip)).toBe(true);
    expect(isBraceClip(project(), ca.id)).toBe(false);
    const steps = undoSteps();
    const id = addBraceLabel(braceClip, 'math')!;
    const p = project();
    const label = p.formulas.find((f) => f.id === p.clips.find((c) => c.id === id)!.formulaId)!;
    expect(label).toMatchObject({ kind: 'math', name: 'f2', source: '' });
    const clip = p.clips.find((c) => c.id === id)!;
    expect(clip).toMatchObject({
      start: 2,
      end: 6,
      intro: { kind: 'fade_in', duration: 0.5 },
      outro: { kind: 'none' },
      attach: { clipId: braceClip, glyphs: 'all', rule: 'tip', buff: null },
    });
    // The brace took the track above the formula; the label gets a new one above the brace's.
    expect(p.tracks).toHaveLength(3);
    expect(clip.trackId).toBe(p.tracks[0]!.id);
    expect(undoSteps()).toBe(steps + 1);
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [id] });
    expect(useFormulaEditor.getState().editing).toEqual({ id: label.id, isNew: true });
    expect(describeAttachment(p, clip)).toBe('At the tip of b1');
    expect(labelsOf(p, braceClip).map((c) => c.id)).toEqual([id]);
    // A LaTeX text is named as texts are.
    const text = addBraceLabel(braceClip, 'tex')!;
    const p2 = project();
    expect(
      p2.formulas.find((f) => f.id === p2.clips.find((c) => c.id === text)!.formulaId),
    ).toMatchObject({ kind: 'tex', name: 't1' });
    expect(labelsOf(p2, braceClip)).toHaveLength(2);
  });

  it('lasts as long as the brace a trim still held leaves', () => {
    const braceClip = addBrace(ca.id, 'all', 0)!;
    const gesture = history.beginGesture();
    gesture.update((draft) => {
      draft.clips.find((c) => c.id === braceClip)!.end = 12;
    });
    const id = addBraceLabel(braceClip, 'math')!;
    expect(gesture.active).toBe(false);
    expect(project().clips.find((c) => c.id === braceClip)!.end).toBe(6);
    expect(project().clips.find((c) => c.id === id)).toMatchObject({ start: 2, end: 6 });
  });

  it('leaves the brace and its label out of where their target’s object keeps its new clips', () => {
    // The target's object keeps a start position (D124): only the clips made of it take it.
    useProjectStore.getState().update((d) => {
      d.formulas[0]!.startPosition = [3, 2];
    });
    const braceClip = addBrace(ca.id, 'all', 0)!;
    const labelClip = addBraceLabel(braceClip, 'tex')!;
    const p = project();
    for (const id of [braceClip, labelClip]) {
      const clip = p.clips.find((c) => c.id === id)!;
      // Their place is derived from what they hang on, from Manim's state.
      expect(clip.initial).toEqual(defaultClipState());
      expect(clip.attach).not.toBeNull();
      expect('startPosition' in p.formulas.find((f) => f.id === clip.formulaId)!).toBe(false);
    }
  });

  it('is refused for a clip that is not a brace', () => {
    expect(addBraceLabel(ca.id, 'math')).toBeNull();
    expect(addBraceLabel('nope', 'math')).toBeNull();
    expect(project().clips).toHaveLength(1);
  });

  it("sets the gap of a label, or gives it Manim's back", () => {
    const braceClip = addBrace(ca.id, 'all', 0)!;
    const id = addBraceLabel(braceClip, 'math')!;
    setLabelBuff(id, 0.4);
    expect(project().clips.find((c) => c.id === id)!.attach).toMatchObject({ buff: 0.4 });
    setLabelBuff(id, null);
    expect(project().clips.find((c) => c.id === id)!.attach).toMatchObject({ buff: null });
    setLabelBuff(braceClip, null); // not a label: the brace keeps its gap
    expect(project().clips.find((c) => c.id === braceClip)!.attach).toMatchObject({ buff: 0.2 });
    setAttachBuff(id, 0.3); // the panel's number field
    expect(project().clips.find((c) => c.id === id)!.attach).toMatchObject({ buff: 0.3 });
  });
});
