// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { keysText } from '../../platform';
import { formatKeys, macLines, parseKeys, plusBefore } from '../keyCaps';
import { SHORTCUT_ROWS, sheetRow } from '../shortcutSheet';

const key = (text: string) => ({ kind: 'key', text });

describe('parseKeys', () => {
  it('splits lines, alternatives and combinations', () => {
    expect(parseKeys('Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl+Y')).toEqual([
      {
        combos: [{ separator: null, combo: { parts: [key('Ctrl/⌘'), key('Z')], spaced: false } }],
        note: null,
      },
      {
        combos: [
          {
            separator: null,
            combo: { parts: [key('Ctrl/⌘'), key('Shift'), key('Z')], spaced: false },
          },
          { separator: 'or', combo: { parts: [key('Ctrl'), key('Y')], spaced: false } },
        ],
        note: null,
      },
    ]);
  });

  it('keeps a "/" without spaces in one cap and sets " / " and ", " apart', () => {
    const [line] = parseKeys('Delete / Backspace');
    expect(line!.combos.map((c) => [c.separator, c.combo.parts[0]!.text])).toEqual([
      [null, 'Delete'],
      ['/', 'Backspace'],
    ]);
    const [list] = parseKeys('↑/↓, Home, End');
    expect(list!.combos.map((c) => [c.separator, c.combo.parts[0]!.text])).toEqual([
      [null, '↑/↓'],
      [',', 'Home'],
      [',', 'End'],
    ]);
  });

  it('tells mouse gestures from keys', () => {
    const [, line] = parseKeys('Ctrl/⌘ + wheel; Alt + drag or middle button');
    expect(line!.combos.map((c) => c.combo)).toEqual([
      { parts: [key('Alt'), { kind: 'gesture', text: 'drag' }], spaced: true },
      { parts: [{ kind: 'gesture', text: 'middle button' }], spaced: false },
    ]);
    expect(parseKeys('?')[0]!.combos[0]!.combo.parts).toEqual([key('?')]);
  });

  it('reads the bracketed note, with the key that leads it', () => {
    expect(parseKeys('Alt+←/→ (Shift: 5 frames)')[0]!.note).toEqual({
      key: 'Shift',
      text: '5 frames',
    });
    expect(parseKeys('Shift (held)')[0]!.note).toEqual({ key: null, text: 'held' });
  });

  it('gives back the text of every row of the sheet', () => {
    for (const row of SHORTCUT_ROWS) expect(formatKeys(parseKeys(row.keys))).toBe(row.keys);
  });
});

describe('macLines: the caps as a Mac writes keys', () => {
  const caps = (keys: string) =>
    macLines(parseKeys(keys)).map((line) =>
      line.combos.map(({ combo }) => combo.parts.map((part) => part.text)),
    );

  it('gives each key its symbol, the modifiers first and in the order of a Mac’s menus', () => {
    expect(caps('Ctrl/⌘+Z; Ctrl/⌘+Shift+Z')).toEqual([[['⌘', 'Z']], [['⇧', '⌘', 'Z']]]);
    expect(caps('Ctrl/⌘+Alt+N, Ctrl/⌘+O')).toEqual([
      [
        ['⌥', '⌘', 'N'],
        ['⌘', 'O'],
      ],
    ]);
    expect(caps('Shift+Alt+G')).toEqual([[['⌥', '⇧', 'G']]]);
    expect(caps('Ctrl+Alt+H')).toEqual([[['⌃', '⌥', 'H']]]);
    expect(caps('F2; Enter')).toEqual([[['F2']], [['↩']]]);
    expect(caps('Delete / Backspace')).toEqual([[['Delete'], ['Backspace']]]);
  });

  it('writes nothing between the keys, and a "+" before a gesture alone', () => {
    const [keys] = macLines(parseKeys('Ctrl/⌘+Shift+Z'));
    const combo = keys!.combos[0]!.combo;
    expect(combo.parts.map((_, i) => plusBefore(combo, i))).toEqual([false, false, false]);
    const [gesture] = macLines(parseKeys('Alt + drag on empty space'));
    const drag = gesture!.combos[0]!.combo;
    expect(drag.parts).toEqual([
      { kind: 'key', text: '⌥' },
      { kind: 'gesture', text: 'drag on empty space' },
    ]);
    expect(drag.parts.map((_, i) => plusBefore(drag, i))).toEqual([false, true]);
    // Elsewhere every part but the first has its "+".
    const plain = parseKeys('Ctrl/⌘+Shift+Z')[0]!.combos[0]!.combo;
    expect(plain.parts.map((_, i) => plusBefore(plain, i))).toEqual([false, true, true]);
  });

  it('writes the note in brackets the same way, the key that leads it too', () => {
    expect(macLines(parseKeys('Alt+←/→ (Shift: 5 frames)'))[0]!.note).toEqual({
      key: '⇧',
      text: '5 frames',
    });
    expect(
      macLines(parseKeys('wheel with the mouse button held (Shift: ×10, Alt: ×0.1)'))[0]!.note,
    ).toEqual({ key: '⇧', text: '×10, ⌥: ×0.1' });
  });

  it('says what the text of every row says on a Mac, no more and no less', () => {
    for (const row of SHORTCUT_ROWS) {
      const { keys } = sheetRow(row, true);
      expect(formatKeys(macLines(parseKeys(keys)))).toBe(keysText(keys, true));
    }
  });
});
