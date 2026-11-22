// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  animatedWhole,
  attachTargets,
  createAppear,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createDisappear,
  createEmphasis,
  createEndsAttach,
  createEndsTween,
  createLineFormula,
  createPartTransform,
  createShapeFormula,
  createTween,
  defaultIntro,
  defaultOutro,
  FORMAT_VERSION,
  glyphEnds,
  glyphMembers,
  hasTips,
  introsOf,
  isFittedRule,
  KINDS,
  LINE_ARC_LIMIT,
  LINE_BUFFS,
  LINE_ANCHORS,
  LINE_TIPS,
  MIN_DASH_LENGTH,
  hasPlacementUses,
  parseProject,
  placementTargets,
  placementUses,
  remapGlyphRefs,
  serializeProject,
  spansClips,
  timingMeasurementTimes,
  tracesAsArrow,
  validateProject,
  type Clip,
  type LineEndSpec,
  type LineFormula,
  type LineKind,
  type Project,
} from '../index';
import { boxSnapshot, smallProject } from './fixtures';

/* A line in the model and in the file (format 26, D137): the kind `line` — a line, a dashed line,
 * an arrow, a double arrow along a `vector` — and the attachment by its ends (`rule: 'ends'`),
 * each end on glyphs of a clip or free at a point; bent into an arc or a spline, with the shape
 * of each of its tips (format 28, D145 and D146). */

const opened = (text: string): Project => {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
};

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** `smallProject` — "a+b=c" over [0, 4), "c=b+a" over [2, 6) — without its relation, and an arrow
 * over [3, 4) on a third track, from `start` to `end` (clip ids `a` and `b` stand for the two). */
function withLine(
  start: LineEndSpec | 'a' | 'b',
  end: LineEndSpec | 'a' | 'b',
  line: LineKind = 'arrow',
): { p: Project; ca: Clip; cb: Clip; clip: Clip } {
  const p = smallProject();
  p.relations = [];
  const [ca, cb] = p.clips as [Clip, Clip];
  const side = (which: LineEndSpec | 'a' | 'b'): LineEndSpec =>
    which === 'a'
      ? { clipId: ca.id, glyphs: [1, 2] }
      : which === 'b'
        ? { clipId: cb.id, glyphs: 'all' }
        : which;
  const formula = createLineFormula({ name: 'l1', line });
  p.formulas.push(formula);
  p.tracks.push({ ...p.tracks[0]!, id: 't-line', name: 'Track 3' });
  const free = 'point' in side(start) && 'point' in side(end);
  const clip = createClip(formula.id, 't-line', 3, 4, {
    ...none,
    attach: free ? null : createEndsAttach(side(start), side(end), LINE_BUFFS[line]),
  });
  p.clips.push(clip);
  return { p, ca, cb, clip };
}

const errors = (p: Project) => validateProject(p).filter((issue) => issue.severity === 'error');

describe('the line kind', () => {
  it('is an unlisted object without a source, drawn or faded in, that hangs by its ends', () => {
    expect(KINDS.line).toMatchObject({
      label: 'Line',
      namePrefix: 'l',
      source: false,
      glyphColors: false,
      transfers: false,
      listed: false,
      fitted: 'ends',
    });
    expect(KINDS.line.intros).toEqual(['none', 'create', 'write', 'fade_in']);
    expect(KINDS.line.outros).toEqual(['none', 'uncreate', 'unwrite', 'fade_out']);
    expect(isFittedRule('ends')).toBe(true);
  });

  it('starts with Manim’s values for its kind, and no intro', () => {
    expect(createLineFormula()).toMatchObject({
      kind: 'line',
      line: 'line',
      vector: [1, 0],
      strokeWidth: 4,
      tipLength: 0.35,
      dashLength: 0.05,
      color: '#FFFFFF',
      intro: { kind: 'none', duration: 0 },
      // Straight, with Manim's triangle at each tip it may have.
      curve: null,
      tip: 'triangle',
      startTip: 'triangle',
    });
    expect(LINE_TIPS).toEqual(['triangle', 'stealth', 'dot']);
    expect(createLineFormula({ line: 'dashed' }).strokeWidth).toBe(4);
    expect(createLineFormula({ line: 'arrow' }).strokeWidth).toBe(6);
    expect(createLineFormula({ line: 'double_arrow' }).strokeWidth).toBe(6);
    expect(LINE_BUFFS).toEqual({ line: 0, dashed: 0, arrow: 0.25, double_arrow: 0.25 });
    expect((['line', 'dashed', 'arrow', 'double_arrow'] as const).map(hasTips)).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it('holds its glyphs as Manim does: itself, its dashes, or itself and then its tips', () => {
    const members = (line: LineKind) =>
      (['ce', 'gl'] as const).map((target) => glyphMembers(createLineFormula({ line }), target));
    expect(members('line')).toEqual(['self', 'self']);
    expect(members('dashed')).toEqual(['submobjects', 'submobjects']);
    expect(members('arrow')).toEqual(['family', 'family']);
    expect(members('double_arrow')).toEqual(['family', 'family']);
  });
});

describe('a line in a project file', () => {
  it('goes to the file and back, with its ends on glyphs and at a point', () => {
    const { p } = withLine('a', { point: [3, -1.5] });
    const text = serializeProject(opened(serializeProject(p)));
    const again = opened(text);
    expect(again.formulas.at(-1)).toMatchObject({ kind: 'line', line: 'arrow', vector: [1, 0] });
    expect(again.clips.at(-1)!.attach).toEqual({
      rule: 'ends',
      start: { clipId: again.clips[0]!.id, glyphs: [1, 2], anchor: 'auto' },
      end: { point: [3, -1.5] },
      buff: 0.25,
    });
    expect(serializeProject(again)).toBe(text);
    expect(errors(again)).toEqual([]);
  });

  it('keeps where on its glyphs each end is: Manim’s own edge, or one of the nine points', () => {
    // An end that names no anchor is `auto`: the edge Manim finds towards the other end.
    expect(createEndsAttach({ clipId: 'c', glyphs: 'all' }, { point: [0, 0] }, 0).start).toEqual({
      clipId: 'c',
      glyphs: 'all',
      anchor: 'auto',
    });
    expect(LINE_ANCHORS).toHaveLength(10);
    for (const anchor of LINE_ANCHORS) {
      const { p, ca, cb } = withLine('a', 'b');
      p.clips.at(-1)!.attach = createEndsAttach(
        { clipId: ca.id, glyphs: [1, 2], anchor },
        { clipId: cb.id, glyphs: 'all', anchor: 'center' },
        0,
      );
      const again = opened(serializeProject(p));
      expect(again.clips.at(-1)!.attach).toMatchObject({
        start: { glyphs: [1, 2], anchor },
        end: { glyphs: 'all', anchor: 'center' },
      });
      expect(errors(again)).toEqual([]);
    }
  });

  it('opens a file of format 26, whose ends on glyphs become `auto`', () => {
    const text = serializeProject(withLine('a', { point: [3, -1.5] }).p);
    const file = JSON.parse(text) as {
      version: number;
      clips: { attach: { start: Record<string, unknown> } | null }[];
    };
    file.version = 26;
    delete file.clips.at(-1)!.attach!.start.anchor;
    const result = parseProject(JSON.stringify(file));
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(26);
    expect(serializeProject(result.project)).toBe(text);
    // In the current format the anchor is asked for, and is one of the ten.
    file.version = FORMAT_VERSION;
    expect(parseProject(JSON.stringify(file)).ok).toBe(false);
    file.clips.at(-1)!.attach!.start.anchor = 'middle';
    expect(parseProject(JSON.stringify(file)).ok).toBe(false);
    file.clips.at(-1)!.attach!.start.anchor = 'dr';
    expect(parseProject(JSON.stringify(file)).ok).toBe(true);
  });

  it('goes to the file and back bent into an arc or a spline, with the shape of each tip', () => {
    const { p } = withLine('a', 'b', 'double_arrow');
    const line = p.formulas.at(-1)!;
    if (line.kind !== 'line') throw new Error('not a line');
    line.tip = 'stealth';
    line.startTip = 'dot';
    for (const curve of [
      { shape: 'arc', degrees: -45, trim: 0.1 },
      {
        shape: 'spline',
        nodes: [
          { at: [0, 0], in: null, out: [0.3, 0.4], smooth: true },
          { at: [1, 0], in: [0.7, -0.4], out: null, smooth: false },
        ],
      },
    ] as const satisfies NonNullable<LineFormula['curve']>[]) {
      line.curve = curve;
      const again = opened(serializeProject(p));
      expect(again.formulas.at(-1)).toMatchObject({ curve, tip: 'stealth', startTip: 'dot' });
      expect(errors(again)).toEqual([]);
    }
  });

  it('runs its spline from its start to its end: its first node at (0, 0), its last at (1, 0)', () => {
    // Audit A1-04: as the path of a pair must (`pair-path`).
    const { p } = withLine('a', 'b');
    const line = p.formulas.at(-1)! as LineFormula;
    const fi = p.formulas.length - 1;
    const node = (at: [number, number]) => ({ at, in: null, out: null, smooth: false });
    const issues = () =>
      errors(p).map((issue) => [issue.code, issue.path.join('.'), issue.message]);
    const refused = [
      [
        'line-curve',
        `formulas.${fi}.curve.nodes`,
        'The curve of "l1" must start at its start and end at its end: its first node at (0, 0) and its last at (1, 0).',
      ],
    ];
    line.curve = { shape: 'spline', nodes: [node([0.3, 0.5]), node([0.6, -0.4])] };
    expect(issues()).toEqual(refused);
    // One end in place is not enough: both are asked.
    line.curve = { shape: 'spline', nodes: [node([0, 0]), node([0.5, 0.5]), node([1, 0.2])] };
    expect(issues()).toEqual(refused);
    line.curve = { shape: 'spline', nodes: [node([0, 0.1]), node([0.5, 0.5]), node([1, 0])] };
    expect(issues()).toEqual(refused);
    line.curve = { shape: 'spline', nodes: [node([0, 0]), node([0.5, 0.5]), node([1, 0])] };
    expect(issues()).toEqual([]);
    // An arc has no nodes to ask about.
    line.curve = { shape: 'arc', degrees: 30, trim: 0 };
    expect(issues()).toEqual([]);
  });

  it('opens a file of format 27, whose lines are straight with a triangle at each tip', () => {
    const text = serializeProject(withLine('a', { point: [3, -1.5] }).p);
    const file = JSON.parse(text) as { version: number; formulas: Record<string, unknown>[] };
    file.version = 27;
    for (const key of ['curve', 'tip', 'startTip']) delete file.formulas.at(-1)![key];
    const result = parseProject(JSON.stringify(file));
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(27);
    expect(result.project.formulas.at(-1)).toMatchObject({
      curve: null,
      tip: 'triangle',
      startTip: 'triangle',
    });
    expect(serializeProject(result.project)).toBe(text);
    // In the current format the three are asked for.
    file.version = FORMAT_VERSION;
    expect(parseProject(JSON.stringify(file)).ok).toBe(false);
  });

  it('goes to the file and back with no attachment: a line between two free ends', () => {
    const { p } = withLine({ point: [0, 0] }, { point: [2, 1] }, 'dashed');
    const again = opened(serializeProject(p));
    expect(again.clips.at(-1)!.attach).toBeNull();
    expect(again.formulas.at(-1)).toMatchObject({ line: 'dashed', dashLength: 0.05 });
    expect(errors(again)).toEqual([]);
  });

  it('refuses a line that is none of the four, a vector that is no vector and an end that is neither', () => {
    const text = serializeProject(withLine('a', 'b').p);
    /** The file with something of its line object, or of its attachment, written otherwise. */
    const broken = (
      change: (line: Record<string, unknown>, attach: Record<string, unknown>) => void,
    ) => {
      const file = JSON.parse(text) as {
        formulas: Record<string, unknown>[];
        clips: { attach: Record<string, unknown> }[];
      };
      change(file.formulas.at(-1)!, file.clips.at(-1)!.attach);
      return JSON.stringify(file);
    };
    expect(parseProject(broken(() => {})).ok).toBe(true);
    for (const file of [
      broken((line) => (line.line = 'curve')),
      broken((line) => (line.vector = [1])),
      broken((line) => (line.vector = 'right')),
      broken((line) => (line.vector = [1, null])),
      broken((line) => (line.tipLength = 0)),
      broken((line) => (line.dashLength = -1)),
      broken((line) => (line.tip = 'square')),
      broken((line) => (line.startTip = null)),
      broken((line) => (line.curve = { shape: 'wave' })),
      broken((line) => (line.curve = { shape: 'arc', degrees: 30 })),
      broken((line) => (line.curve = { shape: 'arc', degrees: LINE_ARC_LIMIT + 1, trim: 0 })),
      broken((line) => (line.curve = { shape: 'arc', degrees: 30, trim: 0.6 })),
      broken((line) => (line.curve = { shape: 'spline', nodes: [] })),
      broken(
        (line) =>
          (line.curve = {
            shape: 'spline',
            nodes: [{ at: [0, 0], in: null, out: null, smooth: false }],
          }),
      ),
      broken((_, attach) => (attach.start = {})),
      broken((_, attach) => (attach.end = { point: [0] })),
      broken((_, attach) => delete attach.buff),
    ]) {
      expect(parseProject(file).ok).toBe(false);
    }
  });

  it('is not in a file of format 25, which opens as it is', () => {
    const text = serializeProject(opened(serializeProject(smallProject())));
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 25');
    expect(old).not.toBe(text);
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(25);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(serializeProject(result.project)).toBe(text);
  });
});

describe('the ends of a line as references to other clips', () => {
  it('lists the glyphs each end is on, the start first', () => {
    const { ca, cb, clip } = withLine('a', 'b');
    const attach = clip.attach!;
    expect(attach.rule).toBe('ends');
    expect(attachTargets(attach)).toEqual([
      { clipId: ca.id, glyphs: [1, 2] },
      { clipId: cb.id, glyphs: 'all' },
    ]);
    expect(spansClips(attach)).toBe(true);
    // One end free, or both on one clip: it hangs on that clip alone.
    expect(spansClips(withLine('a', { point: [0, 0] }).clip.attach!)).toBe(false);
    expect(spansClips(withLine('a', 'a').clip.attach!)).toBe(false);
    expect(attachTargets(withLine({ point: [0, 0] }, 'b').clip.attach!)).toHaveLength(1);
  });

  it('is one use of its clip, measured when the clip starts, each end at its own path', () => {
    const { p, ca, cb, clip } = withLine('a', 'b');
    const [use, ...rest] = placementUses(clip);
    expect(rest).toEqual([]);
    expect(use).toMatchObject({ owner: { kind: 'attach' }, at: 3, path: ['attach'] });
    expect(use!.spots.map((spot) => [spot.target.clipId, spot.path])).toEqual([
      [ca.id, ['attach', 'start']],
      [cb.id, ['attach', 'end']],
    ]);
    // The references themselves: what a draft writes there is written into the attachment.
    const attach = clip.attach as { start: unknown; end: unknown };
    expect(use!.spots[0]!.target).toBe(attach.start);
    expect(use!.spots[1]!.target).toBe(attach.end);
    // A free end is no reference.
    const mixed = withLine({ point: [1, 1] }, 'b');
    expect(placementUses(mixed.clip)[0]!.spots.map((spot) => spot.path)).toEqual([
      ['attach', 'end'],
    ]);
    expect(glyphEnds(mixed.clip.attach as never)).toHaveLength(1);
    // The timing of either host is measured again when the line starts.
    expect([...timingMeasurementTimes(p, [ca.id])]).toEqual([3]);
    expect([...timingMeasurementTimes(p, [cb.id])]).toEqual([3]);
  });

  it('follows its glyphs when a host is rendered again, and is freed whole when an end has none left', () => {
    const { p, ca, clip } = withLine('a', 'b');
    const formula = p.formulas.find((f) => f.id === ca.formulaId)!;
    // "a+b=c": glyph 1 goes, glyph 2 becomes glyph 1.
    expect(remapGlyphRefs(p, formula.id, [0, null, 1, 2, 3])).toMatchObject({
      droppedAttachGlyphs: 1,
      detached: 0,
    });
    expect(clip.attach).toMatchObject({ start: { clipId: ca.id, glyphs: [1] } });
    // Its last glyph goes too: the line stays where it is, with no end on anything.
    expect(remapGlyphRefs(p, formula.id, [0, null, 1, 2])).toMatchObject({ detached: 1 });
    expect(clip.attach).toBeNull();
  });
});

describe('validation of a line’s attachment', () => {
  it('accepts ends on glyphs that are there and quiet', () => {
    expect(errors(withLine('a', 'b').p)).toEqual([]);
    expect(errors(withLine({ point: [0, 2] }, 'b').p)).toEqual([]);
  });

  it('asks for an end on glyphs, for clips that exist and for glyphs they have', () => {
    const { p, clip } = withLine('a', 'b');
    clip.attach = createEndsAttach({ point: [0, 0] }, { point: [1, 1] }, 0);
    expect(errors(p).map((issue) => [issue.code, issue.path.join('.')])).toEqual([
      ['attach-empty', 'clips.2.attach'],
    ]);
    clip.attach = createEndsAttach({ clipId: 'gone', glyphs: 'all' }, { point: [1, 1] }, 0);
    expect(errors(p).map((issue) => [issue.code, issue.path.join('.')])).toEqual([
      ['dangling-ref', 'clips.2.attach.start.clipId'],
    ]);
    clip.attach = createEndsAttach({ point: [1, 1] }, { clipId: clip.id, glyphs: 'all' }, 0);
    expect(errors(p).map((issue) => [issue.code, issue.path.join('.')])).toEqual([
      ['attach-self', 'clips.2.attach.end.clipId'],
    ]);
    clip.attach = createEndsAttach({ clipId: p.clips[0]!.id, glyphs: [99] }, { point: [1, 1] }, 0);
    expect(errors(p).map((issue) => issue.path.join('.'))).toEqual(['clips.2.attach.start.glyphs']);
  });

  it('keeps the ends rule for lines, and a line off what is itself fitted to others', () => {
    const { p, ca, clip } = withLine('a', 'b');
    // A formula cannot hang by its ends.
    const label = createClip(ca.formulaId, 't-line', 1.5, 2, {
      ...none,
      attach: createEndsAttach({ clipId: ca.id, glyphs: 'all' }, { point: [0, 0] }, 0),
    });
    p.clips.push(label);
    expect(errors(p).map((issue) => issue.code)).toEqual(['attach-rule']);
    p.clips.pop();
    // Nor a line by another rule.
    clip.attach = createBraceAttach(ca.id, 'all');
    expect(errors(p).map((issue) => issue.code)).toEqual(['attach-rule']);
    // An end on a brace is refused: on a formula or a text only.
    const brace = createBraceFormula({ name: 'b1' });
    p.formulas.push(brace);
    const braceClip = createClip(brace.id, p.tracks[1]!.id, 6, 9, {
      ...none,
      attach: createBraceAttach(ca.id, 'all'),
    });
    p.clips.push(braceClip);
    clip.start = 7;
    clip.end = 8;
    clip.attach = createEndsAttach({ clipId: braceClip.id, glyphs: 'all' }, { point: [0, 0] }, 0);
    const found = errors(p).filter((issue) => issue.path[1] === 2);
    expect(found.map((issue) => [issue.code, issue.path.join('.')])).toEqual([
      ['attach-rule', 'clips.2.attach.start.clipId'],
    ]);
    expect(found[0]!.message).toContain('goes on a formula or a text');
  });

  it('asks the glyphs of each end to be quiet when the line starts', () => {
    const { p, clip } = withLine('a', 'b');
    // "c=b+a" fades in over [2, 3): a line that starts inside it measures it half drawn.
    clip.start = 2.5;
    clip.end = 3.5;
    const busy = errors(p);
    expect(busy.map((issue) => [issue.code, issue.path.join('.')])).toEqual([
      ['attach-target-busy', 'clips.2.attach'],
    ]);
    expect(busy[0]!.message).toContain('"l1" is attached to');
  });
});

describe('what a line cannot do', () => {
  const codes = (p: Project) => errors(p).map((issue) => [issue.code, issue.path.join('.')]);

  it('is drawn or faded at its own size, never grown or shrunk', () => {
    const { p, clip } = withLine({ point: [0, 0] }, { point: [2, 1] });
    clip.end = 8;
    clip.intro = { ...defaultIntro('grow_from_center'), duration: 0.5 };
    expect(codes(p)).toEqual([['line-animation', 'clips.2.intro.kind']]);
    clip.intro = { ...defaultIntro('fade_in'), duration: 0.5, scale: 2 };
    expect(codes(p)).toEqual([['line-animation', 'clips.2.intro.kind']]);
    clip.intro = { ...defaultIntro('fade_in'), duration: 0.5 };
    clip.outro = { ...defaultOutro('shrink_to_center'), duration: 0.5 };
    expect(codes(p)).toEqual([['line-animation', 'clips.2.outro.kind']]);
    clip.outro = { ...defaultOutro('uncreate'), duration: 0.5 };
    expect(codes(p)).toEqual([]);
  });

  it('has no scale, turn or flip, at its start or by a Transform', () => {
    const { p, clip } = withLine({ point: [0, 0] }, { point: [2, 1] });
    clip.end = 8;
    clip.initial.scale = 2;
    expect(codes(p)).toEqual([['line-pose', 'clips.2.initial']]);
    clip.initial.scale = 1;
    clip.initial.rotation = 30;
    expect(codes(p)).toEqual([['line-pose', 'clips.2.initial']]);
    clip.initial.rotation = 0;
    clip.actions = [createTween(1, 1, { position: [1, 1], opacity: 0.5, color: '#FFFF00' })];
    expect(codes(p)).toEqual([]);
    clip.actions = [createTween(1, 1, { scale: 1.5 })];
    expect(codes(p)).toEqual([['line-pose', 'clips.2.actions.0.to']]);
    clip.actions = [createTween(1, 1, { flipX: true })];
    expect(codes(p)).toEqual([['line-pose', 'clips.2.actions.0.to']]);
  });

  it('takes no block that would scale or reshape it', () => {
    const { p, clip } = withLine({ point: [0, 0] }, { point: [2, 1] });
    clip.end = 8;
    clip.actions = [createEmphasis(1, 'indicate', 'all')];
    expect(codes(p)).toEqual([['line-animation', 'clips.2.actions.0']]);
    clip.actions = [createEmphasis(1, 'flash', 'all')];
    expect(codes(p)).toEqual([]);
  });

  it('is animated whole when it is an arrow: a block on a part of one is an error (audit A5-07)', () => {
    // The Python names an arrow's shaft by the arrow, whose family holds its tips: nothing else
    // of the kind has that, nor has any other object.
    const whole = (['line', 'dashed', 'arrow', 'double_arrow'] as const).map((line) =>
      animatedWhole(createLineFormula({ line })),
    );
    expect(whole).toEqual([false, false, true, true]);
    expect(animatedWhole(createShapeFormula({ shape: 'cross' }))).toBe(false);
    expect(animatedWhole(createBraceFormula())).toBe(false);
    const { p, clip } = withLine({ point: [0, 0] }, { point: [2, 1] }, 'arrow');
    clip.end = 8;
    // Its shaft alone, its tip alone: in every kind of block that names glyphs. Never rendered
    // here, the arrow has the glyphs of its kind: a shaft and a tip.
    clip.actions = [
      createDisappear(0.5, 'fade_out', [0]),
      createAppear(2, 'grow_arrow', [1]),
      createEmphasis(4, 'circumscribe', [0]),
    ];
    expect(codes(p)).toEqual([
      ['arrow-part', 'clips.2.actions.0.glyphs'],
      ['arrow-part', 'clips.2.actions.1.glyphs'],
      ['arrow-part', 'clips.2.actions.2.glyphs'],
    ]);
    expect(errors(p)[0]!.message).toBe(
      '"l1" is an arrow: a block animates it whole, its shaft and its tips together, as Manim does, and this one names a part of it. Set its glyphs to all with All glyphs in its panel.',
    );
    // A part Transform reshapes a line already; of an arrow it names a part too.
    clip.actions = [createPartTransform(1, [1])];
    expect(codes(p)).toEqual([
      ['line-animation', 'clips.2.actions.0'],
      ['arrow-part', 'clips.2.actions.0.glyphs'],
    ]);
    // Every glyph, as `all` or listed, is the whole arrow; a list of none names no part (it
    // animates nothing: a warning of its own), nor do glyphs it does not have (`glyph-range`).
    clip.actions = [
      createDisappear(0.5, 'fade_out', 'all'),
      createAppear(2, 'fade_in', [1, 0]),
      createEmphasis(4, 'flash', []),
    ];
    expect(codes(p)).toEqual([]);
    // A double arrow has two tips: its shaft and one of them are a part of it.
    const line = p.formulas.at(-1)!;
    if (line.kind !== 'line') throw new Error('not a line');
    line.line = 'double_arrow';
    clip.actions = [createDisappear(0.5, 'fade_out', [0, 1])];
    expect(codes(p)).toEqual([['arrow-part', 'clips.2.actions.0.glyphs']]);
    expect(errors(p)[0]!.message).toMatch(/^"l1" is a double arrow: /);
    clip.actions = [createDisappear(0.5, 'fade_out', [0, 1, 2])];
    expect(codes(p)).toEqual([]);
    // Rendered, its glyphs are its snapshot's: ManimGL draws no tip on an arrow of no length.
    line.line = 'arrow';
    line.snapshot = boxSnapshot(['—']);
    clip.actions = [createDisappear(0.5, 'fade_out', [0])];
    expect(codes(p)).toEqual([]);
    line.snapshot = boxSnapshot(['—', '▸']);
    expect(codes(p)).toEqual([['arrow-part', 'clips.2.actions.0.glyphs']]);
    // A line and a dashed line name their glyphs one by one, as Manim does: no rule of the kind.
    line.line = 'dashed';
    line.snapshot = boxSnapshot(['╌', '╌', '╌']);
    clip.actions = [createDisappear(0.5, 'fade_out', [0, 2])];
    expect(codes(p)).toEqual([]);
  });

  it('grows from its start with GrowArrow when it has a tip, and only then (format 29)', () => {
    // An arrow's alone: no other object has it among its intros.
    expect(introsOf(createLineFormula({ line: 'arrow' }))).toContain('grow_arrow');
    expect(introsOf(createLineFormula({ line: 'double_arrow' }))).toContain('grow_arrow');
    expect(introsOf(createLineFormula({ line: 'line' }))).not.toContain('grow_arrow');
    expect(introsOf(createLineFormula({ line: 'dashed' }))).not.toContain('grow_arrow');
    expect(KINDS.math.intros).not.toContain('grow_arrow');
    expect(defaultIntro('grow_arrow')).toMatchObject({ duration: 1, easing: 'smooth' });
    // A bent one is drawn along its way by its GrowArrow (D149); a straight one keeps Manim's.
    const arc = { shape: 'arc', degrees: 30, trim: 0 } as const;
    expect(tracesAsArrow(createLineFormula({ line: 'arrow', curve: arc }))).toBe(true);
    expect(tracesAsArrow(createLineFormula({ line: 'double_arrow', curve: arc }))).toBe(true);
    expect(tracesAsArrow(createLineFormula({ line: 'arrow' }))).toBe(false);
    expect(tracesAsArrow(createLineFormula({ line: 'line', curve: arc }))).toBe(false);
    const { p, clip } = withLine({ point: [0, 0] }, { point: [2, 1] }, 'arrow');
    clip.intro = defaultIntro('grow_arrow');
    expect(codes(p)).toEqual([]);
    expect(codes(opened(serializeProject(p)))).toEqual([]);
    // A line without a tip has nothing to grow; nor has a formula.
    const line = p.formulas.at(-1)!;
    if (line.kind !== 'line') throw new Error('not a line');
    line.line = 'dashed';
    expect(codes(p)).toEqual([['line-animation', 'clips.2.intro.kind']]);
    line.line = 'arrow';
    p.clips[0]!.intro = defaultIntro('grow_arrow');
    expect(codes(p)).toEqual([['grow-arrow', 'clips.0.intro.kind']]);
  });

  it('opens a file of format 28, which has no GrowArrow, as it is', () => {
    const text = serializeProject(withLine({ point: [0, 0] }, { point: [2, 1] }, 'arrow').p);
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 28');
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(28);
    expect(serializeProject(result.project)).toBe(text);
  });
});

describe('a tween that carries the ends of a line (format 30, D144)', () => {
  /** `withLine`'s arrow, free between two points, over [1.5, 3) — while the first formula is
   * whole and still —, with a tween at 1.7 s that carries its ends to glyphs of that formula and
   * to a point. */
  function carried(line: LineKind = 'arrow') {
    const made = withLine({ point: [0, 0] }, { point: [2, 1] }, line);
    made.clip.start = 1.5;
    made.clip.end = 3;
    const tween = createEndsTween(
      0.2,
      0.5,
      {
        start: { clipId: made.ca.id, glyphs: [1, 2], anchor: 'down' },
        end: { point: [3, -1] },
        buff: 0.25,
      },
      { strokeWidth: 2, color: '#FF0000' },
    );
    made.clip.actions.push(tween);
    return { ...made, tween };
  }
  const drawn = { start: [0.5, 0.2], end: [3, -1], trim: 0, center: [1.75, -0.4] } as const;

  it('goes to the file and back, measured or not, and is valid on a line', () => {
    const { p, tween } = carried();
    expect(tween.ends).toEqual({
      start: { clipId: expect.any(String), glyphs: [1, 2], anchor: 'down' },
      end: { point: [3, -1] },
      buff: 0.25,
      degrees: null,
      drawn: null,
    });
    expect(errors(p)).toEqual([]);
    expect(opened(serializeProject(p)).clips.at(-1)!.actions).toEqual([tween]);
    tween.ends.drawn = { ...drawn, start: [...drawn.start], end: [...drawn.end], center: [1, 0] };
    expect(opened(serializeProject(p)).clips.at(-1)!.actions).toEqual([tween]);
  });

  it('opens a file of format 29, which has none, as it is', () => {
    const text = serializeProject(withLine({ point: [0, 0] }, { point: [2, 1] }, 'arrow').p);
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 29');
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(29);
    expect(serializeProject(result.project)).toBe(text);
  });

  it('is one use of its clip, measured when the tween starts: its ends on glyphs', () => {
    const { clip, ca, tween } = carried();
    expect(placementUses(clip)).toEqual([
      {
        owner: { kind: 'ends', tween, index: 0 },
        at: 1.7,
        path: ['actions', 0, 'ends'],
        spots: [{ target: tween.ends.start, path: ['actions', 0, 'ends', 'start'] }],
      },
    ]);
    expect(placementTargets(clip)).toEqual([{ clipId: ca.id, glyphs: [1, 2] }]);
    // Two points are a use too, without a target: the sync measures where the line is then.
    tween.ends.start = { point: [1, 1] };
    expect(placementUses(clip)).toMatchObject([{ owner: { kind: 'ends' }, spots: [] }]);
    expect(hasPlacementUses(clip)).toBe(true);
    clip.actions = [];
    expect(hasPlacementUses(clip)).toBe(false);
  });

  it('is a line’s alone; its ends on glyphs are another clip’s; only an arc has degrees', () => {
    const { p, ca, clip, tween } = carried();
    const codes = (project: Project) => errors(project).map((issue) => issue.code);
    // On a formula's clip.
    ca.actions.push({ ...createEndsTween(0.5, 0.5, tween.ends), id: 'stray' });
    expect(codes(p)).toContain('ends-line');
    ca.actions = [];
    // An end on the line itself, on a clip that is not there, on glyphs it has not.
    tween.ends.start = { clipId: clip.id, glyphs: 'all', anchor: 'auto' };
    expect(codes(p)).toContain('attach-self');
    tween.ends.start = { clipId: 'nowhere', glyphs: 'all', anchor: 'auto' };
    expect(codes(p)).toContain('dangling-ref');
    tween.ends.start = { clipId: ca.id, glyphs: [], anchor: 'auto' };
    expect(codes(p)).toContain('attach-empty');
    tween.ends.start = { point: [0, 0] };
    expect(codes(p)).toEqual([]);
    // Degrees: an arc's, and not a dashed one's.
    tween.ends.degrees = 60;
    expect(codes(p)).toEqual(['ends-degrees']);
    const line = p.formulas.at(-1) as LineFormula;
    line.curve = { shape: 'arc', degrees: 30, trim: 0 };
    expect(codes(p)).toEqual([]);
    line.line = 'dashed';
    expect(codes(p)).toEqual(['ends-degrees']);
    line.line = 'line';
    expect(codes(p)).toEqual([]);
  });

  it('puts its ends on a formula or a text, as an attachment does: not on a brace, a shape or a line', () => {
    // Audit A1-03 and A5-04: the ends of a Transform follow the rules of an attachment's.
    const { p, ca, clip, tween } = carried();
    const brace = createBraceFormula({ name: 'b1' });
    const box = createShapeFormula({ name: 's1', width: 2, height: 1 });
    const other = createLineFormula({ name: 'l2', vector: [1, 1] });
    p.formulas.push(brace, box, other);
    const track = (id: string) => {
      p.tracks.push({ ...p.tracks[0]!, id, name: id });
      return id;
    };
    const hosts = [
      createClip(brace.id, track('t-brace'), 1, 5, {
        ...none,
        attach: createBraceAttach(ca.id, 'all'),
      }),
      createClip(box.id, track('t-box'), 1, 5, none),
      createClip(other.id, track('t-other'), 1, 5, none),
    ];
    p.clips.push(...hosts);
    expect(errors(p)).toEqual([]);
    const index = p.clips.indexOf(clip);
    const rules = () =>
      errors(p)
        .filter((issue) => issue.code === 'attach-rule')
        .map((issue) => [issue.path.join('.'), issue.message]);
    const nouns = ['brace', 'shape', 'line'];
    const names = ['b1', 's1', 'l2'];
    hosts.forEach((host, i) => {
      tween.ends.end = { clipId: host.id, glyphs: 'all', anchor: 'auto' };
      expect(rules()).toEqual([
        [
          `clips.${index}.actions.0.ends.end.clipId`,
          `The Transform of "l1" puts an end on "${names[i]}", a ${nouns[i]}: the end of a line goes on a formula or a text.`,
        ],
      ]);
    });
    // The start too; on a formula, as it was, nothing is said.
    tween.ends.end = { point: [3, -1] };
    tween.ends.start = { clipId: hosts[0]!.id, glyphs: 'all', anchor: 'down' };
    expect(rules().map(([path]) => path)).toEqual([`clips.${index}.actions.0.ends.start.clipId`]);
    tween.ends.start = { clipId: ca.id, glyphs: [1, 2], anchor: 'down' };
    expect(errors(p)).toEqual([]);
  });

  it('keeps an end where it was drawn when its glyphs are gone', () => {
    const { p, ca, tween } = carried();
    tween.ends.drawn = { start: [0.5, 0.2], end: [3, -1], trim: 0, center: [1.75, -0.4] };
    // Its two glyphs are lost in a new render of the formula: the end is free, at that point.
    expect(remapGlyphRefs(p, ca.formulaId, [0, null, null, 1, 2])).toMatchObject({ detached: 1 });
    expect(tween.ends).toMatchObject({ start: { point: [0.5, 0.2] }, end: { point: [3, -1] } });
    expect(errors(p)).toEqual([]);
    // Never measured, the tween has no point to leave it at: it carries no ends any more.
    const again = carried();
    remapGlyphRefs(again.p, again.ca.formulaId, [0, null, null, 1, 2]);
    expect(again.clip.actions).toMatchObject([{ kind: 'tween', to: { strokeWidth: 2 } }]);
    expect('ends' in again.clip.actions[0]!).toBe(false);
  });
});

describe('the dash of a dashed line', () => {
  const dashed = (dashLength: number): Project => {
    const { p } = withLine({ point: [-2, 0] }, { point: [2, 0] }, 'dashed');
    (p.formulas.at(-1) as LineFormula).dashLength = dashLength;
    return p;
  };
  const dashErrors = (p: Project) =>
    errors(p)
      .filter((issue) => issue.code === 'line-dash')
      .map((issue) => issue.path.join('.'));

  it('is at least the least length its fields take', () => {
    expect(MIN_DASH_LENGTH).toBe(0.01);
    expect(dashErrors(dashed(0.05))).toEqual([]);
    expect(dashErrors(dashed(MIN_DASH_LENGTH))).toEqual([]);
    expect(dashErrors(dashed(0.009))).toEqual(['formulas.2.dashLength']);
    expect(dashErrors(dashed(1e-12))).toEqual(['formulas.2.dashLength']);
  });

  it('a file with a shorter one opens, and says so: the dash is the file’s', () => {
    const result = parseProject(serializeProject(dashed(1e-12)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.project.formulas.at(-1) as LineFormula).dashLength).toBe(1e-12);
    expect(result.issues.some((issue) => issue.code === 'line-dash')).toBe(true);
  });

  it('is not looked at in a line that is not dashed, which draws none', () => {
    const { p } = withLine({ point: [-2, 0] }, { point: [2, 0] }, 'arrow');
    (p.formulas.at(-1) as LineFormula).dashLength = 1e-12;
    expect(dashErrors(p)).toEqual([]);
  });
});
