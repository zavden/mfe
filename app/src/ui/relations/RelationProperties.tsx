/* The Animations panel for a selected relation: its settings (every change one undo step), its
 * pairs — each with its Edit path…, and the mark of an edited path (`EditedPathDot`) on those
 * whose path was shaped — and a button that opens the pair editor. */
import { PATH_ARC_LIMIT } from '../../model';
import type { Clip, Relation, RelationId, RelationStyle } from '../../model';
import { history, useProjectStore, useRenderStore, useUiStore } from '../../store';
import { NumberField, SelectField } from '../animations/fields';
import { relationIssues } from '../animations/issues';
import { IssuesSection } from '../animations/IssueList';
import { Section } from '../animations/Section';
import { openRelationEditor } from './relationEditorStore';
import { buildRelationDiagram } from './diagramLayout';
import { RelationDiagram } from './RelationDiagram';
import { openRelationChain } from './relationChainStore';
import { usePathEdit } from '../preview/pathEdit';
import { EditedPathDot } from './EditedPathDot';
import {
  describePair,
  fitWindow,
  wearsEditedPath,
  MIN_WINDOW,
  onePieceRelation,
  pathOfPair,
  relationAlive,
  relationLock,
  styleOfPair,
  windowRange,
} from './relationOps';
import {
  editRelation,
  removeRelation,
  setRelationStyle,
  setRelationWindow,
} from './relationActions';
import { notify } from '../project/noticeStore';
import { clampWindow, type WindowEdit } from './windowRange';
import { EASING_CHOICES } from '../animations/catalogue';
import { STYLE_OPTIONS } from './styleOptions';
import { relationContext } from '../animations/context';
import { PropertiesHeader } from '../animations/PropertiesHeader';

export function RelationProperties({ relationId }: { relationId: RelationId }) {
  const project = useProjectStore((s) => s.project);
  const resolved = useRenderStore((s) => s.resolved);
  const select = useUiStore((s) => s.select);
  const index = project.relations.findIndex((r) => r.id === relationId);
  const relation = project.relations[index];
  const from = project.clips.find((c) => c.id === relation?.fromClipId);
  const to = project.clips.find((c) => c.id === relation?.toClipId);
  if (!relation || !from || !to) return null;
  const fromFormula = project.formulas.find((f) => f.id === from.formulaId);
  const toFormula = project.formulas.find((f) => f.id === to.formulaId);
  // A file may refer to a formula that is not in it (dangling-ref): the pairs cannot be edited.
  const alive = relationAlive(project, relation);
  const lock = relationLock(project, relation);
  // Nor can a relation with a brace, a shape or a line on a side, which a saved project may hold
  // (`relation-kind`, audit A1-02): it plays as it is, and its Delete stays.
  const piece = onePieceRelation(project, relation);
  const range = windowRange(from, to);
  const lo = range ? range.start - to.start : -Infinity;
  const hi = range ? range.end - to.start : Infinity;
  const issues = relationIssues(project, relationId);

  /** Offset and Duration: where the window may go (`clampWindow`), as a drag of its band.
   * `wanted` gets the relation and its target clip to plan with: a field keeps the focus when the
   * button goes down on the band, so its Enter can come during a drag of it, and the edit goes to
   * the window that drag leaves (`history.cancelForeignGesture`), not to the one drawn here. */
  const setWindow = (
    edit: WindowEdit,
    wanted: (now: { relation: Relation; to: Clip }) => { start: number; end: number },
  ) => {
    history.cancelForeignGesture();
    const live = useProjectStore.getState().project;
    const current = live.relations.find((r) => r.id === relationId);
    const target = live.clips.find((c) => c.id === current?.toClipId);
    if (!current || !target) return;
    const spec = clampWindow(live, relationId, wanted({ relation: current, to: target }), edit);
    if (spec) setRelationWindow(relationId, spec);
  };

  const edit = (recipe: (r: Relation) => void) =>
    editRelation(relationId, (r) => {
      recipe(r);
      const current = useProjectStore.getState().project;
      const a = current.clips.find((c) => c.id === r.fromClipId);
      const b = current.clips.find((c) => c.id === r.toClipId);
      const fitted = a && b ? fitWindow(r, a, b) : null;
      if (fitted) {
        r.offset = fitted.offset;
        r.duration = fitted.duration;
      }
    });

  return (
    <div className="an-clip" data-testid="relation-properties">
      {lock && (
        <p className="an-notice an-locked" data-testid="relation-locked">
          {lock}
        </p>
      )}
      <fieldset className="an-fieldset" disabled={!!lock}>
        <PropertiesHeader
          context={relationContext(project, relation)}
          color={fromFormula?.tag.color}
          titleTestId="relation-title"
          title={`${fromFormula?.name ?? '?'} → ${toFormula?.name ?? '?'}`}
        >
          <button
            type="button"
            className="an-small-button"
            data-testid="relation-delete"
            onClick={() => {
              if (removeRelation(relationId)) select({ kind: 'none' });
            }}
          >
            Delete
          </button>
        </PropertiesHeader>

        <Section
          title="Pairs"
          testId="relation-pairs-section"
          tone="relations"
          actions={
            <>
              <button
                type="button"
                className="an-small-button"
                title="Every relation connected to these clips, in one diagram"
                data-testid="relation-show-related"
                onClick={() => openRelationChain(from.id)}
              >
                All related…
              </button>
              <button
                type="button"
                className="an-small-button an-accent-button"
                data-testid="relation-edit-pairs"
                disabled={!alive || !!piece}
                title={
                  piece ?? (alive ? undefined : 'A formula of this relation no longer exists.')
                }
                onClick={() => openRelationEditor({ kind: 'edit', relationId })}
              >
                Edit pairs…
              </button>
            </>
          }
        >
          <RelationDiagram
            diagram={buildRelationDiagram(project, relationId)}
            resolved={resolved}
            selectedRelationId={relationId}
            onSelectRelation={(id) => select({ kind: 'relation', id })}
            label="Pairs of the selected relation"
          />
          {!alive && (
            <p className="an-hint" data-testid="relation-missing-formula">
              A formula of this relation no longer exists (the file refers to one that is not in the
              project): its pairs cannot be edited. Delete the relation, or the clip.
            </p>
          )}
          {relation.pairs.length === 0 ? (
            <p className="an-hint">No pairs yet: open the pair editor to link glyphs.</p>
          ) : (
            <ul className="rel-pairs-readonly" data-testid="relation-pairs">
              {relation.pairs.map((pair, i) => (
                <li key={i} data-testid={`relation-pair-${i}`}>
                  <span>
                    {describePair(pair, fromFormula?.snapshot ?? null, toFormula?.snapshot ?? null)}
                    {wearsEditedPath(pair, relation) && (
                      <EditedPathDot testId={`relation-pair-${i}-path-dot`} />
                    )}
                  </span>
                  <span className="rel-row-meta">{styleOfPair(pair, relation)}</span>
                  <span className="rel-row-meta" data-testid={`relation-pair-${i}-path`}>
                    {pathOfPair(pair, relation)}
                  </span>
                  <button
                    type="button"
                    className="an-small-button rel-row-button"
                    data-testid={`relation-pair-${i}-edit-path`}
                    disabled={!alive || !!piece}
                    title={piece ?? "Shape the curve this pair's glyphs follow, in the preview"}
                    onClick={() =>
                      usePathEdit
                        .getState()
                        .open({ origin: { kind: 'relation', relationId }, index: i }, pair)
                    }
                  >
                    Edit path…
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Timing and style" testId="relation-settings" tone="timing">
          <div className="an-row">
            <NumberField
              label="Offset"
              testId="relation-offset"
              title={piece ?? 'Start of the window, relative to the start of the target clip'}
              disabled={!!piece}
              value={relation.offset}
              min={lo}
              max={Math.max(lo, hi - relation.duration)}
              suffix="s"
              onCommit={(v) =>
                setWindow('move', (now) => ({
                  start: now.to.start + v,
                  end: now.to.start + v + now.relation.duration,
                }))
              }
            />
            <NumberField
              label="Duration"
              testId="relation-duration"
              title={piece ?? undefined}
              disabled={!!piece}
              value={relation.duration}
              min={MIN_WINDOW}
              max={Math.max(MIN_WINDOW, hi - relation.offset)}
              suffix="s"
              onCommit={(v) =>
                setWindow('end', (now) => ({
                  start: now.to.start + now.relation.offset,
                  end: now.to.start + now.relation.offset + v,
                }))
              }
            />
          </div>
          <div className="an-row">
            <SelectField
              label="Easing"
              testId="relation-easing"
              title={piece ?? undefined}
              disabled={!!piece}
              value={relation.easing}
              options={EASING_CHOICES}
              onChange={(easing) => edit((r) => void (r.easing = easing))}
            />
            <SelectField
              label="Default style"
              testId="relation-style"
              title={piece ?? undefined}
              disabled={!!piece}
              value={relation.style}
              options={STYLE_OPTIONS}
              onChange={(style: RelationStyle) => {
                // A style that would give the project an error is refused, as the relation editor
                // refuses it (audit A3-04).
                const outcome = setRelationStyle(relationId, style);
                if (!outcome.ok) {
                  notify({
                    kind: 'warning',
                    title: 'Default style not changed',
                    message: outcome.reason,
                  });
                }
              }}
            />
            <NumberField
              label="Path arc"
              testId="relation-path-arc"
              title={piece ?? undefined}
              disabled={!!piece}
              value={relation.pathArc}
              min={-PATH_ARC_LIMIT}
              max={PATH_ARC_LIMIT}
              step={5}
              suffix="°"
              onCommit={(v) => edit((r) => void (r.pathArc = v))}
            />
          </div>
        </Section>

        <IssuesSection
          issues={issues}
          testId="relation-issues-section"
          listTestId="relation-issues"
        />
      </fieldset>
    </div>
  );
}
