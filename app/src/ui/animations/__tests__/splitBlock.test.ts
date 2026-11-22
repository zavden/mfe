// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clipLifetimes,
  createAppear,
  createDisappear,
  createMorph,
  createPartTransform,
  createTween,
} from '../../../model';
import {
  glyphRuns,
  splitByChoice,
  splitIntoRuns,
  splitOptions,
  splittableGlyphs,
} from '../splitBlock';
import { oneClipScene } from './fixtures';

describe('glyphRuns', () => {
  it('groups consecutive indices', () => {
    expect(glyphRuns([])).toEqual([]);
    expect(glyphRuns([4])).toEqual([[4]]);
    expect(glyphRuns([0, 1, 2])).toEqual([[0, 1, 2]]);
    expect(glyphRuns([0, 1, 3, 4])).toEqual([
      [0, 1],
      [3, 4],
    ]);
    expect(glyphRuns([7, 9, 11])).toEqual([[7], [9], [11]]);
  });
});

describe('splittableGlyphs', () => {
  it('is the explicit list, sorted and without repeats', () => {
    const block = createAppear(1, 'write', [4, 1, 1, 3]);
    expect(splittableGlyphs(block, undefined)).toEqual([1, 3, 4]);
  });

  it("is what the block animates where it is for 'all', and nothing without a lifetime", () => {
    // Glyph 2 waits for the first block and is on screen when the second starts, so the second,
    // of every glyph, animates the other four (which wait for it).
    const block = createAppear(3, 'write', 'all');
    const { project, clip } = oneClipScene({
      glyphs: 5,
      start: 0,
      end: 10,
      actions: [createAppear(1, 'write', [2]), block],
    });
    const life = clipLifetimes(project).get(clip.id);
    expect(splittableGlyphs(block, life)).toEqual([0, 1, 3, 4]);
    expect(splittableGlyphs(block, undefined)).toEqual([]);
  });
});

describe('splitOptions', () => {
  it('counts the glyphs and their runs of a glyph block, and is undefined otherwise', () => {
    expect(splitOptions(createAppear(0, 'write', [0, 1, 3, 4]), undefined)).toEqual({
      glyphs: 4,
      runs: 2,
    });
    expect(splitOptions(createPartTransform(0, [2]), undefined)).toEqual({ glyphs: 1, runs: 1 });
    expect(splitOptions(createTween(0, 1, {}), undefined)).toBeUndefined();
    expect(splitOptions(createMorph(0), undefined)).toBeUndefined();
  });
});

describe('splitIntoRuns', () => {
  it('keeps the first run in the block and gives each other run a new block with the same settings', () => {
    const block = createDisappear(1.5, 'fade_out', [0, 1, 3, 4, 7], {
      duration: 2,
      easing: 'linear',
      lagRatio: 0.3,
      shift: [1, 0],
      scale: 0.5,
    });
    const blocks = splitIntoRuns(block, [0, 1, 3, 4, 7]);
    expect(blocks).not.toBeNull();
    expect(blocks!.map((b) => b.glyphs)).toEqual([[0, 1], [3, 4], [7]]);
    expect(blocks![0]!.id).toBe(block.id);
    const ids = new Set(blocks!.map((b) => b.id));
    expect(ids.size).toBe(3);
    for (const piece of blocks!) {
      expect(piece).toMatchObject({
        kind: 'disappear',
        anim: 'fade_out',
        start: 1.5,
        duration: 2,
        easing: 'linear',
        lagRatio: 0.3,
        shift: [1, 0],
        scale: 0.5,
      });
    }
    // Copies, not shared arrays.
    expect((blocks![1] as typeof block).shift).not.toBe(block.shift);
    expect(block.glyphs).toEqual([0, 1, 3, 4, 7]);
  });

  it('keeps the fields of a part transform', () => {
    const block = createPartTransform(0, [0, 2], { rotation: 30, color: '#FF0000' });
    const blocks = splitIntoRuns(block, [0, 2]);
    expect(blocks!.map((b) => b.glyphs)).toEqual([[0], [2]]);
    expect(blocks![1]).toMatchObject({ kind: 'transform', rotation: 30, color: '#FF0000' });
  });

  it('is null with fewer than two runs', () => {
    expect(splitIntoRuns(createAppear(0, 'write', [1, 2, 3]), [1, 2, 3])).toBeNull();
    expect(splitIntoRuns(createAppear(0, 'write', 'all'), [])).toBeNull();
  });
});

describe('splitByChoice', () => {
  it('moves the chosen glyphs to the new block and leaves the others', () => {
    const block = createAppear(1, 'create', [0, 1, 2, 3]);
    const split = splitByChoice(block, [0, 1, 2, 3], [3, 1, 9]);
    expect(split).not.toBeNull();
    const [kept, out] = split!;
    expect(kept.id).toBe(block.id);
    expect(kept.glyphs).toEqual([0, 2]);
    expect(out.id).not.toBe(block.id);
    expect(out.glyphs).toEqual([1, 3]);
    expect(out).toMatchObject({ kind: 'appear', anim: 'create', start: 1 });
  });

  it('is null when nothing, or everything, is chosen', () => {
    const block = createAppear(1, 'create', [0, 1]);
    expect(splitByChoice(block, [0, 1], [])).toBeNull();
    expect(splitByChoice(block, [0, 1], [5])).toBeNull();
    expect(splitByChoice(block, [0, 1], [0, 1])).toBeNull();
  });
});
