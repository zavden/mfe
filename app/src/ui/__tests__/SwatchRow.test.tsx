import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MANIM_COLORS } from '../project/colors';
import { SwatchRow } from '../project/SwatchRow';

describe('SwatchRow', () => {
  it('offers every Manim colour as a named button, then the extras, and reports a pick', async () => {
    const onPick = vi.fn();
    render(
      <SwatchRow label="Glyph colour" testIdPrefix="palette" onPick={onPick}>
        <span data-testid="extra" />
      </SwatchRow>,
    );
    const group = screen.getByRole('group', { name: 'Glyph colour' });
    expect(group.querySelectorAll('.palette-swatch')).toHaveLength(MANIM_COLORS.length);
    expect(group.lastElementChild).toHaveAttribute('data-testid', 'extra');
    const yellow = screen.getByRole('button', { name: 'Colour YELLOW' });
    expect(yellow).toHaveAttribute('data-testid', 'palette-YELLOW');
    expect(yellow).toBeEnabled();
    await userEvent.click(yellow);
    expect(onPick).toHaveBeenCalledWith('#FFFF00');
  });

  it('disables every swatch when there is nothing to colour', () => {
    render(<SwatchRow label="Glyph colour" testIdPrefix="p" disabled onPick={() => {}} />);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
});
