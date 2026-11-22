import { clearSelectionOnBackground } from '../background';
import { PanelFrame } from '../PanelFrame';
import { Timeline } from './Timeline';
import './timeline.css';

/** What a press on the timeline acts on (the rest is empty space). */
const TIMELINE_ITEMS =
  '.tl-clip, .tl-ruler, .tl-header, .tl-rel-window, .tl-rel-arrow-hit, .tl-link-port';

export function TimelinePanel() {
  return (
    <PanelFrame
      title="Timeline"
      icon="tracks"
      testId="panel-timeline"
      fold="timeline"
      bodyClassName="timeline-body"
      onPointerDown={(event) => clearSelectionOnBackground(event, TIMELINE_ITEMS)}
    >
      <Timeline />
    </PanelFrame>
  );
}
