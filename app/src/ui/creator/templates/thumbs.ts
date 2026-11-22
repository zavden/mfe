/* Thumbnails of the templates: MathJax renders, one at a time and only for rows on screen, kept
 * for the session. A MathJax render runs on the main thread for a few milliseconds; taking them
 * one per task (the engine would run every request of a burst in one go) keeps scrolling the
 * list smooth.
 *
 * A thumbnail is of a LaTeX and its packages — a template with the default values of its
 * placeholders —, not of a template: the same formula in two lists is rendered once, and one the
 * user edits gets a new thumbnail. */
import { contoursToSvgPath } from '../../../geom';
import { getEngine } from '../../../engine';
import { viewBoxOf } from '../glyphPaths';

export type ThumbArt =
  { ok: true; viewBox: string; paths: readonly string[] } | { ok: false; message: string };

/** What a thumbnail draws. */
export interface ThumbSource {
  latex: string;
  packages: readonly string[];
}

type Listener = (art: ThumbArt) => void;

const done = new Map<string, ThumbArt>();
/** Waiting sources, oldest first, with whoever waits for each. */
const waiting = new Map<string, { source: ThumbSource; listeners: Set<Listener> }>();
let pumping = false;

/** What tells a thumbnail from another: its LaTeX and its packages. */
export const thumbKey = (source: ThumbSource): string =>
  JSON.stringify([source.latex, source.packages]);

/** The thumbnail of a formula, if it has been rendered. */
export function cachedThumb(source: ThumbSource): ThumbArt | undefined {
  return done.get(thumbKey(source));
}

/** A formula drawn by MathJax, as a thumbnail shows it. Never throws. */
export async function renderThumb(source: ThumbSource): Promise<ThumbArt> {
  try {
    const result = await getEngine().render({
      kind: 'math',
      latex: source.latex,
      packages: [...source.packages],
      preamble: '',
      target: 'ce',
      fontSize: 48,
      prefer: 'mathjax',
    });
    if (!result.ok) return { ok: false, message: result.error.message };
    return {
      ok: true,
      viewBox: viewBoxOf(result.render.bbox, 0.08),
      paths: result.render.glyphs.map((g) => contoursToSvgPath(g.contours, 3)),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (let next = waiting.entries().next(); !next.done; next = waiting.entries().next()) {
      const [key, job] = next.value;
      waiting.delete(key);
      const art = await renderThumb(job.source);
      done.set(key, art);
      for (const listener of job.listeners) listener(art);
      // Let the page paint and handle input before the next render.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    pumping = false;
  }
}

/** Ask for the thumbnail of `source`; `listener` gets it once rendered. Returns a function
 * that withdraws the request (a row that scrolled away before its turn). */
export function requestThumb(source: ThumbSource, listener: Listener): () => void {
  const key = thumbKey(source);
  const known = done.get(key);
  if (known) {
    listener(known);
    return () => {};
  }
  const job = waiting.get(key) ?? { source, listeners: new Set<Listener>() };
  job.listeners.add(listener);
  waiting.set(key, job);
  void pump();
  return () => {
    job.listeners.delete(listener);
    if (job.listeners.size === 0 && waiting.get(key) === job) waiting.delete(key);
  };
}
