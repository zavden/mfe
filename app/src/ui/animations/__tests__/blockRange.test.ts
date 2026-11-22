// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  blockBounds,
  createAppear,
  createClip,
  createDisappear,
  createFormula,
  createMorph,
  createPartTransform,
  createRelation,
  createTrack,
  createTween,
  defaultCameraFrame,
  defaultIntro,
  defaultOutro,
  validateProject,
  type Clip,
  type ClipAction,
  type Project,
} from '../../../model';
import {
  blockConflicts,
  blockLimits,
  clampTiming,
  findBlockSlot,
  MIN_USABLE_DURATION,
} from '../blockRange';
import { oneClipScene } from './fixtures';

/** One formula of 5 glyphs on a clip [0, 10] without intro or outro. */
function scene(actions: ClipAction[] = [], clipFields: Partial<Clip> = {}) {
  return oneClipScene({ glyphs: 5, start: 0, end: 10, actions, fields: clipFields });
}

const errors = (project: Project) => validateProject(project).filter((i) => i.severity === 'error');

describe('blockBounds', () => {
  it('keeps a tween between the intro and the outro, other blocks inside the clip', () => {
    const { clip } = scene([], { intro: defaultIntro('write'), outro: defaultOutro('fade_out') });
    expect(blockBounds(clip, createTween(0, 1, {}))).toEqual({ start: 1, end: 9 });
    expect(blockBounds(clip, createAppear(0, 'write', 'all'))).toEqual({ start: 0, end: 10 });
  });
});

describe('blockLimits', () => {
  it('stops at the nearest animation of the same glyphs, not at one of other glyphs', () => {
    const before = createDisappear(1, 'fade_out', [1], { duration: 1 }); // [1, 2] on glyph 1
    const mine = createDisappear(4, 'unwrite', [1, 2], { duration: 1 }); // glyph 1 is already off
    const other = createDisappear(4.5, 'fade_out', [3], { duration: 1 }); // glyph 3 only
    const { project, clip } = scene([before, mine, other]);
    // Glyph 1 is gone after `before`, so `mine` animates glyph 2 only: nothing else touches it.
    expect(blockLimits(project, clip, mine.id)).toEqual({ start: 0, end: 10 });
    const second = createAppear(7, 'write', [2], { duration: 1 }); // brings glyph 2 back
    const again = scene([before, mine, other, second]);
    expect(blockLimits(again.project, again.clip, mine.id)).toEqual({ start: 0, end: 7 });
  });

  it('narrows by relation windows and the intro / outro, and ignores spans on top of the block', () => {
    const t = createTween(4, 1, { rotation: 5 });
    const { project, clip } = scene([t], {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
    });
    expect(blockLimits(project, clip, t.id)).toEqual({ start: 1, end: 9 });

    const other = createClip(clip.formulaId, project.tracks[1]!.id, 0, 10);
    project.clips.push(other);
    const relation = createRelation(other.id, clip.id, { offset: 6, duration: 1 });
    relation.pairs.push({ from: [0], to: [0], style: null });
    project.relations.push(relation);
    expect(blockLimits(project, clip, t.id)).toEqual({ start: 1, end: 6 });
  });
});

describe('clampTiming', () => {
  it('moves a block as far as the neighbour animating its glyphs lets it', () => {
    const a = createDisappear(1, 'fade_out', [1], { duration: 1 });
    const b = createDisappear(5, 'fade_out', [1], { duration: 1 }); // glyph 1 is off by then…
    const c = createAppear(3, 'write', [1], { duration: 1 }); // …unless this brings it back
    const { project, clip } = scene([a, c, b]);
    expect(errors(project)).toEqual([]);
    // c lies between a (ends 2) and b (starts 5).
    expect(clampTiming(project, clip, c.id, { start: 0, end: 1 }, 'move')).toEqual({
      start: 2,
      duration: 1,
    });
    expect(clampTiming(project, clip, c.id, { start: 9, end: 10 }, 'move')).toEqual({
      start: 4,
      duration: 1,
    });
    expect(clampTiming(project, clip, c.id, { start: 3.5, end: 4.5 }, 'move').start).toBe(3.5);
  });

  it('resizes one edge at a time, within the gap and never below the minimum', () => {
    const a = createDisappear(1, 'fade_out', [1], { duration: 1 });
    const c = createAppear(3, 'write', [1], { duration: 1 });
    const b = createDisappear(6, 'fade_out', [1], { duration: 1 });
    const { project, clip } = scene([a, c, b]);
    expect(clampTiming(project, clip, c.id, { start: 3, end: 8 }, 'end')).toEqual({
      start: 3,
      duration: 3,
    });
    expect(clampTiming(project, clip, c.id, { start: 0, end: 4 }, 'start')).toEqual({
      start: 2,
      duration: 2,
    });
    const tiny = clampTiming(project, clip, c.id, { start: 3, end: 3.01 }, 'end');
    expect(tiny.start).toBe(3);
    expect(tiny.duration).toBeCloseTo(0.05, 6);
    const flipped = clampTiming(project, clip, c.id, { start: 5, end: 4 }, 'start');
    expect(flipped.start + flipped.duration).toBe(4);
    expect(flipped.duration).toBeCloseTo(0.05, 6);
  });

  it('keeps a tween out of the intro and the outro', () => {
    const t = createTween(3, 1, { rotation: 5 });
    const { project, clip } = scene([t], {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
    });
    expect(clampTiming(project, clip, t.id, { start: -5, end: -4 }, 'move').start).toBe(1);
    expect(clampTiming(project, clip, t.id, { start: 30, end: 31 }, 'move').start).toBe(8);
    expect(clampTiming(project, clip, t.id, { start: 3, end: 30 }, 'end').duration).toBe(6);
  });

  it('a block that fills its gap cannot move', () => {
    const a = createDisappear(1, 'fade_out', [1], { duration: 1 });
    const c = createAppear(2, 'write', [1], { duration: 1 });
    const b = createDisappear(3, 'fade_out', [1], { duration: 1 });
    const { project, clip } = scene([a, c, b]);
    expect(clampTiming(project, clip, c.id, { start: 2.4, end: 3.4 }, 'move')).toEqual({
      start: 2,
      duration: 1,
    });
  });

  it('stops at the last good position when moving changes which glyphs it animates', () => {
    // Glyph 3 is hidden and comes on screen with the Write at [3, 5]. A FadeOut of everything at 1
    // animates glyphs 0, 1, 2, 4. Moved into [3, 5] it would also take glyph 3, which the Write
    // is bringing in: a conflict the gap (worked out from its present glyphs) cannot see.
    const write = createAppear(3, 'write', [3], { duration: 2 });
    const all = createDisappear(1, 'fade_out', 'all', { duration: 1 });
    const { project, clip, formula } = scene([write, all]);
    formula.hiddenGlyphs = [3];
    expect(errors(project)).toEqual([]);
    expect(blockLimits(project, clip, all.id)).toEqual({ start: 0, end: 10 });
    const moved = clampTiming(project, clip, all.id, { start: 4, end: 5 }, 'move');
    expect(moved.start).toBeGreaterThan(2.9);
    expect(moved.start).toBeLessThan(3.001);
    const at = (start: number): Project => ({
      ...project,
      clips: [
        { ...clip, actions: clip.actions.map((a) => (a.id === all.id ? { ...a, start } : a)) },
      ],
    });
    expect(errors(at(moved.start))).toEqual([]);
    expect(errors(at(4)).map((i) => i.code)).toContain('action-overlap');
    // Past the Write it is fine again.
    expect(clampTiming(project, clip, all.id, { start: 6, end: 7 }, 'move').start).toBe(6);
  });

  it('lets a block that is already in conflict be dragged out of it', () => {
    const a = createDisappear(1, 'fade_out', [1], { duration: 2 });
    const c = createAppear(2, 'write', [1], { duration: 2 }); // overlaps a on glyph 1
    const { project, clip } = scene([a, c]);
    expect(blockConflicts(project, clip, c.id)).not.toBeNull();
    const out = clampTiming(project, clip, c.id, { start: 5, end: 7 }, 'move');
    expect(out.start).toBe(5);
  });
});

describe('blockConflicts', () => {
  it('flags overlapping the same glyphs, leaving the clip, and a tween over a relation', () => {
    const a = createDisappear(1, 'fade_out', [1], { duration: 1 });
    const b = createAppear(1.5, 'write', [1], { duration: 1 });
    const d = createDisappear(8, 'fade_out', [2], { duration: 1 });
    const { project, clip } = scene([a, b, d]);
    // b brings glyph 1 back mid-fade.
    expect(blockConflicts(project, clip, b.id)).toBe(
      'The FadeOut block at 1.00 s animates glyph 1 “1” at the same time.',
    );
    expect(blockConflicts(project, clip, d.id)).toBeNull();
    const out: Clip = {
      ...clip,
      actions: clip.actions.map((x) => (x.id === d.id ? { ...x, start: 9.5 } : x)),
    };
    expect(blockConflicts(project, out, d.id)).toBe('A block stays inside its clip.');
  });

  it('says why: the intro, a relation window, a keyframe out of bounds, a consumed glyph', () => {
    const early = createDisappear(0.5, 'fade_out', [0, 1], { duration: 1 });
    const { project, clip } = scene([early], { intro: defaultIntro('write') });
    expect(blockConflicts(project, clip, early.id)).toBe(
      'The intro animates glyphs 0 “0”, 1 “1” at the same time.',
    );
    const t = createTween(0.2, 1, { rotation: 5 });
    const keyframe = scene([t], { intro: defaultIntro('write') });
    expect(blockConflicts(keyframe.project, keyframe.clip, t.id)).toBe(
      'A keyframe stays between the end of the intro and the start of the outro.',
    );

    // A relation consumes glyph 3 at [6, 7]: a FadeIn of it afterwards would bring it back.
    const fade = createAppear(8, 'fade_in', [3], { duration: 1 });
    const partner = scene([fade]);
    const other = createClip(partner.clip.formulaId, partner.project.tracks[1]!.id, 0, 10);
    partner.project.clips.push(other);
    const out = createRelation(partner.clip.id, other.id, { offset: 6, duration: 1 });
    out.pairs.push({ from: [3], to: [3], style: 'transform' });
    partner.project.relations.push(out);
    expect(blockConflicts(partner.project, partner.clip, fade.id)).toBe(
      'It would bring back glyph 3 “3”, which a relation or a Morph block turned into other glyphs.',
    );
    const busy = createPartTransform(6.5, [3], { duration: 1 });
    partner.clip.actions = [busy];
    expect(blockConflicts(partner.project, partner.clip, busy.id)).toBe(
      'A relation window animates glyph 3 “3” at the same time.',
    );
  });
});

describe('Morph blocks', () => {
  /** Glyph 2 is hidden and written at [2, 3]; the morph copies it onto glyph 4 at [5, 6]. */
  function writtenSource() {
    const write = createAppear(2, 'write', [2], { duration: 1 });
    const morph = createMorph(5, { pairs: [{ from: [2], to: [4], style: null }] });
    const built = scene([write, morph]);
    built.formula.hiddenGlyphs = [2];
    return { ...built, write, morph };
  }
  const at = (clip: Clip, id: string, start: number): Clip => ({
    ...clip,
    actions: clip.actions.map((a) => (a.id === id ? { ...a, start } : a)),
  });
  const warnings = (project: Project) =>
    validateProject(project).filter((i) => i.severity === 'warning');

  it('takes its sources only once they are fully on screen', () => {
    const { project, clip, morph } = writtenSource();
    expect(errors(project)).toEqual([]);
    expect(blockConflicts(project, clip, morph.id)).toBeNull();
    // Before the Write, or while it still writes the source: the source is not there.
    const reason = 'Source glyph 2 “2” is not fully on screen when the Morph block starts.';
    expect(blockConflicts(project, at(clip, morph.id, 1), morph.id)).toBe(reason);
    expect(blockConflicts(project, at(clip, morph.id, 2.5), morph.id)).toBe(reason);
    expect(blockConflicts(project, at(clip, morph.id, 3), morph.id)).toBeNull();
  });

  it('dragged before the arrival of its sources, stops where they are there', () => {
    const { project, clip, morph } = writtenSource();
    const moved = clampTiming(project, clip, morph.id, { start: 0, end: 1 }, 'move');
    expect(moved).toEqual({ start: 3, duration: 1 });
    const placed: Project = { ...project, clips: [at(clip, morph.id, moved.start)] };
    expect(errors(placed)).toEqual([]);
    expect(warnings(placed).map((i) => i.code)).not.toContain('source-hidden');
    // Its start edge too.
    expect(clampTiming(project, clip, morph.id, { start: 0, end: 6 }, 'start')).toEqual({
      start: 3,
      duration: 3,
    });
  });

  it('takes a source another morph brings only after that one ends', () => {
    // The first morph copies glyph 0 onto glyph 2; the second copies glyph 2 onto glyph 4.
    const first = createMorph(2, { pairs: [{ from: [0], to: [2], style: null }] });
    const second = createMorph(5, { pairs: [{ from: [2], to: [4], style: null }] });
    const { project, clip } = scene([first, second]);
    expect(errors(project)).toEqual([]);
    expect(blockConflicts(project, at(clip, second.id, 1), second.id)).toBe(
      'Source glyph 2 “2” is not fully on screen when the Morph block starts.',
    );
    // Half way through the first morph, the source is still on its way.
    expect(blockConflicts(project, at(clip, second.id, 2.5), second.id)).toBe(
      'Source glyph 2 “2” is still arriving through another transfer when the Morph block starts.',
    );
    expect(clampTiming(project, clip, second.id, { start: 0, end: 1 }, 'move').start).toBe(3);
  });

  it('lets two morphs copy one source at the same time, as validation does', () => {
    const first = createMorph(2, { pairs: [{ from: [0], to: [2], style: null }] });
    const second = createMorph(5, { pairs: [{ from: [0], to: [4], style: null }] });
    const { project, clip } = scene([first, second]);
    expect(errors(project)).toEqual([]);
    expect(blockConflicts(project, at(clip, second.id, 2.5), second.id)).toBeNull();
    expect(clampTiming(project, clip, second.id, { start: 2.5, end: 3.5 }, 'move').start).toBe(2.5);
    // Consuming it while the other copies it: valid for Manim (the copy was taken when its play
    // began), so validation allows it, but the timeline keeps the two apart.
    second.pairs[0]!.style = 'transform';
    const moved = { ...project, clips: [at(clip, second.id, 2.5)] };
    expect(errors(moved)).toEqual([]);
    expect(blockConflicts(project, at(clip, second.id, 2.5), second.id)).toBe(
      'Another Morph block animates glyph 0 “0” at the same time.',
    );
  });

  it('cannot bring a target that is on screen already', () => {
    // Both morphs bring glyph 4: when the second starts, the first has brought it already.
    const first = createMorph(2, { pairs: [{ from: [0], to: [4], style: null }] });
    const second = createMorph(5, { pairs: [{ from: [1], to: [4], style: null }] });
    const { project, clip } = scene([first, second]);
    expect(blockConflicts(project, clip, second.id)).toBe(
      'Target glyph 4 “4” is on screen already when the Morph block starts: it arrives through the block.',
    );
    expect(blockConflicts(project, clip, first.id)).toBeNull();
  });

  it('is limited by the other animations of its glyphs, not by its own pairs', () => {
    const part = createPartTransform(8, [4], { duration: 1 }); // moves the target later
    const { project, clip, morph } = writtenSource();
    clip.actions.push(part);
    expect(blockLimits(project, clip, morph.id)).toEqual({ start: 3, end: 8 });
    expect(clampTiming(project, clip, morph.id, { start: 9, end: 10 }, 'move').start).toBe(7);
    // A part transform of the target while the morph brings it in: in the way.
    const during = at(clip, part.id, 5.5);
    expect(blockConflicts(project, during, morph.id)).toBe(
      'The Transform block at 5.50 s animates glyph 4 “4” at the same time.',
    );
  });

  it('consuming, may sit inside the outro (its target leaves with the clip) but never at its start', () => {
    const outro = defaultOutro('fade_out'); // [9, 10)
    const morph = createMorph(5, {
      duration: 0.5,
      style: 'transform',
      pairs: [{ from: [0], to: [4], style: null }],
    });
    const { project, clip } = scene([morph], { outro });
    expect(errors(project)).toEqual([]);
    // From outside the outro, the target's outro span holds the block before it (also at the tie:
    // at a tie the pair comes first and the outro would take the target too).
    expect(blockLimits(project, clip, morph.id)).toEqual({ start: 0, end: 9 });
    expect(clampTiming(project, clip, morph.id, { start: 9.2, end: 9.7 }, 'move')).toEqual({
      start: 8.5,
      duration: 0.5,
    });
    expect(clampTiming(project, clip, morph.id, { start: 9, end: 9.5 }, 'move').start).toBe(8.5);
    // Created inside the outro it is valid, and it moves within the outro, never back to its start.
    const inside: Project = { ...project, clips: [at(clip, morph.id, 9.2)] };
    expect(errors(inside)).toEqual([]);
    expect(blockConflicts(project, inside.clips[0]!, morph.id)).toBeNull();
    const empty: Clip = { ...clip, actions: [] };
    expect(findBlockSlot(project, empty, { block: morph, at: 9.2 })).toEqual({
      start: 9.2,
      duration: 0.5,
    });
    expect(
      clampTiming(project, inside.clips[0]!, morph.id, { start: 9.4, end: 9.9 }, 'move'),
    ).toEqual({ start: 9.4, duration: 0.5 });
    expect(
      clampTiming(project, inside.clips[0]!, morph.id, { start: 9, end: 9.5 }, 'move').start,
    ).toBeGreaterThan(9);
    // A copy stays out of the outro either way: its source fades there.
    morph.style = 'copy';
    const copying = scene([morph], { outro });
    expect(blockLimits(copying.project, copying.clip, morph.id)).toEqual({ start: 0, end: 9 });
    const copyInside: Project = { ...copying.project, clips: [at(copying.clip, morph.id, 9.2)] };
    expect(blockConflicts(copying.project, copyInside.clips[0]!, morph.id)).not.toBeNull();
  });

  it('copying a glyph, can overlap a transfer that consumes it later, as validation allows', () => {
    // The morph copies glyph 1 → 3 over [2, 3); a relation takes glyph 1 to another clip at 2.5.
    const morph = createMorph(2, { pairs: [{ from: [1], to: [3], style: null }] });
    const { project, clip, formula } = scene([morph]);
    const other = createFormula({ name: 'g', snapshot: formula.snapshot });
    const second = createTrack('Other');
    project.formulas.push(other);
    project.tracks.push(second);
    const target = createClip(other.id, second.id, 1, 9, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    project.clips.push(target);
    project.relations.push(
      createRelation(clip.id, target.id, {
        offset: 1.5, // [2.5, 3.5)
        pairs: [{ from: [1], to: [0], style: null }],
      }),
    );
    expect(errors(project)).toEqual([]);
    expect(blockConflicts(project, clip, morph.id)).toBeNull();
    // Consuming it instead: the relation's window is in the way.
    morph.style = 'transform';
    expect(blockConflicts(project, clip, morph.id)).toBe(
      'A relation window animates glyph 1 “1” at the same time.',
    );
    // A relation that started before the copy: in the way too (the copy must come first).
    morph.style = 'copy';
    project.relations[0]!.offset = 0.5; // [1.5, 2.5)
    expect(blockConflicts(project, clip, morph.id)).not.toBeNull();
  });

  it('tells the glyphs of another clip apart from its own when another transfer copies one', () => {
    // The morph copies glyph 0 → 2 at [4, 5); a relation copies glyph 0 to glyph 0 of a clip of
    // the same formula over [1, 3). Two copies of one source may run together, and glyph 0 of the
    // other clip is a different glyph: it is not a target of this one. The morph may move to 1.5.
    const morph = createMorph(4, { pairs: [{ from: [0], to: [2], style: null }] });
    const { project, clip, formula } = scene([morph]);
    const second = createTrack('Other');
    project.tracks.push(second);
    const other = createClip(formula.id, second.id, 0, 8, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    project.clips.push(other);
    const relation = createRelation(clip.id, other.id, {
      offset: 1, // [1, 3)
      duration: 2,
      style: 'copy',
      pairs: [{ from: [0], to: [0], style: null }],
    });
    project.relations.push(relation);
    expect(errors(project)).toEqual([]);
    const during = at(clip, morph.id, 1.5);
    expect(errors({ ...project, clips: [during, other] })).toEqual([]);
    expect(blockConflicts(project, during, morph.id)).toBeNull();
    expect(clampTiming(project, clip, morph.id, { start: 1.5, end: 2.5 }, 'move')).toEqual({
      start: 1.5,
      duration: 1,
    });
    // The relation consuming glyph 0 instead: the copy must come first, so it is held at 3 s.
    relation.pairs[0]!.style = 'transform';
    expect(blockConflicts(project, during, morph.id)).toBe(
      'A relation window animates glyph 0 “0” at the same time.',
    );
    expect(clampTiming(project, clip, morph.id, { start: 1.5, end: 2.5 }, 'move').start).toBe(3);
    // Nor does another pair of that relation copying the glyph excuse the one that consumes it.
    relation.pairs.push({ from: [0], to: [1], style: 'copy' });
    expect(blockConflicts(project, during, morph.id)).toBe(
      'A relation window animates glyph 0 “0” at the same time.',
    );
  });

  it('copying a glyph, stays before the Morph block that consumes it: exactly there', () => {
    // The copy a → b over [1, 2); the consumption a → c over [3, 4). A copy after the consumption
    // is validation's error, which the simulation does not carry: the planner asks validation.
    const copy = createMorph(1, { pairs: [{ from: [0], to: [1], style: null }] });
    const take = createMorph(3, {
      style: 'transform',
      pairs: [{ from: [0], to: [2], style: null }],
    });
    const { project, clip } = scene([copy, take]);
    expect(errors(project)).toEqual([]);
    expect(blockConflicts(project, at(clip, copy.id, 5), copy.id)).toBe(
      'The Morph block copies glyph 0 of "f" after it was consumed.',
    );
    // Wholly past the consumer, just after it, exactly with it, just before it.
    expect(clampTiming(project, clip, copy.id, { start: 5, end: 6 }, 'move')).toEqual({
      start: 3,
      duration: 1,
    });
    expect(clampTiming(project, clip, copy.id, { start: 3.1, end: 4.1 }, 'move').start).toBe(3);
    expect(clampTiming(project, clip, copy.id, { start: 3, end: 4 }, 'move').start).toBe(3);
    expect(clampTiming(project, clip, copy.id, { start: 2.9, end: 3.9 }, 'move').start).toBe(2.9);
    for (const start of [3, 2.9]) {
      expect(errors({ ...project, clips: [at(clip, copy.id, start)] })).toEqual([]);
    }
    // Moving the consumer onto the copy instead keeps the two apart, as before.
    expect(clampTiming(project, clip, take.id, { start: 0.5, end: 1.5 }, 'move').start).toBe(2);
  });

  it('copying a glyph, stays before the relation that consumes it, and may end after it', () => {
    // The morph copies glyph 1 → 3 over [1, 7); a relation fades glyph 1 into another clip over
    // [5, 6): the copy began first, which validation allows.
    const morph = createMorph(1, { duration: 6, pairs: [{ from: [1], to: [3], style: null }] });
    const { project, clip, formula } = scene([morph]);
    const other = createFormula({ name: 'g', snapshot: formula.snapshot });
    const second = createTrack('Other');
    project.formulas.push(other);
    project.tracks.push(second);
    const target = createClip(other.id, second.id, 0, 10, {
      intro: defaultIntro('none'),
      outro: defaultOutro('none'),
    });
    project.clips.push(target);
    project.relations.push(
      createRelation(clip.id, target.id, {
        offset: 5,
        duration: 1,
        style: 'fade',
        pairs: [{ from: [1], to: [0], style: null }],
      }),
    );
    expect(errors(project)).toEqual([]);
    expect(blockConflicts(project, clip, morph.id)).toBeNull();
    // The whole block, and its start edge, stop at the relation's start; its end edge is free.
    expect(clampTiming(project, clip, morph.id, { start: 6.5, end: 12.5 }, 'move')).toEqual({
      start: 4,
      duration: 6,
    });
    expect(clampTiming(project, clip, morph.id, { start: 5.5, end: 7 }, 'start')).toEqual({
      start: 5,
      duration: 2,
    });
    expect(clampTiming(project, clip, morph.id, { start: 1, end: 9 }, 'end')).toEqual({
      start: 1,
      duration: 8,
    });
    const placed = (timing: { start: number; duration: number }): Project => ({
      ...project,
      clips: [{ ...clip, actions: [{ ...morph, ...timing }] }, target],
    });
    expect(errors(placed({ start: 5, duration: 2 }))).toEqual([]);
    expect(errors(placed({ start: 1, duration: 8 }))).toEqual([]);
    // Shortened first, the whole block may go up to the relation's start, not past it.
    const short: Clip = { ...clip, actions: [{ ...morph, duration: 1 }] };
    expect(clampTiming(project, short, morph.id, { start: 8, end: 9 }, 'move').start).toBe(5);
    expect(
      blockConflicts(
        project,
        { ...short, actions: [{ ...morph, start: 6, duration: 1 }] },
        morph.id,
      ),
    ).toBe('The Morph block copies glyph 1 of "f" after it was consumed.');
  });

  it('already copying after the consumption (an imported project), can still be moved', () => {
    const copy = createMorph(5, { pairs: [{ from: [0], to: [1], style: null }] });
    const take = createMorph(3, {
      style: 'transform',
      pairs: [{ from: [0], to: [2], style: null }],
    });
    const { project, clip } = scene([take, copy]);
    expect(errors(project).map((i) => i.code)).toEqual(['source-used-after-consumed']);
    expect(blockConflicts(project, clip, copy.id)).toBeNull(); // nothing new
    expect(clampTiming(project, clip, copy.id, { start: 7, end: 8 }, 'move').start).toBe(7);
    // Back towards the consumer, the consumer's window is in its way, as for any copy.
    expect(clampTiming(project, clip, copy.id, { start: 1, end: 2 }, 'move').start).toBe(4);
  });

  it('without pairs, fits anywhere in its clip', () => {
    const { project, clip } = scene([createDisappear(0, 'fade_out', 'all', { duration: 10 })]);
    expect(findBlockSlot(project, clip, { block: createMorph(0), at: 4 })).toEqual({
      start: 4,
      duration: 1,
    });
  });
});

describe('findBlockSlot', () => {
  const block = (start = 0) => createAppear(start, 'write', [3, 4], { duration: 1 });

  it('uses the asked time when it is free', () => {
    const { project, clip } = scene([]);
    expect(findBlockSlot(project, clip, { block: block(), at: 2.5 })).toEqual({
      start: 2.5,
      duration: 1,
    });
  });

  it('clamps into the clip when asked near its end', () => {
    const { project, clip } = scene([]);
    expect(findBlockSlot(project, clip, { block: block(), at: 9.8 })).toEqual({
      start: 9,
      duration: 1,
    });
  });

  it('cannot bring glyphs back while they are fading out, and fits where they are on screen', () => {
    const busy = createDisappear(2, 'fade_out', [3, 4], { duration: 2 }); // [2, 4] on glyphs 3, 4
    const { project, clip } = scene([busy]);
    // An Appear of them would start during the FadeOut: the nearest start is when it ends.
    expect(findBlockSlot(project, clip, { block: block(), at: 3 })).toEqual({
      start: 4,
      duration: 1,
    });
    // Before it the glyphs are on screen, so the Appear animates nothing there: it fits.
    expect(findBlockSlot(project, clip, { block: block(), at: 1 })).toEqual({
      start: 1,
      duration: 1,
    });
  });

  it('shortens a block that does not fit where it was asked, then moves it, then gives up', () => {
    const wall = createTween(3, 4, { rotation: 5 }); // [3, 7], every glyph
    const { project, clip } = scene([wall]);
    const tween = createTween(0, 1, { rotation: 9 });
    // [2.5, 3.5] hits the wall: shortened to the 0.5 s before it.
    const short = findBlockSlot(project, clip, { block: tween, at: 2.5, shorten: true });
    expect(short!.start).toBe(2.5);
    expect(short!.duration).toBeCloseTo(0.5, 2);
    // Without shortening it goes to where a whole second fits, the nearest side.
    expect(findBlockSlot(project, clip, { block: tween, at: 2.5 })).toEqual({
      start: 2,
      duration: 1,
    });
    // Asked inside the wall: after it or before it, whichever is nearer.
    expect(findBlockSlot(project, clip, { block: tween, at: 6, shorten: true })).toEqual({
      start: 7,
      duration: 1,
    });
    // Only after: a copy of the wall's neighbour goes later.
    expect(findBlockSlot(project, clip, { block: tween, at: 1, after: true })).toEqual({
      start: 1,
      duration: 1,
    });
    expect(findBlockSlot(project, clip, { block: tween, at: 2.5, after: true })).toEqual({
      start: 7,
      duration: 1,
    });

    // A clip full of tweens has no room at all.
    const full = scene([createTween(0, 10, { rotation: 5 })]);
    expect(
      findBlockSlot(full.project, full.clip, { block: tween, at: 3, shorten: true }),
    ).toBeNull();
    // And a gap shorter than the minimum is not offered.
    const tight = scene([
      createTween(0, 4, { rotation: 5 }),
      createTween(4.1, 5.9, { rotation: 6 }),
    ]);
    expect(MIN_USABLE_DURATION).toBeGreaterThan(0.1);
    expect(
      findBlockSlot(tight.project, tight.clip, { block: tween, at: 4, shorten: true }),
    ).toBeNull();
  });
});

describe('the locked region of the camera', () => {
  /** The scene with a camera move over [4, 5). */
  const withMove = (actions: ClipAction[]) => {
    const made = scene(actions);
    made.project.camera = {
      initial: defaultCameraFrame(),
      targets: [],
      moves: [{ id: 'n1', start: 4, duration: 1, easing: 'smooth', to: { kind: 'start' } }],
    };
    return made;
  };

  it('bounds a block: it stops at the move, and does not pass it', () => {
    const block = createDisappear(1, 'fade_out', [1], { duration: 1 }); // [1, 2)
    const { project, clip } = withMove([block]);
    expect(blockLimits(project, clip, block.id)).toEqual({ start: 0, end: 4 });
    // Pushed into the move: it ends where the move starts.
    expect(clampTiming(project, clip, block.id, { start: 3.6, end: 4.6 }, 'move')).toEqual({
      start: 3,
      duration: 1,
    });
    // Asked for the other side of it: no further.
    expect(clampTiming(project, clip, block.id, { start: 6, end: 7 }, 'move')).toEqual({
      start: 3,
      duration: 1,
    });
    expect(clampTiming(project, clip, block.id, { start: 1, end: 4.7 }, 'end')).toEqual({
      start: 1,
      duration: 3,
    });
    // After the move, it stops where the move ends.
    const later = createDisappear(6, 'fade_out', [1], { duration: 1 });
    const after = withMove([later]);
    expect(blockLimits(after.project, after.clip, later.id)).toEqual({ start: 5, end: 10 });
    expect(
      clampTiming(after.project, after.clip, later.id, { start: 4.2, end: 7 }, 'start'),
    ).toEqual({ start: 5, duration: 2 });
  });

  it('lets a block that runs during a move be dragged out of it', () => {
    const block = createDisappear(3.5, 'fade_out', [1], { duration: 1 }); // [3.5, 4.5): an error
    const { project, clip } = withMove([block]);
    expect(errors(project).map((issue) => issue.code)).toEqual(['camera-region']);
    expect(blockLimits(project, clip, block.id)).toEqual({ start: 0, end: 10 });
    expect(clampTiming(project, clip, block.id, { start: 2, end: 3 }, 'move')).toEqual({
      start: 2,
      duration: 1,
    });
  });

  it('says when the camera moves, for a block asked to run then', () => {
    const block = createDisappear(1, 'fade_out', [1], { duration: 1 });
    const { project, clip } = withMove([block]);
    const probe = { ...clip, actions: [{ ...block, start: 3.6 }] };
    expect(blockConflicts(project, probe, block.id)).toBe(
      'The camera moves from 4.00 s to 5.00 s, and nothing else animates while it does.',
    );
  });

  it('gives a new block the nearest place where the camera does not move', () => {
    const { project, clip } = withMove([]);
    const block = createDisappear(0, 'fade_out', [1], { duration: 1 });
    // Asked for inside the move: right after it.
    expect(findBlockSlot(project, clip, { block, at: 4.4 })).toEqual({ start: 5, duration: 1 });
    // Nearer to its start: right before it.
    expect(findBlockSlot(project, clip, { block, at: 3.4 })).toEqual({ start: 3, duration: 1 });
    // Shortened where it was asked, when that is allowed: as far as the move.
    expect(findBlockSlot(project, clip, { block, at: 3.5, shorten: true })).toEqual({
      start: 3.5,
      duration: 0.5,
    });
  });
});

describe('clampTiming over generated schedules', () => {
  /** A small deterministic generator of schedules on one clip of four glyphs over [0, 10]: two
   * to four blocks among Morph blocks of one pair (copy, transform or fade), Appear and Disappear
   * blocks of one glyph, sometimes a Write intro and a FadeOut outro, and sometimes a relation
   * that copies or consumes a glyph into a second clip. Only what validation accepts is kept. */
  function* schedules(seed: number, count: number) {
    let x = seed;
    const random = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const time = (lo: number, hi: number) => Math.round((lo + random() * (hi - lo)) * 4) / 4;
    for (let i = 0; i < count; i++) {
      const actions: ClipAction[] = [];
      const blocks = 2 + Math.floor(random() * 3);
      for (let b = 0; b < blocks; b++) {
        const start = time(0, 8);
        const duration = pick([0.5, 1, 2]);
        const kind = random();
        if (kind < 0.6) {
          const from = Math.floor(random() * 4);
          const to = (from + 1 + Math.floor(random() * 3)) % 4;
          actions.push(
            createMorph(start, {
              duration,
              style: pick(['copy', 'transform', 'fade'] as const),
              pairs: [{ from: [from], to: [to], style: null }],
            }),
          );
        } else if (kind < 0.8) {
          actions.push(createAppear(start, 'fade_in', [Math.floor(random() * 4)], { duration }));
        } else {
          actions.push(
            createDisappear(start, 'fade_out', [Math.floor(random() * 4)], { duration }),
          );
        }
      }
      actions.sort((a, b) => a.start - b.start);
      const dressed = random() < 0.5;
      const { project, clip, formula } = oneClipScene({
        glyphs: 4,
        start: 0,
        end: 10,
        actions,
        intro: dressed ? defaultIntro('write') : undefined,
        fields: dressed ? { outro: defaultOutro('fade_out') } : {},
      });
      if (random() < 0.5) {
        const other = createFormula({ name: 'g', snapshot: formula.snapshot });
        const second = createTrack('Other');
        project.formulas.push(other);
        project.tracks.push(second);
        const target = createClip(other.id, second.id, 0, 10, {
          intro: defaultIntro('none'),
          outro: defaultOutro('none'),
        });
        project.clips.push(target);
        project.relations.push(
          createRelation(clip.id, target.id, {
            offset: time(0, 8),
            duration: pick([0.5, 1, 2]),
            style: pick(['copy', 'transform'] as const),
            pairs: [{ from: [Math.floor(random() * 4)], to: [0], style: null }],
          }),
        );
      }
      if (errors(project).length === 0) yield { project, clip, random };
    }
  }

  it('a timing edit of a valid project, as the planner lands it, leaves the project valid', () => {
    let kept = 0;
    let moved = 0;
    for (const { project, clip, random } of schedules(7, 600)) {
      kept++;
      for (const action of clip.actions) {
        const end = action.start + action.duration;
        // A block the planner finds in conflict where it is (a warning for validation: a Morph
        // block whose source is not on screen) may move freely; one that is fine stays fine.
        const fine = blockConflicts(project, clip, action.id) === null;
        for (const edit of ['move', 'start', 'end'] as const) {
          const wanted =
            edit === 'move'
              ? { start: random() * 12 - 1, end: 0 }
              : edit === 'start'
                ? { start: random() * 12 - 1, end }
                : { start: action.start, end: random() * 12 - 1 };
          if (edit === 'move') wanted.end = wanted.start + action.duration;
          const timing = clampTiming(project, clip, action.id, wanted, edit);
          const placed: Project = {
            ...project,
            clips: project.clips.map((c) =>
              c.id === clip.id
                ? {
                    ...c,
                    actions: c.actions.map((a) => (a.id === action.id ? { ...a, ...timing } : a)),
                  }
                : c,
            ),
          };
          expect(errors(placed)).toEqual([]);
          if (fine) expect(blockConflicts(placed, placed.clips[0]!, action.id)).toBeNull();
          if (timing.start !== action.start || timing.duration !== action.duration) moved++;
        }
      }
    }
    expect(kept).toBeGreaterThan(100);
    expect(moved).toBeGreaterThan(kept);
  });
});
