import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../Modal';
import { ownEscape } from '../modalStack';

function Dialog({ testId, resizable = true }: { testId: string; resizable?: boolean }) {
  return (
    <Modal title="Big dialog" onClose={vi.fn()} testId={testId} width="600px" resizable={resizable}>
      <p>content</p>
    </Modal>
  );
}

describe('Modal: resizable', () => {
  it('maximizes from the button or a double-click on the title bar, and restores', async () => {
    const user = userEvent.setup();
    render(<Dialog testId="dlg-a" />);
    const dialog = screen.getByTestId('dlg-a');
    expect(dialog.style.width).toBe('600px');
    await user.click(screen.getByTestId('dlg-a-maximize'));
    expect(dialog).toHaveClass('is-maximized', 'is-sized');
    expect(dialog.style.width).toBe('calc(100vw - 16px)');
    expect(screen.queryByTestId('dlg-a-resize')).toBeNull(); // no corner while maximized
    expect(screen.getByTestId('dlg-a-maximize')).toHaveAccessibleName('Restore size');
    await user.dblClick(screen.getByText('Big dialog'));
    expect(dialog).not.toHaveClass('is-maximized');
    expect(dialog.style.width).toBe('600px');
  });

  it('resizes from the corner (twice the pointer travel: it stays centred) and remembers it', () => {
    const { unmount } = render(<Dialog testId="dlg-b" />);
    const dialog = screen.getByTestId('dlg-b');
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 600, 400));
    const grip = screen.getByTestId('dlg-b-resize');
    fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientX: 700, clientY: 500 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 750, clientY: 520 });
    fireEvent.pointerUp(grip, { pointerId: 1 });
    expect(dialog).toHaveClass('is-sized');
    expect(dialog.style.width).toBe('700px');
    expect(dialog.style.height).toBe('440px');
    // Reopening the same dialog keeps the size; a double-click on the corner resets it.
    unmount();
    render(<Dialog testId="dlg-b" />);
    expect(screen.getByTestId('dlg-b').style.width).toBe('700px');
    fireEvent.doubleClick(screen.getByTestId('dlg-b-resize'));
    expect(screen.getByTestId('dlg-b').style.width).toBe('600px');
    expect(screen.getByTestId('dlg-b')).not.toHaveClass('is-sized');
  });

  it('remembers the size under `sizeKey`: two shapes of one dialog keep a size each', async () => {
    const user = userEvent.setup();
    const shape = (sizeKey: string) => (
      <Modal title="Shapes" onClose={vi.fn()} testId="dlg-k" sizeKey={sizeKey} resizable>
        <p>content</p>
      </Modal>
    );
    const wide = render(shape('dlg-k-wide'));
    await user.click(screen.getByTestId('dlg-k-maximize'));
    expect(screen.getByTestId('dlg-k')).toHaveClass('is-maximized');
    wide.unmount();
    // The other shape of the same dialog did not choose that size…
    const narrow = render(shape('dlg-k-narrow'));
    expect(screen.getByTestId('dlg-k')).not.toHaveClass('is-maximized');
    narrow.unmount();
    // …and the first one still has it.
    render(shape('dlg-k-wide'));
    expect(screen.getByTestId('dlg-k')).toHaveClass('is-maximized');
  });

  it('shows no maximize button or corner unless resizable', () => {
    render(<Dialog testId="dlg-c" resizable={false} />);
    expect(screen.queryByTestId('dlg-c-maximize')).toBeNull();
    expect(screen.queryByTestId('dlg-c-resize')).toBeNull();
  });
});

describe('Modal: tools in the title bar', () => {
  it('holds them between the title and the window buttons, and opens on the first', async () => {
    const user = userEvent.setup();
    render(
      <Modal
        title="Studio"
        onClose={vi.fn()}
        testId="dlg-tools"
        resizable
        headerTools={
          <>
            <button type="button">First tool</button>
            <span data-testid="tool-panel">what a tool opened</span>
          </>
        }
      >
        <button type="button">In the body</button>
      </Modal>,
    );
    const dialog = screen.getByTestId('dlg-tools');
    const header = dialog.querySelector('.modal-header')!;
    expect([...header.children].map((element) => element.className || element.tagName)).toEqual([
      'H2',
      'modal-header-tools',
      'modal-maximize',
      'modal-close',
    ]);
    expect(screen.getByText('First tool')).toHaveFocus();
    // A double-click on what the bar holds is not one on the bar; on its free stretch it is.
    await user.dblClick(screen.getByTestId('tool-panel'));
    await user.dblClick(screen.getByText('First tool'));
    expect(dialog).not.toHaveClass('is-maximized');
    await user.dblClick(header.querySelector('.modal-header-tools')!);
    expect(dialog).toHaveClass('is-maximized');
  });
});

describe('Modal: Escape', () => {
  it('closes, unless a field with an edit to take back has the key', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal title="Fields" onClose={onClose} testId="dlg-e">
        <input data-testid="field" {...ownEscape(true)} />
      </Modal>,
    );
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    rerender(
      <Modal title="Fields" onClose={onClose} testId="dlg-e">
        <input data-testid="field" {...ownEscape(false)} />
      </Modal>,
    );
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Modal: the focus when it opens', () => {
  it('goes to the first control of the body, or to the one marked with data-autofocus', () => {
    const { unmount } = render(
      <Modal title="Plain" onClose={vi.fn()} testId="dlg-focus-a">
        <button type="button">First</button>
        <input aria-label="Search" />
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    unmount();
    render(
      <Modal title="Marked" onClose={vi.fn()} testId="dlg-focus-b">
        <button type="button">First</button>
        <input aria-label="Search" data-autofocus="" />
      </Modal>,
    );
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus();
  });

  // A disabled control takes no focus: asked to, it leaves it on what opened the dialog, and the
  // keys go on acting there, behind it (the pair editor of a Morph opened on its Link button,
  // disabled until something is selected: the arrows moved the timeline's selection).
  it('passes over a control that is disabled, marked or not', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <Modal title="Marked and disabled" onClose={vi.fn()} testId="dlg-focus-c">
        <button type="button">First</button>
        <button type="button" data-autofocus="" disabled>
          Link
        </button>
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    unmount();
    opener.focus();
    render(
      <Modal title="First disabled" onClose={vi.fn()} testId="dlg-focus-d">
        <fieldset disabled>
          <button type="button">Off</button>
        </fieldset>
        <input aria-label="Name" />
      </Modal>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    opener.remove();
  });

  it('takes the focus itself when it has no control that can', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    render(
      <Modal title="Nothing to focus" onClose={vi.fn()} testId="dlg-focus-e" resizable={false}>
        <button type="button" data-autofocus="" disabled>
          Link
        </button>
      </Modal>,
    );
    expect(opener).not.toHaveFocus();
    expect(screen.getByTestId('dlg-focus-e')).toHaveFocus();
    opener.remove();
  });
});
