/* Relations on the timeline (images/gui-2x.png): an arrow from the source clip to the target clip
 * and the relation window drawn on both clips. The relations of the selected clips (or the
 * selected relation) are drawn in full, the others faintly. Clicking an arrow or a window selects
 * the relation; double-clicking opens it in the relation editor. The overlay sits over the
 * lanes, aligned with them (time 0 is its left edge). The bands of a clip whose windows overlap
 * share its lane in stripes (`relationBands.ts`), so that each one can be seen and pressed. A
 * relation with issues has its bands' edges and its arrow in the danger red when one of them is
 * an error, in the warning colour when they are all warnings (D177). */
import type React from 'react';
import { clipWindow, relationWindow, type Project, type Relation } from '../../model';
import { useUiStore, type Selection } from '../../store';
import { issueMark, relationSeverities } from '../animations/issues';
import { openRelationEditor } from '../relations/relationEditorStore';
import { relationTitle } from '../relations/relationOps';
import { bandKey, bandSlots } from './relationBands';
import { startWindowGesture } from './relationGestures';
import { useTimelineStore } from './timelineStore';
import { CLIP_INSET } from './layout';
import type { TrackRow, TracksLayout } from './trackLayout';

interface Props {
  project: Project;
  layout: TracksLayout;
  pxPerSecond: number;
  selection: Selection;
  /** A right-click on a window band: the relation's menu, at a screen position. */
  onMenu(relationId: string, x: number, y: number): void;
}

function isActive(relation: Relation, selection: Selection): boolean {
  if (selection.kind === 'relation') return selection.id === relation.id;
  if (selection.kind === 'clips') {
    return selection.ids.includes(relation.fromClipId) || selection.ids.includes(relation.toClipId);
  }
  return false;
}

/** How far above the band its drag readout sits (px). */
const READOUT_GAP = 20;

export function TimelineRelations({ project, layout, pxPerSecond: px, selection, onMenu }: Props) {
  const select = useUiStore((s) => s.select);
  const dragging = useTimelineStore((s) => s.windowDrag);
  if (project.relations.length === 0) return null;
  const clips = new Map(project.clips.map((c) => [c.id, c]));
  const formulaName = (clipId: string) =>
    project.formulas.find((f) => f.id === clips.get(clipId)?.formulaId)?.name ?? '?';
  /** "Relation f1 → f2", or "Relation 2 of 3, f1 → f2" among several of the same two clips. */
  const names = (r: Relation) => {
    const title = relationTitle(project, r);
    const clips = `${formulaName(r.fromClipId)} → ${formulaName(r.toClipId)}`;
    return title === 'Relation' ? `Relation ${clips}` : `${title}, ${clips}`;
  };
  const severities = relationSeverities(project);
  const slots = bandSlots(project);

  return (
    <div className="tl-relations" data-testid="timeline-relations">
      {project.relations.map((relation) => {
        const from = clips.get(relation.fromClipId);
        const to = clips.get(relation.toClipId);
        if (!from || !to) return null;
        const fromRow = layout.rowOf(from.trackId);
        const toRow = layout.rowOf(to.trackId);
        if (!fromRow || !toRow) return null;
        const window = relationWindow(relation, to);
        const active = isActive(relation, selection);
        const selected = selection.kind === 'relation' && selection.id === relation.id;
        const mark = issueMark(severities.get(relation.id));
        const left = window.start * px;
        const width = Math.max(6, (window.end - window.start) * px);
        const bandTop = (row: TrackRow) => row.top + row.height - CLIP_INSET - row.lane;
        // Where the band lies in the lane of a clip: all of it, or its stripe among the bands
        // of that clip that overlap it in time.
        const bandBox = (row: TrackRow, clipId: string) => {
          const { slot, of } = slots.get(bandKey(relation.id, clipId)) ?? { slot: 0, of: 1 };
          const height = row.lane / of;
          return { top: bandTop(row) + slot * height, height };
        };

        // The arrow leaves the middle of the source clip before the window and lands on the
        // facing edge of the target clip at the start of its window.
        const down = toRow.index > fromRow.index;
        const fromX = Math.min(
          Math.max(left - 36, clipWindow(from).start * px + 10),
          clipWindow(from).end * px - 10,
        );
        const toX = left + Math.min(width / 2, 14);
        const y0 = fromRow.top + fromRow.height / 2;
        const y1 = down ? toRow.top + CLIP_INSET : toRow.top + toRow.height - CLIP_INSET;
        const mid = (y0 + y1) / 2;
        const d = `M${fromX} ${y0} C${fromX} ${mid} ${toX} ${mid} ${toX} ${y1}`;
        const head = down
          ? `M${toX - 5} ${y1 - 8} L${toX} ${y1} L${toX + 5} ${y1 - 8} Z`
          : `M${toX - 5} ${y1 + 8} L${toX} ${y1} L${toX + 5} ${y1 + 8} Z`;
        const onSelect = () => select({ kind: 'relation', id: relation.id });
        const onContextMenu = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect();
          onMenu(relation.id, e.clientX, e.clientY);
        };
        const edges = (id: string) =>
          (['start', 'end'] as const).map((edge) => (
            <span
              key={edge}
              className={`tl-rel-edge is-${edge}`}
              data-testid={`relation-window-${id}-${edge}`}
              onPointerDown={(e) => startWindowGesture(e, id, edge)}
            />
          ));
        const onOpen = () => openRelationEditor({ kind: 'edit', relationId: relation.id });
        const classes = (base: string) =>
          `${base}${selected ? ' is-selected' : ''}${mark ? ` ${mark}` : ''}${active ? '' : ' is-faint'}`;

        return (
          <div
            key={relation.id}
            // The selected relation is drawn over the others: two relations of the same two
            // clips can have the same window, and their arrows then run along each other.
            className={selected ? 'tl-rel is-selected' : 'tl-rel'}
            data-testid={`timeline-relation-${relation.id}`}
            data-active={active}
          >
            <div
              className={classes('tl-rel-window')}
              data-testid={`relation-window-${relation.id}`}
              style={{ left, width, ...bandBox(toRow, to.id) }}
              title={`${names(relation)}: window ${window.start.toFixed(2)}–${window.end.toFixed(2)} s (drag to move, its edges to resize, double-click to edit)`}
              onPointerDown={(e) => startWindowGesture(e, relation.id, 'move')}
              onClick={onSelect}
              onDoubleClick={onOpen}
              onContextMenu={onContextMenu}
            >
              {edges(relation.id)}
            </div>
            {dragging === relation.id && (
              <span
                className="tl-rel-readout"
                data-testid="relation-window-readout"
                style={{
                  left,
                  top: bandTop(toRow) - READOUT_GAP,
                  // For the vertical timeline, where it stands beside the band (timeline.css).
                  ['--rel-readout-gap' as string]: `${READOUT_GAP}px`,
                  ['--rel-lane' as string]: `${toRow.lane}px`,
                }}
              >
                {window.start.toFixed(2)} → {window.end.toFixed(2)} s ·{' '}
                {(window.end - window.start).toFixed(2)} s
              </span>
            )}
            <div
              className={classes('tl-rel-window is-source')}
              data-testid={`relation-source-window-${relation.id}`}
              style={{ left, width, ...bandBox(fromRow, from.id) }}
              title={`${names(relation)} (drag to move, its edges to resize, double-click to edit)`}
              onPointerDown={(e) => startWindowGesture(e, relation.id, 'move')}
              onClick={onSelect}
              onDoubleClick={onOpen}
              onContextMenu={onContextMenu}
            >
              {edges(relation.id)}
            </div>
            <svg className="tl-rel-svg" width="100%" height="100%">
              <g className={classes('tl-rel-arrow-group')}>
                <path className={classes('tl-rel-arrow')} d={d} />
                <path className="tl-rel-head" d={head} />
                <path
                  className="tl-rel-arrow-hit"
                  data-testid={`relation-arrow-${relation.id}`}
                  d={d}
                  onClick={onSelect}
                  onDoubleClick={onOpen}
                >
                  <title>{names(relation)}</title>
                </path>
              </g>
            </svg>
          </div>
        );
      })}
    </div>
  );
}
