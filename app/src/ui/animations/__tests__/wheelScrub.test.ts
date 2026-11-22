import { describe, expect, it } from 'vitest';
import { scrubbedValue, scrubFactor, WHEEL_NOTCH, wheelSteps, wheelTravel } from '../wheelScrub';

/* What a turn of the wheel means for a number box (D141): how far an event went, the steps it
 * makes, and the value they nudge to. */

describe('how far a wheel event went', () => {
  it('reads its vertical travel in pixels, lines and pages', () => {
    expect(wheelTravel({ deltaX: 0, deltaY: -120, deltaMode: 0 })).toBe(-120);
    expect(wheelTravel({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(120);
    expect(wheelTravel({ deltaX: 0, deltaY: -1, deltaMode: 2 })).toBe(-800);
  });

  it('takes the sideways travel a browser reports for a vertical wheel with Shift held', () => {
    expect(wheelTravel({ deltaX: -100, deltaY: 0, deltaMode: 0 })).toBe(-100);
    expect(wheelTravel({ deltaX: 7, deltaY: -100, deltaMode: 0 })).toBe(-100);
  });
});

describe('the steps a wheel event makes', () => {
  it('is one for a notch of a mouse wheel, up for more, however far it says it went', () => {
    expect(wheelSteps(-100, 0)).toEqual({ steps: 1, carry: 0 });
    expect(wheelSteps(-480, 0)).toEqual({ steps: 1, carry: 0 });
    expect(wheelSteps(120, 0)).toEqual({ steps: -1, carry: 0 });
    expect(wheelSteps(-WHEEL_NOTCH, 13)).toEqual({ steps: 1, carry: 0 });
    expect(wheelSteps(0, 13)).toEqual({ steps: 0, carry: 13 });
  });

  it('adds the small travels of a trackpad up to a notch, and starts over when they turn', () => {
    let carry = 0;
    const made: number[] = [];
    for (const travel of [-12, -12, -12, -12, -12, -12, -12]) {
      const turned = wheelSteps(travel, carry);
      carry = turned.carry;
      made.push(turned.steps);
    }
    // 84 px up: two notches of 40, and 4 px carried.
    expect(made).toEqual([0, 0, 0, 1, 0, 0, 1]);
    expect(carry).toBe(-4);
    // Back down: what was carried up does not count against it.
    expect(wheelSteps(30, -36)).toEqual({ steps: 0, carry: 30 });
    expect(wheelSteps(15, 30)).toEqual({ steps: -1, carry: 5 });
  });
});

describe('the value a nudge makes', () => {
  const field = { step: 0.05, digits: 3, min: -Infinity, max: Infinity };

  it('is the field’s step from where it was, ten with Shift and a tenth with Alt', () => {
    expect(scrubFactor({ shiftKey: false, altKey: false })).toBe(1);
    expect(scrubFactor({ shiftKey: true, altKey: false })).toBe(10);
    expect(scrubFactor({ shiftKey: false, altKey: true })).toBe(0.1);
    expect(scrubFactor({ shiftKey: true, altKey: true })).toBe(10);
    expect(scrubbedValue(1, 1, field)).toBe(1.05);
    expect(scrubbedValue(1, -1, field)).toBe(0.95);
    expect(scrubbedValue(1, 1, field, 10)).toBe(1.5);
    expect(scrubbedValue(1, -1, field, 0.1)).toBe(0.995);
    // No dust from the sums.
    expect(scrubbedValue(0.1, 1, { ...field, step: 0.2 })).toBe(0.3);
  });

  it('stays within the field’s limits, and is never finer than the field shows', () => {
    expect(scrubbedValue(0.98, 1, { ...field, max: 1 })).toBe(1);
    expect(scrubbedValue(0.02, -1, { ...field, min: 0 })).toBe(0);
    // Two decimals shown: a tenth of 0.05 would not be seen, so the nudge is 0.01.
    expect(scrubbedValue(1, 1, { ...field, digits: 2 }, 0.1)).toBe(1.01);
    // A whole number: Alt nudges by one, not by a tenth.
    expect(scrubbedValue(3, 1, { step: 1, digits: 0, min: 1, max: 9 }, 0.1)).toBe(4);
  });
});
