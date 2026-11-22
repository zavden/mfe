/* The readout beside the inner edge of a clip's intro or outro while it is dragged (`phaseDrag`
 * in the timeline store, D119): the animation, where it runs and how long it lasts, in seconds
 * of the scene — "GrowFromCenter · 2.00 → 3.20 s · 1.20 s". It sits just above the lower part of
 * the clip, where the edge is grabbed, in the layer of the blocks' readouts. */
import type { Project } from '../../model';
import { animationLabel } from '../animations/catalogue';
import { CLIP_INSET } from './layout';
import { phaseEdge } from './phaseDrag';
import { useTimelineStore } from './timelineStore';
import type { TracksLayout } from './trackLayout';

interface PhaseDragReadoutProps {
  project: Project;
  layout: TracksLayout;
  pxPerSecond: number;
}

export function PhaseDragReadout({ project, layout, pxPerSecond: px }: PhaseDragReadoutProps) {
  const drag = useTimelineStore((s) => s.phaseDrag);
  if (!drag) return null;
  const clip = project.clips.find((c) => c.id === drag.clipId);
  const row = clip ? layout.rowOf(clip.trackId) : undefined;
  if (!clip || !row) return null;
  const spec = clip[drag.phase];
  if (spec.kind === 'none') return null;
  const edge = phaseEdge(clip, drag.phase);
  const start = drag.phase === 'intro' ? clip.start : edge;
  const end = drag.phase === 'intro' ? edge : clip.end;
  return (
    <div className="tl-block-readouts">
      <div
        className={`tl-block-readout tl-phase-readout is-${drag.phase}`}
        data-testid="phase-drag-readout"
        style={{
          left: edge * px,
          // The top of the clip's lower part: the readout stands on it.
          top: row.top + row.height - CLIP_INSET - row.lane,
        }}
      >
        <span data-testid="phase-drag-time">
          {animationLabel(spec.kind)} · {start.toFixed(2)} → {end.toFixed(2)} s ·{' '}
          {spec.duration.toFixed(2)} s
        </span>
      </div>
    </div>
  );
}
