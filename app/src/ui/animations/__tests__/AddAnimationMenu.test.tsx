/* What "Add animation" offers per kind of object (BlockMenus.tsx, D123): a formula or a text has
 * a Transform of the whole of it or of a part, and a Morph; a brace and a shape are one piece. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddAnimationMenu } from '../BlockMenus';
import type { BlockSubject } from '../blockKinds';
import type { NewBlock } from '../blockOps';

function open(subject?: BlockSubject, onRetarget?: () => void) {
  const onPick = vi.fn<(block: NewBlock) => void>();
  const onClose = vi.fn();
  render(
    <AddAnimationMenu
      x={0}
      y={0}
      header="o1 · 2.00 s"
      subject={subject}
      onPick={onPick}
      onRetarget={onRetarget}
      onClose={onClose}
    />,
  );
  return { onPick, onClose };
}

describe('AddAnimationMenu', () => {
  it('offers a formula the Transform of the whole of it or of a part, and a Morph', () => {
    const { onPick } = open();
    expect(screen.getByTestId('add-animation-morph')).toHaveTextContent('Morph within the formula');
    fireEvent.mouseEnter(screen.getByTestId('add-animation-group-transform'));
    expect(screen.getByTestId('add-animation-tween')).toHaveTextContent('Whole formula (keyframe)');
    expect(screen.getByTestId('add-animation-transform')).toHaveTextContent('Part of the formula');
    fireEvent.click(screen.getByTestId('add-animation-transform'));
    expect(onPick).toHaveBeenCalledWith({ kind: 'transform' });
  });

  it.each(['brace', 'shape'] as const)(
    'offers a %s one Transform, of the whole object, and no Morph',
    (subject) => {
      const { onPick, onClose } = open(subject);
      expect(screen.queryByTestId('add-animation-group-transform')).toBeNull();
      expect(screen.queryByTestId('add-animation-transform')).toBeNull();
      expect(screen.queryByTestId('add-animation-morph')).toBeNull();
      expect(screen.getByTestId('add-animation-menu')).not.toHaveTextContent(/formula/i);
      // The other families stay.
      for (const group of ['appear', 'disappear', 'emphasis']) {
        expect(screen.getByTestId(`add-animation-group-${group}`)).toBeInTheDocument();
      }
      const transform = screen.getByTestId('add-animation-tween');
      expect(transform).toHaveTextContent(/^Transform$/);
      fireEvent.click(transform);
      expect(onPick).toHaveBeenCalledWith({ kind: 'tween' });
      expect(onClose).toHaveBeenCalled();
    },
  );

  it('on a locked clip has every animation off, saying why, and its other entries on', () => {
    const onPick = vi.fn<(block: NewBlock) => void>();
    const onToggle = vi.fn();
    render(
      <AddAnimationMenu
        x={0}
        y={0}
        header="o1 · 2.00 s"
        onPick={onPick}
        onShape={vi.fn()}
        object={<button data-testid="own-entry">Own</button>}
        previewLock={{ locked: false, onToggle }}
        locked="The track of this clip is locked."
        onClose={vi.fn()}
      />,
    );
    for (const id of ['appear', 'disappear', 'transform', 'emphasis']) {
      const group = screen.getByTestId(`add-animation-group-${id}`);
      expect(group).toBeDisabled();
      expect(group).toHaveAttribute('title', 'The track of this clip is locked.');
    }
    expect(screen.getByTestId('add-animation-morph')).toBeDisabled();
    fireEvent.click(screen.getByTestId('add-animation-morph'));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByTestId('clip-menu-preview-lock')).toBeDisabled();
    fireEvent.click(screen.getByTestId('clip-menu-preview-lock'));
    expect(onToggle).not.toHaveBeenCalled();
    // What does not change the clip stays: a shape on it, and the entries of its own.
    expect(screen.getByTestId('add-shape')).toBeEnabled();
    expect(screen.getByTestId('own-entry')).toBeEnabled();
  });

  it('offers a shape its Transform and the one that carries it to another formula or glyphs', () => {
    const onRetarget = vi.fn();
    const { onPick, onClose } = open('shape', onRetarget);
    expect(screen.queryByTestId('add-animation-transform')).toBeNull();
    expect(screen.queryByTestId('add-animation-morph')).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId('add-animation-group-transform'));
    expect(screen.getByTestId('add-animation-tween')).toHaveTextContent(/^Transform$/);
    const carry = screen.getByTestId('add-animation-retarget');
    expect(carry).toHaveTextContent('To another formula or glyphs…');
    fireEvent.click(carry);
    expect(onRetarget).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });
});
