import { describe, expect, it } from 'vitest';
import {
  actsOnPreview,
  commandForKey,
  isTextEntryTarget,
  saveAsKeys,
  spaceOperates,
  syncFolderKeys,
} from '../shortcuts';

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('commandForKey', () => {
  it('maps Ctrl combinations on Windows/Linux', () => {
    expect(commandForKey(key('z', { ctrlKey: true }), false)).toBe('undo');
    expect(commandForKey(key('Z', { ctrlKey: true, shiftKey: true }), false)).toBe('redo');
    expect(commandForKey(key('y', { ctrlKey: true }), false)).toBe('redo');
    expect(commandForKey(key('s', { ctrlKey: true }), false)).toBe('save');
    expect(commandForKey(key('s', { ctrlKey: true, altKey: true }), false)).toBe('save-as');
    expect(commandForKey(key('o', { ctrlKey: true }), false)).toBe('open');
    expect(commandForKey(key('n', { ctrlKey: true, altKey: true }), false)).toBe('new');
    expect(commandForKey(key('a', { ctrlKey: true }), false)).toBe('select-all');
    expect(commandForKey(key('A', { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(commandForKey(key('a', { metaKey: true }), true)).toBe('select-all');
  });

  it('maps Ctrl+Shift+S to Sync folder and ignores Shift with Alt', () => {
    expect(commandForKey(key('S', { ctrlKey: true, shiftKey: true }), false)).toBe('sync-folder');
    expect(commandForKey(key('S', { ctrlKey: true, altKey: true, shiftKey: true }), false)).toBe(
      null,
    );
  });

  it('has Save As on ⇧⌘S on a Mac, as every app there, and Sync folder on ⌥⌘S', () => {
    expect(commandForKey(key('s', { metaKey: true }), true)).toBe('save');
    expect(commandForKey(key('S', { metaKey: true, shiftKey: true }), true)).toBe('save-as');
    expect(commandForKey(key('s', { metaKey: true, altKey: true }), true)).toBe('sync-folder');
    // With the three, nothing: and the Control key is not the command key there.
    expect(commandForKey(key('S', { metaKey: true, altKey: true, shiftKey: true }), true)).toBe(
      null,
    );
    expect(commandForKey(key('S', { ctrlKey: true, shiftKey: true }), true)).toBeNull();
    expect(saveAsKeys(true)).toBe('Mod+Shift+S');
    expect(syncFolderKeys(true)).toBe('Mod+Alt+S');
    // Elsewhere, as they were.
    expect(saveAsKeys(false)).toBe('Mod+Alt+S');
    expect(syncFolderKeys(false)).toBe('Mod+Shift+S');
  });

  it('reads the key with Alt from its place when Alt composes a character (macOS, AltGr)', () => {
    // Option+S is "ß" on a Mac: ⌥⌘S, Sync folder there.
    const composed = { ...key('ß', { metaKey: true, altKey: true }), code: 'KeyS' };
    expect(commandForKey(composed, true)).toBe('sync-folder');
    // AltGr+S on Windows: Ctrl+Alt+S, Save As.
    expect(
      commandForKey({ ...key('ß', { ctrlKey: true, altKey: true }), code: 'KeyS' }, false),
    ).toBe('save-as');
    expect(
      commandForKey({ ...key('ß', { metaKey: true, altKey: true }), code: 'KeyD' }, true),
    ).toBe(null);
  });

  it('maps Alt+G to align by symbol, and Shift+Alt+G to its form for a locked formula', () => {
    for (const mac of [false, true]) {
      expect(commandForKey(key('g', { altKey: true }), mac)).toBe('align-symbol');
      expect(commandForKey(key('G', { altKey: true, shiftKey: true }), mac)).toBe(
        'align-symbol-locked',
      );
    }
    // Option composes another character on a Mac: the physical key tells.
    expect(commandForKey({ ...key('©', { altKey: true }), code: 'KeyG' }, true)).toBe(
      'align-symbol',
    );
    expect(
      commandForKey({ ...key('˝', { altKey: true, shiftKey: true }), code: 'KeyG' }, true),
    ).toBe('align-symbol-locked');
    // With Ctrl/⌘ too it is neither.
    expect(commandForKey(key('g', { altKey: true, ctrlKey: true }), false)).toBeNull();
  });

  it('maps Shift+C and Shift+V to the copy and the paste of colours in order', () => {
    for (const mac of [false, true]) {
      expect(commandForKey(key('C', { shiftKey: true }), mac)).toBe('copy-colours-order');
      expect(commandForKey(key('V', { shiftKey: true }), mac)).toBe('paste-colours-order');
      // Plain C is the Creator's key and plain V the camera view's; with Ctrl/⌘ they are the
      // browser's own.
      expect(commandForKey(key('c'), mac)).toBe('toggle-creator');
      expect(commandForKey(key('v'), mac)).toBe('toggle-camera-view');
      expect(commandForKey(key('C', { shiftKey: true, ctrlKey: true }), mac)).toBeNull();
      expect(commandForKey(key('V', { shiftKey: true, metaKey: true }), mac)).toBeNull();
    }
  });

  it('maps Ctrl/⌘+F to the search of formulas', () => {
    expect(commandForKey(key('f', { ctrlKey: true }), false)).toBe('search-formulas');
    expect(commandForKey(key('F', { ctrlKey: true }), false)).toBe('search-formulas');
    expect(commandForKey(key('f', { metaKey: true }), true)).toBe('search-formulas');
    // The plain letter, Shift with it and the other system's modifier are not it.
    expect(commandForKey(key('f'), false)).toBeNull();
    expect(commandForKey(key('f', { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(commandForKey(key('f', { ctrlKey: true }), true)).toBeNull();
    expect(commandForKey(key('f', { metaKey: true }), false)).toBeNull();
  });

  it('maps Alt+A/H/D and Alt+W/V/S to align, with Shift to the frame', () => {
    const alt = (k: string, shiftKey = false) => key(k, { altKey: true, shiftKey });
    const names = {
      a: 'align-left',
      h: 'align-center',
      d: 'align-right',
      w: 'align-top',
      v: 'align-middle',
      s: 'align-bottom',
    };
    for (const mac of [false, true]) {
      for (const [letter, name] of Object.entries(names)) {
        expect(commandForKey(alt(letter), mac)).toBe(name);
        expect(commandForKey(alt(letter.toUpperCase(), true), mac)).toBe(`${name}-frame`);
      }
      expect(commandForKey(alt('x'), mac)).toBeNull();
    }
  });

  it('reads the align keys from the physical key when Alt composes a character', () => {
    const composed = (k: string, code: string, shiftKey = false) => ({
      ...key(k, { altKey: true, shiftKey }),
      code,
    });
    // Option+A on a Mac gives "å", Option+S "ß", Option+D "∂", Option+W "∑", Option+V "√".
    expect(commandForKey(composed('å', 'KeyA'), true)).toBe('align-left');
    expect(commandForKey(composed('∂', 'KeyD'), true)).toBe('align-right');
    expect(commandForKey(composed('∑', 'KeyW'), true)).toBe('align-top');
    expect(commandForKey(composed('√', 'KeyV'), true)).toBe('align-middle');
    expect(commandForKey(composed('Í', 'KeyS', true), true)).toBe('align-bottom-frame');
    expect(commandForKey(composed('å', 'Digit1'), true)).toBeNull();
    // A plain letter wins over the physical key (Dvorak types "h" on the physical J).
    expect(commandForKey({ ...key('a', { altKey: true }), code: 'KeyA' }, false)).toBe(
      'align-left',
    );
    expect(commandForKey({ ...key('h', { altKey: true }), code: 'KeyJ' }, false)).toBe(
      'align-center',
    );
  });

  it('leaves Alt combinations with Ctrl or ⌘ to Save As and Distribute', () => {
    expect(commandForKey(key('a', { altKey: true, ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(key('a', { altKey: true, metaKey: true }), true)).toBeNull();
    // Ctrl+Alt on macOS is not ⌘: not align either.
    expect(commandForKey(key('a', { altKey: true, ctrlKey: true }), true)).toBeNull();
  });

  it('maps Ctrl/⌘+Alt+N to New, from the place of N as Save As is read; Ctrl/⌘+N is nothing', () => {
    // The browser keeps Ctrl/⌘+N for a new window: the page never hears it.
    expect(commandForKey(key('n', { ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(key('n', { metaKey: true }), true)).toBeNull();
    expect(commandForKey(key('n', { ctrlKey: true, altKey: true }), false)).toBe('new');
    expect(commandForKey(key('n', { metaKey: true, altKey: true }), true)).toBe('new');
    // Option+N waits for a letter to put a tilde on (a dead key): the place of the key tells.
    expect(
      commandForKey({ ...key('Dead', { metaKey: true, altKey: true }), code: 'KeyN' }, true),
    ).toBe('new');
    expect(
      commandForKey({ ...key('˜', { metaKey: true, altKey: true }), code: 'KeyN' }, true),
    ).toBe('new');
    // Shift is no part of it, nor is Ctrl on a Mac.
    expect(commandForKey(key('N', { ctrlKey: true, altKey: true, shiftKey: true }), false)).toBe(
      null,
    );
    expect(commandForKey(key('n', { ctrlKey: true, altKey: true }), true)).toBeNull();
  });

  it('maps Ctrl+Alt+H and V to distribute; S stays Save As', () => {
    expect(commandForKey(key('h', { ctrlKey: true, altKey: true }), false)).toBe('distribute-h');
    expect(commandForKey(key('v', { ctrlKey: true, altKey: true }), false)).toBe('distribute-v');
    expect(commandForKey(key('s', { ctrlKey: true, altKey: true }), false)).toBe('save-as');
    expect(commandForKey(key('H', { ctrlKey: true, altKey: true, shiftKey: true }), false)).toBe(
      null,
    );
  });

  it('takes the Control key itself for distribute on a Mac: ⌃⌥H and ⌃⌥V, as Figma has them', () => {
    expect(commandForKey(key('h', { ctrlKey: true, altKey: true }), true)).toBe('distribute-h');
    expect(commandForKey(key('v', { ctrlKey: true, altKey: true }), true)).toBe('distribute-v');
    // Option composes another character: the place of the key tells.
    expect(
      commandForKey({ ...key('˙', { ctrlKey: true, altKey: true }), code: 'KeyH' }, true),
    ).toBe('distribute-h');
    expect(
      commandForKey({ ...key('√', { ctrlKey: true, altKey: true }), code: 'KeyV' }, true),
    ).toBe('distribute-v');
    // ⌥⌘H hides the other apps there and ⌥⌘V pastes a style: the system's keys, left to it.
    expect(commandForKey(key('h', { metaKey: true, altKey: true }), true)).toBeNull();
    expect(commandForKey(key('v', { metaKey: true, altKey: true }), true)).toBeNull();
    expect(
      commandForKey({ ...key('˙', { metaKey: true, altKey: true }), code: 'KeyH' }, true),
    ).toBeNull();
    // Neither with Shift, nor with ⌘ too; and the other letters with ⌃⌥ are nobody's.
    expect(commandForKey(key('H', { ctrlKey: true, altKey: true, shiftKey: true }), true)).toBe(
      null,
    );
    expect(
      commandForKey(key('h', { ctrlKey: true, altKey: true, metaKey: true }), true),
    ).toBeNull();
    expect(commandForKey(key('s', { ctrlKey: true, altKey: true }), true)).toBeNull();
    expect(commandForKey(key('n', { ctrlKey: true, altKey: true }), true)).toBeNull();
  });

  it("maps Ctrl/⌘+' to the grid, and Alt+↑/↓ to its density", () => {
    expect(commandForKey(key("'", { ctrlKey: true }), false)).toBe('toggle-grid');
    expect(commandForKey(key("'", { metaKey: true }), true)).toBe('toggle-grid');
    expect(commandForKey(key("'", { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(commandForKey(key("'"), false)).toBeNull();
    expect(commandForKey(key('ArrowUp', { altKey: true }), false)).toBe('grid-denser');
    expect(commandForKey(key('ArrowDown', { altKey: true }), true)).toBe('grid-sparser');
    expect(commandForKey(key('ArrowUp', { altKey: true, shiftKey: true }), false)).toBeNull();
    expect(commandForKey(key('ArrowUp', { altKey: true, ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(key('ArrowUp'), false)).toBeNull();
  });

  it('uses ⌘ on macOS and ignores Ctrl there', () => {
    expect(commandForKey(key('z', { metaKey: true }), true)).toBe('undo');
    expect(commandForKey(key('z', { metaKey: true, shiftKey: true }), true)).toBe('redo');
    expect(commandForKey(key('z', { ctrlKey: true }), true)).toBeNull();
    // ⌘Y is not redo on macOS.
    expect(commandForKey(key('y', { metaKey: true }), true)).toBeNull();
  });

  it('maps Delete/Backspace alone to deleting the selected formula', () => {
    expect(commandForKey(key('Delete'), false)).toBe('delete-formula');
    expect(commandForKey(key('Backspace'), false)).toBe('delete-formula');
    expect(commandForKey(key('Delete', { shiftKey: true }), false)).toBeNull();
    expect(commandForKey(key('Delete', { ctrlKey: true }), false)).toBeNull();
  });

  it('maps "?" (with or without Shift) to the shortcut sheet', () => {
    expect(commandForKey(key('?', { shiftKey: true }), false)).toBe('shortcuts');
    expect(commandForKey(key('?'), true)).toBe('shortcuts');
    expect(commandForKey(key('?', { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(commandForKey(key('?', { altKey: true }), false)).toBeNull();
  });

  it('leaves Ctrl/⌘+D to the timeline, which duplicates the selected clips or block', () => {
    expect(commandForKey(key('d', { ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(key('D', { metaKey: true }), true)).toBeNull();
  });

  it('maps S alone to the circle selector of the preview', () => {
    expect(commandForKey(key('s'), false)).toBe('circle-select');
    expect(commandForKey(key('S'), true)).toBe('circle-select'); // Caps Lock
    // With a modifier it is another command, or none.
    expect(commandForKey(key('S', { shiftKey: true }), false)).toBeNull();
    expect(commandForKey(key('s', { ctrlKey: true }), false)).toBe('save');
    expect(commandForKey(key('s', { altKey: true }), false)).toBe('align-bottom');
  });

  it('maps C alone to the Creator and A alone to the Animations panel (D191)', () => {
    for (const mac of [false, true]) {
      expect(commandForKey(key('c'), mac)).toBe('toggle-creator');
      expect(commandForKey(key('C'), mac)).toBe('toggle-creator'); // Caps Lock
      expect(commandForKey(key('a'), mac)).toBe('toggle-animations');
      expect(commandForKey(key('A'), mac)).toBe('toggle-animations');
    }
    // With a modifier they are other commands, or none.
    expect(commandForKey(key('C', { shiftKey: true }), false)).toBe('copy-colours-order');
    expect(commandForKey(key('A', { shiftKey: true }), false)).toBeNull();
    expect(commandForKey(key('a', { ctrlKey: true }), false)).toBe('select-all');
    expect(commandForKey(key('a', { metaKey: true }), true)).toBe('select-all');
    expect(commandForKey(key('c', { ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(key('c', { metaKey: true }), true)).toBeNull();
    expect(commandForKey(key('a', { altKey: true }), false)).toBe('align-left');
    expect(commandForKey(key('c', { altKey: true }), false)).toBeNull();
    // On a keyboard of another script, the keys where C and A are.
    expect(commandForKey({ ...key('с'), code: 'KeyC' }, false)).toBe('toggle-creator');
    expect(commandForKey({ ...key('ф'), code: 'KeyA' }, false)).toBe('toggle-animations');
  });

  it('maps Alt+M to the multicamera (D190)', () => {
    for (const mac of [false, true]) {
      expect(commandForKey(key('m', { altKey: true }), mac)).toBe('toggle-multicamera');
      expect(commandForKey(key('M', { altKey: true }), mac)).toBe('toggle-multicamera');
    }
    // Option+M types «µ» on a Mac: the key is read by its place.
    expect(commandForKey({ ...key('µ', { altKey: true }), code: 'KeyM' }, true)).toBe(
      'toggle-multicamera',
    );
    expect(commandForKey(key('M', { altKey: true, shiftKey: true }), false)).toBeNull();
    expect(commandForKey(key('m'), false)).toBeNull();
    expect(commandForKey(key('m', { ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(key('m', { ctrlKey: true, altKey: true }), false)).toBeNull();
  });

  it('maps V to the camera view (D190)', () => {
    for (const mac of [false, true]) {
      expect(commandForKey(key('v'), mac)).toBe('toggle-camera-view');
      expect(commandForKey(key('V'), mac)).toBe('toggle-camera-view');
    }
    expect(commandForKey({ ...key('м'), code: 'KeyV' }, false)).toBe('toggle-camera-view');
    // Shift+V pastes the colours in order; Ctrl/⌘+V is the clipboard's.
    expect(commandForKey(key('V', { shiftKey: true }), false)).toBe('paste-colours-order');
    expect(commandForKey(key('v', { ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(key('v', { metaKey: true }), true)).toBeNull();
    // Alt+V aligns to the middle.
    expect(commandForKey(key('v', { altKey: true }), false)).toBe('align-middle');
  });

  it('maps P and Shift+P to a pause and a comment of the Slides mode at the playhead (D200)', () => {
    for (const mac of [false, true]) {
      expect(commandForKey(key('p'), mac)).toBe('add-pause');
      expect(commandForKey(key('P', { shiftKey: true }), mac)).toBe('add-comment');
    }
    // On a keyboard of another script, the key where P is.
    expect(commandForKey({ ...key('з'), code: 'KeyP' }, false)).toBe('add-pause');
    // With Ctrl, ⌘ or Alt it is not theirs (Ctrl/⌘+P prints the page).
    expect(commandForKey(key('p', { ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(key('p', { metaKey: true }), true)).toBeNull();
    expect(commandForKey(key('p', { altKey: true }), false)).toBeNull();
  });

  it('leaves other keys (Space is the playback key) alone', () => {
    expect(commandForKey(key(' '), false)).toBeNull();
    expect(commandForKey(key('b'), false)).toBeNull();
    expect(commandForKey(key('z', { ctrlKey: true, altKey: true }), false)).toBeNull();
  });
});

describe('commandForKey on a layout of another script, and on Latin layouts', () => {
  /** A key press with its `code`, the place of the key on the keyboard. */
  const press = (
    k: string,
    code: string,
    mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
  ) => ({ ...key(k, mods), code });

  it('reads Alt+A from the physical key (control: it did already)', () => {
    expect(commandForKey(press('ф', 'KeyA', { altKey: true }), false)).toBe('align-left');
  });

  it('reads the letters with Ctrl/⌘ from the place of the key: Russian, Greek, Hebrew', () => {
    // Ctrl+Z on a Russian layout is "я", Ctrl+S "ы", and so on (Chrome gives the layout's
    // character, the physical key in `code`).
    expect(commandForKey(press('я', 'KeyZ', { ctrlKey: true }), false)).toBe('undo');
    expect(commandForKey(press('Я', 'KeyZ', { ctrlKey: true, shiftKey: true }), false)).toBe(
      'redo',
    );
    expect(commandForKey(press('н', 'KeyY', { ctrlKey: true }), false)).toBe('redo');
    expect(commandForKey(press('ы', 'KeyS', { ctrlKey: true }), false)).toBe('save');
    expect(commandForKey(press('Ы', 'KeyS', { ctrlKey: true, shiftKey: true }), false)).toBe(
      'sync-folder',
    );
    expect(commandForKey(press('щ', 'KeyO', { ctrlKey: true }), false)).toBe('open');
    expect(commandForKey(press('ф', 'KeyA', { ctrlKey: true }), false)).toBe('select-all');
    expect(commandForKey(press('а', 'KeyF', { ctrlKey: true }), false)).toBe('search-formulas');
    // ⌘ on a Mac, Greek and Hebrew letters too.
    expect(commandForKey(press('ζ', 'KeyZ', { metaKey: true }), true)).toBe('undo');
    expect(commandForKey(press('ד', 'KeyS', { metaKey: true }), true)).toBe('save');
  });

  it('reads S, Shift+C and Shift+V from the place of the key there too', () => {
    expect(commandForKey(press('ы', 'KeyS'), false)).toBe('circle-select');
    expect(commandForKey(press('С', 'KeyC', { shiftKey: true }), false)).toBe('copy-colours-order');
    expect(commandForKey(press('М', 'KeyV', { shiftKey: true }), true)).toBe('paste-colours-order');
    // A Hindi layout puts vowel signs, which are marks, on letter keys.
    expect(commandForKey(press('ॆ', 'KeyZ', { ctrlKey: true }), false)).toBe('undo');
  });

  it('keeps the letter a Latin layout types, wherever its key is: Dvorak, AZERTY', () => {
    // Dvorak types Z on the place of "/" and ";" on the place of Z; S on the place of ";".
    expect(commandForKey(press('z', 'Slash', { ctrlKey: true }), false)).toBe('undo');
    expect(commandForKey(press(';', 'KeyZ', { ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(press('s', 'Semicolon'), false)).toBe('circle-select');
    expect(commandForKey(press('o', 'KeyS'), false)).toBeNull();
    // Its O, on the place of S, is Ctrl/⌘+O with Ctrl: the letter wins over the place.
    expect(commandForKey(press('o', 'KeyS', { ctrlKey: true }), false)).toBe('open');
    // AZERTY: A on the place of Q, Z on the place of W, "," on the place of M.
    expect(commandForKey(press('a', 'KeyQ', { ctrlKey: true }), false)).toBe('select-all');
    expect(commandForKey(press('q', 'KeyA', { ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(press('z', 'KeyW', { metaKey: true }), true)).toBe('undo');
    expect(commandForKey(press('w', 'KeyZ', { metaKey: true }), true)).toBeNull();
    expect(commandForKey(press(',', 'KeyM'), false)).toBeNull();
  });

  it('borrows no letter for a key that typed none: a digit, a sign, an IME at work', () => {
    expect(commandForKey(press('2', 'Digit2', { ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(press('Process', 'KeyS'), false)).toBeNull();
    expect(commandForKey(press('Unidentified', 'KeyZ', { ctrlKey: true }), false)).toBeNull();
    expect(commandForKey(press('ArrowUp', 'ArrowUp', { altKey: true }), false)).toBe('grid-denser');
  });
});

describe('actsOnPreview', () => {
  it('is true for what changes or reads the scene, false for the rest', () => {
    const scene = [
      'select-all',
      'toggle-grid',
      'grid-denser',
      'grid-sparser',
      'align-symbol',
      'align-symbol-locked',
      'circle-select',
      'copy-colours-order',
      'paste-colours-order',
      'toggle-multicamera',
      'toggle-camera-view',
      'align-left',
      'align-middle-frame',
      'distribute-h',
    ] as const;
    for (const command of scene) expect(actsOnPreview(command), command).toBe(true);
    const beside = [
      'undo',
      'redo',
      'save',
      'save-as',
      'open',
      'sync-folder',
      'new',
      'delete-formula',
      'shortcuts',
      'search-formulas',
      'toggle-creator',
      'toggle-animations',
      'add-pause',
      'add-comment',
    ] as const;
    for (const command of beside) expect(actsOnPreview(command), command).toBe(false);
  });
});

describe('isTextEntryTarget', () => {
  it('is true for inputs, textareas, selects, contenteditable and math-field', () => {
    const make = (html: string) => {
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      return host.firstElementChild!;
    };
    expect(isTextEntryTarget(make('<input type="text">'))).toBe(true);
    expect(isTextEntryTarget(make('<input type="search">'))).toBe(true);
    expect(isTextEntryTarget(make('<textarea></textarea>'))).toBe(true);
    expect(isTextEntryTarget(make('<select></select>'))).toBe(true);
    const editable = make('<div contenteditable="true"></div>');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isTextEntryTarget(editable)).toBe(true);
    const field = make('<math-field><span id="inner"></span></math-field>');
    expect(isTextEntryTarget(field)).toBe(true);
    expect(isTextEntryTarget(field.querySelector('#inner'))).toBe(true);
  });

  it('is false for buttons, checkboxes, colour pickers, plain elements and non-elements', () => {
    const make = (html: string) => {
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      return host.firstElementChild!;
    };
    expect(isTextEntryTarget(make('<button></button>'))).toBe(false);
    expect(isTextEntryTarget(make('<input type="checkbox">'))).toBe(false);
    expect(isTextEntryTarget(make('<input type="color">'))).toBe(false);
    expect(isTextEntryTarget(make('<div></div>'))).toBe(false);
    expect(isTextEntryTarget(document)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});

describe('spaceOperates', () => {
  const make = (html: string) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host.firstElementChild!;
  };

  it('is true for the controls Space operates', () => {
    expect(spaceOperates(make('<input type="text">'))).toBe(true);
    expect(spaceOperates(make('<input type="checkbox">'))).toBe(true);
    expect(spaceOperates(make('<input type="radio">'))).toBe(true);
    expect(spaceOperates(make('<summary>More</summary>'))).toBe(true);
    expect(spaceOperates(make('<div role="menuitemradio"></div>'))).toBe(true);
    expect(spaceOperates(make('<li role="option"></li>'))).toBe(true);
    expect(spaceOperates(make('<button role="tab"></button>'))).toBe(true);
  });

  it('leaves a button that is not focused from the keyboard, and the rest, to playback', () => {
    expect(spaceOperates(make('<button type="button">Go</button>'))).toBe(false);
    expect(spaceOperates(make('<div tabindex="0"></div>'))).toBe(false);
    expect(spaceOperates(null)).toBe(false);
  });
});
