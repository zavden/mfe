import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressHost } from '../ProgressHost';
import { useProgressStore, type ProjectTask } from '../progressStore';

const MB = 1024 ** 2;

function task(fields: Partial<ProjectTask> = {}): ProjectTask {
  return {
    key: 1,
    title: 'Opening lecture.mfe',
    message: 'Its recordings are checked and copied into the browser’s storage.',
    done: 0,
    total: 0,
    shown: true,
    cancelling: false,
    cancel: vi.fn(),
    ...fields,
  };
}

function show(fields: Partial<ProjectTask> = {}) {
  const shown = task(fields);
  act(() => useProgressStore.setState({ tasks: [shown] }));
  return shown.cancel;
}

afterEach(() => act(() => useProgressStore.setState({ tasks: [] })));

describe('the dialog of a task that takes long', () => {
  it('is not there without a task, nor before the task has lasted', () => {
    render(<ProgressHost />);
    expect(screen.queryByTestId('progress-dialog')).toBeNull();
    show({ shown: false });
    expect(screen.queryByTestId('progress-dialog')).toBeNull();
  });

  it('says what is being done and how far it is', () => {
    render(<ProgressHost />);
    show();
    expect(screen.getByRole('dialog', { name: 'Opening lecture.mfe' })).toBeInTheDocument();
    expect(screen.getByTestId('progress-dialog')).toHaveTextContent('Its recordings are checked');
    // Nothing reported yet: a bar without a value, which the browser animates.
    expect(screen.getByTestId('progress-bar')).not.toHaveAttribute('value');
    expect(screen.getByTestId('progress-amount')).toHaveTextContent('Starting…');
    show({ done: 126 * MB, total: 280 * MB });
    expect(screen.getByTestId('progress-bar')).toHaveAttribute('value', '0.45');
    expect(screen.getByTestId('progress-amount')).toHaveTextContent('45% · 126 of 280 MB');
    show({ done: 1.5 * MB, total: 12.25 * MB });
    expect(screen.getByTestId('progress-amount')).toHaveTextContent('12% · 1.5 of 12.3 MB');
  });

  it('cancels from its button, from × and with Escape', async () => {
    const user = userEvent.setup();
    render(<ProgressHost />);
    const cancel = show({ done: 1, total: 2 });
    await user.click(screen.getByTestId('progress-cancel'));
    await user.click(screen.getByTestId('progress-dialog-close'));
    await user.keyboard('{Escape}');
    expect(cancel).toHaveBeenCalledTimes(3);
  });

  it('shows the earliest task that has lasted, and the next one when it is over', () => {
    render(<ProgressHost />);
    const quick = task({ key: 1, title: 'Opening quick.mfe', shown: false });
    const slow = task({ key: 2, title: 'Opening slow.mfe' });
    const later = task({ key: 3, title: 'Opening later.mfe' });
    act(() => useProgressStore.setState({ tasks: [quick, slow, later] }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Opening slow.mfe' })).toBeInTheDocument();
    act(() => useProgressStore.setState({ tasks: [quick, later] }));
    expect(screen.getByRole('dialog', { name: 'Opening later.mfe' })).toBeInTheDocument();
  });

  it('says that it is cancelling until the work has stopped', () => {
    render(<ProgressHost />);
    show({ done: 1, total: 2, cancelling: true });
    expect(screen.getByTestId('progress-cancel')).toBeDisabled();
    expect(screen.getByTestId('progress-cancel')).toHaveTextContent('Cancelling…');
  });
});
