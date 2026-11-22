/* «Copy colour to clipboard» (CopyColourItem.tsx, D130): the colour a single picked glyph is
 * seen in, as hexadecimal, on the system clipboard. */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFormula } from '../../../model';
import { ContextMenu } from '../../ContextMenu';
import { useNoticeStore } from '../../project/noticeStore';
import { copyColour } from '../../clipboard';
import { CopyColourItem } from '../CopyColourItem';

const formula = createFormula({
  name: 'f1',
  source: 'a+b',
  color: '#ffffff',
  glyphColors: { '1': '#58c4dd' },
});

/** Put a clipboard on the navigator that keeps what is written, or refuses it. */
function clipboard(refuses = false) {
  const writeText = vi.fn<(text: string) => Promise<void>>(() =>
    refuses ? Promise.reject(new Error('denied')) : Promise.resolve(),
  );
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}

beforeEach(() => useNoticeStore.setState({ notices: [] }));
afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

function open(glyph: number) {
  const onClose = vi.fn();
  render(
    <ContextMenu x={10} y={10} label="Glyphs" testId="menu" onClose={onClose}>
      <CopyColourItem formula={formula} glyph={glyph} testIdPrefix="menu" onClose={onClose} />
    </ContextMenu>,
  );
  return onClose;
}

describe('Copy colour to clipboard', () => {
  it('copies the glyph’s own colour, in upper case, and closes the menu', async () => {
    const writeText = clipboard();
    const onClose = open(1);
    expect(screen.getByTestId('menu-copy-colour-value')).toHaveTextContent('#58C4DD');
    // (A click of user-event would put its own clipboard on the navigator.)
    fireEvent.click(screen.getByTestId('menu-copy-colour'));
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledExactlyOnceWith('#58C4DD');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useNoticeStore.getState().notices).toEqual([]);
  });

  it('copies the object’s colour for a glyph that has none of its own', () => {
    clipboard();
    open(0);
    expect(screen.getByTestId('menu-copy-colour-value')).toHaveTextContent('#FFFFFF');
  });

  it('says the colour in a notice when the browser refuses, or has no clipboard', async () => {
    clipboard(true);
    expect(await copyColour('#58C4DD')).toBe(false);
    Reflect.deleteProperty(navigator, 'clipboard');
    expect(await copyColour('#FC6255')).toBe(false);
    expect(useNoticeStore.getState().notices.map((n) => [n.title, n.message])).toEqual([
      [
        'Could not copy the colour',
        'The browser did not let the page write to the clipboard. The colour is #58C4DD.',
      ],
      [
        'Could not copy the colour',
        'The browser did not let the page write to the clipboard. The colour is #FC6255.',
      ],
    ]);
  });
});
