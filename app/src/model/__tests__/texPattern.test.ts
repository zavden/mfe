// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  findOccurrences,
  labelColor,
  labelledLatex,
  labelOfFill,
  matchPatterns,
  normalizePattern,
  patternIssue,
  resolveSpans,
  tokenizeTex,
} from '../texPattern';

const texts = (source: string) => tokenizeTex(source).map((t) => t.text);

describe('tokenizeTex', () => {
  it('reads commands, braces, breaks and characters; spaces are not tokens', () => {
    expect(texts('\\frac{a}{b} + x_1 &= y \\\\ \\, z')).toEqual([
      '\\frac',
      '{',
      'a',
      '}',
      '{',
      'b',
      '}',
      '+',
      'x',
      '_',
      '1',
      '&',
      '=',
      'y',
      '\\\\',
      '\\,',
      'z',
    ]);
    expect(tokenizeTex('x &= y \\\\ \\alpha').map((t) => t.kind)).toEqual([
      'char',
      'column',
      'char',
      'char',
      'row',
      'command',
    ]);
  });

  it("keeps every token's offsets in the source", () => {
    const tokens = tokenizeTex(' \\xi  12');
    expect(tokens.map((t) => [t.text, t.start, t.end])).toEqual([
      ['\\xi', 1, 4],
      ['1', 6, 7],
      ['2', 7, 8],
    ]);
  });
});

describe('tokenizeTex with sized delimiters', () => {
  it('keeps \\left, \\right, \\middle and \\big… with their delimiter as one token', () => {
    const source = '\\left( x \\right) + \\big\\{ y \\big\\} \\left . z \\middle| w \\right|';
    const tokens = tokenizeTex(source);
    expect(tokens.map((t) => t.text)).toEqual([
      '\\left(',
      'x',
      '\\right)',
      '+',
      '\\big\\{',
      'y',
      '\\big\\}',
      '\\left.',
      'z',
      '\\middle|',
      'w',
      '\\right|',
    ]);
    expect(tokens[0]!.kind).toBe('command');
    expect(tokens[4]!.kind).toBe('command');
    // `\left .` spans the space between the command and its delimiter.
    const left = tokens[7]!;
    expect(source.slice(left.start, left.end)).toBe('\\left .');
    // A letter is no delimiter, and \leftarrow is its own command.
    expect(texts('\\left a \\leftarrow')).toEqual(['\\left', 'a', '\\leftarrow']);
  });

  it('so a pattern "(" does not cover the delimiter of a \\left(', () => {
    const match = matchPatterns('\\left( x \\right) + (y)', ['(']);
    expect(match.spans).toEqual([{ start: 4, end: 5, label: 0 }]);
    expect(match.labelled).toBe('\\left( x \\right) + {\\color[RGB]{1,0,1}(}y)');
  });

  it('and a pattern with a \\left … \\right pair wraps the pair whole', () => {
    const match = matchPatterns('a = \\left( x \\right)', ['\\left( x \\right)']);
    expect(match.labelled).toBe('a = {\\color[RGB]{1,0,1}\\left( x \\right)}');
  });
});

describe('normalizePattern and patternIssue', () => {
  it('drops the math delimiters people type and the spaces around', () => {
    expect(normalizePattern(' $x$ ')).toBe('x');
    expect(normalizePattern('$$ x^2 $$')).toBe('x^2');
    expect(normalizePattern('\\( \\frac{a}{b} \\)')).toBe('\\frac{a}{b}');
    expect(normalizePattern('\\[x\\]')).toBe('x');
    expect(normalizePattern('$')).toBe('$');
    expect(normalizePattern('\\$')).toBe('\\$');
  });

  it('refuses an empty pattern, unbalanced braces and row or column breaks', () => {
    expect(patternIssue('')).toMatch(/Type some LaTeX/);
    expect(patternIssue('\\frac{a')).toMatch(/braces/);
    expect(patternIssue('a}')).toMatch(/braces/);
    expect(patternIssue('a \\\\ b')).toMatch(/row or column/);
    expect(patternIssue('a & b')).toMatch(/row or column/);
    expect(patternIssue('\\frac{a}{b}')).toBeNull();
    expect(patternIssue('\\{ x \\}')).toBeNull();
  });

  it('wants \\left with its \\right, and \\middle between them', () => {
    const pair = '\\left and \\right go together: a pattern takes both or neither.';
    expect(patternIssue('\\left( x')).toBe(pair);
    expect(patternIssue('x \\right)')).toBe(pair);
    expect(patternIssue('\\left')).toBe(pair);
    expect(patternIssue('\\middle|')).toBe('\\middle goes between \\left and \\right.');
    expect(patternIssue('\\left( x \\middle| y \\right)')).toBeNull();
    expect(patternIssue('\\big( x')).toBeNull();
    expect(patternIssue('\\leftarrow')).toBeNull();
  });
});

describe('findOccurrences', () => {
  const find = (source: string, pattern: string) =>
    findOccurrences(tokenizeTex(source), tokenizeTex(pattern));

  it('finds every occurrence, leftmost first, without overlaps', () => {
    expect(find('x + x^2 = \\frac{x}{2}', 'x')).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 8, end: 9 },
    ]);
    expect(find('xxx', 'xx')).toEqual([{ start: 0, end: 2 }]);
  });

  it('matches on tokens: spaces do not count and a command is one token', () => {
    expect(find('xy + \\frac {a} {b}', 'x y')).toEqual([{ start: 0, end: 2 }]);
    expect(find('xy + \\frac {a} {b}', '\\frac{a}{b}')).toEqual([{ start: 3, end: 10 }]);
    expect(find('\\xi + \\x', 'x')).toEqual([]);
    expect(find('\\alpha\\beta', '\\beta')).toEqual([{ start: 1, end: 2 }]);
  });

  it('finds nothing for an empty pattern', () => {
    expect(find('x', '')).toEqual([]);
  });
});

describe('resolveSpans', () => {
  it('keeps disjoint spans of every pattern, sorted', () => {
    const plan = resolveSpans([[{ start: 4, end: 5 }], [{ start: 0, end: 2 }]]);
    expect(plan.spans).toEqual([
      { start: 0, end: 2, label: 1 },
      { start: 4, end: 5, label: 0 },
    ]);
    expect(plan.overlapping).toEqual([]);
  });

  it('lets the later pattern win: inside it an earlier occurrence is dropped, around it it stays', () => {
    // pattern 0 "x" at 2 and 6; pattern 1 "\frac{x}{2}" over 0–7 (x inside at 2).
    const inside = resolveSpans([
      [
        { start: 2, end: 3 },
        { start: 9, end: 10 },
      ],
      [{ start: 0, end: 7 }],
    ]);
    expect(inside.spans).toEqual([
      { start: 0, end: 7, label: 1 },
      { start: 9, end: 10, label: 0 },
    ]);
    // pattern 0 "\frac{x}{2}" over 0–7; pattern 1 "x" at 2: nested, the inner (later) wins there.
    const around = resolveSpans([[{ start: 0, end: 7 }], [{ start: 2, end: 3 }]]);
    expect(around.spans).toEqual([
      { start: 0, end: 7, label: 0 },
      { start: 2, end: 3, label: 1 },
    ]);
    expect(around.overlapping).toEqual([]);
    // The same tokens twice: the later pattern keeps them.
    expect(resolveSpans([[{ start: 1, end: 3 }], [{ start: 1, end: 3 }]]).spans).toEqual([
      { start: 1, end: 3, label: 1 },
    ]);
  });

  it('drops an earlier occurrence that partly overlaps a later one, and says which pattern', () => {
    // "a b" (0) and "b c" (1) over "a b c".
    const plan = resolveSpans([[{ start: 0, end: 2 }], [{ start: 1, end: 3 }]]);
    expect(plan.spans).toEqual([{ start: 1, end: 3, label: 1 }]);
    expect(plan.overlapping).toEqual([0]);
  });
});

describe('labels', () => {
  it('number the patterns from #010001, and read back from a fill', () => {
    expect(labelColor(0)).toEqual([1, 0, 1]);
    expect(labelColor(255)).toEqual([1, 1, 0]);
    expect(labelOfFill('#010001')).toBe(0);
    expect(labelOfFill('#010100')).toBe(255);
    expect(labelOfFill('#000000')).toBeNull();
    expect(labelOfFill('currentColor')).toBeNull();
    expect(labelOfFill(undefined)).toBeNull();
    expect(labelOfFill(null)).toBeNull();
  });

  it('never take the colours ManimGL gives its own {{ }} groups (#000001, #000002…)', () => {
    for (let label = 0; label < 70000; label++) {
      const [r, g, b] = labelColor(label);
      if (r === 0) throw new Error(`label ${label} is #00${g}${b}: ManimGL's`);
    }
    expect(labelOfFill('#000001')).toBeNull();
    expect(labelOfFill('#0000ff')).toBeNull();
    expect(labelOfFill('#00ffff')).toBeNull();
  });
});

describe('labelledLatex', () => {
  it('wraps each span in its colour group at the source offsets', () => {
    const source = 'a + x^2 = \\frac{x}{2}';
    const tokens = tokenizeTex(source);
    expect(
      labelledLatex(source, tokens, [
        { start: 2, end: 3, label: 0 },
        { start: 6, end: 13, label: 1 },
      ]),
    ).toBe('a + {\\color[RGB]{1,0,1}x}^2 = {\\color[RGB]{1,0,2}\\frac{x}{2}}');
  });

  it('puts a space after a brace of the source, so that no {{ run forms', () => {
    // ManimCE splits a `{{ … }}` that follows a space into parts (the colour then leaks out
    // of ours), and ManimGL labels every `{{ … }}` group itself.
    const source = '\\frac{x}{2} + {y}';
    const tokens = tokenizeTex(source);
    expect(
      labelledLatex(source, tokens, [
        { start: 2, end: 3, label: 0 },
        { start: 9, end: 10, label: 1 },
      ]),
    ).toBe('\\frac{ {\\color[RGB]{1,0,1}x}}{2} + { {\\color[RGB]{1,0,2}y}}');
  });

  it('nests groups that start or end together, outer first', () => {
    const source = '\\frac{x}{2}';
    const tokens = tokenizeTex(source);
    const out = labelledLatex(source, tokens, [
      { start: 0, end: 7, label: 0 },
      { start: 2, end: 3, label: 1 },
      { start: 5, end: 6, label: 2 },
    ]);
    expect(out).toBe(
      '{\\color[RGB]{1,0,1}\\frac{ {\\color[RGB]{1,0,2}x}}{ {\\color[RGB]{1,0,3}2}}}',
    );
    const both = labelledLatex('xy', tokenizeTex('xy'), [
      { start: 0, end: 2, label: 0 },
      { start: 0, end: 1, label: 1 },
      { start: 1, end: 2, label: 2 },
    ]);
    expect(both).toBe('{\\color[RGB]{1,0,1}{\\color[RGB]{1,0,2}x}{\\color[RGB]{1,0,3}y}}');
  });
});

describe('matchPatterns', () => {
  it('puts it together: patterns as typed, invalid ones skipped, overlaps reported', () => {
    const match = matchPatterns('a x + \\sin x = \\frac{x}{2}', ['$x$', '\\frac{a', '\\sin x']);
    expect(match.invalid).toEqual([1]);
    expect(match.overlapping).toEqual([]);
    expect(match.spans).toEqual([
      { start: 1, end: 2, label: 0 },
      { start: 3, end: 5, label: 2 },
      { start: 8, end: 9, label: 0 },
    ]);
    expect(match.labelled).toBe(
      'a {\\color[RGB]{1,0,1}x} + {\\color[RGB]{1,0,3}\\sin x} = \\frac{ {\\color[RGB]{1,0,1}x}}{2}',
    );
  });

  it('leaves a source without matches as it is', () => {
    expect(matchPatterns('y = 2', ['x']).labelled).toBe('y = 2');
  });
});
