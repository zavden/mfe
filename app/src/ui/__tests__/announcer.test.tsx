import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { announce, useAnnouncer } from '../announcer';
import { Announcer } from '../Announcer.tsx';

describe('Announcer', () => {
  it('is a polite live region whose text changes on every announcement, even a repeated one', () => {
    useAnnouncer.setState({ text: '', serial: 0 });
    render(<Announcer />);
    const region = screen.getByTestId('announcer');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('role', 'status');
    expect(region.textContent).toBe('');
    act(() => announce('Clip deleted'));
    const first = region.textContent;
    expect(first).toContain('Clip deleted');
    act(() => announce('Clip deleted'));
    expect(region.textContent).toContain('Clip deleted');
    expect(region.textContent).not.toBe(first);
  });
});
