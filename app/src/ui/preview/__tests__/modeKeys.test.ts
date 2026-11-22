import { afterEach, describe, expect, it } from 'vitest';
import { closeFormulaSearch, openFormulaSearch } from '../../creator/search/formulaSearchStore';
import { modalStack } from '../../project/modalStack';
import { keyIsTaken, modeOwnsKey, pressesModeBar } from '../modeKeys';

/** Whether a key pressed on the element `id` of this page is somebody else's. */
function taken(html: string, id: string, key = 'Enter'): boolean {
  const root = document.body.appendChild(document.createElement('div'));
  root.innerHTML = html;
  let answer: boolean | null = null;
  const onKeyDown = (event: KeyboardEvent) => {
    answer = keyIsTaken(event);
  };
  window.addEventListener('keydown', onKeyDown, true);
  root.querySelector(`#${id}`)!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  window.removeEventListener('keydown', onKeyDown, true);
  root.remove();
  if (answer === null) throw new Error('the key was not heard');
  return answer;
}

const BUTTON = '<button id="x"></button>';

afterEach(() => {
  modalStack.length = 0;
  closeFormulaSearch();
});

describe('keyIsTaken: whose a key is while a mode of the Preview is on', () => {
  it('is the mode’s on what only has the focus: a button, a clip, the page', () => {
    expect(taken(BUTTON, 'x')).toBe(false);
    expect(taken('<div id="x" tabindex="0" role="gridcell"></div>', 'x', 'ArrowDown')).toBe(false);
    expect(taken('<input id="x" type="checkbox">', 'x')).toBe(false);
  });

  it('is a dialog’s while one is open', () => {
    modalStack.push(Symbol('dialog'));
    expect(taken(BUTTON, 'x')).toBe(true);
  });

  it('is the search’s while it covers the Preview', () => {
    openFormulaSearch();
    expect(taken(BUTTON, 'x', 'Escape')).toBe(true);
  });

  it('is a field’s while it is typed in', () => {
    expect(taken('<input id="x" type="text">', 'x', 'Backspace')).toBe(true);
    expect(taken('<textarea id="x"></textarea>', 'x')).toBe(true);
    expect(taken('<select id="x"></select>', 'x', 'ArrowDown')).toBe(true);
  });

  it('is a menu’s while it is open: inside it, and on the bar it hangs from', () => {
    expect(taken('<div role="menu"><button id="x"></button></div>', 'x')).toBe(true);
    const bar = (menu: string) =>
      `<div role="menubar"><button id="x" role="menuitem"></button>${menu}</div>`;
    expect(taken(bar('<div role="menu"></div>'), 'x', 'ArrowDown')).toBe(true);
    // Its menus closed, the bar owns no key of a mode: an entry chosen there leaves the focus
    // on its button.
    expect(taken(bar(''), 'x', 'ArrowDown')).toBe(false);
    expect(taken(bar(''), 'x', 'Escape')).toBe(false);
  });
});

/** Whether a key pressed on a button of this page, with the keys of `held` down, is a mode's. */
function owned(held: KeyboardEventInit, html = BUTTON): boolean {
  const root = document.body.appendChild(document.createElement('div'));
  root.innerHTML = html;
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, ...held });
  root.querySelector('#x')!.dispatchEvent(event);
  root.remove();
  return modeOwnsKey(event);
}

describe('modeOwnsKey: the keys a mode of the Preview takes', () => {
  it('is a key pressed alone, or with Shift, that is nobody else’s', () => {
    expect(owned({})).toBe(true);
    expect(owned({ shiftKey: true })).toBe(true);
  });

  it('is not one held with Ctrl, ⌘ or Alt: a shortcut’s', () => {
    expect(owned({ ctrlKey: true })).toBe(false);
    expect(owned({ metaKey: true })).toBe(false);
    expect(owned({ altKey: true })).toBe(false);
    expect(owned({ altKey: true, shiftKey: true })).toBe(false);
  });

  it('is not one that is somebody else’s, pressed alone or not', () => {
    expect(owned({}, '<input id="x" type="text">')).toBe(false);
    expect(owned({}, '<div role="menu"><button id="x"></button></div>')).toBe(false);
    modalStack.push(Symbol('dialog'));
    expect(owned({})).toBe(false);
    expect(owned({ altKey: true })).toBe(false);
  });
});

/** Whether `key` pressed on the element `id` of this page presses a button of a mode's bar. */
function pressesBar(html: string, id: string, key: string): boolean {
  const root = document.body.appendChild(document.createElement('div'));
  root.innerHTML = html;
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  root.querySelector(`#${id}`)!.dispatchEvent(event);
  root.remove();
  return pressesModeBar(event);
}

describe('pressesModeBar: the keys a button of a mode’s own bar takes', () => {
  const BAR =
    '<div data-mode-bar=""><button id="b"><span id="s">›</span></button><span id="t"></span></div>';

  it('is Enter or Space on a button of the bar, or inside one', () => {
    expect(pressesBar(BAR, 'b', 'Enter')).toBe(true);
    expect(pressesBar(BAR, 'b', ' ')).toBe(true);
    expect(pressesBar(BAR, 's', 'Enter')).toBe(true);
  });

  it('is no other key, nor what of the bar is no button, nor a button elsewhere', () => {
    expect(pressesBar(BAR, 'b', 'Escape')).toBe(false);
    expect(pressesBar(BAR, 'b', 'Backspace')).toBe(false);
    expect(pressesBar(BAR, 't', 'Enter')).toBe(false);
    expect(pressesBar(BUTTON.replace('x', 'b'), 'b', 'Enter')).toBe(false);
  });
});
