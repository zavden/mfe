import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  type Clip,
  type Project,
  type Relation,
} from '../../../model';
import { boxSnapshot } from '../../../model/__tests__/fixtures';
import { loadProject, useProjectStore } from '../../../store';
import { RelationChoiceHost } from '../RelationChoiceMenu';
import { relateClips, useRelationChoice } from '../relationChoiceStore';
import { useRelationEditor } from '../relationEditorStore';

/** f1 on track 1 [0, 6] and f2 on track 2 [2, 8], with `count` relations f1 → f2. */
function load(count: number): { project: Project; a: Clip; b: Clip; relations: Relation[] } {
  const project = createEmptyProject();
  const fa = createFormula({ name: 'f1', snapshot: boxSnapshot(['a', '+', 'b']) });
  const fb = createFormula({ name: 'f2', snapshot: boxSnapshot(['a', '=', '3']) });
  project.formulas.push(fa, fb);
  const a = createClip(fa.id, project.tracks[0]!.id, 0, 6);
  const b = createClip(fb.id, project.tracks[1]!.id, 2, 8);
  project.clips.push(a, b);
  const relations = Array.from({ length: count }, (_, i) =>
    createRelation(a.id, b.id, { offset: i, pairs: [{ from: [i], to: [i], style: null }] }),
  );
  project.relations.push(...relations);
  loadProject(project);
  return { project: useProjectStore.getState().project, a, b, relations };
}

const at = { x: 40, y: 60 };

afterEach(() => {
  useRelationChoice.getState().close();
  useRelationEditor.getState().close();
  loadProject(createEmptyProject());
});

describe('relateClips', () => {
  it('opens the editor on a new relation when the two clips have none', () => {
    const { project, a, b } = load(0);
    relateClips(project, a.id, b.id, at);
    expect(useRelationChoice.getState().choice).toBeNull();
    expect(useRelationEditor.getState().request).toEqual({
      kind: 'create',
      fromClipId: a.id,
      toClipId: b.id,
    });
  });

  it('asks when they have some, and only in the direction that has them', () => {
    const { project, a, b } = load(1);
    relateClips(project, a.id, b.id, at);
    expect(useRelationEditor.getState().request).toBeNull();
    expect(useRelationChoice.getState().choice).toEqual({
      fromClipId: a.id,
      toClipId: b.id,
      ...at,
    });
    useRelationChoice.getState().close();
    relateClips(project, b.id, a.id, at);
    expect(useRelationChoice.getState().choice).toBeNull();
    expect(useRelationEditor.getState().request).toMatchObject({ kind: 'create' });
  });
});

describe('the menu of two related clips', () => {
  it('lists their relations by number and opens the one chosen', async () => {
    const { project, a, b, relations } = load(2);
    const user = userEvent.setup();
    render(<RelationChoiceHost />);
    expect(screen.queryByTestId('relation-choice')).toBeNull();
    relateClips(project, a.id, b.id, at);
    expect(await screen.findByTestId('relation-choice-header')).toHaveTextContent(
      'f1 → f2 · 2 relations',
    );
    expect(screen.getByTestId('relation-choice-edit-1')).toHaveTextContent(
      'Edit relation 1…2.00–3.00 s · 1 pair',
    );
    expect(screen.getByTestId('relation-choice-edit-2')).toHaveTextContent(
      'Edit relation 2…3.00–4.00 s · 1 pair',
    );
    await user.click(screen.getByTestId('relation-choice-edit-2'));
    expect(useRelationEditor.getState().request).toEqual({
      kind: 'edit',
      relationId: relations[1]!.id,
    });
    // The menu is gone once it has answered.
    expect(useRelationChoice.getState().choice).toBeNull();
    expect(screen.queryByTestId('relation-choice')).toBeNull();
  });

  it('adds another: the editor on a new relation between the same two clips', async () => {
    const { project, a, b } = load(1);
    const user = userEvent.setup();
    render(<RelationChoiceHost />);
    relateClips(project, a.id, b.id, at);
    await user.click(await screen.findByTestId('relation-choice-add'));
    expect(useRelationEditor.getState().request).toEqual({
      kind: 'create',
      fromClipId: a.id,
      toClipId: b.id,
    });
  });

  it('says why another cannot be added, and still edits the ones there are', async () => {
    const { a, b } = load(1);
    // The clips no longer overlap in time: there is no room for a window.
    useProjectStore.getState().update((draft) => {
      const clip = draft.clips.find((c) => c.id === b.id)!;
      clip.start = 6.5;
      clip.end = 9;
    });
    render(<RelationChoiceHost />);
    relateClips(useProjectStore.getState().project, a.id, b.id, at);
    expect(await screen.findByTestId('relation-choice-add')).toBeDisabled();
    expect(screen.getByTestId('relation-choice-blocker')).toHaveTextContent(
      'The clips must overlap in time',
    );
    expect(screen.getByTestId('relation-choice-edit-1')).toBeEnabled();
  });

  it('closes when the project changes under it and leaves it nothing to ask about', async () => {
    const { a, b, relations } = load(1);
    render(<RelationChoiceHost />);
    relateClips(useProjectStore.getState().project, a.id, b.id, at);
    expect(await screen.findByTestId('relation-choice')).toBeInTheDocument();
    // Their one relation goes (an undo, say): there is nothing to edit, and no "another".
    act(() =>
      useProjectStore.getState().update((draft) => {
        draft.relations = [];
      }),
    );
    expect(screen.queryByTestId('relation-choice')).toBeNull();
    expect(useRelationChoice.getState().choice).toBeNull();
    // It does not come back when the relation does.
    act(() =>
      useProjectStore.getState().update((draft) => {
        draft.relations.push(relations[0]!);
      }),
    );
    expect(screen.queryByTestId('relation-choice')).toBeNull();

    // The same when one of the two clips goes.
    relateClips(useProjectStore.getState().project, a.id, b.id, at);
    expect(await screen.findByTestId('relation-choice')).toBeInTheDocument();
    act(() =>
      useProjectStore.getState().update((draft) => {
        draft.relations = [];
        draft.clips = draft.clips.filter((c) => c.id !== b.id);
      }),
    );
    expect(screen.queryByTestId('relation-choice')).toBeNull();
    expect(useRelationChoice.getState().choice).toBeNull();
  });

  it('edits nothing of a locked track', async () => {
    const { a, b } = load(1);
    useProjectStore.getState().update((draft) => {
      draft.tracks[1]!.locked = true;
    });
    render(<RelationChoiceHost />);
    relateClips(useProjectStore.getState().project, a.id, b.id, at);
    expect(await screen.findByTestId('relation-choice-edit-1')).toBeDisabled();
    expect(screen.getByTestId('relation-choice-add')).toBeDisabled();
    expect(screen.getByTestId('relation-choice-blocker')).toHaveTextContent('is locked');
  });
});
