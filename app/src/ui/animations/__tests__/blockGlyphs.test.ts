// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clipLifetimes,
  createAppear,
  createDisappear,
  createMorph,
  createTween,
  defaultIntro,
  type ClipAction,
} from '../../../model';
import {
  glyphsOnScreenBefore,
  namedGlyphs,
  quickActive,
  quickGlyphs,
  quickTarget,
  sortedGlyphs,
  type PickerContext,
} from '../blockGlyphs';
import { oneClipScene } from './fixtures';

/** Five glyphs, 3 and 4 hidden at the start, on a clip [1, 11] with a 1 s Write intro. */
function scene(actions: ClipAction[]) {
  const { project, clip, formula } = oneClipScene({
    glyphs: 5,
    start: 1,
    end: 11,
    actions,
    intro: defaultIntro('write'),
    hiddenGlyphs: [3, 4],
  });
  return { life: clipLifetimes(project).get(clip.id)!, clip, formula };
}

describe('glyphsOnScreenBefore', () => {
  it('counts the glyphs the intro brought, and those an earlier block brought or took', () => {
    const write = createAppear(2, 'write', [3], { duration: 1 }); // 3 comes at 3
    const out = createDisappear(5, 'fade_out', [0], { duration: 1 }); // 0 leaves at 6
    const { life } = scene([write, out]);
    const at = (t: number, a: ClipAction) => [...glyphsOnScreenBefore(life, a, t)].sort();
    expect(at(1.5, write)).toEqual([0, 1, 2]); // the block's own glyph is not counted
    expect(at(2.9, out)).toEqual([0, 1, 2]); // 3 is only coming: it arrives when the Write starts
    expect(at(6, out)).toEqual([0, 1, 2, 3]); // before `out`: the glyph it takes still counts
    const later = createDisappear(9, 'fade_out', 'all', { duration: 1 });
    const again = scene([write, out, later]);
    expect([...glyphsOnScreenBefore(again.life, later, 10)].sort()).toEqual([1, 2, 3]);
  });

  it("does not count a morph's own targets, which its pairs bring in", () => {
    const morph = createMorph(2, { pairs: [{ from: [0], to: [3], style: null }] }); // 3 at 3
    const { life } = scene([morph]);
    expect([...glyphsOnScreenBefore(life, morph, 3)].sort()).toEqual([0, 1, 2]);
    expect([...glyphsOnScreenBefore(life, createTween(5, 1, {}), 6)].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('quick choices', () => {
  const ctx = (onScreen: number[]): PickerContext => ({
    universe: [0, 1, 2, 3, 4],
    onScreen: new Set(onScreen),
    hidden: [3, 4],
  });

  it('pick ascending lists', () => {
    const c = ctx([0, 1, 2]);
    expect(quickGlyphs('all', c)).toEqual([0, 1, 2, 3, 4]);
    expect(quickGlyphs('off-screen', c)).toEqual([3, 4]);
    expect(quickGlyphs('on-screen', c)).toEqual([0, 1, 2]);
    expect(quickGlyphs('hidden', c)).toEqual([3, 4]);
  });

  it('store "all" for appear and disappear blocks, but a list for a part transform', () => {
    const c = ctx([0, 1, 2]);
    expect(quickTarget('all', createAppear(0, 'write', [1]), c)).toBe('all');
    expect(quickTarget('all', createDisappear(0, 'fade_out', [1]), c)).toBe('all');
    expect(quickTarget('on-screen', createAppear(0, 'write', 'all'), c)).toEqual([0, 1, 2]);
  });

  it('say which one the block follows', () => {
    const c = ctx([0, 1, 2]);
    const all = createAppear(0, 'write', 'all');
    expect(quickActive('all', all, c)).toBe(true);
    expect(quickActive('off-screen', all, c)).toBe(false);
    const off = createAppear(0, 'write', [3, 4]);
    expect(quickActive('off-screen', off, c)).toBe(true);
    expect(quickActive('hidden', off, c)).toBe(true);
    expect(quickActive('all', off, c)).toBe(false);
    // Every glyph named by hand is the same as All.
    expect(quickActive('all', createAppear(0, 'write', [0, 1, 2, 3, 4]), c)).toBe(true);
    expect(quickActive('all', createTween(0, 1, {}), c)).toBe(false);
  });
});

describe('glyph lists', () => {
  it('names every glyph for "all" and for a tween', () => {
    expect([...namedGlyphs(createAppear(0, 'write', 'all'), [0, 1, 2])]).toEqual([0, 1, 2]);
    expect([...namedGlyphs(createDisappear(0, 'fade_out', [2, 0]), [0, 1, 2])]).toEqual([2, 0]);
    expect([...namedGlyphs(createTween(0, 1, {}), [0, 1])]).toEqual([0, 1]);
  });

  it('sorts and removes repeats', () => {
    expect(sortedGlyphs(new Set([4, 1, 3]))).toEqual([1, 3, 4]);
    expect(sortedGlyphs([2, 2, 0])).toEqual([0, 2]);
  });
});
