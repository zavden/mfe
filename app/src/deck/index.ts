/* The public object of the runtime of an exported page: `window.MFE` (`main.ts` sets it). The
 * guide that travels with every exported scene (`AGENTS.md`) and its types (`types/mfe.d.ts`)
 * describe it to whoever extends the scene; `docs/architecture/13-slides-mode.md` to whoever
 * changes it. `types/mfe.d.ts` is made of the interfaces this file exports and of what they use
 * (`build/deckTypes.ts`), with their comments: they are what an extender reads. */
import { EasingSchema } from '../model/schema';
import type { Easing } from '../model';
import { rateFunction } from '../scene/easing';
import type { Deck } from './deck';
import { GLYPHS_VERSION } from './glyphFile';
import type { DeckOptions } from './options';
import {
  checkScenes,
  mount,
  mountAll,
  mountedDecks,
  registerGlyphs,
  registerInlineScenes,
  registerScene,
  sceneNames,
  type SceneAssets,
} from './registry';
import type { DeckProblem } from './sceneFile';

export type { AnimationSpec, Deck, DeckComment, DeckEvent, DeckPause, StageBox } from './deck';
export type { GlyphFile, GlyphFileFormula, GlyphFileGlyph } from './glyphFile';
export type { ControlsOption, DeckOptions } from './options';
export type { SceneAssets } from './registry';
export type { DeckProblem } from './sceneFile';
export type { LayerName } from './svgStage';

/** The runtime's version: what it reads (`glyphsVersion`, the project's format) may grow under it. */
export const VERSION = '1.0.0';

/** What is wrong with the files of a scene: what `MFE.check` gives for each. */
export interface SceneCheck {
  scene: string;
  problems: DeckProblem[];
}

/** `window.MFE`: the runtime of an exported page, set by `mfe-runtime.js`. A page's own code
 * mounts scenes with it and gets their decks. */
export interface MfeRuntime {
  /** The runtime's version. */
  readonly version: string;
  /** The version of the glyph file (`glyphs.js`) this runtime reads. */
  readonly glyphsVersion: number;
  /** What `scene.js` calls to register its project: `MFE.scene('name', { … })`, with the
   * address of its sound beside it when it has one. */
  scene(name: string, project: unknown, assets?: SceneAssets): void;
  /** What `glyphs.js` calls to register the outlines of its formulas: `MFE.glyphs('name', { … })`. */
  glyphs(name: string, data: unknown): void;
  /** The names of the scenes loaded. */
  readonly scenes: string[];
  /** Mounts a scene in an element (or in the first one a selector finds) and gives its deck. The
   * scene is the one the element's `data-scene` names — or the only one loaded, when it names
   * none. An element mounted already gives the deck it has: so code of the page can ask for the
   * deck of an element the page mounted by itself. `options` win over the element's `data-`
   * attributes. Throws when nothing matches the selector. */
  mount(target: Element | string, options?: Partial<DeckOptions>): Deck;
  /** Mounts every element of class `mfe-deck` of the page (or of `root`) not mounted yet: what
   * the page does by itself once its scripts have run (at `DOMContentLoaded`). */
  mountAll(root?: ParentNode): Deck[];
  /** The decks of the page, in the order they were mounted. */
  readonly decks: Deck[];
  /** Manim's rate functions by name, as ManimCE curves them: `MFE.rates.smooth(0.25)`. An
   * animation of a deck (`deck.animate({ ease: 'smooth' })`) takes the curve of its scene's own
   * library. */
  readonly rates: Readonly<Record<Easing, (t: number) => number>>;
  /** What is wrong with the files of a scene (of every scene loaded, with no name), without
   * mounting it: what `node check.mjs` prints. */
  check(name?: string): SceneCheck[];
}

const rates = Object.fromEntries(
  EasingSchema.options.map((name) => [name, rateFunction(name, 'ce')]),
) as Record<Easing, (t: number) => number>;

export const MFE: MfeRuntime = {
  version: VERSION,
  glyphsVersion: GLYPHS_VERSION,
  scene: registerScene,
  glyphs: registerGlyphs,
  get scenes(): string[] {
    return sceneNames();
  },
  mount,
  mountAll,
  get decks() {
    return mountedDecks();
  },
  rates,
  check: checkScenes,
};

/** Mounts the page's decks once its scripts — the scenes' files among them — have run: at
 * DOMContentLoaded (and at load, for a script added late), or now when the page is complete
 * already. Returns what stops waiting. */
export function autoMount(doc: Document): () => void {
  const run = () => {
    // A page of one file carries its scenes inside itself.
    registerInlineScenes(doc);
    mountAll(doc);
  };
  if (doc.readyState === 'complete') {
    run();
    return () => {};
  }
  doc.addEventListener('DOMContentLoaded', run, { once: true });
  doc.defaultView?.addEventListener('load', run, { once: true });
  return () => {
    doc.removeEventListener('DOMContentLoaded', run);
    doc.defaultView?.removeEventListener('load', run);
  };
}
