/* The player of the web documentation: a `<figure class="mfe-player" data-mfe-player="slug">`
 * becomes the example's scene, drawn by the app's own evaluator and renderer (`engine.ts`), with
 * the app's transport bar under it and, when asked, a small version of its timeline
 * (`stripView.ts`). The options are the figure's data attributes (`options.ts`); the clock is
 * `clock.ts`. Thin: what can be pure is in those modules.
 *
 * A mounted figure carries `data-mfe-mounted` and says how it stands in `data-time` (seconds of
 * the scene), `data-progress` (0–1 through its range) and `data-playing` (`true`/`false`), for
 * the page's tests; its controller is `figure.mfePlayer`. */
import {
  advance,
  formatSeconds,
  formatSpeed,
  initialTime,
  playFrom,
  progressOf,
  resolveRange,
  SPEEDS,
  spokenTime,
  stepTime,
  type Range,
  type Speed,
} from './clock';
import type { Project } from '../model';
import type { Example, Scene } from './engine';
import { iconSvg, type IconName } from './icons';
import { parseOptions, type PlayerOptions } from './options';
import { exampleFor } from './registry';
import { createStripView, type StripView } from './stripView';
import { bitmapSize } from './view';
import styles from './player.css?inline';
import { isMainPress } from './press';

/** The attribute of a mounted figure. */
export const MOUNTED = 'data-mfe-mounted';
/** What a figure is found by. */
export const SELECTOR = '[data-mfe-player]';

/** What `mount` takes beyond the figure's attributes: options over them, and for a widget the
 * project to play. */
export interface MountOptions extends Partial<PlayerOptions> {
  /** A modified copy of the example's project (`Example.cloneProject`) to play instead of its own:
   * other pairs, other timing, other colours (`Example.scene` says what may change). The figure's
   * slug still names the example. */
  project?: Project;
}

export interface PlayerHandle {
  readonly element: HTMLElement;
  readonly options: PlayerOptions;
  /** The example. */
  readonly example: Example;
  /** The scene it plays: the example's, or the one of the project it was given. */
  readonly scene: Scene;
  /** Seconds of the scene. */
  readonly time: number;
  readonly playing: boolean;
  readonly range: Range;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Shows the instant `time` (held inside the range). */
  seek(time: number): void;
  setLoop(loop: boolean): void;
  setSpeed(speed: Speed): void;
  /** Stops it and gives the figure back as it was before it was mounted: its children and its
   * attributes then, an option the player wrote over (`data-controls`) and the class it added
   * included. An attribute changed while the player was mounted goes back too. */
  destroy(): void;
}

declare global {
  interface HTMLElement {
    mfePlayer?: PlayerHandle;
  }
}

const STYLE_ID = 'mfe-player-style';

/** Puts the player's stylesheet in the document once. */
export function injectStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = styles;
  (doc.head ?? doc.documentElement).append(style);
}

function reducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function button(
  className: string,
  icon: IconName,
  label: string,
  title: string,
  action: string,
): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `mfe-player-button${className ? ` ${className}` : ''}`;
  node.innerHTML = iconSvg(icon);
  node.setAttribute('aria-label', label);
  node.title = title;
  node.dataset.action = action;
  return node;
}

function notice(element: HTMLElement, html: string): void {
  const p = document.createElement('p');
  p.className = 'mfe-player-notice';
  p.innerHTML = html;
  element.prepend(p);
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Mounts a player on `element` (a figure with `data-mfe-player`), with `given` over the options
 * of its attributes. A figure mounted already keeps its player (returned again). An example the
 * page has not loaded, data that cannot be used or a project the example cannot draw leave a
 * notice in the figure and no player (null). */
export function mount(element: HTMLElement, given: MountOptions = {}): PlayerHandle | null {
  if (element.mfePlayer) return element.mfePlayer;
  if (element.hasAttribute(MOUNTED)) return null;
  injectStyles(element.ownerDocument);
  const { project, ...overrides } = given;
  const { options, problems } = parseOptions(element.dataset, overrides);
  for (const problem of problems) console.warn(`MFEPlayer (${options.slug || '?'}): ${problem}`);
  // The attributes as the page wrote them, which `destroy` gives back.
  const attributes = new Map(element.getAttributeNames().map((n) => [n, element.getAttribute(n)!]));
  element.setAttribute(MOUNTED, '');
  element.classList.add('mfe-player');

  let example: Example | null = null;
  let scene: Scene | null = null;
  let failure: string | null = null;
  if (!options.slug)
    failure = 'The player has no example: give the figure <code>data-mfe-player="slug"</code>.';
  else {
    try {
      example = exampleFor(options.slug);
      if (!example) {
        failure =
          `The example <code>${escapeHtml(options.slug)}</code> is not loaded: add ` +
          `<code>&lt;script src="../examples/${escapeHtml(options.slug)}.data.js" defer&gt;&lt;/script&gt;</code> ` +
          'to the page’s head.';
      } else scene = project ? example.scene(project) : example.scene();
    } catch (error) {
      failure = escapeHtml(error instanceof Error ? error.message : String(error));
    }
  }
  if (!example || !scene || failure) {
    element.dataset.state = 'missing';
    notice(element, failure ?? 'The example cannot be shown.');
    console.warn(
      `MFEPlayer: ${failure
        ?.replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')}`,
    );
    return null;
  }
  return createPlayer(element, example, scene, options, attributes);
}

/** Mounts every figure with `data-mfe-player` under `root` that is not mounted yet. */
export function mountAll(root: ParentNode = document): PlayerHandle[] {
  const out: PlayerHandle[] = [];
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((element) => {
    if (element.hasAttribute(MOUNTED)) return;
    const handle = mount(element);
    if (handle) out.push(handle);
  });
  return out;
}

function createPlayer(
  element: HTMLElement,
  example: Example,
  scene: Scene,
  options: PlayerOptions,
  attributes: ReadonlyMap<string, string>,
): PlayerHandle {
  const range = resolveRange(scene.duration, options.from, options.to);
  const fps = scene.fps;
  const { meta } = example;
  const title = meta.title || example.slug;

  // What the figure held before: its caption stays; the rest (a fallback) goes while mounted.
  const before = Array.from(element.childNodes);
  const figcaption = before.find(
    (node): node is HTMLElement => node instanceof HTMLElement && node.tagName === 'FIGCAPTION',
  );
  element.replaceChildren();

  const body = document.createElement('div');
  body.className = 'mfe-player-body';
  element.append(body);
  element.dataset.controls = options.controls;

  // The scene.
  const stage = document.createElement('div');
  stage.className = 'mfe-player-stage';
  stage.style.aspectRatio = `${meta.width} / ${meta.height}`;
  stage.style.background = meta.background;
  const canvas = document.createElement('canvas');
  canvas.className = 'mfe-player-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    `Animation: ${title}${meta.description ? `. ${meta.description}` : ''}`,
  );
  stage.append(canvas);
  if (options.controls === 'none') {
    stage.tabIndex = 0;
    stage.setAttribute('role', 'button');
    stage.setAttribute('aria-label', `Play the animation ${title}`);
  }
  body.append(stage);

  // The transport bar.
  let playButton: HTMLButtonElement | null = null;
  let loopButton: HTMLButtonElement | null = null;
  let scrub: HTMLElement | null = null;
  let scrubFill: HTMLElement | null = null;
  let scrubThumb: HTMLElement | null = null;
  let now: HTMLElement | null = null;
  const speedButtons: HTMLButtonElement[] = [];
  let speedGroup: HTMLElement | null = null;
  if (options.controls !== 'none') {
    const bar = document.createElement('div');
    bar.className = 'mfe-player-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', `Playback of ${title}`);
    if (options.controls === 'full') {
      bar.append(
        button('', 'to-start', 'Back to the start', 'Back to the start (Home)', 'restart'),
      );
    }
    playButton = button('mfe-player-play', 'play', 'Play', 'Play (Space or K)', 'play');
    bar.append(playButton);
    if (options.controls === 'full') {
      loopButton = button('', 'loop', 'Loop', 'Loop: start again at the end', 'loop');
      loopButton.setAttribute('aria-pressed', String(options.loop));
      bar.append(loopButton);
      const sep = document.createElement('span');
      sep.className = 'mfe-player-sep';
      sep.setAttribute('aria-hidden', 'true');
      bar.append(sep);
    }
    scrub = document.createElement('div');
    scrub.className = 'mfe-player-scrub';
    scrub.tabIndex = 0;
    scrub.setAttribute('role', 'slider');
    scrub.setAttribute('aria-label', 'Time');
    scrub.setAttribute('aria-valuemin', formatSeconds(range.start));
    scrub.setAttribute('aria-valuemax', formatSeconds(range.end));
    scrub.title = 'Time (← → ↑ ↓: a frame, Shift: a second; Home, End)';
    scrubFill = document.createElement('div');
    scrubFill.className = 'mfe-player-scrub-fill';
    scrubThumb = document.createElement('div');
    scrubThumb.className = 'mfe-player-scrub-thumb';
    scrub.append(scrubFill, scrubThumb);
    bar.append(scrub);
    const readout = document.createElement('span');
    readout.className = 'mfe-player-time';
    readout.title = 'Seconds';
    now = document.createElement('span');
    now.className = 'mfe-player-now';
    readout.append(now, ` / ${formatSeconds(range.end)} s`);
    bar.append(readout);
    if (options.controls === 'full') {
      const lineBreak = document.createElement('span');
      lineBreak.className = 'mfe-player-break';
      lineBreak.setAttribute('aria-hidden', 'true');
      bar.append(lineBreak);
      speedGroup = document.createElement('div');
      speedGroup.className = 'mfe-player-speed';
      speedGroup.setAttribute('role', 'radiogroup');
      speedGroup.setAttribute('aria-label', 'Speed');
      const thumb = document.createElement('span');
      thumb.className = 'mfe-player-speed-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      speedGroup.append(thumb);
      for (const speed of SPEEDS) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'mfe-player-speed-option';
        option.setAttribute('role', 'radio');
        option.textContent = formatSpeed(speed);
        option.title = `Play at ${formatSpeed(speed)} speed`;
        option.dataset.speed = String(speed);
        speedButtons.push(option);
        speedGroup.append(option);
      }
      bar.append(speedGroup);
    }
    body.append(bar);
  }

  // The strip: a press seeks, a drag scrubs (as the scrub bar does); a drag the browser took back
  // ends where it is (no time).
  let strip: StripView | null = null;
  if (options.timeline) {
    strip = createStripView(scene.project, range, (t, phase) => {
      if (phase === 'start') scrubStart();
      if (t !== null) seek(t);
      if (phase === 'end') scrubEnd();
    });
    body.append(strip.element);
  }

  // The caption: the figure's own, or the one of `data-caption`.
  if (figcaption) element.append(figcaption);
  else if (options.caption) {
    const caption = document.createElement('figcaption');
    caption.className = 'mfe-player-caption';
    caption.textContent = options.caption;
    element.append(caption);
  }

  // ---- State ----
  let time = initialTime(range, options.start);
  let playing = false;
  let loop = options.loop;
  let speed: Speed = options.speed;
  let frame = 0;
  let last: number | null = null;
  /** Paused because it left the screen: it plays again when it comes back. */
  let resumeWhenVisible = false;
  /** The reader paused it, or pressed something: autoplay leaves it alone from then on. */
  let touched = false;
  let visible = false;
  let destroyed = false;

  // ---- Drawing ----
  const draw = () => {
    scene.draw(canvas, time);
  };
  const reflect = () => {
    const progress = progressOf(time, range);
    element.dataset.time = time.toFixed(3);
    element.dataset.progress = progress.toFixed(3);
    element.dataset.playing = String(playing);
    if (now) now.textContent = formatSeconds(time);
    if (scrub && scrubFill && scrubThumb) {
      const percent = `${(progress * 100).toFixed(3)}%`;
      scrubFill.style.width = percent;
      scrubThumb.style.left = percent;
      scrub.setAttribute('aria-valuenow', formatSeconds(time));
      scrub.setAttribute('aria-valuetext', spokenTime(time, range));
    }
    strip?.setTime(time);
  };
  const reflectPlaying = () => {
    element.dataset.playing = String(playing);
    if (playButton) {
      playButton.innerHTML = iconSvg(playing ? 'pause' : 'play');
      playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      playButton.title = playing ? 'Pause (Space or K)' : 'Play (Space or K)';
    }
    if (options.controls === 'none') {
      stage.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} the animation ${title}`);
    }
  };
  const reflectLoop = () => loopButton?.setAttribute('aria-pressed', String(loop));
  const reflectSpeed = () => {
    const index = SPEEDS.indexOf(speed);
    speedGroup?.style.setProperty('--index', String(index));
    speedButtons.forEach((option, i) => {
      option.setAttribute('aria-checked', String(i === index));
      option.tabIndex = i === index ? 0 : -1;
    });
  };

  // ---- Layout: the canvas on whole device pixels ----
  const layout = () => {
    const dpr = globalThis.devicePixelRatio || 1;
    const rect = stage.getBoundingClientRect();
    const inner = {
      width: stage.clientWidth || rect.width,
      height: stage.clientHeight || rect.height,
    };
    if (inner.width <= 0 || inner.height <= 0) return;
    // Whole device pixels, the limiting side first; the frame is centred and moved by under a
    // pixel so that its edges are on the device's grid (`ui/preview/stageLayout.ts` does the same
    // for the Preview).
    const aspect = meta.width / meta.height;
    const whole = (v: number) => Math.floor(v * dpr + 1e-9) / dpr;
    let width = whole(inner.width);
    let height = whole(width / aspect);
    if (height > inner.height) {
      height = whole(inner.height);
      width = whole(height * aspect);
    }
    const left = rect.left + stage.clientLeft + (inner.width - width) / 2;
    const top = rect.top + stage.clientTop + (inner.height - height) / 2;
    const snap = (edge: number) => Math.round(edge * dpr) / dpr - edge;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.transform = `translate(${(inner.width - width) / 2 + snap(left)}px, ${(inner.height - height) / 2 + snap(top)}px)`;
    const bitmap = bitmapSize(width, height, dpr);
    if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
    if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
    draw();
    strip?.layout();
  };

  // ---- Playback ----
  const tick = (stamp: number) => {
    frame = 0;
    if (!playing || destroyed) return;
    const elapsed = last === null ? 0 : (stamp - last) / 1000;
    last = stamp;
    const next = advance(time, elapsed, speed, range, loop);
    time = next.time;
    draw();
    reflect();
    if (!next.playing) {
      playing = false;
      reflectPlaying();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  const play = () => {
    if (playing || destroyed) return;
    time = playFrom(time, range);
    playing = true;
    last = null;
    resumeWhenVisible = false;
    reflectPlaying();
    reflect();
    frame = requestAnimationFrame(tick);
  };
  const pause = () => {
    if (!playing) return;
    playing = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    reflectPlaying();
    reflect();
  };
  /** A pause the reader asked for: autoplay and the return to the screen leave it paused. */
  const pauseFor = (who: 'user') => {
    if (who === 'user') {
      touched = true;
      resumeWhenVisible = false;
    }
    pause();
  };
  const seek = (t: number) => {
    time = Math.min(Math.max(t, range.start), range.end);
    draw();
    reflect();
  };
  const toggle = () => {
    touched = true;
    if (playing) pauseFor('user');
    else play();
  };
  /** A scrub (the scrub bar, the strip) holds playback while the pointer is down, and lets it go
   * on afterwards if it was playing. */
  let resumeAfterScrub = false;
  function scrubStart() {
    resumeAfterScrub = playing;
    touched = true;
    resumeWhenVisible = false;
    pause();
  }
  function scrubEnd() {
    if (resumeAfterScrub && time < range.end) play();
    resumeAfterScrub = false;
  }

  // ---- Events ----
  const onClick = (event: MouseEvent) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-action],[data-speed]');
    if (!target) {
      if ((event.target as Element).closest('.mfe-player-stage')) toggle();
      return;
    }
    if (target.dataset.speed) {
      touched = true;
      speed = Number(target.dataset.speed) as Speed;
      reflectSpeed();
      return;
    }
    switch (target.dataset.action) {
      case 'play':
        toggle();
        break;
      case 'restart':
        touched = true;
        seek(range.start);
        break;
      case 'loop':
        touched = true;
        loop = !loop;
        reflectLoop();
        break;
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    const onSpeed = target.closest('.mfe-player-speed') !== null;
    const onButton = target.tagName === 'BUTTON';
    const key = event.key;
    if (
      onSpeed &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)
    ) {
      event.preventDefault();
      const index = SPEEDS.indexOf(speed);
      const next =
        key === 'Home'
          ? 0
          : key === 'End'
            ? SPEEDS.length - 1
            : Math.min(
                Math.max(index + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1), 0),
                SPEEDS.length - 1,
              );
      touched = true;
      speed = SPEEDS[next]!;
      reflectSpeed();
      speedButtons[next]?.focus();
      return;
    }
    if (
      key === 'k' ||
      key === 'K' ||
      (key === ' ' && !onButton) ||
      (key === 'Enter' && target === stage)
    ) {
      event.preventDefault();
      toggle();
      return;
    }
    // ← and → step a frame anywhere in the player; ↓ and ↑ too on the time bar, as a slider takes
    // them (WAI-ARIA): anywhere else they are the page's, which scrolls.
    const onScrub = scrub !== null && target === scrub;
    const direction =
      key === 'ArrowLeft' || (key === 'ArrowDown' && onScrub)
        ? -1
        : key === 'ArrowRight' || (key === 'ArrowUp' && onScrub)
          ? 1
          : 0;
    if (direction !== 0) {
      event.preventDefault();
      pauseFor('user');
      seek(stepTime(time, fps, range, direction, event.shiftKey));
      return;
    }
    switch (key) {
      case 'Home':
        event.preventDefault();
        touched = true;
        seek(range.start);
        break;
      case 'End':
        event.preventDefault();
        pauseFor('user');
        seek(range.end);
        break;
    }
  };
  body.addEventListener('click', onClick);
  body.addEventListener('keydown', onKeyDown);

  // The scrub bar: a press seeks there, a drag scrubs.
  let scrubbing: number | null = null;
  const scrubTime = (clientX: number) => {
    const rect = scrub!.getBoundingClientRect();
    const f = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return range.start + Math.min(Math.max(f, 0), 1) * (range.end - range.start);
  };
  const onScrubDown = (event: PointerEvent) => {
    // Not a Mac's click with Ctrl: that one is the menu's (`isMainPress`).
    if (!isMainPress(event)) return;
    event.preventDefault();
    scrubbing = event.pointerId;
    scrub!.setPointerCapture?.(event.pointerId);
    scrub!.classList.add('is-dragging');
    scrub!.focus({ preventScroll: true });
    scrubStart();
    seek(scrubTime(event.clientX));
  };
  const onScrubMove = (event: PointerEvent) => {
    if (scrubbing !== event.pointerId) return;
    seek(scrubTime(event.clientX));
  };
  const onScrubUp = (event: PointerEvent) => {
    if (scrubbing !== event.pointerId) return;
    scrubbing = null;
    scrub!.classList.remove('is-dragging');
    scrubEnd();
  };
  if (scrub) {
    scrub.addEventListener('pointerdown', onScrubDown);
    scrub.addEventListener('pointermove', onScrubMove);
    scrub.addEventListener('pointerup', onScrubUp);
    scrub.addEventListener('pointercancel', onScrubUp);
  }

  // Resizing.
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => layout());
  resize?.observe(stage);
  if (strip) resize?.observe(strip.element);
  const onWindowResize = () => layout();
  globalThis.addEventListener('resize', onWindowResize);

  // On screen: autoplay while at least half of it shows; a player that leaves the screen pauses,
  // and plays again when it comes back if it was playing then.
  const autoplay = () => {
    if (destroyed || playing || !visible || reducedMotion()) return;
    if (resumeWhenVisible || (options.autoplay && !touched)) {
      resumeWhenVisible = false;
      play();
    }
  };
  const visibility =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            const entry = entries[entries.length - 1];
            if (!entry) return;
            visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
            if (!visible && playing) {
              pause();
              resumeWhenVisible = true;
            } else autoplay();
          },
          { threshold: [0, 0.5, 1] },
        );
  visibility?.observe(element);
  const onPageVisibility = () => {
    if (document.hidden && playing) {
      pause();
      resumeWhenVisible = true;
    } else if (!document.hidden) autoplay();
  };
  document.addEventListener('visibilitychange', onPageVisibility);

  reflectPlaying();
  reflectLoop();
  reflectSpeed();
  reflect();
  layout();

  const handle: PlayerHandle = {
    element,
    options,
    example,
    scene,
    get time() {
      return time;
    },
    get playing() {
      return playing;
    },
    range,
    play: () => {
      touched = true;
      play();
    },
    pause: () => pauseFor('user'),
    toggle,
    seek: (t) => seek(t),
    setLoop: (value) => {
      loop = value;
      reflectLoop();
    },
    setSpeed: (value) => {
      if (!SPEEDS.includes(value)) return;
      speed = value;
      reflectSpeed();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pause();
      resize?.disconnect();
      visibility?.disconnect();
      globalThis.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', onPageVisibility);
      body.removeEventListener('click', onClick);
      body.removeEventListener('keydown', onKeyDown);
      strip?.destroy();
      element.replaceChildren(...before);
      // What the player set goes (`data-mfe-mounted`, `data-time`…, the class); what the page
      // wrote comes back as it was.
      for (const name of element.getAttributeNames()) {
        if (!attributes.has(name)) element.removeAttribute(name);
      }
      for (const [name, value] of attributes) element.setAttribute(name, value);
      delete element.mfePlayer;
    },
  };
  element.mfePlayer = handle;
  return handle;
}
