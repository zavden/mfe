/* The keys of a deck, as a function of the key and of what it was pressed on; and the notes of
 * where a deck stands. Pure (jsdom only builds the elements a key is pressed on). */
import { describe, expect, it } from 'vitest';
import { keyCommand, targetKind } from '../keys';
import { notesAt } from '../notes';

const press = (key: string, more: Partial<KeyboardEvent> = {}) => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
  ...more,
});

describe('keyCommand', () => {
  it('goes on with the keys of PowerPoint, reveal.js and a presenter’s remote', () => {
    for (const key of ['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'n', 'N', 'Enter', 'Right']) {
      expect(keyCommand(press(key), 'other'), key).toBe('next');
    }
    for (const key of ['ArrowLeft', 'ArrowUp', 'PageUp', 'p', 'P', 'Backspace', 'Left']) {
      expect(keyCommand(press(key), 'other'), key).toBe('previous');
    }
    expect(keyCommand(press(' ', { shiftKey: true }), 'other')).toBe('previous');
    expect(keyCommand(press('Home'), 'other')).toBe('start');
    expect(keyCommand(press('End'), 'other')).toBe('end');
  });

  it('switches with a letter, or the remote’s blackout key', () => {
    expect(keyCommand(press('k'), 'other')).toBe('toggle');
    expect(keyCommand(press('K', { shiftKey: true }), 'other')).toBe('toggle');
    expect(keyCommand(press('f'), 'other')).toBe('fullscreen');
    expect(keyCommand(press('s'), 'other')).toBe('notes');
    expect(keyCommand(press('S'), 'other')).toBe('notes');
    expect(keyCommand(press('b'), 'other')).toBe('blackout');
    expect(keyCommand(press('.'), 'other')).toBe('blackout');
    expect(keyCommand(press('m'), 'other')).toBe('mute');
    // A key held down switches once; going on repeats.
    expect(keyCommand(press('b', { repeat: true }), 'other')).toBeNull();
    expect(keyCommand(press('ArrowRight', { repeat: true }), 'other')).toBe('next');
  });

  it('leaves the browser’s keys and chords alone', () => {
    for (const key of ['Tab', 'Escape', 'F5', 'F11', 'a', '1', 'Shift', 'Control']) {
      expect(keyCommand(press(key), 'other'), key).toBeNull();
    }
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'isComposing'] as const) {
      expect(keyCommand(press('ArrowRight', { [modifier]: true }), 'other'), modifier).toBeNull();
      expect(keyCommand(press('f', { [modifier]: true }), 'other'), modifier).toBeNull();
    }
  });

  it('never takes a key from a field, Space or Enter from a button, or the arrows from a widget', () => {
    for (const key of ['ArrowRight', ' ', 'n', 'f', 'Backspace', 'Home']) {
      expect(keyCommand(press(key), 'field'), key).toBeNull();
    }
    expect(keyCommand(press(' '), 'button')).toBeNull();
    expect(keyCommand(press('Enter'), 'button')).toBeNull();
    expect(keyCommand(press('PageDown'), 'button')).toBe('next');
    expect(keyCommand(press('ArrowRight'), 'button')).toBe('next');
    for (const key of ['ArrowRight', 'ArrowUp', 'PageDown', 'Home', 'End', ' ']) {
      expect(keyCommand(press(key), 'widget'), key).toBeNull();
    }
    expect(keyCommand(press('n'), 'widget')).toBe('next');
    expect(keyCommand(press('s'), 'widget')).toBe('notes');
  });
});

describe('targetKind', () => {
  const html = (markup: string, selector: string) => {
    document.body.innerHTML = markup;
    return document.querySelector(selector);
  };

  it('tells what one types in', () => {
    expect(targetKind(html('<input>', 'input'))).toBe('field');
    expect(targetKind(html('<input type="search">', 'input'))).toBe('field');
    expect(targetKind(html('<textarea></textarea>', 'textarea'))).toBe('field');
    expect(targetKind(html('<select></select>', 'select'))).toBe('field');
    expect(targetKind(html('<div contenteditable><b>x</b></div>', 'b'))).toBe('field');
    expect(targetKind(html('<div contenteditable="false"><b>x</b></div>', 'b'))).toBe('other');
    expect(targetKind(html('<div role="textbox"><i>x</i></div>', 'i'))).toBe('field');
  });

  it('tells what a key presses', () => {
    expect(targetKind(html('<button><span>x</span></button>', 'span'))).toBe('button');
    expect(targetKind(html('<a href="#x"><b>x</b></a>', 'b'))).toBe('button');
    expect(targetKind(html('<a>x</a>', 'a'))).toBe('other');
    expect(targetKind(html('<input type="checkbox">', 'input'))).toBe('button');
    expect(targetKind(html('<details><summary>x</summary></details>', 'summary'))).toBe('button');
    expect(targetKind(html('<div role="tab">x</div>', 'div'))).toBe('button');
  });

  it('tells what the arrows move, but not the deck’s own timeline', () => {
    expect(targetKind(html('<input type="range">', 'input'))).toBe('widget');
    expect(targetKind(html('<div role="slider"><i></i></div>', 'i'))).toBe('widget');
    expect(targetKind(html('<ul role="listbox"><li role="option">x</li></ul>', 'ul'))).toBe(
      'widget',
    );
    expect(targetKind(html('<video controls></video>', 'video'))).toBe('widget');
    expect(
      targetKind(
        html(
          '<div class="mfe-deck"><div class="mfe-timeline" role="slider" tabindex="0"></div></div>',
          '.mfe-timeline',
        ),
      ),
    ).toBe('other');
    // Inside a deck, what is around the deck does not count.
    expect(
      targetKind(html('<div role="slider"><div class="mfe-deck"><i></i></div></div>', 'i')),
    ).toBe('other');
  });

  it('tells the page and the rest as other', () => {
    expect(targetKind(document.body)).toBe('other');
    expect(targetKind(null)).toBe('other');
    expect(targetKind(document)).toBe('other');
    expect(targetKind(html('<div><span>x</span></div>', 'span'))).toBe('other');
  });
});

describe('notesAt', () => {
  const deck = {
    duration: 6,
    pauses: [
      { time: 1.5, note: 'Ask the room', resume: 1.5 },
      { time: 3.5, note: '', resume: 3.5 },
      { time: 4.5, note: 'Questions', resume: 4.5 },
    ],
    comments: [
      { time: 0.5, text: 'Slowly' },
      { time: 1.5, text: 'At the pause' },
      { time: 2.5, text: 'A flash' },
      { time: 5, text: 'The end' },
    ],
  };
  const at = (time: number, slide: number) =>
    notesAt({ ...deck, time, slide }).map((item) => `${item.kind}@${item.time}:${item.text}`);

  it('gives the comments of the slide, and the note of the pause it stands at or passed', () => {
    expect(at(0, 0)).toEqual(['comment@0.5:Slowly', 'comment@1.5:At the pause']);
    // Stopped at the first pause: still its slide, and the pause's note, after the comment of the
    // same instant.
    expect(at(1.5, 0)).toEqual([
      'comment@0.5:Slowly',
      'comment@1.5:At the pause',
      'pause@1.5:Ask the room',
    ]);
    // Going on: the next slide's comments, the pause it passed.
    expect(at(2, 1)).toEqual(['pause@1.5:Ask the room', 'comment@2.5:A flash']);
    // A pause without a note says nothing, and hides the one before it.
    expect(at(3.5, 1)).toEqual(['comment@2.5:A flash']);
    expect(at(4.5, 2)).toEqual(['pause@4.5:Questions']);
    expect(at(6, 3)).toEqual(['pause@4.5:Questions', 'comment@5:The end']);
  });

  it('says of a pause that skips its wait that it does', () => {
    const pauses = [{ time: 1.5, note: 'Ask the room', resume: 2 }, deck.pauses[1]!];
    expect(notesAt({ ...deck, pauses, time: 1.5, slide: 0 }).at(-1)).toEqual({
      kind: 'pause',
      time: 1.5,
      text: 'Ask the room',
      skipsWait: true,
    });
    expect(notesAt({ ...deck, time: 1.5, slide: 0 }).at(-1)).not.toHaveProperty('skipsWait');
  });
});
