import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoldButton } from '../HoldButton';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const onActivate = vi.fn();
  render(
    <HoldButton holdMs={700} onActivate={onActivate} testId="hold">
      Hold to delete
    </HoldButton>,
  );
  return { onActivate, button: screen.getByTestId('hold') };
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('HoldButton', () => {
  it('acts only once it has been held for holdMs', () => {
    const { onActivate, button } = setup();
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    expect(button).toHaveAttribute('data-holding', 'true');
    advance(699);
    expect(onActivate).not.toHaveBeenCalled();
    advance(1);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('data-holding', 'false');
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('does nothing when released early or merely clicked', () => {
    const { onActivate, button } = setup();
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    advance(400);
    fireEvent.pointerUp(button, { pointerId: 1 });
    advance(1000);
    fireEvent.click(button);
    advance(1000);
    // A secondary button does not start a hold either.
    fireEvent.pointerDown(button, { button: 2, pointerId: 1 });
    advance(1000);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('acts on a click with no press before it (a screen reader or voice control)', () => {
    const { onActivate, button } = setup();
    expect(button).toHaveAccessibleDescription(/hold/i);
    fireEvent.click(button, { detail: 0 }); // what assistive technology sends
    expect(onActivate).toHaveBeenCalledTimes(1);
    // A mouse click is a press and a click: still nothing.
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(button, { pointerId: 1 });
    fireEvent.click(button, { detail: 1 });
    advance(1000);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('can be held from the keyboard with Space or Enter', () => {
    const { onActivate, button } = setup();
    fireEvent.keyDown(button, { key: 'Enter' });
    advance(300);
    fireEvent.keyUp(button, { key: 'Enter' });
    advance(1000);
    expect(onActivate).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    advance(700);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
