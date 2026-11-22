import { afterEach, describe, expect, it } from 'vitest';
import { isPinch, OWN_WHEEL, PINCH_RATE, scrollPans, startControlKey, zoomFactor } from '../pinch';

/** What Chrome sends for a pinch: a wheel with Ctrl, and −100 × ln(scale) as its deltaY. */
const pinch = (scale: number) => ({
  deltaY: -100 * Math.log(scale),
  ctrlKey: true,
  metaKey: false,
});

describe('isPinch', () => {
  it('is a wheel with Ctrl and no Control key down, on a Mac', () => {
    expect(isPinch({ ctrlKey: true, metaKey: false }, true, false)).toBe(true);
    // The Control key is held: the wheel of a mouse.
    expect(isPinch({ ctrlKey: true, metaKey: false }, true, true)).toBe(false);
    // ⌘ + wheel, and a plain wheel.
    expect(isPinch({ ctrlKey: false, metaKey: true }, true, false)).toBe(false);
    expect(isPinch({ ctrlKey: true, metaKey: true }, true, false)).toBe(false);
    expect(isPinch({ ctrlKey: false, metaKey: false }, true, false)).toBe(false);
  });

  it('is never one elsewhere: Ctrl + wheel is the zoom there', () => {
    expect(isPinch({ ctrlKey: true, metaKey: false }, false, false)).toBe(false);
    expect(isPinch({ ctrlKey: true, metaKey: false }, false, true)).toBe(false);
  });
});

describe('zoomFactor', () => {
  it('is the scale of the gesture for a pinch: fingers twice as far apart, twice as large', () => {
    expect(PINCH_RATE).toBe(0.01);
    expect(zoomFactor(pinch(2), 0.002, true, false)).toBeCloseTo(2, 10);
    expect(zoomFactor(pinch(0.5), 0.002, true, false)).toBeCloseTo(0.5, 10);
    // In the steps it comes in, the factors multiply to the whole gesture.
    const steps = [1.1, 1.2, 1.25, 1.3].map((scale) =>
      zoomFactor(pinch(scale), 0.002, true, false),
    );
    expect(steps.reduce((a, b) => a * b)).toBeCloseTo(1.1 * 1.2 * 1.25 * 1.3, 10);
  });

  it('is the view’s own rate for a wheel: with ⌘, with the Control key down, and elsewhere', () => {
    const notch = { deltaY: -100, ctrlKey: false, metaKey: true };
    expect(zoomFactor(notch, 0.002, true, false)).toBeCloseTo(Math.exp(0.2), 10);
    expect(zoomFactor({ ...pinch(2) }, 0.002, true, true)).toBeCloseTo(
      Math.exp(0.002 * 100 * Math.LN2),
      10,
    );
    expect(zoomFactor({ ...pinch(2) }, 0.0015, false, false)).toBeCloseTo(
      Math.exp(0.0015 * 100 * Math.LN2),
      10,
    );
  });
});

describe('scrollPans: a wheel alone moves the view on a Mac', () => {
  const plain = { ctrlKey: false, metaKey: false };

  it('is a wheel with neither Ctrl nor ⌘, which zoom', () => {
    expect(scrollPans(plain, false, true)).toBe(true);
    expect(scrollPans({ ctrlKey: true, metaKey: false }, false, true)).toBe(false);
    expect(scrollPans({ ctrlKey: false, metaKey: true }, false, true)).toBe(false);
  });

  it('is not one over what has a wheel of its own, nor on another system', () => {
    expect(scrollPans(plain, true, true)).toBe(false);
    expect(scrollPans(plain, false, false)).toBe(false);
  });

  it('knows a menu, a list and a field for what has a wheel of its own', () => {
    document.body.innerHTML =
      '<div id="frame"><canvas></canvas><div role="menu"><button id="item"></button></div>' +
      '<input id="field" /><div id="bar"><button id="tool"></button></div></div>';
    const own = (id: string) => document.getElementById(id)!.closest(OWN_WHEEL) !== null;
    expect(own('item')).toBe(true);
    expect(own('field')).toBe(true);
    expect(own('tool')).toBe(false);
    expect(document.querySelector('canvas')!.closest(OWN_WHEEL)).toBeNull();
    document.body.innerHTML = '';
  });
});

describe('startControlKey: the Control key, as the keys the window sees say', () => {
  let stop: (() => void) | null = null;
  afterEach(() => {
    stop?.();
    stop = null;
  });
  const key = (type: 'keydown' | 'keyup', name: string, ctrlKey: boolean) =>
    window.dispatchEvent(new KeyboardEvent(type, { key: name, ctrlKey, bubbles: true }));
  /** Whether a wheel with Ctrl is taken for a pinch on a Mac now. */
  const pinches = () => isPinch({ ctrlKey: true, metaKey: false }, true);

  it('is up until the key goes down, and up again when it is let go', () => {
    stop = startControlKey();
    expect(pinches()).toBe(true);
    key('keydown', 'Control', true);
    expect(pinches()).toBe(false);
    // Another key pressed with it held says so too.
    key('keydown', 'a', true);
    expect(pinches()).toBe(false);
    key('keyup', 'Control', false);
    expect(pinches()).toBe(true);
  });

  it('is up once the window loses the focus, which hears no key let go', () => {
    stop = startControlKey();
    key('keydown', 'Control', true);
    window.dispatchEvent(new Event('blur'));
    expect(pinches()).toBe(true);
  });

  it('hears nothing once stopped, and is up', () => {
    stop = startControlKey();
    key('keydown', 'Control', true);
    stop();
    stop = null;
    expect(pinches()).toBe(true);
    key('keydown', 'Control', true);
    expect(pinches()).toBe(true);
  });
});
