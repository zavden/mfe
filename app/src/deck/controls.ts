/* The controls of a deck: its bar, its keys, its notes. They are built on the deck's public
 * object alone (`deck.ts`), as a page's own controls would be: a page that wants others mounts
 * its decks with `data-controls="none"` and drives them through the same object.
 *
 * What they build in the deck's element (`player.css` names every class):
 *
 *   <div class="mfe-screen">                            the deck's own, and in it:
 *     <div class="mfe-blackout" hidden>                 the stage blacked out (B, `.`)
 *   <div class="mfe-bar" role="group">                  the bar, under the stage
 *     <button class="mfe-button mfe-previous">          the pause before
 *     <button class="mfe-button mfe-play">              play / pause (play again at the end)
 *     <button class="mfe-button mfe-next">              go on to the next pause
 *     <div class="mfe-timeline" role="slider">          the time (`timeline.ts`)
 *     <span class="mfe-slide-count">                    "2 / 3"
 *     <span class="mfe-time">                           "1.25 / 6.00 s"
 *     <button class="mfe-button mfe-through">           play through the pauses (a toggle)
 *     <button class="mfe-button mfe-mute">              the sound, when the scene has one
 *     <button class="mfe-button mfe-notes-button">      the notes (a toggle)
 *     <button class="mfe-button mfe-fullscreen">        full screen, where the page may have it
 *   </div>
 *   <div class="mfe-notes" role="region" hidden>        for whoever presents (`notes.ts`)
 *   <div class="mfe-live" role="status">                says the slide when the deck stops
 *
 * With `data-controls="minimal"` the bar holds the play button and the timeline alone; the keys
 * and the notes are there all the same. With `data-notes="off"` there are no notes: no region, no
 * button, and S does nothing. The deck's element says what the controls show in
 * attributes the stylesheet reads: `data-mfe-controls` (`full`, `minimal`), `data-mfe-notes`,
 * `data-mfe-blackout`, `data-mfe-fullscreen` and `data-mfe-idle` (full screen, and the pointer
 * has not moved for a while: the bar hides). Everything is redrawn from the deck on its `change`
 * event, and the result of `attachControls` takes it all away. */
import { formatSeconds } from '../embed/clock';
import type { ControlsFactory, Deck } from './deck';
import { fullscreenOf } from './fullscreen';
import { icon, type IconName } from './icons';
import { keyCommand, targetKind, type KeyCommand } from './keys';
import { createNotes, hasNotes } from './notes';
import { createTimeline, stopsOfDeck } from './timeline';

/** Times closer than this are one (the deck's own tolerance). */
const EPSILON = 1e-6;
/** How long the bar stays in full screen after the pointer last moved, in milliseconds. */
export const IDLE_DELAY = 2500;

/** The attributes of a deck's element that the controls write. */
export const CONTROLS = 'data-mfe-controls';
export const NOTES = 'data-mfe-notes';
export const BLACKOUT = 'data-mfe-blackout';
export const FULLSCREEN = 'data-mfe-fullscreen';
export const IDLE = 'data-mfe-idle';

/** A button of the bar: its classes, its icon and its accessible name. */
function makeButton(
  doc: Document,
  className: string,
  name: IconName,
  label: string,
): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = `mfe-button ${className}`;
  button.setAttribute('aria-label', label);
  button.append(icon(doc, name));
  return button;
}

/** Puts icon `name` in `button` when it shows another. */
function showIcon(button: HTMLButtonElement, name: IconName): void {
  const current = button.querySelector('.mfe-icon');
  if (current?.getAttribute('data-icon') === name) return;
  const next = icon(button.ownerDocument, name);
  if (current) current.replaceWith(next);
  else button.append(next);
}

const setAttribute = (element: Element, name: string, value: string) => {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
};
const setFlag = (element: Element, name: string, on: boolean) => {
  if (on) setAttribute(element, name, '');
  else element.removeAttribute(name);
};
const setText = (element: Element, text: string) => {
  if (element.textContent !== text) element.textContent = text;
};

/** What a screen reader alone reads. */
function hiddenText(doc: Document, text: string): HTMLSpanElement {
  const span = doc.createElement('span');
  span.className = 'mfe-visually-hidden';
  span.textContent = text;
  return span;
}

/** Adds the controls to a deck; the result takes them away. */
export const attachControls: ControlsFactory = (deck: Deck) => {
  const { element } = deck;
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const minimal = deck.options.controls === 'minimal';
  const withNotes = deck.options.notes;
  const hints = deck.options.keys !== 'none';
  const hint = (label: string, keys: string) => (hints ? `${label} (${keys})` : label);
  const title = deck.project?.meta.name || deck.name;
  const screen = element.querySelector<HTMLElement>(':scope > .mfe-screen');
  const fullscreen = fullscreenOf(element);
  const stops = stopsOfDeck(deck);
  const undo: (() => void)[] = [];
  let detached = false;

  const listen = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ) => {
    target.addEventListener(type, listener);
    undo.push(() => target.removeEventListener(type, listener));
  };

  element.setAttribute(CONTROLS, minimal ? 'minimal' : 'full');
  undo.push(() => {
    for (const name of [CONTROLS, NOTES, BLACKOUT, FULLSCREEN, IDLE]) element.removeAttribute(name);
  });
  // A press anywhere in the deck (the stage, the bar's words) gives it the focus, which its keys
  // follow when they are heard only there; the element itself is no stop of the Tab key.
  if (!element.hasAttribute('tabindex')) {
    element.tabIndex = -1;
    undo.push(() => element.removeAttribute('tabindex'));
  }

  // --- The bar ----------------------------------------------------------------------------
  const bar = doc.createElement('div');
  bar.className = 'mfe-bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', `Controls of ${title}`);

  const previous = minimal ? null : makeButton(doc, 'mfe-previous', 'previous', 'Previous');
  const play = makeButton(doc, 'mfe-play', 'play', 'Play');
  const next = minimal ? null : makeButton(doc, 'mfe-next', 'next', 'Next');
  const timeline = createTimeline(deck, doc, hints);
  if (previous) previous.title = hint('Previous pause', '←, PageUp');
  if (next) next.title = hint('Next', '→, Space, PageDown');
  bar.append(...[previous, play, next].filter((b) => b !== null), timeline.element);

  let countValue: HTMLSpanElement | null = null;
  let time: HTMLSpanElement | null = null;
  let through: HTMLButtonElement | null = null;
  let mute: HTMLButtonElement | null = null;
  let notesButton: HTMLButtonElement | null = null;
  let fullscreenButton: HTMLButtonElement | null = null;
  if (!minimal) {
    const count = doc.createElement('span');
    count.className = 'mfe-slide-count';
    count.title = 'Slide';
    countValue = doc.createElement('span');
    count.append(hiddenText(doc, 'Slide '), countValue);
    count.hidden = deck.slides <= 1;
    time = doc.createElement('span');
    time.className = 'mfe-time';
    time.title = 'Time, in seconds';
    through = makeButton(doc, 'mfe-through', 'through', 'Play through the pauses');
    through.title = 'Play through the pauses';
    through.hidden = stops.length === 0;
    bar.append(count, time, through);
    if (deck.hasSound) {
      mute = makeButton(doc, 'mfe-mute', 'sound', 'Mute');
      mute.title = hint('Mute', 'M');
      bar.append(mute);
    }
    if (withNotes) {
      notesButton = makeButton(doc, 'mfe-notes-button', 'notes', 'Notes');
      notesButton.title = hint('Notes', 'S');
      notesButton.setAttribute('aria-pressed', 'false');
      notesButton.hidden = !hasNotes(deck);
      bar.append(notesButton);
    }
    if (fullscreen.supported) {
      fullscreenButton = makeButton(doc, 'mfe-fullscreen', 'fullscreen', 'Full screen');
      fullscreenButton.title = hint('Full screen', 'F');
      fullscreenButton.setAttribute('aria-pressed', 'false');
      bar.append(fullscreenButton);
    }
  }

  // --- The notes, the blackout and what a screen reader is told ----------------------------
  const notes = withNotes ? createNotes(deck, doc) : null;
  const live = doc.createElement('div');
  live.className = 'mfe-live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  const blackout = doc.createElement('div');
  blackout.className = 'mfe-blackout';
  blackout.hidden = true;
  (screen ?? element).append(blackout);
  element.append(bar);
  if (notes) element.append(notes.element);
  element.append(live);
  undo.push(
    () => {
      bar.remove();
      notes?.element.remove();
      live.remove();
      blackout.remove();
    },
    () => timeline.destroy(),
  );

  const showNotes = (open: boolean) => {
    if (!notes) return;
    notes.show(open);
    setFlag(element, NOTES, open);
    if (notesButton) setAttribute(notesButton, 'aria-pressed', String(open));
  };
  let black = false;
  const blackOut = (on: boolean) => {
    black = on;
    blackout.hidden = !on;
    setFlag(element, BLACKOUT, on);
  };

  // --- Full screen, and the bar that hides itself there ------------------------------------
  let resting: number | null = null;
  const stopResting = () => {
    if (resting !== null) view?.clearTimeout(resting);
    resting = null;
  };
  const rest = () => {
    resting = null;
    if (!fullscreen.active()) return;
    // Never while the bar has the focus, nor while the pointer is on it.
    if (bar.contains(doc.activeElement) || bar.matches(':hover')) {
      resting = view?.setTimeout(rest, IDLE_DELAY) ?? null;
      return;
    }
    setFlag(element, IDLE, true);
  };
  const wake = () => {
    setFlag(element, IDLE, false);
    stopResting();
    if (fullscreen.active()) resting = view?.setTimeout(rest, IDLE_DELAY) ?? null;
  };
  const onFullscreen = () => {
    const on = fullscreen.active();
    setFlag(element, FULLSCREEN, on);
    if (fullscreenButton) {
      setAttribute(fullscreenButton, 'aria-pressed', String(on));
      showIcon(fullscreenButton, on ? 'exit-fullscreen' : 'fullscreen');
    }
    wake();
  };
  undo.push(fullscreen.watch(onFullscreen), stopResting, () => {
    if (fullscreen.active()) fullscreen.toggle();
  });
  listen(element, 'pointermove', wake);
  listen(element, 'pointerdown', wake);
  listen(bar, 'focusin', wake);

  // --- What the controls do ----------------------------------------------------------------
  const run = (command: KeyCommand) => {
    // While the stage is black, going anywhere first brings the scene back, where it stood.
    if (black && ['next', 'previous', 'start', 'end', 'toggle'].includes(command)) {
      blackOut(false);
      return;
    }
    switch (command) {
      case 'next':
        deck.next();
        break;
      case 'previous':
        deck.previous();
        break;
      case 'start':
        deck.seek(0);
        break;
      case 'end':
        deck.seek(deck.duration);
        break;
      case 'toggle':
        deck.toggle();
        break;
      case 'fullscreen':
        fullscreen.toggle();
        break;
      case 'notes':
        showNotes(!notes?.open);
        break;
      case 'blackout':
        blackOut(!black);
        break;
      case 'mute':
        deck.muted = !deck.muted;
        break;
    }
  };
  listen(play, 'click', () => run('toggle'));
  if (previous) listen(previous, 'click', () => run('previous'));
  if (next) listen(next, 'click', () => run('next'));
  if (through) listen(through, 'click', () => (deck.through = !deck.through));
  if (mute) listen(mute, 'click', () => run('mute'));
  if (notesButton) listen(notesButton, 'click', () => run('notes'));
  if (fullscreenButton) listen(fullscreenButton, 'click', () => run('fullscreen'));
  // A click on the stage plays or pauses, unless the page's own handler of it said otherwise
  // (`preventDefault`); on the blacked-out stage it brings the scene back.
  if (screen) {
    listen(screen, 'click', (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('.mfe-problems')) return;
      run('toggle');
    });
  }

  // --- The keys -------------------------------------------------------------------------------
  // On the scene's own page they are heard anywhere in it — but not when the focus is in another
  // deck of the page, whose keys they are; embedded, only while the focus is inside the deck.
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const owner = (event.target as Element | null)?.closest?.('.mfe-deck');
    if (owner && owner !== element) return;
    const command = keyCommand(event, targetKind(event.target));
    if (command === null) return;
    if (command === 'mute' && !deck.hasSound) return;
    if (command === 'notes' && !notes) return;
    if (command === 'fullscreen' && !fullscreen.supported) return;
    event.preventDefault();
    run(command);
  };
  const keyTarget =
    deck.options.keys === 'page' ? doc : deck.options.keys === 'focus' ? element : null;
  if (keyTarget) {
    keyTarget.addEventListener('keydown', onKey as EventListener);
    undo.push(() => keyTarget.removeEventListener('keydown', onKey as EventListener));
  }

  // --- Following the deck -------------------------------------------------------------------
  const update = () => {
    const atEnd = !deck.playing && deck.duration > 0 && deck.time >= deck.duration - EPSILON;
    const atStart = !deck.playing && deck.time <= EPSILON;
    const [name, label] = deck.playing
      ? (['pause', 'Pause'] as const)
      : atEnd
        ? (['replay', 'Play again'] as const)
        : (['play', 'Play'] as const);
    showIcon(play, name);
    setAttribute(play, 'aria-label', label);
    setAttribute(play, 'title', hint(label, 'K'));
    if (previous) setAttribute(previous, 'aria-disabled', String(atStart));
    if (next) setAttribute(next, 'aria-disabled', String(atEnd));
    timeline.update();
    if (countValue) setText(countValue, `${deck.slide + 1} / ${deck.slides}`);
    if (time) setText(time, `${formatSeconds(deck.time)} / ${formatSeconds(deck.duration)} s`);
    if (through) setAttribute(through, 'aria-pressed', String(deck.through));
    if (mute) {
      setAttribute(mute, 'aria-pressed', String(deck.muted));
      showIcon(mute, deck.muted ? 'muted' : 'sound');
    }
    notes?.update();
  };
  undo.push(deck.on('change', update));

  // When the deck comes to stand at a pause, a screen reader says on which slide. Looked at once
  // the command that stopped it is over: a seek says `pause` before it moves.
  let said = '';
  const announce = () => {
    if (detached || deck.playing) return;
    if (!stops.some((stop) => Math.abs(stop.time - deck.time) <= EPSILON)) return;
    const text = `Slide ${deck.slide + 1} of ${deck.slides}`;
    // The same words again would not be said again: they differ by a space no one hears.
    said = said === text ? `${text}\u00a0` : text;
    live.textContent = said;
  };
  undo.push(deck.on('pause', () => queueMicrotask(announce)));

  update();
  onFullscreen();

  return () => {
    if (detached) return;
    detached = true;
    for (const step of undo.reverse()) step();
  };
};
