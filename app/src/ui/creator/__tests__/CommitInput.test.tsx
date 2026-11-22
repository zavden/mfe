import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CommitInput } from '../CommitInput';

/** A name that is kept trimmed, as the Audio tab keeps the name of a recording. */
function NameField({ onCommit }: { onCommit: (name: string) => void }) {
  const [name, setName] = useState('Narration');
  return (
    <CommitInput
      label="Name"
      testId="name"
      value={name}
      normalize={(text) => text.trim()}
      validate={(text) => (text.trim() ? null : 'A name is needed.')}
      onCommit={(next) => {
        onCommit(next);
        setName(next);
      }}
    />
  );
}

describe('CommitInput with a normal form', () => {
  it('commits the normal form of what was typed, and shows it', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NameField onCommit={onCommit} />);
    const field = screen.getByTestId('name');
    await user.clear(field);
    await user.type(field, '  Interview  {Enter}');
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('Interview');
    expect(field).toHaveValue('Interview');
  });

  it('takes text that is the same in its normal form as no edit: the field shows the value', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NameField onCommit={onCommit} />);
    const field = screen.getByTestId('name');
    await user.type(field, '   {Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    // Not "Narration   ", which is in no model, with Escape still held by the field.
    expect(field).toHaveValue('Narration');
    expect(field).not.toHaveAttribute('data-own-escape');
    await user.type(field, ' ');
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(field).toHaveValue('Narration');
  });

  it('still refuses what does not validate, and puts the value back on leaving', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<NameField onCommit={onCommit} />);
    const field = screen.getByTestId('name');
    await user.clear(field);
    await user.type(field, '   ');
    expect(screen.getByTestId('name-error')).toHaveTextContent('A name is needed.');
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(field).toHaveValue('Narration');
  });
});
