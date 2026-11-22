// @vitest-environment node
import { convertLatexToMarkup } from 'mathlive';
import { describe, expect, it } from 'vitest';
import { mathJaxSource, renderWithMathJax } from '../../../../engine/mathjax';
import {
  faceLines,
  faceOf,
  KEYPAD_TABS,
  keypadColumns,
  keyWidth,
  type KeypadKey,
  type KeypadTab,
} from '../keypadLayout';

const keysOf = (tab: KeypadTab): KeypadKey[] => tab.rows.flat();
const everyKey = KEYPAD_TABS.flatMap((tab) => keysOf(tab).map((key) => ({ tab, key })));

/** What a key writes, in a formula: its holes filled, what it takes from before the caret there
 * (each in braces, as a group: a letter straight after `\to` would be read as part of its name). */
const written = (insert: string): string => insert.replace(/#@/g, '{a}').replace(/#[?0]/g, '{b}');

/** How many times `piece` is in `text`. */
const count = (text: string, piece: string): number => text.split(piece).length - 1;

function rendersInMathJax(latex: string): string | null {
  const result = renderWithMathJax(
    { tex: mathJaxSource(latex), packages: [], preamble: '', target: 'ce', fontSize: 48 },
    'key',
  );
  return result.ok ? null : result.error.message;
}

describe('the keypad layouts', () => {
  it('are the four tabs, in their order', () => {
    expect(KEYPAD_TABS.map((tab) => [tab.id, tab.label])).toEqual([
      ['algebra', 'Algebra'],
      ['trigonometry', 'Trigonometry'],
      ['calculus', 'Calculus'],
      ['alphabet', 'Alphabet'],
    ]);
  });

  it('give every key an id a test id and a class can be made of, once in its tab', () => {
    for (const tab of KEYPAD_TABS) {
      const ids = keysOf(tab).map((key) => key.id);
      for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(new Set(ids).size, tab.id).toBe(ids.length);
    }
  });

  it('name every key, and no two keys of a tab alike', () => {
    for (const tab of KEYPAD_TABS) {
      const names = keysOf(tab).map((key) => key.name);
      for (const name of names) expect(name.trim()).not.toBe('');
      expect(new Set(names).size, tab.id).toBe(names.length);
    }
  });

  it('make every key write or do, never both; only a key that writes has capitals', () => {
    for (const { tab, key } of everyKey) {
      const where = `${tab.id}/${key.id}`;
      expect((key.insert !== undefined) !== (key.command !== undefined), where).toBe(true);
      if (key.insert !== undefined) expect(key.insert, where).not.toBe('');
      if (key.shifted !== undefined) expect(key.insert, where).toBeDefined();
    }
  });

  it('have rows as wide as each other in a tab', () => {
    for (const tab of KEYPAD_TABS) {
      const columns = keypadColumns(tab);
      expect(columns).toBeGreaterThan(0);
      for (const [index, row] of tab.rows.entries()) {
        const width = row.reduce((sum, key) => sum + keyWidth(key), 0);
        expect(width, `${tab.id}, row ${index + 1}`).toBe(columns);
      }
    }
  });

  it('have as many rows in every tab: a keyboard keeps its height from tab to tab', () => {
    expect(new Set(KEYPAD_TABS.map((tab) => tab.rows.length)).size).toBe(1);
  });

  it('end every tab with the row that moves, deletes and applies', () => {
    for (const tab of KEYPAD_TABS) {
      expect(tab.rows.at(-1)!.map((key) => key.command)).toEqual([
        'left',
        'right',
        'backspace',
        'clear',
        'apply',
      ]);
      const commands = keysOf(tab).flatMap((key) => (key.command ? [key.command] : []));
      expect(new Set(commands).size, tab.id).toBe(commands.length);
    }
  });

  it('keep the capitals for the tab of letters', () => {
    const withShift = KEYPAD_TABS.filter((tab) =>
      keysOf(tab).some((key) => key.command === 'shift'),
    );
    expect(withShift.map((tab) => tab.id)).toEqual(['alphabet']);
    const letters = keysOf(withShift[0]!).filter((key) => key.shifted !== undefined);
    expect(
      letters
        .map((key) => key.insert)
        .sort()
        .join(''),
    ).toBe('abcdefghijklmnopqrstuvwxyz');
    for (const key of letters) expect(key.shifted).toBe(key.insert!.toUpperCase());
  });

  it('write LaTeX whose braces and delimiters are closed', () => {
    for (const { tab, key } of everyKey) {
      for (const latex of [key.insert, key.shifted]) {
        if (latex === undefined) continue;
        const where = `${tab.id}/${key.id}: ${latex}`;
        let depth = 0;
        for (const char of latex.replace(/\\[{}]/g, '')) {
          if (char === '{') depth += 1;
          if (char === '}') depth -= 1;
          expect(depth, where).toBeGreaterThanOrEqual(0);
        }
        expect(depth, where).toBe(0);
        expect(count(latex, '\\left'), where).toBe(count(latex, '\\right'));
      }
    }
  });

  it('write what the editor renders, its holes filled', () => {
    for (const { tab, key } of everyKey) {
      for (const latex of [key.insert, key.shifted]) {
        if (latex === undefined) continue;
        expect(rendersInMathJax(written(latex)), `${tab.id}/${key.id}: ${latex}`).toBeNull();
      }
    }
  });

  it('draw every face: LaTeX that MathLive reads, or a text', () => {
    for (const { tab, key } of everyKey) {
      const where = `${tab.id}/${key.id}`;
      if ('text' in key.face) {
        expect(key.face.text.trim(), where).not.toBe('');
        expect(key.command, where).toBeDefined();
      } else {
        const markup = convertLatexToMarkup(key.face.latex);
        expect(markup, where).not.toBe('');
        expect(markup, where).not.toContain('ML__error');
      }
    }
  });

  it('tell the faces that are taller than a line of text', () => {
    const lines = (id: string) => faceLines(everyKey.find(({ key }) => key.id === id)!.key.face);
    expect(
      ['frac', 'mixed', 'derivative', 'partial', 'limit', 'definite-integral'].map(lines),
    ).toEqual([2, 2, 2, 2, 2, 2]);
    expect(['sum', 'product'].map(lines)).toEqual([3, 3]);
    expect(['sqrt', 'power', 'integral', 'd7', 'x', 'apply', 'sin'].map(lines)).toEqual([
      1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it('draw the face of what a key writes with a hole for every mark', () => {
    expect(faceOf('\\frac{#@}{#?}')).toBe('\\frac{{\\square}}{{\\square}}');
    expect(faceOf('\\sqrt{#0}')).toBe('\\sqrt{{\\square}}');
    expect(faceOf('\\%')).toBe('\\%');
    for (const { key } of everyKey) {
      if (key.insert !== undefined) expect(key.face).toEqual({ latex: faceOf(key.insert) });
    }
  });
});
