/* The timeline's region as it is drawn (D180, `region.ts`): on the ruler, a band between two
 * marks — the start a green «[», the end a red «]» —, each of which is dragged to move that end
 * (`useRegionGestures`); over the tracks, a faint band between two thin lines of the same
 * colours. The band lets every press through: the ruler under it still moves the playhead, and
 * the clips under it are still clicked. A mark is grabbed by its upper part alone (the
 * stylesheet's): the foot of the ruler, where the playhead has its head, stays the playhead's
 * even when the two are at the same time — as they are right after I or O, the marks' keyboard. */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { RULER_HEIGHT } from './layout';
import { regionLabel, type RegionEdge } from './region';
import { useTimelineStore } from './timelineStore';
import { useHeaderWidth } from './headerWidth';
import { keysText } from '../platform';

/** The two marks' shapes, 8 px wide and as tall as the ruler: a bracket open towards the inside
 * of the region. */
const STEM = RULER_HEIGHT - 6;
const BRACKET: Record<RegionEdge, string> = {
  start: `M0 0h8v3H2.5v${STEM}H8v3H0z`,
  end: `M8 0H0v3h5.5v${STEM}H0v3h8z`,
};

const EDGE_NAME: Record<RegionEdge, string> = { start: 'Start', end: 'End' };

interface RegionOnRulerProps {
  /** A press on one of the two marks. */
  onEdgeDown(event: ReactPointerEvent, edge: RegionEdge): void;
}

/** The region in the ruler (a child of `.tl-ruler`, whose left edge is time 0). */
export function RegionOnRuler({ onEdgeDown }: RegionOnRulerProps) {
  const region = useTimelineStore((s) => s.region);
  const px = useTimelineStore((s) => s.pxPerSecond);
  if (!region) return null;
  const label = `Region ${regionLabel(region)}: what is created next takes it — an animation block, a relation, a formula brought to the timeline`;
  return (
    <div
      className="tl-region"
      role="img"
      aria-label={label}
      data-testid="timeline-region"
      data-start={region.start}
      data-end={region.end}
      style={{ left: region.start * px, width: (region.end - region.start) * px }}
    >
      {(['start', 'end'] as const).map((edge) => (
        <div
          key={edge}
          className={`tl-region-edge is-${edge}`}
          data-testid={`timeline-region-${edge}`}
          title={keysText(
            `${EDGE_NAME[edge]} of the region (${region[edge].toFixed(2)} s): drag to move it · Shift: no snapping · Ctrl/⌘: tick by tick · Esc removes the region`,
          )}
          onPointerDown={(event) => onEdgeDown(event, edge)}
        >
          <svg
            viewBox={`0 0 8 ${RULER_HEIGHT}`}
            height={RULER_HEIGHT}
            aria-hidden="true"
            focusable="false"
          >
            <path d={BRACKET[edge]} />
          </svg>
        </div>
      ))}
    </div>
  );
}

/** The region over the tracks (a child of `.tl-content`, beside the playhead's line). */
export function RegionBand() {
  const region = useTimelineStore((s) => s.region);
  const px = useTimelineStore((s) => s.pxPerSecond);
  const header = useHeaderWidth();
  if (!region) return null;
  return (
    <div
      className="tl-region-band"
      aria-hidden="true"
      data-testid="timeline-region-band"
      style={{
        left: header + region.start * px,
        width: (region.end - region.start) * px,
        top: RULER_HEIGHT,
      }}
    />
  );
}
