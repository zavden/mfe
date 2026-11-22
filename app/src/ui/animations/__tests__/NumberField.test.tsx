import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import { NumberField } from '../fields';

/* The wheel on a number box (D141): with the mouse button held on the number each notch nudges
 * the value by the field's step, written as it turns, and all of it is one undo step. */

const field = () => screen.getByTestId('n') as HTMLInputElement;
const press = () => fireEvent.pointerDown(field(), { button: 0, pointerId: 1 });
const letGo = () => act(() => void window.dispatchEvent(pointer('pointerup')));
const pointer = (type: string) => {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerId: 1 });
  return event;
};
/** One notch of the wheel, up unless `down`; whether the page was kept from scrolling. */
const notch = (init: WheelEventInit & { down?: boolean } = {}): boolean => {
  const event = new WheelEvent('wheel', {
    deltaY: init.down ? 100 : -100,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => void window.dispatchEvent(event));
  return event.defaultPrevented;
};

function Harness({ onCommit, max }: { onCommit(value: number): void; max?: number }) {
  const [value, setValue] = useState(1);
  return (
    <NumberField
      label="N"
      testId="n"
      value={value}
      step={0.05}
      max={max}
      onCommit={(next) => {
        onCommit(next);
        setValue(next);
      }}
    />
  );
}

describe('the wheel on a number box', () => {
  it('nudges by the step for each notch while the button is held, up for more', () => {
    const committed = vi.fn();
    render(<Harness onCommit={committed} />);
    // Not held: the wheel is the page's.
    expect(notch()).toBe(false);
    expect(committed).not.toHaveBeenCalled();
    press();
    expect(notch()).toBe(true);
    expect(field()).toHaveValue('1.05');
    expect(field()).toHaveClass('is-scrubbing');
    notch();
    notch({ down: true });
    notch({ down: true });
    notch({ down: true });
    expect(committed.mock.calls.map(([value]) => value as number)).toEqual([
      1.05, 1.1, 1.05, 1, 0.95,
    ]);
    // Let go: the wheel is the page's again.
    letGo();
    expect(field()).not.toHaveClass('is-scrubbing');
    expect(notch()).toBe(false);
    expect(committed).toHaveBeenCalledTimes(5);
  });

  it('nudges by ten steps with Shift, by a tenth with Alt, and leaves Ctrl to the browser', () => {
    const committed = vi.fn();
    render(<Harness onCommit={committed} max={1.6} />);
    press();
    notch({ shiftKey: true });
    expect(field()).toHaveValue('1.5');
    // Some browsers report a vertical wheel with Shift held as a sideways one.
    notch({ shiftKey: true, deltaY: 0, deltaX: -100 });
    expect(field()).toHaveValue('1.6'); // the field's limit
    notch({ altKey: true, down: true });
    expect(field()).toHaveValue('1.595');
    expect(notch({ ctrlKey: true })).toBe(false);
    expect(committed).toHaveBeenCalledTimes(3);
    // At the limit a notch changes nothing, and the page still does not scroll.
    notch({ shiftKey: true });
    const before = committed.mock.calls.length;
    expect(notch({ shiftKey: true })).toBe(true);
    expect(committed).toHaveBeenCalledTimes(before);
    letGo();
  });

  it('starts from what is typed and not yet committed', () => {
    const committed = vi.fn();
    render(<Harness onCommit={committed} />);
    fireEvent.change(field(), { target: { value: '2' } });
    press();
    notch();
    expect(committed).toHaveBeenCalledWith(2.05);
    expect(field()).toHaveValue('2.05');
    letGo();
  });

  it('does nothing on a field that is off, nor with another button', () => {
    const committed = vi.fn();
    const view = render(
      <NumberField label="N" testId="n" value={1} onCommit={committed} disabled />,
    );
    press();
    expect(notch()).toBe(false);
    view.unmount();
    render(<Harness onCommit={committed} />);
    fireEvent.pointerDown(field(), { button: 2, pointerId: 1 });
    expect(notch()).toBe(false);
    expect(committed).not.toHaveBeenCalled();
  });
});

describe('the wheel on a number box of the project', () => {
  const duration = () => useProjectStore.getState().project.meta.fps;
  const steps = () => useProjectStore.temporal.getState().pastStates.length;

  function ProjectField() {
    const fps = useProjectStore((state) => state.project.meta.fps);
    return (
      <NumberField
        label="N"
        testId="n"
        value={fps}
        step={1}
        digits={0}
        onCommit={(next) =>
          useProjectStore.getState().update((draft) => {
            draft.meta.fps = next;
          })
        }
      />
    );
  }

  beforeEach(() => {
    loadProject(createEmptyProject());
    history.clear();
  });

  it('writes each notch at once, and makes one undo step of them when the button is let go', () => {
    const start = duration();
    render(<ProjectField />);
    press();
    notch();
    notch();
    notch();
    // Written as the wheel turns.
    expect(duration()).toBe(start + 3);
    letGo();
    expect(steps()).toBe(1);
    act(() => history.undo());
    expect(duration()).toBe(start);
    expect(field()).toHaveValue(String(start));
  });

  it('takes every notch back with Escape, and leaves no step', () => {
    const start = duration();
    render(<ProjectField />);
    press();
    // Before a notch, Escape is the field's own.
    const early = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => void window.dispatchEvent(early));
    expect(early.defaultPrevented).toBe(false);
    notch();
    notch({ shiftKey: true });
    expect(duration()).toBe(start + 11);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => void window.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(duration()).toBe(start);
    expect(steps()).toBe(0);
    // The hold is over: the wheel is the page's.
    expect(notch()).toBe(false);
  });

  it('keeps what the wheel did when the field goes while the button is held', () => {
    const start = duration();
    const view = render(<ProjectField />);
    press();
    notch();
    view.unmount();
    expect(duration()).toBe(start + 1);
    expect(history.isGesturing()).toBe(false);
    expect(notch()).toBe(false);
  });
});
