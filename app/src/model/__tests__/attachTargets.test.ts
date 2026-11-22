// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  attachTargets,
  createAttach,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createDisappear,
  createShapeAttach,
  createShapeFormula,
  createTipAttach,
  createTrack,
  defaultIntro,
  defaultOutro,
  FORMAT_VERSION,
  parseProject,
  remapGlyphRefs,
  serializeProject,
  setIdGenerator,
  spansClips,
  timingMeasurementTimes,
  validateProject,
  type Clip,
  type Project,
} from '../index';
import { sequentialIds } from '../../test/sequentialIds';
import { smallProject } from './fixtures';

/* A brace or a shape over glyphs of several clips (format 21, D117): its attachment names the
 * glyphs of one clip, as any attachment does, and those of the others in `also`. What the model
 * knows of it: how it is made, read and written, and what the rules ask of each target. */

let restore: () => void;
beforeEach(() => {
  restore = setIdGenerator(sequentialIds());
});
afterEach(() => restore());

/** `smallProject` — "a+b=c" over [0, 4) with a Write intro, "c=b+a" over [2, 6) with a FadeIn —
 * with its relation gone, and a brace over [3, 4) on glyphs 1 and 2 of the first and glyph 0 of
 * the second, on a third track. */
function spanning(): { p: Project; ca: Clip; cb: Clip; brace: Clip } {
  const p = smallProject();
  p.relations = [];
  const [ca, cb] = p.clips;
  const track = createTrack('Track 3');
  p.tracks.push(track);
  const formula = createBraceFormula({ name: 'b1' });
  p.formulas.push(formula);
  const brace = createClip(formula.id, track.id, 3, 4, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
    attach: createBraceAttach(ca!.id, [1, 2], { also: [{ clipId: cb!.id, glyphs: [0] }] }),
  });
  p.clips.push(brace);
  return { p, ca: ca!, cb: cb!, brace };
}

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
  return result.project;
};

const issuesOf = (p: Project) => validateProject(p).filter((i) => i.severity === 'error');

describe('an attachment over glyphs of several clips', () => {
  it('is made with the other clips in `also`, absent when there is none', () => {
    const also = [{ clipId: 'c2', glyphs: [0, 1] }];
    expect(createBraceAttach('c1', [3], { direction: 180, also })).toEqual({
      clipId: 'c1',
      glyphs: [3],
      rule: 'brace',
      direction: 180,
      buff: 0.2,
      also: [{ clipId: 'c2', glyphs: [0, 1] }],
    });
    expect(createShapeAttach('c1', 'all', 0.1, also)).toEqual({
      clipId: 'c1',
      glyphs: 'all',
      rule: 'shape',
      buff: 0.1,
      also: [{ clipId: 'c2', glyphs: [0, 1] }],
    });
    // The targets are copies: the caller's list is its own.
    expect(createShapeAttach('c1', 'all', 0.1, also).also![0]).not.toBe(also[0]);
    expect('also' in createBraceAttach('c1', [3], { also: [] })).toBe(false);
    expect('also' in createBraceAttach('c1', [3])).toBe(false);
    expect('also' in createShapeAttach('c1', [3], 0.1, [])).toBe(false);
    expect('also' in createShapeAttach('c1', [3])).toBe(false);
  });

  it('lists its targets, the clip it hangs on first', () => {
    const { brace, ca, cb } = spanning();
    expect(attachTargets(brace.attach!)).toEqual([
      { clipId: ca.id, glyphs: [1, 2] },
      { clipId: cb.id, glyphs: [0] },
    ]);
    expect(spansClips(brace.attach!)).toBe(true);
    const one = createBraceAttach(ca.id, [1, 2]);
    expect(attachTargets(one)).toEqual([{ clipId: ca.id, glyphs: [1, 2] }]);
    expect(spansClips(one)).toBe(false);
    expect(spansClips({ ...one, also: [] })).toBe(false);
    expect(attachTargets(createTipAttach('c9'))).toEqual([{ clipId: 'c9', glyphs: 'all' }]);
    expect(spansClips(createAttach('c9', [0]))).toBe(false);
  });
});

describe('an attachment over several clips, in the file', () => {
  it('is kept by a save and a load, a brace and a shape alike', () => {
    const { p, ca, cb } = spanning();
    const shape = createShapeFormula({ name: 's1' });
    p.formulas.push(shape);
    const track = createTrack('Track 4');
    p.tracks.push(track);
    p.clips.push(
      createClip(shape.id, track.id, 3, 4, {
        intro: defaultIntro('none'),
        outro: defaultOutro('none'),
        attach: createShapeAttach(cb.id, 'all', 0.1, [{ clipId: ca.id, glyphs: [4] }]),
      }),
    );
    expect(validateProject(p)).toEqual([]);
    const text = serializeProject(p);
    const again = opened(text);
    expect(again.clips[2]!.attach).toEqual({
      clipId: ca.id,
      glyphs: [1, 2],
      rule: 'brace',
      direction: 0,
      buff: 0.2,
      also: [{ clipId: cb.id, glyphs: [0] }],
    });
    expect(again.clips[3]!.attach).toMatchObject({
      rule: 'shape',
      also: [{ clipId: ca.id, glyphs: [4] }],
    });
    expect(serializeProject(again)).toBe(text);
    expect(text.match(/"also"/g)).toHaveLength(2);
  });

  it('is not in a file of format 20, which opens as it is', () => {
    const text = serializeProject(opened(serializeProject(smallProject())));
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 20');
    expect(old).not.toBe(text);
    expect(old).not.toContain('"also"');
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(20);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(serializeProject(result.project)).toBe(text);
  });

  it('is of a brace or a shape alone, and each of its targets is a clip and its glyphs', () => {
    const { p, ca, cb, brace } = spanning();
    const raw = JSON.parse(serializeProject(p)) as { clips: { attach: Record<string, unknown> }[] };
    const read = (change: (attach: Record<string, unknown>) => void) => {
      const copy = structuredClone(raw);
      change(copy.clips[2]!.attach);
      return parseProject(JSON.stringify(copy));
    };
    expect(read((a) => (a.also = [{ clipId: cb.id }])).ok).toBe(false);
    expect(read((a) => (a.also = [{ clipId: '', glyphs: [0] }])).ok).toBe(false);
    expect(read((a) => (a.also = { clipId: cb.id, glyphs: [0] })).ok).toBe(false);
    expect(read((a) => (a.also = [{ clipId: cb.id, glyphs: 'all' }])).ok).toBe(true);
    // A label beside glyphs, or at a brace's tip, hangs on one clip: its `also` is not read.
    brace.attach = { ...createAttach(ca.id, [1]), also: [{ clipId: cb.id, glyphs: [0] }] } as never;
    const text = serializeProject(p);
    expect(text).toContain('"also"');
    expect('also' in opened(text).clips[2]!.attach!).toBe(false);
  });
});

describe('what the rules ask of every target', () => {
  it('accepts a brace over quiet glyphs of two clips', () => {
    expect(validateProject(spanning().p)).toEqual([]);
  });

  it('checks the clip and the glyphs of each of the others, at its place in `also`', () => {
    const { p, ca, cb, brace } = spanning();
    const withAlso = (also: { clipId: string; glyphs: number[] | 'all' }[]) => {
      brace.attach = createBraceAttach(ca.id, [1, 2], { also });
      return issuesOf(p).map((i) => [i.code, i.path.join('.')]);
    };
    expect(withAlso([{ clipId: 'nope', glyphs: [0] }])).toEqual([
      ['dangling-ref', 'clips.2.attach.also.0.clipId'],
    ]);
    expect(withAlso([{ clipId: brace.id, glyphs: [0] }])).toEqual([
      ['attach-self', 'clips.2.attach.also.0.clipId'],
    ]);
    expect(
      withAlso([
        { clipId: cb.id, glyphs: 'all' },
        { clipId: cb.id, glyphs: [] },
      ]),
    ).toEqual([['attach-empty', 'clips.2.attach.also.1.glyphs']]);
    // "c=b+a" has four glyphs.
    expect(withAlso([{ clipId: cb.id, glyphs: [0, 9] }])).toEqual([
      ['glyph-range', 'clips.2.attach.also.0.glyphs'],
    ]);
    // The clip it hangs on is still checked where it was.
    brace.attach = createBraceAttach('nope', [1], { also: [{ clipId: cb.id, glyphs: [0] }] });
    expect(issuesOf(p).map((i) => i.path.join('.'))).toEqual(['clips.2.attach.clipId']);
  });

  it('needs the glyphs of each of them quiet and on screen when its clip starts', () => {
    const { p, ca, cb, brace } = spanning();
    // "c=b+a" fades in over [2, 3): at 2.5 its glyph is half drawn, the first clip's are quiet.
    brace.start = 2.5;
    const busy = validateProject(p).filter((i) => i.code.startsWith('attach'));
    expect(busy.map((i) => [i.code, i.path.join('.')])).toEqual([
      ['attach-target-busy', 'clips.2.attach'],
    ]);
    expect(busy[0]!.message).toMatch(/attached to glyph 0 of "b" while the intro/);
    // Before "c=b+a" is on screen at all: measured where it would be, a warning.
    brace.start = 1.5;
    brace.end = 2;
    expect(
      validateProject(p)
        .filter((i) => i.code.startsWith('attach'))
        .map((i) => [i.severity, i.code]),
    ).toEqual([['warning', 'attach-target-hidden']]);
    // A glyph of the first clip taken out for good before the brace starts.
    brace.start = 3;
    brace.end = 4;
    ca.actions.push(createDisappear(1.5, 'fade_out', [2]));
    expect(
      validateProject(p)
        .filter((i) => i.code.startsWith('attach'))
        .map((i) => i.code),
    ).toEqual(['attach-target-gone']);
    void cb;
  });

  it('sees a chain of attachments that goes round through one of the others', () => {
    const { p, ca, cb, brace } = spanning();
    // "c=b+a" hangs beside the brace, which spans one of its glyphs: neither can be placed.
    cb.attach = createAttach(brace.id, 'all');
    const cycles = validateProject(p).filter((i) => i.code === 'attach-cycle');
    expect(cycles.map((i) => i.path.join('.'))).toEqual(['clips.1.attach', 'clips.2.attach']);
    expect(cycles[1]!.message).toContain('"b1" → "b" → "b1"');
    // Through the first target the chain ends: the clip it hangs on is checked before.
    void ca;
  });

  it('counts the start of its clip among the instants each of its targets is measured at', () => {
    const { p, ca, cb, brace } = spanning();
    expect([...timingMeasurementTimes(p, [ca.id])]).toEqual([3]);
    expect([...timingMeasurementTimes(p, [cb.id])]).toEqual([3]);
    expect([...timingMeasurementTimes(p, [brace.id])]).toEqual([]);
  });
});

describe('a render that changes the glyphs of a target', () => {
  it('renumbers the glyphs of each target; a target left without any frees the object', () => {
    const { p, ca, cb, brace } = spanning();
    const [a, b] = p.formulas;
    // The first formula: 1 → 0, 2 → gone. Its target keeps a glyph.
    const first = remapGlyphRefs(p, a!.id, [3, 0, null, 1, 2]);
    expect(first).toMatchObject({ droppedAttachGlyphs: 1, detached: 0 });
    expect(brace.attach).toMatchObject({ clipId: ca.id, glyphs: [0] });
    expect(attachTargets(brace.attach!)[1]).toEqual({ clipId: cb.id, glyphs: [0] });
    // The second: its glyph 0 is gone, and it was the only one the brace spanned there.
    const second = remapGlyphRefs(p, b!.id, [null, 0, 1, 2]);
    expect(second).toMatchObject({ droppedAttachGlyphs: 1, detached: 1 });
    expect(brace.attach).toBeNull();
  });

  it('renumbers a target of `also` that keeps its glyphs, ascending', () => {
    const { p, ca, cb, brace } = spanning();
    brace.attach = createBraceAttach(ca.id, 'all', { also: [{ clipId: cb.id, glyphs: [0, 2] }] });
    const report = remapGlyphRefs(p, p.formulas[1]!.id, [3, 1, 0, 2]);
    expect(report).toMatchObject({ droppedAttachGlyphs: 0, detached: 0 });
    expect(attachTargets(brace.attach)).toEqual([
      { clipId: ca.id, glyphs: 'all' },
      { clipId: cb.id, glyphs: [0, 3] },
    ]);
  });
});
