/* The right-click menu of a relation's window band on the timeline: its pair editor, the
 * Edit-path mode of the preview on each of its pairs (D48) — listed in the menu up to a few, a
 * pair whose path was edited with its mark (`EditedPathDot`), else behind a "Choose a pair…" that
 * opens the path picker dialog — and deleting it. A relation with an object of one piece on a
 * side is deleted only (`onePieceRelation`): the other entries say why they are greyed out. */
import type { RelationId } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { announce } from '../announcer';
import { ContextMenu, MenuItem } from '../ContextMenu';
import { usePathEdit } from '../preview/pathEdit';
import { EditedPathDot } from '../relations/EditedPathDot';
import { openPathPicker } from '../relations/pathPickerStore';
import { openRelationEditor } from '../relations/relationEditorStore';
import {
  describePair,
  onePieceRelation,
  wearsEditedPath,
  pathOfPair,
  relationLock,
  relationNumber,
} from '../relations/relationOps';
import { removeRelation } from '../relations/relationActions';

interface RelationMenuProps {
  x: number;
  y: number;
  relationId: RelationId;
  onClose(): void;
}

/** Up to this many pairs, their Edit path… items sit in the menu itself. */
export const INLINE_PAIRS = 5;

export function RelationMenu({ x, y, relationId, onClose }: RelationMenuProps) {
  const project = useProjectStore((state) => state.project);
  const relation = project.relations.find((r) => r.id === relationId);
  if (!relation) return null;
  const formulaOf = (clipId: string) => {
    const clip = project.clips.find((c) => c.id === clipId);
    return project.formulas.find((f) => f.id === clip?.formulaId) ?? null;
  };
  const from = formulaOf(relation.fromClipId);
  const to = formulaOf(relation.toClipId);
  const lock = relationLock(project, relation);
  // A relation with a brace, a shape or a line on a side, which a saved project may hold
  // (`relation-kind`, audit A1-02), cannot be edited, only deleted.
  const piece = onePieceRelation(project, relation);
  const frozen = lock ?? piece;
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const remove = () => {
    if (!removeRelation(relationId)) return;
    const { selection, select } = useUiStore.getState();
    if (selection.kind === 'relation' && selection.id === relationId) select({ kind: 'none' });
    announce('Relation deleted');
  };
  const count = relation.pairs.length;
  // Which of the relations of its two clips it is, when they have several.
  const number = relationNumber(project, relation);
  const pairItems = relation.pairs.map((pair, i) => (
    <MenuItem
      key={i}
      testId={`relation-menu-path-${i}`}
      disabled={!!frozen}
      title={piece ?? undefined}
      onClick={act(() =>
        usePathEdit.getState().open({ origin: { kind: 'relation', relationId }, index: i }, pair),
      )}
    >
      {describePair(pair, from?.snapshot ?? null, to?.snapshot ?? null)} ·{' '}
      {pathOfPair(pair, relation)}
      {wearsEditedPath(pair, relation) && <EditedPathDot testId={`relation-menu-path-${i}-dot`} />}
    </MenuItem>
  ));
  return (
    <ContextMenu
      key="relation"
      x={x}
      y={y}
      label="Relation"
      testId="relation-menu"
      onClose={onClose}
    >
      <div className="ctx-header" data-testid="relation-menu-header">
        {from?.name ?? '?'} → {to?.name ?? '?'}
        {number.of > 1 ? ` · ${number.n} of ${number.of}` : ''} · {count} pair
        {count === 1 ? '' : 's'}
      </div>
      {lock && (
        <div className="ctx-header" data-testid="relation-menu-locked">
          {lock}
        </div>
      )}
      <MenuItem
        testId="relation-menu-edit-pairs"
        disabled={!from || !to || !!frozen}
        title={piece ?? undefined}
        onClick={act(() => openRelationEditor({ kind: 'edit', relationId }))}
      >
        Edit pairs…
      </MenuItem>
      <hr className="ctx-sep" />
      <div className="ctx-header ctx-group">Edit path</div>
      {count === 0 ? (
        <MenuItem testId="relation-menu-no-pairs" disabled onClick={() => {}}>
          No pairs yet
        </MenuItem>
      ) : count <= INLINE_PAIRS ? (
        pairItems
      ) : (
        <MenuItem
          testId="relation-menu-choose-path"
          disabled={!!frozen}
          title={piece ?? undefined}
          onClick={act(() => openPathPicker(relationId))}
        >
          Choose a pair… ({count})
        </MenuItem>
      )}
      <hr className="ctx-sep" />
      <MenuItem danger testId="relation-menu-delete" disabled={!!lock} onClick={act(remove)}>
        Delete relation
      </MenuItem>
    </ContextMenu>
  );
}
