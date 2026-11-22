/* The options of a player, from the data attributes of its figure (docs/web/tools/EXAMPLES.md
 * lists them for the authors of pages):
 *
 *   <figure class="mfe-player" data-mfe-player="first-transform" data-timeline data-loop
 *           data-from="1" data-to="4.5" data-controls="minimal" data-caption="…">
 *
 * A boolean attribute is on when present, unless its value is "false" or "0". A value the player
 * cannot read is ignored (the default stands) and reported, so that the page's author hears of
 * it in the console. Pure: the attributes come in as a lookup. */
import { SPEEDS, type Speed } from './clock';

export type ControlsMode = 'full' | 'minimal' | 'none';

export interface PlayerOptions {
  /** The example (`window.MFE_EXAMPLES[slug]`). */
  slug: string;
  /** Show the timeline strip under the scene. */
  timeline: boolean;
  /** Play by itself while at least half of it is on screen (never with reduced motion). */
  autoplay: boolean;
  /** Start again at the end. */
  loop: boolean;
  /** The part of the scene to play, in seconds (null: from the start, to the end). */
  from: number | null;
  to: number | null;
  /** What it shows before it plays: a time, or the end of the range (null: the range's start). */
  start: number | 'end' | null;
  controls: ControlsMode;
  /** A caption under it (a figure that has a figcaption of its own keeps that one). */
  caption: string | null;
  /** The speed it starts at. */
  speed: Speed;
}

export const DEFAULT_OPTIONS: Omit<PlayerOptions, 'slug'> = {
  timeline: false,
  autoplay: false,
  loop: false,
  from: null,
  to: null,
  start: null,
  controls: 'full',
  caption: null,
  speed: 1,
};

/** The attributes the player reads, without their `data-` prefix (the keys of `dataset`). */
export const OPTION_ATTRIBUTES = [
  'mfePlayer',
  'timeline',
  'autoplay',
  'loop',
  'from',
  'to',
  'start',
  'controls',
  'caption',
  'speed',
] as const;

export interface ParsedOptions {
  options: PlayerOptions;
  /** What could not be read, one sentence each. */
  problems: string[];
}

function flag(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const v = value.trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no' && v !== 'off';
}

function seconds(value: string | undefined): number | null | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value.trim().replace(/s$/i, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The options in `dataset` (an element's `dataset`, or any lookup of the same keys), over the
 * defaults and over `given` (options passed to `mount`, which win). */
export function parseOptions(
  dataset: Readonly<Record<string, string | undefined>>,
  given: Partial<PlayerOptions> = {},
): ParsedOptions {
  const problems: string[] = [];
  const options: PlayerOptions = { ...DEFAULT_OPTIONS, slug: (dataset.mfePlayer ?? '').trim() };
  for (const key of ['timeline', 'autoplay', 'loop'] as const) {
    const value = flag(dataset[key]);
    if (value !== null) options[key] = value;
  }
  for (const key of ['from', 'to'] as const) {
    const value = seconds(dataset[key]);
    if (value === null) problems.push(`data-${key}="${dataset[key]}" is not a time in seconds.`);
    else if (value !== undefined) options[key] = value;
  }
  const start = dataset.start?.trim();
  if (start !== undefined && start !== '') {
    if (start.toLowerCase() === 'end') options.start = 'end';
    else {
      const value = seconds(start);
      if (value === null || value === undefined) {
        problems.push(`data-start="${start}" is neither a time in seconds nor "end".`);
      } else options.start = value;
    }
  }
  const controls = dataset.controls?.trim().toLowerCase();
  if (controls !== undefined && controls !== '') {
    if (controls === 'full' || controls === 'minimal' || controls === 'none') {
      options.controls = controls;
    } else problems.push(`data-controls="${dataset.controls}" is not full, minimal or none.`);
  }
  const caption = dataset.caption?.trim();
  if (caption) options.caption = caption;
  const speed = dataset.speed?.trim().replace(/[x×]$/i, '');
  if (speed !== undefined && speed !== '') {
    const value = Number(speed);
    if ((SPEEDS as readonly number[]).includes(value)) options.speed = value as Speed;
    else problems.push(`data-speed="${dataset.speed}" is not one of ${SPEEDS.join(', ')}.`);
  }
  const merged = { ...options, ...definedOf(given) };
  if (merged.from !== null && merged.to !== null && merged.to <= merged.from) {
    problems.push(`data-to (${merged.to}) is not after data-from (${merged.from}).`);
  }
  return { options: merged, problems };
}

function definedOf<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
