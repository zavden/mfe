import { describe, expect, it, vi } from 'vitest';
import { captureFocus, inOpenMenu, keepFocus, rovingIndex, typeAheadIndex } from '../focus';

describe('rovingIndex', () => {
  it('steps with the arrows and wraps at the ends', () => {
    expect(rovingIndex('ArrowRight', 0, 3)).toBe(1);
    expect(rovingIndex('ArrowRight', 2, 3)).toBe(0);
    expect(rovingIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(rovingIndex('ArrowDown', 1, 3)).toBe(2);
    expect(rovingIndex('ArrowUp', 0, 3)).toBe(2);
  });

  it('jumps to the ends with Home and End', () => {
    expect(rovingIndex('Home', 2, 3)).toBe(0);
    expect(rovingIndex('End', 0, 3)).toBe(2);
  });

  it('only listens to the arrows of its axis', () => {
    expect(rovingIndex('ArrowDown', 0, 3, 'horizontal')).toBeNull();
    expect(rovingIndex('ArrowRight', 0, 3, 'vertical')).toBeNull();
    expect(rovingIndex('ArrowUp', 1, 3, 'vertical')).toBe(0);
    expect(rovingIndex('End', 1, 3, 'horizontal')).toBe(2);
  });

  it('ignores other keys and empty rows', () => {
    expect(rovingIndex('Enter', 0, 3)).toBeNull();
    expect(rovingIndex('ArrowRight', 0, 0)).toBeNull();
    expect(rovingIndex('Home', 0, 0)).toBeNull();
  });

  it('enters a row with nothing focused at its first item', () => {
    expect(rovingIndex('ArrowDown', -1, 3, 'vertical')).toBe(0);
  });
});

describe('inOpenMenu', () => {
  const page = (html: string): HTMLElement => {
    const root = document.body.appendChild(document.createElement('div'));
    root.innerHTML = html;
    return root;
  };

  it('is true inside a menu, and inside a submenu of it', () => {
    const root = page(
      '<div role="menu"><button id="a"></button><div role="menu"><button id="b"></button></div></div>',
    );
    expect(inOpenMenu(root.querySelector('#a'))).toBe(true);
    expect(inOpenMenu(root.querySelector('#b'))).toBe(true);
    root.remove();
  });

  it('is true on the bar while one of its menus is open: on its button, on any other', () => {
    const root = page(
      '<div role="menubar"><button id="file"></button><button id="edit"></button>' +
        '<div role="menu"><button id="entry"></button></div></div>',
    );
    expect(inOpenMenu(root.querySelector('#file'))).toBe(true);
    expect(inOpenMenu(root.querySelector('#edit'))).toBe(true);
    expect(inOpenMenu(root.querySelector('#entry'))).toBe(true);
    root.remove();
  });

  it('is false on the bar with its menus closed, though a menu is open elsewhere', () => {
    const root = page(
      '<div role="menubar"><button id="edit"></button></div>' +
        '<div role="menu"><button id="entry"></button></div><button id="out"></button>',
    );
    expect(inOpenMenu(root.querySelector('#edit'))).toBe(false);
    expect(inOpenMenu(root.querySelector('#out'))).toBe(false);
    root.remove();
  });

  it('is true on the page itself while a menu is open: the focus fell out of it', () => {
    // A press on a menu's heading lets the focus go to the page, and the menu stays.
    const root = page(
      '<div role="menu"><div id="heading"></div><button id="entry"></button></div>',
    );
    expect(inOpenMenu(document.body)).toBe(true);
    expect(inOpenMenu(document.documentElement)).toBe(true);
    root.remove();
    // No menu open: the page's keys are nobody else's.
    expect(inOpenMenu(document.body)).toBe(false);
    expect(inOpenMenu(document.documentElement)).toBe(false);
  });

  it('is false for what is no element: the window, nothing', () => {
    expect(inOpenMenu(window)).toBe(false);
    expect(inOpenMenu(null)).toBe(false);
  });
});

describe('captureFocus', () => {
  it('gives the focus back to the element that had it', () => {
    const a = document.body.appendChild(document.createElement('button'));
    const b = document.body.appendChild(document.createElement('button'));
    a.focus();
    const restore = captureFocus();
    b.focus();
    expect(document.activeElement).toBe(b);
    restore();
    expect(document.activeElement).toBe(a);
    a.remove();
    b.remove();
  });

  it('leaves the focus alone when that element is gone', () => {
    const a = document.body.appendChild(document.createElement('button'));
    const b = document.body.appendChild(document.createElement('button'));
    a.focus();
    const restore = captureFocus();
    a.remove();
    b.focus();
    restore();
    expect(document.activeElement).toBe(b);
    b.remove();
  });
});

describe('keepFocus', () => {
  it('prevents the default of the press', () => {
    const preventDefault = vi.fn();
    keepFocus({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});

describe('typeAheadIndex', () => {
  const labels = ['File', 'Edit', 'View', 'Preferences', 'Export', 'Help'];

  it('finds the next label with that initial after the current one, wrapping, case ignored', () => {
    expect(typeAheadIndex(labels, 0, 'e')).toBe(1);
    expect(typeAheadIndex(labels, 1, 'E')).toBe(4);
    expect(typeAheadIndex(labels, 4, 'e')).toBe(1);
    expect(typeAheadIndex(labels, -1, 'h')).toBe(5);
    expect(typeAheadIndex(labels, 5, 'f')).toBe(0);
  });

  it('keeps a lone match, and finds nothing for an initial no label has', () => {
    expect(typeAheadIndex(labels, 2, 'v')).toBe(2);
    expect(typeAheadIndex(labels, 0, 'z')).toBeNull();
    expect(typeAheadIndex([], 0, 'a')).toBeNull();
    expect(typeAheadIndex(['  Spaced'], -1, 's')).toBe(0);
  });
});
