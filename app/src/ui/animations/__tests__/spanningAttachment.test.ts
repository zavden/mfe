// @vitest-environment node
/* A brace or a shape made over glyphs of several clips (D117): when its clip runs, which track it
 * goes on, how it is named and described (attachmentCreation.ts, attachNames.ts, braceActions.ts,
 * shapeActions.ts). */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAttach,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createEmptyProject,
  createFormula,
  createShapeFormula,
  createTipAttach,
  createTrack,
  defaultIntro,
  defaultOutro,
  type Clip,
  type Project,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { usePreferences } from '../../preferences';
import { attachHosts, listNames } from '../attachNames';
import { attachedWindowOver, planSpanningBrace, planSpanningShape } from '../attachmentCreation';
import { addBrace, addBraceOverClips, describeAttachment } from '../braceActions';
import { addShape, addShapeOverClips } from '../shapeActions';

const project = () => useProjectStore.getState().project;
const undoSteps = () => useProjectStore.temporal.getState().pastStates.length;
const trackOf = (clip: Clip) => project().tracks.find((t) => t.id === clip.trackId)!.name;

describe('listNames', () => {
  it('lists one, two or more names as a sentence does', () => {
    expect(listNames([])).toBe('');
    expect(listNames(['f1'])).toBe('f1');
    expect(listNames(['f1', 'f2'])).toBe('f1 and f2');
    expect(listNames(['f1', 'f2', 't1'])).toBe('f1, f2 and t1');
  });
});

describe('attachedWindowOver', () => {
  const write = defaultIntro('write'); // 1 s
  it('is the target’s own window for one target', () => {
    expect(attachedWindowOver([{ start: 2, end: 8, intro: write }], 5)).toEqual({
      start: 5,
      end: 8,
    });
    expect(attachedWindowOver([{ start: 2, end: 2.95, intro: write }], 2.5)).toEqual({
      start: 2.85,
      end: 2.95,
    });
  });

  it('runs where the windows of all the targets meet: the last start, the first end', () => {
    const early = { start: 0, end: 6, intro: write };
    const late = { start: 2, end: 9, intro: write };
    // The playhead is past both intros: from it to the first end.
    expect(attachedWindowOver([early, late], 4)).toEqual({ start: 4, end: 6 });
    // Inside the second one's intro: once that one is quiet.
    expect(attachedWindowOver([early, late], 2.5)).toEqual({ start: 3, end: 6 });
    expect(attachedWindowOver([late, early], 2.5)).toEqual({ start: 3, end: 6 });
  });

  it('keeps the shortest clip at the first end when the windows do not meet', () => {
    const first = { start: 0, end: 3, intro: write };
    const second = { start: 2.5, end: 9, intro: write }; // quiet from 3.5 s: the first is gone
    expect(attachedWindowOver([first, second], 2.8)).toEqual({ start: 2.9, end: 3 });
  });
});

describe('a brace and a shape added over glyphs of two clips', () => {
  let cf: Clip;
  let cg: Clip;
  beforeEach(() => {
    const p = createEmptyProject();
    const f = createFormula({ name: 'f1', source: 'a+b' });
    const g = createFormula({ name: 'f2', source: 'c=d' });
    p.tracks = ['Track 4', 'Track 3', 'Track 2', 'Track 1'].map((name) => createTrack(name));
    // f1 on Track 3 over [0, 6), written in 1 s; f2 behind it, on Track 2, over [1, 8).
    cf = createClip(f.id, p.tracks[1]!.id, 0, 6, {
      intro: defaultIntro('write'),
      outro: defaultOutro('none'),
    });
    cg = createClip(g.id, p.tracks[2]!.id, 1, 8, {
      intro: defaultIntro('fade_in'),
      outro: defaultOutro('none'),
    });
    p.formulas.push(f, g);
    p.clips.push(cf, cg);
    loadProject(p);
    useUiStore.getState().setTime(3);
    usePreferences.setState({ intro: { ...defaultIntro('write'), duration: 1 } });
  });

  it('adds one brace attached to both, in front of both, while both are there; one undo step', () => {
    const steps = undoSteps();
    const id = addBrace(cg.id, [0, 1], 0, [{ clipId: cf.id, glyphs: 'all' }])!;
    const brace = project().clips.find((c) => c.id === id)!;
    expect(brace.attach).toEqual({
      clipId: cg.id,
      glyphs: [0, 1],
      rule: 'brace',
      direction: 0,
      buff: 0.2,
      also: [{ clipId: cf.id, glyphs: 'all' }],
    });
    // From the playhead to the first of the two ends; above the track of the one in front.
    expect([brace.start, brace.end]).toEqual([3, 6]);
    expect(trackOf(brace)).toBe('Track 4');
    expect(project().formulas.at(-1)).toMatchObject({ kind: 'brace', name: 'b1' });
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [id] });
    expect(undoSteps()).toBe(steps + 1);
    expect(describeAttachment(project(), brace)).toBe(
      'Attached to f2 · glyphs 0, 1 and f1 · all its glyphs',
    );
    expect(attachHosts(project(), brace.attach!)).toEqual(['f2', 'f1']);
    history.undo();
    expect(project().clips).toHaveLength(2);
  });

  it('adds one shape attached to both, and a highlight behind the one at the back', () => {
    const box = addShape(cf.id, [0], 'box', [{ clipId: cg.id, glyphs: [2] }])!;
    const clip = project().clips.find((c) => c.id === box)!;
    expect(clip.attach).toEqual({
      clipId: cf.id,
      glyphs: [0],
      rule: 'shape',
      buff: 0.1,
      also: [{ clipId: cg.id, glyphs: [2] }],
    });
    expect(trackOf(clip)).toBe('Track 4');
    const highlight = addShape(cf.id, 'all', 'highlight', [{ clipId: cg.id, glyphs: 'all' }])!;
    // Behind every glyph it spans: below the track of the clip at the back.
    expect(trackOf(project().clips.find((c) => c.id === highlight)!)).toBe('Track 1');
  });

  it('is refused when one of the clips is gone', () => {
    const steps = undoSteps();
    expect(addBrace(cf.id, 'all', 0, [{ clipId: 'gone', glyphs: 'all' }])).toBeNull();
    expect(addShape(cf.id, 'all', 'box', [{ clipId: 'gone', glyphs: 'all' }])).toBeNull();
    expect(undoSteps()).toBe(steps);
  });
});

describe('a brace on a shape, and one brace over several whole clips (D123)', () => {
  let cf: Clip;
  let cg: Clip;
  let cs: Clip;
  let cb: Clip;
  let late: Clip;
  beforeEach(() => {
    const p = createEmptyProject();
    const f = createFormula({ name: 'f1', source: 'a+b' });
    const g = createFormula({ name: 'f2', source: 'c=d' });
    const s = createShapeFormula({ name: 's1' });
    const b = createBraceFormula({ name: 'b1' });
    p.tracks = ['Track 5', 'Track 4', 'Track 3', 'Track 2', 'Track 1'].map((n) => createTrack(n));
    const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    // f1 on Track 3 over [0, 6), written in 1 s; f2 on Track 2 over [1, 8), and again, late,
    // over [9, 12); a box around f1 on Track 4 over [2, 7); a brace under f1 on Track 1.
    cf = createClip(f.id, p.tracks[2]!.id, 0, 6, { ...none, intro: defaultIntro('write') });
    cg = createClip(g.id, p.tracks[3]!.id, 1, 8, none);
    late = createClip(g.id, p.tracks[3]!.id, 9, 12, none);
    cs = createClip(s.id, p.tracks[1]!.id, 2, 7, none);
    cb = createClip(b.id, p.tracks[4]!.id, 2, 6, {
      ...none,
      attach: createBraceAttach(cf.id, 'all'),
    });
    p.formulas.push(f, g, s, b);
    p.clips.push(cf, cg, late, cs, cb);
    loadProject(p);
    useUiStore.getState().setTime(3);
    usePreferences.setState({ intro: { ...defaultIntro('write'), duration: 1 } });
  });

  it('a shape takes a brace on the whole of it, from the playhead to its end, on the track above', () => {
    const steps = undoSteps();
    const id = addBrace(cs.id, 'all', 0)!;
    const brace = project().clips.find((c) => c.id === id)!;
    expect(brace.attach).toEqual({
      clipId: cs.id,
      glyphs: 'all',
      rule: 'brace',
      direction: 0,
      buff: 0.2,
    });
    expect([brace.start, brace.end]).toEqual([3, 7]);
    expect(trackOf(brace)).toBe('Track 5');
    expect(undoSteps()).toBe(steps + 1);
    // A shape is one piece: it is named alone.
    expect(describeAttachment(project(), brace)).toBe('Attached to s1');
  });

  it('plans one brace over the selected clips, the first as its target and the others beside', () => {
    expect(planSpanningBrace(project(), [cs.id, cf.id, cg.id], 3)).toEqual({
      ok: true,
      clipId: cs.id,
      also: [
        { clipId: cf.id, glyphs: 'all' },
        { clipId: cg.id, glyphs: 'all' },
      ],
    });
    // Formulas alone, as shapes alone or mixed with them.
    expect(planSpanningBrace(project(), [cg.id, cf.id], 3)).toMatchObject({
      ok: true,
      clipId: cg.id,
    });
  });

  it('plans none for one clip, for clips that are gone, or with a brace among them', () => {
    expect(planSpanningBrace(project(), [cs.id], 3)).toBeNull();
    expect(planSpanningBrace(project(), [cs.id, 'gone'], 3)).toBeNull();
    expect(planSpanningBrace(project(), [], 3)).toBeNull();
    // A brace is never braced, alone or within a selection.
    expect(planSpanningBrace(project(), [cs.id, cf.id, cb.id], 3)).toBeNull();
  });

  it('refuses clips that are never on screen together, and says so', () => {
    expect(planSpanningBrace(project(), [cf.id, late.id], 3)).toEqual({
      ok: false,
      reason: 'The selected clips are never on screen together.',
    });
    expect(addBraceOverClips([cf.id, late.id], 0)).toBeNull();
    expect(project().clips).toHaveLength(5);
  });

  it('adds it over them all while they are all there, in front of them all; one undo step', () => {
    const steps = undoSteps();
    const id = addBraceOverClips([cs.id, cf.id, cg.id], 180)!;
    const brace = project().clips.find((c) => c.id === id)!;
    expect(brace.attach).toEqual({
      clipId: cs.id,
      glyphs: 'all',
      rule: 'brace',
      direction: 180,
      buff: 0.2,
      also: [
        { clipId: cf.id, glyphs: 'all' },
        { clipId: cg.id, glyphs: 'all' },
      ],
    });
    // From the playhead to the first of their ends; above the track of the one in front.
    expect([brace.start, brace.end]).toEqual([3, 6]);
    expect(trackOf(brace)).toBe('Track 5');
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [id] });
    expect(undoSteps()).toBe(steps + 1);
    expect(describeAttachment(project(), brace)).toBe(
      'Attached to s1, f1 · all its glyphs and f2 · all its glyphs',
    );
    // With a brace among them there is nothing to add.
    expect(addBraceOverClips([cs.id, cb.id], 0)).toBeNull();
    expect(undoSteps()).toBe(steps + 1);
  });
});

describe('one shape around several whole clips', () => {
  let cf: Clip;
  let cg: Clip;
  let cs: Clip;
  let cb: Clip;
  let late: Clip;
  beforeEach(() => {
    const p = createEmptyProject();
    const f = createFormula({ name: 'f1', source: 'a+b' });
    const g = createFormula({ name: 'f2', source: 'c=d' });
    const s = createShapeFormula({ name: 's1' });
    const b = createBraceFormula({ name: 'b1' });
    p.tracks = ['Track 5', 'Track 4', 'Track 3', 'Track 2', 'Track 1'].map((n) => createTrack(n));
    const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    // f1 on Track 3 over [0, 6), written in 1 s; f2 on Track 2 over [1, 8), and again, late,
    // over [9, 12); a box around f1 on Track 4 over [2, 7); a brace under f1 on Track 1.
    cf = createClip(f.id, p.tracks[2]!.id, 0, 6, { ...none, intro: defaultIntro('write') });
    cg = createClip(g.id, p.tracks[3]!.id, 1, 8, none);
    late = createClip(g.id, p.tracks[3]!.id, 9, 12, none);
    cs = createClip(s.id, p.tracks[1]!.id, 2, 7, none);
    cb = createClip(b.id, p.tracks[4]!.id, 2, 6, {
      ...none,
      attach: createBraceAttach(cf.id, 'all'),
    });
    p.formulas.push(f, g, s, b);
    p.clips.push(cf, cg, late, cs, cb);
    loadProject(p);
    useUiStore.getState().setTime(3);
    usePreferences.setState({ intro: { ...defaultIntro('write'), duration: 1 } });
  });

  it('plans one shape around the selected clips, the first as its target and the others beside', () => {
    expect(planSpanningShape(project(), [cg.id, cf.id], 3)).toEqual({
      ok: true,
      clipId: cg.id,
      also: [{ clipId: cf.id, glyphs: 'all' }],
    });
  });

  it('plans none for one clip, for clips that are gone, or with a brace or a shape among them', () => {
    expect(planSpanningShape(project(), [cf.id], 3)).toBeNull();
    expect(planSpanningShape(project(), [cf.id, 'gone'], 3)).toBeNull();
    expect(planSpanningShape(project(), [], 3)).toBeNull();
    // A shape goes around formulas and texts: no menu puts one on a brace or on a shape.
    expect(planSpanningShape(project(), [cf.id, cg.id, cb.id], 3)).toBeNull();
    expect(planSpanningShape(project(), [cf.id, cg.id, cs.id], 3)).toBeNull();
  });

  it('refuses clips that are never on screen together, and says so', () => {
    expect(planSpanningShape(project(), [cf.id, late.id], 3)).toEqual({
      ok: false,
      reason: 'The selected clips are never on screen together.',
    });
    expect(addShapeOverClips([cf.id, late.id], 'box')).toBeNull();
    expect(project().clips).toHaveLength(5);
  });

  it('adds it around them all while they are all there, in front of them all; one undo step', () => {
    const steps = undoSteps();
    const id = addShapeOverClips([cg.id, cf.id], 'box')!;
    const shape = project().clips.find((c) => c.id === id)!;
    expect(shape.attach).toEqual({
      clipId: cg.id,
      glyphs: 'all',
      rule: 'shape',
      buff: 0.1,
      also: [{ clipId: cf.id, glyphs: 'all' }],
    });
    expect(project().formulas.at(-1)).toMatchObject({ kind: 'shape', shape: 'box', name: 's2' });
    // From the playhead to the first of their ends; above the track of the one in front (Track 4
    // is taken there by the box around f1).
    expect([shape.start, shape.end]).toEqual([3, 6]);
    expect(trackOf(shape)).toBe('Track 5');
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [id] });
    expect(undoSteps()).toBe(steps + 1);
    expect(describeAttachment(project(), shape)).toBe(
      'Attached to f2 · all its glyphs and f1 · all its glyphs',
    );
    history.undo();
    expect(project().clips).toHaveLength(5);
    // With a brace or a shape among them there is nothing to add.
    expect(addShapeOverClips([cf.id, cb.id], 'box')).toBeNull();
    expect(addShapeOverClips([cf.id, cs.id], 'circle')).toBeNull();
    expect(project().clips).toHaveLength(5);
  });

  it('puts a highlight behind them all: under the track of the one at the back', () => {
    // Track 1, under f2's, is free once the brace is gone.
    useProjectStore.getState().update((draft) => {
      draft.clips = draft.clips.filter((clip) => clip.id !== cb.id);
    });
    const id = addShapeOverClips([cf.id, cg.id], 'highlight')!;
    const highlight = project().clips.find((c) => c.id === id)!;
    expect(highlight.attach).toMatchObject({
      clipId: cf.id,
      also: [{ clipId: cg.id, glyphs: 'all' }],
    });
    expect(trackOf(highlight)).toBe('Track 1');
  });
});

describe('what an attachment hangs on, in words', () => {
  const scene = (): { p: Project; ids: string[] } => {
    const p = createEmptyProject();
    const names = ['f1', 'f2', 'f1'];
    const formulas = [createFormula({ name: 'f1' }), createFormula({ name: 'f2' })];
    p.formulas.push(...formulas);
    const clips = names.map((name, i) =>
      createClip(formulas.find((f) => f.name === name)!.id, p.tracks[0]!.id, i * 2, i * 2 + 2),
    );
    p.clips.push(...clips);
    return { p, ids: clips.map((c) => c.id) };
  };

  it('names each object once, in the order of the attachment', () => {
    const { p, ids } = scene();
    const also = [
      { clipId: ids[0]!, glyphs: [1] },
      { clipId: ids[2]!, glyphs: [0] },
    ];
    expect(attachHosts(p, createBraceAttach(ids[1]!, 'all', { also }))).toEqual(['f2', 'f1']);
    expect(attachHosts(p, createAttach(ids[0]!, [0]))).toEqual(['f1']);
    expect(attachHosts(p, createTipAttach('nope'))).toEqual(['?']);
  });
});
