/* How long the track headers are along the timeline. Horizontal, they are a column of
 * `HEADER_WIDTH` at the start of the rows. Drawn vertical (Zen mode, D182) they are the top of the
 * columns, a band `VERTICAL_HEADER_WIDTH` high: a track is narrow there, so its name and its
 * buttons stand in short rows, and time gets the room. */
import { HEADER_WIDTH, VERTICAL_HEADER_WIDTH } from './layout';
import { useTimelineStore } from './timelineStore';

/** The headers' length now, for what is worked out when something happens. */
export function headerWidth(): number {
  return useTimelineStore.getState().vertical ? VERTICAL_HEADER_WIDTH : HEADER_WIDTH;
}

/** The headers' length, for what is drawn with it: it draws again when the timeline turns. */
export function useHeaderWidth(): number {
  return useTimelineStore((state) => state.vertical) ? VERTICAL_HEADER_WIDTH : HEADER_WIDTH;
}
