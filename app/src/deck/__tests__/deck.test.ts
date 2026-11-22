/* The deck in a page (jsdom: no layout, no painting, no animation frames of its own): what
 * mounting a scene builds, its clock with the pauses, its events, the animations a page adds, what
 * it gives of the stage, what it says when the files are wrong, and the registry of the page. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlideMark } from '../../model';
import { MOUNTED, STATE, type Deck } from '../deck';
import { autoMount, MFE } from '../index';
import { resetRegistry } from '../registry';
import { mockFiles, type MockFiles } from './mockDeck';

const marks: SlideMark[] = [
  { id: 'p1', time: 1.5, kind: 'pause', text: 'Ask the room' },
  { id: 'p2', time: 1.25, kind: 'comment', text: 'A flash over the m' },
  { id: 'p3', time: 3.5, kind: 'pause' },
  { id: 'p4', time: 0.5, kind: 'pause' }, // under the intro: left out
];
/** The first pause skips its wait: its rest is [1, 2]. */
const skipping: SlideMark[] = marks.map((mark) =>
  mark.id === 'p1' ? { ...mark, skipWait: true } : mark,
);
/** In the rest [3, 4], a pause that skips its wait up to the next pause of that rest. */
const twoInARest: SlideMark[] = [
  { id: 'p1', time: 3.25, kind: 'pause', skipWait: true },
  { id: 'p2', time: 3.75, kind: 'pause' },
];
let plain: MockFiles;
let marked: MockFiles;
let skips: MockFiles;
let skipsToPause: MockFiles;
beforeAll(async () => {
  plain = await mockFiles();
  marked = await mockFiles(marks);
  skips = await mockFiles(skipping);
  skipsToPause = await mockFiles(twoInARest);
});

/** Animation frames that run when the test says so. */
let frames: FrameRequestCallback[] = [];
function runFrames(stamps: number[]): void {
  for (const stamp of stamps) {
    const pending = frames;
    frames = [];
    for (const callback of pending) callback(stamp);
  }
}
/** Frames a sixtieth of a second apart, from `from` ms, `count` of them. */
const sixtieths = (count: number, from = 0) =>
  Array.from({ length: count }, (_, k) => from + (k * 1000) / 60);

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    frames[handle - 1] = () => {};
  });
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  document.body.innerHTML = '';
});
afterEach(() => {
  resetRegistry();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mounted(files: MockFiles = marked, attributes: Record<string, string> = {}): Deck {
  MFE.glyphs('hello', files.glyphs);
  MFE.scene('hello', files.project);
  const element = document.createElement('div');
  element.className = 'mfe-deck';
  element.setAttribute('data-scene', 'hello');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.append(element);
  return MFE.mount(element);
}

describe('mounting a scene', () => {
  it('builds the screen and the stage in its element, and says what it is doing', () => {
    const deck = mounted();
    expect(deck.element.hasAttribute(MOUNTED)).toBe(true);
    expect(deck.element.getAttribute(STATE)).toBe('paused');
    const screen = deck.element.querySelector('.mfe-screen')!;
    expect(screen.firstElementChild).toBe(deck.stage);
    expect(deck.stage!.getAttribute('class')).toBe('mfe-stage');
    expect(deck.stage!.getAttribute('role')).toBe('img');
    expect(deck.stage!.getAttribute('aria-label')).toBe(marked.project.meta.name);
    expect(deck.element.style.getPropertyValue('--mfe-aspect')).toBe('1920 / 1080');
    expect(deck.element.style.getPropertyValue('--mfe-scene-background')).toBe(
      marked.project.meta.background,
    );
    expect(deck.name).toBe('hello');
    expect(deck.duration).toBe(5);
    expect(deck.fps).toBe(marked.project.meta.fps);
    expect(deck.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(deck.element.querySelector('.mfe-problems')).toBeNull();
    expect(deck.element.querySelectorAll('[id]')).toHaveLength(0);
    // Drawn at once: the scene at its start.
    expect(deck.stage!.getAttribute('viewBox')).not.toBeNull();
  });

  it('carries the pauses and the comments that stand, in order', () => {
    const deck = mounted();
    expect(deck.pauses).toEqual([
      { time: 1.5, note: 'Ask the room', resume: 1.5 },
      { time: 3.5, note: '', resume: 3.5 },
    ]);
    expect(deck.comments).toEqual([{ time: 1.25, text: 'A flash over the m' }]);
    expect(deck.slides).toBe(3);
    expect(deck.slide).toBe(0);
    expect(mounted(plain).slides).toBe(1);
  });

  it('reads its options from its attributes, and from what mount is given', () => {
    const deck = mounted(marked, {
      'data-controls': 'none',
      'data-start': '2',
      'data-pauses': 'off',
      'data-background': 'transparent',
    });
    expect(deck.options).toMatchObject({ controls: 'none', start: 2, pauses: false });
    expect(deck.time).toBe(2);
    expect(deck.through).toBe(true);
    expect(deck.element.style.getPropertyValue('--mfe-scene-background')).toBe('transparent');
    const element = document.createElement('div');
    document.body.append(element);
    const other = MFE.mount(element, { speed: 2, start: 99 });
    expect(other.speed).toBe(2);
    expect(other.time).toBe(5); // held inside the scene
    expect(other.name).toBe('hello'); // the only scene loaded
  });

  it('draws on a canvas when asked, with the free layers over it', () => {
    const deck = mounted(marked, { 'data-renderer': 'canvas' });
    expect(deck.stage!.tagName).toBe('CANVAS');
    expect(deck.clip('a1')).toBeNull();
    expect(deck.flights()).toEqual([]);
    expect(deck.layer('above')!.parentElement!.getAttribute('class')).toBe('mfe-layers');
    expect(deck.layer('below')!.nextElementSibling).toBe(deck.layer('above'));
  });

  it('gives the element back when it is destroyed', () => {
    const deck = mounted();
    const { element } = deck;
    deck.play();
    deck.destroy();
    expect(element.children).toHaveLength(0);
    expect(element.hasAttribute(MOUNTED)).toBe(false);
    expect(element.hasAttribute(STATE)).toBe(false);
    expect(element.style.getPropertyValue('--mfe-aspect')).toBe('');
    expect(MFE.decks).toEqual([]);
    runFrames(sixtieths(3)); // nothing left running
    expect(deck.time).toBe(0);
    // And it can be mounted again.
    expect(MFE.mount(element)).not.toBe(deck);
  });
});

describe('the clock of a deck', () => {
  it('plays to the first pause and stops exactly there', () => {
    const deck = mounted();
    const heard: string[] = [];
    for (const event of ['play', 'pause', 'slide', 'end'] as const) {
      deck.on(event, () => heard.push(`${event}@${deck.time.toFixed(2)}`));
    }
    deck.play();
    expect(deck.playing).toBe(true);
    expect(deck.element.getAttribute(STATE)).toBe('playing');
    runFrames(sixtieths(60));
    expect(deck.time).toBeCloseTo(59 / 60, 6);
    runFrames(sixtieths(60, 1000));
    expect(deck.time).toBe(1.5);
    expect(deck.playing).toBe(false);
    expect(deck.element.getAttribute(STATE)).toBe('paused');
    expect(deck.slide).toBe(0);
    expect(heard).toEqual(['play@0.00', 'pause@1.50']);
  });

  it('goes on from a pause to the next, and from the last to the end', () => {
    const deck = mounted();
    const heard: string[] = [];
    for (const event of ['slide', 'end'] as const) {
      deck.on(event, () => heard.push(`${event}:${deck.slide}@${deck.time.toFixed(2)}`));
    }
    deck.seek(1.5);
    deck.next();
    expect(deck.playing).toBe(true);
    runFrames(sixtieths(200));
    expect(deck.time).toBe(3.5);
    expect(deck.slide).toBe(1);
    deck.next();
    runFrames(sixtieths(200));
    expect(deck.time).toBe(5);
    expect(deck.playing).toBe(false);
    expect(deck.element.getAttribute(STATE)).toBe('ended');
    expect(deck.slide).toBe(2);
    expect(heard.filter((line) => line.startsWith('slide'))).toHaveLength(2);
    expect(heard.at(-1)).toBe('end:2@5.00');
    // At the end, going on does nothing; playing starts again from the start.
    deck.next();
    expect(deck.playing).toBe(false);
    deck.play();
    expect(deck.time).toBe(0);
    expect(deck.slide).toBe(0);
  });

  it('jumps to the next pause when it is told to go on while it plays', () => {
    const deck = mounted();
    deck.play();
    runFrames(sixtieths(10));
    deck.next();
    expect(deck.time).toBe(1.5);
    expect(deck.playing).toBe(false);
  });

  it('goes back to the pause before, and to the start', () => {
    const deck = mounted();
    deck.seek(4);
    deck.previous();
    expect(deck.time).toBe(3.5);
    deck.previous();
    expect(deck.time).toBe(1.5);
    deck.previous();
    expect(deck.time).toBe(0);
    deck.previous();
    expect(deck.time).toBe(0);
  });

  it('plays through the pauses when told to, and at another speed', () => {
    const deck = mounted();
    deck.through = true;
    deck.speed = 2;
    deck.play();
    runFrames(sixtieths(61));
    expect(deck.time).toBeCloseTo(2, 6);
    expect(deck.playing).toBe(true);
    expect(deck.slide).toBe(1);
  });

  it('seeks, held inside the scene, and stays there', () => {
    const deck = mounted();
    deck.play();
    deck.seek(2.25);
    expect(deck.playing).toBe(false);
    expect(deck.time).toBe(2.25);
    expect(deck.slide).toBe(1);
    deck.seek(-3);
    expect(deck.time).toBe(0);
    deck.seek(99);
    expect(deck.time).toBe(5);
    deck.seek(Number.NaN);
    expect(deck.time).toBe(0);
  });

  it('loops when asked', () => {
    const deck = mounted(plain, { 'data-loop': '' });
    deck.seek(4.99);
    deck.play();
    runFrames(sixtieths(4));
    expect(deck.playing).toBe(true);
    expect(deck.time).toBeLessThan(1);
  });

  it('says at which pause it stands: not while it plays, nor anywhere else', () => {
    const deck = mounted();
    expect(deck.atPause).toBeNull(); // at 0 s, where no pause is
    deck.play();
    runFrames(sixtieths(60));
    expect(deck.atPause).toBeNull(); // playing
    runFrames(sixtieths(60, 1000));
    expect(deck.time).toBe(1.5);
    expect(deck.atPause).toBe(0); // it came to stand at the first
    deck.next();
    expect(deck.atPause).toBeNull(); // on its way
    runFrames(sixtieths(200));
    expect(deck.atPause).toBe(1);
    deck.seek(1.5 + 1e-7); // within the deck's tolerance
    expect(deck.atPause).toBe(0);
    deck.seek(1.51);
    expect(deck.atPause).toBeNull();
    // Played through, a pause is passed, not stood at; paused there, it is.
    deck.through = true;
    deck.seek(1);
    deck.play();
    runFrames(sixtieths(60));
    expect(deck.time).toBeGreaterThan(1.5);
    expect(deck.atPause).toBeNull();
    deck.seek(3.5);
    expect(deck.atPause).toBe(1);
    // Mounted at a pause, it stands there before anything happens.
    expect(mounted(marked, { 'data-start': '3.5' }).atPause).toBe(1);
    expect(mounted(plain).atPause).toBeNull();
  });

  it('says change after every event and when a setting changes', () => {
    const deck = mounted();
    let changes = 0;
    const stop = deck.on('change', () => changes++);
    deck.speed = 2;
    deck.through = true;
    deck.muted = true;
    expect(changes).toBe(3);
    deck.speed = 2; // the same: nothing changed
    expect(changes).toBe(3);
    deck.seek(1); // a time
    expect(changes).toBe(4);
    stop();
    deck.seek(2);
    expect(changes).toBe(4);
  });

  it('keeps playing when a listener throws, and says so', () => {
    const deck = mounted();
    deck.on('time', () => {
      throw new Error('mine');
    });
    deck.play();
    runFrames(sixtieths(3));
    expect(deck.time).toBeGreaterThan(0);
    expect(errors).toHaveBeenCalled();
  });
});

describe('a pause that skips its wait', () => {
  it('says where the scene goes on from each pause', () => {
    expect(mounted(skips).pauses).toEqual([
      { time: 1.5, note: 'Ask the room', resume: 2 },
      { time: 3.5, note: '', resume: 3.5 },
    ]);
  });

  it('goes on from the end of its wait where the deck stopped at it', () => {
    const deck = mounted(skips);
    const heard: string[] = [];
    for (const event of ['play', 'pause', 'slide'] as const) {
      deck.on(event, () => heard.push(`${event}:${deck.slide}@${deck.time.toFixed(2)}`));
    }
    deck.play();
    runFrames(sixtieths(120));
    expect([deck.time, deck.atPause]).toEqual([1.5, 0]);
    // On at once, before a frame is drawn: the rest [1.5, 2] is not played.
    deck.play();
    expect([deck.time, deck.playing, deck.slide, deck.atPause]).toEqual([2, true, 1, null]);
    expect(heard.slice(-2)).toEqual(['slide:1@2.00', 'play:1@2.00']);
    runFrames(sixtieths(200, 5000));
    expect(deck.time).toBe(3.5);
    // Every way of going on: next, toggle.
    deck.seek(1.5);
    deck.next();
    expect([deck.time, deck.playing]).toEqual([2, true]);
    deck.seek(1.5);
    deck.toggle();
    expect([deck.time, deck.playing]).toEqual([2, true]);
    // A pause that keeps its wait: from where it stands.
    deck.seek(3.5);
    deck.next();
    expect(deck.time).toBe(3.5);
  });

  it('keeps it played through, and a seek into it shows its instants', () => {
    const deck = mounted(skips);
    deck.through = true;
    deck.seek(1.5);
    deck.play();
    expect(deck.time).toBe(1.5);
    runFrames(sixtieths(11));
    expect(deck.time).toBeCloseTo(1.5 + 10 / 60, 6);
    // Played from the start through the pause: on into its wait.
    deck.seek(0);
    deck.play();
    runFrames(sixtieths(101));
    expect(deck.time).toBeCloseTo(100 / 60, 6);
    // The page's pauses off: through from the start.
    const off = mounted(skips, { 'data-pauses': 'off' });
    off.seek(1.5);
    off.play();
    expect(off.time).toBe(1.5);
    // Turned on again, they are in force.
    off.pause();
    off.through = false;
    off.seek(1.5);
    off.play();
    expect(off.time).toBe(2);
    // Inside the wait: that instant, and on from it.
    deck.through = false;
    deck.seek(1.75);
    expect([deck.time, deck.atPause]).toEqual([1.75, null]);
    deck.play();
    expect(deck.time).toBe(1.75);
    expect(deck.duration).toBe(5);
  });

  it('jumps to it while playing, goes back to it after the jump, and starts at it', () => {
    const deck = mounted(skips);
    deck.play();
    runFrames(sixtieths(10));
    deck.next(); // while it plays: to the pause, not past its wait
    expect([deck.time, deck.playing]).toEqual([1.5, false]);
    deck.next();
    expect(deck.time).toBe(2);
    runFrames(sixtieths(3));
    deck.previous(); // just after the jump: back to the pause
    expect([deck.time, deck.atPause]).toEqual([1.5, 0]);
    deck.previous();
    expect(deck.time).toBe(0);
    // A page that starts at it stands at it, and goes on from the end of its wait.
    const started = mounted(skips, { 'data-start': '1.5' });
    expect(started.atPause).toBe(0);
    started.play();
    expect(started.time).toBe(2);
  });

  it('stands at once at the next pause when its wait ends there', () => {
    const deck = mounted(skipsToPause);
    expect(deck.pauses.map((pause) => [pause.time, pause.resume])).toEqual([
      [3.25, 3.75],
      [3.75, 3.75],
    ]);
    deck.seek(3.25);
    const heard: string[] = [];
    for (const event of ['play', 'pause', 'slide'] as const) {
      deck.on(event, () => heard.push(`${event}@${deck.time.toFixed(2)}`));
    }
    deck.next();
    expect([deck.time, deck.playing, deck.atPause, deck.slide]).toEqual([3.75, false, 1, 1]);
    expect(deck.element.getAttribute(STATE)).toBe('paused');
    expect(heard).toEqual(['slide@3.75', 'play@3.75', 'pause@3.75']);
    expect(frames).toHaveLength(0); // nothing left running
    deck.next(); // and on from there, as from any pause
    expect([deck.time, deck.playing]).toEqual([3.75, true]);
  });

  it('takes the sound to the end of the wait', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    MFE.glyphs('hello', skips.glyphs);
    MFE.scene('hello', skips.project, { audio: 'audio.m4a' });
    const element = document.createElement('div');
    element.setAttribute('data-scene', 'hello');
    document.body.append(element);
    const deck = MFE.mount(element);
    const audio = element.querySelector('audio')!;
    let at = 0;
    Object.defineProperty(audio, 'currentTime', {
      get: () => at,
      set: (value: number) => (at = value),
    });
    deck.seek(1.5);
    expect(at).toBe(1.5);
    deck.play();
    expect(at).toBe(2);
  });

  it('jumps over what an animation of the page does in its wait', () => {
    const deck = mounted(skips);
    const times: number[] = [];
    deck.animate({ from: 1.5, to: 2, update: (_, time) => times.push(time) });
    deck.seek(1.5);
    times.length = 0;
    deck.play();
    runFrames(sixtieths(3));
    expect(times.some((time) => time > 1.5 && time < 2)).toBe(false);
    expect(times[0]).toBe(2);
    // Played through, it is seen.
    deck.through = true;
    deck.seek(1.5);
    times.length = 0;
    deck.play();
    runFrames(sixtieths(3));
    expect(times.some((time) => time > 1.5 && time < 2)).toBe(true);
  });
});

describe('extending a scene', () => {
  it('runs an animation of the page’s own as a function of the scene’s time', () => {
    const deck = mounted();
    const calls: [number, number][] = [];
    const remove = deck.animate({
      from: 1,
      to: 2,
      update: (progress, time) => calls.push([progress, time]),
    });
    expect(calls.at(-1)).toEqual([0, 0]); // drawn when it is added
    deck.seek(1.5);
    expect(calls.at(-1)).toEqual([0.5, 1.5]);
    deck.seek(4);
    expect(calls.at(-1)).toEqual([1, 4]);
    deck.seek(0.5); // back: right again
    expect(calls.at(-1)).toEqual([0, 0.5]);
    remove();
    const count = calls.length;
    deck.seek(1.75);
    expect(calls).toHaveLength(count);
  });

  it('eases it with one of Manim’s rate functions, or with a function', () => {
    const deck = mounted();
    let smooth = -1;
    let own = -1;
    deck.animate({ from: 0, to: 4, ease: 'smooth', update: (progress) => (smooth = progress) });
    deck.animate({ from: 0, to: 4, ease: (t) => t * t, update: (progress) => (own = progress) });
    deck.seek(1);
    expect(smooth).toBeCloseTo(MFE.rates.smooth(0.25), 9);
    expect(smooth).not.toBeCloseTo(0.25, 3);
    expect(own).toBeCloseTo(0.0625, 9);
  });

  it('ends an animation where its easing ends: one that comes back is back', () => {
    const deck = mounted();
    let pulse = -1;
    deck.animate({
      from: 1,
      to: 2,
      ease: 'there_and_back',
      update: (progress) => (pulse = progress),
    });
    expect(pulse).toBe(0);
    deck.seek(1.5);
    expect(pulse).toBeCloseTo(1, 9);
    deck.seek(4); // after it: back where it started, not left at its peak
    expect(pulse).toBeCloseTo(0, 9);
    // An animation of no length is at its end from its instant on.
    let step = -1;
    deck.animate({ from: 2, to: 2, update: (progress) => (step = progress) });
    expect(step).toBe(1);
    deck.seek(1.9);
    expect(step).toBe(0);
  });

  it('gives the group of a clip by its name or its id, and the flights between two', () => {
    const deck = mounted();
    const [a, b] = marked.project.clips;
    expect(deck.clip('a1')!.getAttribute('data-clip')).toBe('a1');
    expect(deck.clip(a!.id)).toBe(deck.clip('a1'));
    expect(deck.clip('nothing')).toBeNull();
    expect(deck.flights()).toHaveLength(1);
    expect(deck.flights('a1', 'f2')).toEqual(deck.flights());
    expect(deck.flights(a!.id, b!.id)).toEqual(deck.flights());
    expect(deck.flights('f2', 'a1')).toEqual([]);
    expect(deck.flights('f2')).toEqual([]);
    expect(deck.layer('above')).toBe(deck.stage!.lastElementChild);
  });

  it('says in the console, once, that a name is no clip of the scene, with the names it has', () => {
    const deck = mounted();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear(); // what mounting said (a pause out of place)
    expect(deck.clip('a1')).not.toBeNull();
    expect(deck.clip(marked.project.clips[0]!.id)).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(deck.clip('equation')).toBeNull();
    expect(deck.clip('equation')).toBeNull();
    expect(deck.box('equation')).toBeNull();
    expect(warn.mock.calls).toEqual([
      [
        '[MFE] hello: the scene has no clip named "equation". Its clips: a1, f2 (the head comment of scene.js lists them).',
      ],
    ]);
    // Each name once: another is said too.
    expect(deck.flights('a1', 'eq2')).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[1]![0])).toContain('no clip named "eq2"');
  });

  it('says where a clip and a glyph are, in the stage’s units: y down', () => {
    const deck = mounted();
    expect(deck.box('f2')).toBeNull(); // not on screen at 0 s
    deck.seek(1.5);
    const box = deck.box('a1')!;
    expect(box.width).toBeGreaterThan(0);
    expect(box.cx).toBeCloseTo(box.x + box.width / 2, 9);
    expect(box.cy).toBeCloseTo(box.y + box.height / 2, 9);
    const glyph = deck.glyphBox('a1', 0)!;
    expect(glyph.x).toBeGreaterThanOrEqual(box.x - 1e-9);
    expect(glyph.y).toBeGreaterThanOrEqual(box.y - 1e-9);
    expect(glyph.y + glyph.height).toBeLessThanOrEqual(box.y + box.height + 1e-9);
    expect(deck.glyphBox('a1', 99)).toBeNull();
    // At another time, without going there.
    expect(deck.box('f2', 3.5)).not.toBeNull();
    expect(deck.time).toBe(1.5);
  });
});

describe('a scene whose files are wrong', () => {
  it('says that no scene of the name was loaded', () => {
    const element = document.createElement('div');
    element.setAttribute('data-scene', 'nothing');
    document.body.append(element);
    const deck = MFE.mount(element);
    expect(deck.stage).toBeNull();
    expect(deck.project).toBeNull();
    expect(element.querySelector('.mfe-problems')!.getAttribute('role')).toBe('alert');
    expect(element.querySelector('.mfe-problems')!.textContent).toContain(
      'No scene named "nothing" was loaded',
    );
    expect(errors).toHaveBeenCalled();
    // Its commands do nothing, and do not throw.
    deck.play();
    deck.next();
    deck.seek(3);
    expect(deck.time).toBe(0);
    expect(deck.duration).toBe(0);
  });

  it('lists what the scene file has wrong, where, in the page and in the console', () => {
    const broken = structuredClone(marked);
    (broken.project.clips[0]!.intro as { kind: string }).kind = 'explode';
    const deck = mounted(broken);
    const panel = deck.element.querySelector('.mfe-problems')!;
    expect(panel.querySelector('.mfe-problems-title')!.textContent).toBe(
      'This scene has a problem:',
    );
    expect(panel.querySelector('code')!.textContent).toBe('scene.js · clips[0].intro.kind');
    expect(errors.mock.calls.flat().join(' ')).toContain(
      '[MFE] hello: scene.js · clips[0].intro.kind',
    );
    expect(deck.problems).toHaveLength(1);
  });

  it('draws what it can of a scene that changed a formula, and says which', () => {
    const edited = structuredClone(marked);
    edited.project.formulas[0]!.source = 'x^2';
    const deck = mounted(edited);
    expect(deck.stage).not.toBeNull();
    expect(deck.element.querySelector('.mfe-problems')!.textContent).toContain(
      '"a1" changed its source since the scene was exported',
    );
  });
});

describe('the scenes and the decks of a page', () => {
  it('mounts every deck of the page once its scripts have run, each once', () => {
    MFE.glyphs('hello', marked.glyphs);
    MFE.scene('hello', marked.project);
    document.body.innerHTML =
      '<div class="mfe-deck" data-scene="hello"></div><p></p><div class="mfe-deck" data-scene="hello"></div>';
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    autoMount(document);
    expect(MFE.decks).toHaveLength(0);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(MFE.decks).toHaveLength(2);
    window.dispatchEvent(new Event('load'));
    expect(MFE.decks).toHaveLength(2);
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    autoMount(document);
    expect(MFE.decks).toHaveLength(2);
    expect(MFE.mountAll()).toEqual([]);
    expect(MFE.scenes).toEqual(['hello']);
  });

  it('mounts by a selector, gives the deck an element has, and refuses what is no element', () => {
    const deck = mounted();
    expect(MFE.mount('.mfe-deck')).toBe(deck);
    expect(MFE.mount(deck.element)).toBe(deck);
    expect(() => MFE.mount('#nothing')).toThrow('nothing in the page matches "#nothing"');
  });

  it('two scenes live in one page, each with its own clock', () => {
    const first = mounted(marked);
    MFE.glyphs('other', plain.glyphs);
    MFE.scene('other', plain.project);
    const element = document.createElement('div');
    element.className = 'mfe-deck';
    element.setAttribute('data-scene', 'other');
    document.body.append(element);
    const second = MFE.mount(element);
    first.seek(1);
    second.seek(4);
    expect([first.time, second.time]).toEqual([1, 4]);
    expect([first.slides, second.slides]).toEqual([3, 1]);
    expect(document.querySelectorAll('[id]')).toHaveLength(0);
  });

  it('reads the sound from beside the scene file, plays it with the scene and stops it with it', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    MFE.glyphs('hello', marked.glyphs);
    MFE.scene('hello', marked.project, { audio: 'audio.m4a' });
    const element = document.createElement('div');
    element.setAttribute('data-scene', 'hello');
    document.body.append(element);
    const deck = MFE.mount(element);
    const audio = element.querySelector('audio')!;
    expect(deck.hasSound).toBe(true);
    expect(audio.src).toBe(new URL('audio.m4a', document.baseURI).href);
    deck.play();
    expect(play).toHaveBeenCalledTimes(1);
    deck.muted = true;
    expect(audio.muted).toBe(true);
    deck.speed = 2;
    expect(audio.playbackRate).toBe(2);
    deck.pause();
    expect(pause).toHaveBeenCalled();
    expect(mounted(plain).hasSound).toBe(false);
  });

  it('starts by itself when it comes on screen, and never for a reader who asked for less motion', () => {
    const observed: {
      callback: IntersectionObserverCallback;
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect = vi.fn();
        constructor(callback: IntersectionObserverCallback) {
          observed.push({ callback, disconnect: this.disconnect });
        }
        observe() {}
      },
    );
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const deck = mounted(marked, { 'data-autoplay': '' });
    expect(deck.playing).toBe(false);
    observed[0]!.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(deck.playing).toBe(true);
    expect(observed[0]!.disconnect).toHaveBeenCalled();
    resetRegistry();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(mounted(marked, { 'data-autoplay': '' }).playing).toBe(false);
    expect(observed).toHaveLength(1);
  });
});
