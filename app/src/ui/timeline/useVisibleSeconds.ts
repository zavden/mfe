/* The stretch of the timeline worth labelling (F8 of the first audit): the ruler draws a label
 * per major tick, and a long project at the closest zoom has tens of thousands of them, so only
 * those around what the scroll container shows are rendered. The band is widened by a viewport
 * on each side and kept until the view leaves it, so a scroll step seldom re-renders the ruler.
 * A container without a width (not laid out, as under jsdom) labels everything. */
import { useEffect, useState, type RefObject } from 'react';
import { bandCovers, labelBand, visibleStretch, type Stretch } from './ruler';
import { headerWidth } from './headerWidth';
import { useTimelineStore } from './timelineStore';

export function useVisibleSeconds(
  scrollRef: RefObject<HTMLDivElement | null>,
  pxPerSecond: number,
  totalSeconds: number,
): Stretch {
  // The headers are another length when the timeline turns (headerWidth.ts): measured again.
  const vertical = useTimelineStore((state) => state.vertical);
  const [band, setBand] = useState<Stretch>({ from: 0, to: totalSeconds });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    /** A scroll keeps the band while the view stays inside it; a new zoom or length (`fresh`)
     * takes the band the view needs now, since the old one is the wrong size for it. */
    const update = (fresh: boolean) => {
      if (el.clientWidth <= 0) {
        setBand((current) =>
          current.from === 0 && current.to === totalSeconds
            ? current
            : { from: 0, to: totalSeconds },
        );
        return;
      }
      const visible = visibleStretch(el.scrollLeft, el.clientWidth, headerWidth(), pxPerSecond);
      setBand((current) =>
        !fresh && bandCovers(current, visible, totalSeconds)
          ? current
          : labelBand(visible, totalSeconds),
      );
    };
    update(true);
    const onScroll = () => update(false);
    el.addEventListener('scroll', onScroll, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => update(false));
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, [scrollRef, pxPerSecond, totalSeconds, vertical]);
  return band;
}
