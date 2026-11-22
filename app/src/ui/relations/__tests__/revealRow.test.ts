import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealRow } from '../revealRow';

/** A list 100 px high at y = 300 on screen, scrolled by `scrollTop`, inside a dialog that scrolls
 * too, with a row `height` px high whose top is `top` px down the list's content. */
function listWith(top: number, height: number, scrollTop: number) {
  const dialog = document.createElement('div');
  const list = document.createElement('ol');
  const row = document.createElement('li');
  list.append(row);
  dialog.append(list);
  document.body.append(dialog);
  Object.defineProperty(list, 'clientHeight', { value: 100 });
  list.scrollTop = scrollTop;
  const box = (y: number, h: number) => ({ top: y, bottom: y + h, height: h }) as DOMRect;
  list.getBoundingClientRect = () => box(300, 100);
  row.getBoundingClientRect = () => box(300 + top - list.scrollTop, height);
  return { dialog, list, row };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('revealRow', () => {
  it('scrolls the list down just enough for a row under its edge', () => {
    const { list, row } = listWith(150, 30, 0);
    revealRow(row);
    expect(list.scrollTop).toBe(80);
  });

  it('scrolls it up to the top of a row over its edge', () => {
    const { list, row } = listWith(50, 30, 200);
    revealRow(row);
    expect(list.scrollTop).toBe(50);
  });

  it('leaves a row in sight where it is', () => {
    const { list, row } = listWith(220, 30, 200);
    revealRow(row);
    expect(list.scrollTop).toBe(200);
  });

  it('scrolls nothing but the list: the dialog stays under the pointer', () => {
    const into = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { dialog, list, row } = listWith(150, 30, 0);
    dialog.scrollTop = 40;
    revealRow(row);
    expect(list.scrollTop).toBe(80);
    expect(dialog.scrollTop).toBe(40);
    expect(into).not.toHaveBeenCalled();
  });

  it('does nothing without a row, or with one outside a list', () => {
    expect(() => revealRow(null)).not.toThrow();
    const stray = document.createElement('div');
    document.body.append(stray);
    expect(() => revealRow(stray)).not.toThrow();
  });
});
