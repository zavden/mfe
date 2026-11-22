/* The playhead: a cap in the ruler and a line over the tracks. They subscribe to the time on
 * their own so that playback does not re-render the clips. */
import { useEffect, type RefObject } from 'react';
import { useUiStore } from '../../store';
import { RULER_HEIGHT } from './layout';
import { useTimelineStore } from './timelineStore';
import { useHeaderWidth } from './headerWidth';

export function PlayheadCap() {
  const time = useUiStore((s) => s.time);
  const px = useTimelineStore((s) => s.pxPerSecond);
  return (
    <div
      className="tl-playhead-cap"
      data-testid="timeline-playhead"
      data-time={time}
      style={{ left: time * px }}
    />
  );
}

export function PlayheadLine({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const time = useUiStore((s) => s.time);
  const playing = useUiStore((s) => s.playing);
  const px = useTimelineStore((s) => s.pxPerSecond);
  const header = useHeaderWidth();
  const x = header + time * px;

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const visibleLeft = el.scrollLeft + header;
    const visibleRight = el.scrollLeft + el.clientWidth;
    if (x > visibleRight - 24 || x < visibleLeft) {
      el.scrollLeft = Math.max(0, x - header - 80);
    }
  }, [x, header, playing, scrollRef]);

  return <div className="tl-playhead-line" style={{ left: x, top: RULER_HEIGHT }} />;
}
