// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHoverTip, HOVER_TIP_DELAY_MS } from '../hoverTip';

describe('createHoverTip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows after the pointer has rested, where it rested', () => {
    const onShow = vi.fn();
    const onHide = vi.fn();
    const tip = createHoverTip<string>({ onShow, onHide });
    tip.move('a', 10, 20);
    vi.advanceTimersByTime(HOVER_TIP_DELAY_MS - 1);
    expect(onShow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onShow).toHaveBeenCalledWith('a', 10, 20);
    expect(onHide).not.toHaveBeenCalled();
  });

  it('hides on the next move, then shows again after another rest', () => {
    const onShow = vi.fn();
    const onHide = vi.fn();
    const tip = createHoverTip<string>({ onShow, onHide });
    tip.move('a', 10, 20);
    vi.advanceTimersByTime(HOVER_TIP_DELAY_MS);
    tip.move('a', 12, 20);
    expect(onHide).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HOVER_TIP_DELAY_MS);
    expect(onShow).toHaveBeenLastCalledWith('a', 12, 20);
    // Over nothing: hidden, and nothing comes.
    tip.move(null, 0, 0);
    expect(onHide).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(HOVER_TIP_DELAY_MS * 2);
    expect(onShow).toHaveBeenCalledTimes(2);
  });

  it('restarts the wait on every move, and cancels on request', () => {
    const onShow = vi.fn();
    const onHide = vi.fn();
    const tip = createHoverTip<string>({ onShow, onHide, delayMs: 100 });
    tip.move('b', 1, 1);
    vi.advanceTimersByTime(60);
    tip.move('b', 2, 2);
    vi.advanceTimersByTime(60);
    expect(onShow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(onShow).toHaveBeenCalledWith('b', 2, 2);
    tip.cancel();
    expect(onHide).toHaveBeenCalledTimes(1);
    tip.move('b', 3, 3);
    tip.cancel(); // before it showed: nothing to hide, nothing to come
    vi.advanceTimersByTime(200);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
