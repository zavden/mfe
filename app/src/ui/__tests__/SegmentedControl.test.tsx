import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from '../SegmentedControl';

function Harness() {
  const [value, setValue] = useState<'out' | 'in'>('out');
  return (
    <SegmentedControl<'out' | 'in'>
      label="Direction"
      testId="dir"
      value={value}
      onChange={setValue}
      options={[
        { value: 'out', label: 'a → b', title: 'a → b' },
        { value: 'in', label: 'b → a', title: 'b → a' },
      ]}
    />
  );
}

describe('SegmentedControl', () => {
  it('is a labelled radio group with one option checked', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Direction' });
    expect(group).toHaveAttribute('data-value', 'out');
    expect(screen.getByRole('radio', { name: 'a → b' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'b → a' })).toHaveAttribute('aria-checked', 'false');
    // One tab stop: the checked option.
    expect(screen.getByTestId('dir-out')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('dir-in')).toHaveAttribute('tabindex', '-1');
  });

  it('switches on click and with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('dir-in'));
    expect(screen.getByTestId('dir')).toHaveAttribute('data-value', 'in');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('dir')).toHaveAttribute('data-value', 'out');
    expect(screen.getByTestId('dir-out')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('dir')).toHaveAttribute('data-value', 'in');
    await user.keyboard('{ArrowRight}'); // wraps around
    expect(screen.getByTestId('dir')).toHaveAttribute('data-value', 'out');
  });
});
