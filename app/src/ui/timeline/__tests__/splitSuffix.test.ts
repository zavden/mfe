// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_SPLIT_SUFFIX, isSplitSuffix, splitSuffixError } from '../splitSuffix';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

describe('the split suffix', () => {
  it('is "_s" by default, a suffix itself', () => {
    expect(DEFAULT_SPLIT_SUFFIX).toBe('_s');
    expect(isSplitSuffix(DEFAULT_SPLIT_SUFFIX)).toBe(true);
    expect(splitSuffixError(DEFAULT_SPLIT_SUFFIX)).toBeNull();
  });

  it('takes 1 to 16 ASCII letters, digits or "_", which keep a name an identifier', () => {
    for (const good of ['_s', 's', '_', '2', '_part2', 'B', '_split_copy_1234', 'a'.repeat(16)]) {
      expect(isSplitSuffix(good), good).toBe(true);
      expect(splitSuffixError(good), good).toBeNull();
      // f1 + suffix, and f1 + suffix + a number, are Python identifiers.
      expect(`f1${good}`).toMatch(IDENTIFIER);
      expect(`f1${good}12`).toMatch(IDENTIFIER);
    }
  });

  it('refuses the rest: empty, too long, spaces, other characters, letters beyond ASCII', () => {
    for (const bad of [
      '',
      'a'.repeat(17),
      ' _s',
      '_s ',
      '_ s',
      '-s',
      '_s.',
      '_é',
      'ß',
      '_s\n',
      '_s$',
    ]) {
      expect(isSplitSuffix(bad), JSON.stringify(bad)).toBe(false);
      expect(splitSuffixError(bad), JSON.stringify(bad)).not.toBeNull();
    }
  });

  it('is a string: anything else stored is not one', () => {
    for (const bad of [undefined, null, 2, true, ['_s'], { suffix: '_s' }]) {
      expect(isSplitSuffix(bad)).toBe(false);
    }
  });

  it('says why a text is not one: empty, or the characters allowed and the limit', () => {
    expect(splitSuffixError('')).toBe('The suffix cannot be empty.');
    const rule =
      'Use at most 16 characters, each a letter (a–z, A–Z), a digit or "_": the suffix becomes part of a Python variable.';
    expect(splitSuffixError('-s')).toBe(rule);
    expect(splitSuffixError('a'.repeat(17))).toBe(rule);
    expect(splitSuffixError(' ')).toBe(rule);
  });
});
