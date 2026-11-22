/* The readout under an animation block while it is dragged (`blockDrag` in the timeline store):
 * its start, end and duration in seconds of the scene, the blocks of its clip it runs alongside
 * ("in parallel with Write · 7–14") and, when the planner holds it back, why ("Stops here: the
 * FadeOut block at 7.00 s animates glyph 3 “=” at the same time."). It sits just under the block's
 * lane, so that it never hides under the ruler, in a layer of its own over the clips (positioned
 * like the state icons: from the header's edge, over the lanes). */
import type { Project } from '../../model';
import { CLIP_INSET } from './layout';
import { parallelText } from './blockDrag';
import { useTimelineStore } from './timelineStore';
import type { TracksLayout } from './trackLayout';

interface BlockDragReadoutProps {
  project: Project;
  layout: TracksLayout;
  pxPerSecond: number;
}

/** Space between the block's lane and its readout (px). */
const GAP = 2;

export function BlockDragReadout({ project, layout, pxPerSecond: px }: BlockDragReadoutProps) {
  const drag = useTimelineStore((s) => s.blockDrag);
  if (!drag) return null;
  const clip = project.clips.find((c) => c.actions.some((a) => a.id === drag.actionId));
  const action = clip?.actions.find((a) => a.id === drag.actionId);
  const row = clip ? layout.rowOf(clip.trackId) : undefined;
  if (!clip || !action || !row) return null;
  const lane = layout.clips.get(clip.id)?.laneOf.get(action.id) ?? 0;
  const start = clip.start + action.start;
  const end = start + action.duration;
  const parallel = parallelText(clip, action);
  return (
    <div className="tl-block-readouts">
      <div
        className={`tl-block-readout${drag.stop ? ' is-stopped' : ''}`}
        data-testid="block-drag-readout"
        style={{
          left: start * px + 1, // inside the clip's border, like the block
          top: row.top + CLIP_INSET + (lane + 1) * row.lane + GAP,
        }}
      >
        <span data-testid="block-drag-time">
          {start.toFixed(2)} → {end.toFixed(2)} s · {action.duration.toFixed(2)} s
        </span>
        {parallel && (
          <span className="tl-block-readout-parallel" data-testid="block-drag-parallel">
            {parallel}
          </span>
        )}
        {drag.stop && (
          <span className="tl-block-readout-stop" data-testid="block-drag-stop">
            Stops here: {drag.stop}
          </span>
        )}
      </div>
    </div>
  );
}
