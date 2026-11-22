// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { keyAction, moveOfKey, neighbourKey, shownFace } from '../keypadActions';
import { KEYPAD_TABS, type KeypadKey, type KeypadTab } from '../keypadLayout';

const tab = (id: string): KeypadTab => KEYPAD_TABS.find((t) => t.id === id)!;
const key = (tabId: string, id: string): KeypadKey =>
  tab(tabId)
    .rows.flat()
    .find((k) => k.id === id)!;

describe('what a key of the keypad does', () => {
  it('writes its LaTeX, marks and all', () => {
    expect(keyAction(key('algebra', 'frac'), false)).toEqual({
      kind: 'insert',
      latex: '\\frac{#@}{#?}',
    });
    expect(keyAction(key('algebra', 'd7'), false)).toEqual({ kind: 'insert', latex: '7' });
  });

  it('writes the capital of a letter while the capitals are on; any other key, the same', () => {
    expect(keyAction(key('alphabet', 'a'), true)).toEqual({ kind: 'insert', latex: 'A' });
    expect(keyAction(key('alphabet', 'a'), false)).toEqual({ kind: 'insert', latex: 'a' });
    expect(keyAction(key('alphabet', 'alpha'), true)).toEqual({
      kind: 'insert',
      latex: '\\alpha',
    });
    expect(shownFace(key('alphabet', 'a'), true)).toEqual({ latex: 'A' });
    expect(shownFace(key('alphabet', 'a'), false)).toEqual({ latex: 'a' });
    expect(shownFace(key('alphabet', 'alpha'), true)).toEqual({ latex: '\\alpha' });
    expect(shownFace(key('alphabet', 'shift'), true)).toEqual({ text: '⇧' });
  });

  it("moves, deletes and clears with the field's commands", () => {
    expect(keyAction(key('algebra', 'left'), false)).toEqual({
      kind: 'command',
      command: 'moveToPreviousChar',
    });
    expect(keyAction(key('algebra', 'right'), false)).toEqual({
      kind: 'command',
      command: 'moveToNextChar',
    });
    expect(keyAction(key('algebra', 'backspace'), false)).toEqual({
      kind: 'command',
      command: 'deleteBackward',
    });
    expect(keyAction(key('algebra', 'clear'), false)).toEqual({
      kind: 'command',
      command: 'deleteAll',
    });
  });

  it('leaves the capitals and Apply to the keypad itself', () => {
    expect(keyAction(key('alphabet', 'shift'), false)).toEqual({ kind: 'shift' });
    expect(keyAction(key('algebra', 'apply'), true)).toEqual({ kind: 'apply' });
  });
});

describe('the arrows among the keys of a tab', () => {
  it('read the keys of the physical keyboard that move', () => {
    expect(moveOfKey('ArrowLeft')).toBe('left');
    expect(moveOfKey('ArrowDown')).toBe('down');
    expect(moveOfKey('Home')).toBe('home');
    expect(moveOfKey('End')).toBe('end');
    expect(moveOfKey('Enter')).toBeNull();
    expect(moveOfKey('a')).toBeNull();
  });

  it('go along a row and stop at its ends', () => {
    const algebra = tab('algebra');
    expect(neighbourKey(algebra, 'frac', 'right')).toBe('mixed');
    expect(neighbourKey(algebra, 'mixed', 'left')).toBe('frac');
    expect(neighbourKey(algebra, 'frac', 'left')).toBe('frac');
    expect(neighbourKey(algebra, 'eq', 'right')).toBe('eq');
    expect(neighbourKey(algebra, 'abs', 'home')).toBe('frac');
    expect(neighbourKey(algebra, 'abs', 'end')).toBe('eq');
  });

  it('go to the key over or under, and stop at the first and the last row', () => {
    const algebra = tab('algebra');
    expect(neighbourKey(algebra, 'frac', 'down')).toBe('sqrt');
    expect(neighbourKey(algebra, 'sqrt', 'up')).toBe('frac');
    expect(neighbourKey(algebra, 'frac', 'up')).toBe('frac');
    expect(neighbourKey(algebra, 'left', 'down')).toBe('left');
    expect(neighbourKey(algebra, 'd9', 'down')).toBe('d6');
  });

  it('reach a wide key from any key over its columns, and leave it by its first column', () => {
    const algebra = tab('algebra');
    // Apply is under the last two columns: % and +.
    expect(neighbourKey(algebra, 'percent', 'down')).toBe('apply');
    expect(neighbourKey(algebra, 'plus', 'down')).toBe('apply');
    expect(neighbourKey(algebra, 'apply', 'up')).toBe('percent');
    expect(neighbourKey(algebra, 'dot', 'down')).toBe('clear');
    // In the tab of letters every key of the last row is two columns wide.
    const alphabet = tab('alphabet');
    expect(neighbourKey(alphabet, 'cap-phi', 'down')).toBe('apply');
    expect(neighbourKey(alphabet, 'cap-omega', 'down')).toBe('apply');
    expect(neighbourKey(alphabet, 'sigma', 'down')).toBe('left');
    expect(neighbourKey(alphabet, 'tau', 'down')).toBe('left');
    expect(neighbourKey(alphabet, 'right', 'up')).toBe('phi');
  });

  it('start at the first key of the tab from a key that is not in it', () => {
    expect(neighbourKey(tab('algebra'), 'sin', 'right')).toBe('frac');
  });

  it('never leave the tab', () => {
    for (const t of KEYPAD_TABS) {
      const ids = new Set(t.rows.flat().map((k) => k.id));
      for (const id of ids) {
        for (const move of ['left', 'right', 'up', 'down', 'home', 'end'] as const) {
          expect(ids.has(neighbourKey(t, id, move)), `${t.id}/${id} ${move}`).toBe(true);
        }
      }
    }
  });
});
