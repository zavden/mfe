/* The options of a deck — an exported scene mounted in a page —, as its element's `data-`
 * attributes give them, the page's address (for the page that is the scene's own) and the object
 * passed to `MFE.mount`. Pure. */

/** Which controls a deck shows: all of them, the play button and the timeline alone, or none
 * (the page drives it through the API). */
export type ControlsOption = 'full' | 'minimal' | 'none';

export interface DeckOptions {
  controls: ControlsOption;
  /** Whether it has notes: the comments and the pauses' notes of the scene, for whoever presents
   * (the S key, the bar's Notes button). Off, it has neither, whatever `controls` says: the
   * comments are the author's words to whoever works on the scene, not its readers'. */
  notes: boolean;
  /** Starts playing when it comes on screen (never when the reader asked for less motion). */
  autoplay: boolean;
  /** At the end it goes on from the start. */
  loop: boolean;
  /** Where it stands before it plays, in seconds. */
  start: number;
  /** Whether it stops at the scene's pauses; without them it plays through. */
  pauses: boolean;
  /** The scene's own background, or none: the page behind it shows. */
  background: 'scene' | 'transparent';
  /** How the scene is drawn: SVG elements (what can be styled and extended), or a canvas. */
  renderer: 'svg' | 'canvas';
  /** Where its keys are heard: on the whole page (the scene's own page), only while the focus is
   * inside it (a scene embedded in another page), or nowhere. */
  keys: 'page' | 'focus' | 'none';
  /** How fast it plays: 1 is the scene's own time. */
  speed: number;
}

export const DEFAULT_OPTIONS: DeckOptions = {
  controls: 'full',
  notes: true,
  autoplay: false,
  loop: false,
  start: 0,
  pauses: true,
  background: 'scene',
  renderer: 'svg',
  keys: 'focus',
  speed: 1,
};

/** The names the options have as `data-` attributes and in an address. */
export const OPTION_NAMES = [
  'controls',
  'notes',
  'autoplay',
  'loop',
  'start',
  'pauses',
  'background',
  'renderer',
  'keys',
  'speed',
] as const;

const OFF = new Set(['off', 'false', 'no', '0', 'none']);

/** A switch as an attribute gives it: present, even empty, is on; `off`, `false`, `no`, `0` are
 * off. Absent says nothing. */
function flag(value: string | null | undefined): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  return !OFF.has(value.trim().toLowerCase());
}

function oneOf<T extends string>(
  value: string | null | undefined,
  choices: readonly T[],
): T | undefined {
  const word = value?.trim().toLowerCase();
  return choices.find((choice) => choice === word);
}

function positive(value: string | null | undefined, least: number): number | undefined {
  if (value === null || value === undefined || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= least ? number : undefined;
}

/** The options a source of words gives — `read(name)` is the attribute `data-<name>`, or the
 * parameter `<name>` of an address —: only those it gives, and only with a value that means
 * something (a wrong word is as none). */
export function readOptions(
  read: (name: string) => string | null | undefined,
): Partial<DeckOptions> {
  const out: Partial<DeckOptions> = {};
  const controls = read('controls');
  const shown = oneOf(controls, ['full', 'minimal', 'none'] as const);
  if (shown) out.controls = shown;
  else if (flag(controls) === false) out.controls = 'none';
  const notes = flag(read('notes'));
  if (notes !== undefined) out.notes = notes;
  const autoplay = flag(read('autoplay'));
  if (autoplay !== undefined) out.autoplay = autoplay;
  const loop = flag(read('loop'));
  if (loop !== undefined) out.loop = loop;
  const start = positive(read('start'), 0);
  if (start !== undefined) out.start = start;
  const pauses = flag(read('pauses'));
  if (pauses !== undefined) out.pauses = pauses;
  const background = oneOf(read('background'), ['scene', 'transparent'] as const);
  if (background) out.background = background;
  const renderer = oneOf(read('renderer'), ['svg', 'canvas'] as const);
  if (renderer) out.renderer = renderer;
  const keys = oneOf(read('keys'), ['page', 'focus', 'none'] as const);
  if (keys) out.keys = keys;
  const speed = positive(read('speed'), 0.1);
  if (speed !== undefined) out.speed = Math.min(speed, 4);
  return out;
}

/** The options of a deck: the defaults, under what its element's attributes say, under what the
 * page's address says when the page is the scene's own (`search`), under what the caller of
 * `MFE.mount` passed. The scene's own page hears its keys anywhere unless told otherwise. */
export function resolveOptions(
  attribute: (name: string) => string | null,
  search: string | null,
  given: Partial<DeckOptions> = {},
): DeckOptions {
  const own = search !== null;
  const params = own ? new URLSearchParams(search) : null;
  const clean = Object.fromEntries(
    Object.entries(given).filter(([, value]) => value !== undefined),
  ) as Partial<DeckOptions>;
  return {
    ...DEFAULT_OPTIONS,
    ...(own ? { keys: 'page' as const } : {}),
    ...readOptions((name) => attribute(`data-${name}`)),
    ...(params ? readOptions((name) => params.get(name)) : {}),
    ...clean,
  };
}
