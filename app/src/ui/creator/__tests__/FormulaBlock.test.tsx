import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFormula } from '../../../model';
import { FormulaBlock } from '../FormulaBlock';

function setup(clipCount = 2) {
  const formula = createFormula({ name: 'alpha', source: 'x' });
  const onNavigate = vi.fn();
  const onEdit = vi.fn();
  const onSelect = vi.fn();
  render(
    <FormulaBlock
      formula={formula}
      formulas={[formula]}
      entry={undefined}
      warning={undefined}
      highlight="selected"
      clipCount={clipCount}
      onSelect={onSelect}
      tabStop
      onNavigate={onNavigate}
      onFocused={() => {}}
      onEdit={onEdit}
      onContextMenu={() => {}}
      onRename={() => null}
      onDuplicate={() => {}}
      onDelete={() => {}}
      onDismissWarning={() => {}}
    />,
  );
  return { formula, onNavigate, onEdit, onSelect };
}

describe('FormulaBlock', () => {
  it('is an option with the tag, the name, the clip count, the kind and the status, no thumbnail', () => {
    setup();
    const block = screen.getByRole('option', { name: 'Formula alpha' });
    expect(block).toHaveAttribute('data-testid', 'formula-block');
    expect(block).toHaveAttribute('aria-selected', 'true');
    expect(block).toHaveAttribute('draggable', 'true');
    expect(screen.getByTestId('formula-name')).toHaveTextContent('alpha');
    expect(screen.getByTestId('formula-clips')).toHaveTextContent('▭ 2');
    expect(screen.getByTestId('formula-kind')).toBeInTheDocument();
    expect(screen.getByTestId('formula-status')).toHaveAttribute('data-status', 'idle');
    expect(block.querySelector('.formula-thumb')).toBeNull();
    expect(screen.getByTestId('formula-duplicate')).toHaveAttribute('tabindex', '-1');
  });

  it('carries what its compact face is made of: its tag’s colour, the render’s mark', () => {
    const { formula } = setup();
    const block = screen.getByRole('option');
    expect(block.style.getPropertyValue('--tag')).toBe(formula.tag.color);
    // Nothing else: the glass and the ink are the stylesheet's, from the theme's colours.
    expect(block.style.length).toBe(1);
    // Everything it shows is in its face, the element the stylesheet colours.
    const face = screen.getByTestId('formula-block-face');
    expect(face.parentElement).toBe(block);
    for (const id of ['formula-name', 'formula-kind', 'formula-status', 'formula-edit']) {
      expect(face).toContainElement(screen.getByTestId(id));
    }
    // Not rendered yet: the mark says so, and the badge keeps its words and has them as a tooltip.
    const status = screen.getByTestId('formula-status');
    expect(status).toHaveAttribute('data-mark', '…');
    expect(status).toHaveTextContent('…');
    expect(status).toHaveAttribute('title', '…');
  });

  it('walks with the arrows in both directions, edits on Enter and renames on F2', () => {
    const { onNavigate, onEdit } = setup(0);
    expect(screen.queryByTestId('formula-clips')).toBeNull();
    const block = screen.getByRole('option');
    fireEvent.keyDown(block, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenLastCalledWith('ArrowRight', { shift: false, ctrl: false });
    fireEvent.keyDown(block, { key: 'ArrowDown', shiftKey: true });
    expect(onNavigate).toHaveBeenLastCalledWith('ArrowDown', { shift: true, ctrl: false });
    fireEvent.keyDown(block, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledOnce();
    fireEvent.keyDown(block, { key: 'F2' });
    expect(screen.getByTestId('formula-rename-input')).toHaveValue('alpha');
    expect(block).toHaveAttribute('draggable', 'false');
  });
});
