/* The clock of a preview that loops over a span of the scene (the relation editor's previews,
 * D156 and D157): it plays from where its playhead is, looping, while `active`; a bar moves the
 * playhead and stops it. The playhead stays where it was while the preview is not shown. */
import { useEffect, useRef, useState } from 'react';
import { loopTime, playedSeconds, type TimeSpan } from '../animations/blockPreview';

const within = (t: number, span: TimeSpan) => t >= span.start && t <= span.end;

export interface LoopClock {
  playing: boolean;
  setPlaying(playing: boolean): void;
  /** The instant shown: the playhead, held in the span (it moved: back to its start). */
  shown: number;
  /** Put the playhead on an instant. */
  moveTo(time: number): void;
}

export function useLoopClock(active: boolean, span: TimeSpan): LoopClock {
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(span.start);
  const timeRef = useRef(time);
  const moveTo = (t: number) => {
    timeRef.current = t;
    setTime(t);
  };
  // The clock, while it shows and plays: on from where the playhead is (the span's start if the
  // span moved away from it), looping over the span.
  useEffect(() => {
    if (!active || !playing) return;
    const start = within(timeRef.current, span) ? timeRef.current : span.start;
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = loopTime(start - span.start + playedSeconds(now, startedAt), span);
      timeRef.current = t;
      setTime(t);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, playing, span]);
  return { playing, setPlaying, shown: within(time, span) ? time : span.start, moveTo };
}
