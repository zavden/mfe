// @vitest-environment node
/* The pairing of a colour sequence (colourSequence.ts) held to the glyph orders of nested
 * expressions: a selection of the 2,160 measured with the exact LaTeX backend as a formula and
 * as the «$…$» of a text (`colourSequenceNested.json`, whose `about` tells how and how many of
 * each kind) — every distinct reordering, every construct outermost and innermost, and the two
 * known limits: an operator inside the upper limit of the same operator, and a delimiter or a
 * radical that display style builds from pieces. */
import { describe, expect, it } from 'vitest';
import { pairColourSequence, type ColourSequence } from '../colourSequence';
import nested from './colourSequenceNested.json';

/** A sequence of these symbols, each with a colour of its own that names its place. */
function numbered(labels: readonly string[]): ColourSequence {
  return {
    entries: labels.map((label, index) => ({ label, color: `#${index}` })),
    from: 'f1',
    backend: 'latex',
  };
}

const symbols = (text: string) => text.split(' ');

describe('nested expressions as a formula and inside a text (exact LaTeX orders)', () => {
  const cases = nested.cases.map((entry) => ({
    source: entry.source,
    limit: 'limit' in entry ? entry.limit : null,
    formula: symbols(entry.formula),
    text: symbols(entry.text),
    pairs: entry.pairs === null ? null : entry.pairs.split(' ').map(Number),
  }));
  const paired = cases.flatMap((entry) => (entry.pairs ? [{ ...entry, pairs: entry.pairs }] : []));
  const right = paired.filter((entry) => entry.limit === null);
  /** The symbols of `formula` that a pairing gives the colour of another glyph. */
  const mispaired = (entry: (typeof paired)[number]) => {
    const pairing = pairColourSequence(numbered(entry.text), entry.formula);
    if (!pairing.ok) throw new Error(pairing.reason);
    return pairing.from.flatMap((j, i) => (j === entry.pairs[i] ? [] : [entry.formula[i]!]));
  };

  it('has the measured cases, each a pairing of all its glyphs', () => {
    expect(cases.length).toBeGreaterThan(100);
    expect(
      right.filter((entry) => entry.formula.join() !== entry.text.join()).length,
    ).toBeGreaterThan(40);
    expect(new Set(cases.map((entry) => entry.source)).size).toBe(cases.length);
    for (const entry of paired) {
      expect(entry.text).toHaveLength(entry.formula.length);
      expect([...entry.pairs].sort((a, b) => a - b)).toEqual(entry.formula.map((_, i) => i));
    }
  });

  it.each(right)('formula ↔ text: $source', ({ formula, text, pairs }) => {
    const expected: number[] = [];
    pairs.forEach((j, i) => (expected[j] = i));
    expect(pairColourSequence(numbered(formula), text)).toMatchObject({ ok: true, from: expected });
    expect(pairColourSequence(numbered(text), formula)).toMatchObject({ ok: true, from: pairs });
  });

  it('swaps an operator with the same operator inside its upper limit, and nothing else', () => {
    const limited = paired.filter((entry) => entry.limit === 'operator');
    expect(limited.length).toBeGreaterThan(5);
    for (const entry of limited) {
      const wrong = [...new Set(mispaired(entry))];
      expect(wrong, entry.source).toHaveLength(1);
      expect(['∑', '∏', '⋃'], entry.source).toContain(wrong[0]);
    }
  });

  it('does not go where display style builds a delimiter or a radical from pieces', () => {
    const pieces = cases.filter((entry) => entry.limit === 'pieces');
    expect(pieces.length).toBeGreaterThan(5);
    for (const entry of pieces) {
      expect(entry.pairs, entry.source).toBeNull();
      expect(entry.formula.length, entry.source).not.toBe(entry.text.length);
      expect(pairColourSequence(numbered(entry.formula), entry.text), entry.source).toEqual({
        ok: false,
        reason:
          `The copied sequence has ${entry.formula.length} glyphs; ` +
          `this selection has ${entry.text.length}.`,
      });
    }
  });
});
