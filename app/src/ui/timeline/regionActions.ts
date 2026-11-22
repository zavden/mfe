/* What the keys of the timeline's region do (D180, `region.ts`): I and O put its start and its
 * end at the playhead, Escape removes it. The stores are read when called; what changed is
 * announced to assistive technology (`ui/announcer.ts`). */
import { sceneDuration } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { announce } from '../announcer';
import { regionLabel, withEndAt, withStartAt, type RegionEdge } from './region';
import { useTimelineStore } from './timelineStore';

/** Put the start (I) or the end (O) of the region at the playhead; the other end stays where it
 * is, or goes where `withStartAt` / `withEndAt` say when there is none to keep. Returns whether
 * there is a region for it (O at the start of the scene marks none). */
export function markRegionEdge(edge: RegionEdge): boolean {
  const { project } = useProjectStore.getState();
  const { fps } = project.meta;
  const { time } = useUiStore.getState();
  const { region, setRegion } = useTimelineStore.getState();
  const next =
    edge === 'start'
      ? withStartAt(region, time, sceneDuration(project), fps)
      : withEndAt(region, time, fps);
  if (!next) {
    announce('No region ends at the start of the scene');
    return false;
  }
  setRegion(next);
  announce(`Region ${regionLabel(next)}`);
  return true;
}

/** Remove the region. Returns whether there was one. */
export function removeRegion(): boolean {
  const { region, setRegion } = useTimelineStore.getState();
  if (!region) return false;
  setRegion(null);
  announce('Region removed');
  return true;
}
