import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPreferences, usePreferences } from '../../preferences';
import { ScaleStepDialog } from '../ScaleStepDialog';

beforeEach(() => {
  window.localStorage.clear();
  usePreferences.setState(defaultPreferences());
});

const setValue = (value: string) =>
  fireEvent.change(screen.getByTestId('scale-step-input'), { target: { value } });

describe('ScaleStepDialog', () => {
  it('starts from the current step and saves a fraction as typed, with its value shown', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ScaleStepDialog onClose={onClose} />);
    expect(screen.getByTestId('scale-step-input')).toHaveValue('0.05');
    expect(screen.queryByTestId('scale-step-value')).not.toBeInTheDocument();
    setValue(' 1/3 ');
    expect(screen.getByTestId('scale-step-value')).toHaveTextContent('= 0.3333');
    await user.click(screen.getByTestId('scale-step-save'));
    expect(usePreferences.getState().scaleStep).toBe('1/3');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('flags what is not a step, blocks Save and leaves the preference alone', () => {
    const onClose = vi.fn();
    render(<ScaleStepDialog onClose={onClose} />);
    setValue('abc');
    expect(screen.getByTestId('scale-step-error')).toHaveTextContent(/between 0.01 and 2/);
    expect(screen.getByTestId('scale-step-save')).toBeDisabled();
    fireEvent.submit(screen.getByTestId('scale-step-input').closest('form')!);
    expect(onClose).not.toHaveBeenCalled();
    expect(usePreferences.getState().scaleStep).toBe('0.05');
    setValue('0.3/0.2');
    expect(screen.queryByTestId('scale-step-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('scale-step-value')).toHaveTextContent('= 1.5');
    // Enter saves.
    fireEvent.submit(screen.getByTestId('scale-step-input').closest('form')!);
    expect(usePreferences.getState().scaleStep).toBe('0.3/0.2');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Cancel and Escape change nothing', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ScaleStepDialog onClose={onClose} />);
    setValue('0.1');
    await user.click(screen.getByTestId('scale-step-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(usePreferences.getState().scaleStep).toBe('0.05');
    await user.keyboard('{Escape}');
    expect(usePreferences.getState().scaleStep).toBe('0.05');
  });
});
