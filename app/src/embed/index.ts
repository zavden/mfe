/* Public API of the player of the web documentation (`docs/web/assets/player.js`, built from
 * `main.ts` by `docs/web/tools/build-player.mjs`): `window.MFEPlayer`. docs/web/tools/EXAMPLES.md
 * tells the authors of pages how to use it, and the authors of widgets how to use its engine. */
import { LINE_ANCHORS, PULSE_EASINGS } from '../model';
import { EasingSchema } from '../model/schema';
import { rateFunction } from '../scene/easing';
import { DATA_VERSION } from './data';
import { reviveExample, sizeCanvas } from './engine';
import {
  ANCHOR_ARROWS,
  ANCHOR_LABELS,
  anchorPoints,
  AUTO_ANCHOR_HINT,
  COMPASS_ANCHORS,
  lineEnds,
  lineRender,
} from './lines';
import {
  describePair,
  EXTRAS_OPTIONS,
  glyphClick,
  glyphLabel,
  linkFrame,
  linkPair,
  PAIR_COLORS,
  pairColor,
  pairsHolding,
  pairStyleBadge,
  readingOrder,
  relationSummary,
  removePairs,
  setPairExtras,
  setPairsStyle,
  sortedUnique,
  STYLE_OPTIONS,
  styleLabel,
  styleOfPair,
  suggestPairs,
  textSize,
  unpairedGlyphs,
} from './pairs';
import {
  BUILT_IN_PALETTES,
  EDITOR_COLORS,
  PALETTE_ROLES,
  paletteRoleForKind,
  ROLE_USES,
} from './palettes';
import { animationLabel } from './labels';
import { injectStyles, mount, mountAll, MOUNTED } from './player';
import { exampleFor, load } from './registry';
import { bitmapSize, fitView, frameBox, padBox } from './view';
import {
  clampWindow,
  framedTimes,
  MIN_WINDOW,
  relationSpan,
  round6,
  WINDOW_PAD,
  windowBand,
  windowProgress,
  windowRange,
  windowSpan,
} from './window';

export type { ExampleData, ExampleMeta } from './data';
export type { DrawOptions, Example, FormulaInfo, GlyphInfo, Scene, SceneOptions } from './engine';
export type { PlayerOptions } from './options';
export type { MountOptions, PlayerHandle } from './player';
export type { View } from './view';
export type { BuiltInPalette, PaletteColors, PaletteRole } from './palettes';
export type {
  GlyphClick,
  LinkFrame,
  LinkResult,
  PairHolder,
  PairSide,
  SideSelection,
} from './pairs';
export type { Edges, TimeSpan, WindowEdit, WindowSpec } from './window';

/** The player's version: what it reads (`DATA_VERSION`) and what it offers may grow under it. */
export const VERSION = '1.1.0';

/** What widgets build on (EXAMPLES.md, "The engine"). */
export const engine = {
  /** The version of the data the player reads. */
  dataVersion: DATA_VERSION,
  /** The example the page has loaded (its `.data.js`), revived once; null when it has not. */
  example: exampleFor,
  /** Revives example data held elsewhere (the same object gives the same example). */
  load,
  /** A fresh example of the data each time (no sharing with the page's players). */
  revive: reviveExample,
  /** Gives a canvas the bitmap of its CSS size on this screen; returns its pixel ratio. */
  sizeCanvas,
  fitView,
  frameBox,
  padBox,
  bitmapSize,
  /** Manim's name of an intro or an outro kind ("Write", "FadeOut"), as the timeline shows it. */
  animationLabel,
  /** The rate functions (easings) the app offers, by Manim's names, and their curves in either
   * library: `curve(name, 'ce' | 'gl')(t)` is the progress at the fraction `t` of the time. The
   * pulses come back to where they started (an Indicate takes only those). */
  rates: {
    names: EasingSchema.options,
    pulses: PULSE_EASINGS,
    curve: rateFunction,
  },
  /** What the relation editor does with pairs and windows (`pairs.ts`, `window.ts`). */
  relations: {
    styles: STYLE_OPTIONS,
    styleLabel,
    extras: EXTRAS_OPTIONS,
    badge: pairStyleBadge,
    colors: PAIR_COLORS,
    color: pairColor,
    sortedUnique,
    styleOf: styleOfPair,
    link: linkPair,
    remove: removePairs,
    setStyle: setPairsStyle,
    setExtras: setPairExtras,
    readingOrder,
    suggest: suggestPairs,
    linkFrame,
    textSize,
    glyphLabel,
    describe: describePair,
    summary: relationSummary,
    unpaired: unpairedGlyphs,
    click: glyphClick,
    holding: pairsHolding,
    minWindow: MIN_WINDOW,
    windowRange,
    clampWindow,
    windowSpan,
    span: relationSpan,
    pad: WINDOW_PAD,
    progress: windowProgress,
    framedTimes,
    band: windowBand,
    round6,
  },
  /** Lines and arrows with ends on glyphs (`lines.ts`). */
  lines: {
    anchors: LINE_ANCHORS,
    compass: COMPASS_ANCHORS,
    labels: ANCHOR_LABELS,
    arrows: ANCHOR_ARROWS,
    autoHint: AUTO_ANCHOR_HINT,
    ends: lineEnds,
    anchorPoints,
    render: lineRender,
  },
  /** Palettes by role (`palettes.ts`). */
  palettes: {
    roles: PALETTE_ROLES,
    uses: ROLE_USES,
    builtIn: BUILT_IN_PALETTES,
    editor: EDITOR_COLORS,
    roleOfKind: paletteRoleForKind,
  },
};

export const MFEPlayer = {
  version: VERSION,
  /** The attribute a mounted figure carries. */
  mountedAttribute: MOUNTED,
  mount,
  mountAll,
  /** Puts the player's stylesheet in a document once (a player does it when it mounts): for a
   * widget that builds the player's transport bar or its strip without a player. */
  injectStyles,
  engine,
};

declare global {
  interface Window {
    MFEPlayer?: typeof MFEPlayer;
  }
}

/** Mounts the page's players once its deferred scripts — the examples' data among them — have
 * run: at DOMContentLoaded (and at load, for a script added late), or now when the page is
 * complete already. Returns what stops waiting. */
export function autoMount(doc: Document): () => void {
  const run = () => {
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
