import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { focusedByKeyboard, trackFocusOrigin } from '../focusOrigin';

describe('focusOrigin', () => {
  it('tells a focus reached with the keyboard from one after a click', () => {
    trackFocusOrigin();
    const a = document.body.appendChild(document.createElement('button'));
    const b = document.body.appendChild(document.createElement('button'));
    fireEvent.keyDown(document.body, { key: 'Tab' });
    a.focus();
    expect(focusedByKeyboard(a)).toBe(true);
    fireEvent.pointerDown(b);
    b.focus();
    expect(focusedByKeyboard(b)).toBe(false);
    // A key pressed on the clicked button does not change how it got the focus.
    fireEvent.keyDown(b, { key: ' ' });
    expect(focusedByKeyboard(b)).toBe(false);
    b.blur();
    expect(focusedByKeyboard(b)).toBe(false);
  });
});
