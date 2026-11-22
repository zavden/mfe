/* Relations of a clip in the Animations panel: the block diagram, one row per relation (edit its
 * pairs, edit a path, delete; how many of its paths were edited) and the form that creates a new
 * one — or, between two clips that are related already, opens the menu that asks which of their
 * relations to edit, or to add another (`relateClips`). «Edit path…» of a row goes straight to
 * the Edit-path mode on a relation's one pair, and opens the path picker for several
 * (`relationPathAction`). */
import { useState } from 'react';
import type { ClipId, Project, Relation } from '../../model';
import { removeRelation } from './relationActions';
import { useProjectStore, useRenderStore, useUiStore } from '../../store';
import { SelectField } from '../animations/fields';
import { usePathEdit } from '../preview/pathEdit';
import { SegmentedControl } from '../SegmentedControl';
import { openRelationEditor } from './relationEditorStore';
import { relateClips } from './relationChoiceStore';
import { buildDiagram } from './diagramLayout';
import { EditedPathDot } from './EditedPathDot';
import { openPathPicker } from './pathPickerStore';
import { RelationDiagram } from './RelationDiagram';
import { openRelationChain } from './relationChainStore';
import {
  clipLabel,
  editedPathCount,
  editedPathsText,
  onePieceRelation,
  relatable,
  relateBlocker,
  relationLock,
  relationNumber,
  relationPathAction,
  relationsBetween,
  summarize,
  type RelationPathAction,
} from './relationOps';

function nameOf(project: Project, clipId: ClipId): string {
  const clip = project.clips.find((c) => c.id === clipId);
  return project.formulas.find((f) => f.id === clip?.formulaId)?.name ?? '?';
}

/** One option of the direction switch: "from → to". */
function directionLabel(from: string, to: string) {
  return {
    title: `${from} → ${to}`,
    label: (
      <>
        {from}
        <span className="segmented-arrow" aria-hidden="true">
          →
        </span>
        {to}
      </>
    ),
  };
}

/** Pick another clip and a direction, then open the relation editor. The clips offered are the
 * formulas and texts (`relatable`); a brace, a shape or a line has no form. */
export function CreateRelation({ clipId, otherId }: { clipId: ClipId; otherId?: ClipId }) {
  const project = useProjectStore((s) => s.project);
  const clip = project.clips.find((c) => c.id === clipId);
  const candidates = project.clips.filter((c) => c.id !== clipId && relatable(project, c));
  const [chosen, setChosen] = useState<string>('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  if (!clip || !relatable(project, clip)) return null;
  const here = nameOf(project, clipId);
  const partnerId = otherId ?? (candidates.some((c) => c.id === chosen) ? chosen : '');
  const other = project.clips.find((c) => c.id === partnerId);
  const [fromClip, toClip] = other
    ? direction === 'out'
      ? [clip, other]
      : [other, clip]
    : [null, null];
  const there = other ? nameOf(project, other.id) : 'other';
  const related =
    fromClip && toClip ? relationsBetween(project, fromClip.id, toClip.id).length > 0 : false;
  // Two related clips can always be asked about, unless a locked track keeps their relations
  // from being edited: the menu says why another relation cannot be added.
  const blocker = fromClip && toClip ? relateBlocker(project, fromClip, toClip) : null;

  return (
    <div className="rel-create" data-testid="create-relation">
      {otherId === undefined && (
        <SelectField
          label="Relate with"
          testId="create-relation-other"
          value={partnerId}
          options={[
            {
              value: '',
              label: candidates.length ? 'Choose a clip…' : 'No other formulas or texts',
            },
            ...candidates.map((c) => ({ value: c.id, label: clipLabel(project, c) })),
          ]}
          onChange={setChosen}
        />
      )}
      <SegmentedControl<'out' | 'in'>
        label="Direction"
        testId="create-relation-direction"
        value={direction}
        options={[
          { value: 'out', ...directionLabel(here, there) },
          { value: 'in', ...directionLabel(there, here) },
        ]}
        onChange={setDirection}
      />
      {blocker && (
        <p className="an-notice" data-testid="create-relation-blocker">
          {blocker}
        </p>
      )}
      <button
        type="button"
        className="an-small-button an-accent-button"
        data-testid="create-relation-button"
        disabled={!fromClip || !toClip || !!blocker}
        onClick={(event) => {
          if (!fromClip || !toClip) return;
          // The menu, when there is one, opens under the button.
          const rect = event.currentTarget.getBoundingClientRect();
          relateClips(project, fromClip.id, toClip.id, { x: rect.left, y: rect.bottom + 4 });
        }}
      >
        {related ? 'Edit or add a relation…' : 'Create relation…'}
      </button>
    </div>
  );
}

/** «Edit path…» of a row: the Edit-path mode on the relation's one pair, or the path picker. */
function editPath(relation: Relation, action: RelationPathAction): void {
  if (action.kind === 'pair') {
    usePathEdit
      .getState()
      .open(
        { origin: { kind: 'relation', relationId: relation.id }, index: action.index },
        relation.pairs[action.index],
      );
  } else if (action.kind === 'picker') {
    openPathPicker(relation.id);
  }
}

export function RelationRows({ project, relations }: { project: Project; relations: Relation[] }) {
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  return (
    <ul className="rel-list" data-testid="relation-list">
      {relations.map((relation) => {
        const lock = relationLock(project, relation);
        // One with a brace, a shape or a line on a side is deleted only (audit A1-02).
        const frozen = lock ?? onePieceRelation(project, relation);
        const pathAction = relationPathAction(project, relation);
        const edited = editedPathsText(editedPathCount(relation));
        // Which of the relations of its two clips it is, when they have several.
        const number = relationNumber(project, relation);
        return (
          <li
            key={relation.id}
            className={`rel-row${selection.kind === 'relation' && selection.id === relation.id ? ' is-selected' : ''}`}
            data-testid={`relation-row-${relation.id}`}
          >
            <div className="rel-row-head">
              <button
                type="button"
                className="rel-row-title an-link"
                data-testid={`relation-select-${relation.id}`}
                title="Select this relation"
                onClick={() => select({ kind: 'relation', id: relation.id })}
              >
                {nameOf(project, relation.fromClipId)} → {nameOf(project, relation.toClipId)}
                {number.of > 1 && (
                  <span className="rel-row-number" data-testid={`relation-number-${relation.id}`}>
                    {number.n} of {number.of}
                  </span>
                )}
              </button>
              {edited && (
                <span className="rel-row-paths" data-testid={`relation-paths-${relation.id}`}>
                  <EditedPathDot decorative testId={`relation-paths-${relation.id}-dot`} />
                  {edited}
                </span>
              )}
            </div>
            <span className="rel-row-meta">{summarize(project, relation)}</span>
            <span className="rel-row-actions">
              <button
                type="button"
                className="an-small-button"
                data-testid={`relation-edit-${relation.id}`}
                disabled={!!frozen}
                title={frozen ?? undefined}
                onClick={() => openRelationEditor({ kind: 'edit', relationId: relation.id })}
              >
                Edit…
              </button>
              <button
                type="button"
                className="an-small-button"
                data-testid={`relation-edit-path-${relation.id}`}
                disabled={pathAction.kind === 'blocked'}
                title={
                  pathAction.kind === 'blocked'
                    ? pathAction.reason
                    : pathAction.kind === 'pair'
                      ? "Shape the curve this pair's glyphs follow, in the preview"
                      : 'Choose the pair whose path to shape, in the preview'
                }
                onClick={() => editPath(relation, pathAction)}
              >
                Edit path…
              </button>
              <button
                type="button"
                className="an-small-button"
                aria-label="Delete relation"
                data-testid={`relation-delete-${relation.id}`}
                disabled={!!lock}
                title={lock ?? undefined}
                onClick={() => {
                  if (!removeRelation(relation.id)) return;
                  if (selection.kind === 'relation' && selection.id === relation.id) {
                    select({ kind: 'none' });
                  }
                }}
              >
                ×
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Everything about the relations of one clip. */
export function RelationsSection({ clipId }: { clipId: ClipId }) {
  const project = useProjectStore((s) => s.project);
  const resolved = useRenderStore((s) => s.resolved);
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const relations = project.relations.filter(
    (r) => r.fromClipId === clipId || r.toClipId === clipId,
  );
  const selected = selection.kind === 'relation' ? selection.id : null;

  return (
    <div className="rel-section-body" data-testid="clip-relations">
      {relations.length === 0 ? (
        <p className="an-hint" data-testid="relations-empty">
          No relations. Relate this clip with another one to morph glyphs from one formula into the
          other.
        </p>
      ) : (
        <>
          <div className="rel-diagram-tools">
            <button
              type="button"
              className="an-small-button"
              title="Every relation connected to this clip, in one diagram"
              data-testid="clip-show-related"
              onClick={() => openRelationChain(clipId)}
            >
              All related…
            </button>
          </div>
          <RelationDiagram
            diagram={buildDiagram(project, clipId)}
            resolved={resolved}
            selectedRelationId={selected}
            onSelectRelation={(id) => select({ kind: 'relation', id })}
            label="Relations of the selected clip"
          />
          <RelationRows project={project} relations={relations} />
        </>
      )}
      <CreateRelation clipId={clipId} />
    </div>
  );
}
