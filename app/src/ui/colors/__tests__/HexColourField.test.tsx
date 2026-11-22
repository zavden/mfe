/* The Hex field of a context menu's colours (HexColourField.tsx, D130): what it takes, how it
 * is applied, and how it lives among the menu's keys. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenu, MenuItem, Submenu } from '../../ContextMenu';
import { ColourSwatches } from '../ColourSwatches';

/** A menu whose «Colour ›» submenu has the swatches and the Hex field, then an item. */
function setup() {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <ContextMenu x={100} y={100} label="Glyphs" testId="menu" onClose={onClose}>
      <Submenu label="Colour" testId="menu-color">
        <ColourSwatches testIdPrefix="menu-color" onPick={onPick} />
        <MenuItem testId="menu-clear" onClick={() => {}}>
          Clear colour
        </MenuItem>
      </Submenu>
    </ContextMenu>,
  );
  return { onPick, onClose, user };
}
const field = () => screen.getByTestId<HTMLInputElement>('menu-color-hex');
const apply = () => screen.getByTestId('menu-color-hex-apply');

describe('the Hex field of a colour menu', () => {
  it('applies a colour typed as hexadecimal with Enter, as the project keeps colours', async () => {
    const { onPick, user } = setup();
    await user.click(screen.getByTestId('menu-color'));
    expect(apply()).toBeDisabled();
    await user.click(field());
    await user.keyboard('58c4dd');
    expect(apply()).toBeEnabled();
    // (jsdom reports colours as rgb.)
    expect(screen.getByTestId('menu-color-hex-sample').style.background).toBe('rgb(88, 196, 221)');
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledExactlyOnceWith('#58C4DD');
  });

  it('applies with its button too, and takes the short form', async () => {
    const { onPick, user } = setup();
    await user.click(screen.getByTestId('menu-color'));
    await user.type(field(), '#f0a');
    await user.click(apply());
    expect(onPick).toHaveBeenCalledExactlyOnceWith('#FF00AA');
  });

  it('applies nothing that is not a colour, and marks the field', async () => {
    const { onPick, user } = setup();
    await user.click(screen.getByTestId('menu-color'));
    await user.type(field(), '#12');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(apply()).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(onPick).not.toHaveBeenCalled();
    await user.clear(field());
    expect(field()).toHaveAttribute('aria-invalid', 'false');
  });

  it('is a stop of the menu: ↑ and ↓ reach it and leave it', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('menu-color'));
    // From the item after it, ↑ skips the disabled Apply and lands on the field.
    screen.getByTestId('menu-clear').focus();
    await user.keyboard('{ArrowUp}');
    expect(field()).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('menu-clear')).toHaveFocus();
  });

  it('keeps the keys of a text field: ←, → , Home and End move in the text, and letters type', async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByTestId('menu-color'));
    await user.click(field());
    await user.keyboard('abc');
    // ← would close the submenu, Home and End would go to the menu's first and last items.
    await user.keyboard('{ArrowLeft}{Home}{End}{ArrowRight}');
    expect(field()).toHaveFocus();
    expect(screen.getByRole('menu', { name: 'Colour' })).toBeInTheDocument();
    expect(field()).toHaveValue('abc');
    expect(onClose).not.toHaveBeenCalled();
    // Escape still closes the menu.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
