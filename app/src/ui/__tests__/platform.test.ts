// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  keyHint,
  keysSpoken,
  keysText,
  letterOf,
  macKey,
  macOrder,
  placeLetter,
} from '../platform';

describe('keyHint', () => {
  it('writes Mod as Ctrl, and the other keys as they are, on Windows and Linux', () => {
    expect(keyHint('Mod+Alt+N', false)).toBe('Ctrl+Alt+N');
    expect(keyHint('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(keyHint('Alt+A', false)).toBe('Alt+A');
    expect(keyHint('Shift+Alt+G', false)).toBe('Shift+Alt+G');
  });

  it('writes the symbols of a Mac keyboard there', () => {
    expect(keyHint('Mod+O', true)).toBe('⌘O');
    expect(keyHint('Alt+A', true)).toBe('⌥A');
    expect(keyHint('Shift+C', true)).toBe('⇧C');
  });

  it('writes a Mac’s modifiers in the order its menus have: Control, Option, Shift, Command', () => {
    // However the app's notation orders them.
    expect(keyHint('Mod+Alt+N', true)).toBe('⌥⌘N');
    expect(keyHint('Mod+Shift+Z', true)).toBe('⇧⌘Z');
    expect(keyHint('Shift+Alt+G', true)).toBe('⌥⇧G');
    expect(keyHint('Mod+Shift+Alt+V', true)).toBe('⌥⇧⌘V');
    expect(keyHint('Alt+Mod+Shift+V', true)).toBe('⌥⇧⌘V');
    // The Control key itself is not a Mac's command key: it has a symbol of its own there.
    expect(keyHint('Ctrl+Alt+H', true)).toBe('⌃⌥H');
    expect(keyHint('Alt+Ctrl+H', true)).toBe('⌃⌥H');
    expect(keyHint('Mod+Ctrl+F', true)).toBe('⌃⌘F');
    // Elsewhere the keys stay as they are written, and Control is Ctrl.
    expect(keyHint('Ctrl+Alt+H', false)).toBe('Ctrl+Alt+H');
    expect(keyHint('Shift+Alt+G', false)).toBe('Shift+Alt+G');
  });

  it('writes a key of more than one letter, a sign and a modifier alone', () => {
    expect(keyHint("Mod+'", false)).toBe("Ctrl+'");
    expect(keyHint("Mod+'", true)).toBe("⌘'");
    expect(keyHint('Alt+↓', false)).toBe('Alt+↓');
    expect(keyHint('Alt+↓', true)).toBe('⌥↓');
    expect(keyHint('Mod+Enter', false)).toBe('Ctrl+Enter');
    // A Mac's menus write Return as ↩.
    expect(keyHint('Mod+Enter', true)).toBe('⌘↩');
    expect(keyHint('Mod', false)).toBe('Ctrl');
    expect(keyHint('Mod', true)).toBe('⌘');
  });

  it('writes a gesture after its keys, as " + gesture" on both systems', () => {
    expect(keyHint('Mod + wheel', false)).toBe('Ctrl + wheel');
    expect(keyHint('Mod + wheel', true)).toBe('⌘ + wheel');
    expect(keyHint('Alt + drag', false)).toBe('Alt + drag');
    expect(keyHint('Alt + drag', true)).toBe('⌥ + drag');
    expect(keyHint('Mod+Shift + click', false)).toBe('Ctrl+Shift + click');
    expect(keyHint('Mod+Shift + click', true)).toBe('⇧⌘ + click');
  });
});

describe('macOrder and macKey: keys as a Mac writes them', () => {
  it('puts the modifiers first, in the order of a Mac’s menus, and leaves the other keys', () => {
    expect(macOrder(['Mod', 'Shift', 'Z'])).toEqual(['Shift', 'Mod', 'Z']);
    expect(macOrder(['Ctrl/⌘', 'Alt', 'N'])).toEqual(['Alt', 'Ctrl/⌘', 'N']);
    expect(macOrder(['Shift', 'Alt', 'Ctrl', '←/→'])).toEqual(['Ctrl', 'Alt', 'Shift', '←/→']);
    expect(macOrder(['Home'])).toEqual(['Home']);
  });

  it('writes a key with its symbol when a Mac has one', () => {
    expect(['Ctrl', 'Alt', 'Shift', 'Mod', 'Ctrl/⌘', 'Enter'].map(macKey)).toEqual([
      '⌃',
      '⌥',
      '⇧',
      '⌘',
      '⌘',
      '↩',
    ]);
    expect(['S', 'Esc', 'Space', '←/→', 'F10', 'Delete'].map(macKey)).toEqual([
      'S',
      'Esc',
      'Space',
      '←/→',
      'F10',
      'Delete',
    ]);
  });
});

describe('keysText: a text that names keys, as the system writes them', () => {
  it('is the text as it is on Windows and Linux', () => {
    for (const text of [
      'Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl+Y',
      'Shift-click, or drag a box over glyphs (Shift or Ctrl/⌘: add), to select several',
      'Alt + drag on empty space, or the middle button',
      'Enter: done · Esc: as it was',
    ]) {
      expect(keysText(text, false)).toBe(text);
    }
  });

  it('writes the keys pressed together as a Mac’s menus do', () => {
    expect(keysText('Ctrl/⌘+Alt+N, Ctrl/⌘+O', true)).toBe('⌥⌘N, ⌘O');
    expect(keysText('Ctrl/⌘+Z; Ctrl/⌘+Shift+Z', true)).toBe('⌘Z; ⇧⌘Z');
    expect(keysText('Alt+A / Alt+H / Alt+D (Shift: to the frame)', true)).toBe(
      '⌥A / ⌥H / ⌥D (⇧: to the frame)',
    );
    expect(keysText('Shift+Alt+G', true)).toBe('⌥⇧G');
    expect(keysText('Alt+←/→ (Shift: 5 frames); Alt+↑/↓', true)).toBe('⌥←/→ (⇧: 5 frames); ⌥↑/↓');
    expect(keysText("Ctrl/⌘+'", true)).toBe("⌘'");
    expect(keysText('Enter; Shift+F10', true)).toBe('↩; ⇧F10');
    expect(keysText('Ctrl/⌘+Enter applies.', true)).toBe('⌘↩ applies.');
    expect(keysText('Apply with Ctrl/⌘+Enter.', true)).toBe('Apply with ⌘↩.');
    // The Control key itself is ⌃ there.
    expect(keysText('Ctrl+Alt+H / Ctrl+Alt+V', true)).toBe('⌃⌥H / ⌃⌥V');
  });

  it('writes a modifier named alone with its symbol, and a gesture after its keys', () => {
    expect(keysText('Ctrl/⌘ + wheel; Alt + drag on empty space, or the middle button', true)).toBe(
      '⌘ + wheel; ⌥ + drag on empty space, or the middle button',
    );
    expect(keysText('Shift+click selects a range, Ctrl/⌘+click toggles', true)).toBe(
      '⇧+click selects a range, ⌘+click toggles',
    );
    expect(keysText('Alt+Shift+click a range, Alt+drag a rectangle', true)).toBe(
      '⌥⇧+click a range, ⌥+drag a rectangle',
    );
    expect(
      keysText('Shift-click, or drag a box over glyphs (Shift or Ctrl/⌘: add), to select', true),
    ).toBe('⇧-click, or drag a box over glyphs (⇧ or ⌘: add), to select');
    expect(keysText('(Alt) · let Alt go to move freely · Ctrl/⌘ too: no snapping', true)).toBe(
      '(⌥) · let ⌥ go to move freely · ⌘ too: no snapping',
    );
    expect(keysText('Shift+wheel sets the reach.', true)).toBe('⇧+wheel sets the reach.');
    expect(keysText('Shift (held)', true)).toBe('⇧ (held)');
  });

  it('writes Enter as a Mac’s menus do, alone too', () => {
    expect(keysText('Enter: done · Esc: as it was', true)).toBe('↩: done · Esc: as it was');
    expect(keysText('(or ←/→, ↑/↓ and Enter)', true)).toBe('(or ←/→, ↑/↓ and ↩)');
  });

  it('leaves the words that only begin like a key, and what names no key', () => {
    expect(keysText('Alternate rows; Shifted by a frame; Controls; Entering', true)).toBe(
      'Alternate rows; Shifted by a frame; Controls; Entering',
    );
    expect(keysText('Delete / Backspace; Home, End; F2; Space; Tab; Esc', true)).toBe(
      'Delete / Backspace; Home, End; F2; Space; Tab; Esc',
    );
    // Already a Mac's.
    expect(keysText('⇧⌘Z', true)).toBe('⇧⌘Z');
  });
});

describe('keysSpoken: the keys a text names, as a screen reader is given them', () => {
  it('is the text as it is on Windows and Linux', () => {
    const text = 'Ctrl/⌘+Shift+Z; hold Alt to pick symbols; Enter makes it';
    expect(keysSpoken(text, false)).toBe(text);
  });

  it('names a Mac’s keys as its documents do, joined by a hyphen', () => {
    expect(keysSpoken('Ctrl/⌘+Z; Ctrl/⌘+Shift+Z', true)).toBe('Command-Z; Shift-Command-Z');
    expect(keysSpoken('Ctrl/⌘+Alt+N, Ctrl/⌘+O', true)).toBe('Option-Command-N, Command-O');
    expect(keysSpoken('Ctrl+Alt+H', true)).toBe('Control-Option-H');
    expect(keysSpoken('Alt+←/→ (Shift: 5 frames)', true)).toBe('Option-←/→ (Shift: 5 frames)');
    expect(keysSpoken('Enter; Shift+F10', true)).toBe('Return; Shift-F10');
    expect(keysSpoken('Ctrl/⌘+Enter applies.', true)).toBe('Command-Return applies.');
    expect(keysSpoken('Shift+click selects a range, Ctrl/⌘+click toggles', true)).toBe(
      'Shift-click selects a range, Command-click toggles',
    );
    expect(keysSpoken('Ctrl/⌘ + wheel; Alt + drag on empty space', true)).toBe(
      'Command + wheel; Option + drag on empty space',
    );
    expect(keysSpoken('hold Alt to pick symbols; Escape cancels', true)).toBe(
      'hold Option to pick symbols; Escape cancels',
    );
  });
});

describe('letterOf: the letter a key press stands for, on any layout', () => {
  const press = (key: string, code?: string, altKey = false) => ({ key, code, altKey });

  it('is the letter the key types, whatever its case and wherever its key is', () => {
    expect(letterOf(press('z', 'KeyZ'))).toBe('z');
    expect(letterOf(press('Z', 'KeyZ'))).toBe('z'); // Shift or Caps Lock
    expect(letterOf(press('z', 'Slash'))).toBe('z'); // Dvorak
    expect(letterOf(press('a', 'KeyQ'))).toBe('a'); // AZERTY
    expect(letterOf(press('z'))).toBe('z'); // no code given
  });

  it('is the letter of the place of the key when it typed a letter of another script', () => {
    expect(letterOf(press('я', 'KeyZ'))).toBe('z'); // Russian
    expect(letterOf(press('Ы', 'KeyS'))).toBe('s');
    expect(letterOf(press('ζ', 'KeyZ'))).toBe('z'); // Greek
    expect(letterOf(press('ז', 'KeyZ'))).toBe('z'); // Hebrew
    expect(letterOf(press('ॆ', 'KeyZ'))).toBe('z'); // a Hindi vowel sign: a mark
    expect(letterOf(press('ш'))).toBeNull(); // and no place to read
  });

  it('is the letter of the place with Alt held, whatever was composed', () => {
    expect(letterOf(press('å', 'KeyA', true))).toBe('a'); // Option+A on a Mac
    expect(letterOf(press('∂', 'KeyD', true))).toBe('d');
    expect(letterOf(press('Dead', 'KeyE', true))).toBe('e'); // Option+E waits for a key
    expect(letterOf(press('h', 'KeyJ', true))).toBe('h'); // the letter still wins (Dvorak)
  });

  it('is none for a key that typed no letter: a sign of a Latin layout, a digit, an IME', () => {
    expect(letterOf(press(';', 'KeyZ'))).toBeNull(); // Dvorak's ";" where Z is
    expect(letterOf(press(',', 'KeyM'))).toBeNull(); // AZERTY's "," where M is
    expect(letterOf(press('2', 'Digit2'))).toBeNull();
    expect(letterOf(press('ArrowLeft', 'ArrowLeft'))).toBeNull();
    expect(letterOf(press('Process', 'KeyS'))).toBeNull(); // an input method composing
    expect(letterOf(press('ä', 'Quote'))).toBeNull(); // a letter at no letter's place
  });
});

describe('placeLetter', () => {
  it('reads the letter of the place, and nothing elsewhere', () => {
    expect(placeLetter({ code: 'KeyS' })).toBe('s');
    expect(placeLetter({ code: 'Semicolon' })).toBeNull();
    expect(placeLetter({ code: 'Keyboard' })).toBeNull();
    expect(placeLetter({})).toBeNull();
  });
});
