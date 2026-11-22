/* The entry of `mfe-runtime.js`, the engine of an exported page (`app/build/deckRuntime.ts` builds
 * it into the app, which writes it out with every Export ▸ HTML): sets `MFE` and mounts the page's
 * decks when its scripts have run. Without a document — `check.mjs` runs it in Node to check a
 * scene file — it only sets `MFE`. */
import { autoMount, MFE, type MfeRuntime } from './index';

declare global {
  var MFE: MfeRuntime | undefined;
}

globalThis.MFE = MFE;
if (typeof document !== 'undefined') autoMount(document);
