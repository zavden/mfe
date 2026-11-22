/* The wheel on a number box (D141): with the mouse button held on the number, each notch of the
 * wheel nudges the value by the field's step — up for more, down for less —, by ten steps with
 * Shift held and by a tenth with Alt. What a wheel event means is worked out here; `NumberField`
 * (fields.tsx) holds the gesture. */

/** The travel, in CSS px, from which one event of the wheel is a whole notch: a mouse wheel
 * reports a hundred or so for each (three lines, or more with the system's acceleration), a
 * trackpad a few at a time. */
export const WHEEL_NOTCH = 40;

const LINE_PX = 40;
const PAGE_PX = 800;

/** How far a wheel event went along its axis, in CSS px: negative away from the user (up). With
 * Shift held some browsers turn a vertical wheel sideways and report it as `deltaX`; lines and
 * pages (`deltaMode`) are taken for what a browser scrolls for them. */
export function wheelTravel(event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>): number {
  const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
  if (event.deltaMode === 1) return delta * LINE_PX;
  if (event.deltaMode === 2) return delta * PAGE_PX;
  return delta;
}

/** The steps a wheel event makes — 1 up, −1 down, 0 none yet — and what is carried to the next
 * event (`carry`, what earlier small travels left). A whole notch is one step however far the
 * browser says it went, and forgets what was carried; smaller travels add up, and make a step
 * each time they reach a notch. */
export function wheelSteps(travel: number, carry: number): { steps: -1 | 0 | 1; carry: number } {
  if (travel === 0) return { steps: 0, carry };
  if (Math.abs(travel) >= WHEEL_NOTCH) return { steps: travel < 0 ? 1 : -1, carry: 0 };
  // A turn the other way starts from nothing.
  const sum = Math.sign(carry) === -Math.sign(travel) ? travel : carry + travel;
  if (Math.abs(sum) < WHEEL_NOTCH) return { steps: 0, carry: sum };
  return { steps: sum < 0 ? 1 : -1, carry: sum - Math.sign(sum) * WHEEL_NOTCH };
}

/** How many of its steps a nudge is: ten with Shift held — as the arrow keys of the field —, a
 * tenth with Alt. */
export const scrubFactor = (event: { shiftKey: boolean; altKey: boolean }): number =>
  event.shiftKey ? 10 : event.altKey ? 0.1 : 1;

/** The value `steps` nudges from `base` make in a field of `step` that shows `digits` decimals,
 * kept within [min, max]. A nudge is never finer than the field can show. */
export function scrubbedValue(
  base: number,
  steps: number,
  field: { step: number; digits: number; min: number; max: number },
  factor = 1,
): number {
  const unit = Math.max(field.step * factor, 10 ** -field.digits);
  const next = +(base + steps * unit).toFixed(6);
  return Math.min(field.max, Math.max(field.min, next));
}
