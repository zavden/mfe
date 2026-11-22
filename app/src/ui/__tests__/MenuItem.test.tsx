import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenuItem } from '../ContextMenu';

describe('MenuItem', () => {
  it('is a menu item that runs its action', async () => {
    const onClick = vi.fn();
    render(
      <MenuItem testId="dup" onClick={onClick}>
        Duplicate
      </MenuItem>,
    );
    const item = screen.getByRole('menuitem', { name: 'Duplicate' });
    expect(item).toHaveAttribute('data-testid', 'dup');
    expect(item).not.toHaveAttribute('aria-checked');
    expect(item).toHaveClass('ctx-item');
    expect(item).not.toHaveClass('is-current', 'is-danger');
    await userEvent.click(item);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is a ticked radio choice when it says whether it is current', () => {
    render(
      <>
        <MenuItem current onClick={() => {}}>
          Fade in
        </MenuItem>
        <MenuItem current={false} onClick={() => {}}>
          Write
        </MenuItem>
      </>,
    );
    const on = screen.getByRole('menuitemradio', { name: 'Fade in' });
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(on).toHaveClass('is-current');
    const off = screen.getByRole('menuitemradio', { name: 'Write' });
    expect(off).toHaveAttribute('aria-checked', 'false');
    expect(off).not.toHaveClass('is-current');
  });

  it('is a toggle led by its box, ticked while it is on', async () => {
    const onClick = vi.fn();
    render(
      <>
        <MenuItem testId="skip" checked onClick={onClick}>
          Skip the wait after it
        </MenuItem>
        <MenuItem testId="keep" checked={false} onClick={() => {}}>
          Loop
        </MenuItem>
      </>,
    );
    const on = screen.getByRole('menuitemcheckbox', { name: 'Skip the wait after it' });
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(on).toHaveClass('ctx-item', 'has-icon');
    expect(on).not.toHaveClass('is-current');
    expect(on.querySelector('.ctx-icon .ctx-checkbox')).toHaveClass('is-on');
    expect(on.querySelector('.ctx-icon')).toHaveAttribute('aria-hidden', 'true');
    const off = screen.getByRole('menuitemcheckbox', { name: 'Loop' });
    expect(off).toHaveAttribute('aria-checked', 'false');
    expect(off.querySelector('.ctx-checkbox')).not.toHaveClass('is-on');
    await userEvent.click(on);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('can be disabled and marked as a deletion', () => {
    render(
      <MenuItem danger disabled onClick={() => {}}>
        Delete…
      </MenuItem>,
    );
    const item = screen.getByRole('menuitem', { name: 'Delete…' });
    expect(item).toBeDisabled();
    expect(item).toHaveClass('is-danger');
    expect(item).not.toHaveAttribute('title');
  });

  it('says in its tooltip why it is off, which its text still names', () => {
    render(
      <MenuItem disabled title="Nothing to unlink it from." onClick={() => {}}>
        Unlink formula
      </MenuItem>,
    );
    const item = screen.getByRole('menuitem', { name: 'Unlink formula' });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('title', 'Nothing to unlink it from.');
    expect(item).toHaveAccessibleDescription('Nothing to unlink it from.');
  });

  it('shows an icon before its text when it has one; without it the markup stays', () => {
    render(
      <>
        <MenuItem testId="left" icon={<svg data-testid="glyph" />} onClick={() => {}}>
          Align left
        </MenuItem>
        <MenuItem testId="plain" onClick={() => {}}>
          Duplicate
        </MenuItem>
      </>,
    );
    const item = screen.getByTestId('left');
    expect(item).toHaveClass('ctx-item', 'has-icon');
    const icon = item.firstElementChild!;
    expect(icon).toHaveClass('ctx-icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toContainElement(screen.getByTestId('glyph'));
    // The text alone names the item.
    expect(screen.getByRole('menuitem', { name: 'Align left' })).toBe(item);
    const plain = screen.getByTestId('plain');
    expect(plain).not.toHaveClass('has-icon');
    expect(plain.innerHTML).toBe('Duplicate');
  });
});
