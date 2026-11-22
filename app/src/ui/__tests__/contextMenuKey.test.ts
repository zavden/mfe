import { afterEach, describe, expect, it } from 'vitest';
import { isMenuKey, menuPoint, startContextMenuKey } from '../contextMenuKey';

const key = (init: KeyboardEventInit) =>
  new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

/** A focused button with a box, and the `contextmenu` events that reach the document. */
function focusedButton(box = { left: 100, top: 50, width: 200, height: 40 }) {
  const button = document.createElement('button');
  button.getBoundingClientRect = () =>
    ({ ...box, right: box.left + box.width, bottom: box.top + box.height }) as DOMRect;
  document.body.append(button);
  button.focus();
  const seen: MouseEvent[] = [];
  const listen = (event: Event) => seen.push(event as MouseEvent);
  document.addEventListener('contextmenu', listen);
  cleanups.push(() => {
    document.removeEventListener('contextmenu', listen);
    button.remove();
  });
  return { button, seen };
}

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});

function started(mac: boolean): void {
  cleanups.push(startContextMenuKey(() => mac));
}

describe('isMenuKey', () => {
  it('takes the Menu key and Shift+F10, without other modifiers', () => {
    expect(isMenuKey(key({ key: 'ContextMenu' }))).toBe(true);
    expect(isMenuKey(key({ key: 'F10', shiftKey: true }))).toBe(true);
    expect(isMenuKey(key({ key: 'F10' }))).toBe(false);
    expect(isMenuKey(key({ key: 'F10', shiftKey: true, metaKey: true }))).toBe(false);
    expect(isMenuKey(key({ key: 'F10', shiftKey: true, ctrlKey: true }))).toBe(false);
    expect(isMenuKey(key({ key: 'F10', shiftKey: true, altKey: true }))).toBe(false);
    expect(isMenuKey(key({ key: 'ContextMenu', ctrlKey: true }))).toBe(false);
    expect(isMenuKey(key({ key: 'Enter', shiftKey: true }))).toBe(false);
  });
});

describe('menuPoint', () => {
  const viewport = { width: 1280, height: 720 };

  it('is the middle of the box, on whole pixels', () => {
    expect(menuPoint({ left: 100, top: 50, right: 300, bottom: 90 }, viewport)).toEqual({
      x: 200,
      y: 70,
    });
    expect(menuPoint({ left: 37, top: 150.5, right: 338, bottom: 221.5 }, viewport)).toEqual({
      x: 187,
      y: 186,
    });
  });

  it('is the middle of the part of the box that is in the window', () => {
    expect(menuPoint({ left: 400, top: 320, right: 700, bottom: 920 }, viewport)).toEqual({
      x: 550,
      y: 520,
    });
    expect(menuPoint({ left: -100, top: -40, right: 100, bottom: 40 }, viewport)).toEqual({
      x: 50,
      y: 20,
    });
  });
});

describe('startContextMenuKey', () => {
  it('on a Mac, Shift+F10 sends a contextmenu event to what has the focus, at its middle', () => {
    started(true);
    const { button, seen } = focusedButton();
    const event = key({ key: 'F10', shiftKey: true });
    button.dispatchEvent(event);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.target).toBe(button);
    expect([seen[0]!.clientX, seen[0]!.clientY]).toEqual([200, 70]);
    expect(seen[0]!.bubbles).toBe(true);
    expect(seen[0]!.cancelable).toBe(true);
    // The key is taken: nothing else answers it.
    expect(event.defaultPrevented).toBe(true);
  });

  it('on a Mac, an SVG that has the focus gets it as well (the glyph view of a formula)', () => {
    started(true);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('tabindex', '-1');
    svg.getBoundingClientRect = () =>
      ({ left: 40, top: 60, right: 240, bottom: 160, width: 200, height: 100 }) as DOMRect;
    document.body.append(svg);
    cleanups.push(() => svg.remove());
    svg.focus();
    expect(document.activeElement).toBe(svg);
    const seen: MouseEvent[] = [];
    svg.addEventListener('contextmenu', (event) => seen.push(event as MouseEvent));
    svg.dispatchEvent(key({ key: 'F10', shiftKey: true }));
    expect(seen).toHaveLength(1);
    expect([seen[0]!.clientX, seen[0]!.clientY]).toEqual([140, 110]);
  });

  it('on a Mac, the Menu key does the same', () => {
    started(true);
    const { button, seen } = focusedButton();
    button.dispatchEvent(key({ key: 'ContextMenu' }));
    expect(seen).toHaveLength(1);
  });

  it('leaves the key to the browser where the browser has it', () => {
    started(false);
    const { button, seen } = focusedButton();
    const event = key({ key: 'F10', shiftKey: true });
    button.dispatchEvent(event);
    expect(seen).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a key that something already took (the timeline opens its own menus)', () => {
    started(true);
    const { button, seen } = focusedButton();
    button.addEventListener('keydown', (event) => event.preventDefault());
    button.dispatchEvent(key({ key: 'F10', shiftKey: true }));
    expect(seen).toEqual([]);
  });

  it('does nothing when nothing has the focus, or for another key', () => {
    started(true);
    const { button, seen } = focusedButton();
    button.dispatchEvent(key({ key: 'F10' }));
    button.blur();
    document.body.dispatchEvent(key({ key: 'F10', shiftKey: true }));
    expect(seen).toEqual([]);
  });

  it('stops when it is stopped', () => {
    const stop = startContextMenuKey(() => true);
    const { button, seen } = focusedButton();
    stop();
    button.dispatchEvent(key({ key: 'F10', shiftKey: true }));
    expect(seen).toEqual([]);
  });
});
