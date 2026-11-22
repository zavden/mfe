// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { textWords, wrapRows, wrapWords } from '../textWrap';

describe('textWords', () => {
  it('breaks a row at spaces, never inside maths, braces or after a backslash', () => {
    expect(textWords('Hello  world')).toEqual(['Hello', 'world']);
    expect(textWords('a $x + y$ b')).toEqual(['a', '$x + y$', 'b']);
    expect(textWords('\\emph{two words} here')).toEqual(['\\emph{two words}', 'here']);
    expect(textWords('{a b} c \\$ d')).toEqual(['{a b}', 'c', '\\$', 'd']);
    expect(textWords('   ')).toEqual([]);
  });
});

describe('wrapWords', () => {
  const measure = (word: string) => word.length;
  it('fills the lines greedily; a word wider than the line stands alone', () => {
    expect(wrapWords(['aa', 'bb', 'cc', 'dd'], measure, 1, 5)).toEqual(['aa bb', 'cc dd']);
    expect(wrapWords(['aa', 'bb', 'cc'], measure, 1, 100)).toEqual(['aa bb cc']);
    expect(wrapWords(['a', 'toolongword', 'b'], measure, 1, 4)).toEqual(['a', 'toolongword', 'b']);
    expect(wrapWords([], measure, 1, 4)).toEqual([]);
  });

  it('wraps every row on its own and says whether any had to break', () => {
    expect(wrapRows(['aa bb cc', 'dd'], measure, 1, 5)).toEqual({
      lines: ['aa bb', 'cc', 'dd'],
      broken: true,
    });
    expect(wrapRows(['aa bb'], measure, 1, 5)).toEqual({ lines: ['aa bb'], broken: false });
  });
});
