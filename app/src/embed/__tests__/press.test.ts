// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isMainPress } from '../press';

describe('isMainPress', () => {
  it('is the press of the main button', () => {
    for (const apple of [false, true]) {
      expect(isMainPress({ button: 0, ctrlKey: false }, apple)).toBe(true);
      expect(isMainPress({ button: 1, ctrlKey: false }, apple)).toBe(false);
      expect(isMainPress({ button: 2, ctrlKey: false }, apple)).toBe(false);
    }
  });

  it('is not a Mac’s click with Ctrl, which opens the menu', () => {
    expect(isMainPress({ button: 0, ctrlKey: true }, true)).toBe(false);
    // Elsewhere Ctrl is a key held with the click.
    expect(isMainPress({ button: 0, ctrlKey: true }, false)).toBe(true);
  });
});
