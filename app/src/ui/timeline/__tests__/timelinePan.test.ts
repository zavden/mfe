import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { startTimelinePan } from '../timelinePan';

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
  document.body.replaceChildren();
});

/** A scrolling element at (300, 40) with a lane and a text field in it, panning started. */
function timeline() {
  const scroll = document.createElement('div');
  const lane = document.createElement('div');
  const field = document.createElement('input');
  scroll.append(lane, field);
  document.body.append(scroll);
  scroll.scrollLeft = 300;
  scroll.scrollTop = 40;
  stop = startTimelinePan(scroll);
  return { scroll, lane, field };
}
const view = (scroll: HTMLElement) => [scroll.scrollLeft, scroll.scrollTop];
const press = (target: Element, button = 1) =>
  fireEvent.pointerDown(target, { button, pointerId: 7, clientX: 500, clientY: 200 });
const moveTo = (clientX: number, clientY: number, pointerId = 7) =>
  fireEvent.pointerMove(window, { pointerId, clientX, clientY });

describe('panning the timeline with the middle button', () => {
  it('moves the view with the pointer on both axes at once, until the release', () => {
    const { scroll, lane } = timeline();
    // `fireEvent` answers false when the default was prevented: no scrolling mode of the browser.
    expect(press(lane)).toBe(false);
    expect(scroll).toHaveAttribute('data-panning');
    expect(view(scroll)).toEqual([300, 40]);
    // The pointer goes left and down: the content follows it, so the view goes right and up.
    moveTo(380, 215);
    expect(view(scroll)).toEqual([420, 25]);
    moveTo(560, 170);
    expect(view(scroll)).toEqual([240, 70]);
    moveTo(100, 100, 8); // another pointer is not the drag
    expect(view(scroll)).toEqual([240, 70]);
    fireEvent.pointerUp(window, { pointerId: 7 });
    expect(scroll).not.toHaveAttribute('data-panning');
    moveTo(0, 0);
    expect(view(scroll)).toEqual([240, 70]);
  });

  it('leaves the other buttons, and a text field, alone', () => {
    const { scroll, lane, field } = timeline();
    expect(press(lane, 0)).toBe(true);
    expect(press(lane, 2)).toBe(true);
    expect(press(field)).toBe(true);
    expect(scroll).not.toHaveAttribute('data-panning');
    moveTo(380, 215);
    expect(view(scroll)).toEqual([300, 40]);
  });

  it('Escape puts the view back and keeps the key to itself', () => {
    const { scroll, lane } = timeline();
    press(lane);
    moveTo(380, 215);
    expect(view(scroll)).toEqual([420, 25]);
    // `fireEvent` answers false: the key was taken.
    expect(fireEvent.keyDown(window, { key: 'Escape' })).toBe(false);
    expect(view(scroll)).toEqual([300, 40]);
    expect(scroll).not.toHaveAttribute('data-panning');
    moveTo(100, 100);
    expect(view(scroll)).toEqual([300, 40]);
    // Outside a pan the key is nobody's here.
    expect(fireEvent.keyDown(window, { key: 'Escape' })).toBe(true);
  });

  it('stops: a pan under way ends, and no press starts another', () => {
    const { scroll, lane } = timeline();
    press(lane);
    stop!();
    stop = null;
    expect(scroll).not.toHaveAttribute('data-panning');
    moveTo(380, 215);
    expect(view(scroll)).toEqual([300, 40]);
    expect(press(lane)).toBe(true);
    expect(scroll).not.toHaveAttribute('data-panning');
  });
});
