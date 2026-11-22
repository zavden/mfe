/* "Edit path": choose which pair of a relation to shape in the preview, by eye — the relation's
 * diagram (its two formulas and their links) beside one row per pair with a small picture of the
 * curve its glyphs follow (the pair's own path, else the relation's arc, else the chord), its
 * style and what it follows, and the mark of an edited path (`EditedPathDot`) on a pair whose path
 * was shaped. Hovering a row lights its link and the other way round; a click on
 * either closes the dialog and opens the Edit-path mode on that pair. Closes by itself when the
 * relation goes. */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RelationId } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { usePathEdit } from '../preview/pathEdit';
import { Modal } from '../project/Modal';
import { buildRelationDiagram } from './diagramLayout';
import { EditedPathDot } from './EditedPathDot';
import { usePathPicker } from './pathPickerStore';
import { pathPreviewPoints } from './pathPreview';
import { RelationDiagram } from './RelationDiagram';
import {
  describePair,
  wearsEditedPath,
  pathOfPair,
  relationLock,
  relationNumber,
  styleOfPair,
} from './relationOps';
import { styleLabel } from './styleOptions';

interface PathPickerDialogProps {
  relationId: RelationId;
  onClose(): void;
}

/** The preview's box: the chord runs from x = 8 to x = 72 at y = 26, up is a positive v. */
const PREVIEW = { width: 80, height: 52, x0: 8, x1: 72, y: 26 };

function PathPreview({ points }: { points: [number, number][] }) {
  const scale = PREVIEW.x1 - PREVIEW.x0;
  const at = ([u, v]: [number, number]) =>
    `${(PREVIEW.x0 + u * scale).toFixed(1)} ${(PREVIEW.y - v * scale).toFixed(1)}`;
  return (
    <svg
      className="pp-preview"
      viewBox={`0 0 ${PREVIEW.width} ${PREVIEW.height}`}
      aria-hidden="true"
      focusable="false"
    >
      <path className="pp-chord" d={`M${PREVIEW.x0} ${PREVIEW.y} L${PREVIEW.x1} ${PREVIEW.y}`} />
      <path className="pp-curve" d={`M${points.map(at).join(' L')}`} />
      <circle className="pp-end" cx={PREVIEW.x0} cy={PREVIEW.y} r={2.5} />
      <circle className="pp-end" cx={PREVIEW.x1} cy={PREVIEW.y} r={2.5} />
    </svg>
  );
}

export function PathPickerDialog({ relationId, onClose }: PathPickerDialogProps) {
  const project = useProjectStore((s) => s.project);
  const resolved = useRenderStore((s) => s.resolved);
  const relation = project.relations.find((r) => r.id === relationId);
  const diagram = useMemo(() => buildRelationDiagram(project, relationId), [project, relationId]);
  const [hover, setHover] = useState<number | null>(null);
  // The relation was undone or deleted while the dialog was open.
  useEffect(() => {
    if (!relation) onClose();
  }, [relation, onClose]);
  if (!relation) return null;
  const formulaOf = (clipId: string) => {
    const clip = project.clips.find((c) => c.id === clipId);
    return project.formulas.find((f) => f.id === clip?.formulaId) ?? null;
  };
  const lock = relationLock(project, relation);
  const from = formulaOf(relation.fromClipId);
  // Which of the relations of its two clips it is, when they have several.
  const number = relationNumber(project, relation);
  const to = formulaOf(relation.toClipId);
  const pick = (index: number) => {
    const expectedPair = relation.pairs[index];
    const current = useProjectStore.getState().project;
    const currentRelation = current.relations.find((r) => r.id === relationId);
    if (!currentRelation || relationLock(current, currentRelation)) return;
    onClose();
    usePathEdit.getState().open({ origin: { kind: 'relation', relationId }, index }, expectedPair);
  };
  return (
    <Modal
      title={`Edit path · ${from?.name ?? '?'} → ${to?.name ?? '?'}${number.of > 1 ? ` · ${number.n} of ${number.of}` : ''}`}
      onClose={onClose}
      testId="path-picker"
      width="min(980px, calc(100vw - 32px))"
    >
      <p className="an-hint" data-testid="path-picker-hint">
        Click a pair — in the list or on its link in the diagram — to shape the curve its glyphs
        follow, in the preview. Each row shows that curve: the pair's own path, else the relation's
        arc.
      </p>
      {lock && (
        <p className="an-notice an-locked" data-testid="path-picker-locked">
          {lock}
        </p>
      )}
      <div className="pp-body">
        <div className="pp-diagram">
          <RelationDiagram
            diagram={diagram}
            resolved={resolved}
            selectedRelationId={relationId}
            onSelectRelation={() => {}}
            pickedPair={hover === null ? null : { relationId, pairIndex: hover }}
            onPickPair={(_, index) => pick(index)}
            onHoverPair={(_, index) => setHover(index)}
            label="The relation's pairs: click a link to edit its path"
            testId="path-picker-diagram"
          />
        </div>
        <ul className="pp-list" data-testid="path-picker-list">
          {relation.pairs.map((pair, i) => (
            <li key={i}>
              <button
                type="button"
                className={`pp-row${hover === i ? ' is-hot' : ''}`}
                data-testid={`path-picker-pair-${i}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onClick={() => pick(i)}
                disabled={!!lock}
              >
                <PathPreview points={pathPreviewPoints(pair, relation.pathArc)} />
                <span className="pp-pair">
                  {describePair(pair, from?.snapshot ?? null, to?.snapshot ?? null)}
                  {wearsEditedPath(pair, relation) && (
                    <EditedPathDot testId={`path-picker-pair-${i}-path-dot`} />
                  )}
                </span>
                <span className="pp-meta" data-testid={`path-picker-pair-${i}-meta`}>
                  {styleLabel(styleOfPair(pair, relation))} · {pathOfPair(pair, relation)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

/** Mounts the dialog when something asks for it (`openPathPicker`), into document.body so that
 * no panel's layout can clip it. */
export function PathPickerHost() {
  const relationId = usePathPicker((s) => s.relationId);
  const close = usePathPicker((s) => s.close);
  if (!relationId) return null;
  return createPortal(
    <PathPickerDialog key={relationId} relationId={relationId} onClose={close} />,
    document.body,
  );
}
