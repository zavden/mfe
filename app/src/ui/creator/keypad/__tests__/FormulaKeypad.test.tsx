import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormulaKeypad, type KeypadField } from '../FormulaKeypad';

/** A visual field that only records what the keypad asks of it. */
function fakeField() {
  return {
    insert: vi.fn(() => true),
    executeCommand: vi.fn(() => true),
    focus: vi.fn(),
  };
}

function open() {
  const field = fakeField();
  const onApply = vi.fn();
  render(<FormulaKeypad field={field as unknown as KeypadField} onApply={onApply} />);
  // The keypad opens on the tab it was left on: every test starts from Algebra.
  fireEvent.click(screen.getByTestId('keypad-tab-algebra'));
  return { field, onApply };
}

const key = (id: string) => screen.getByTestId(`keypad-key-${id}`);
/** A press of the pointer on a key: a click that a pointer made. */
const press = (id: string) => fireEvent.click(key(id), { detail: 1 });
/** A press from the physical keyboard (Enter or Space on the key): a click no pointer made. */
const pressFromKeyboard = (id: string) => fireEvent.click(key(id), { detail: 0 });
const showTab = (id: string) => fireEvent.click(screen.getByTestId(`keypad-tab-${id}`));

describe("the editor's own keypad", () => {
  it('shows the four tabs and the keys of one of them', () => {
    open();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Algebra',
      'Trigonometry',
      'Calculus',
      'Alphabet',
    ]);
    expect(screen.getByTestId('keypad-tab-algebra').getAttribute('aria-selected')).toBe('true');
    expect(key('frac')).toBeTruthy();
    // A key is on the page once: the keys of the other tabs are not there.
    expect(screen.queryByTestId('keypad-key-sin')).toBeNull();
    expect(screen.getAllByTestId('keypad-key-d7')).toHaveLength(1);
    showTab('trigonometry');
    expect(key('sin')).toBeTruthy();
    expect(screen.queryByTestId('keypad-key-abs')).toBeNull();
    expect(screen.getAllByTestId('keypad-key-d7')).toHaveLength(1);
  });

  it('writes what a key writes in the field, which has the focus afterwards', () => {
    const { field } = open();
    press('frac');
    expect(field.insert).toHaveBeenCalledWith('\\frac{#@}{#?}', {
      focus: true,
      feedback: false,
      scrollIntoView: true,
      mode: 'math',
      format: 'latex',
    });
    press('d7');
    expect(field.insert).toHaveBeenLastCalledWith('7', expect.objectContaining({ focus: true }));
  });

  it('leaves the focus on a key pressed from the physical keyboard', () => {
    const { field } = open();
    pressFromKeyboard('d7');
    expect(field.insert).toHaveBeenCalledWith('7', expect.objectContaining({ focus: false }));
    pressFromKeyboard('left');
    expect(field.executeCommand).toHaveBeenCalledWith('moveToPreviousChar');
    expect(field.focus).not.toHaveBeenCalled();
  });

  it("moves, deletes and clears with the field's commands", () => {
    const { field } = open();
    for (const [id, command] of [
      ['left', 'moveToPreviousChar'],
      ['right', 'moveToNextChar'],
      ['backspace', 'deleteBackward'],
      ['clear', 'deleteAll'],
    ] as const) {
      press(id);
      expect(field.executeCommand).toHaveBeenLastCalledWith(command);
    }
    expect(field.focus).toHaveBeenCalledTimes(4);
    expect(field.insert).not.toHaveBeenCalled();
  });

  it('applies with its Apply key, and writes nothing', () => {
    const { field, onApply } = open();
    press('apply');
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(field.insert).not.toHaveBeenCalled();
    expect(field.executeCommand).not.toHaveBeenCalled();
  });

  it('writes one capital after the capitals key, then small letters again', () => {
    const { field } = open();
    showTab('alphabet');
    expect(key('shift').getAttribute('aria-pressed')).toBe('false');
    press('shift');
    expect(key('shift').getAttribute('aria-pressed')).toBe('true');
    expect(key('a').getAttribute('aria-label')).toBe('A');
    press('a');
    expect(field.insert).toHaveBeenLastCalledWith('A', expect.anything());
    expect(key('shift').getAttribute('aria-pressed')).toBe('false');
    expect(key('a').getAttribute('aria-label')).toBe('a');
    press('a');
    expect(field.insert).toHaveBeenLastCalledWith('a', expect.anything());
    // Pressed twice, they are off again; another tab starts without them.
    press('shift');
    press('shift');
    expect(key('shift').getAttribute('aria-pressed')).toBe('false');
    press('shift');
    showTab('algebra');
    showTab('alphabet');
    expect(key('shift').getAttribute('aria-pressed')).toBe('false');
  });

  it('names every key, and says more than the face in a tooltip', () => {
    open();
    expect(key('frac').getAttribute('aria-label')).toBe('Fraction');
    expect(key('frac').getAttribute('title')).toBe('Fraction');
    expect(key('d7').getAttribute('aria-label')).toBe('7');
    expect(key('d7').getAttribute('title')).toBeNull();
    expect(key('apply').getAttribute('aria-label')).toBe('Apply');
  });

  it('does not take the focus from the field on a press of the pointer', () => {
    open();
    // The default of a mouse down is to move the focus: it is prevented, on keys and tabs.
    expect(fireEvent.mouseDown(key('frac'))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByTestId('keypad-tab-calculus'))).toBe(false);
  });

  it('is one stop of Tab; the arrows move among its keys', () => {
    open();
    const stops = () =>
      screen
        .getAllByRole('button')
        .filter((button) => button.tabIndex === 0)
        .map((button) => button.getAttribute('data-testid'));
    expect(stops()).toEqual(['keypad-key-frac']);
    key('frac').focus();
    fireEvent.keyDown(key('frac'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(key('mixed'));
    expect(stops()).toEqual(['keypad-key-mixed']);
    fireEvent.keyDown(key('mixed'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(key('root'));
    fireEvent.keyDown(key('root'), { key: 'End' });
    expect(document.activeElement).toBe(key('ge'));
    fireEvent.keyDown(key('ge'), { key: 'Home' });
    expect(document.activeElement).toBe(key('sqrt'));
    expect(stops()).toEqual(['keypad-key-sqrt']);
    // A key with Ctrl or Alt is not a move among the keys.
    fireEvent.keyDown(key('sqrt'), { key: 'ArrowRight', altKey: true });
    expect(document.activeElement).toBe(key('sqrt'));
    // Another tab has its stop at its first key.
    showTab('trigonometry');
    expect(stops()).toEqual(['keypad-key-sin']);
  });

  it('undoes and redoes the formula, not the project, from one of its keys', () => {
    const { field } = open();
    const undo = fireEvent.keyDown(key('frac'), { key: 'z', ctrlKey: true });
    expect(field.executeCommand).toHaveBeenLastCalledWith('undo');
    // Prevented: the shortcut of the project, which listens on the document, leaves it alone.
    expect(undo).toBe(false);
    const redo = fireEvent.keyDown(key('frac'), { key: 'z', ctrlKey: true, shiftKey: true });
    expect(field.executeCommand).toHaveBeenLastCalledWith('redo');
    expect(redo).toBe(false);
    // Any other shortcut is not the keypad's.
    expect(fireEvent.keyDown(key('frac'), { key: 's', ctrlKey: true })).toBe(true);
    expect(field.executeCommand).toHaveBeenCalledTimes(2);
  });

  it('opens again on the tab it was left on', () => {
    const first = render(
      <FormulaKeypad field={fakeField() as unknown as KeypadField} onApply={() => {}} />,
    );
    fireEvent.click(screen.getByTestId('keypad-tab-calculus'));
    first.unmount();
    render(<FormulaKeypad field={fakeField() as unknown as KeypadField} onApply={() => {}} />);
    expect(screen.getByTestId('keypad-tab-calculus').getAttribute('aria-selected')).toBe('true');
    expect(key('limit')).toBeTruthy();
  });
});
