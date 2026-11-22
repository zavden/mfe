// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  defaultValues,
  instantiateTemplate,
  placeholderIssues,
  placeholderNumbers,
  placeholderRows,
} from '../placeholders';

const values = (entries: Record<number, string>) =>
  new Map(Object.entries(entries).map(([n, value]) => [Number(n), value]));

describe('placeholderNumbers', () => {
  it('lists the numbers once each, in the order they first appear', () => {
    expect(placeholderNumbers('{#1}+{#2}={#2}+{#1}')).toEqual([1, 2]);
    expect(placeholderNumbers('\\frac{#2}{#1}+#3-#2')).toEqual([2, 1, 3]);
    expect(placeholderNumbers('a^2+b^2=c^2')).toEqual([]);
  });

  it('reads a number of several digits, and none that starts at zero', () => {
    expect(placeholderNumbers('#12+#1')).toEqual([12, 1]);
    expect(placeholderNumbers('#0+#01')).toEqual([]);
    expect(placeholderNumbers('# 1 + #')).toEqual([]);
  });

  it('takes \\# as a hash to print, and \\\\#1 as a line break before a placeholder', () => {
    expect(placeholderNumbers('\\#1')).toEqual([]);
    expect(placeholderNumbers('a\\\\#1')).toEqual([1]);
    expect(placeholderNumbers('a\\\\\\#1+#2')).toEqual([2]);
  });
});

describe('instantiateTemplate', () => {
  it('puts each value in every place of its number', () => {
    expect(instantiateTemplate('{#1}+{#2}={#2}+{#1}', values({ 1: 'a', 2: 'b' }))).toBe(
      '{a}+{b}={b}+{a}',
    );
  });

  it('leaves the braces to the template, as TeX does with the parameter of a macro', () => {
    const power = '#1^{#2}\\cdot #1^{#3}=#1^{#2+#3}';
    expect(instantiateTemplate(power, values({ 1: 'a', 2: 'm', 3: 'n' }))).toBe(
      'a^{m}\\cdot a^{n}=a^{m+n}',
    );
    expect(instantiateTemplate(power, values({ 1: 'x', 2: '2k', 3: 'k+1' }))).toBe(
      'x^{2k}\\cdot x^{k+1}=x^{2k+k+1}',
    );
    expect(instantiateTemplate('x^#1', values({ 1: 'm+1' }))).toBe('x^m+1');
  });

  it('keeps a template without placeholders, hashes to print included', () => {
    expect(instantiateTemplate('e^{i\\pi}+1=0', new Map())).toBe('e^{i\\pi}+1=0');
    expect(instantiateTemplate('\\#1+#1', values({ 1: 'n' }))).toBe('\\#1+n');
  });

  it('does not replace inside a value', () => {
    expect(instantiateTemplate('#1+#2', values({ 1: '#2', 2: 'b' }))).toBe('#2+b');
  });

  it('refuses a number without a value', () => {
    expect(() => instantiateTemplate('#1+#2', values({ 1: 'a' }))).toThrow(/#2 has no value/);
  });

  it('puts a space where a control word would swallow the letter after it', () => {
    // The template's control word, the value's letter.
    expect(instantiateTemplate('\\sin#1', values({ 1: 'x' }))).toBe('\\sin x');
    expect(instantiateTemplate('\\sin#1', values({ 1: '\\theta' }))).toBe('\\sin\\theta');
    expect(instantiateTemplate('\\sin#1', values({ 1: '2x' }))).toBe('\\sin2x');
    // The value's control word, the template's letter.
    expect(instantiateTemplate('#1x^2', values({ 1: '\\alpha' }))).toBe('\\alpha x^2');
    expect(instantiateTemplate('#1x^2', values({ 1: 'a' }))).toBe('ax^2');
    // Two values in a row.
    expect(instantiateTemplate('2#1#2', values({ 1: '\\pi', 2: 'r' }))).toBe('2\\pi r');
    // An empty value joins what was around it.
    expect(instantiateTemplate('\\alpha#1x', values({ 1: '' }))).toBe('\\alpha x');
  });

  it('knows a control word from a line break or a control symbol before letters', () => {
    expect(instantiateTemplate('a\\\\#1', values({ 1: 'b' }))).toBe('a\\\\b');
    expect(instantiateTemplate('#1b', values({ 1: 'a\\,' }))).toBe('a\\,b');
    expect(instantiateTemplate('#1b', values({ 1: 'a\\\\alpha' }))).toBe('a\\\\alphab');
  });

  it('never makes a {{ that was not written: ManimCE splits a MathTex on {{ … }}', () => {
    expect(instantiateTemplate('x^{#1}', values({ 1: '{n}+1' }))).toBe('x^{ {n}+1}');
    expect(instantiateTemplate('\\frac{#1}{#2}', values({ 1: '{a}', 2: 'b' }))).toBe(
      '\\frac{ {a}}{b}',
    );
    expect(instantiateTemplate('{#1{b}}', values({ 1: '' }))).toBe('{ {b}}');
    // What the author wrote stays: in the template, and in a value.
    expect(instantiateTemplate('{{#1}}+#2', values({ 1: 'a', 2: '{{b}}' }))).toBe('{{a}}+{{b}}');
  });
});

describe('placeholderIssues', () => {
  const codes = (latex: string, numbers: number[]) =>
    placeholderIssues(
      latex,
      numbers.map((n) => ({ n, value: 'x' })),
    ).map((issue) => `${issue.severity} ${issue.code} #${issue.n}`);

  it('finds nothing when the text and the list agree', () => {
    expect(codes('#1^{#2}', [1, 2])).toEqual([]);
    expect(codes('#2+#1', [1, 2])).toEqual([]);
    expect(codes('a+b', [])).toEqual([]);
  });

  it('refuses a number of the text that has no value', () => {
    expect(codes('#1+#2+#3', [2])).toEqual(['error undeclared #1', 'error undeclared #3']);
  });

  it('refuses a number declared twice', () => {
    expect(codes('#1', [1, 1])).toEqual(['error duplicate #1']);
  });

  it('warns of a value the text does not use', () => {
    expect(codes('#1', [1, 2])).toEqual(['warning unused #2']);
    expect(placeholderIssues('a', [{ n: 3, value: 'x' }])[0]?.message).toBe(
      '#3 has a value and the LaTeX does not use it.',
    );
  });
});

describe('placeholderRows', () => {
  it('gives a row for each number of the text, by number, keeping what is known', () => {
    const known = [
      { n: 1, value: 'a', label: 'base' },
      { n: 2, value: 'm' },
      { n: 5, value: 'gone' },
    ];
    expect(placeholderRows('#3+#2^{#1}', known)).toEqual([
      { n: 1, value: 'a', label: 'base' },
      { n: 2, value: 'm' },
      { n: 3, value: '' },
    ]);
    expect(placeholderRows('a+b', known)).toEqual([]);
  });
});

describe('defaultValues', () => {
  it('maps each number to the value the template declares', () => {
    const defaults = defaultValues([
      { n: 1, value: 'a' },
      { n: 2, value: '\\theta', label: 'angle' },
    ]);
    expect(instantiateTemplate('#1\\sin#2', defaults)).toBe('a\\sin\\theta');
  });
});
