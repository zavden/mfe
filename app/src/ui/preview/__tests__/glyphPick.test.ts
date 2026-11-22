// @vitest-environment node
/* The glyph pick of the preview (glyphPick.ts): which glyphs a rectangle touches, what a click,
 * a range and a rectangle pick, what a pick names, and how it is pruned and described. */
import { describe, expect, it } from 'vitest';
import { rectContour, type Box } from '../../../geom';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createShapeFormula,
  createTexFormula,
  type Project,
} from '../../../model';
import type { Drawable } from '../../../scene';
import type { Selection } from '../../../store';
import {
  describePick,
  drawsSnapshot,
  glyphsTouching,
  pickable,
  pickableClip,
  pickByClick,
  pickByRect,
  pickClipIds,
  pickCount,
  pickedGlyphs,
  pickHas,
  pickKey,
  pickPart,
  pickTarget,
  prunePick,
  samePick,
  singlePart,
  type GlyphPick,
  type PickPart,
  type PickRevision,
  type PickTouch,
} from '../glyphPick';
import { boxSnapshot } from './resolvedBoxes';

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({
  minX,
  minY,
  maxX,
  maxY,
});

const glyph = (clipId: string, index: number, b: Box, key = `${clipId}:${index}`): Drawable => ({
  key,
  clipId,
  glyph: index,
  path: { contours: [rectContour(b)] },
  fill: { color: '#FFFFFF', opacity: 1 },
  stroke: null,
  role: 'object',
  partial: false,
  z: 0,
});

const temp: Drawable = {
  ...glyph('a', -1, box(-5, -3, 5, 3)),
  key: 'emphasis:x:disc',
  role: 'temp',
};

// Clip a: three glyphs in a row, the middle one drawn twice (a morph's pieces). Clip b overlaps.
const drawables = [
  glyph('a', 2, box(1, -0.5, 2, 0.5)),
  glyph('a', 0, box(-2, -0.5, -1, 0.5)),
  glyph('a', 1, box(-0.5, -0.5, 0.5, 0.5)),
  glyph('a', 1, box(-0.5, -0.5, 0.5, 0.5), 'a:1~1'),
  glyph('b', 0, box(0, -1, 3, 1)),
  temp,
];

/** The glyphs picked on one clip; the range starts from the first one listed unless `anchor`
 * says otherwise. */
const part = (
  clipId: string,
  glyphs: number[],
  anchor: number | null = glyphs[0] ?? null,
): PickPart => ({ clipId, selection: { selected: new Set(glyphs), anchor } });

/** A pick over several clips. */
const picks = (...parts: PickPart[]): GlyphPick => ({ parts });

/** A pick in one clip. */
const pick = (clipId: string, glyphs: number[], anchor?: number | null): GlyphPick =>
  picks(part(clipId, glyphs, anchor));

const touch = (clipId: string, glyphs: number[]): PickTouch => ({ clipId, glyphs });

const revision = (key: string): PickRevision => ({ document: 0, session: 0, formulaId: key, key });

/** A project with formula f1 (three glyphs) on clips `a` and `a2`, a LaTeX text on clip `t` and
 * a shape on clip `s`. */
function project(): Project {
  const p = createEmptyProject();
  const three = () =>
    boxSnapshot([box(-2, -0.5, -1, 0.5), box(-0.5, -0.5, 0.5, 0.5), box(1, -0.5, 2, 0.5)]);
  const f = { ...createFormula({ name: 'f1', source: 'abc' }), id: 'f1' };
  f.snapshot = three();
  const text = { ...createTexFormula({ name: 't1', source: 'abc' }), id: 't1' };
  text.snapshot = three();
  const s = { ...createShapeFormula({ name: 's1' }), id: 's1' };
  p.formulas = [f, text, s];
  const clip = (id: string, formulaId: string, track: number) => {
    const c = createClip(formulaId, p.tracks[track]!.id, 0, 4);
    c.id = id;
    return c;
  };
  p.clips = [clip('a', 'f1', 0), clip('a2', 'f1', 1), clip('t', 't1', 1), clip('s', 's1', 1)];
  return p;
}

describe('pickable', () => {
  it('takes the objects of the project, never a temporary effect', () => {
    expect(pickable(drawables[0]!)).toBe(true);
    expect(pickable(temp)).toBe(false);
  });

  it('takes the clips of formulas and texts, not of a brace or a shape, nor an unknown clip', () => {
    const p = project();
    expect(pickableClip(p, 'a')).toBe(true);
    expect(pickableClip(p, 't')).toBe(true);
    expect(pickableClip(p, 's')).toBe(false);
    expect(pickableClip(p, 'zz')).toBe(false);
  });
});

describe('glyphsTouching', () => {
  const any = () => true;
  const only = (id: string) => (clipId: string) => clipId === id;

  it('lists the glyphs whose box the rectangle touches, clip by clip, ascending, each once', () => {
    expect(glyphsTouching(drawables, box(-3, 0, -0.2, 0.2), any)).toEqual([touch('a', [0, 1])]);
    expect(glyphsTouching(drawables, box(-3, -1, 3, 1), any)).toEqual([
      touch('a', [0, 1, 2]),
      touch('b', [0]),
    ]);
    expect(glyphsTouching(drawables, box(1.5, 0, 1.6, 0.1), only('a'))).toEqual([touch('a', [2])]);
  });

  it('lists the clips in the order they are drawn, and none the rectangle does not touch', () => {
    const reversed = [...drawables].reverse();
    expect(glyphsTouching(reversed, box(-3, -1, 3, 1), any)).toEqual([
      touch('b', [0]),
      touch('a', [0, 1, 2]),
    ]);
    expect(glyphsTouching(drawables, box(2.5, -1, 3, 1), any)).toEqual([touch('b', [0])]);
    expect(glyphsTouching(drawables, box(5, 5, 6, 6), any)).toEqual([]);
  });

  it('lists first the clip a drag began on, when the rectangle touches it', () => {
    const all = box(-3, -1, 3, 1);
    expect(glyphsTouching(drawables, all, any, 'b')).toEqual([
      touch('b', [0]),
      touch('a', [0, 1, 2]),
    ]);
    expect(glyphsTouching(drawables, all, any, 'a').map((t) => t.clipId)).toEqual(['a', 'b']);
    expect(glyphsTouching(drawables, box(2.5, -1, 3, 1), any, 'a')).toEqual([touch('b', [0])]);
  });

  it('counts a touched edge, and nothing of a clip that is not taken or of a temporary effect', () => {
    expect(glyphsTouching(drawables, box(-1, 0.5, -0.2, 1), any)).toEqual([touch('a', [0, 1])]);
    expect(glyphsTouching(drawables, box(2.5, -1, 3, 1), only('a'))).toEqual([]); // b alone there
    expect(glyphsTouching(drawables, box(-3, -1, 3, 1), only('b'))).toEqual([touch('b', [0])]);
    expect(glyphsTouching([temp], box(-1, -1, 1, 1), any)).toEqual([]);
  });
});

describe('pickByClick', () => {
  it('starts a pick on the glyph, and toggles one of the same clip', () => {
    const first = pickByClick(null, 'a', 1, false);
    expect(first).toEqual(pick('a', [1]));
    expect(pickByClick(first, 'a', 2, false)).toEqual(pick('a', [1, 2], 2));
    expect(pickByClick(pick('a', [1, 2], 2), 'a', 2, false)).toEqual(pick('a', [1], 2));
  });

  it('is nothing when the last glyph leaves, or when the click was on no glyph', () => {
    expect(pickByClick(pick('a', [1]), 'a', 1, false)).toBeNull();
    expect(pickByClick(pick('a', [1]), 'a', null, false)).toBeNull();
    expect(pickByClick(picks(part('a', [1]), part('b', [0])), 'a', null, false)).toBeNull();
    expect(pickByClick(null, 'a', null, true)).toBeNull();
  });

  it('with Shift takes the range from the last picked glyph; without an anchor it adds', () => {
    expect(pickByClick(pick('a', [1], 1), 'a', 3, true)).toEqual(pick('a', [1, 2, 3], 1));
    expect(pickByClick(pick('a', [5], null), 'a', 3, true)).toEqual(pick('a', [5, 3], 3));
  });

  it('adds a glyph of another clip as a part of its own, after the ones there were', () => {
    const both = pickByClick(pick('a', [1, 2]), 'b', 0, false);
    expect(both).toEqual(picks(part('a', [1, 2]), part('b', [0])));
    // The part of the other clip is the same object: what it owns stays with it.
    const kept = { ...part('a', [1, 2]), revision: revision('fa') };
    expect(pickByClick({ parts: [kept] }, 'b', 0, false)!.parts[0]).toBe(kept);
    // A third glyph, back in the first clip, joins that part, which keeps its place.
    expect(pickByClick(both, 'a', 0, false)).toEqual(
      picks(part('a', [1, 2, 0], 0), part('b', [0])),
    );
  });

  it('takes a range within a clip from the last one picked there, never across clips', () => {
    const both = picks(part('a', [0], 0), part('b', [4], 4));
    expect(pickByClick(both, 'a', 2, true)).toEqual(
      picks(part('a', [0, 1, 2], 0), part('b', [4], 4)),
    );
    expect(pickByClick(both, 'b', 2, true)).toEqual(
      picks(part('a', [0], 0), part('b', [4, 2, 3], 4)),
    );
    // No glyph picked yet in that clip: Shift adds the one clicked.
    expect(pickByClick(pick('a', [0], 0), 'b', 3, true)).toEqual(
      picks(part('a', [0], 0), part('b', [3], 3)),
    );
  });

  it('lets a part go with its last glyph, and keeps the others', () => {
    const both = picks(part('a', [1]), part('b', [0]));
    expect(pickByClick(both, 'a', 1, false)).toEqual(pick('b', [0]));
    expect(pickByClick(both, 'b', 0, false)).toEqual(pick('a', [1]));
  });
});

describe('pickByRect', () => {
  it('picks the touched glyphs, or adds them to the pick the drag began from', () => {
    expect(pickByRect(pick('a', [0]), [touch('a', [1, 2])], false)).toEqual(pick('a', [1, 2], 1));
    expect(pickByRect(pick('a', [0]), [touch('a', [1, 2])], true)).toEqual(pick('a', [0, 1, 2], 0));
  });

  it('is nothing when it touches no glyph, unless it adds to a pick', () => {
    expect(pickByRect(pick('a', [0]), [], false)).toBeNull();
    expect(pickByRect(null, [], true)).toBeNull();
    expect(pickByRect(pick('a', [0]), [], true)).toEqual(pick('a', [0]));
    expect(pickByRect(pick('a', [0]), [touch('b', [])], false)).toBeNull();
  });

  it('picks the glyphs of every clip it touches, leaving what was picked elsewhere', () => {
    const touched = [touch('a', [1, 2]), touch('b', [0])];
    expect(pickByRect(null, touched, false)).toEqual(picks(part('a', [1, 2], 1), part('b', [0])));
    expect(pickByRect(pick('c', [5]), touched, false)).toEqual(
      picks(part('a', [1, 2], 1), part('b', [0])),
    );
  });

  it('with Shift adds them, the parts the drag began from first', () => {
    const before = picks(part('b', [3], 3), part('c', [5]));
    expect(pickByRect(before, [touch('a', [1, 2]), touch('b', [0])], true)).toEqual(
      picks(part('b', [3, 0], 3), part('c', [5]), part('a', [1, 2], 1)),
    );
  });

  it('keeps what a part of the drag’s start owns, whether it adds to it or picks it anew', () => {
    const owned = { parts: [{ ...part('a', [0]), revision: revision('fa') }] };
    for (const additive of [true, false]) {
      const next = pickByRect(owned, [touch('a', [1]), touch('b', [0])], additive)!;
      expect(next.parts[0]!.revision).toEqual(revision('fa'));
      expect(next.parts[1]!.revision).toBeUndefined();
    }
  });
});

describe('what a pick names', () => {
  it('lists the glyphs of a part ascending, and names every glyph as all', () => {
    expect(pickedGlyphs(part('a', [3, 1, 2]))).toEqual([1, 2, 3]);
    expect(pickTarget(part('a', [2, 0, 1]), 3)).toBe('all');
    expect(pickTarget(part('a', [2, 0]), 3)).toEqual([0, 2]);
    expect(pickTarget(part('a', [0]), 0)).toEqual([0]);
  });

  it('gives its clips, its parts and its glyphs', () => {
    const both = picks(part('b', [3, 0]), part('a', [1]));
    expect(pickClipIds(both)).toEqual(['b', 'a']);
    expect(pickCount(both)).toBe(3);
    expect(pickPart(both, 'a')).toBe(both.parts[1]);
    expect(pickPart(both, 'zz')).toBeUndefined();
    expect(pickPart(null, 'a')).toBeUndefined();
    expect(pickHas(both, 'b', 3)).toBe(true);
    expect(pickHas(both, 'a', 3)).toBe(false);
    expect(pickHas(null, 'a', 1)).toBe(false);
    expect(singlePart(both)).toBeNull();
    expect(singlePart(pick('a', [1]))).toEqual(part('a', [1]));
    expect(singlePart(null)).toBeNull();
  });

  it('spells itself for the frame: the clips in order, each with its glyphs ascending', () => {
    expect(pickKey(null)).toBe('');
    expect(pickKey(pick('a', [2, 0]))).toBe('a:0,2');
    expect(pickKey(picks(part('b', [3, 0]), part('a', [1])))).toBe('b:0,3;a:1');
  });

  it('ignores set order but distinguishes range anchors, clips, their order and their owners', () => {
    expect(samePick(pick('a', [1, 2], 1), pick('a', [2, 1], 1))).toBe(true);
    expect(samePick(pick('a', [1, 2], 1), pick('a', [2, 1], 2))).toBe(false);
    expect(samePick(pick('a', [1, 2]), pick('a', [1]))).toBe(false);
    expect(samePick(pick('a', [1]), pick('b', [1]))).toBe(false);
    expect(samePick(null, null)).toBe(true);
    expect(samePick(pick('a', [1]), null)).toBe(false);
    const both = picks(part('a', [1]), part('b', [0]));
    expect(samePick(both, picks(part('a', [1]), part('b', [0])))).toBe(true);
    expect(samePick(both, picks(part('b', [0]), part('a', [1])))).toBe(false);
    expect(samePick(both, pick('a', [1]))).toBe(false);
    const owned = (key: string) => ({ parts: [{ ...part('a', [1]), revision: revision(key) }] });
    expect(samePick(owned('fa'), owned('fa'))).toBe(true);
    expect(samePick(owned('fa'), owned('fb'))).toBe(false);
    expect(samePick(owned('fa'), pick('a', [1]))).toBe(false);
  });

  it('describes itself with the formula and the glyphs, counting alone past a dozen', () => {
    const p = project();
    expect(describePick(p, pick('a', [2, 0]))).toBe('2 glyphs of f1: 0, 2');
    expect(describePick(p, pick('a', [1]))).toBe('1 glyph of f1: 1');
    const many = Array.from({ length: 13 }, (_, i) => i);
    expect(describePick(p, pick('a', many))).toBe('13 glyphs of f1');
    expect(describePick(p, pick('zz', [1]))).toBe('1 glyph of ?: 1');
  });

  it('counts the glyphs and the formulas of a pick over several — objects, with a text', () => {
    const p = project();
    expect(describePick(p, picks(part('a', [2, 0]), part('a2', [1])))).toBe(
      '3 glyphs of 2 formulas',
    );
    expect(describePick(p, picks(part('a', [0]), part('t', [1])))).toBe('2 glyphs of 2 objects');
  });
});

describe('prunePick', () => {
  const clips = (ids: string[]): Selection => ({ kind: 'clips', ids });

  it('keeps the same pick while its clip is the selection on its own', () => {
    const p = project();
    const current = pick('a', [0, 2]);
    expect(prunePick(current, p, clips(['a']))).toBe(current);
    expect(prunePick(current, p, { kind: 'action', clipId: 'a', actionId: 'x' })).toBe(current);
    expect(prunePick(null, p, clips(['a']))).toBeNull();
  });

  it('goes when the selection is another clip, a group or nothing', () => {
    const p = project();
    const current = pick('a', [0]);
    expect(prunePick(current, p, clips(['s']))).toBeNull();
    expect(prunePick(current, p, clips(['a', 's']))).toBeNull();
    expect(prunePick(current, p, { kind: 'none' })).toBeNull();
    expect(prunePick(current, p, { kind: 'formula', id: 'f1' })).toBeNull();
  });

  it('goes with its clip, and loses the glyphs the formula no longer has', () => {
    const p = project();
    p.clips = p.clips.filter((c) => c.id !== 'a');
    expect(prunePick(pick('a', [0]), p, clips(['a']))).toBeNull();
    const shorter = project();
    shorter.formulas[0]!.snapshot = boxSnapshot([box(0, 0, 1, 1)]);
    expect(prunePick(pick('a', [0, 2], 2), shorter, clips(['a']))).toEqual(pick('a', [0], null));
    expect(prunePick(pick('a', [1, 2]), shorter, clips(['a']))).toBeNull();
    const unrendered = project();
    unrendered.formulas[0]!.snapshot = null;
    expect(prunePick(pick('a', [0]), unrendered, clips(['a']))).toBeNull();
  });

  it('keeps a pick over several clips while they are the selection, in any order', () => {
    const p = project();
    const current = picks(part('a', [0, 2]), part('t', [1]));
    expect(prunePick(current, p, clips(['a', 't']))).toBe(current);
    expect(prunePick(current, p, clips(['t', 'a']))).toBe(current);
  });

  it('lets a pick over several clips go when the selection is not exactly its clips', () => {
    const p = project();
    const current = picks(part('a', [0]), part('t', [1]));
    expect(prunePick(current, p, clips(['a']))).toBeNull();
    expect(prunePick(current, p, clips(['a', 's']))).toBeNull();
    expect(prunePick(current, p, clips(['a', 't', 's']))).toBeNull();
    expect(prunePick(current, p, { kind: 'none' })).toBeNull();
  });

  it('lets it all go when one of its clips is gone, or has none of its picked glyphs left', () => {
    const gone = project();
    gone.clips = gone.clips.filter((c) => c.id !== 't');
    expect(prunePick(picks(part('a', [0]), part('t', [1])), gone, clips(['a', 't']))).toBeNull();
    const shorter = project();
    shorter.formulas[0]!.snapshot = boxSnapshot([box(0, 0, 1, 1)]);
    const both = clips(['a', 't']);
    expect(prunePick(picks(part('a', [0, 2], 2), part('t', [1])), shorter, both)).toEqual(
      picks(part('a', [0], null), part('t', [1])),
    );
    expect(prunePick(picks(part('a', [1, 2]), part('t', [1])), shorter, both)).toBeNull();
  });
});

describe('drawsSnapshot', () => {
  const formula = (key: string | null) => ({
    snapshot: key === null ? null : { ...boxSnapshot([box(0, 0, 1, 1)]), key },
  });

  it('tells a render that is of the formula’s snapshot from one of the snapshot before', () => {
    expect(drawsSnapshot(formula('now'), { formula: formula('now') })).toBe(true);
    // The snapshot was amended and its render is not published yet.
    expect(drawsSnapshot(formula('now'), { formula: formula('before') })).toBe(false);
    // A formula that has a snapshot and nothing drawn; one that has neither.
    expect(drawsSnapshot(formula('now'), undefined)).toBe(false);
    expect(drawsSnapshot(formula(null), undefined)).toBe(true);
  });
});

/** The pick type is what the store holds. */
const typed: GlyphPick = pick('a', [1]);
void typed;
