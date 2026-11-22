import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenu, MenuItem, Submenu } from '../ContextMenu';
import { onMenuChoice } from '../focus';
import { Modal } from '../project/Modal';

/** A menu with a plain item, a submenu of three items (one disabled) and another plain item. */
function setup(props: { disabled?: boolean } = {}) {
  const onClose = vi.fn();
  const onLeft = vi.fn();
  const onTop = vi.fn();
  const user = userEvent.setup();
  render(
    <ContextMenu x={100} y={100} label="Clip actions" testId="menu" onClose={onClose}>
      <div className="ctx-header">Header</div>
      <MenuItem testId="menu-top" onClick={onTop}>
        Top
      </MenuItem>
      <Submenu label="Align" testId="menu-align" disabled={props.disabled}>
        <MenuItem testId="menu-align-left" onClick={onLeft}>
          Align left
        </MenuItem>
        <MenuItem testId="menu-align-off" disabled onClick={() => {}}>
          Off
        </MenuItem>
        <MenuItem testId="menu-align-right" onClick={() => {}}>
          Align right
        </MenuItem>
      </Submenu>
      <MenuItem testId="menu-other" onClick={() => {}}>
        Other
      </MenuItem>
    </ContextMenu>,
  );
  return { onClose, onLeft, onTop, user };
}
const entry = () => screen.getByTestId('menu-align');
const panel = () => screen.queryByRole('menu', { name: 'Align' });

describe('ContextMenu', () => {
  it('is a menu at a point whose first item takes the focus; Escape and a press outside close it', () => {
    const { onClose } = setup();
    const menu = screen.getByRole('menu', { name: 'Clip actions' });
    expect(menu).toHaveClass('ctx-menu');
    expect(screen.getByTestId('menu-top')).toHaveFocus();
    fireEvent.pointerDown(screen.getByTestId('menu-other'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('walks its items with the arrows, Home and End, skipping the submenu panel', async () => {
    const { user } = setup();
    await user.keyboard('{ArrowDown}');
    expect(entry()).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('menu-other')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('menu-top')).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByTestId('menu-other')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByTestId('menu-top')).toHaveFocus();
  });

  it.each([
    { shift: false, submenu: false },
    { shift: true, submenu: true },
  ])(
    'Tab (Shift: $shift) closes the whole menu and lets the key go on from what opened it',
    async ({ shift, submenu }) => {
      const user = userEvent.setup();
      const closed = vi.fn();
      const picked = vi.fn();
      function Harness() {
        const [shown, setShown] = useState<'first' | 'second' | null>(null);
        return (
          <Modal title="Menu controls" onClose={() => {}}>
            <button type="button" data-testid="first-trigger" onClick={() => setShown('first')}>
              First
            </button>
            <button type="button" data-testid="second-trigger" onClick={() => setShown('second')}>
              Second
            </button>
            {shown && (
              <ContextMenu
                x={100}
                y={100}
                label={shown}
                testId={`${shown}-menu`}
                onClose={() => {
                  closed();
                  setShown(null);
                }}
              >
                <MenuItem testId={`${shown}-item`} onClick={() => {}}>
                  Item
                </MenuItem>
                {shown === 'first' ? (
                  <Submenu label="Nested" testId="nested">
                    <MenuItem testId="nested-item" onClick={() => {}}>
                      Nested item
                    </MenuItem>
                  </Submenu>
                ) : (
                  <MenuItem
                    testId="second-choice"
                    onClick={() => {
                      picked();
                      setShown(null);
                    }}
                  >
                    Choice
                  </MenuItem>
                )}
              </ContextMenu>
            )}
          </Modal>
        );
      }
      const view = render(<Harness />);
      // jsdom has no layout; make the visible modal controls available to its focus filter.
      for (const id of ['first-trigger', 'second-trigger']) {
        Object.defineProperty(screen.getByTestId(id), 'offsetParent', { value: document.body });
      }
      await user.keyboard('{Enter}');
      expect(screen.getByTestId('first-item')).toHaveFocus();
      if (submenu) {
        await user.keyboard('{ArrowDown}{ArrowRight}');
        expect(screen.getByTestId('nested-item')).toHaveFocus();
      }
      // The key is left to whoever moves the focus on a Tab: by then the focus is back on what
      // opened the menu, and it goes on from there. Closing the menu afterwards must not pull
      // it back.
      const tab = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        document.activeElement!.dispatchEvent(tab);
        if (shift) {
          // Backwards from the dialog's first control: its focus trap wraps to the last one.
          expect(tab.defaultPrevented).toBe(true);
        } else {
          // Forwards it is the browser's move (jsdom has none, so the test makes it).
          expect(tab.defaultPrevented).toBe(false);
          expect(screen.getByTestId('first-trigger')).toHaveFocus();
          screen.getByTestId('second-trigger').focus();
        }
      });
      expect(screen.queryAllByRole('menu')).toHaveLength(0);
      expect(closed).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('second-trigger')).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(screen.getAllByRole('menu')).toHaveLength(1);
      expect(screen.getByTestId('second-item')).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByTestId('second-choice')).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(picked).toHaveBeenCalledTimes(1);
      expect(screen.queryAllByRole('menu')).toHaveLength(0);
      expect(screen.getByTestId('second-trigger')).toHaveFocus();
      await user.keyboard('{Enter}');
      view.unmount();
      const later = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      window.dispatchEvent(later);
      expect(later.defaultPrevented).toBe(false);
    },
  );
});

describe('ContextMenu submenus', () => {
  it('shows a submenu entry with a chevron, closed, with the ARIA state', () => {
    setup();
    expect(entry()).toHaveAttribute('role', 'menuitem');
    expect(entry()).toHaveAttribute('aria-haspopup', 'menu');
    expect(entry()).toHaveAttribute('aria-expanded', 'false');
    expect(entry()).toHaveClass('ctx-item', 'ctx-sub-entry');
    expect(entry()).toHaveTextContent('Align›');
    expect(screen.getByRole('menuitem', { name: 'Align' })).toBe(entry());
    expect(panel()).toBeNull();
  });

  it('opens on hover, beside its entry, and closes when another entry of its menu is hovered', async () => {
    const { user } = setup();
    await user.hover(entry());
    expect(entry()).toHaveAttribute('aria-expanded', 'true');
    const sub = panel()!;
    expect(sub).toHaveClass('ctx-menu', 'ctx-submenu');
    expect(sub).toHaveAttribute('data-testid', 'menu-align-submenu');
    expect(sub).toBeVisible();
    expect(screen.getByTestId('menu-align-left')).toBeInTheDocument();
    // Hovering inside the panel keeps it; the focus stays where it was.
    await user.hover(screen.getByTestId('menu-align-right'));
    expect(panel()).not.toBeNull();
    expect(screen.getByTestId('menu-top')).toHaveFocus();
    await user.hover(screen.getByTestId('menu-other'));
    expect(panel()).toBeNull();
    expect(entry()).toHaveAttribute('aria-expanded', 'false');
    // The header closes it too.
    await user.hover(entry());
    await user.hover(screen.getByText('Header'));
    expect(panel()).toBeNull();
  });

  it('runs an item of the submenu with a click, and a press in its panel is not outside', async () => {
    const { user, onLeft, onClose } = setup();
    await user.hover(entry());
    fireEvent.pointerDown(screen.getByTestId('menu-align-left'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('menu-align-left'));
    expect(onLeft).toHaveBeenCalledOnce();
    await user.hover(entry());
    await user.click(screen.getByTestId('menu-align-off'));
    expect(onLeft).toHaveBeenCalledOnce();
  });

  it('opens with ArrowRight, Enter or Space, focusing its first enabled item', async () => {
    const { user } = setup();
    for (const key of ['{ArrowRight}', '{Enter}', ' ']) {
      entry().focus();
      await user.keyboard(key);
      expect(entry()).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('menu-align-left')).toHaveFocus();
      await user.keyboard('{ArrowLeft}');
      expect(panel()).toBeNull();
      expect(entry()).toHaveFocus();
    }
  });

  it('walks the submenu with the arrows, skipping the disabled item and the menu outside', async () => {
    const { user } = setup();
    entry().focus();
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('menu-align-right')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('menu-align-left')).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByTestId('menu-align-right')).toHaveFocus();
  });

  it('ArrowRight on an entry open by hover goes into its panel', async () => {
    const { user } = setup();
    await user.hover(entry());
    entry().focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('menu-align-left')).toHaveFocus();
  });

  it('Escape closes the whole menu, submenu and all', async () => {
    const { user, onClose } = setup();
    entry().focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('menu-align-left')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not open when disabled', async () => {
    const { user } = setup({ disabled: true });
    expect(entry()).toBeDisabled();
    await user.hover(entry());
    expect(panel()).toBeNull();
  });
});

describe('onMenuChoice', () => {
  /** The order things are heard in: the choice, then the entry itself. */
  let heard: string[] = [];
  const hear = () => heard.push('choice');

  it('hears an entry chosen with the pointer or the keyboard, before the entry acts', async () => {
    heard = [];
    const user = userEvent.setup();
    render(
      <ContextMenu x={100} y={100} label="Clip actions" testId="menu" onClose={() => {}}>
        <MenuItem testId="menu-top" onClick={() => heard.push('top')}>
          Top
        </MenuItem>
        <MenuItem testId="menu-off" disabled onClick={() => heard.push('off')}>
          Off
        </MenuItem>
        <Submenu label="Align" testId="menu-align">
          <MenuItem testId="menu-align-left" onClick={() => heard.push('left')}>
            Align left
          </MenuItem>
        </Submenu>
        <input data-ctx-field="" data-testid="menu-field" aria-invalid={false} />
      </ContextMenu>,
    );
    const stop = onMenuChoice(hear);
    await user.click(screen.getByTestId('menu-top'));
    expect(heard).toEqual(['choice', 'top']);
    // A disabled entry, or the entry of a submenu, chooses nothing; an entry of the submenu does.
    await user.click(screen.getByTestId('menu-off'));
    await user.click(screen.getByTestId('menu-align'));
    expect(heard).toEqual(['choice', 'top']);
    screen.getByTestId('menu-align-left').focus();
    await user.keyboard('{Enter}');
    expect(heard).toEqual(['choice', 'top', 'choice', 'left']);
    // Enter in a field of the menu: a choice when it holds a value it takes.
    const field = screen.getByTestId('menu-field');
    field.focus();
    await user.keyboard('{Enter}');
    expect(heard).toHaveLength(4);
    await user.keyboard('#fff{Enter}');
    expect(heard).toHaveLength(5);
    field.setAttribute('aria-invalid', 'true');
    await user.keyboard('{Enter}');
    expect(heard).toHaveLength(5);
    // Until it is stopped.
    stop();
    await user.click(screen.getByTestId('menu-top'));
    expect(heard).toEqual(['choice', 'top', 'choice', 'left', 'choice', 'top']);
  });

  it('hears nothing of a click outside the menus', async () => {
    heard = [];
    const user = userEvent.setup();
    render(
      <>
        <button type="button" role="menuitem" data-testid="loose">
          Not in a menu
        </button>
        <ContextMenu x={100} y={100} label="Clip actions" onClose={() => {}}>
          <MenuItem onClick={() => {}}>Top</MenuItem>
        </ContextMenu>
      </>,
    );
    const stop = onMenuChoice(hear);
    await user.click(screen.getByTestId('loose'));
    expect(heard).toEqual([]);
    stop();
  });
});
