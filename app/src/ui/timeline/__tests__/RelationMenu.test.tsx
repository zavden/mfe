import { render, screen } from '@testing-library/react';
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
import { usePathPicker } from '../../relations/pathPickerStore';
import { useRelationEditor } from '../../relations/relationEditorStore';
import { RelationMenu } from '../RelationMenu';

/** f1 (clip a) → f2 (clip b): a relation r1 with two pairs, the second on an arc of 30°. */
function build(): Project {
  const p = createEmptyProject('t');
  p.formulas = [
    { ...createFormula({ name: 'f1', source: 'x' }), id: 'f1' },
    { ...createFormula({ name: 'f2', source: 'y' }), id: 'f2' },
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
      { from: [0], to: [0], style: null },
      { from: [1], to: [1], style: null },
    ],
  });
  r.id = 'r1';
  p.relations = [r];
  return p;
}

beforeEach(() => {
  loadProject(build());
  useUiStore.setState({ selection: { kind: 'relation', id: 'r1' } });
  usePathEdit.setState({ target: null, selected: null });
  useRelationEditor.setState({ request: null });
  usePathPicker.setState({ relationId: null });
});

describe('RelationMenu', () => {
  it('says which relation of its two clips it is, when they have several', () => {
    useProjectStore.getState().update((draft) => {
      const second = createRelation('a', 'b', { pairs: [{ from: [2], to: [2], style: null }] });
      second.id = 'r2';
      draft.relations.push(second);
    });
    const { unmount } = render(<RelationMenu x={10} y={10} relationId="r2" onClose={() => {}} />);
    expect(screen.getByTestId('relation-menu-header')).toHaveTextContent(
      'f1 → f2 · 2 of 2 · 1 pair',
    );
    unmount();
    render(<RelationMenu x={10} y={10} relationId="r1" onClose={() => {}} />);
    expect(screen.getByTestId('relation-menu-header')).toHaveTextContent(
      'f1 → f2 · 1 of 2 · 2 pairs',
    );
  });

  it('names the relation, opens its editor and the Edit-path mode on a pair', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RelationMenu x={10} y={10} relationId="r1" onClose={onClose} />);
    expect(screen.getByTestId('relation-menu-header')).toHaveTextContent('f1 → f2 · 2 pairs');
    expect(screen.getByTestId('relation-menu-path-1')).toHaveTextContent('1 → 1 · arc 30°');
    await user.click(screen.getByTestId('relation-menu-path-1'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(usePathEdit.getState().target).toEqual({
      origin: { kind: 'relation', relationId: 'r1' },
      index: 1,
    });
    expect(useUiStore.getState().time).toBe(1.5); // the middle of the window [1, 2)
    await user.click(screen.getByTestId('relation-menu-edit-pairs'));
    expect(useRelationEditor.getState().request).toEqual({ kind: 'edit', relationId: 'r1' });
  });

  it('deletes the relation and clears its selection', async () => {
    const user = userEvent.setup();
    render(<RelationMenu x={10} y={10} relationId="r1" onClose={() => {}} />);
    await user.click(screen.getByTestId('relation-menu-delete'));
    expect(useProjectStore.getState().project.relations).toHaveLength(0);
    expect(useUiStore.getState().selection).toEqual({ kind: 'none' });
  });

  it('says so without pairs, and renders nothing for a relation that is gone', () => {
    useProjectStore.getState().update((d) => void (d.relations[0]!.pairs = []));
    const { unmount } = render(<RelationMenu x={10} y={10} relationId="r1" onClose={() => {}} />);
    expect(screen.getByTestId('relation-menu-no-pairs')).toBeDisabled();
    unmount();
    render(<RelationMenu x={10} y={10} relationId="nope" onClose={() => {}} />);
    expect(screen.queryByTestId('relation-menu')).toBeNull();
  });
});

describe('RelationMenu with many pairs', () => {
  it('puts the pairs behind Choose a pair… from six on, which opens the path picker', async () => {
    useProjectStore.getState().update((d) => {
      d.relations[0]!.pairs = [0, 1, 2, 3, 4, 5].map((g) => ({ from: [g], to: [g], style: null }));
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RelationMenu x={10} y={10} relationId="r1" onClose={onClose} />);
    expect(screen.queryByTestId('relation-menu-path-0')).toBeNull();
    const choose = screen.getByTestId('relation-menu-choose-path');
    expect(choose).toHaveTextContent('Choose a pair… (6)');
    await user.click(choose);
    expect(onClose).toHaveBeenCalled();
    expect(usePathPicker.getState().relationId).toBe('r1');
  });

  it('keeps five pairs in the menu itself', () => {
    useProjectStore.getState().update((d) => {
      d.relations[0]!.pairs = [0, 1, 2, 3, 4].map((g) => ({ from: [g], to: [g], style: null }));
    });
    render(<RelationMenu x={10} y={10} relationId="r1" onClose={() => {}} />);
    expect(screen.getAllByTestId(/^relation-menu-path-\d+$/)).toHaveLength(5);
    expect(screen.queryByTestId('relation-menu-choose-path')).toBeNull();
  });
});
