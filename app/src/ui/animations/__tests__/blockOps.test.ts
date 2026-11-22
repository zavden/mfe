// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createBraceFormula,
  createLineFormula,
  createClip,
  createDisappear,
  createEmphasis,
  createFitTween,
  createMorph,
  createPartTransform,
  createRelation,
  createShapeFormula,
  createTween,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Clip,
  type ClipAction,
  type GlyphPair,
  type Project,
} from '../../../model';
import { suggestMorphPairs } from '../../morph/morphDraft';
import {
  blockLabel,
  blockSubject,
  blockTitle,
  carriesShape,
  clipSubject,
  glyphCount,
} from '../blockKinds';
import {
  addTimeLabel,
  clipMenuTime,
  convertBlock,
  convertEmphasis,
  noRoomReason,
  planCopy,
  planKindChange,
  planNewBlock,
  planParallelCopy,
  playheadBlockNote,
  type NewBlock,
} from '../blockOps';
import { derivationScene, oneClipScene } from './fixtures';

function scene(actions: ClipAction[] = [], fields: Partial<Clip> = {}) {
  return oneClipScene({ glyphs: 4, start: 2, end: 12, actions, fields });
}

describe('emphasis blocks', () => {
  it("a new one takes every glyph on screen at Manim's defaults, and a conversion keeps its time and glyphs", () => {
    const { project, clip } = scene();
    const plan = planNewBlock(project, clip.id, { kind: 'emphasis', effect: 'indicate' }, 4);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.action).toMatchObject({
      kind: 'emphasis',
      effect: 'indicate',
      glyphs: 'all',
      start: 2,
      duration: 1,
      easing: 'there_and_back',
      color: '#FFFF00',
      scale: 1.2,
    });
    expect(blockLabel(plan.action)).toBe('Indicate');
    const focus = convertEmphasis(
      createEmphasis(1, 'indicate', [0, 1], { duration: 0.6, color: '#FF0000', scale: 2 }),
      'focus_on',
    );
    expect(focus).toMatchObject({
      effect: 'focus_on',
      start: 1,
      duration: 0.6,
      glyphs: [0, 1],
      easing: 'smooth',
      color: '#888888',
      opacity: 0.2,
      scale: 1.2,
    });
    expect(blockLabel(focus)).toBe('FocusOn · 2');
    const same = createEmphasis(1, 'wiggle', 'all');
    expect(convertEmphasis(same, 'wiggle')).toBe(same);
  });
});

describe('block labels', () => {
  it('names the animation, and the glyph count only for an explicit list', () => {
    expect(blockLabel(createAppear(0, 'write', [1, 2]))).toBe('Write · 2');
    expect(blockLabel(createAppear(0, 'draw_border_then_fill', 'all'))).toBe('DrawBorderThenFill');
    expect(blockLabel(createDisappear(0, 'shrink_to_center', [0]))).toBe('ShrinkToCenter · 1');
    expect(blockLabel(createTween(0, 1, {}))).toBe('Transform');
    expect(glyphCount(createTween(0, 1, {}))).toBeUndefined();
    expect(blockTitle(createAppear(1, 'write', [3]), 2)).toBe(
      'Write (1 glyph)\n3.00 s → 4.00 s · 1.00 s',
    );
  });

  it('says a Transform is of the whole formula, and just Transform on a brace or a shape', () => {
    const tween = createTween(1, 1, {});
    expect(blockTitle(tween, 2)).toBe('Transform (whole formula)\n3.00 s → 4.00 s · 1.00 s');
    for (const subject of ['brace', 'shape'] as const) {
      expect(blockTitle(tween, 2, subject)).toBe('Transform\n3.00 s → 4.00 s · 1.00 s');
      // A part that a saved project has there still names its glyphs.
      expect(blockTitle(createPartTransform(1, [0]), 2, subject)).toBe(
        'Transform (1 glyph)\n3.00 s → 4.00 s · 1.00 s',
      );
    }
  });
});

describe('a Transform that carries its shape elsewhere', () => {
  it('ends its label in an arrow, and its tooltip says where to', () => {
    const fit = createFitTween(1, 1, { clipId: 'c2', glyphs: 'all' });
    expect(carriesShape(fit)).toBe(true);
    expect(carriesShape(createTween(1, 1, {}))).toBe(false);
    expect(blockLabel(fit)).toBe('Transform →');
    expect(blockTitle(fit, 2, 'shape', 'f2 and f1')).toBe(
      'Transform to f2 and f1\n3.00 s → 4.00 s · 1.00 s',
    );
    expect(blockTitle(fit, 2, 'shape')).toBe('Transform to other glyphs\n3.00 s → 4.00 s · 1.00 s');
  });
});

/** The scene with its object turned into a brace, a shape or a line: one piece, without parts. */
function onePieceScene(kind: 'brace' | 'shape' | 'line', actions: ClipAction[] = []) {
  const made = scene(actions);
  const object =
    kind === 'brace'
      ? createBraceFormula({ name: 'o' })
      : kind === 'line'
        ? createLineFormula({ name: 'o' })
        : createShapeFormula();
  made.project.formulas[0] = { ...object, id: made.formula.id };
  return made;
}

describe('a brace and a shape are one piece (D123)', () => {
  it('tells them from formulas and texts', () => {
    expect(blockSubject('brace')).toBe('brace');
    expect(blockSubject('shape')).toBe('shape');
    expect(blockSubject('line')).toBe('line');
    for (const kind of ['math', 'tex', 'text', undefined] as const) {
      expect(blockSubject(kind)).toBe('formula');
    }
    const { project, clip } = onePieceScene('shape');
    expect(clipSubject(project, clip)).toBe('shape');
    expect(clipSubject(project, undefined)).toBe('formula');
  });

  it.each(['brace', 'shape', 'line'] as const)(
    'a %s takes a Transform, but no transform of a part and no morph',
    (kind) => {
      const { project, clip } = onePieceScene(kind);
      const tween = planNewBlock(project, clip.id, { kind: 'tween' }, 4);
      expect(tween.ok && tween.action).toMatchObject({ kind: 'tween', start: 2, duration: 1 });
      for (const spec of [{ kind: 'transform' }, { kind: 'morph' }] as const) {
        const refused = planNewBlock(project, clip.id, spec, 4);
        expect(!refused.ok && refused.reason).toBe(
          `A ${kind} is one piece, without parts to animate apart: use Transform.`,
        );
      }
      // The other families are its own too.
      expect(planNewBlock(project, clip.id, { kind: 'appear', anim: 'fade_in' }, 4).ok).toBe(true);
    },
  );

  it('its Transform does not turn into one of a part; a part it has turns into a Transform', () => {
    const tween = createTween(3, 1, {});
    const part = createPartTransform(6, [0], { duration: 0.5 });
    const { project, clip } = onePieceScene('shape', [tween, part]);
    const refused = planKindChange(project, clip.id, tween.id, 'transform');
    expect(!refused.ok && refused.reason).toContain('A shape is one piece');
    const whole = planKindChange(project, clip.id, part.id, 'tween');
    expect(whole.ok && whole.action).toMatchObject({ id: part.id, kind: 'tween', start: 6 });
  });
});

describe('planNewBlock', () => {
  it('starts at the asked time with the default duration and every glyph', () => {
    const { project, clip } = scene();
    const plan = planNewBlock(
      project,
      clip.id,
      { kind: 'appear', anim: 'draw_border_then_fill' },
      5,
    );
    expect(plan.ok && plan.action).toMatchObject({
      kind: 'appear',
      anim: 'draw_border_then_fill',
      glyphs: 'all',
      start: 3, // relative to the clip, which starts at 2
      duration: 2,
      easing: 'double_smooth',
    });
  });

  it('takes the clip state at its start for a keyframe', () => {
    const { project, clip } = scene([], {
      initial: { ...createClip('x', 'y', 0, 1).initial, position: [3, 1], rotation: 40 },
    });
    const plan = planNewBlock(project, clip.id, { kind: 'tween' }, 6);
    expect(plan.ok && plan.action).toMatchObject({
      kind: 'tween',
      start: 4,
      duration: 1,
      to: { position: [3, 1], rotation: 40, scale: 1, opacity: 1 },
    });
  });

  it('is shortened to the room there is, and refused with a reason when there is none', () => {
    const { project, clip } = scene([createTween(1, 8.5, { rotation: 5 })]); // [3, 11.5]
    const plan = planNewBlock(project, clip.id, { kind: 'tween' }, 2.5);
    expect(plan.ok && plan.action.start).toBeCloseTo(0.5, 6);
    expect(plan.ok && plan.action.duration).toBeCloseTo(0.5, 2);
    const full = scene([createTween(0, 10, {})]);
    const refused = planNewBlock(full.project, full.clip.id, { kind: 'tween' }, 5);
    expect(refused).toEqual({ ok: false, reason: noRoomReason(createTween(0, 1, {})) });
    expect(planNewBlock(project, 'missing', { kind: 'tween' }, 5).ok).toBe(false);
  });

  it('never makes a project with errors', () => {
    const { project, clip } = scene([createDisappear(2, 'fade_out', [1], { duration: 3 })]);
    for (const at of [2.5, 3, 6, 11.9]) {
      const plan = planNewBlock(project, clip.id, { kind: 'appear', anim: 'write' }, at);
      if (!plan.ok) continue;
      const next: Project = {
        ...project,
        clips: [{ ...clip, actions: [...clip.actions, plan.action] }],
      };
      expect(validateProject(next).filter((i) => i.severity === 'error')).toEqual([]);
    }
  });
});

describe('planNewBlock alongside other blocks', () => {
  /* Five glyphs, 1–3 hidden at the start, on a 2–12 s clip with a Write of glyph 1 over [3, 5). */
  function parallelScene(writeGlyphs: 'all' | number[] = [1]) {
    return oneClipScene({
      glyphs: 5,
      start: 2,
      end: 12,
      hiddenGlyphs: [1, 2, 3],
      actions: [createAppear(1, 'write', writeGlyphs, { duration: 2 })],
    });
  }

  it('stores the glyphs an Appear of every glyph animates where it lands alongside', () => {
    const { project, clip } = parallelScene();
    const plan = planNewBlock(project, clip.id, { kind: 'appear', anim: 'create' }, 3.5);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.action).toMatchObject({ kind: 'appear', anim: 'create', start: 1.5 });
    expect(plan.action.kind === 'appear' && plan.action.glyphs).toEqual([2, 3]);
    expect(plan.note).toBeUndefined();
  });

  it("keeps 'all' and says so when nothing is left for it alongside", () => {
    const { project, clip } = parallelScene('all');
    const plan = planNewBlock(project, clip.id, { kind: 'appear', anim: 'create' }, 3.5);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.action.kind === 'appear' && plan.action.glyphs).toBe('all');
    expect(plan.action.start).toBeCloseTo(1.5, 6);
    expect(plan.note?.message).toContain('the Write block at 3.00 s');
  });

  it("keeps 'all' for a block that runs alone", () => {
    const { project, clip } = parallelScene();
    const plan = planNewBlock(project, clip.id, { kind: 'appear', anim: 'create' }, 7);
    expect(plan.ok && plan.action.kind === 'appear' && plan.action.glyphs).toBe('all');
  });
});

describe('a new Appear beside a block of every glyph (audit A8-02)', () => {
  /** `f` (four glyphs) on [2, 12] and a second clip of it on [2, 12] on the other track; a
   * relation turns glyph 1 of the first into glyph 1 of the second over [4, 5), and glyph 3 of
   * the second into glyph 3 of the first over [6, 7); a Circumscribe of every glyph of the first
   * runs over [8, 9). */
  function scene() {
    const made = oneClipScene({ glyphs: 4, start: 2, end: 12 });
    const { project, clip, formula } = made;
    const other = createClip(formula.id, project.tracks[1]!.id, 2, 12, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    project.clips.push(other);
    other.startHidden = [1];
    clip.startHidden = [3];
    project.relations.push(
      createRelation(clip.id, other.id, {
        offset: 2,
        duration: 1,
        pairs: [{ from: [1], to: [1], style: null }],
      }),
      createRelation(other.id, clip.id, {
        offset: 4,
        duration: 1,
        pairs: [{ from: [3], to: [3], style: null }],
      }),
    );
    clip.actions.push(createEmphasis(6, 'circumscribe', 'all'));
    expect(validateProject(project).filter((i) => i.severity === 'error')).toEqual([]);
    return made;
  }

  it('leaves out a glyph a relation consumed: the block is not in error', () => {
    // At 8.5 s glyph 1 is gone for good and 0, 2, 3 are on screen: nothing is left alongside.
    const { project, clip } = scene();
    const plan = planNewBlock(project, clip.id, { kind: 'appear', anim: 'write' }, 8.5);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.action.kind === 'appear' && plan.action.glyphs).toBe('all');
    expect(plan.note?.title).toBe('Nothing left to animate alongside');
    const placed = structuredClone(project);
    placed.clips[0]!.actions.push(plan.action);
    expect(validateProject(placed).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('leaves out a glyph a relation brings later', () => {
    // The second relation moved to [10, 11): glyph 3 comes in after a Circumscribe over
    // [8.5, 9.5) and a new Appear beside it at 9 s, which an Appear of every glyph skips.
    const { project, clip } = scene();
    project.relations[1]!.offset = 8;
    clip.actions[0]!.start = 6.5;
    expect(validateProject(project).filter((i) => i.severity === 'error')).toEqual([]);
    const plan = planNewBlock(project, clip.id, { kind: 'appear', anim: 'write' }, 9);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.action.kind === 'appear' && plan.action.glyphs).toBe('all');
    expect(plan.note?.title).toBe('Nothing left to animate alongside');
  });
});

describe('a block of an arrow takes all of it (audit A5-07)', () => {
  /** Two glyphs on a 2–12 s clip with a FadeOut of the second over [3, 5) — as a file may have it
   * — and an Appear of it again at 8 s; as a formula, or as an arrow, its shaft and its tip. */
  function tipScene(arrow: boolean) {
    const fade = createDisappear(1, 'fade_out', [1], { duration: 2 });
    const back = createAppear(6, 'fade_in', [1]);
    const made = oneClipScene({ glyphs: 2, start: 2, end: 12, actions: [fade, back] });
    if (arrow) {
      const line = createLineFormula({
        name: 'l1',
        line: 'arrow',
        snapshot: made.formula.snapshot,
      });
      made.project.formulas[0] = { ...line, id: made.formula.id };
    }
    return { ...made, fade, back };
  }

  it('a new Disappear alongside another block keeps every glyph', () => {
    // Of a formula it takes what is left on screen there, glyph 0; of an arrow, all of it.
    const formula = tipScene(false);
    const plan = planNewBlock(
      formula.project,
      formula.clip.id,
      { kind: 'disappear', anim: 'uncreate' },
      4,
    );
    expect(plan.ok && plan.action).toMatchObject({ kind: 'disappear', start: 2, glyphs: [0] });
    const arrow = tipScene(true);
    const whole = planNewBlock(
      arrow.project,
      arrow.clip.id,
      { kind: 'disappear', anim: 'uncreate' },
      4,
    );
    if (!whole.ok) throw new Error(whole.reason);
    expect(whole.action.kind === 'disappear' && whole.action.glyphs).toBe('all');
    expect(whole.note).toBeUndefined();
  });

  it('is not copied for the other glyphs, and says why', () => {
    const formula = tipScene(false);
    const copy = planParallelCopy(formula.project, formula.clip.id, formula.fade.id);
    expect(copy.ok && copy.action).toMatchObject({ kind: 'disappear', glyphs: [0] });
    const arrow = tipScene(true);
    expect(planParallelCopy(arrow.project, arrow.clip.id, arrow.fade.id)).toEqual({
      ok: false,
      reason:
        'An arrow is animated whole, its shaft and its tips together, as Manim does: a block of it takes all its glyphs, and is not split or copied for other glyphs.',
    });
  });
});

describe('planParallelCopy', () => {
  it('copies an Appear at its time for the other glyphs off screen then', () => {
    const write = createAppear(1, 'write', [1], { duration: 2, lagRatio: 0.3 });
    const { project, clip } = oneClipScene({
      glyphs: 5,
      start: 2,
      end: 12,
      hiddenGlyphs: [1, 2, 3],
      actions: [write],
    });
    const plan = planParallelCopy(project, clip.id, write.id);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.action).toMatchObject({
      kind: 'appear',
      anim: 'write',
      glyphs: [2, 3],
      start: 1,
      duration: 2,
      lagRatio: 0.3,
    });
    expect(plan.action.id).not.toBe(write.id);
    expect(plan.note).toBeUndefined();
  });

  it('copies a part Transform for every other glyph, and moves the copy when they are busy', () => {
    const part = createPartTransform(1, [1], { duration: 1 });
    const { project, clip } = oneClipScene({
      glyphs: 3,
      start: 2,
      end: 12,
      actions: [part],
    });
    const plan = planParallelCopy(project, clip.id, part.id);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.action).toMatchObject({ kind: 'transform', glyphs: [0, 2], start: 1 });
    // Glyph 2 is busy then: the copy goes to the nearest fit, and the note says why.
    const busy = oneClipScene({
      glyphs: 3,
      start: 2,
      end: 12,
      actions: [part, createPartTransform(1, [2], { duration: 1 })],
    });
    const moved = planParallelCopy(busy.project, busy.clip.id, part.id);
    if (!moved.ok) throw new Error(moved.reason);
    expect(moved.action.start).not.toBe(1);
    expect(moved.note?.message).toMatch(/animates glyph 2 .* at the same time\. The copy/);
  });

  it('is refused when nothing is left, or for a block of every glyph', () => {
    const all = createAppear(1, 'write', 'all');
    const { project, clip } = oneClipScene({ glyphs: 3, start: 2, end: 12, actions: [all] });
    expect(planParallelCopy(project, clip.id, all.id)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('nothing left'),
    });
    const tween = createTween(1, 1, {});
    const other = oneClipScene({ glyphs: 3, start: 2, end: 12, actions: [tween] });
    expect(planParallelCopy(other.project, other.clip.id, tween.id).ok).toBe(false);
  });
});

describe('planCopy', () => {
  it('puts a copy with a new id after the block, in free time', () => {
    const original = createAppear(1, 'write', [1, 2], { duration: 2, lagRatio: 0.1 });
    const { project, clip } = scene([original]);
    const plan = planCopy(project, clip.id, original.id);
    expect(plan.ok && plan.action).toMatchObject({
      kind: 'appear',
      anim: 'write',
      glyphs: [1, 2],
      lagRatio: 0.1,
      start: 3,
      duration: 2,
    });
    expect(plan.ok && plan.action.id).not.toBe(original.id);
    expect(plan.ok && plan.action !== original).toBe(true);
  });

  it('skips over what is in the way, and says so when the clip has no room after it', () => {
    const original = createTween(1, 2, { rotation: 5 });
    const blocker = createTween(3, 2, { rotation: 9 });
    const { project, clip } = scene([original, blocker]);
    const plan = planCopy(project, clip.id, original.id);
    expect(plan.ok && plan.action.start).toBe(5); // after the blocker
    const tight = scene([createTween(0, 9, {}), createTween(9, 1, { rotation: 4 })]);
    const refused = planCopy(tight.project, tight.clip.id, tight.clip.actions[1]!.id);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toContain('after it');
  });
});

describe('convertBlock', () => {
  const fade = createDisappear(2, 'fade_out', [0, 3], {
    duration: 1.5,
    easing: 'linear',
    lagRatio: 0.3,
    shift: [1, -1],
    scale: 2,
  });

  it('is the same block when nothing changes', () => {
    expect(convertBlock(fade, 'disappear', 'fade_out')).toBe(fade);
  });

  it('keeps id, start, duration and glyphs, and takes the defaults of the new animation', () => {
    const next = convertBlock(fade, 'disappear', 'unwrite');
    expect(next).toMatchObject({
      id: fade.id,
      kind: 'disappear',
      anim: 'unwrite',
      start: 2,
      duration: 1.5,
      glyphs: [0, 3],
      easing: 'linear',
      lagRatio: null,
      shift: [0, 0],
      scale: 1,
    });
    const back = convertBlock(next, 'disappear', 'shrink_to_center');
    expect(back.easing).toBe('smooth');
  });

  it('switches between appear and disappear, keeping the fade settings between the fades', () => {
    const appear = convertBlock(fade, 'appear', 'fade_in');
    expect(appear).toMatchObject({ kind: 'appear', anim: 'fade_in', shift: [1, -1], scale: 2 });
    const write = convertBlock(appear, 'appear', 'write');
    expect(write).toMatchObject({ kind: 'appear', anim: 'write', shift: [0, 0], scale: 1 });
    const all = convertBlock(createAppear(0, 'create', 'all'), 'disappear', 'uncreate');
    expect(all).toMatchObject({ kind: 'disappear', glyphs: 'all', easing: 'smooth' });
    // The glyph list is a copy.
    const listed = convertBlock(fade, 'appear', 'write');
    expect(listed.glyphs).toEqual([0, 3]);
    expect(listed.glyphs).not.toBe(fade.glyphs);
  });
});

describe('planKindChange', () => {
  it('turns a part into a keyframe of the clip state and back, keeping id, time and easing', () => {
    const part = createPartTransform(3, [1, 2], { duration: 0.8, easing: 'linear', shift: [1, 0] });
    const { project, clip } = scene([part]);
    clip.initial.position = [2, -1];
    const asTween = planKindChange(project, clip.id, part.id, 'tween');
    expect(asTween.ok && asTween.action).toMatchObject({
      id: part.id,
      kind: 'tween',
      start: 3,
      duration: 0.8,
      easing: 'linear',
      to: { position: [2, -1], scale: 1 },
    });
    expect(planKindChange(project, clip.id, part.id, 'transform')).toEqual({
      ok: true,
      action: part,
    });
    clip.actions[0] = (asTween as { action: ClipAction }).action;
    const back = planKindChange(project, clip.id, part.id, 'transform');
    expect(back.ok && back.action).toMatchObject({
      id: part.id,
      kind: 'transform',
      start: 3,
      duration: 0.8,
      easing: 'linear',
      glyphs: [],
      shift: [0, 0],
    });
  });

  it('moves a keyframe out of the intro, and refuses appear and disappear blocks', () => {
    const part = createPartTransform(0, [0], { duration: 0.5 });
    const { project, clip } = scene([part], { intro: { ...defaultIntro('write'), duration: 1 } });
    const asTween = planKindChange(project, clip.id, part.id, 'tween');
    expect(asTween.ok && asTween.action.start).toBeGreaterThanOrEqual(1);
    const write = createAppear(4, 'write', [1]);
    clip.actions.push(write);
    const refused = planKindChange(project, clip.id, write.id, 'transform');
    expect(!refused.ok && refused.reason).toContain('Only a Transform block');
  });
});

describe('Morph blocks', () => {
  it('a new one lands between the intro and the outro when they leave room', () => {
    // A dropped clip: 3 s, written over [0, 1), fading out over [2, 3).
    const { project, clip } = oneClipScene({
      glyphs: 5,
      start: 0,
      end: 3,
      intro: defaultIntro('write'),
      fields: { outro: defaultOutro('fade_out') },
    });
    for (const at of [0, 2, 2.6]) {
      const plan = planNewBlock(project, clip.id, { kind: 'morph' }, at);
      if (!plan.ok) throw new Error(plan.reason);
      expect([plan.action.start, plan.action.duration]).toEqual([1, 1]);
    }
    // A longer clip: the asked time, kept out of the intro.
    const long = oneClipScene({ glyphs: 5, start: 0, end: 10, intro: defaultIntro('write') });
    const early = planNewBlock(long.project, long.clip.id, { kind: 'morph' }, 0.2);
    expect(early.ok && early.action.start).toBe(1);
    const asked = planNewBlock(long.project, long.clip.id, { kind: 'morph' }, 4);
    expect(asked.ok && asked.action.start).toBe(4);
    // Too short for the block between them: it goes where it fits, as before.
    const tiny = oneClipScene({
      glyphs: 5,
      start: 0,
      end: 2.5,
      intro: defaultIntro('write'),
      fields: { outro: defaultOutro('fade_out') },
    });
    const squeezed = planNewBlock(tiny.project, tiny.clip.id, { kind: 'morph' }, 0);
    expect(squeezed.ok).toBe(true);
  });

  const pairs = [
    { from: [0], to: [3], style: null },
    { from: [1], to: [2], style: 'transform' as const },
  ];

  it('are added with the defaults of a copy and no pair, wherever the clip has room', () => {
    const { project, clip } = scene([createDisappear(2, 'fade_out', 'all', { duration: 8 })]);
    // Without pairs it animates nothing, so the FadeOut of every glyph is not in its way.
    const plan = planNewBlock(project, clip.id, { kind: 'morph' }, 6);
    expect(plan.ok && plan.action).toMatchObject({
      kind: 'morph',
      start: 4,
      duration: 1,
      easing: 'smooth',
      style: 'copy',
      pathArc: 0,
      pairs: [],
    });
    expect(blockLabel(plan.ok ? plan.action : createMorph(0))).toBe('Morph · 0');
  });

  it('are named by their pairs', () => {
    const morph = createMorph(1, { pairs });
    expect(blockLabel(morph)).toBe('Morph · 2');
    expect(blockTitle(morph, 2)).toBe(
      'Morph within the formula (2 pairs)\n3.00 s → 4.00 s · 1.00 s',
    );
    expect(blockTitle(createMorph(0, { pairs: [pairs[0]!] }), 0)).toContain('(1 pair)');
  });

  it('have a reason of their own when there is no room', () => {
    const tiny = oneClipScene({ glyphs: 4, start: 0, end: 0.2 });
    const refused = planNewBlock(tiny.project, tiny.clip.id, { kind: 'morph' }, 0.1);
    expect(refused).toEqual({ ok: false, reason: noRoomReason(createMorph(0)) });
    expect(!refused.ok && refused.reason).toContain('Morph block');
    expect(noRoomReason(createMorph(0), 'after it')).toContain('less than 1.00 s after it');
    expect(noRoomReason(createMorph(0, { pairs }))).toContain('its sources are not on screen');
  });

  it('are copied with their settings but without their pairs', () => {
    const morph = createMorph(1, {
      duration: 1.5,
      easing: 'linear',
      style: 'fade',
      pathArc: 90,
      pairs,
    });
    const { project, clip } = scene([morph]);
    const plan = planCopy(project, clip.id, morph.id);
    expect(plan.ok && plan.action).toMatchObject({
      kind: 'morph',
      start: 2.5,
      duration: 1.5,
      easing: 'linear',
      style: 'fade',
      pathArc: 90,
      pairs: [],
    });
    expect(plan.ok && plan.action.id).not.toBe(morph.id);
    expect(morph.pairs).toHaveLength(2); // the original keeps its own
    // A copy that would not fit before the clip ends says so in a Morph block's words.
    const late = createMorph(9, { pairs });
    const end = scene([late]);
    const refused = planCopy(end.project, end.clip.id, late.id);
    expect(refused).toEqual({
      ok: false,
      reason: noRoomReason({ ...late, pairs: [] }, 'after it'),
    });
  });
});

const pair = (from: number, to: number): GlyphPair => ({ from: [from], to: [to], style: null });

describe('a new Morph block with suggested pairs (the "Suggest morph pairs" preference)', () => {
  it('takes the pairs Suggest proposes: row 1 → row 2 on the first step', () => {
    const { project, clip } = derivationScene();
    const plan = planNewBlock(project, clip.id, { kind: 'morph' }, 2, { suggestPairs: true });
    expect(plan.ok && plan.action).toMatchObject({
      kind: 'morph',
      start: 2,
      style: 'copy',
      pairs: [pair(1, 4), pair(2, 5)], // = → =, x → x
    });
    // Exactly what Suggest says of the project with the block in it.
    if (!plan.ok || plan.action.kind !== 'morph') throw new Error('no Morph block');
    const placed = structuredClone(project);
    placed.clips[0]!.actions.push({ ...plan.action, pairs: [] });
    expect(suggestMorphPairs(placed, clip.id, plan.action.id, [])).toEqual(plan.action.pairs);
    // The result is valid as it stands.
    placed.clips[0]!.actions[0] = plan.action;
    expect(validateProject(placed).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('takes row 2 → row 3 on the second step, once the first has brought row 2', () => {
    const { project, clip } = derivationScene([
      createMorph(2, { pairs: [pair(1, 4), pair(2, 5)] }),
      createAppear(3, 'write', [6]),
    ]);
    const plan = planNewBlock(project, clip.id, { kind: 'morph' }, 4, { suggestPairs: true });
    expect(plan.ok && plan.action.kind === 'morph' && plan.action.pairs).toEqual([
      pair(4, 7),
      pair(5, 8),
    ]);
  });

  it('pairs from where the block lands: asked for during the intro, it lands at its end', () => {
    const { project, clip } = derivationScene();
    const plan = planNewBlock(project, clip.id, { kind: 'morph' }, 0.5, { suggestPairs: true });
    expect(plan.ok && plan.action).toMatchObject({ start: 1, pairs: [pair(1, 4), pair(2, 5)] });
  });

  it('gives none without the option, and changes nothing for the other kinds', () => {
    const { project, clip } = derivationScene();
    const plain = planNewBlock(project, clip.id, { kind: 'morph' }, 2);
    expect(plain.ok && plain.action).toMatchObject({ start: 2, pairs: [] });
    const unsuggested = planNewBlock(project, clip.id, { kind: 'morph' }, 2, {
      suggestPairs: false,
    });
    expect(unsuggested.ok && unsuggested.action).toMatchObject({ pairs: [] });
    for (const spec of [
      { kind: 'appear', anim: 'write' },
      { kind: 'disappear', anim: 'fade_out' },
      { kind: 'tween' },
      { kind: 'transform' },
    ] as const) {
      const a = planNewBlock(project, clip.id, spec, 5);
      const b = planNewBlock(project, clip.id, spec, 5, { suggestPairs: true });
      expect(b.ok && { ...b.action, id: '' }).toEqual(a.ok && { ...a.action, id: '' });
    }
  });

  it('gives none while the formula has no render to read labels from', () => {
    const { project, clip, formula } = derivationScene();
    formula.snapshot = null;
    const plan = planNewBlock(project, clip.id, { kind: 'morph' }, 2, { suggestPairs: true });
    expect(plan.ok && plan.action).toMatchObject({ pairs: [] });
  });
});

describe('where the timeline menu of a clip adds (D171)', () => {
  const clip = { start: 2, end: 8 };

  it('adds at the playhead when it lies inside the clip, its ends included', () => {
    for (const playhead of [2, 4.37, 8, 2 - 1e-7, 8 + 1e-7]) {
      expect(clipMenuTime(clip, playhead, 6.5, 30)).toEqual({ time: playhead, atPlayhead: true });
    }
  });

  it('else where it was clicked, on the frame grid', () => {
    for (const playhead of [0, 1.9, 8.1, 20]) {
      expect(clipMenuTime(clip, playhead, 5.21, 30)).toEqual({ time: 5.2, atPlayhead: false });
    }
    expect(clipMenuTime(clip, 9, 5.21, 10)).toEqual({ time: 5.2, atPlayhead: false });
    expect(clipMenuTime(clip, 9, 5.26, 10)).toEqual({ time: 5.3, atPlayhead: false });
  });

  it('says which in the header of the menu', () => {
    expect(addTimeLabel({ time: 2, atPlayhead: true })).toBe('playhead 2.00 s');
    expect(addTimeLabel({ time: 5.2, atPlayhead: false })).toBe(
      '5.20 s · the playhead is outside this clip',
    );
  });
});

describe('a new block asked for at the playhead (D171)', () => {
  /** The block `planNewBlock` makes of `spec` at the playhead, and the note about it. */
  function added(project: Project, clipId: string, spec: NewBlock, playhead: number) {
    const plan = planNewBlock(project, clipId, spec, playhead);
    if (!plan.ok) throw new Error(plan.reason);
    const start = project.clips.find((c) => c.id === clipId)!.start + plan.action.start;
    return { start, note: playheadBlockNote(project, clipId, spec, plan.action, playhead) };
  }
  const write: NewBlock = { kind: 'appear', anim: 'write' };

  it('says nothing when it starts there, shortened or not', () => {
    const { project, clip } = scene();
    expect(added(project, clip.id, write, 4)).toEqual({ start: 4, note: null });
    // A keyframe over [3, 11.5) leaves half a second at 2.5 s: the new one is shortened there.
    const wall = scene([createTween(1, 8.5, { rotation: 5 })]);
    const shortened = added(wall.project, wall.clip.id, { kind: 'tween' }, 2.5);
    expect(shortened.start).toBeCloseTo(2.5, 6);
    expect(shortened.note).toBeNull();
  });

  it('says where it went when the intro animates its glyphs at the playhead', () => {
    const { project, clip } = oneClipScene({
      glyphs: 4,
      start: 0,
      end: 10,
      intro: defaultIntro('write'),
    });
    const { start, note } = added(project, clip.id, { kind: 'emphasis', effect: 'indicate' }, 0.4);
    expect(start).toBeCloseTo(1, 6);
    expect(note).toEqual({
      title: 'No room at the playhead',
      message:
        'The Indicate block starts at 1.00 s, not at the playhead (0.40 s): its glyphs are busy with the intro then.',
    });
  });

  it('names the block in the way', () => {
    const { project, clip } = scene([createEmphasis(2, 'wiggle', 'all', { duration: 2 })]);
    const { start, note } = added(project, clip.id, { kind: 'emphasis', effect: 'indicate' }, 4.5);
    expect(start).not.toBeCloseTo(4.5, 3);
    expect(note?.message).toBe(
      `The Indicate block starts at ${start.toFixed(2)} s, not at the playhead (4.50 s): its glyphs are busy with the Wiggle block at 4.00 s then.`,
    );
  });

  it('says why a keyframe and a Morph block keep out of the intro', () => {
    const { project, clip } = oneClipScene({
      glyphs: 4,
      start: 0,
      end: 10,
      intro: defaultIntro('write'),
    });
    expect(added(project, clip.id, { kind: 'tween' }, 0.4).note?.message).toBe(
      'The Transform block starts at 1.00 s, not at the playhead (0.40 s): a keyframe stays between the end of the intro and the start of the outro.',
    );
    expect(added(project, clip.id, { kind: 'morph' }, 0.4).note?.message).toBe(
      'The Morph block starts at 1.00 s, not at the playhead (0.40 s): a new Morph block goes between the intro and the outro.',
    );
  });

  it('says when the clip ends too soon after the playhead, or the playhead is off the clip', () => {
    const { project, clip } = scene(); // 2–12 s
    const late = added(project, clip.id, { kind: 'emphasis', effect: 'indicate' }, 11.9);
    expect(late.start).toBeCloseTo(11, 6);
    expect(late.note?.message).toBe(
      'The Indicate block starts at 11.00 s, not at the playhead (11.90 s): the clip ends too soon after it.',
    );
    // The Animations panel adds at the playhead wherever it is.
    const off = added(project, clip.id, { kind: 'emphasis', effect: 'indicate' }, 1);
    expect(off.start).toBeCloseTo(2, 6);
    expect(off.note?.message).toBe(
      'The Indicate block starts at 2.00 s, not at the playhead (1.00 s): the playhead is outside this clip.',
    );
  });
});

describe('a new block while a region is marked on the timeline (D180)', () => {
  const write: NewBlock = { kind: 'appear', anim: 'write' };
  const indicate: NewBlock = { kind: 'emphasis', effect: 'indicate' };

  it('takes the region whole, wherever it was asked for', () => {
    const { project, clip } = scene(); // 2–12 s
    const region = { start: 5, end: 7.5 };
    for (const spec of [write, indicate, { kind: 'tween' }, { kind: 'transform' }] as NewBlock[]) {
      // Asked for at 3 s (the playhead's, or the time clicked): the region wins.
      const plan = planNewBlock(project, clip.id, spec, 3, { region });
      expect(plan.ok && plan.action).toMatchObject({ start: 3, duration: 2.5 });
    }
    const morph = planNewBlock(project, clip.id, { kind: 'morph' }, 3, { region });
    expect(morph.ok && morph.action).toMatchObject({ start: 3, duration: 2.5, pairs: [] });
  });

  it('a new Morph block takes a region inside the intro too, as it was asked', () => {
    const { project, clip } = oneClipScene({
      glyphs: 4,
      start: 0,
      end: 10,
      intro: defaultIntro('write'),
    });
    const plan = planNewBlock(project, clip.id, { kind: 'morph' }, 5, {
      region: { start: 0.2, end: 0.8 },
    });
    expect(plan.ok && plan.action).toMatchObject({ start: 0.2, duration: 0.6 });
  });

  it('a Morph block with suggested pairs takes the region with them, where they fit', () => {
    const { project, clip } = derivationScene(); // 0–10 s, Write over the first second
    const morph: NewBlock = { kind: 'morph' };
    const fits = planNewBlock(project, clip.id, morph, 5, {
      suggestPairs: true,
      region: { start: 2, end: 3 },
    });
    expect(fits.ok && fits.action).toMatchObject({ start: 2, duration: 1 });
    expect(fits.ok && fits.action.kind === 'morph' && fits.action.pairs.length).toBe(2);
    expect(fits.ok && fits.note).toBeUndefined();
    // Inside the intro Suggest has nothing to offer: the block is there all the same, without
    // pairs — and without a note of the plan's (`addBlock` says that none was suggested).
    const early = planNewBlock(project, clip.id, morph, 5, {
      suggestPairs: true,
      region: { start: 0.2, end: 0.8 },
    });
    expect(early.ok && early.action).toMatchObject({ start: 0.2, duration: 0.6, pairs: [] });
    expect(early.ok && early.note).toBeUndefined();
  });

  it('an Appear beside other blocks in the region names the glyphs they leave', () => {
    // Glyphs 0 and 1 are written over 5–7 s; the others wait (they are hidden at the start).
    const { project, clip } = oneClipScene({
      glyphs: 4,
      start: 2,
      end: 12,
      hiddenGlyphs: [0, 1, 2, 3],
      actions: [createAppear(3, 'write', [0, 1], { duration: 2 })],
    });
    const plan = planNewBlock(project, clip.id, { kind: 'appear', anim: 'fade_in' }, 9, {
      region: { start: 5, end: 7 },
    });
    expect(plan.ok && plan.action).toMatchObject({ start: 3, duration: 2, glyphs: [2, 3] });
  });

  it('takes a region on the frames of a project of 30 a second', () => {
    const { project, clip } = scene(); // 2–12 s
    project.meta.fps = 30;
    const region = { start: 3.033333, end: 4.466667 }; // frames 91 and 134
    const plan = planNewBlock(project, clip.id, { kind: 'emphasis', effect: 'indicate' }, 9, {
      region,
    });
    expect(plan.ok && plan.action).toMatchObject({ start: 1.033333, duration: 1.433334 });
  });

  it('is not made when the clip does not hold the region', () => {
    const { project, clip } = scene(); // 2–12 s
    for (const region of [
      { start: 1, end: 3 },
      { start: 11, end: 13 },
      { start: 0, end: 20 },
      { start: 14, end: 15 },
    ]) {
      const plan = planNewBlock(project, clip.id, write, 4, { region });
      expect(plan).toEqual({
        ok: false,
        reason: `The region (${region.start.toFixed(2)}–${region.end.toFixed(2)} s) is not inside this clip (2.00–12.00 s): nothing was added. Move the region, or remove it (Esc) to add at the playhead.`,
      });
    }
    // Its ends may be the clip's.
    expect(planNewBlock(project, clip.id, write, 4, { region: { start: 2, end: 12 } }).ok).toBe(
      true,
    );
  });

  it('is not made when what is in the region animates its glyphs, and says what', () => {
    const { project, clip } = scene([createEmphasis(2, 'wiggle', 'all', { duration: 2 })]);
    // The Wiggle block runs over 4–6 s of the scene.
    const plan = planNewBlock(project, clip.id, indicate, 9, { region: { start: 5, end: 7 } });
    expect(plan).toEqual({
      ok: false,
      reason:
        'It does not fit in the region (5.00–7.00 s): nothing was added. The Wiggle block at 4.00 s animates glyphs 0 “0”, 1 “1”, 2 “2”, 3 “3” at the same time.',
    });
    // Beside it there is room: nothing moves the block there by itself.
    expect(planNewBlock(project, clip.id, indicate, 9, { region: { start: 6, end: 7 } }).ok).toBe(
      true,
    );
  });

  it('a keyframe is not made in a region that reaches into the intro', () => {
    const { project, clip } = oneClipScene({
      glyphs: 4,
      start: 0,
      end: 10,
      intro: defaultIntro('write'),
    });
    expect(
      planNewBlock(project, clip.id, { kind: 'tween' }, 5, { region: { start: 0.5, end: 2 } }),
    ).toEqual({
      ok: false,
      reason:
        'It does not fit in the region (0.50–2.00 s): nothing was added. A keyframe stays between the end of the intro and the start of the outro.',
    });
  });

  it('is not made in a region shorter than a block may be', () => {
    const { project, clip } = scene();
    expect(
      planNewBlock(project, clip.id, write, 4, { region: { start: 5, end: 5.033333 } }),
    ).toEqual({
      ok: false,
      reason: 'The region (5.00–5.03 s) is too short for an animation: nothing was added.',
    });
  });

  it('the menu says the region, and whether the clip holds it', () => {
    const clip = { start: 2, end: 8 };
    const inside = clipMenuTime(clip, 4, 6.5, 30, { start: 3, end: 5 });
    expect(inside).toEqual({
      time: 3,
      atPlayhead: false,
      region: { start: 3, end: 5 },
      regionInside: true,
    });
    expect(addTimeLabel(inside)).toBe('region 3.00–5.00 s');
    const outside = clipMenuTime(clip, 4, 6.5, 30, { start: 7, end: 9 });
    expect(outside.regionInside).toBe(false);
    expect(addTimeLabel(outside)).toBe('region 7.00–9.00 s · not inside this clip');
    // Without a region, as before.
    expect(clipMenuTime(clip, 4, 6.5, 30, null)).toEqual({ time: 4, atPlayhead: true });
  });
});
