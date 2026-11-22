/* The examples a page has loaded: each `<slug>.data.js` assigns its data to
 * `window.MFE_EXAMPLES[slug]`, and the player revives it once, for every player and widget of the
 * page (the revived example holds the scene of its own project, made once too). */
import { reviveExample, type Example } from './engine';

declare global {
  interface Window {
    MFE_EXAMPLES?: Record<string, unknown>;
  }
}

const revived = new WeakMap<object, Example>();

/** The example `slug` the page has loaded, revived; null when it has not loaded it. Throws, saying
 * why, when its data cannot be used. */
export function exampleFor(slug: string): Example | null {
  const data = (globalThis as { MFE_EXAMPLES?: Record<string, unknown> }).MFE_EXAMPLES?.[slug];
  if (data === undefined || data === null) return null;
  return load(slug, data);
}

/** Revives example data held anywhere (the same object gives the same example). */
export function load(slug: string, data: unknown): Example {
  if (typeof data === 'object' && data !== null) {
    const known = revived.get(data);
    if (known) return known;
    const example = reviveExample(slug, data);
    revived.set(data, example);
    return example;
  }
  return reviveExample(slug, data);
}
