/* The menu that asks what to do between two clips that are related already (D165): edit one of
 * their relations — numbered in the order of their windows, each with its window and its pairs —
 * or add another. A locked track keeps all of it from being done; adding one also needs what a
 * first relation needs (`relationBlocker`: room for a window), and says why it cannot. The menu
 * is about two clips that have relations: when the project changes under it so that they have
 * none, or one of them is gone (an undo), it closes instead of asking about nothing — or of
 * coming back where it was when they return. */
import { useEffect } from 'react';
import { useProjectStore } from '../../store';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { useRelationChoice, type RelationChoice } from './relationChoiceStore';
import { openRelationEditor } from './relationEditorStore';
import {
  onePieceRelation,
  relationBlocker,
  relationLock,
  relationsBetween,
  windowAndPairs,
} from './relationOps';

export function RelationChoiceMenu({
  choice,
  onClose,
}: {
  choice: RelationChoice;
  onClose(): void;
}) {
  const project = useProjectStore((s) => s.project);
  const { fromClipId, toClipId, x, y } = choice;
  const from = project.clips.find((c) => c.id === fromClipId);
  const to = project.clips.find((c) => c.id === toClipId);
  const relations = relationsBetween(project, fromClipId, toClipId);
  const stale = !from || !to || relations.length === 0;
  useEffect(() => {
    if (stale) onClose();
  }, [stale, onClose]);
  if (!from || !to || relations.length === 0) return null;
  const nameOf = (formulaId: string) =>
    project.formulas.find((f) => f.id === formulaId)?.name ?? '?';
  const lock = relationLock(project, { fromClipId, toClipId });
  // A relation with a brace, a shape or a line on a side is deleted only (audit A1-02).
  const frozen = lock ?? onePieceRelation(project, { fromClipId, toClipId });
  const blocker = relationBlocker(project, from, to);
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <ContextMenu
      x={x}
      y={y}
      label="Relations of these two clips"
      testId="relation-choice"
      onClose={onClose}
    >
      <div className="ctx-header" data-testid="relation-choice-header">
        {nameOf(from.formulaId)} → {nameOf(to.formulaId)} · {relations.length} relation
        {relations.length === 1 ? '' : 's'}
      </div>
      {relations.map((relation, i) => (
        <MenuItem
          key={relation.id}
          testId={`relation-choice-edit-${i + 1}`}
          disabled={!!frozen}
          title={frozen ?? undefined}
          onClick={act(() => openRelationEditor({ kind: 'edit', relationId: relation.id }))}
        >
          Edit relation {i + 1}…
          <span className="ctx-hint">{windowAndPairs(project, relation)}</span>
        </MenuItem>
      ))}
      <hr className="ctx-sep" />
      <MenuItem
        testId="relation-choice-add"
        disabled={!!blocker}
        describedBy={blocker ? 'relation-choice-blocker' : undefined}
        onClick={act(() => openRelationEditor({ kind: 'create', fromClipId, toClipId }))}
      >
        Add another relation…
      </MenuItem>
      {blocker && (
        <div
          className="ctx-note"
          id="relation-choice-blocker"
          data-testid="relation-choice-blocker"
        >
          {blocker}
        </div>
      )}
    </ContextMenu>
  );
}

/** Mounts the menu when two related clips are to be related (`relateClips`). */
export function RelationChoiceHost() {
  const choice = useRelationChoice((s) => s.choice);
  const close = useRelationChoice((s) => s.close);
  return choice ? <RelationChoiceMenu choice={choice} onClose={close} /> : null;
}
