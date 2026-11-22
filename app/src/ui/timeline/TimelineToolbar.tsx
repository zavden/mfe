/* The timeline's toolbar: add a track, snapping and the Slides mode (D200), and in the middle of
 * the bar the slider that moves the view along the timeline (TimelineSlider.tsx) with the zoom
 * around it — out and in before it, and after it the key that puts the whole timeline in view,
 * where the slider's thumb fills its bar, the zoom's readout and dt between the keys that set one
 * of one's own (D181). Its buttons keep the focus where it is, so that Space and the arrow keys
 * keep controlling playback. */
import { useEffect, useState, type RefObject } from 'react';
import { createTrack, createAudioTrack } from '../../model';
import { useProjectStore } from '../../store';
import { keepFocus } from '../focus';
import { keyHint, keysText } from '../platform';
import { toggleSlides } from '../slides/slideActions';
import { slidesOffBlocker } from '../slides/slideOps';
import { newAudioTrackName, newTrackName } from './clipOps';
import { Icon } from './icons';
import {
  MAX_OWN_DT,
  MIN_OWN_DT,
  ownDtLabel,
  rulerScale,
  steppedDt,
  tickLabel,
  wholeZoom,
} from './ruler';
import { TimelineSlider } from './TimelineSlider';
import { useTimelineStore } from './timelineStore';
import { useHeaderWidth } from './headerWidth';

/** What dt is, said by its readout: the zoom's own, or one's own (D181). */
const DT_TITLE =
  'The time between two small ticks of the ruler: the step clips snap to, and the playhead’s while it is dragged with Ctrl/⌘ held';
const ZOOM_DT_TITLE = `${DT_TITLE}. This one is the zoom’s own: − and + set one of your own`;
const OWN_DT_TITLE = `${DT_TITLE}. This one is your own, set with − and +: zooming puts it back to automatic, the zoom’s own`;

interface TimelineToolbarProps {
  onZoomBy(factor: number): void;
  /** Put the whole timeline in view. */
  onShowAll(): void;
  /** The seconds the timeline lays out (`timelineExtent`). */
  extent: number;
  /** The timeline's scrolling element, which the slider moves, and its id. */
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollId: string;
}

/** How wide the timeline's view is, kept as it is resized. */
function useViewWidth(scrollRef: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const read = () => setWidth(element.clientWidth);
    read();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [scrollRef]);
  return width;
}

export function TimelineToolbar({
  onZoomBy,
  onShowAll,
  extent,
  scrollRef,
  scrollId,
}: TimelineToolbarProps) {
  const update = useProjectStore((s) => s.update);
  const px = useTimelineStore((s) => s.pxPerSecond);
  const ownDt = useTimelineStore((s) => s.ownDt);
  const setOwnDt = useTimelineStore((s) => s.setOwnDt);
  const fps = useProjectStore((s) => s.project.meta.fps);
  const snap = useTimelineStore((s) => s.snap);
  const setSnap = useTimelineStore((s) => s.setSnap);
  const slides = useProjectStore((s) => s.project.slides);
  // What holds the Slides mode on, when something does: its button then turns nothing off.
  const slidesHeld = slides ? slidesOffBlocker({ slides }) : null;
  // dt, one's own or else the zoom's, and what − and + would make it (null: nothing).
  const dt = ownDt ?? rulerScale(px, fps).minor;
  const shorter = steppedDt(dt, -1);
  const longer = steppedDt(dt, 1);
  // Whether the zoom is the one that shows the whole timeline, nothing more and nothing less:
  // its key has nothing to do then.
  const width = useViewWidth(scrollRef);
  const header = useHeaderWidth();
  const whole = wholeZoom(extent, width - header);
  const allInView = width > header && Math.abs(px - whole) <= whole * 1e-6;
  // Groups between thin lines: add a track (the plain button with an edge, then audio), the Snap
  // toggle and the Slides mode's. Then the slider with the zoom around it, in the room left.
  return (
    <div className="tl-toolbar">
      <div className="tl-tools">
        <button
          type="button"
          className="btn tl-tool-add"
          data-testid="timeline-add-track"
          title="Add a track on top (in front of the others)"
          onMouseDown={keepFocus}
          onClick={() =>
            update((d) => {
              d.tracks.unshift(createTrack(newTrackName(d.tracks)));
            })
          }
        >
          <Icon name="plus" /> Track
        </button>
        <span className="tl-tool-sep" aria-hidden="true" />
        <button
          type="button"
          className="tl-tool"
          data-testid="timeline-add-audio-track"
          title="Add an audio track"
          onMouseDown={keepFocus}
          onClick={() =>
            update((draft) => {
              draft.tracks.push(createAudioTrack(newAudioTrackName(draft.tracks)));
            })
          }
        >
          <Icon name="waveform" /> Audio
        </button>
        <span className="tl-tool-sep" aria-hidden="true" />
        <button
          type="button"
          className={`tl-tool tl-toggle${snap ? ' is-on' : ''}`}
          data-testid="timeline-snap"
          aria-pressed={snap}
          title={keysText(
            'Snap to the playhead, clip edges and the time grid (hold Shift to suspend)',
          )}
          onMouseDown={keepFocus}
          onClick={() => setSnap(!snap)}
        >
          <Icon name="magnet" /> Snap
        </button>
        <span className="tl-tool-sep" aria-hidden="true" />
        <button
          type="button"
          className={`tl-tool tl-tool-icon tl-toggle${slides ? ' is-on' : ''}${slidesHeld ? ' is-held' : ''}`}
          data-testid="timeline-slides"
          aria-label="Slides"
          aria-pressed={slides !== undefined}
          // Not disabled while a pause or a comment holds it on: the button says why, in its
          // tooltip and in the notice a press gives (`toggleSlides`).
          aria-disabled={slidesHeld !== null || undefined}
          title={
            slidesHeld ??
            'Slides mode (View ▸ Slides): pauses and comments on the ruler, where nothing animates — for the exports that stop or carry words'
          }
          onMouseDown={keepFocus}
          onClick={() => toggleSlides()}
        >
          <Icon name="slides" />
        </button>
      </div>
      <div className="tl-slider-cell">
        {/* The slider's row. Its two sides have widths of the stylesheet's, which a box after
            the row makes up for, so that the bar itself stays in the middle of the toolbar. */}
        <div className="tl-slider-row" role="group" aria-label="Timeline zoom and position">
          <div className="tl-slider-side is-before">
            <button
              type="button"
              className="tl-tool tl-tool-icon"
              data-testid="timeline-zoom-out"
              title={`Zoom out (${keyHint('Mod + wheel')})`}
              aria-label="Zoom out"
              onMouseDown={keepFocus}
              onClick={() => onZoomBy(1 / 1.35)}
            >
              <Icon name="minus" />
            </button>
            <button
              type="button"
              className="tl-tool tl-tool-icon"
              data-testid="timeline-zoom-in"
              title={`Zoom in (${keyHint('Mod + wheel')})`}
              aria-label="Zoom in"
              onMouseDown={keepFocus}
              onClick={() => onZoomBy(1.35)}
            >
              <Icon name="plus" />
            </button>
          </div>
          <TimelineSlider scrollRef={scrollRef} controls={scrollId} />
          <div className="tl-slider-side is-after">
            <button
              type="button"
              className="tl-tool tl-tool-icon"
              data-testid="timeline-fit"
              title={
                allInView
                  ? 'The whole timeline is in view'
                  : 'Show the whole timeline: zoom out until nothing is left to scroll'
              }
              aria-label="Show the whole timeline"
              disabled={allInView}
              onMouseDown={keepFocus}
              onClick={onShowAll}
            >
              <Icon name="fit" />
            </button>
            <span className="tl-zoom-readout" data-testid="timeline-zoom">
              {px < 1 ? px.toFixed(2) : Math.round(px)} px/s
            </span>
            {/* The time between two small ticks of the ruler, which is also the step the
                timeline snaps to: the zoom's own, or one of one's own that − and + set a tenth
                of a second away without zooming, until the zoom changes (D181). */}
            <span className="tl-dt" role="group" aria-label="Time step (dt)">
              <button
                type="button"
                className="tl-tool tl-tool-icon tl-dt-key"
                data-testid="timeline-dt-less"
                aria-label="Shorter dt"
                title={
                  shorter === null
                    ? `No shorter dt: these keys stop at ${ownDtLabel(MIN_OWN_DT)}`
                    : `Shorter dt: ${ownDtLabel(shorter)}, at the same zoom`
                }
                disabled={shorter === null}
                onMouseDown={keepFocus}
                onClick={() => {
                  if (shorter !== null) setOwnDt(shorter);
                }}
              >
                <Icon name="minus" />
              </button>
              <span
                className={`tl-zoom-readout tl-dt-readout${ownDt === null ? '' : ' is-own'}`}
                data-testid="timeline-dt"
                data-own={ownDt === null ? undefined : 'true'}
                title={keysText(ownDt === null ? ZOOM_DT_TITLE : OWN_DT_TITLE)}
              >
                dt {ownDt === null ? tickLabel(dt, fps) : ownDtLabel(ownDt)}
              </span>
              <button
                type="button"
                className="tl-tool tl-tool-icon tl-dt-key"
                data-testid="timeline-dt-more"
                aria-label="Longer dt"
                title={
                  longer === null
                    ? `No longer dt: these keys stop at ${ownDtLabel(MAX_OWN_DT)}`
                    : `Longer dt: ${ownDtLabel(longer)}, at the same zoom`
                }
                disabled={longer === null}
                onMouseDown={keepFocus}
                onClick={() => {
                  if (longer !== null) setOwnDt(longer);
                }}
              >
                <Icon name="plus" />
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
