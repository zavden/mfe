/* The "related relations" dialog: every relation connected to a clip, as one chain diagram
 * (diagramLayout `buildChainDiagram`). Clicking an arrow selects its relation and keeps the
 * dialog open; the clips of the current selection are emphasised. Rendered into document.body,
 * like the relation editor, so no panel's layout can clip it. */
import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ClipId } from '../../model';
import { useProjectStore, useRenderStore, useUiStore } from '../../store';
import { Modal } from '../project/Modal';
import { buildChainDiagram } from './diagramLayout';
import { RelationDiagram } from './RelationDiagram';
import { useRelationChain } from './relationChainStore';

function RelationChainDialog({ clipId, onClose }: { clipId: ClipId; onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const resolved = useRenderStore((s) => s.resolved);
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const selectedRelation =
    selection.kind === 'relation' ? project.relations.find((r) => r.id === selection.id) : null;
  const current = useMemo(
    () =>
      new Set(
        selection.kind === 'clips'
          ? selection.ids
          : selectedRelation
            ? [selectedRelation.fromClipId, selectedRelation.toClipId]
            : [clipId],
      ),
    [selection, selectedRelation, clipId],
  );
  const diagram = useMemo(
    () => buildChainDiagram(project, clipId, current),
    [project, clipId, current],
  );
  const relations = new Set(diagram.edges.map((e) => e.relationId)).size;

  return (
    <Modal
      title="Related relations"
      onClose={onClose}
      testId="relation-chain"
      width="min(1180px, calc(100vw - 32px))"
      resizable
      footer={
        <button type="button" className="btn" onClick={onClose} data-testid="relation-chain-done">
          Close
        </button>
      }
    >
      <p className="an-hint rel-chain-hint" data-testid="relation-chain-summary">
        {diagram.blocks.length} clips · {relations} relation{relations === 1 ? '' : 's'}, in the
        order they play. Click an arrow to select its relation.
      </p>
      <div className="rel-chain-scroll">
        <RelationDiagram
          diagram={diagram}
          resolved={resolved}
          selectedRelationId={selectedRelation?.id ?? null}
          onSelectRelation={(id) => select({ kind: 'relation', id })}
          label="Every relation connected to the selected clip"
          size="natural"
          testId="relation-chain-diagram"
        />
      </div>
    </Modal>
  );
}

export function RelationChainHost() {
  const clipId = useRelationChain((s) => s.clipId);
  const close = useRelationChain((s) => s.close);
  if (!clipId) return null;
  return createPortal(<RelationChainDialog clipId={clipId} onClose={close} />, document.body);
}
