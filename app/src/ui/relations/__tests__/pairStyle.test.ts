import { describe, expect, it } from 'vitest';
import type { GlyphPair } from '../../../model';
import { consumedNote, consumedSources, pairStyleBadge } from '../pairStyle';

const pair = (from: number[], to: number[], more: Partial<GlyphPair> = {}): GlyphPair => ({
  from,
  to,
  style: null,
  ...more,
});

describe('pairStyleBadge', () => {
  it('is the letter of the pair’s style, or of the one it inherits after "I:"', () => {
    expect(pairStyleBadge(pair([0], [0], { style: 'transform' }), 'copy')).toBe('T');
    expect(pairStyleBadge(pair([0], [0], { style: 'copy' }), 'transform')).toBe('C');
    expect(pairStyleBadge(pair([0], [0], { style: 'fade' }), 'transform')).toBe('F');
    expect(pairStyleBadge(pair([0], [0]), 'transform')).toBe('I:T');
    expect(pairStyleBadge(pair([0], [0], { style: 'fade_copy' }), 'transform')).toBe('FC');
    expect(pairStyleBadge(pair([0], [0]), 'fade_copy')).toBe('I:FC');
  });
});

describe('consumedSources', () => {
  it('holds the sources a Transform or a Fade transform takes, with the pair that does', () => {
    const pairs = [
      pair([0], [0]), // inherits
      pair([1, 2], [1, 2], { style: 'fade' }),
      pair([3], [3], { style: 'copy' }),
    ];
    expect([...consumedSources(pairs, 'transform')]).toEqual([
      [0, 0],
      [1, 1],
      [2, 1],
    ]);
    // Under a relation that copies, the pair that inherits consumes nothing.
    expect([...consumedSources(pairs, 'copy')]).toEqual([
      [1, 1],
      [2, 1],
    ]);
    // Nor under one that fades a copy; and a pair of that style of its own consumes none.
    expect([...consumedSources(pairs, 'fade_copy')]).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(consumedSources([pair([0, 1], [0], { style: 'fade_copy' })], 'transform').size).toBe(0);
  });

  it('holds only the principal of a pair whose other sources send copies', () => {
    const copies = pair([2, 4, 5], [0], { style: 'transform', extras: 'copies', principal: 4 });
    expect([...consumedSources([copies], 'transform')]).toEqual([[4, 0]]);
    // Every source of the same pair arrives when they are separate.
    const separate = { ...copies, extras: 'separate' as const };
    expect([...consumedSources([separate], 'transform').keys()]).toEqual([2, 4, 5]);
  });

  it('names the first pair for a glyph two pairs consume (an error of the draft)', () => {
    const pairs = [pair([0], [0]), pair([0], [1])];
    expect([...consumedSources(pairs, 'transform')]).toEqual([[0, 0]]);
  });
});

describe('consumedNote', () => {
  it('says which pair consumes the glyph, with the style it plays, and what is left', () => {
    expect(consumedNote(pair([0], [0]), 0, 'transform')).toBe(
      'pair 1 consumes it (Transform): another pair can only copy it',
    );
    expect(consumedNote(pair([0], [0], { style: 'fade' }), 2, 'copy')).toBe(
      'pair 3 consumes it (Fade transform): another pair can only copy it',
    );
  });
});
