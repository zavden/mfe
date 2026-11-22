/* The DOM player (jsdom: no layout, no canvas, no animation frames of its own): what mounting a
 * figure makes of it — the controls and their names, the state in data attributes, the options of
 * its attributes, the keys —, a missing example's notice, `mountAll` that mounts each figure once,
 * and `destroy` that gives the figure back. Drawing itself is the engine's (engine.test.ts); the
 * real browser runs `docs/web/tools/examples.mjs check`. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOUNTED, mount, mountAll } from '../player';
import { autoMount, MFEPlayer } from '../index';
import type { ExampleData } from '../data';
import { mockExampleData } from './mockExample';

let hello: ExampleData;

beforeAll(async () => {
  hello = await mockExampleData('hello');
});

/** Animation frames that run when the test says so. */
let frames: FrameRequestCallback[] = [];
function runFrames(times: number[]): void {
  for (const stamp of times) {
    const pending = frames;
    frames = [];
    for (const callback of pending) callback(stamp);
  }
}

beforeEach(() => {
  window.MFE_EXAMPLES = { hello };
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // jsdom has no 2D context: the engine draws nothing, as it says it does then.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

afterEach(() => {
  document.body.replaceChildren();
  delete window.MFE_EXAMPLES;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function figure(attributes: Record<string, string>, inner = ''): HTMLElement {
  const element = document.createElement('figure');
  element.className = 'mfe-player';
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.innerHTML = inner;
  document.body.append(element);
  return element;
}

/** A key pressed on `target`: one the page may still cancel, as a real one is. */
const key = (target: Element, name: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe('a mounted player', () => {
  it('has the transport, named for assistive technology, and says how it stands', () => {
    const element = figure({ 'data-mfe-player': 'hello' });
    const player = mount(element)!;
    expect(player).not.toBeNull();
    expect(element.hasAttribute(MOUNTED)).toBe(true);
    expect(element.mfePlayer).toBe(player);
    expect(element.querySelector('canvas')!.getAttribute('aria-label')).toBe(
      'Animation: Hello: one-to-one. A test example.',
    );
    const bar = element.querySelector('[role="toolbar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('Playback of Hello: one-to-one');
    const names = [...bar.querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    );
    expect(names).toEqual(['Back to the start', 'Play', 'Loop', '0.5×', '1×', '2×']);
    const slider = element.querySelector('[role="slider"]')!;
    expect(slider.getAttribute('aria-valuemax')).toBe('5.00');
    expect(slider.getAttribute('aria-valuetext')).toBe('0.00 seconds of 5.00');
    expect(element.dataset).toMatchObject({ time: '0.000', progress: '0.000', playing: 'false' });
    expect(element.querySelector('[role="radio"][aria-checked="true"]')!.textContent).toBe('1×');
    expect(document.getElementById('mfe-player-style')).not.toBeNull();
  });

  it('plays with Play, moves with the frames and stops at the end', () => {
    const element = figure({ 'data-mfe-player': 'hello' });
    const player = mount(element)!;
    (element.querySelector('[data-action="play"]') as HTMLButtonElement).click();
    expect(player.playing).toBe(true);
    expect(element.dataset.playing).toBe('true');
    expect(element.querySelector('[data-action="play"]')!.getAttribute('aria-label')).toBe('Pause');
    runFrames([1000, 1050, 1100]);
    expect(player.time).toBeCloseTo(0.1, 6);
    expect(element.dataset.time).toBe('0.100');
    expect(element.dataset.progress).toBe('0.020');
    // To the end: 5 s at 0.1 s a frame.
    runFrames(Array.from({ length: 60 }, (_, i) => 1200 + i * 100));
    expect(player.playing).toBe(false);
    expect(player.time).toBe(5);
    expect(element.dataset.playing).toBe('false');
  });

  it('takes Space and K where it has the focus, and the arrows step a frame', () => {
    const element = figure({ 'data-mfe-player': 'hello' });
    const player = mount(element)!;
    const slider = element.querySelector<HTMLElement>('[role="slider"]')!;
    key(slider, ' ');
    expect(player.playing).toBe(true);
    key(slider, 'k');
    expect(player.playing).toBe(false);
    key(slider, 'ArrowRight');
    expect(player.time).toBeCloseTo(1 / 60, 9);
    key(slider, 'ArrowRight', { shiftKey: true });
    expect(player.time).toBeCloseTo(1 + 1 / 60, 9);
    key(slider, 'End');
    expect(player.time).toBe(5);
    key(slider, 'Home');
    expect(player.time).toBe(0);
    // Space on a button is the button's: Loop toggles, playback does not start.
    const loop = element.querySelector<HTMLButtonElement>('[data-action="loop"]')!;
    key(loop, ' ');
    expect(player.playing).toBe(false);
    loop.click();
    expect(loop.getAttribute('aria-pressed')).toBe('true');
  });

  it('steps a frame with ↑ and ↓ on its time bar, as a slider does, and leaves them to the page elsewhere', () => {
    const element = figure({ 'data-mfe-player': 'hello' });
    const player = mount(element)!;
    const slider = element.querySelector<HTMLElement>('[role="slider"]')!;
    key(slider, 'ArrowRight');
    expect(player.time).toBeCloseTo(1 / 60, 9);
    // ↑ is → and ↓ is ← (WAI-ARIA's slider), and the page does not scroll with them.
    const up = key(slider, 'ArrowUp');
    expect(player.time).toBeCloseTo(2 / 60, 9);
    expect(up.defaultPrevented).toBe(true);
    const down = key(slider, 'ArrowDown');
    expect(player.time).toBeCloseTo(1 / 60, 9);
    expect(down.defaultPrevented).toBe(true);
    key(slider, 'ArrowUp', { shiftKey: true });
    expect(player.time).toBeCloseTo(1 + 1 / 60, 9);
    // Anywhere else in the player they are the page's: on the scene, on a button.
    for (const target of [
      element.querySelector('.mfe-player-stage')!,
      element.querySelector('[data-action="play"]')!,
    ]) {
      for (const name of ['ArrowUp', 'ArrowDown']) {
        expect(key(target, name).defaultPrevented, `${name} on ${target.className}`).toBe(false);
      }
    }
    expect(player.time).toBeCloseTo(1 + 1 / 60, 9);
    // A scene with no controls leaves them to the page too, and takes ← and →.
    const none = figure({ 'data-mfe-player': 'hello', 'data-controls': 'none' });
    const bare = mount(none)!;
    const stage = none.querySelector<HTMLElement>('.mfe-player-stage')!;
    expect(key(stage, 'ArrowDown').defaultPrevented).toBe(false);
    expect(bare.time).toBe(0);
    expect(key(stage, 'ArrowRight').defaultPrevented).toBe(true);
    expect(bare.time).toBeCloseTo(1 / 60, 9);
    // The time bar's tooltip names them.
    expect(slider.title).toBe('Time (← → ↑ ↓: a frame, Shift: a second; Home, End)');
  });

  it('changes speed with its radio group, by click and by arrow keys', () => {
    const element = figure({ 'data-mfe-player': 'hello' });
    mount(element);
    const options = [...element.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    options[2]!.click();
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    key(options[2]!, 'ArrowLeft');
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(options[1]!.tabIndex).toBe(0);
    expect(options[0]!.tabIndex).toBe(-1);
  });

  it('plays the part of its range, from its start, and shows the start it is given', () => {
    const element = figure({
      'data-mfe-player': 'hello',
      'data-from': '1',
      'data-to': '3',
      'data-start': 'end',
    });
    const player = mount(element)!;
    expect(player.range).toEqual({ start: 1, end: 3 });
    expect(player.time).toBe(3);
    expect(element.querySelector('.mfe-player-time')!.textContent).toBe('3.00 / 3.00 s');
    player.play();
    expect(player.time).toBe(1); // from the start again, as at the end of a video
  });

  it('has the strip with data-timeline, and the controls data-controls asks for', () => {
    const full = figure({ 'data-mfe-player': 'hello', 'data-timeline': '' });
    mount(full);
    expect(full.querySelector('[data-testid="mfe-strip"]')).not.toBeNull();
    const minimal = figure({ 'data-mfe-player': 'hello', 'data-controls': 'minimal' });
    mount(minimal);
    expect(
      [...minimal.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Play']);
    expect(minimal.querySelector('[role="slider"]')).not.toBeNull();
    const none = figure({ 'data-mfe-player': 'hello', 'data-controls': 'none' });
    const player = mount(none)!;
    expect(none.querySelector('[role="toolbar"]')).toBeNull();
    const stage = none.querySelector<HTMLElement>('.mfe-player-stage')!;
    expect(stage.getAttribute('role')).toBe('button');
    expect(stage.tabIndex).toBe(0);
    key(stage, 'Enter');
    expect(player.playing).toBe(true);
    expect(stage.getAttribute('aria-label')).toBe('Pause the animation Hello: one-to-one');
  });

  it('lets a finger on its strip scroll the page: a tap seeks, a swipe changes nothing', () => {
    // A laid-out page, so that the strip is drawn (640 px wide: 112.8 px a second after its
    // column of names).
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
    const element = figure({ 'data-mfe-player': 'hello', 'data-timeline': '' });
    const player = mount(element)!;
    const strip = element.querySelector<HTMLElement>('[data-testid="mfe-strip"]')!;
    const touch = (type: string, x: number, y: number) =>
      strip.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 3,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          button: 0,
          bubbles: true,
          cancelable: true,
        }),
      );
    player.play();
    runFrames([1000, 1050]);
    expect(player.time).toBeCloseTo(0.05, 6);
    // A swipe up that the browser takes for the page: it cancels the touch.
    touch('pointerdown', 300, 60);
    touch('pointermove', 303, 30);
    touch('pointercancel', 0, 0);
    expect(player.time).toBeCloseTo(0.05, 6);
    expect(player.playing).toBe(true);
    // A tap seeks where it lands, and playback goes on from there.
    touch('pointerdown', 300, 60);
    touch('pointerup', 301, 61);
    expect(player.time).toBeCloseTo((301 - 76) / 112.8, 6);
    expect(player.playing).toBe(true);
  });

  it('seeks where its scrub bar is pressed, and leaves a Mac’s click with Ctrl to the menu', () => {
    const element = figure({ 'data-mfe-player': 'hello' });
    const player = mount(element)!;
    const scrub = element.querySelector<HTMLElement>('.mfe-player-scrub')!;
    scrub.getBoundingClientRect = () => new DOMRect(100, 0, 500, 12);
    /** A press of the main button at `x`; whether the page took it. */
    const press = (x: number, ctrlKey: boolean) =>
      !scrub.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 1,
          button: 0,
          ctrlKey,
          clientX: x,
          bubbles: true,
          cancelable: true,
        }),
      );
    const lift = () =>
      scrub.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    // The bar runs over the whole scene, from 0.
    const length = Number(scrub.getAttribute('aria-valuemax'));
    expect(length).toBeGreaterThan(0);
    // A fifth of the way along the bar.
    expect(press(200, false)).toBe(true);
    expect(player.time).toBeCloseTo(length / 5, 6);
    expect(scrub.classList.contains('is-dragging')).toBe(true);
    lift();
    expect(scrub.classList.contains('is-dragging')).toBe(false);
    // On a Mac a click with Ctrl is the secondary click: the press is the menu's.
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(press(400, true)).toBe(false);
    expect(player.time).toBeCloseTo(length / 5, 6);
    expect(scrub.classList.contains('is-dragging')).toBe(false);
    // Elsewhere Ctrl is a key held with the press.
    platform.mockReturnValue('Win32');
    expect(press(400, true)).toBe(true);
    expect(player.time).toBeCloseTo((length * 3) / 5, 6);
    lift();
  });

  it('keeps the figure’s caption, or adds the one of data-caption', () => {
    const own = figure(
      { 'data-mfe-player': 'hello', 'data-caption': 'ignored' },
      '<p>fallback</p><figcaption>Mine</figcaption>',
    );
    mount(own);
    expect(own.querySelector('p')).toBeNull();
    expect([...own.querySelectorAll('figcaption')].map((c) => c.textContent)).toEqual(['Mine']);
    expect(own.lastElementChild!.tagName).toBe('FIGCAPTION');
    const given = figure({ 'data-mfe-player': 'hello', 'data-caption': 'Solving for x.' });
    mount(given);
    expect(given.querySelector('figcaption')!.textContent).toBe('Solving for x.');
  });

  it('gives the figure back as it was when destroyed', () => {
    const element = figure({ 'data-mfe-player': 'hello' }, '<p>fallback</p>');
    const player = mount(element)!;
    player.destroy();
    expect(element.innerHTML).toBe('<p>fallback</p>');
    expect(element.hasAttribute(MOUNTED)).toBe(false);
    expect(element.dataset.time).toBeUndefined();
    expect(element.mfePlayer).toBeUndefined();
  });

  it('gives back every attribute the figure had, and none it had not', () => {
    // A figure without the class (the player adds it) and with options the player writes over.
    const element = document.createElement('figure');
    element.innerHTML = '<p>fallback</p><figcaption>Mine</figcaption>';
    element.setAttribute('data-mfe-player', 'hello');
    element.setAttribute('id', 'own');
    element.setAttribute('data-controls', 'minimal');
    element.setAttribute('data-timeline', '');
    element.setAttribute('data-start', '1.5');
    document.body.append(element);
    const before = element.outerHTML;
    const player = mount(element, { controls: 'none' })!;
    expect(element.classList.contains('mfe-player')).toBe(true);
    expect(element.dataset.controls).toBe('none');
    player.play();
    player.destroy();
    expect(element.hasAttribute('class')).toBe(false);
    expect(element.outerHTML).toBe(before);
    // One that had the class keeps it.
    const own = figure({ 'data-mfe-player': 'hello', 'data-controls': 'minimal' });
    const kept = own.outerHTML;
    mount(own)!.destroy();
    expect(own.outerHTML).toBe(kept);
  });

  it('mounts again with the options of its attributes after destroy, as a widget does', () => {
    // EXAMPLES.md, 5.4: `figure.mfePlayer?.destroy(); MFEPlayer.mount(figure, { project, loop })`.
    const element = figure({
      'data-mfe-player': 'hello',
      'data-controls': 'minimal',
      'data-timeline': '',
      'data-start': 'end',
    });
    const first = mount(element)!;
    expect(first.options).toMatchObject({ controls: 'minimal', timeline: true, start: 'end' });
    const project = MFEPlayer.engine.example('hello')!.cloneProject();
    project.relations[0]!.pairs = [{ from: [0, 1], to: [0, 1], style: null }];
    element.mfePlayer?.destroy();
    const second = MFEPlayer.mount(element, { project, loop: true })!;
    expect(second).not.toBe(first);
    expect(second.scene.project).toBe(project);
    expect(second.options).toMatchObject({
      controls: 'minimal',
      timeline: true,
      start: 'end',
      loop: true,
    });
    expect(
      [...element.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Play']);
    expect(element.querySelector('[data-testid="mfe-strip"]')).not.toBeNull();
    expect(second.time).toBe(5);
  });
});

describe('on screen and off it', () => {
  /** An IntersectionObserver the test drives, and the system's reduced-motion setting. */
  function screen(reduced = false) {
    const observers: { callback: IntersectionObserverCallback; target: Element | null }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        private readonly entry: { callback: IntersectionObserverCallback; target: Element | null };
        constructor(callback: IntersectionObserverCallback) {
          this.entry = { callback, target: null };
          observers.push(this.entry);
        }
        observe(target: Element) {
          this.entry.target = target;
        }
        disconnect() {}
      },
    );
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduced && query.includes('reduce'),
    }));
    return (ratio: number) => {
      for (const { callback, target } of observers) {
        callback(
          [
            {
              isIntersecting: ratio > 0,
              intersectionRatio: ratio,
              target,
            } as IntersectionObserverEntry,
          ],
          {} as IntersectionObserver,
        );
      }
    };
  }

  it('plays by itself with data-autoplay once half of it shows, and pauses when it leaves', () => {
    const show = screen();
    const player = mount(figure({ 'data-mfe-player': 'hello', 'data-autoplay': '' }))!;
    show(0.3);
    expect(player.playing).toBe(false);
    show(0.6);
    expect(player.playing).toBe(true);
    show(0);
    expect(player.playing).toBe(false);
    show(1);
    expect(player.playing).toBe(true);
    // Paused by the reader, it stays paused when it comes back.
    player.pause();
    show(0);
    show(1);
    expect(player.playing).toBe(false);
  });

  it('never plays by itself with reduced motion', () => {
    const show = screen(true);
    const player = mount(figure({ 'data-mfe-player': 'hello', 'data-autoplay': '' }))!;
    show(1);
    expect(player.playing).toBe(false);
    // The reader may still play it.
    player.play();
    expect(player.playing).toBe(true);
  });

  it('does not play by itself without data-autoplay, but plays again after it was hidden', () => {
    const show = screen();
    const player = mount(figure({ 'data-mfe-player': 'hello' }))!;
    show(1);
    expect(player.playing).toBe(false);
    player.play();
    show(0.2);
    expect(player.playing).toBe(false);
    show(0.9);
    expect(player.playing).toBe(true);
  });
});

describe('a player of a widget', () => {
  it('plays a modified copy of the example’s project', () => {
    // A laid-out page, so that the strip is drawn.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
    const element = figure({ 'data-mfe-player': 'hello', 'data-timeline': '' });
    const example = MFEPlayer.engine.example('hello')!;
    const project = example.cloneProject();
    project.relations[0]!.pairs = [{ from: [0, 1], to: [0, 1], style: null }];
    const player = mount(element, { project })!;
    expect(player.scene.project).toBe(project);
    expect(player.scene).not.toBe(example.scene());
    expect(element.querySelector('[data-relation]')!.getAttribute('title')).toMatch(/1 pair$/);
    // The example's own players are left as they were.
    expect(example.project.relations[0]!.pairs).toHaveLength(2);
  });

  it('shows why a project cannot be played instead of a player', () => {
    const element = figure({ 'data-mfe-player': 'hello' });
    const project = MFEPlayer.engine.example('hello')!.cloneProject();
    project.formulas[0]!.source = 'y';
    expect(mount(element, { project })).toBeNull();
    expect(element.querySelector('.mfe-player-notice')!.textContent).toMatch(
      /changed what it is made of/,
    );
  });
});

describe('a figure that cannot play', () => {
  it('shows a notice when its example is not loaded, and does not throw', () => {
    const element = figure({ 'data-mfe-player': 'nowhere' });
    expect(mount(element)).toBeNull();
    expect(element.querySelector('.mfe-player-notice')!.textContent).toContain(
      '<script src="../examples/nowhere.data.js" defer></script>',
    );
    expect(element.hasAttribute(MOUNTED)).toBe(true);
    expect(element.dataset.state).toBe('missing');
  });

  it('says why its data cannot be used', () => {
    window.MFE_EXAMPLES = { old: { ...hello, player: { ...hello.player, version: 0 } } };
    const element = figure({ 'data-mfe-player': 'old' });
    expect(mount(element)).toBeNull();
    expect(element.querySelector('.mfe-player-notice')!.textContent).toMatch(/version 0/);
  });
});

describe('mounting a page', () => {
  it('mounts every figure once, however often it is asked', () => {
    const a = figure({ 'data-mfe-player': 'hello' });
    const b = figure({ 'data-mfe-player': 'hello', 'data-timeline': '' });
    figure({ 'data-mfe-player': 'missing' });
    expect(mountAll(document)).toHaveLength(2);
    expect(mountAll(document)).toHaveLength(0);
    expect(a.querySelectorAll('canvas')).toHaveLength(1);
    expect(b.querySelectorAll('canvas')).toHaveLength(1);
    // The two players of one example share its revived example.
    expect(a.mfePlayer!.example).toBe(b.mfePlayer!.example);
  });

  it('waits for the page’s deferred scripts before it mounts', () => {
    const element = figure({ 'data-mfe-player': 'hello' });
    const ready = vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive');
    const stop = autoMount(document);
    expect(element.hasAttribute(MOUNTED)).toBe(false);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(element.hasAttribute(MOUNTED)).toBe(true);
    stop();
    ready.mockRestore();
  });

  it('offers the engine to widgets', () => {
    const example = MFEPlayer.engine.example('hello')!;
    expect(example.formulas().map((f) => f.name)).toEqual(['a1', 'f2']);
    expect(MFEPlayer.engine.example('nowhere')).toBeNull();
    expect(MFEPlayer.engine.example('hello')).toBe(example);
    expect(MFEPlayer.engine.dataVersion).toBe(1);
  });
});
