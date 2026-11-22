/* The Slides mode on the timeline (D200), while it is on: the ruler tinted by zone — blue-green
 * where a pause may stand, a hatched red-orange where something animates, a thin notch in the
 * pause colour where a zone has no length —, the marks in the upper part of the ruler — a pause a
 * small tag with «‖», a comment a speech bubble — and, down the tracks, a thin line at each pause.
 * A pause that skips its wait (D202) is violet, its tag «‖▸», and a violet line runs along the
 * ruler from it over the stretch it skips, to where the scene goes on.
 * The zones are worked out of the store's project, so they follow every edit as it is made, a
 * drag included. They let every press through: the ruler under them still moves the playhead.
 *
 * A mark takes the upper part of the ruler only: its foot stays the playhead's, as with the
 * region's marks. Hovering it, or reaching it with the keyboard, shows its words at once. A click
 * puts the playhead on it, a drag moves it in its zone (`slideMarkGestures.ts`), its words
 * following it, and a double click writes its words. Each mark is a stop of Tab, with keys of
 * its own (`onMarkKey`). A mark out of place — under an animation, past the end of the scene
 * (a file can bring one, and a drag of a clip shows it live before the guard asks) — or with
 * another warning of the project is drawn in the warning amber, and says why. */
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  markStanding,
  marksInOrder,
  skippedWait,
  type Project,
  type SlideMark,
  type SlideMarkId,
} from '../../model';
import { useProjectStore } from '../../store';
import {
  markClock,
  markLabel,
  markSpread,
  markTitle,
  markWarnings,
  markWords,
  noWaitReason,
  rulerZones,
  skipWords,
} from '../slides/slideOps';
import { arrowOf, timelineVertical } from './axis';
import { RULER_HEIGHT } from './layout';
import { useTimelineStore } from './timelineStore';
import { useHeaderWidth } from './headerWidth';
import { startSlideMarkGesture } from './slideMarkGestures';
import { deleteMark, editMarkWords, focusSlideMark, stepMark } from '../slides/slideActions';
import { isMenuKey } from '../contextMenuKey';
import './slidesTimeline.css';

/** How wide a mark is drawn (px): marks at one instant stand side by side, this far apart. */
const MARK_WIDTH = 13;

/** The zones in the ruler (a child of `.tl-ruler`, whose left edge is time 0), under its ticks. */
export function SlideZonesOnRuler() {
  const project = useProjectStore((s) => s.project);
  const px = useTimelineStore((s) => s.pxPerSecond);
  const zones = useMemo(() => (project.slides ? rulerZones(project) : null), [project]);
  if (!zones) return null;
  return (
    <div className="tl-slide-zones" aria-hidden="true" data-testid="slide-zones">
      {zones.map((zone) => (
        <div
          key={`${zone.kind}-${zone.start}`}
          className={`tl-slide-zone is-${zone.kind}${zone.notch ? ' is-notch' : ''}`}
          data-testid="slide-zone"
          data-kind={zone.kind}
          data-start={zone.start}
          data-end={zone.end}
          style={
            zone.notch
              ? { left: zone.start * px }
              : { left: zone.start * px, width: (zone.end - zone.start) * px }
          }
        />
      ))}
    </div>
  );
}

/** A pause: a tag with «‖», its point on the instant; one that skips its wait has «‖▸». */
function PauseShape({ skip }: { skip: boolean }) {
  return (
    <svg viewBox="0 0 13 15" width="13" height="15" aria-hidden="true" focusable="false">
      <path
        className="tl-slide-mark-shape"
        d="M2.5.75h8a1.75 1.75 0 0 1 1.75 1.75V8a1.75 1.75 0 0 1-1.75 1.75H8.4L6.5 14 4.6 9.75H2.5A1.75 1.75 0 0 1 .75 8V2.5A1.75 1.75 0 0 1 2.5.75z"
      />
      {skip ? (
        <g className="tl-slide-mark-glyph is-skip">
          <path className="is-bars" d="M3 3.1v4.3M5.4 3.1v4.3" />
          <path className="is-arrow" d="M7.3 2.9v4.7l3.2-2.35z" />
        </g>
      ) : (
        <path className="tl-slide-mark-glyph is-bars" d="M4.9 3.1v4.3M8.1 3.1v4.3" />
      )}
    </svg>
  );
}

/** A comment: a speech bubble with three dots, its tail on the instant. */
function CommentShape() {
  return (
    <svg viewBox="0 0 13 15" width="13" height="15" aria-hidden="true" focusable="false">
      <path
        className="tl-slide-mark-shape is-bubble"
        d="M5.25.75h2.5a4.5 4.5 0 0 1 0 9H7.6L6.5 13.8 5.4 9.75h-.15a4.5 4.5 0 0 1 0-9z"
      />
      <g className="tl-slide-mark-glyph is-dots">
        <circle cx="3.9" cy="5.25" r="0.95" />
        <circle cx="6.5" cy="5.25" r="0.95" />
        <circle cx="9.1" cy="5.25" r="0.95" />
      </g>
    </svg>
  );
}

/** What the tooltip of a pause that skips its wait says of it: how long, and where the scene goes
 * on; or that it has nothing to skip there, and why. Null for a mark that keeps its wait. */
function skipLine(project: Project, mark: SlideMark): string | null {
  if (mark.kind !== 'pause' || mark.skipWait !== true) return null;
  const skipped = skippedWait(project, mark);
  if (skipped) {
    const [length, end] = [markClock(skipped.end - skipped.start), markClock(skipped.end)];
    return `Skips its wait: ${length} — the scene goes on at ${end}.`;
  }
  return `Skips its wait: none here. ${noWaitReason(project, mark) ?? ''}`.trim();
}

/** The words of the mark the pointer rests on, or that the keyboard reached: what it is and when,
 * whether it skips its wait, its words and what the project says of it. Rendered into
 * document.body, beside the ruler — under it, or to its left in the vertical timeline —, and kept
 * inside the window. */
function SlideMarkTip({
  mark,
  skip,
  warnings,
  anchor: element,
}: {
  mark: SlideMark;
  /** What it says of the wait the pause skips (`skipLine`). */
  skip: string | null;
  warnings: readonly string[];
  /** The mark's own element: the tip follows it while it is dragged. */
  anchor: HTMLElement;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    const anchor = element.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = tip;
    const margin = 8;
    // The ruler is RULER_HEIGHT across: the tip is put past it, beside the tracks.
    let left: number;
    let top: number;
    if (timelineVertical()) {
      left = anchor.right - RULER_HEIGHT - 6 - width;
      top = anchor.top + anchor.height / 2 - height / 2;
    } else {
      left = anchor.left + anchor.width / 2 - 12;
      top = anchor.top + RULER_HEIGHT + 4;
    }
    left = Math.min(Math.max(margin, left), window.innerWidth - margin - width);
    top = Math.min(Math.max(margin, top), window.innerHeight - margin - height);
    setPlace({ left, top });
  }, [element, mark, skip, warnings]);
  const words = markWords(mark);
  return createPortal(
    <div
      ref={ref}
      className={`tl-slide-tip${warnings.length > 0 ? ' is-warned' : ''}`}
      role="tooltip"
      data-testid="slide-mark-tip"
      style={place}
    >
      <div className="tl-slide-tip-title">{markTitle(mark)}</div>
      {skip !== null && (
        <div className="tl-slide-tip-skip" data-testid="slide-mark-tip-skip">
          {skip}
        </div>
      )}
      {words !== null && <div className="tl-slide-tip-words">{words}</div>}
      {warnings.map((warning) => (
        <div key={warning} className="tl-slide-tip-warning">
          {warning}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** The marks in the ruler (a child of `.tl-ruler`), over its ticks, its region and its playhead's
 * head. `onMarkMenu` opens a mark's menu at a point of the screen. */
export function SlideMarksOnRuler({
  onMarkMenu,
}: {
  onMarkMenu(id: SlideMarkId, x: number, y: number): void;
}) {
  const project = useProjectStore((s) => s.project);
  const px = useTimelineStore((s) => s.pxPerSecond);
  /** The mark whose words are shown, and its element. */
  const [tip, setTip] = useState<{ id: SlideMarkId; anchor: HTMLElement } | null>(null);
  /** The mark being dragged: its words follow it, the pointer's leaving it hides nothing. */
  const dragging = useRef<SlideMarkId | null>(null);
  const marks = useMemo(() => marksInOrder(project), [project]);
  const warnings = useMemo(() => markWarnings(project), [project]);
  const spread = useMemo(() => markSpread(project), [project]);
  if (!project.slides) return null;
  const shown = tip && marks.find((mark) => mark.id === tip.id);
  /** The keys of a mark that has the focus: ←/→ (↑/↓ drawn vertical) move it a frame, Delete or
   * Backspace delete it — the focus goes on to the mark after it, or the one before —, Enter
   * writes its words, the Menu key or Shift+F10 open its menu. Taken from the timeline and the
   * playback, whose keys they are elsewhere. */
  const onMarkKey = (event: ReactKeyboardEvent<HTMLElement>, mark: SlideMark) => {
    if (event.defaultPrevented) return;
    if (isMenuKey(event)) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setTip(null);
      onMarkMenu(mark.id, rect.left + rect.width / 2, rect.bottom);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = arrowOf(event.key);
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && !event.shiftKey) {
      event.preventDefault();
      stepMark(mark.id, key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      const index = marks.findIndex((m) => m.id === mark.id);
      const neighbour = marks[index + 1] ?? marks[index - 1];
      if (deleteMark(mark.id) && neighbour) focusSlideMark(neighbour.id);
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void editMarkWords(mark.id);
    }
  };
  const showTip = (id: SlideMarkId, element: HTMLElement) => setTip({ id, anchor: element });
  const hideTip = () => {
    if (dragging.current === null) setTip(null);
  };
  return (
    <div className="tl-slide-marks" role="group" aria-label="Pauses and comments">
      {marks.map((mark) => {
        const warned = (warnings.get(mark.id)?.length ?? 0) > 0;
        const why = warnings.get(mark.id);
        const skip = mark.kind === 'pause' && mark.skipWait === true;
        return (
          <button
            key={mark.id}
            type="button"
            className={`tl-slide-mark is-${mark.kind}${skip ? ' is-skip' : ''}${warned ? ' is-warned' : ''}`}
            data-testid={`slide-mark-${mark.id}`}
            data-mark-id={mark.id}
            data-kind={mark.kind}
            data-time={mark.time}
            data-standing={markStanding(project, mark)}
            data-warned={warned || undefined}
            data-skip-wait={skip || undefined}
            aria-label={markLabel(mark, skipWords(project, mark))}
            aria-description={why?.join(' ')}
            data-space-plays=""
            style={{
              left: mark.time * px,
              marginLeft: -MARK_WIDTH / 2 + (spread.get(mark.id) ?? 0) * MARK_WIDTH,
            }}
            // A click puts the playhead on it; a drag moves it (slideMarkGestures.ts).
            onPointerDown={(event) => {
              const element = event.currentTarget;
              startSlideMarkGesture(event, mark.id, (on) => {
                dragging.current = on ? mark.id : null;
                if (on) showTip(mark.id, element);
                else if (!element.matches(':hover, :focus')) setTip(null);
              });
            }}
            // Its words, in their dialog.
            onDoubleClick={() => void editMarkWords(mark.id)}
            // Its own menu, not the ruler's.
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setTip(null);
              onMarkMenu(mark.id, event.clientX, event.clientY);
            }}
            onPointerEnter={(event) => {
              if (event.buttons === 0) showTip(mark.id, event.currentTarget);
            }}
            onKeyDown={(event) => onMarkKey(event, mark)}
            onPointerLeave={hideTip}
            onFocus={(event) => showTip(mark.id, event.currentTarget)}
            onBlur={hideTip}
          >
            {mark.kind === 'pause' ? <PauseShape skip={skip} /> : <CommentShape />}
          </button>
        );
      })}
      {shown && tip && (
        <SlideMarkTip
          mark={shown}
          skip={skipLine(project, shown)}
          warnings={warnings.get(shown.id) ?? []}
          anchor={tip.anchor}
        />
      )}
    </div>
  );
}

/** A thin line down the tracks at each pause (a child of `.tl-content`, beside the playhead's
 * line, under it). Nothing here takes the pointer. */
export function SlidePauseLines() {
  const project = useProjectStore((s) => s.project);
  const px = useTimelineStore((s) => s.pxPerSecond);
  const header = useHeaderWidth();
  const pauses = useMemo(
    () => marksInOrder(project).filter((mark) => mark.kind === 'pause'),
    [project],
  );
  const warnings = useMemo(() => markWarnings(project), [project]);
  if (!project.slides || pauses.length === 0) return null;
  return (
    <>
      {pauses.map((mark) => (
        <div
          key={mark.id}
          className={`tl-slide-line${mark.skipWait === true ? ' is-skip' : ''}${
            warnings.has(mark.id) ? ' is-warned' : ''
          }`}
          aria-hidden="true"
          data-testid={`slide-line-${mark.id}`}
          style={{ left: header + mark.time * px, top: RULER_HEIGHT }}
        />
      ))}
    </>
  );
}

/** Along the ruler, the stretch each pause that skips its wait jumps over (`skippedWait`): a
 * violet line from the pause to where the scene goes on, its end an arrow's point (a child of
 * `.tl-ruler`, under the marks). Worked out of the store's project, so it follows an edit as it is
 * made; it takes no press. */
export function SlideSkipsOnRuler() {
  const project = useProjectStore((s) => s.project);
  const px = useTimelineStore((s) => s.pxPerSecond);
  const skips = useMemo(
    () =>
      marksInOrder(project).flatMap((mark) => {
        const skipped = skippedWait(project, mark);
        return skipped ? [{ id: mark.id, ...skipped }] : [];
      }),
    [project],
  );
  if (!project.slides || skips.length === 0) return null;
  return (
    <div className="tl-slide-skips" aria-hidden="true">
      {skips.map((skip) => (
        <div
          key={skip.id}
          className="tl-slide-skip"
          data-testid="slide-skip-span"
          data-mark-id={skip.id}
          data-start={skip.start}
          data-end={skip.end}
          style={{ left: skip.start * px, width: (skip.end - skip.start) * px }}
        />
      ))}
    </div>
  );
}
