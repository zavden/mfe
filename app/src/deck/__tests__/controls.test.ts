/* The controls of a deck in a page (jsdom: no layout, no animation frames of its own): the bar
 * drives the deck and follows it, its buttons have names and say their state, the timeline seeks
 * by a press, a drag and its keys, a minimal bar has less, and taking the controls away leaves
 * the deck as it was. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlideMark } from '../../model';
import { attachControls, CONTROLS } from '../controls';
import type { Deck } from '../deck';
import { MFE } from '../index';
import { resetRegistry } from '../registry';
import { mockFiles, type MockFiles } from './mockDeck';

const marks: SlideMark[] = [
  { id: 'p1', time: 1.5, kind: 'pause', text: 'Ask the room' },
  { id: 'p2', time: 1.25, kind: 'comment', text: 'A flash over the m' },
  { id: 'p3', time: 3.5, kind: 'pause' },
];
let plain: MockFiles;
let marked: MockFiles;
/** The first pause skips its wait, the rest [1, 2] it stands in. */
let skips: MockFiles;
beforeAll(async () => {
  plain = await mockFiles();
  marked = await mockFiles(marks);
  skips = await mockFiles(
    marks.map((mark) => (mark.id === 'p1' ? { ...mark, skipWait: true } : mark)),
  );
});

let frames: FrameRequestCallback[] = [];
function runFrames(count: number, from = 0): void {
  for (let k = 0; k < count; k++) {
    const pending = frames;
    frames = [];
    for (const callback of pending) callback(from + (k * 1000) / 60);
  }
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    frames[handle - 1] = () => {};
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  document.body.innerHTML = '';
});
afterEach(() => {
  resetRegistry();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mounted(
  files: MockFiles = marked,
  attributes: Record<string, string> = {},
  audio?: string,
): Deck {
  MFE.glyphs('hello', files.glyphs);
  MFE.scene('hello', files.project, audio ? { audio } : {});
  const element = document.createElement('div');
  element.className = 'mfe-deck';
  element.setAttribute('data-scene', 'hello');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.append(element);
  return MFE.mount(element);
}

const find = <T extends Element = HTMLElement>(deck: Deck, selector: string): T =>
  deck.element.querySelector<T & Element>(selector)!;
const button = (deck: Deck, name: string) => find<HTMLButtonElement>(deck, `.mfe-${name}`);

describe('the bar of a deck', () => {
  it('stands under the stage with its controls in order, each with a name', () => {
    const deck = mounted();
    expect(deck.element.getAttribute(CONTROLS)).toBe('full');
    const bar = find(deck, '.mfe-bar');
    expect(bar.previousElementSibling).toBe(find(deck, '.mfe-screen'));
    expect(bar.getAttribute('role')).toBe('group');
    expect(bar.getAttribute('aria-label')).toBe(`Controls of ${marked.project.meta.name}`);
    expect([...bar.children].map((child) => child.className.replace('mfe-button ', ''))).toEqual([
      'mfe-previous',
      'mfe-play',
      'mfe-next',
      'mfe-timeline',
      'mfe-slide-count',
      'mfe-time',
      'mfe-through',
      'mfe-notes-button',
    ]);
    // After the bar: the notes, hidden, and what a screen reader is told; over the stage, the
    // blackout, hidden.
    expect(bar.nextElementSibling!.className).toBe('mfe-notes');
    expect(bar.nextElementSibling!.nextElementSibling!.className).toBe('mfe-live');
    expect(find(deck, '.mfe-screen > .mfe-blackout').hidden).toBe(true);
    for (const control of bar.querySelectorAll('button')) {
      expect(control.type).toBe('button');
      expect(control.getAttribute('aria-label')).not.toBe('');
      expect(control.querySelector('svg.mfe-icon')!.getAttribute('aria-hidden')).toBe('true');
    }
    expect(button(deck, 'previous').getAttribute('aria-label')).toBe('Previous');
    expect(button(deck, 'next').getAttribute('aria-label')).toBe('Next');
    expect(button(deck, 'through').getAttribute('aria-label')).toBe('Play through the pauses');
    expect(button(deck, 'notes-button').getAttribute('aria-label')).toBe('Notes');
    expect(button(deck, 'notes-button').getAttribute('aria-pressed')).toBe('false');
    // No full screen in this browser: no button for it.
    expect(button(deck, 'fullscreen')).toBeNull();
    expect(deck.element.querySelectorAll('[id]')).toHaveLength(0);
    // The deck takes the focus when pressed, and is no stop of the Tab key.
    expect(deck.element.getAttribute('tabindex')).toBe('-1');
  });

  it('plays and pauses, and says which it would do', () => {
    const deck = mounted();
    const play = button(deck, 'play');
    expect(play.getAttribute('aria-label')).toBe('Play');
    expect(play.title).toBe('Play (K)');
    expect(play.querySelector('.mfe-icon')!.getAttribute('data-icon')).toBe('play');
    play.click();
    expect(deck.playing).toBe(true);
    expect(play.getAttribute('aria-label')).toBe('Pause');
    expect(play.querySelector('.mfe-icon')!.getAttribute('data-icon')).toBe('pause');
    play.click();
    expect(deck.playing).toBe(false);
    expect(play.getAttribute('aria-label')).toBe('Play');
    // At the end it plays again, from the start.
    deck.seek(deck.duration);
    expect(play.getAttribute('aria-label')).toBe('Play again');
    expect(play.querySelector('.mfe-icon')!.getAttribute('data-icon')).toBe('replay');
    play.click();
    expect(deck.time).toBe(0);
    expect(deck.playing).toBe(true);
  });

  it('follows the deck as it plays to a pause and stops there', () => {
    const deck = mounted();
    button(deck, 'play').click();
    runFrames(200);
    expect(deck.time).toBe(1.5);
    expect(button(deck, 'play').getAttribute('aria-label')).toBe('Play');
    expect(find(deck, '.mfe-time').textContent).toBe('1.50 / 5.00 s');
    expect(find(deck, '.mfe-slide-count').textContent).toBe('Slide 1 / 3');
    expect(find(deck, '.mfe-timeline').style.getPropertyValue('--mfe-progress')).toBe('0.30000');
  });

  it('goes on to the next pause and back to the one before', () => {
    const deck = mounted();
    const previous = button(deck, 'previous');
    const next = button(deck, 'next');
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    expect(next.getAttribute('aria-disabled')).toBe('false');
    next.click();
    expect(deck.playing).toBe(true);
    next.click(); // while it plays: to the pause at once
    expect(deck.time).toBe(1.5);
    expect(deck.playing).toBe(false);
    expect(previous.getAttribute('aria-disabled')).toBe('false');
    next.click();
    runFrames(200);
    expect(deck.time).toBe(3.5);
    expect(find(deck, '.mfe-slide-count').textContent).toBe('Slide 2 / 3');
    previous.click();
    expect(deck.time).toBe(1.5);
    previous.click();
    expect(deck.time).toBe(0);
    deck.seek(deck.duration);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(find(deck, '.mfe-slide-count').textContent).toBe('Slide 3 / 3');
  });

  it('turns the stops off and on', () => {
    const deck = mounted();
    const through = button(deck, 'through');
    expect(through.getAttribute('aria-pressed')).toBe('false');
    through.click();
    expect(deck.through).toBe(true);
    expect(through.getAttribute('aria-pressed')).toBe('true');
    deck.through = false; // from elsewhere: the button follows
    expect(through.getAttribute('aria-pressed')).toBe('false');
    // A scene without pauses has no stops to turn off, nor slides to count.
    resetRegistry();
    const bare = mounted(plain);
    expect(button(bare, 'through').hidden).toBe(true);
    expect(find(bare, '.mfe-slide-count').hidden).toBe(true);
  });

  it('turns the sound off and on, when the scene has one', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    expect(button(mounted(), 'mute')).toBeNull();
    resetRegistry();
    const deck = mounted(marked, {}, 'audio.m4a');
    const mute = button(deck, 'mute');
    expect(mute.getAttribute('aria-label')).toBe('Mute');
    expect(mute.getAttribute('aria-pressed')).toBe('false');
    mute.click();
    expect(deck.muted).toBe(true);
    expect(deck.element.querySelector('audio')!.muted).toBe(true);
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(mute.querySelector('.mfe-icon')!.getAttribute('data-icon')).toBe('muted');
    mute.click();
    expect(deck.muted).toBe(false);
  });

  it('says no key in its hints when the deck hears none', () => {
    const deck = mounted(marked, { 'data-keys': 'none' });
    expect(button(deck, 'play').title).toBe('Play');
    expect(button(deck, 'next').title).toBe('Next');
    expect(find(deck, '.mfe-timeline').title).toBe('');
  });
});

describe('the timeline', () => {
  /** The timeline laid out 500 px wide from x = 100. */
  const laidOut = (deck: Deck) => {
    const timeline = find(deck, '.mfe-timeline');
    timeline.getBoundingClientRect = () => new DOMRect(100, 0, 500, 32);
    return timeline;
  };
  const pointer = (target: Element, type: string, clientX: number, pointerId = 1) =>
    target.dispatchEvent(
      new PointerEvent(type, { pointerId, button: 0, clientX, bubbles: true, cancelable: true }),
    );

  it('is a slider over the scene’s time with a notch at each pause', () => {
    const deck = mounted();
    const timeline = find(deck, '.mfe-timeline');
    expect(timeline.getAttribute('role')).toBe('slider');
    expect(timeline.tabIndex).toBe(0);
    expect(timeline.getAttribute('aria-label')).toBe('Time');
    expect(timeline.getAttribute('aria-valuemin')).toBe('0');
    expect(timeline.getAttribute('aria-valuemax')).toBe('5.00');
    expect(timeline.getAttribute('aria-valuenow')).toBe('0.00');
    expect(timeline.getAttribute('aria-valuetext')).toBe('0.00 seconds of 5.00, slide 1 of 3');
    const notches = [...timeline.querySelectorAll<HTMLElement>('.mfe-pause-mark')];
    expect(notches.map((notch) => notch.getAttribute('data-time'))).toEqual(['1.5', '3.5']);
    expect(notches.map((notch) => notch.style.getPropertyValue('--mfe-at'))).toEqual([
      '0.3',
      '0.7',
    ]);
    expect(notches.map((notch) => notch.title)).toEqual([
      'Pause 1 · 1.50 s — Ask the room',
      'Pause 2 · 3.50 s',
    ]);
    expect(timeline.querySelector('.mfe-timeline-track > .mfe-timeline-played')).not.toBeNull();
    expect(timeline.lastElementChild!.className).toBe('mfe-timeline-thumb');
    deck.seek(2.5);
    expect(timeline.getAttribute('aria-valuenow')).toBe('2.50');
    expect(timeline.getAttribute('aria-valuetext')).toBe('2.50 seconds of 5.00, slide 2 of 3');
    expect(timeline.style.getPropertyValue('--mfe-progress')).toBe('0.50000');
  });

  it('leaves a Mac’s click with Ctrl to the menu it opens: nothing is sought or dragged', () => {
    const deck = mounted();
    const timeline = laidOut(deck);
    /** The press of a click with Ctrl, as a browser sends it; whether the page took it. */
    const ctrlPress = (clientX: number) =>
      !timeline.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 1,
          button: 0,
          ctrlKey: true,
          clientX,
          bubbles: true,
          cancelable: true,
        }),
      );
    // On a Mac it is the secondary click: the press is the menu's, and is left to the browser.
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(ctrlPress(200)).toBe(false);
    expect(deck.time).toBe(0);
    expect(timeline.hasAttribute('data-dragging')).toBe(false);
    expect(document.activeElement).not.toBe(timeline);
    // A move after it scrubs nothing: no drag began.
    pointer(timeline, 'pointermove', 400);
    expect(deck.time).toBe(0);
    // Elsewhere Ctrl is a key held with the press, which seeks as any press.
    platform.mockReturnValue('Win32');
    expect(ctrlPress(200)).toBe(true);
    expect(deck.time).toBeCloseTo(1, 9);
    expect(timeline.hasAttribute('data-dragging')).toBe(true);
  });

  it('seeks where it is pressed, to a pause exactly on its notch, and scrubs with a drag', () => {
    const deck = mounted();
    const timeline = laidOut(deck);
    pointer(timeline, 'pointerdown', 200); // a fifth of the way
    expect(deck.time).toBeCloseTo(1, 9);
    expect(timeline.hasAttribute('data-dragging')).toBe(true);
    expect(document.activeElement).toBe(timeline);
    pointer(timeline, 'pointermove', 201); // under the slop: no drag yet
    expect(deck.time).toBeCloseTo(1, 9);
    pointer(timeline, 'pointermove', 400);
    expect(deck.time).toBeCloseTo(3, 9);
    pointer(timeline, 'pointermove', 900); // held inside the scene
    expect(deck.time).toBe(5);
    pointer(timeline, 'pointerup', 900);
    expect(timeline.hasAttribute('data-dragging')).toBe(false);
    pointer(timeline, 'pointermove', 300); // no drag any more
    expect(deck.time).toBe(5);
    // On a notch: the pause itself, whatever pixel the press fell on.
    const notch = timeline.querySelectorAll('.mfe-pause-mark')[1]!;
    pointer(notch, 'pointerdown', 452);
    pointer(notch, 'pointerup', 452);
    expect(deck.time).toBe(3.5);
    expect(deck.slide).toBe(1);
  });

  it('tells a pause that skips its wait apart, and dashes the wait it skips', () => {
    const deck = mounted(skips);
    const timeline = laidOut(deck);
    const notches = [...timeline.querySelectorAll<HTMLElement>('.mfe-pause-mark')];
    expect(notches.map((notch) => notch.hasAttribute('data-skip-wait'))).toEqual([true, false]);
    expect(notches.map((notch) => notch.title)).toEqual([
      'Pause 1 · 1.50 s · skips its wait to 2.00 s — Ask the room',
      'Pause 2 · 3.50 s',
    ]);
    // The wait, in the track over the played part: from the pause to where the scene goes on.
    const waits = [...timeline.querySelectorAll<HTMLElement>('.mfe-timeline-skip')];
    expect(waits).toHaveLength(1);
    expect(waits[0]!.parentElement!.className).toBe('mfe-timeline-track');
    expect(waits[0]!.previousElementSibling!.className).toBe('mfe-timeline-played');
    expect(['--mfe-at', '--mfe-to'].map((name) => waits[0]!.style.getPropertyValue(name))).toEqual([
      '0.3',
      '0.4',
    ]);
    // Standing at it, the slider says so.
    deck.seek(1.5);
    expect(timeline.getAttribute('aria-valuetext')).toBe(
      '1.50 seconds of 5.00, slide 1 of 3, at a pause that skips its wait',
    );
    deck.seek(3.5);
    expect(timeline.getAttribute('aria-valuetext')).toBe('3.50 seconds of 5.00, slide 2 of 3');
    // A press on its notch goes to the pause, not past its wait; a press in the wait, there.
    pointer(notches[0]!, 'pointerdown', 250);
    pointer(notches[0]!, 'pointerup', 250);
    expect([deck.time, deck.atPause]).toEqual([1.5, 0]);
    pointer(timeline, 'pointerdown', 275);
    pointer(timeline, 'pointerup', 275);
    expect(deck.time).toBeCloseTo(1.75, 9);
    // The bar's Next goes on over the wait.
    deck.seek(1.5);
    button(deck, 'next').click();
    expect([deck.time, deck.playing]).toEqual([2, true]);
    // A scene whose pauses keep their waits has none.
    resetRegistry();
    expect(mounted(marked).element.querySelector('.mfe-timeline-skip')).toBeNull();
  });

  it('lets playback go on after a drag if it was playing', () => {
    const deck = mounted();
    const timeline = laidOut(deck);
    deck.play();
    pointer(timeline, 'pointerdown', 350);
    expect(deck.playing).toBe(false);
    pointer(timeline, 'pointerup', 350);
    expect(deck.playing).toBe(true);
    expect(deck.time).toBeCloseTo(2.5, 9);
    // A press from a pause stays paused.
    deck.pause();
    pointer(timeline, 'pointerdown', 150);
    pointer(timeline, 'pointerup', 150);
    expect(deck.playing).toBe(false);
  });

  it('steps with the arrows and goes to the ends with Home and End', () => {
    const deck = mounted();
    const timeline = find(deck, '.mfe-timeline');
    const press = (key: string, shiftKey = false) => {
      const event = new KeyboardEvent('keydown', {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      timeline.dispatchEvent(event);
      return event.defaultPrevented;
    };
    deck.seek(2);
    expect(press('ArrowRight')).toBe(true);
    expect(deck.time).toBeCloseTo(2 + 1 / deck.fps, 9);
    press('ArrowLeft');
    press('ArrowDown');
    expect(deck.time).toBeCloseTo(2 - 1 / deck.fps, 9);
    press('ArrowUp', true);
    expect(deck.time).toBeCloseTo(3 - 1 / deck.fps, 9);
    press('End');
    expect(deck.time).toBe(5);
    press('Home');
    expect(deck.time).toBe(0);
    // Not its keys: a chord is the browser's, and PageDown is the deck's, which goes on.
    const chord = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    timeline.dispatchEvent(chord);
    expect(chord.defaultPrevented).toBe(false);
    expect(deck.time).toBe(0);
    expect(press('PageDown')).toBe(true);
    expect(deck.playing).toBe(true);
  });
});

describe('which controls a deck has', () => {
  it('has the play button and the timeline alone when minimal', () => {
    const deck = mounted(marked, { 'data-controls': 'minimal' });
    expect(deck.element.getAttribute(CONTROLS)).toBe('minimal');
    const bar = find(deck, '.mfe-bar');
    expect([...bar.children].map((child) => child.className)).toEqual([
      'mfe-button mfe-play',
      'mfe-timeline',
    ]);
    button(deck, 'play').click();
    expect(deck.playing).toBe(true);
    // Its keys and its notes are there all the same.
    key(deck.element, 's');
    expect(find(deck, '.mfe-notes').hidden).toBe(false);
  });

  it('has no notes when told so, minimal or full: no region, no button, and S does nothing', () => {
    for (const controls of ['full', 'minimal']) {
      resetRegistry();
      const deck = mounted(marked, { 'data-controls': controls, 'data-notes': 'off' });
      expect(deck.options.notes).toBe(false);
      expect(deck.element.querySelector('.mfe-notes')).toBeNull();
      expect(deck.element.querySelector('.mfe-notes-button')).toBeNull();
      expect(find(deck, '.mfe-bar').nextElementSibling!.className).toBe('mfe-live');
      deck.seek(1.5); // where the notes would have words
      expect(key(deck.element, 's')).toBe(false); // not taken: the page may have it
      expect(deck.element.hasAttribute('data-mfe-notes')).toBe(false);
      expect(deck.element.querySelector('.mfe-notes')).toBeNull();
      // The other keys are there all the same.
      expect(key(deck.element, 'b')).toBe(true);
      expect(key(deck.element, '.')).toBe(true);
      expect(key(deck.element, 'ArrowRight')).toBe(true);
      expect(deck.playing).toBe(true);
      deck.pause();
    }
    // A full bar without notes has every other control.
    expect(
      [...find(mounted(marked, { 'data-notes': 'off' }), '.mfe-bar').children].map((child) =>
        child.className.replace('mfe-button ', ''),
      ),
    ).toEqual([
      'mfe-previous',
      'mfe-play',
      'mfe-next',
      'mfe-timeline',
      'mfe-slide-count',
      'mfe-time',
      'mfe-through',
    ]);
  });

  it('has none when told so, and the page drives it', () => {
    const deck = mounted(marked, { 'data-controls': 'none' });
    expect(deck.element.querySelector('.mfe-bar')).toBeNull();
    expect(deck.element.hasAttribute(CONTROLS)).toBe(false);
    expect(deck.element.hasAttribute('tabindex')).toBe(false);
  });

  it('leaves nothing behind when they are taken away', () => {
    const deck = mounted(marked, { 'data-controls': 'none' });
    deck.seek(1);
    const before = deck.element.outerHTML;
    // The deck as the controls see it, with its listeners counted.
    const listening = new Set<() => void>();
    const watched = Object.create(deck, {
      on: {
        value: (event: Parameters<Deck['on']>[0], listener: () => void) => {
          const stop = deck.on(event, listener);
          listening.add(listener);
          return () => {
            listening.delete(listener);
            stop();
          };
        },
      },
    }) as Deck;
    const detach = attachControls(watched);
    expect(deck.element.querySelector('.mfe-bar')).not.toBeNull();
    expect(listening.size).toBeGreaterThan(0);
    detach();
    detach(); // twice is once
    expect(deck.element.outerHTML).toBe(before);
    expect(listening.size).toBe(0);
  });

  it('keeps a tab stop the page gave the deck', () => {
    const deck = mounted(marked, { tabindex: '0' });
    expect(deck.element.getAttribute('tabindex')).toBe('0');
    deck.destroy();
    expect(deck.element.getAttribute('tabindex')).toBe('0');
  });

  it('goes with the deck', () => {
    const deck = mounted();
    const { element } = deck;
    deck.destroy();
    expect(element.children).toHaveLength(0);
    expect(element.hasAttribute(CONTROLS)).toBe(false);
    expect(element.hasAttribute('tabindex')).toBe(false);
  });
});

/** Presses `name` on `target` as a browser does: a keydown that bubbles; says whether it was
 * taken (its default prevented). */
function key(target: EventTarget, name: string, more: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...more,
  });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('the keys of a deck', () => {
  it('go on, back, to the start and to the end', () => {
    const deck = mounted();
    const { element } = deck;
    expect(key(element, 'ArrowRight')).toBe(true);
    expect(deck.playing).toBe(true);
    expect(key(element, 'PageDown')).toBe(true); // while it plays: to the pause at once
    expect(deck.time).toBe(1.5);
    key(element, ' ');
    runFrames(200);
    expect(deck.time).toBe(3.5);
    key(element, 'PageUp');
    expect(deck.time).toBe(1.5);
    key(element, 'ArrowLeft');
    expect(deck.time).toBe(0);
    key(element, 'End');
    expect(deck.time).toBe(deck.duration);
    key(element, 'Home');
    expect(deck.time).toBe(0);
    key(element, 'k');
    expect(deck.playing).toBe(true);
    key(element, 'K');
    expect(deck.playing).toBe(false);
  });

  it('are heard only while the focus is in an embedded deck', () => {
    const deck = mounted();
    expect(deck.options.keys).toBe('focus');
    // On the page around it: not its key, and the page keeps it (it scrolls with Space).
    expect(key(document.body, 'ArrowRight')).toBe(false);
    expect(key(document.body, ' ')).toBe(false);
    expect(deck.playing).toBe(false);
    // On its bar's timeline: the deck's (PageDown goes on); on its play button, Space presses it.
    expect(key(find(deck, '.mfe-timeline'), 'PageDown')).toBe(true);
    expect(deck.playing).toBe(true);
    deck.pause();
    expect(key(button(deck, 'play'), ' ')).toBe(false);
    expect(key(button(deck, 'play'), 'Enter')).toBe(false);
    expect(deck.playing).toBe(false);
    // Never with a modifier, never a key the browser needs.
    expect(key(deck.element, 'ArrowRight', { ctrlKey: true })).toBe(false);
    expect(key(deck.element, 'ArrowRight', { metaKey: true })).toBe(false);
    expect(key(deck.element, 'ArrowRight', { altKey: true })).toBe(false);
    expect(key(deck.element, 'Tab')).toBe(false);
    expect(key(deck.element, 'Escape')).toBe(false);
    expect(deck.playing).toBe(false);
  });

  it('are heard on the whole page of the scene’s own page, but not in a field nor in another deck', () => {
    const deck = mounted(marked, { 'data-keys': 'page' });
    const input = document.createElement('input');
    document.body.append(input);
    expect(key(input, 'ArrowRight')).toBe(false);
    expect(key(input, ' ')).toBe(false);
    expect(deck.playing).toBe(false);
    expect(key(document.body, 'ArrowRight')).toBe(true);
    expect(deck.playing).toBe(true);
    deck.pause();
    // A second deck of the page has its own keys.
    const other = document.createElement('div');
    other.className = 'mfe-deck';
    other.setAttribute('data-scene', 'hello');
    document.body.append(other);
    const second = MFE.mount(other);
    expect(key(other, 'ArrowRight')).toBe(true);
    expect(second.playing).toBe(true);
    expect(deck.playing).toBe(false);
  });

  it('are heard nowhere when the deck is told so', () => {
    const deck = mounted(marked, { 'data-keys': 'none' });
    expect(key(deck.element, 'ArrowRight')).toBe(false);
    expect(key(document.body, 'ArrowRight')).toBe(false);
    expect(deck.playing).toBe(false);
  });

  it('turn the sound off only when the scene has one', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    expect(key(mounted().element, 'm')).toBe(false);
    resetRegistry();
    const deck = mounted(marked, {}, 'audio.m4a');
    expect(key(deck.element, 'm')).toBe(true);
    expect(deck.muted).toBe(true);
    expect(button(deck, 'mute').getAttribute('aria-pressed')).toBe('true');
  });

  it('black the stage out and back, and going on first brings the scene back', () => {
    const deck = mounted();
    const blackout = find(deck, '.mfe-blackout');
    expect(key(deck.element, 'b')).toBe(true);
    expect(blackout.hidden).toBe(false);
    expect(deck.element.hasAttribute('data-mfe-blackout')).toBe(true);
    key(deck.element, '.');
    expect(blackout.hidden).toBe(true);
    key(deck.element, 'B');
    expect(key(deck.element, 'ArrowRight')).toBe(true);
    expect(blackout.hidden).toBe(true);
    expect(deck.playing).toBe(false); // the scene back, where it stood
    key(deck.element, 'ArrowRight');
    expect(deck.playing).toBe(true);
    // A click on the black stage brings it back too.
    deck.pause();
    key(deck.element, 'b');
    find(deck, '.mfe-screen').click();
    expect(blackout.hidden).toBe(true);
    expect(deck.playing).toBe(false);
  });
});

describe('the stage of a deck', () => {
  it('goes on over the wait of a pause that skips it at a click', () => {
    const deck = mounted(skips);
    deck.seek(1.5);
    find(deck, '.mfe-screen').click();
    expect([deck.time, deck.playing]).toEqual([2, true]);
  });

  it('plays and pauses at a click, unless the page’s own handler says otherwise', () => {
    const deck = mounted();
    const screen = find(deck, '.mfe-screen');
    screen.click();
    expect(deck.playing).toBe(true);
    deck.stage!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(deck.playing).toBe(false);
    deck.layer('above')!.addEventListener('click', (event) => event.preventDefault());
    deck
      .layer('above')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(deck.playing).toBe(false);
  });
});

describe('the notes of a deck', () => {
  it('show with S or their button the comments of the slide and the note of its pause', () => {
    const deck = mounted();
    const notes = find(deck, '.mfe-notes');
    expect(notes.getAttribute('role')).toBe('region');
    expect(notes.getAttribute('aria-label')).toBe('Notes');
    expect(notes.hidden).toBe(true);
    expect(key(deck.element, 's')).toBe(true);
    expect(notes.hidden).toBe(false);
    expect(deck.element.hasAttribute('data-mfe-notes')).toBe(true);
    expect(button(deck, 'notes-button').getAttribute('aria-pressed')).toBe('true');
    const rows = () =>
      [...notes.querySelectorAll('.mfe-note')].map(
        (row) =>
          `${row.getAttribute('data-kind')}|${row.querySelector('.mfe-note-label')!.textContent}|${row.querySelector('.mfe-note-text')!.textContent}`,
      );
    expect(notes.querySelector('.mfe-notes-heading')!.textContent).toBe('Slide 1 of 3');
    expect(rows()).toEqual(['comment|Comment · 1.25 s|A flash over the m']);
    deck.seek(1.5); // at the pause: its note
    expect(rows()).toEqual([
      'comment|Comment · 1.25 s|A flash over the m',
      'pause|Pause · 1.50 s|Ask the room',
    ]);
    deck.next(); // on: the next slide, the pause passed
    runFrames(2);
    expect(notes.querySelector('.mfe-notes-heading')!.textContent).toBe('Slide 2 of 3');
    expect(rows()).toEqual(['pause|Pause · 1.50 s|Ask the room']);
    deck.seek(3.5); // a pause without a note, a slide without comments
    expect(rows()).toEqual([]);
    expect(notes.querySelector<HTMLElement>('.mfe-notes-list')!.hidden).toBe(true);
    expect(notes.querySelector<HTMLElement>('.mfe-notes-empty')!.hidden).toBe(false);
    expect(notes.querySelector('.mfe-notes-empty')!.textContent).toBe('No notes on this slide.');
    button(deck, 'notes-button').click();
    expect(notes.hidden).toBe(true);
    expect(deck.element.hasAttribute('data-mfe-notes')).toBe(false);
  });

  it('have no button when the scene has no words for them', () => {
    expect(button(mounted(plain), 'notes-button').hidden).toBe(true);
  });

  it('say in its label that a pause skips its wait', () => {
    const deck = mounted(skips);
    key(deck.element, 's');
    deck.seek(1.5);
    const row = find(deck, '.mfe-note[data-kind="pause"]');
    expect(row.hasAttribute('data-skip-wait')).toBe(true);
    expect(row.querySelector('.mfe-note-label')!.textContent).toBe(
      'Pause · 1.50 s · skips its wait',
    );
    expect(row.querySelector('.mfe-note-text')!.textContent).toBe('Ask the room');
    expect(find(deck, '.mfe-note[data-kind="comment"]').hasAttribute('data-skip-wait')).toBe(false);
  });
});

describe('what a screen reader is told', () => {
  it('says the slide when the deck stops at a pause', async () => {
    const deck = mounted();
    const live = find(deck, '.mfe-live');
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    deck.play();
    runFrames(200);
    await Promise.resolve();
    expect(live.textContent).toBe('Slide 1 of 3');
    // A pause of the reader's own, between two pauses, says nothing.
    deck.play();
    runFrames(10);
    deck.pause();
    await Promise.resolve();
    expect(live.textContent).toBe('Slide 1 of 3');
    // The same slide again is said again.
    deck.seek(1);
    deck.play();
    runFrames(200);
    await Promise.resolve();
    expect(live.textContent).toBe('Slide 1 of 3 ');
  });
});

describe('full screen', () => {
  /** A browser with the standard API, or Safari's prefixed one: the element in full screen is
   * `held`, and a change says so on the document. */
  function fullscreenBrowser(kind: 'standard' | 'prefixed') {
    const state = { held: null as Element | null };
    const change = kind === 'standard' ? 'fullscreenchange' : 'webkitfullscreenchange';
    const request = vi.fn(function (this: Element) {
      state.held = this;
      document.dispatchEvent(new Event(change));
      return Promise.resolve();
    });
    const exit = vi.fn(() => {
      state.held = null;
      document.dispatchEvent(new Event(change));
      return Promise.resolve();
    });
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const doc = document as unknown as Record<string, unknown>;
    const names =
      kind === 'standard'
        ? ['requestFullscreen', 'exitFullscreen', 'fullscreenElement', 'fullscreenEnabled']
        : [
            'webkitRequestFullscreen',
            'webkitExitFullscreen',
            'webkitFullscreenElement',
            'webkitFullscreenEnabled',
          ];
    proto[names[0]!] = request;
    doc[names[1]!] = exit;
    Object.defineProperty(document, names[2]!, { configurable: true, get: () => state.held });
    Object.defineProperty(document, names[3]!, { configurable: true, value: true });
    restore.push(() => {
      delete proto[names[0]!];
      delete doc[names[1]!];
      delete doc[names[2]!];
      delete doc[names[3]!];
    });
    return { state, request, exit };
  }
  const restore: (() => void)[] = [];
  afterEach(() => {
    for (const step of restore.splice(0)) step();
    vi.useRealTimers();
  });

  it('takes the deck full screen and out, and its bar hides while the pointer rests', () => {
    vi.useFakeTimers();
    const browser = fullscreenBrowser('standard');
    const deck = mounted();
    const fullscreen = button(deck, 'fullscreen');
    expect(fullscreen.getAttribute('aria-label')).toBe('Full screen');
    expect(fullscreen.getAttribute('aria-pressed')).toBe('false');
    expect(key(deck.element, 'f')).toBe(true);
    expect(browser.request).toHaveBeenCalledTimes(1);
    expect(browser.state.held).toBe(deck.element);
    expect(deck.element.hasAttribute('data-mfe-fullscreen')).toBe(true);
    expect(fullscreen.getAttribute('aria-pressed')).toBe('true');
    expect(fullscreen.querySelector('.mfe-icon')!.getAttribute('data-icon')).toBe(
      'exit-fullscreen',
    );
    // The pointer rests: the bar goes; it moves: the bar comes back.
    expect(deck.element.hasAttribute('data-mfe-idle')).toBe(false);
    vi.advanceTimersByTime(2600);
    expect(deck.element.hasAttribute('data-mfe-idle')).toBe(true);
    deck.element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    expect(deck.element.hasAttribute('data-mfe-idle')).toBe(false);
    // Never while the bar has the focus.
    button(deck, 'next').focus();
    vi.advanceTimersByTime(10_000);
    expect(deck.element.hasAttribute('data-mfe-idle')).toBe(false);
    button(deck, 'next').blur();
    vi.advanceTimersByTime(2600);
    expect(deck.element.hasAttribute('data-mfe-idle')).toBe(true);
    // Out, by the button.
    fullscreen.click();
    expect(browser.exit).toHaveBeenCalledTimes(1);
    expect(deck.element.hasAttribute('data-mfe-fullscreen')).toBe(false);
    expect(deck.element.hasAttribute('data-mfe-idle')).toBe(false);
    expect(fullscreen.getAttribute('aria-pressed')).toBe('false');
    vi.advanceTimersByTime(10_000);
    expect(deck.element.hasAttribute('data-mfe-idle')).toBe(false);
  });

  it('uses Safari’s prefixed API where the standard one is missing', () => {
    const browser = fullscreenBrowser('prefixed');
    const deck = mounted();
    button(deck, 'fullscreen').click();
    expect(browser.request).toHaveBeenCalledTimes(1);
    expect(deck.element.hasAttribute('data-mfe-fullscreen')).toBe(true);
    key(deck.element, 'F');
    expect(browser.exit).toHaveBeenCalledTimes(1);
    expect(deck.element.hasAttribute('data-mfe-fullscreen')).toBe(false);
  });

  it('is left alone where the page may not have it, as in a frame not allowed it', () => {
    fullscreenBrowser('standard');
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    const deck = mounted();
    expect(button(deck, 'fullscreen')).toBeNull();
    expect(key(deck.element, 'f')).toBe(false);
  });

  it('ends when the controls are taken away', () => {
    const browser = fullscreenBrowser('standard');
    const deck = mounted();
    key(deck.element, 'f');
    deck.destroy();
    expect(browser.exit).toHaveBeenCalledTimes(1);
    expect(deck.element.hasAttribute('data-mfe-fullscreen')).toBe(false);
  });
});

describe('taking the controls away', () => {
  it('stops every listener they added to the document', () => {
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const deck = mounted(marked, { 'data-keys': 'page' });
    const ours = added.mock.calls.map(([type, listener]) => [type, listener]);
    expect(ours.map(([type]) => type)).toEqual(['keydown']);
    deck.destroy();
    for (const [type, listener] of ours) {
      expect(
        removed.mock.calls.some(([t, l]) => t === type && l === listener),
        String(type),
      ).toBe(true);
    }
    expect(key(document.body, 'ArrowRight')).toBe(false);
  });
});
