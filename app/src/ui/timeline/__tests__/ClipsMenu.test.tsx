import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBraceFormula,
  createClip,
  createEmptyProject,
  createFormula,
  createShapeFormula,
  validateProject,
  type Project,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { useMultiEdit } from '../../creator/multiEditStore';
import { ClipsMenu, formulasOfClips } from '../ClipsMenu';

/** f1 and f2; clips a (f1) and b (f2) on the top track, c (f1) on the bottom one. */
function build(lockBottom = false): Project {
  const p = createEmptyProject('t');
  const f1 = { ...createFormula({ name: 'f1', source: 'x' }), id: 'f1' };
  const f2 = { ...createFormula({ name: 'f2', source: 'y' }), id: 'f2' };
  p.formulas = [f1, f2];
  const [top, bottom] = p.tracks;
  if (lockBottom) bottom!.locked = true;
  const a = createClip('f1', top!.id, 0, 4);
  a.id = 'a';
  const b = createClip('f2', top!.id, 5, 9);
  b.id = 'b';
  const c = createClip('f1', bottom!.id, 0, 4);
  c.id = 'c';
  p.clips = [a, b, c];
  return p;
}

const clips = () => useProjectStore.getState().project.clips;

beforeEach(() => {
  loadProject(build());
  useMultiEdit.getState().close?.();
});

describe('formulasOfClips', () => {
  it('lists the formulas of the clips once each, in the project order', () => {
    const project = useProjectStore.getState().project;
    expect(formulasOfClips(project, ['c', 'b', 'a'])).toEqual(['f1', 'f2']);
    expect(formulasOfClips(project, ['a', 'c'])).toEqual(['f1']);
    expect(formulasOfClips(project, ['gone'])).toEqual([]);
  });
});

describe('ClipsMenu', () => {
  it('says how many clips and formulas, and edits them together', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ClipsMenu x={0} y={0} clipIds={['a', 'b']} onClose={onClose} />);
    expect(screen.getByTestId('clips-menu-header')).toHaveTextContent('2 clips · 2 formulas');
    expect(screen.queryByTestId('clips-menu-edit')).toBeNull();
    // Apply match colors is a submenu: nothing to apply, so it offers to create a list.
    await user.hover(screen.getByTestId('clips-menu-match'));
    expect(screen.getByTestId('clips-menu-match-create')).toBeInTheDocument();
    await user.click(screen.getByTestId('clips-menu-edit-together'));
    expect(onClose).toHaveBeenCalled();
    expect(useMultiEdit.getState().ids).toEqual(['f1', 'f2']);
  });

  it('offers Edit… for clips of one formula, and the match colour lists of the project', async () => {
    const user = userEvent.setup();
    useProjectStore.getState().update((draft) => {
      draft.colorMatches.push({ id: 'm1', name: 'Course', entries: [] });
    });
    render(<ClipsMenu x={0} y={0} clipIds={['a', 'c']} onClose={() => {}} />);
    expect(screen.getByTestId('clips-menu-header')).toHaveTextContent('2 clips · 1 formula');
    expect(screen.getByTestId('clips-menu-edit')).toHaveTextContent('Edit…');
    await user.hover(screen.getByTestId('clips-menu-match'));
    expect(screen.getByTestId('clips-menu-match-m1')).toHaveTextContent('Course');
    expect(screen.queryByTestId('clips-menu-match-create')).toBeNull();
  });

  it('duplicates the clips a drag still held leaves: the copies do not run into them', async () => {
    const user = userEvent.setup();
    render(<ClipsMenu x={0} y={0} clipIds={['a', 'b']} onClose={vi.fn()} />);
    // b dragged far to the right, the button still held when the command of the menu comes (the
    // menu opens from the keyboard, and its items are keys too).
    const gesture = history.beginGesture();
    act(() =>
      gesture.update((draft) => {
        Object.assign(draft.clips[1]!, { start: 20, end: 24 });
      }),
    );
    await user.click(screen.getByTestId('clips-menu-duplicate'));
    expect(gesture.active).toBe(false);
    const top = clips()[0]!.trackId;
    // After b where it is again, not in the room its drag had left.
    expect(
      clips()
        .filter((c) => c.trackId === top)
        .map((c) => [c.start, c.end]),
    ).toEqual([
      [0, 4],
      [5, 9],
      [9, 13],
      [13, 17],
    ]);
    const { project } = useProjectStore.getState();
    expect(validateProject(project).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('duplicates the clips and selects the copies; deletes them and clears the selection', async () => {
    const user = userEvent.setup();
    render(<ClipsMenu x={0} y={0} clipIds={['a', 'b']} onClose={() => {}} />);
    expect(screen.getByTestId('clips-menu-duplicate')).toHaveTextContent('Duplicate');
    await user.click(screen.getByTestId('clips-menu-duplicate'));
    expect(clips()).toHaveLength(5);
    const selection = useUiStore.getState().selection;
    expect(selection.kind).toBe('clips');
    expect(selection.kind === 'clips' ? selection.ids : []).toHaveLength(2);

    render(<ClipsMenu x={0} y={0} clipIds={['a', 'b']} onClose={() => {}} />);
    const del = screen.getAllByTestId('clips-menu-delete').at(-1)!;
    expect(del).toHaveTextContent('Delete 2 clips');
    await user.click(del);
    expect(clips().map((c) => c.id)).not.toContain('a');
    expect(clips()).toHaveLength(3);
    expect(useUiStore.getState().selection).toEqual({ kind: 'none' });
  });

  it('adds one brace over the selected clips, on a side; no glyphs to choose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    // a and c are on screen together over [0, 4).
    render(<ClipsMenu x={0} y={0} clipIds={['a', 'c']} onClose={onClose} />);
    const entry = screen.getByTestId('clips-menu-brace');
    expect(entry).toHaveTextContent('Add brace');
    expect(entry).toBeEnabled();
    await user.hover(entry);
    expect(screen.queryByTestId('clips-menu-brace-glyphs')).toBeNull();
    await user.click(screen.getByTestId('clips-menu-brace-up'));
    expect(onClose).toHaveBeenCalled();
    const brace = clips().at(-1)!;
    expect(brace.attach).toMatchObject({
      rule: 'brace',
      clipId: 'a',
      glyphs: 'all',
      direction: 180,
      also: [{ clipId: 'c', glyphs: 'all' }],
    });
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [brace.id] });
  });

  it('greys Add brace out for clips that are never on screen together, and says why', () => {
    // a runs over [0, 4), b over [5, 9).
    render(<ClipsMenu x={0} y={0} clipIds={['a', 'b']} onClose={() => {}} />);
    const entry = screen.getByTestId('clips-menu-brace');
    expect(entry).toBeDisabled();
    expect(entry).toHaveAttribute('title', 'The selected clips are never on screen together.');
  });

  it('offers a brace over shapes too, and none when a brace is among the clips', () => {
    useProjectStore.getState().update((draft) => {
      draft.formulas.push(
        { ...createShapeFormula({ name: 's1' }), id: 's1' },
        { ...createBraceFormula({ name: 'b1' }), id: 'b1' },
      );
      const s = createClip('s1', draft.tracks[1]!.id, 5, 9);
      s.id = 's';
      const b = createClip('b1', draft.tracks[1]!.id, 10, 12);
      b.id = 'br';
      draft.clips.push(s, b);
    });
    const shapes = render(<ClipsMenu x={0} y={0} clipIds={['s', 'b']} onClose={() => {}} />);
    expect(screen.getByTestId('clips-menu-brace')).toBeEnabled();
    shapes.unmount();
    render(<ClipsMenu x={0} y={0} clipIds={['s', 'b', 'br']} onClose={() => {}} />);
    expect(screen.queryByTestId('clips-menu-brace')).toBeNull();
  });

  it('unlinks the clips of a formula into one copy they share, after Timing ›', async () => {
    const user = userEvent.setup();
    useProjectStore.getState().update((draft) => {
      const d = createClip('f1', draft.tracks[0]!.id, 10, 14);
      d.id = 'd';
      draft.clips.push(d);
    });
    history.clear();
    const onClose = vi.fn();
    render(<ClipsMenu x={0} y={0} clipIds={['a', 'b', 'c']} onClose={onClose} />);
    const items = screen.getAllByRole('menuitem').map((item) => item.dataset.testid);
    expect(
      items.slice(items.indexOf('clips-menu-timing'), items.indexOf('clips-menu-timing') + 2),
    ).toEqual(['clips-menu-timing', 'clips-menu-unlink']);
    const entry = screen.getByTestId('clips-menu-unlink');
    expect(entry).toHaveTextContent('Unlink formula (make a copy)');
    expect(entry).toHaveAttribute(
      'title',
      'The 2 selected clips of “f1” share one copy of it, a new formula in the Creator. Editing a formula or its copy no longer changes the clips of the other.',
    );
    await user.click(entry);
    expect(onClose).toHaveBeenCalled();
    const { project } = useProjectStore.getState();
    const copy = project.formulas[1]!;
    expect(copy.name).toBe('f3');
    expect(clips().map((c) => [c.id, c.formulaId])).toEqual([
      ['a', copy.id],
      ['b', 'f2'],
      ['c', copy.id],
      ['d', 'f1'],
    ]);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('greys Unlink out for all the clips of their formulas, and has none for a brace', () => {
    const view = render(<ClipsMenu x={0} y={0} clipIds={['a', 'b', 'c']} onClose={() => {}} />);
    expect(screen.getByTestId('clips-menu-unlink')).toBeDisabled();
    expect(screen.getByTestId('clips-menu-unlink')).toHaveAttribute(
      'title',
      'These are all the clips of their formulas: there is nothing to unlink them from.',
    );
    view.unmount();
    // Two clips of one brace: a brace lives with its clips, out of the Creator's list.
    useProjectStore.getState().update((draft) => {
      draft.formulas.push({ ...createBraceFormula({ name: 'b1' }), id: 'b1' });
      const e = createClip('b1', draft.tracks[1]!.id, 5, 9);
      e.id = 'e';
      const e2 = createClip('b1', draft.tracks[1]!.id, 10, 14);
      e2.id = 'e2';
      draft.clips.push(e, e2);
    });
    render(<ClipsMenu x={0} y={0} clipIds={['e', 'e2']} onClose={() => {}} />);
    expect(screen.queryByTestId('clips-menu-unlink')).toBeNull();
  });

  it('leaves the clips on locked tracks alone, and says so', () => {
    loadProject(build(true));
    render(<ClipsMenu x={0} y={0} clipIds={['a', 'c']} onClose={() => {}} />);
    expect(screen.getByTestId('clips-menu-duplicate')).toHaveTextContent(
      'Duplicate 1 clip (the others are locked)',
    );
    expect(screen.getByTestId('clips-menu-delete')).toHaveTextContent(
      'Delete 1 clip (the others are locked)',
    );
    expect(screen.getByTestId('clips-menu-delete')).toBeEnabled();
  });
});
