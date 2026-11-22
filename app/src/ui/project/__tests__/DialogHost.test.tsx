import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogHost } from '../DialogHost';
import { confirmDialog, promptDialog, useDialogStore } from '../dialogStore';

beforeEach(() => useDialogStore.setState({ queue: [] }));

/** Open a dialog and render it; the promise is the caller's answer. */
function ask<T>(open: () => Promise<T>): Promise<T> {
  let answer!: Promise<T>;
  act(() => {
    answer = open();
  });
  return answer;
}

const field = () => screen.getByTestId('dialog-field') as HTMLInputElement;
const taken = (text: string) =>
  !text ? 'A name is needed.' : text === 'voice' ? 'Another one has this name.' : null;

describe('a dialog that asks for a line of text', () => {
  it('opens on its field with the text selected, and gives what is typed, trimmed', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    const answer = ask(() =>
      promptDialog({
        title: 'Name in use',
        message: 'Choose another name.',
        label: 'Name',
        value: 'voice 2',
        validate: taken,
        confirmLabel: 'Import',
      }),
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Name in use');
    expect(screen.getByLabelText('Name')).toBe(field());
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue('voice 2');
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 7]);
    expect(screen.getByTestId('dialog-confirm')).toHaveTextContent('Import');
    await user.keyboard('  narration ');
    expect(field()).toHaveValue('  narration ');
    await user.click(screen.getByTestId('dialog-confirm'));
    expect(await answer).toBe('narration');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits for a text that can be given: the reason shows, the button and Enter do nothing', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    let settled = false;
    const answer = ask(() =>
      promptDialog({ title: 'Name in use', label: 'Name', value: 'voice 2', validate: taken }),
    );
    void answer.then(() => (settled = true));
    expect(screen.queryByTestId('dialog-field-error')).not.toBeInTheDocument();
    fireEvent.change(field(), { target: { value: ' voice ' } });
    expect(screen.getByTestId('dialog-field-error')).toHaveTextContent(
      'Another one has this name.',
    );
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('dialog-confirm')).toBeDisabled();
    await user.type(field(), '{Enter}');
    fireEvent.change(field(), { target: { value: '   ' } });
    expect(screen.getByTestId('dialog-field-error')).toHaveTextContent('A name is needed.');
    await user.type(field(), '{Enter}');
    expect(settled).toBe(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Enter gives a text that passes.
    fireEvent.change(field(), { target: { value: 'voice (take 2)' } });
    expect(screen.queryByTestId('dialog-field-error')).not.toBeInTheDocument();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(await answer).toBe('voice (take 2)');
  });

  it('gives nothing when it is cancelled, with the button or with Escape', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    const cancelled = ask(() => promptDialog({ title: 'Name', label: 'Name', value: 'a' }));
    await user.click(screen.getByTestId('dialog-cancel'));
    expect(await cancelled).toBeNull();
    const escaped = ask(() =>
      promptDialog({ title: 'Name', label: 'Name', value: '', validate: taken }),
    );
    // Dismissing does not wait for a valid text.
    await user.keyboard('{Escape}');
    expect(await escaped).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('a dialog that asks for several lines', () => {
  /** The line under a field of several lines, on the system `platform` names. */
  const hintOn = (platform: string): string => {
    const dressed = vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    try {
      const { unmount } = render(<DialogHost />);
      void ask(() =>
        promptDialog({ title: 'Comment', label: 'Comment', value: '', multiline: true }),
      );
      const text = screen.getByTestId('dialog-field-hint').textContent ?? '';
      act(() => useDialogStore.setState({ queue: [] }));
      unmount();
      return text;
    } finally {
      dressed.mockRestore();
    }
  };

  it('names the key that gives the text as the system writes it', () => {
    // The command key alone, as a menu writes it: not "Ctrl/⌘", which is how a text for every
    // system names it.
    expect(hintOn('Linux x86_64')).toBe('Ctrl+Enter gives the text; Enter starts a new line.');
    expect(hintOn('Win32')).toBe('Ctrl+Enter gives the text; Enter starts a new line.');
    expect(hintOn('MacIntel')).toBe('⌘↩ gives the text; ↩ starts a new line.');
  });

  const ctrl = navigator.platform.toLowerCase().includes('mac') ? 'Meta' : 'Control';

  it('opens on a field of several lines: Enter starts a new one, Ctrl/⌘+Enter gives the text', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    const answer = ask(() =>
      promptDialog({
        title: 'Comment at 1.50 s',
        label: 'Comment',
        value: '',
        multiline: true,
        maxLength: 40,
        confirmLabel: 'Save',
      }),
    );
    const area = field() as unknown as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveFocus();
    expect(area).toHaveAttribute('maxlength', '40');
    expect(screen.getByLabelText('Comment')).toBe(area);
    // Which key gives the text is said under it, and the field is described by that line.
    const hint = screen.getByTestId('dialog-field-hint');
    expect(hint).toHaveTextContent(/Enter gives the text; Enter starts a new line\.$/);
    expect(area.getAttribute('aria-describedby')).toBe(hint.parentElement!.id);
    await user.keyboard('  Flash the sign{Enter}then zoom  ');
    expect(area).toHaveValue('  Flash the sign\nthen zoom  ');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard(`{${ctrl}>}{Enter}{/${ctrl}}`);
    expect(await answer).toBe('Flash the sign\nthen zoom');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits for a text that can be given, and Escape dismisses it', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    let settled = false;
    const answer = ask(() =>
      promptDialog({
        title: 'Comment',
        label: 'Comment',
        value: '',
        multiline: true,
        validate: (text) => (text ? null : 'A comment needs words.'),
      }),
    );
    void answer.then(() => (settled = true));
    // Empty, the reason is where the hint was; the button and Ctrl/⌘+Enter do nothing.
    expect(screen.getByTestId('dialog-field-error')).toHaveTextContent('A comment needs words.');
    expect(screen.queryByTestId('dialog-field-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('dialog-confirm')).toBeDisabled();
    await user.keyboard(`{${ctrl}>}{Enter}{/${ctrl}}`);
    await user.keyboard('{Enter}{Enter}');
    expect(settled).toBe(false);
    await user.keyboard('{Escape}');
    expect(await answer).toBeNull();
  });

  it('keeps a field of one line as it was: Enter gives its text', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    const answer = ask(() => promptDialog({ title: 'Name', label: 'Name', value: '' }));
    expect(field().tagName).toBe('INPUT');
    expect(screen.queryByTestId('dialog-field-hint')).not.toBeInTheDocument();
    await user.keyboard('a{Enter}');
    expect(await answer).toBe('a');
  });
});

describe('a dialog without a field', () => {
  it('answers with its buttons as before', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    const yes = ask(() => confirmDialog({ title: 'Sure?', confirmLabel: 'Yes' }));
    expect(screen.queryByTestId('dialog-field')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('dialog-confirm'));
    expect(await yes).toBe(true);
    const no = ask(() => confirmDialog({ title: 'Sure?' }));
    await user.keyboard('{Escape}');
    expect(await no).toBe(false);
  });
});
