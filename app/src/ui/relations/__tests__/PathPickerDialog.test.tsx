import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  type Project,
} from '../../../model';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { usePathEdit } from '../../preview/pathEdit';
import { PathPickerDialog, PathPickerHost } from '../PathPickerDialog';
import { usePathPicker } from '../pathPickerStore';

const bump = {
  nodes: [
    {
      at: [0, 0] as [number, number],
      in: null,
      out: [0.3, 0.4] as [number, number],
      smooth: false,
    },
    {
      at: [1, 0] as [number, number],
      in: [0.7, 0.4] as [number, number],
      out: null,
      smooth: false,
    },
  ],
};

/** f1 (clip a) → f2 (clip b): r1 with three pairs, the first on a custom path. */
function build(): Project {
  const p = createEmptyProject('t');
  p.formulas = [
    { ...createFormula({ name: 'f1', source: 'x+y' }), id: 'f1' },
    { ...createFormula({ name: 'f2', source: 'y+x' }), id: 'f2' },
  ];
  const [top] = p.tracks;
  const a = createClip('f1', top!.id, 0, 4);
  a.id = 'a';
  const b = createClip('f2', top!.id, 1, 5);
  b.id = 'b';
  p.clips = [a, b];
  const r = createRelation('a', 'b', {
    pathArc: 30,
    pairs: [
      { from: [0], to: [2], style: null, path: bump },
      { from: [1], to: [1], style: 'copy' },
      { from: [2], to: [0], style: null },
    ],
  });
  r.id = 'r1';
  p.relations = [r];
  return p;
}

beforeEach(() => {
  loadProject(build());
  useUiStore.setState({ selection: { kind: 'none' }, time: 0 });
  usePathEdit.setState({ target: null, selected: null });
  usePathPicker.setState({ relationId: null });
});

describe('PathPickerDialog', () => {
  it('names the relation by its number among several of the same two clips', () => {
    const { unmount } = render(<PathPickerDialog relationId="r1" onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Edit path · f1 → f2' })).toBeInTheDocument();
    unmount();
    useProjectStore.getState().update((draft) => {
      const second = createRelation('a', 'b', { pairs: [] });
      second.id = 'r2';
      draft.relations.push(second);
    });
    render(<PathPickerDialog relationId="r1" onClose={() => {}} />);
    expect(
      screen.getByRole('dialog', { name: 'Edit path · f1 → f2 · 1 of 2' }),
    ).toBeInTheDocument();
  });

  it('lists the pairs with their curve, style and path, and opens the mode on a click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PathPickerDialog relationId="r1" onClose={onClose} />);
    expect(screen.getByTestId('path-picker')).toBeInTheDocument();
    expect(screen.getByTestId('path-picker-pair-0-meta')).toHaveTextContent(
      'Transform · custom path',
    );
    expect(screen.getByTestId('path-picker-pair-1-meta')).toHaveTextContent('Copy · arc 30°');
    expect(screen.getAllByTestId(/^path-picker-pair-\d+$/)).toHaveLength(3);
    // Each row draws its curve; the custom path's rises above the chord, the arc's too.
    const curve = screen.getByTestId('path-picker-pair-0').querySelector('.pp-curve')!;
    expect(curve.getAttribute('d')).toMatch(/^M8\.0 26\.0 L/);
    // Hovering a row picks its link in the diagram.
    await user.hover(screen.getByTestId('path-picker-pair-2'));
    expect(screen.getByTestId('rd-edge-r1-2')).toHaveClass('is-picked');
    expect(screen.getByTestId('rd-edge-r1-0')).not.toHaveClass('is-picked');
    await user.click(screen.getByTestId('path-picker-pair-2'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(usePathEdit.getState().target).toEqual({
      origin: { kind: 'relation', relationId: 'r1' },
      index: 2,
    });
  });

  it('opens the mode from a link of the diagram too', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PathPickerDialog relationId="r1" onClose={onClose} />);
    await user.click(screen.getByTestId('rd-edge-r1-1').querySelector('.rd-edge-hit')!);
    expect(onClose).toHaveBeenCalled();
    expect(usePathEdit.getState().target?.index).toBe(1);
  });

  it('is mounted by its host while the store names a relation, and closes when it goes', () => {
    render(<PathPickerHost />);
    expect(screen.queryByTestId('path-picker')).toBeNull();
    act(() => usePathPicker.getState().open('r1'));
    expect(screen.getByTestId('path-picker')).toBeInTheDocument();
    act(() => useProjectStore.getState().update((d) => void (d.relations = [])));
    expect(usePathPicker.getState().relationId).toBeNull();
    expect(screen.queryByTestId('path-picker')).toBeNull();
  });
});
