// @vitest-environment node
/* The colour sequence copied from one glyph pick and paired with another (colourSequence.ts):
 * what is copied, which copied glyph each picked glyph takes its colour from, and why a
 * sequence does not go onto a pick. The pairing is held to the glyph orders of the exact LaTeX
 * backend, recorded for 38 expressions as a formula and as the «$…$» of a text
 * (`colourSequenceOrders.json`, whose `about` tells how). */
import { describe, expect, it } from 'vitest';
import { createFormula, type Formula } from '../../../model';
import {
  colourSequenceOf,
  describeColourSequence,
  glyphLabels,
  pairColourSequence,
  pasteNote,
  type ColourSequence,
} from '../colourSequence';
import orders from './colourSequenceOrders.json';

/** A formula whose snapshot has one glyph per label. */
function formulaOf(labels: readonly string[], glyphColors: Record<string, string> = {}): Formula {
  return {
    ...createFormula({ name: 'f1', glyphColors }),
    snapshot: {
      backend: 'latex',
      key: 'test',
      glyphs: labels.map((label, index) => ({ label, center: [index, 0], size: [1, 1] })),
    },
  };
}

/** A sequence of these symbols, each with a colour of its own that names its place. */
function numbered(labels: readonly string[]): ColourSequence {
  return {
    entries: labels.map((label, index) => ({ label, color: `#${index}` })),
    from: 'f1',
    backend: 'latex',
  };
}

const symbols = (text: string) => text.split(' ');

describe('what is copied', () => {
  it('takes the symbols and the own colours of the glyphs, in glyph order', () => {
    const formula = formulaOf(symbols('a + b = c'), { '0': '#FC6255', '4': '#58C4DD' });
    expect(colourSequenceOf(formula, [0, 1, 4])).toEqual({
      entries: [
        { label: 'a', color: '#FC6255' },
        { label: '+', color: null },
        { label: 'c', color: '#58C4DD' },
      ],
      from: 'f1',
      backend: 'latex',
    });
  });

  it('has nothing to copy without glyphs, or with one the snapshot lacks', () => {
    const formula = formulaOf(symbols('a b'));
    expect(colourSequenceOf(formula, [])).toBeNull();
    expect(colourSequenceOf(formula, [1, 2])).toBeNull();
    expect(colourSequenceOf({ ...formula, snapshot: null }, [0])).toBeNull();
    expect(glyphLabels(formula, [1, 0])).toEqual(['b', 'a']);
    expect(glyphLabels(formula, [5])).toBeNull();
  });

  it('describes itself for the menus', () => {
    const formula = formulaOf(symbols('a b c'), { '1': '#FC6255' });
    expect(describeColourSequence(colourSequenceOf(formula, [0, 1, 2])!)).toBe(
      '3 glyphs of f1, 1 coloured',
    );
    expect(describeColourSequence(colourSequenceOf(formula, [1])!)).toBe(
      '1 glyph of f1, 1 coloured',
    );
  });
});

describe('pairing a sequence with a pick', () => {
  it('goes in order onto the same symbols in the same order', () => {
    const formula = formulaOf(symbols('a b c'), { '0': '#FC6255', '2': '#58C4DD' });
    const sequence = colourSequenceOf(formula, [0, 1, 2])!;
    // «Mi formula es: $abc$»: the pick is the three glyphs of the formula inside the text.
    expect(pairColourSequence(sequence, symbols('a b c'))).toEqual({
      ok: true,
      colors: ['#FC6255', null, '#58C4DD'],
      from: [0, 1, 2],
      reordered: false,
      unlabelled: 0,
      mixed: null,
    });
  });

  it('gives each glyph the colour of its own symbol where the orders differ', () => {
    // \sum_{i=1}^{n} a_i: a formula writes the upper limit first, the «$…$» of a text the ∑.
    const sequence = numbered(symbols('n ∑ i = 1 a i'));
    expect(pairColourSequence(sequence, symbols('∑ n i = 1 a i'))).toEqual({
      ok: true,
      colors: ['#1', '#0', '#2', '#3', '#4', '#5', '#6'],
      from: [1, 0, 2, 3, 4, 5, 6],
      reordered: true,
      unlabelled: 0,
      mixed: null,
    });
  });

  it('pairs equal symbols in their order: the first with the first', () => {
    const paired = pairColourSequence(numbered(symbols('x + x 2')), symbols('x 2 + x'));
    expect(paired).toMatchObject({ ok: true, from: [0, 3, 1, 2], reordered: true });
  });

  it('knows a symbol under the names two renderers give it', () => {
    // MathJax labels an italic letter with its mathematical code point, and a minus as "−".
    const paired = pairColourSequence(numbered(['𝑎', '−', '𝑏']), symbols('a - b'));
    expect(paired).toMatchObject({ ok: true, from: [0, 1, 2], reordered: false });
  });

  it('does not go onto another number of glyphs', () => {
    expect(pairColourSequence(numbered(symbols('a b c')), symbols('a b'))).toEqual({
      ok: false,
      reason: 'The copied sequence has 3 glyphs; this selection has 2.',
    });
    expect(pairColourSequence(numbered(['a']), symbols('a b'))).toEqual({
      ok: false,
      reason: 'The copied sequence has 1 glyph; this selection has 2.',
    });
  });

  it('does not go onto other symbols, and says which', () => {
    expect(pairColourSequence(numbered(symbols('a + b')), symbols('a + c'))).toEqual({
      ok: false,
      reason: 'The symbols differ: the copied sequence has b where this selection has c.',
    });
    // The same symbols, one of them once more.
    expect(pairColourSequence(numbered(symbols('x x y')), symbols('x y y'))).toEqual({
      ok: false,
      reason: 'The symbols differ: the copied sequence has x where this selection has y.',
    });
    const long = pairColourSequence(
      numbered(symbols('a b c d e f g h')),
      symbols('1 2 3 4 5 6 7 8'),
    );
    expect(long).toEqual({
      ok: false,
      reason:
        'The symbols differ: the copied sequence has a b c d e f … where this selection has 1 2 3 4 5 6 ….',
    });
  });
});

describe('what the symbols do not tell', () => {
  it('counts the glyphs without a known symbol, which go with one another in glyph order', () => {
    const paired = pairColourSequence(numbered(symbols('? a ? ?')), symbols('? ? a ?'));
    expect(paired).toMatchObject({ ok: true, from: [0, 2, 1, 3], unlabelled: 3 });
    // Whatever they are: an unnamed glyph is taken for any other.
    expect(pairColourSequence(numbered(symbols('a ?')), symbols('a ?'))).toMatchObject({
      ok: true,
      unlabelled: 1,
    });
    expect(pairColourSequence(numbered(symbols('a ?')), symbols('a b'))).toMatchObject({
      ok: false,
    });
  });

  it('tells two renderers apart when a symbol comes more than once', () => {
    // MathJax writes a sum's ∑ before its limits, LaTeX's display style the upper limit first.
    const copied: ColourSequence = { ...numbered(symbols('∑ i = 1 n i')), backend: 'mathjax' };
    expect(pairColourSequence(copied, symbols('n ∑ i = 1 i'), 'latex')).toMatchObject({
      ok: true,
      mixed: { from: 'mathjax', to: 'latex' },
    });
    // The same renderer, said or not; or no symbol to mistake for another.
    expect(pairColourSequence(copied, symbols('n ∑ i = 1 i'), 'mathjax')).toMatchObject({
      mixed: null,
    });
    expect(pairColourSequence(copied, symbols('n ∑ i = 1 i'))).toMatchObject({ mixed: null });
    const plain: ColourSequence = { ...numbered(symbols('a + b')), backend: 'mathjax' };
    expect(pairColourSequence(plain, symbols('a + b'), 'latex')).toMatchObject({ mixed: null });
  });

  it('writes the line under Paste', () => {
    const sequence = numbered(symbols('n ∑ i = 1 a i'));
    expect(pasteNote(null, null)).toBe('Nothing copied yet.');
    expect(pasteNote(sequence, pairColourSequence(sequence, symbols('a b')))).toBe(
      'The copied sequence has 7 glyphs; this selection has 2.',
    );
    expect(pasteNote(sequence, pairColourSequence(sequence, symbols('n ∑ i = 1 a i')))).toBe(
      '7 glyphs of f1, 7 coloured.',
    );
    expect(pasteNote(sequence, pairColourSequence(sequence, symbols('∑ n i = 1 a i')))).toBe(
      '7 glyphs of f1, 7 coloured. Paired by symbol: the glyph orders differ.',
    );
    const unnamed = numbered(symbols('? a ?'));
    expect(pasteNote(unnamed, pairColourSequence(unnamed, symbols('? a ?')))).toBe(
      '3 glyphs of f1, 3 coloured. 2 glyphs have no known symbol: they are paired in glyph order.',
    );
    // One alone has nothing to be mistaken for.
    const one = numbered(symbols('a ?'));
    expect(pasteNote(one, pairColourSequence(one, symbols('a ?')))).toBe(
      '2 glyphs of f1, 2 coloured.',
    );
    const other: ColourSequence = { ...numbered(symbols('? x ? x')), backend: 'mathjax' };
    expect(pasteNote(other, pairColourSequence(other, symbols('x ? x ?'), 'pango'))).toBe(
      '4 glyphs of f1, 4 coloured. Paired by symbol: the glyph orders differ. ' +
        '2 glyphs have no known symbol: they are paired in glyph order. ' +
        'Copied from a MathJax render, pasted on a Pango one: ' +
        'equal symbols may be paired in another order.',
    );
  });
});

describe('the same expression as a formula and inside a text (exact LaTeX orders)', () => {
  /** A sum inside its own upper limit: the two ∑ are the only equal symbols whose order the two
   * styles swap. Pinned below as the known limit. */
  const NESTED = '\\sum_{n=1}^{\\sum_{n=1}^{n} n} n';
  const cases = orders.cases.map((entry) => ({
    source: entry.source,
    formula: symbols(entry.formula),
    text: symbols(entry.text),
    pairs: entry.pairs.split(' ').map(Number),
  }));

  it('has the measured cases: 38 expressions, 22 of them in another order', () => {
    expect(cases).toHaveLength(38);
    expect(cases.filter((entry) => entry.formula.join() !== entry.text.join())).toHaveLength(22);
    for (const entry of cases) {
      expect(entry.text).toHaveLength(entry.formula.length);
      expect([...entry.pairs].sort((a, b) => a - b)).toEqual(entry.formula.map((_, i) => i));
    }
  });

  const exact = cases.filter((entry) => entry.source !== NESTED);

  it.each(exact)('formula → text: $source', ({ formula, text, pairs }) => {
    const paired = pairColourSequence(numbered(formula), text);
    // Text glyph pairs[i] is formula glyph i.
    const expected: number[] = [];
    pairs.forEach((j, i) => (expected[j] = i));
    expect(paired).toMatchObject({ ok: true, from: expected });
  });

  it.each(exact)('text → formula: $source', ({ formula, text, pairs }) => {
    const paired = pairColourSequence(numbered(text), formula);
    expect(paired).toMatchObject({ ok: true, from: pairs });
  });

  it('swaps the two ∑ of a sum inside its own upper limit (the known limit)', () => {
    const nested = cases.find((entry) => entry.source === NESTED)!;
    const paired = pairColourSequence(numbered(nested.text), nested.formula);
    if (!paired.ok) throw new Error(paired.reason);
    const wrong = paired.from.flatMap((j, i) => (j === nested.pairs[i] ? [] : [nested.formula[i]]));
    expect(wrong).toEqual(['∑', '∑']);
  });
});
