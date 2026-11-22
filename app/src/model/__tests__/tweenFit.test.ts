// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  attachTargets,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createDisappear,
  createFitTween,
  createShapeAttach,
  createShapeFormula,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  fitTweens,
  parseProject,
  placementTargets,
  remapGlyphRefs,
  serializeProject,
  timingMeasurementTimes,
  validateProject,
  type Clip,
  type Project,
  type TweenAction,
} from '../index';
import { smallProject } from './fixtures';

/* A tween that carries a shape to surround other glyphs (`TweenFit`, format 23, D123): in the
 * file it is a tween with a `fit` — the clip and the glyphs it goes to, those of other clips in
 * `also`, and `fitted`, the box the attach sync found. */

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};

/** The small project ("a+b=c" over [0, 4), written in 1 s; "c=b+a" over [2, 6), faded in in
 * 1 s) with a box `s1` around the first from 1 s, on a track of its own. */
function boxed(): { p: Project; ca: Clip; cb: Clip; cs: Clip } {
  const p = smallProject();
  p.relations = [];
  p.tracks.push(createTrack('Track 3'));
  const [ca, cb] = p.clips as [Clip, Clip];
  ca.outro = defaultOutro('none');
  cb.outro = defaultOutro('none');
  const box = createShapeFormula({ name: 's1', width: 2, height: 1 });
  p.formulas.push(box);
  const cs = createClip(box.id, p.tracks[2]!.id, 1, 6, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
    attach: createShapeAttach(ca.id, 'all'),
  });
  p.clips.push(cs);
  return { p, ca, cb, cs };
}
const codes = (p: Project, prefix: string) =>
  validateProject(p)
    .filter((i) => i.code.startsWith(prefix))
    .map((i) => [i.severity, i.code, i.path.join('.')]);

describe('a tween’s fit, in the file', () => {
  it('is kept by a save and a load, with what it was fitted to', () => {
    const { p, ca, cb, cs } = boxed();
    const fit = createFitTween(2.5, 1, { clipId: cb.id, glyphs: [0, 1] }, [
      { clipId: ca.id, glyphs: 'all' },
    ]);
    fit.fit.fitted = { center: [1, -0.5], width: 2.4, height: 0.9 };
    cs.actions.push(fit, createTween(4, 0.5, { opacity: 0.5 }));
    const text = serializeProject(p);
    const again = opened(text);
    const [first, second] = again.clips[2]!.actions as [TweenAction, TweenAction];
    expect(first.fit).toEqual({
      clipId: cb.id,
      glyphs: [0, 1],
      also: [{ clipId: ca.id, glyphs: 'all' }],
      fitted: { center: [1, -0.5], width: 2.4, height: 0.9 },
    });
    // A plain tween has none, and a fit on one clip has no `also`.
    expect('fit' in second).toBe(false);
    expect('also' in createFitTween(0, 1, { clipId: cb.id, glyphs: 'all' }).fit).toBe(false);
    expect(serializeProject(again)).toBe(text);
  });

  it('is refused with a box that is not one', () => {
    const { p, cb, cs } = boxed();
    const fit = createFitTween(2.5, 1, { clipId: cb.id, glyphs: 'all' });
    cs.actions.push(fit);
    (fit.fit as { fitted: unknown }).fitted = { center: [0, 0], width: -1, height: 1 };
    expect(parseProject(serializeProject(p)).ok).toBe(false);
    (fit.fit as { fitted: unknown }).fitted = { center: [0, 0], width: 1, height: 1 };
    expect(parseProject(serializeProject(p)).ok).toBe(true);
  });
});

describe('the targets of a clip', () => {
  it('are those of its attachment and of the fits of its tweens, in that order', () => {
    const { ca, cb, cs } = boxed();
    const fit = createFitTween(2.5, 1, { clipId: cb.id, glyphs: [0] }, [
      { clipId: ca.id, glyphs: [1] },
    ]);
    cs.actions.push(createTween(1.5, 0.5, {}), fit);
    expect(fitTweens(cs)).toEqual([fit]);
    expect(attachTargets(fit.fit)).toEqual([
      { clipId: cb.id, glyphs: [0] },
      { clipId: ca.id, glyphs: [1] },
    ]);
    expect(placementTargets(cs).map((t) => t.clipId)).toEqual([ca.id, cb.id, ca.id]);
    expect(placementTargets(ca)).toEqual([]);
  });

  it('are measured for a fit when its tween starts', () => {
    const { p, cb, cs } = boxed();
    cs.actions.push(createFitTween(2.5, 1, { clipId: cb.id, glyphs: 'all' }));
    // The box's clip starts at 1 s: the tween measures "c=b+a" at 3.5 s.
    expect([...timingMeasurementTimes(p, [cb.id])]).toEqual([3.5]);
    expect([...timingMeasurementTimes(p, [p.clips[0]!.id])]).toEqual([1]);
  });
});

describe('validation of a tween’s fit', () => {
  it('accepts a shape carried to glyphs that are there and quiet', () => {
    const { p, cb, cs } = boxed();
    cs.actions.push(createFitTween(2.5, 1, { clipId: cb.id, glyphs: [0, 1] }));
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('is a shape’s alone', () => {
    const { p, ca, cb } = boxed();
    ca.actions.push(createFitTween(1.5, 1, { clipId: cb.id, glyphs: 'all' }));
    expect(codes(p, 'fit')).toEqual([['error', 'fit-shape', 'clips.0.actions.0.fit']]);
    // A brace is not one either.
    const brace = createBraceFormula({ name: 'b1' });
    p.formulas.push(brace);
    p.tracks.push(createTrack('Track 4'));
    ca.actions = [];
    p.clips.push(
      createClip(brace.id, p.tracks[3]!.id, 1, 4, {
        intro: defaultIntro('none'),
        outro: defaultOutro('none'),
        attach: createBraceAttach(ca.id, 'all'),
        actions: [createFitTween(1.5, 1, { clipId: cb.id, glyphs: 'all' })],
      }),
    );
    expect(codes(p, 'fit')).toEqual([['error', 'fit-shape', 'clips.3.actions.0.fit']]);
  });

  it('names a clip that exists and is another, with glyphs of its formula', () => {
    const { p, ca, cs } = boxed();
    cs.actions.push(
      createFitTween(1.2, 0.5, { clipId: 'gone', glyphs: 'all' }),
      createFitTween(2, 0.5, { clipId: cs.id, glyphs: 'all' }),
      createFitTween(3, 0.5, { clipId: ca.id, glyphs: [] }, [{ clipId: ca.id, glyphs: [9] }]),
    );
    const found = validateProject(p).map((i) => [i.code, i.path.join('.')]);
    expect(found).toEqual(
      expect.arrayContaining([
        ['dangling-ref', 'clips.2.actions.0.fit.clipId'],
        ['attach-self', 'clips.2.actions.1.fit.clipId'],
        ['attach-empty', 'clips.2.actions.2.fit.glyphs'],
        ['glyph-range', 'clips.2.actions.2.fit.also.0.glyphs'],
      ]),
    );
  });

  it('needs its target quiet and there when the tween starts, as an attachment does when its clip starts', () => {
    const { p, ca, cb, cs } = boxed();
    // "c=b+a" fades in over [2, 3): at 2.5 s its glyphs are half drawn.
    const fit = createFitTween(1.5, 0.5, { clipId: cb.id, glyphs: [0] });
    cs.actions.push(fit);
    const busy = validateProject(p).filter((i) => i.code.startsWith('attach'));
    expect(busy.map((i) => [i.severity, i.code, i.path.join('.')])).toEqual([
      ['error', 'attach-target-busy', 'clips.2.actions.0.fit'],
    ]);
    expect(busy[0]!.message).toMatch(
      /^The Transform of "s1" goes to glyph 0 of "b" while the intro .* \(at 2\.5 s\).*Start it once/,
    );
    // Before "c=b+a" is on screen at all: measured where it would be, a warning.
    fit.start = 0.5;
    expect(codes(p, 'attach')).toEqual([
      ['warning', 'attach-target-hidden', 'clips.2.actions.0.fit'],
    ]);
    // Once it is quiet: nothing to say.
    fit.start = 2.5;
    expect(codes(p, 'attach')).toEqual([]);
    // A glyph of the first clip taken out for good before the tween that goes back to it.
    ca.actions.push(createDisappear(1.2, 'fade_out', [2]));
    cs.actions.push(createFitTween(1.6, 0.4, { clipId: ca.id, glyphs: [2] }));
    const gone = validateProject(p).filter((i) => i.code === 'attach-target-gone');
    expect(gone.map((i) => i.path.join('.'))).toEqual(['clips.2.actions.1.fit']);
    expect(gone[0]!.message).toMatch(/left the screen when the Transform of "s1" goes to it/);
  });

  it('stays between the intro and the outro and clear of the other tweens, as any tween', () => {
    const { p, cb, cs } = boxed();
    cs.outro = { ...defaultOutro('fade_out'), duration: 1 };
    cs.actions.push(createFitTween(4.5, 1, { clipId: cb.id, glyphs: 'all' }));
    expect(validateProject(p).map((i) => i.code)).toContain('action-bounds');
  });
});

describe('the glyphs a fit names, when the target is rendered again', () => {
  it('follow the glyphs; a fit left without any goes, and the report says so', () => {
    const { p, ca, cb, cs } = boxed();
    const kept = createFitTween(2.5, 0.5, { clipId: cb.id, glyphs: [0, 3] });
    const lost = createFitTween(3.5, 0.5, { clipId: cb.id, glyphs: [1] }, [
      { clipId: ca.id, glyphs: 'all' },
    ]);
    const whole = createFitTween(4.5, 0.3, { clipId: cb.id, glyphs: 'all' });
    cs.actions.push(kept, lost, whole);
    // "c=b+a" loses its glyph 1; the others move.
    const report = remapGlyphRefs(p, p.formulas[1]!.id, [2, null, 0, 1]);
    expect(report.droppedFits).toBe(1);
    expect(report.droppedAttachGlyphs).toBe(1);
    const left = p.clips[2]!.actions as TweenAction[];
    expect(left.map((a) => a.id)).toEqual([kept.id, whole.id]);
    expect(left[0]!.fit!.glyphs).toEqual([1, 2]);
    expect(left[1]!.fit!.glyphs).toBe('all');
  });
});
