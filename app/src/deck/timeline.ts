/* The timeline of a deck's bar: a slider over the scene's time, with a notch at each of its pauses
 * and the part played filled. A pause that skips its wait has a notch of its own colour
 * (`data-skip-wait`), and the wait it jumps over is a dashed piece of the track
 * (`.mfe-timeline-skip`). A press seeks there (on a notch: to the pause, exactly), a drag
 * scrubs, and playback goes on afterwards if it was playing; with the focus, ← → ↑ ↓ step it by a
 * frame (a second with Shift), Home and End go to the start and the end. The other keys are the
 * deck's (`keys.ts`): PageDown on a timeline that has the focus still goes on to the next pause,
 * as a presenter's remote means it to.
 *
 * Built on the deck's public object alone; where the playhead is travels as the custom property
 * `--mfe-progress` (0…1) of the timeline, which the stylesheet places the fill and the thumb by;
 * a notch is at `--mfe-at`, a skipped wait from `--mfe-at` to `--mfe-to`. */
import { formatSeconds } from '../embed/clock';
import { isMainPress } from '../embed/press';
import type { Deck } from './deck';
import { skipsWait } from './slideClock';

/** Times closer than this are one (the deck's own tolerance). */
const EPSILON = 1e-6;
/** How far a press may move, in pixels, before it is a drag: a click on a notch stays there. */
const SLOP = 3;

export interface Timeline {
  readonly element: HTMLDivElement;
  /** Shows the deck as it is now. */
  update(): void;
  destroy(): void;
}

/** The pauses a deck stops at: those strictly inside the scene (one at its start or its end is no
 * stop: the scene stands there anyway). */
export function stopsOfDeck(deck: Pick<Deck, 'pauses' | 'duration'>): Deck['pauses'] {
  return deck.pauses.filter(
    (pause) => pause.time > EPSILON && pause.time < deck.duration - EPSILON,
  );
}

/** A pause as its notch's tooltip says it: "Pause 2 · 4.50 s — Questions", and of one that skips
 * its wait "Pause 1 · 1.50 s · skips its wait to 2.00 s". */
export function pauseTitle(index: number, time: number, note: string, resume = time): string {
  const skip = skipsWait({ time, resume }) ? ` · skips its wait to ${formatSeconds(resume)} s` : '';
  const head = `Pause ${index + 1} · ${formatSeconds(time)} s${skip}`;
  const words = note.trim().replace(/\s+/g, ' ');
  return words ? `${head} — ${words.length > 80 ? `${words.slice(0, 79)}…` : words}` : head;
}

export function createTimeline(deck: Deck, doc: Document, hints: boolean): Timeline {
  const element = doc.createElement('div');
  element.className = 'mfe-timeline';
  element.tabIndex = 0;
  element.setAttribute('role', 'slider');
  element.setAttribute('aria-label', 'Time');
  element.setAttribute('aria-orientation', 'horizontal');
  element.setAttribute('aria-valuemin', '0');
  element.setAttribute('aria-valuemax', formatSeconds(deck.duration));
  if (hints) element.title = 'Time (← →: a frame, with Shift a second; Home, End)';
  const track = doc.createElement('div');
  track.className = 'mfe-timeline-track';
  const played = doc.createElement('div');
  played.className = 'mfe-timeline-played';
  track.append(played);
  const at = (time: number) => String(deck.duration > 0 ? time / deck.duration : 0);
  // The waits that going on skips: over the played part, which shows between their dashes.
  for (const pause of deck.pauses.filter(skipsWait)) {
    const skip = doc.createElement('div');
    skip.className = 'mfe-timeline-skip';
    skip.style.setProperty('--mfe-at', at(pause.time));
    skip.style.setProperty('--mfe-to', at(pause.resume));
    track.append(skip);
  }
  element.append(track);
  stopsOfDeck(deck).forEach((pause, index) => {
    const mark = doc.createElement('span');
    mark.className = 'mfe-pause-mark';
    mark.setAttribute('data-time', String(pause.time));
    if (skipsWait(pause)) mark.setAttribute('data-skip-wait', '');
    mark.style.setProperty('--mfe-at', at(pause.time));
    mark.title = pauseTitle(index, pause.time, pause.note, pause.resume);
    element.append(mark);
  });
  const thumb = doc.createElement('div');
  thumb.className = 'mfe-timeline-thumb';
  element.append(thumb);

  const spoken = () => {
    const where = `${formatSeconds(deck.time)} seconds of ${formatSeconds(deck.duration)}`;
    const text = deck.slides > 1 ? `${where}, slide ${deck.slide + 1} of ${deck.slides}` : where;
    const standing = deck.atPause === null ? undefined : deck.pauses[deck.atPause];
    return standing && skipsWait(standing) ? `${text}, at a pause that skips its wait` : text;
  };
  let progress = '';
  const update = () => {
    const fraction = deck.duration > 0 ? Math.min(Math.max(deck.time / deck.duration, 0), 1) : 0;
    const value = fraction.toFixed(5);
    if (value !== progress) {
      element.style.setProperty('--mfe-progress', value);
      progress = value;
    }
    const now = formatSeconds(deck.time);
    if (element.getAttribute('aria-valuenow') !== now) element.setAttribute('aria-valuenow', now);
    const text = spoken();
    if (element.getAttribute('aria-valuetext') !== text)
      element.setAttribute('aria-valuetext', text);
  };

  // --- The pointer ------------------------------------------------------------------
  let drag: { pointer: number; x: number; moved: boolean; resume: boolean } | null = null;
  const timeAt = (clientX: number) => {
    const rect = element.getBoundingClientRect();
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.min(Math.max(fraction, 0), 1) * deck.duration;
  };
  const onDown = (event: PointerEvent) => {
    // Not a Mac's click with Ctrl: that one is the menu's (`isMainPress`).
    if (!isMainPress(event) || drag) return;
    // No text is selected and no mouse event follows; the focus is given by hand.
    event.preventDefault();
    const target = event.target instanceof Element ? event.target : null;
    const mark = target?.closest<HTMLElement>('.mfe-pause-mark');
    drag = { pointer: event.pointerId, x: event.clientX, moved: false, resume: deck.playing };
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer knows: the drag ends at its first move elsewhere.
    }
    element.setAttribute('data-dragging', '');
    element.focus({ preventScroll: true });
    const at = mark ? Number(mark.getAttribute('data-time')) : Number.NaN;
    deck.seek(Number.isFinite(at) ? at : timeAt(event.clientX));
  };
  const onMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.moved && Math.abs(event.clientX - drag.x) < SLOP) return;
    drag.moved = true;
    deck.seek(timeAt(event.clientX));
  };
  const onUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { resume } = drag;
    drag = null;
    element.removeAttribute('data-dragging');
    if (resume && deck.time < deck.duration - EPSILON) deck.play();
  };

  // --- The keys of a slider -----------------------------------------------------------
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const frame = 1 / (deck.fps > 0 ? deck.fps : 30);
    const step = event.shiftKey ? 1 : frame;
    let to: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
      case 'Left':
      case 'Down':
        to = deck.time - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
      case 'Right':
      case 'Up':
        to = deck.time + step;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = deck.duration;
        break;
    }
    if (to === null) return;
    event.preventDefault();
    deck.seek(to);
  };

  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onUp);
  element.addEventListener('lostpointercapture', onUp);
  element.addEventListener('keydown', onKey);
  update();
  return {
    element,
    update,
    destroy() {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      element.removeEventListener('lostpointercapture', onUp);
      element.removeEventListener('keydown', onKey);
      element.remove();
    },
  };
}
