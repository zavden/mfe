/* The panel of a selected relation (RelationProperties.tsx): its Offset and Duration fields, and
 * what it leaves to a relation it cannot edit. */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createBraceFormula,
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  validateProject,
  type Relation,
} from '../../../model';
import { boxSnapshot, smallProject } from '../../../model/__tests__/fixtures';
import { useNoticeStore } from '../../project/noticeStore';
import { history, loadProject, useProjectStore } from '../../../store';
import { setRelationWindow } from '../relationActions';
import { RelationProperties } from '../RelationProperties';

/** Two clips over 0–10 s, one on each track, and a relation between them whose window is the
 * second after the first one: its panel is shown. */
function open(): Relation {
  const project = createEmptyProject();
  const from = createFormula({ name: 'from' });
  const to = createFormula({ name: 'to' });
  project.formulas.push(from, to);
  const a = createClip(from.id, project.tracks[0]!.id, 0, 10);
  const b = createClip(to.id, project.tracks[1]!.id, 0, 10);
  const relation = createRelation(a.id, b.id, { offset: 1, duration: 1 });
  project.clips.push(a, b);
  project.relations.push(relation);
  loadProject(project);
  render(<RelationProperties relationId={relation.id} />);
  return relation;
}

const relationNow = () => useProjectStore.getState().project.relations[0]!;
const errors = () =>
  validateProject(useProjectStore.getState().project)
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code);

afterEach(() => loadProject(createEmptyProject()));

describe('RelationProperties', () => {
  it('moves the window with Offset and stretches it with Duration, one undo step each', async () => {
    open();
    const user = userEvent.setup();
    const offset = screen.getByTestId('relation-offset');
    await user.clear(offset);
    await user.type(offset, '2{Enter}');
    expect(relationNow()).toMatchObject({ offset: 2, duration: 1 });
    const duration = screen.getByTestId('relation-duration');
    await user.clear(duration);
    await user.type(duration, '3{Enter}');
    expect(relationNow()).toMatchObject({ offset: 2, duration: 3 });
    history.undo();
    expect(relationNow()).toMatchObject({ offset: 2, duration: 1 });
    history.undo();
    expect(relationNow()).toMatchObject({ offset: 1, duration: 1 });
  });

  /* A field keeps the focus when the button goes down on the window's band, so its Enter can
   * come during a drag of the band: the edit gives the drag up and goes to the window it leaves. */
  describe('while a drag of the window is still held', () => {
    /** What the drag wrote so far, the button still held. */
    const held = (relation: Relation, window: { offset: number; duration: number }) => {
      const gesture = history.beginGesture();
      act(() => void gesture.run(() => setRelationWindow(relation.id, window)));
      return gesture;
    };

    it('Offset moves the window the drag leaves: its length is not the one a stretch showed', async () => {
      const relation = open();
      const user = userEvent.setup();
      const offset = screen.getByTestId('relation-offset');
      await user.clear(offset);
      await user.type(offset, '2');
      const gesture = held(relation, { offset: 1, duration: 3 });
      await user.keyboard('{Enter}');
      expect(gesture.active).toBe(false);
      expect(relationNow()).toMatchObject({ offset: 2, duration: 1 });
    });

    it('Duration stretches the window the drag leaves: it stays where it was', async () => {
      const relation = open();
      const user = userEvent.setup();
      const duration = screen.getByTestId('relation-duration');
      await user.clear(duration);
      await user.type(duration, '2');
      const gesture = held(relation, { offset: 3, duration: 1 });
      await user.keyboard('{Enter}');
      expect(gesture.active).toBe(false);
      expect(relationNow()).toMatchObject({ offset: 1, duration: 2 });
    });
  });

  it('refuses a Default style that gives the project an error, and says why (audit A3-04)', async () => {
    // a (a+b=c) on [0, 4] → b (c=b+) on [2, 6]: the first relation, a:0 → b:3 over [2, 3),
    // consumes a:0 (Transform); a second one of the same clips, whose pair inherits Copy,
    // copies a:0 into b:1 at the same time.
    const project = smallProject();
    const [a, b] = project.clips;
    const second = createRelation(a!.id, b!.id, {
      offset: 0,
      duration: 1,
      style: 'copy',
      pairs: [{ from: [0], to: [1], style: null }],
    });
    project.relations.push(second);
    loadProject(project);
    expect(errors()).toEqual([]);
    useNoticeStore.getState().clear();
    render(<RelationProperties relationId={second.id} />);
    const user = userEvent.setup();
    // Transform would consume a:0 a second time: refused, with the reason.
    await user.selectOptions(screen.getByTestId('relation-style'), 'transform');
    expect(errors()).toEqual([]);
    expect(useProjectStore.getState().project.relations[1]!.style).toBe('copy');
    expect(screen.getByTestId('relation-style')).toHaveValue('copy');
    expect(useNoticeStore.getState().notices.map((n) => [n.title, n.message])).toEqual([
      [
        'Default style not changed',
        'Transform would give the project an error: Source glyph 0 of "a" is consumed by more than one pair. Give the pairs that clash a style of their own in Edit pairs…, or keep the default style.',
      ],
    ]);
    // Fade copy consumes nothing: it is set, one undo step.
    await user.selectOptions(screen.getByTestId('relation-style'), 'fade_copy');
    expect(useProjectStore.getState().project.relations[1]!.style).toBe('fade_copy');
    expect(errors()).toEqual([]);
    history.undo();
    expect(useProjectStore.getState().project.relations[1]!.style).toBe('copy');
  });

  it('of a relation with a brace on a side edits nothing and says why: only Delete is left (audit A1-02)', async () => {
    // A file may hold one, made before the editor refused it (`relation-kind`, a warning).
    const project = createEmptyProject();
    const brace = createBraceFormula({ name: 'b1', snapshot: boxSnapshot(['⏟']) });
    const to = createFormula({ name: 'to', snapshot: boxSnapshot(['x', '+']) });
    project.formulas.push(brace, to);
    const a = createClip(brace.id, project.tracks[0]!.id, 0, 10);
    const b = createClip(to.id, project.tracks[1]!.id, 0, 10);
    const relation = createRelation(a.id, b.id, {
      offset: 1,
      duration: 1,
      pairs: [{ from: [0], to: [1], style: null }],
    });
    project.clips.push(a, b);
    project.relations.push(relation);
    loadProject(project);
    render(<RelationProperties relationId={relation.id} />);
    const reason =
      '"b1" is a brace, one piece: a relation is between formulas and texts, so this one cannot be edited, only deleted.';
    for (const id of ['relation-edit-pairs', 'relation-pair-0-edit-path']) {
      expect(screen.getByTestId(id)).toBeDisabled();
      expect(screen.getByTestId(id)).toHaveAttribute('title', reason);
    }
    for (const id of [
      'relation-offset',
      'relation-duration',
      'relation-easing',
      'relation-style',
      'relation-path-arc',
    ]) {
      expect(screen.getByTestId(id)).toBeDisabled();
    }
    expect(screen.getByTestId('relation-offset').closest('[title]')).toHaveAttribute(
      'title',
      reason,
    );
    // Its warning says the same, and Delete takes it away.
    expect(screen.getByTestId('relation-issues')).toHaveTextContent('it cannot be edited');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('relation-delete'));
    expect(useProjectStore.getState().project.relations).toEqual([]);
  });
});
