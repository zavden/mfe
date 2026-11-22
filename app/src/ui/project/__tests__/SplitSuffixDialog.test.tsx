import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences, PREFERENCES_STORAGE_KEY, usePreferences } from '../../preferences';
import { SplitSuffixDialog } from '../SplitSuffixDialog';

beforeEach(() => {
  window.localStorage.clear();
  usePreferences.setState(defaultPreferences());
});

const input = () => screen.getByTestId('split-suffix-input');
const setValue = (value: string) => fireEvent.change(input(), { target: { value } });

describe('SplitSuffixDialog', () => {
  it('starts from the current suffix, shows the name it gives and saves another', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SplitSuffixDialog onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Split suffix' })).toBeInTheDocument();
    expect(input()).toHaveValue('_s');
    expect(input()).toHaveFocus();
    expect(screen.getByTestId('split-suffix-example')).toHaveTextContent('f1 → f1_s');
    expect(screen.queryByTestId('split-suffix-error')).not.toBeInTheDocument();
    await user.clear(input());
    await user.type(input(), '_part');
    expect(screen.getByTestId('split-suffix-example')).toHaveTextContent('f1 → f1_part');
    await user.click(screen.getByTestId('split-suffix-save'));
    expect(usePreferences.getState().splitSuffix).toBe('_part');
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toMatchObject({
      splitSuffix: '_part',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('flags what is not a suffix, blocks Save and Enter, and leaves the preference alone', () => {
    const onClose = vi.fn();
    render(<SplitSuffixDialog onClose={onClose} />);
    setValue('');
    expect(screen.getByRole('alert')).toHaveTextContent('The suffix cannot be empty.');
    expect(screen.queryByTestId('split-suffix-example')).not.toBeInTheDocument();
    expect(screen.getByTestId('split-suffix-save')).toBeDisabled();
    setValue('-copy');
    expect(screen.getByTestId('split-suffix-error')).toHaveTextContent(/at most 16 characters/);
    expect(screen.getByTestId('split-suffix-error')).toHaveTextContent(/a digit or "_"/);
    expect(screen.getByTestId('split-suffix-save')).toBeDisabled();
    fireEvent.submit(input().closest('form')!);
    expect(onClose).not.toHaveBeenCalled();
    setValue('a'.repeat(17));
    expect(screen.getByTestId('split-suffix-error')).toBeInTheDocument();
    setValue(' _s');
    expect(screen.getByTestId('split-suffix-error')).toBeInTheDocument();
    expect(usePreferences.getState().splitSuffix).toBe('_s');
    // Valid again: the error goes, and Enter saves.
    setValue('_2');
    expect(screen.queryByTestId('split-suffix-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('split-suffix-save')).toBeEnabled();
    fireEvent.submit(input().closest('form')!);
    expect(usePreferences.getState().splitSuffix).toBe('_2');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Cancel and Escape change nothing', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SplitSuffixDialog onClose={onClose} />);
    setValue('_x');
    await user.click(screen.getByTestId('split-suffix-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(usePreferences.getState().splitSuffix).toBe('_s');
    await user.keyboard('{Escape}');
    expect(usePreferences.getState().splitSuffix).toBe('_s');
  });
});
