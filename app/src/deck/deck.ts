/* A deck: an exported scene mounted in an element of a page. It makes the scene of its two files
 * (`sceneFile.ts`), draws it on a stage (`svgStage.ts`, or a canvas), keeps its clock — the
 * scene's time, which stops at each pause until its reader goes on (`slideClock.ts`) — and is the
 * object a page's own code extends the scene through: `animate`, `on`, `clip`, `box`, `layer`.
 *
 * The deck builds the stage and says what is wrong with the files; its controls, its keys and its
 * notes are `controls.ts`, built on this same public object, so a page that wants its own can do
 * without them (`data-controls="none"`). Nothing here styles anything: the look is the
 * stylesheet's (`player.css`), which the page may change or replace; the deck gives it the
 * scene's shape and background as custom properties of its element. */
import type { Box } from '../geom';
import {
  exportedMarks,
  skippedWait,
  stopsOf,
  type ClipId,
  type Easing,
  type Project,
} from '../model';
import { rateFunction } from '../scene/easing';
import { sizeCanvas, type Scene } from '../embed/engine';
import { resolveOptions, type DeckOptions } from './options';
import { buildDeckScene, type DeckProblem } from './sceneFile';
import {
  advanceSlide,
  nextStop,
  pauseIndexAt,
  playStart,
  previousStop,
  slideAt,
} from './slideClock';
import { createSvgStage, type LayerName, type SvgStage } from './svgStage';

const SVG = 'http://www.w3.org/2000/svg';

/** The attribute a mounted deck's element carries. */
export const MOUNTED = 'data-mfe-mounted';
/** The attribute that says what the deck is doing: `playing`, `paused` or `ended`. */
export const STATE = 'data-mfe-state';

/** What a deck is made of: a scene's two files as its scripts registered them. */
export interface DeckSource {
  name: string;
  /** `scene.js`: the project. */
  project: unknown;
  /** `glyphs.js`: the outlines. */
  glyphs: unknown;
  /** The address of the scene's sound, when it has one. */
  audio?: string | null;
}

/** A pause of the scene: where the deck stops. */
export interface DeckPause {
  time: number;
  /** Its note; empty when it has none. */
  note: string;
  /** Where the scene goes on from when the deck stands at this pause and is told to go on with its
   * pauses in force (`play`, `next`, `toggle`, a key, a click): the pause's own `time`, or later at
   * a pause that skips its wait (`skipWait` in `scene.js`) — where the next animation starts, or
   * the next pause of that rest —: the time jumps over the wait, and the sound with it. Played
   * through (`through`) the wait plays as it is, and a seek into it shows its instants as always.
   * `resume > time` tells such a pause. */
  resume: number;
}

/** A comment the scene's author left at an instant. */
export interface DeckComment {
  time: number;
  text: string;
}

/** A box of the stage, in its units (the scene's, y down): what an SVG element is placed with. */
export interface StageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Its centre. */
  cx: number;
  cy: number;
}

export type DeckEvent = 'time' | 'play' | 'pause' | 'slide' | 'end' | 'change';

/** An animation of the page's own, as a function of the scene's time. */
export interface AnimationSpec {
  /** When it starts and ends, in seconds of the scene. */
  from: number;
  to: number;
  /** How its progress moves between them: the name of one of Manim's rate functions
   * (`MFE.rates`), or a function of 0…1. Linear when absent. */
  ease?: Easing | ((t: number) => number);
  /** Called on every frame the deck draws, playing or not: `progress` is the eased fraction of
   * the way from `from` to `to` — 0 before `from`, and after `to` what the easing ends at: 1, or 0
   * for one that comes back (`there_and_back`). So the animation is right after a jump too. */
  update(progress: number, time: number): void;
}

/** A scene mounted in an element of a page: what `MFE.mount` gives, and what a page's own code
 * plays it and extends it through. */
export interface Deck {
  /** The element it is mounted in. */
  readonly element: HTMLElement;
  /** The stage: the `<svg class="mfe-stage">`, or the canvas. Null when the scene has errors
   * that keep it from being made. */
  readonly stage: SVGSVGElement | HTMLCanvasElement | null;
  /** The scene's name, as its files registered it. */
  readonly name: string;
  readonly options: Readonly<DeckOptions>;
  /** The scene as its file gave it, read: null when it could not be. Do not change it. */
  readonly project: Project | null;
  /** What is wrong with the scene's files, errors and warnings. */
  readonly problems: readonly DeckProblem[];
  /** Seconds. */
  readonly duration: number;
  readonly fps: number;
  /** Where it stands, in seconds of the scene: continuous, not on the frame grid. */
  readonly time: number;
  readonly playing: boolean;
  /** The pauses and the comments the scene carries, in order. */
  readonly pauses: readonly DeckPause[];
  readonly comments: readonly DeckComment[];
  /** The slide it is on, from 0, and how many there are: one more than the stops. */
  readonly slide: number;
  readonly slides: number;
  /** The pause it stands at, as its index in `pauses`: it is not playing, and its time is that
   * pause's to a millionth of a second. Null anywhere else, and while it plays. */
  readonly atPause: number | null;
  /** How fast it plays. */
  speed: number;
  /** Whether it plays through the pauses instead of stopping at them — and through the waits of
   * those that skip theirs. */
  through: boolean;
  /** Whether its sound is off; `hasSound` says whether the scene has one. */
  muted: boolean;
  readonly hasSound: boolean;
  /** Play from where it stands: from the start when it is at the end, and from the end of the wait
   * when it stands at a pause that skips it (`pauses[i].resume`). */
  play(): void;
  pause(): void;
  toggle(): void;
  /** Go to a time, and stay there. */
  seek(time: number): void;
  /** Go on: play to the next pause (as `play`, over the wait of a pause that skips it); while it
   * plays, jump to the next pause. */
  next(): void;
  /** Go back to the pause before, or to the start. */
  previous(): void;
  /** Listen; the result stops listening. `time` comes after every frame it draws (playing, or
   * after a seek), `play` and `pause` when it starts and stops, `slide` when it reaches another
   * slide, `end` at the end of the scene; `change` comes after any of the others and when a
   * setting changes: what a control redraws itself on. A listener hears what happens after it is
   * added, nothing of where the deck stands then: to act on that too, call it once yourself. */
  on(event: DeckEvent, listener: () => void): () => void;
  /** Add an animation of the page's own; the result takes it away. Going on from a pause that
   * skips its wait, the time jumps from the pause's `time` to its `resume`: what an animation does
   * over that stretch is not seen when presenting (it is when played through, or with a seek).
   * Motion while the deck waits at a pause is CSS. */
  animate(spec: AnimationSpec): () => void;
  /** The group of a clip, by its name (`eq1`) or its id; null when the scene has none, or draws
   * on a canvas. A name the scene does not have is said in the console, with the names it has
   * (once for each; `flights`, `box` and `glyphBox` say it too). */
  clip(ref: string): SVGGElement | null;
  /** The groups of the glyphs in flight between two clips (names or ids), or all of them. */
  flights(from?: string, to?: string): SVGGElement[];
  /** A free group under or over the scene, in the stage's units. */
  layer(name: LayerName): SVGGElement | null;
  /** Where a clip is at a time (now, when absent): its box on the stage, in the stage's units
   * (y down), what an element of a layer is placed with; null when it is not on screen. */
  box(ref: string, time?: number): StageBox | null;
  /** Where a glyph of a clip is, by its index in the formula (the index `glyphs: [3, 4]` of the
   * scene file names), as `box` says it. */
  glyphBox(ref: string, glyph: number, time?: number): StageBox | null;
  /** Draw again now: after changing something an animation of the page's reads. */
  redraw(): void;
  /** Take the deck away and give the element back as it was. */
  destroy(): void;
}

const stageBox = (box: Box): StageBox => ({
  x: box.minX,
  y: -box.maxY,
  width: box.maxX - box.minX,
  height: box.maxY - box.minY,
  cx: (box.minX + box.maxX) / 2,
  cy: -(box.minY + box.maxY) / 2,
});

const clamp = (value: number, low: number, high: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, low), high) : low;

/** What the deck adds to a page besides itself: the controls. */
export type ControlsFactory = (deck: Deck) => () => void;

/** Mounts a scene in `element`. `source` is null when no scene of the name was registered. */
export function createDeck(
  element: HTMLElement,
  name: string,
  source: DeckSource | null,
  given: Partial<DeckOptions> = {},
  controls: ControlsFactory | null = null,
): Deck {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const options = resolveOptions(
    (attribute) => element.getAttribute(attribute),
    element.hasAttribute('data-page') && view ? view.location.search : null,
    given,
  );
  const built = source
    ? buildDeckScene(source.project, source.glyphs)
    : {
        scene: null,
        names: new Map<ClipId, string>(),
        problems: [
          {
            severity: 'error' as const,
            file: 'scene.js' as const,
            where: '',
            message: `No scene named "${name}" was loaded: its glyphs.js and scene.js go after mfe-runtime.js, and the name in data-scene is the one they give.`,
          },
        ],
      };
  const scene: Scene | null = built.scene;
  const project = scene?.project ?? null;
  const duration = scene?.duration ?? 0;
  const marks = project ? exportedMarks(project) : [];
  const pauses: DeckPause[] = marks
    .filter((mark) => mark.kind === 'pause')
    .map((mark) => ({
      time: mark.time,
      note: mark.text ?? '',
      // Where going on from it goes on from: past the wait of one that skips it (D202).
      resume: (project ? skippedWait(project, mark)?.end : undefined) ?? mark.time,
    }));
  const comments: DeckComment[] = marks
    .filter((mark) => mark.kind === 'comment' && (mark.text ?? '').trim() !== '')
    .map((mark) => ({ time: mark.time, text: mark.text ?? '' }));
  const pauseTimes = pauses.map((pause) => pause.time);
  const stops = stopsOf(duration, pauseTimes);
  const idOf = new Map<string, ClipId>();
  for (const [id, clipName] of built.names) idOf.set(clipName, id);
  const unknown = new Set<string>();
  /** A clip's id by its name or its id. One the scene does not have is said in the console, once
   * for each: a name mistyped in a page's code would give null and nothing more. */
  const clipId = (ref: string): ClipId | null => {
    const id = idOf.get(ref) ?? (built.names.has(ref) ? ref : null);
    if (id === null && scene && !unknown.has(ref)) {
      unknown.add(ref);
      const names = [...idOf.keys()];
      console.warn(
        `[MFE] ${name}: the scene has no clip named "${ref}". ` +
          (names.length > 0
            ? `Its clips: ${names.join(', ')} (the head comment of scene.js lists them).`
            : 'It has no clips.'),
      );
    }
    return id;
  };

  // --- What it builds in the element ---------------------------------------------
  const screen = doc.createElement('div');
  screen.className = 'mfe-screen';
  let svgStage: SvgStage | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let overlay: { svg: SVGSVGElement; below: SVGGElement; above: SVGGElement } | null = null;
  if (scene && project) {
    element.style.setProperty('--mfe-aspect', `${project.meta.width} / ${project.meta.height}`);
    element.style.setProperty(
      '--mfe-scene-background',
      options.background === 'transparent' ? 'transparent' : project.meta.background,
    );
    if (options.renderer === 'canvas') {
      canvas = doc.createElement('canvas');
      canvas.className = 'mfe-stage';
      // The free layers of a canvas stage: both over it (a canvas hides what is under it).
      const svg = doc.createElementNS(SVG, 'svg');
      svg.setAttribute('class', 'mfe-layers');
      const below = doc.createElementNS(SVG, 'g');
      below.setAttribute('class', 'mfe-below');
      const above = doc.createElementNS(SVG, 'g');
      above.setAttribute('class', 'mfe-above');
      svg.append(below, above);
      overlay = { svg, below, above };
      screen.append(canvas, svg);
    } else {
      svgStage = createSvgStage(doc, scene, built.names);
      svgStage.element.setAttribute('role', 'img');
      svgStage.element.setAttribute('aria-label', project.meta.name);
      screen.append(svgStage.element);
    }
  }
  const errors = built.problems.filter((problem) => problem.severity === 'error');
  if (errors.length > 0) {
    const panel = doc.createElement('div');
    panel.className = 'mfe-problems';
    panel.setAttribute('role', 'alert');
    const title = doc.createElement('p');
    title.className = 'mfe-problems-title';
    title.textContent =
      errors.length === 1
        ? 'This scene has a problem:'
        : `This scene has ${errors.length} problems:`;
    const list = doc.createElement('ul');
    for (const problem of errors) {
      const item = doc.createElement('li');
      const where = doc.createElement('code');
      where.textContent = problem.where ? `${problem.file} · ${problem.where}` : problem.file;
      item.append(where, doc.createTextNode(` ${problem.message}`));
      list.append(item);
    }
    panel.append(title, list);
    screen.append(panel);
  }
  element.append(screen);
  element.setAttribute(MOUNTED, '');

  // The console says it too, to whoever edits the files without the page in sight.
  for (const problem of built.problems) {
    const text = `[MFE] ${name}: ${problem.file}${problem.where ? ` · ${problem.where}` : ''}: ${problem.message}`;
    if (problem.severity === 'error') console.error(text);
    else console.warn(text);
  }

  // --- The sound ---------------------------------------------------------------------
  let audio: HTMLAudioElement | null = null;
  if (scene && source?.audio) {
    audio = doc.createElement('audio');
    audio.className = 'mfe-sound';
    audio.preload = 'auto';
    audio.src = source.audio;
    element.append(audio);
  }

  // --- The clock -----------------------------------------------------------------------
  let time = clamp(options.start, 0, duration);
  let playing = false;
  let ended = false;
  let speed = options.speed;
  let through = !options.pauses;
  let muted = false;
  let slide = slideAt(stops, time);
  let frame: number | null = null;
  let last: number | null = null;
  let destroyed = false;
  const listeners = new Map<DeckEvent, Set<() => void>>();
  const animations = new Set<AnimationSpec>();

  const emit = (event: DeckEvent) => {
    for (const listener of [...(listeners.get(event) ?? [])]) {
      try {
        listener();
      } catch (error) {
        console.error(`[MFE] ${name}: a listener of "${event}" threw`, error);
      }
    }
    if (event !== 'change') emit('change');
  };

  const easeOf = (ease: AnimationSpec['ease']): ((t: number) => number) => {
    if (typeof ease === 'function') return ease;
    if (ease === undefined) return (t) => t;
    return rateFunction(ease, project?.meta.target ?? 'ce');
  };

  const draw = () => {
    if (!scene || destroyed) return;
    if (svgStage) svgStage.draw(scene.evaluate(time), scene.frameAt(time));
    else if (canvas) {
      sizeCanvas(canvas);
      scene.draw(canvas, time);
      const box = scene.frameAt(time);
      overlay!.svg.setAttribute(
        'viewBox',
        `${box.minX} ${-box.maxY} ${box.maxX - box.minX} ${box.maxY - box.minY}`,
      );
    }
    for (const animation of animations) {
      const length = animation.to - animation.from;
      const raw = length > 0 ? (time - animation.from) / length : time >= animation.to ? 1 : 0;
      const progress = easeOf(animation.ease)(raw <= 0 ? 0 : raw >= 1 ? 1 : raw);
      try {
        animation.update(progress, time);
      } catch (error) {
        console.error(`[MFE] ${name}: an animation's update threw`, error);
      }
    }
    emit('time');
  };

  const setState = () => {
    element.setAttribute(STATE, playing ? 'playing' : ended ? 'ended' : 'paused');
  };

  /** The slide after a change of time: said when it is another. */
  const settleSlide = (after = false) => {
    const now = slideAt(stops, time, after);
    if (now === slide) return;
    slide = now;
    emit('slide');
  };

  const syncSound = (hard: boolean) => {
    if (!audio) return;
    audio.muted = muted;
    audio.playbackRate = speed;
    const off = Math.abs(audio.currentTime - time);
    if (hard || off > 0.2) {
      try {
        audio.currentTime = time;
      } catch {
        // Not loaded yet: it starts from where it can.
      }
    }
  };

  const stopFrames = () => {
    if (frame !== null && view) view.cancelAnimationFrame(frame);
    frame = null;
    last = null;
  };

  const halt = () => {
    if (!playing) return;
    playing = false;
    stopFrames();
    audio?.pause();
    setState();
    emit('pause');
  };

  const tick = (now: number) => {
    frame = null;
    if (!playing || !scene) return;
    const elapsed = last === null ? 0 : (now - last) / 1000;
    last = now;
    const step = advanceSlide(time, elapsed, speed, duration, stops, {
      through,
      loop: options.loop,
    });
    time = step.time;
    settleSlide(step.playing);
    if (step.ended && step.playing)
      syncSound(true); // a loop: from the start again
    else syncSound(false);
    draw();
    if (step.playing) {
      frame = view!.requestAnimationFrame(tick);
      return;
    }
    ended = step.ended;
    halt();
    if (step.ended) emit('end');
  };

  const deck: Deck = {
    element,
    stage: svgStage?.element ?? canvas,
    name,
    options,
    project,
    problems: built.problems,
    duration,
    fps: scene?.fps ?? 0,
    get time() {
      return time;
    },
    get playing() {
      return playing;
    },
    pauses,
    comments,
    get slide() {
      return slide;
    },
    slides: stops.length + 1,
    get atPause() {
      return playing ? null : pauseIndexAt(pauseTimes, time);
    },
    get speed() {
      return speed;
    },
    set speed(value: number) {
      const next = clamp(value, 0.1, 4);
      if (next === speed) return;
      speed = next;
      syncSound(false);
      emit('change');
    },
    get through() {
      return through;
    },
    set through(value: boolean) {
      if (value === through) return;
      through = value;
      emit('change');
    },
    get muted() {
      return muted;
    },
    set muted(value: boolean) {
      if (value === muted) return;
      muted = value;
      syncSound(false);
      emit('change');
    },
    hasSound: audio !== null,
    play() {
      if (playing || !scene || !view || destroyed) return;
      // At the end, from the start; at a pause that skips its wait, from the end of the wait.
      const start = playStart(time, duration, pauses, stops, through);
      if (start.time !== time) {
        time = start.time;
        if (start.skipped) settleSlide(!start.stopped);
        else slide = slideAt(stops, time);
        draw();
      }
      playing = true;
      ended = false;
      last = null;
      setState();
      syncSound(true);
      if (start.stopped) {
        // The wait it skipped ends at the next pause: it stands there, as if it had played to it.
        emit('play');
        halt();
        return;
      }
      // A page may not sound before its reader has touched it: the scene plays on without.
      void audio?.play().catch(() => {});
      emit('play');
      frame = view.requestAnimationFrame(tick);
    },
    pause: halt,
    toggle() {
      if (playing) halt();
      else deck.play();
    },
    seek(to) {
      if (!scene) return;
      halt();
      time = clamp(to, 0, duration);
      ended = false;
      setState();
      settleSlide();
      syncSound(true);
      draw();
    },
    next() {
      if (!scene) return;
      if (playing) deck.seek(nextStop(stops, duration, time));
      else if (time < duration) deck.play();
    },
    previous() {
      if (scene) deck.seek(previousStop(stops, time));
    },
    on(event, listener) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    animate(spec) {
      animations.add(spec);
      draw();
      return () => {
        animations.delete(spec);
        draw();
      };
    },
    clip(ref) {
      const id = clipId(ref);
      return id && svgStage ? svgStage.clip(id) : null;
    },
    flights(from, to) {
      if (!svgStage) return [];
      const fromId = from === undefined ? undefined : clipId(from);
      const toId = to === undefined ? undefined : clipId(to);
      return svgStage
        .flights()
        .filter(
          (flight) =>
            (fromId === undefined || flight.from === fromId) &&
            (toId === undefined || flight.to === toId),
        )
        .map((flight) => flight.element);
    },
    layer(layerName) {
      if (svgStage) return svgStage.layer(layerName);
      return overlay ? overlay[layerName] : null;
    },
    box(ref, at = time) {
      const id = clipId(ref);
      const geometry = id && scene ? scene.geometry(at).find((clip) => clip.clipId === id) : null;
      return geometry ? stageBox(geometry.box) : null;
    },
    glyphBox(ref, glyph, at = time) {
      const id = clipId(ref);
      const geometry = id && scene ? scene.geometry(at).find((clip) => clip.clipId === id) : null;
      const box = geometry?.glyphs.get(glyph);
      return box ? stageBox(box) : null;
    },
    redraw: draw,
    destroy() {
      if (destroyed) return;
      halt();
      destroyed = true;
      observer?.disconnect();
      detachControls();
      screen.remove();
      audio?.remove();
      element.removeAttribute(MOUNTED);
      element.removeAttribute(STATE);
      element.style.removeProperty('--mfe-aspect');
      element.style.removeProperty('--mfe-scene-background');
      listeners.clear();
      animations.clear();
    },
  };

  setState();
  draw();
  const detachControls =
    controls && options.controls !== 'none' && scene ? controls(deck) : () => {};

  // It starts by itself when it comes on screen, unless its reader asked for less motion.
  let observer: IntersectionObserver | null = null;
  const still = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (options.autoplay && scene && view && !still) {
    if (typeof view.IntersectionObserver === 'function') {
      observer = new view.IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          observer = null;
          deck.play();
        },
        { threshold: 0.5 },
      );
      observer.observe(element);
    } else deck.play();
  }
  return deck;
}
