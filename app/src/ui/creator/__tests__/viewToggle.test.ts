// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { otherView, viewToggle } from '../viewToggle';

describe('the key that switches the view of the Creator list (D179)', () => {
  it('in the list view, shows the icon of the blocks and says a press switches to them', () => {
    expect(viewToggle('list')).toEqual({
      next: 'grid',
      icon: 'view-grid',
      label: 'Switch to block view',
      title: 'Switch to block view: a square per formula; point at one for its rendering',
    });
  });

  it('in the block view, shows the icon of the rows and says a press switches to them', () => {
    expect(viewToggle('grid')).toEqual({
      next: 'list',
      icon: 'view-list',
      label: 'Switch to list view',
      title: 'Switch to list view: a row per formula, with its rendering',
    });
  });

  it('goes to the other view and, pressed again, back', () => {
    expect(otherView('list')).toBe('grid');
    expect(otherView('grid')).toBe('list');
    for (const view of ['list', 'grid'] as const) {
      expect(viewToggle(viewToggle(view).next).next).toBe(view);
      // Its tooltip starts with its name: the two say the same thing.
      expect(viewToggle(view).title.startsWith(`${viewToggle(view).label}: `)).toBe(true);
    }
  });
});
