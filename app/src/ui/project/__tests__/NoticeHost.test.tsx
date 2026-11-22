import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoticeHost } from '../NoticeHost';
import { notify, useNoticeStore } from '../noticeStore';

beforeEach(() => {
  vi.useFakeTimers();
  useNoticeStore.getState().clear();
});
afterEach(() => vi.useRealTimers());

describe('NoticeHost', () => {
  it('is a live region before any notice arrives, so new ones are announced', () => {
    render(<NoticeHost />);
    const host = screen.getByTestId('notice-host');
    expect(host).toHaveAttribute('aria-live', 'polite');
    expect(host).toBeEmptyDOMElement();
    act(() => void notify({ kind: 'info', title: 'Saved' }));
    expect(host).toHaveTextContent('Saved');
  });

  it('does not fade a notice while the pointer is on it or it has the focus', () => {
    render(<NoticeHost />);
    act(() => void notify({ kind: 'info', title: 'Hello' }));
    const notice = screen.getByTestId('notice');
    fireEvent.mouseEnter(notice);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByTestId('notice')).toBeInTheDocument();
    fireEvent.mouseLeave(notice);
    fireEvent.focus(screen.getByTestId('notice-dismiss'));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByTestId('notice')).toBeInTheDocument();
    fireEvent.blur(screen.getByTestId('notice-dismiss'));
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.queryByTestId('notice')).not.toBeInTheDocument();
  });
});
