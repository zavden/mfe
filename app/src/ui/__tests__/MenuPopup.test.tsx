import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenuPopup } from '../MenuPopup';
import type { MenuEntry, MenuItemDef } from '../MenuPopup';

const setup = (onSelect = vi.fn()) => {
  const onChoose = vi.fn((item: MenuItemDef, event) => item.onSelect?.(event));
  const items: MenuEntry[] = [
    { type: 'item', id: 'top', label: 'Top', onSelect: () => {} },
    {
      type: 'submenu',
      id: 'align',
      label: 'Align',
      items: [
        { type: 'item', id: 'left', label: 'Left', shortcut: 'Alt+A', onSelect },
        { type: 'separator', id: 'sep' },
        { type: 'item', id: 'off', label: 'Off', disabled: true, onSelect },
        { type: 'item', id: 'right', label: 'Right', onSelect },
      ],
    },
    { type: 'item', id: 'other', label: 'Other', onSelect: () => {} },
  ];
  render(<MenuPopup label="Edit" items={items} testPrefix="menu-item-edit" onChoose={onChoose} />);
  return { onChoose, onSelect, user: userEvent.setup() };
};
const entry = () => screen.getByTestId('menu-item-edit-align');
const sub = () => screen.queryByRole('menu', { name: 'Align' });

describe('MenuPopup submenus', () => {
  it('shows a submenu entry with a chevron, closed, with the ARIA state', () => {
    setup();
    expect(entry()).toHaveAttribute('aria-haspopup', 'menu');
    expect(entry()).toHaveAttribute('aria-expanded', 'false');
    expect(entry()).toHaveTextContent('Align▸');
    expect(sub()).toBeNull();
  });

  it('opens on hover and closes when another entry of the parent is hovered', async () => {
    const { user } = setup();
    await user.hover(entry());
    expect(entry()).toHaveAttribute('aria-expanded', 'true');
    expect(sub()).toHaveClass('menu-popup', 'menu-submenu');
    expect(screen.getByTestId('menu-item-edit-align-left')).toHaveTextContent('Alt+A');
    await user.hover(screen.getByTestId('menu-item-edit-other'));
    expect(sub()).toBeNull();
    expect(entry()).toHaveAttribute('aria-expanded', 'false');
  });

  it('runs a submenu item through onChoose with the click', async () => {
    const { user, onChoose, onSelect } = setup();
    await user.hover(entry());
    await user.click(screen.getByTestId('menu-item-edit-align-right'));
    expect(onChoose).toHaveBeenCalledOnce();
    expect(onChoose.mock.calls[0]![0].id).toBe('right');
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('does not run a disabled submenu item', async () => {
    const { user, onSelect } = setup();
    await user.hover(entry());
    expect(screen.getByTestId('menu-item-edit-align-off')).toBeDisabled();
    await user.click(screen.getByTestId('menu-item-edit-align-off'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens with ArrowRight, Enter or Space, focusing its first enabled item', async () => {
    const { user } = setup();
    for (const key of ['{ArrowRight}', '{Enter}', ' ']) {
      entry().focus();
      await user.keyboard(key);
      expect(entry()).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('menu-item-edit-align-left')).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(sub()).toBeNull();
      expect(entry()).toHaveFocus();
    }
  });

  it('closes just the submenu with ArrowLeft and Escape, giving the focus back to its entry', async () => {
    const { user } = setup();
    entry().focus();
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{ArrowLeft}');
    expect(sub()).toBeNull();
    expect(entry()).toHaveFocus();
    expect(screen.getByRole('menu', { name: 'Edit' })).toBeInTheDocument();
  });

  it('moves between the enabled entries of a popup with the arrows, wrapping', async () => {
    const { user } = setup();
    entry().focus();
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('menu-item-edit-align-right')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('menu-item-edit-align-left')).toHaveFocus();
    await user.keyboard('{Escape}');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('menu-item-edit-other')).toHaveFocus();
  });

  it('closes the submenu when the focus moves to another entry of the parent', async () => {
    const { user } = setup();
    entry().focus();
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{Escape}');
    await user.keyboard('{ArrowRight}');
    act(() => screen.getByTestId('menu-item-edit-top').focus());
    expect(sub()).toBeNull();
  });

  it('closes with ArrowLeft or Escape from the entry when nothing in the submenu is enabled', async () => {
    const onChoose = vi.fn();
    const items: MenuEntry[] = [
      {
        type: 'submenu',
        id: 'align',
        label: 'Align',
        items: [{ type: 'item', id: 'left', label: 'Left', disabled: true }],
      },
    ];
    render(
      <MenuPopup label="Edit" items={items} testPrefix="menu-item-edit" onChoose={onChoose} />,
    );
    const user = userEvent.setup();
    for (const key of ['{ArrowLeft}', '{Escape}']) {
      entry().focus();
      await user.keyboard('{ArrowRight}');
      expect(sub()).not.toBeNull();
      expect(entry()).toHaveFocus();
      await user.keyboard(key);
      expect(sub()).toBeNull();
    }
  });
});

describe('MenuPopup swatches', () => {
  it('shows a colour square before the label of an item that has a swatch, and only there', () => {
    const items: MenuEntry[] = [
      { type: 'item', id: 'plain', label: 'Plain', onSelect: () => {} },
      {
        type: 'item',
        id: 'red',
        label: 'Red',
        swatch: '#ff0000',
        checked: true,
        onSelect: () => {},
      },
    ];
    render(<MenuPopup label="Colours" items={items} testPrefix="menu" onChoose={vi.fn()} />);
    expect(screen.getByTestId('menu-plain').querySelector('.menu-swatch')).toBeNull();
    const swatch = screen.getByTestId('menu-red').querySelector<HTMLElement>('.menu-swatch')!;
    expect(swatch).toHaveAttribute('aria-hidden', 'true');
    expect(swatch.style.background).toBe('rgb(255, 0, 0)');
    // Between the check mark and the label.
    expect([...screen.getByTestId('menu-red').children].map((c) => c.className)).toEqual([
      'menu-check',
      'menu-swatch',
      'menu-label',
    ]);
    // The label alone names the item: the swatch is decoration.
    expect(screen.getByRole('menuitemradio', { name: 'Red' })).toBeInTheDocument();
  });
});

describe('MenuPopup icons', () => {
  it('shows an icon before the label of an item that has one, and only there', () => {
    const items: MenuEntry[] = [
      { type: 'item', id: 'plain', label: 'Plain', onSelect: () => {} },
      {
        type: 'item',
        id: 'left',
        label: 'Left',
        icon: 'align-left',
        shortcut: 'Alt+A',
        onSelect: () => {},
      },
    ];
    render(<MenuPopup label="Align" items={items} testPrefix="menu" onChoose={vi.fn()} />);
    expect(screen.getByTestId('menu-plain').querySelector('.menu-icon')).toBeNull();
    const icon = screen.getByTestId('menu-left').querySelector<HTMLElement>('.menu-icon')!;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon.querySelector('svg')).not.toBeNull();
    // Between the check mark and the label, where a swatch goes.
    expect([...screen.getByTestId('menu-left').children].map((c) => c.className)).toEqual([
      'menu-check',
      'menu-icon',
      'menu-label',
      'menu-shortcut',
    ]);
    // The label alone names the item: the icon is decoration.
    expect(screen.getByRole('menuitem', { name: 'Left' })).toBeInTheDocument();
  });
});
