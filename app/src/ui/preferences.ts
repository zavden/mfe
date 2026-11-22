/* Editor preferences: per user and per browser (localStorage), not part of project files. */
import { create } from 'zustand';
import {
  defaultIntro,
  defaultOutro,
  type ClipAnimationSpec,
  type IntroSpec,
  type OutroSpec,
  type Vec2,
} from '../model';
import { INTRO_ANIMATIONS, OUTRO_ANIMATIONS, EASINGS } from './animations/catalogue';
import { DEFAULT_PREVIEW_SCALE, isPreviewScale, type PreviewScale } from './creator/previewSize';
import {
  DEFAULT_STANDARD_SCALE,
  isStandardScale,
  type StandardScale,
} from './creator/standardScale';
import { isGridAnchor, isGridStep, type GridAnchor, type GridStep } from './preview/grid';
import { DEFAULT_SCALE_STEP, isScaleStepText } from './preview/scaleStep';
import { DEFAULT_SPLIT_SUFFIX, isSplitSuffix } from './timeline/splitSuffix';
import { safeStorage } from './storage';

export const PREFERENCES_STORAGE_KEY = 'mfe.preferences';

/** How thick the preview's snap guides are drawn. */
export type GuideWidth = 'thin' | 'regular' | 'thick';

/** How the Creator lists the formulas: rows with their rendering, or blocks in a grid (R3). */
export type CreatorView = 'list' | 'grid';

const isCreatorView = (x: unknown): x is CreatorView => x === 'list' || x === 'grid';

/** The colours the Preferences menu offers for the snap guides and for the glyphs picked with
 * Alt; the first one is the default of both. */
export const GUIDE_COLORS: readonly { id: string; label: string; value: string }[] = [
  { id: 'yellow', label: 'Yellow', value: '#ffe74c' },
  { id: 'orange', label: 'Orange', value: '#ff9f1c' },
  { id: 'magenta', label: 'Magenta', value: '#ff5c8d' },
  { id: 'cyan', label: 'Cyan', value: '#4cc9f0' },
  { id: 'green', label: 'Green', value: '#6ee76e' },
  { id: 'white', label: 'White', value: '#ffffff' },
];

/** The guide widths, in CSS pixels (the preview draws whole device pixels: 1, 2 and 3 on a
 * 1x display, 2, 3 and 5 on a 2x one). */
export const GUIDE_WIDTHS: Record<GuideWidth, number> = { thin: 0.75, regular: 1.5, thick: 2.5 };

const GUIDE_WIDTH_IDS = Object.keys(GUIDE_WIDTHS) as GuideWidth[];

export interface Preferences {
  /** New clips get `intro` (else intro `none`: the formula appears at the clip start). */
  autoIntro: boolean;
  /** New clips get `outro` (else outro `none`: the formula disappears at the clip end). */
  autoOutro: boolean;
  /** Animation used when `autoIntro` is on; never kind `none`. */
  intro: IntroSpec;
  /** Animation used when `autoOutro` is on; never kind `none`. */
  outro: OutroSpec;
  /** A clip dragged in the preview sticks to the edges and centres of the other clips and of
   * the frame (Ctrl/⌘ held suspends it). */
  snapObjects: boolean;
  /** The colour ('#rrggbb') of the guide lines a snapped drag shows in the preview. */
  guideColor: string;
  /** How thick those lines are. */
  guideWidth: GuideWidth;
  /** The colour ('#rrggbb') of the glyphs picked with Alt in the preview — their faint fill and
   * their outline — and of the rectangle that picks them (D132). */
  pickColor: string;
  /** The preview shows a grid, and a dragged formula snaps to it (Ctrl/⌘ held frees it). */
  grid: boolean;
  /** The grid's spacing, Manim units. */
  gridStep: GridStep;
  /** What the grid holds: the formula's centre, or whichever of its edges is nearer. */
  gridAnchor: GridAnchor;
  /** How far from the pointer (CSS px) a symbol is still picked: the reach of align by symbol
   * and of the circle selector. */
  symbolRadius: number;
  /** The preview's pointer is the circle selector: a click takes the symbol nearest to the
   * pointer within `symbolRadius` — its formula, or with Alt the symbol itself — instead of
   * what is right under it. */
  circleSelect: boolean;
  /** The step the transform handles' scale snaps to, as the user typed it: a preset ("0.2") or a
   * number or fraction of their own ("1/3"); `parseScaleStep` (preview/scaleStep.ts) reads it. */
  scaleStep: string;
  /** What "Split at playhead" adds to an object's name to name the copy that takes the second
   * half of the clip (D169): `f1` → `f1_s`, then `f1_s1`… when taken. ASCII letters, digits and
   * "_" (timeline/splitSuffix.ts), so that the name stays a Python variable. */
  splitSuffix: string;
  /** The transform handles stay on the selected clips without Shift held. */
  keepHandles: boolean;
  /** A Morph block added to a clip starts with the pairs "Suggest" proposes for it where it lands
   * (`suggestMorphPairs`, ui/morph/morphDraft.ts) instead of none; never for a copy of a block. */
  autoSuggestMorphPairs: boolean;
  /** The Creator's formula list as rows, or as blocks (R3). */
  creatorView: CreatorView;
  /** How large the previews of the Creator's list are, a multiple of their standard size (D173,
   * creator/previewSize.ts): the rendering in each row of the list view… */
  creatorListPreview: PreviewScale;
  /** …and the tooltip beside a block of the block view, each view its own. */
  creatorBlockPreview: PreviewScale;
  /** A glyph view (the formula editor's, the text workspace's) also lists its glyphs as keys
   * under the drawing, with index and label: the way to pick glyphs from the keyboard. */
  glyphList: boolean;
  /** The pair editors (the relation editor, the pair editor of Morph blocks) list the glyphs of
   * their two sides the same way, under their drawing. */
  relationGlyphList: boolean;
  /** The on-screen keypad of the formula editor was left shown: the editor opens with it, until
   * its key hides it. */
  formulaKeyboardShown: boolean;
  /** The scale new formulas and new texts are born with, as typed (1 = font size 48; R4): the
   * objects that exist keep their size. */
  standardScale: StandardScale;
  /** How opaque the preview draws a formula locked in it (`Clip.previewLocked`), of its own
   * opacity: 0.4 shows it at 40 %, 1 as any other. The editor's preview only: no export. */
  lockedOpacity: number;
  /** In the Preview's world view of a scene with a camera (D190): the route between the camera's
   * frames is drawn… */
  cameraRoute: boolean;
  /** …and what the camera leaves out at the playhead is dimmed. */
  cameraVeil: boolean;
  /** Zen mode (D182), for small windows: the Creator and the Animations panel share one place
   * — a drawer over the Preview, opened by its tab — and the timeline is a column on the left,
   * drawn vertical. It only rearranges; off by default. */
  zenMode: boolean;
  /** In Zen mode, the side of the Preview the tabs of the Creator and the Animations panel are
   * on: their strip moves there with its own button. */
  zenStrip: 'top' | 'bottom';
}

/** The opacities the Preferences menu offers for the formulas locked in the preview, and the
 * bounds a stored one is kept in. */
export const LOCKED_OPACITIES: readonly number[] = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1];
export const LOCKED_OPACITY = { default: 0.4, min: 0.05, max: 1 };

/** The reach of align by symbol and of the circle selector, CSS px: its default and the bounds
 * Shift+wheel keeps it in. */
export const SYMBOL_RADIUS = { default: 14, min: 6, max: 60 };

/** What an event of the wheel leaves of the reach: the reach, in whole pixels, and what is kept
 * for the event after it. */
export interface ReachTurn {
  radius: number;
  /** The reach as the wheel has turned it so far, where that is not a whole pixel: the part of a
   * pixel the reach does not show yet. `null` when nothing is kept. */
  kept: number | null;
}

/** The reach after one event of the wheel with Shift held (`delta`: the event's `deltaY`, or its
 * `deltaX` where the system turns that wheel into a sideways scroll), `kept` being what the event
 * before it left: a notch of a wheel is about a fifth, within the limits, in whole pixels.
 *
 * The reach is turned finer than the pixel it is shown and stored in, and that is what is kept. An
 * event too small to move a whole reach by a pixel would be rounded away, however many came:
 * a trackpad sends a scroll as many events of a few pixels, and so does a wheel where the system
 * counts its turn in pixels. So a scroll takes the reach as far as one event of its whole length,
 * however it is cut into events, and the fingers back where they were give the reach it was. What
 * was kept holds while the reach is the one it rounds to; changed elsewhere, the count starts from
 * the reach itself. Nothing is kept past a limit. */
export function symbolReachAfterWheel(
  current: number,
  kept: number | null,
  delta: number,
): ReachTurn {
  const from = kept !== null && Math.round(kept) === current ? kept : current;
  const turned = Math.max(
    SYMBOL_RADIUS.min,
    Math.min(SYMBOL_RADIUS.max, from * Math.exp(-delta * 0.002)),
  );
  const radius = Math.round(turned);
  // On a whole pixel there is nothing to keep (a limit; the fingers back where they were).
  return { radius, kept: Math.abs(turned - radius) < 1e-9 ? null : turned };
}

export interface PreferencesState extends Preferences {
  set(patch: Partial<Preferences>): void;
}

/** Off by default: the app is mostly about transforming formulas into each other. */
export function defaultPreferences(): Preferences {
  return {
    autoIntro: false,
    autoOutro: false,
    intro: defaultIntro('write'),
    outro: defaultOutro('fade_out'),
    snapObjects: true,
    guideColor: '#ffe74c',
    guideWidth: 'thin',
    pickColor: '#ffe74c',
    grid: false,
    gridStep: 1,
    gridAnchor: 'center',
    symbolRadius: SYMBOL_RADIUS.default,
    circleSelect: false,
    scaleStep: DEFAULT_SCALE_STEP,
    splitSuffix: DEFAULT_SPLIT_SUFFIX,
    keepHandles: false,
    autoSuggestMorphPairs: false,
    creatorView: 'list',
    creatorListPreview: DEFAULT_PREVIEW_SCALE,
    creatorBlockPreview: DEFAULT_PREVIEW_SCALE,
    glyphList: false,
    relationGlyphList: false,
    formulaKeyboardShown: false,
    standardScale: { ...DEFAULT_STANDARD_SCALE },
    lockedOpacity: LOCKED_OPACITY.default,
    cameraRoute: true,
    cameraVeil: true,
    zenMode: false,
    zenStrip: 'top',
  };
}

const INTRO_KINDS = INTRO_ANIMATIONS.map((a) => a.value);
const OUTRO_KINDS = OUTRO_ANIMATIONS.map((a) => a.value);

const isHexColor = (x: unknown): x is string => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x);

const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** A stored animation spec checked field by field over the kind's defaults; null if unusable. */
function readSpec<K extends string>(
  value: unknown,
  kinds: readonly K[],
  defaults: (kind: K) => ClipAnimationSpec<K>,
): ClipAnimationSpec<K> | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const kind = kinds.find((k) => k === v.kind);
  if (!kind) return null;
  const base = defaults(kind);
  const [sx, sy] = Array.isArray(v.shift) ? (v.shift as unknown[]) : [];
  return {
    kind,
    duration: isNumber(v.duration) && v.duration > 0 ? v.duration : base.duration,
    easing: EASINGS.find((e) => e === v.easing) ?? base.easing,
    lagRatio: v.lagRatio === null || (isNumber(v.lagRatio) && v.lagRatio >= 0) ? v.lagRatio : null,
    shift: isNumber(sx) && isNumber(sy) ? [sx, sy] : base.shift,
    scale: isNumber(v.scale) && v.scale > 0 ? v.scale : base.scale,
  };
}

/** Stored preferences merged over the defaults; anything malformed falls back to them. */
export function readPreferences(): Preferences {
  const defaults = defaultPreferences();
  try {
    const raw = safeStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return defaults;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    return {
      autoIntro: typeof stored.autoIntro === 'boolean' ? stored.autoIntro : defaults.autoIntro,
      autoOutro: typeof stored.autoOutro === 'boolean' ? stored.autoOutro : defaults.autoOutro,
      intro: readSpec(stored.intro, INTRO_KINDS, defaultIntro) ?? defaults.intro,
      outro: readSpec(stored.outro, OUTRO_KINDS, defaultOutro) ?? defaults.outro,
      snapObjects:
        typeof stored.snapObjects === 'boolean' ? stored.snapObjects : defaults.snapObjects,
      guideColor: isHexColor(stored.guideColor) ? stored.guideColor : defaults.guideColor,
      guideWidth: GUIDE_WIDTH_IDS.find((id) => id === stored.guideWidth) ?? defaults.guideWidth,
      pickColor: isHexColor(stored.pickColor) ? stored.pickColor : defaults.pickColor,
      grid: typeof stored.grid === 'boolean' ? stored.grid : defaults.grid,
      gridStep: isGridStep(stored.gridStep) ? stored.gridStep : defaults.gridStep,
      gridAnchor: isGridAnchor(stored.gridAnchor) ? stored.gridAnchor : defaults.gridAnchor,
      symbolRadius:
        isNumber(stored.symbolRadius) &&
        stored.symbolRadius >= SYMBOL_RADIUS.min &&
        stored.symbolRadius <= SYMBOL_RADIUS.max
          ? stored.symbolRadius
          : defaults.symbolRadius,
      circleSelect:
        typeof stored.circleSelect === 'boolean' ? stored.circleSelect : defaults.circleSelect,
      scaleStep: isScaleStepText(stored.scaleStep) ? stored.scaleStep : defaults.scaleStep,
      splitSuffix: isSplitSuffix(stored.splitSuffix) ? stored.splitSuffix : defaults.splitSuffix,
      keepHandles:
        typeof stored.keepHandles === 'boolean' ? stored.keepHandles : defaults.keepHandles,
      autoSuggestMorphPairs:
        typeof stored.autoSuggestMorphPairs === 'boolean'
          ? stored.autoSuggestMorphPairs
          : defaults.autoSuggestMorphPairs,
      creatorView: isCreatorView(stored.creatorView) ? stored.creatorView : defaults.creatorView,
      creatorListPreview: isPreviewScale(stored.creatorListPreview)
        ? stored.creatorListPreview
        : defaults.creatorListPreview,
      creatorBlockPreview: isPreviewScale(stored.creatorBlockPreview)
        ? stored.creatorBlockPreview
        : defaults.creatorBlockPreview,
      glyphList: typeof stored.glyphList === 'boolean' ? stored.glyphList : defaults.glyphList,
      relationGlyphList:
        typeof stored.relationGlyphList === 'boolean'
          ? stored.relationGlyphList
          : defaults.relationGlyphList,
      formulaKeyboardShown:
        typeof stored.formulaKeyboardShown === 'boolean'
          ? stored.formulaKeyboardShown
          : defaults.formulaKeyboardShown,
      standardScale: isStandardScale(stored.standardScale)
        ? { math: stored.standardScale.math, tex: stored.standardScale.tex }
        : defaults.standardScale,
      lockedOpacity:
        isNumber(stored.lockedOpacity) &&
        stored.lockedOpacity >= LOCKED_OPACITY.min &&
        stored.lockedOpacity <= LOCKED_OPACITY.max
          ? stored.lockedOpacity
          : defaults.lockedOpacity,
      cameraRoute:
        typeof stored.cameraRoute === 'boolean' ? stored.cameraRoute : defaults.cameraRoute,
      cameraVeil: typeof stored.cameraVeil === 'boolean' ? stored.cameraVeil : defaults.cameraVeil,
      zenMode: typeof stored.zenMode === 'boolean' ? stored.zenMode : defaults.zenMode,
      zenStrip:
        stored.zenStrip === 'bottom' || stored.zenStrip === 'top'
          ? stored.zenStrip
          : defaults.zenStrip,
    };
  } catch {
    return defaults;
  }
}

export const usePreferences = create<PreferencesState>()((set, get) => ({
  ...readPreferences(),
  set: (patch) => {
    set(patch);
    const {
      autoIntro,
      autoOutro,
      intro,
      outro,
      snapObjects,
      guideColor,
      guideWidth,
      pickColor,
      grid,
      gridStep,
      gridAnchor,
      symbolRadius,
      circleSelect,
      scaleStep,
      splitSuffix,
      keepHandles,
      autoSuggestMorphPairs,
      creatorView,
      creatorListPreview,
      creatorBlockPreview,
      glyphList,
      relationGlyphList,
      formulaKeyboardShown,
      standardScale,
      lockedOpacity,
      cameraRoute,
      cameraVeil,
      zenMode,
      zenStrip,
    } = get();
    safeStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        autoIntro,
        autoOutro,
        intro,
        outro,
        snapObjects,
        guideColor,
        guideWidth,
        pickColor,
        grid,
        gridStep,
        gridAnchor,
        symbolRadius,
        circleSelect,
        scaleStep,
        splitSuffix,
        keepHandles,
        autoSuggestMorphPairs,
        creatorView,
        creatorListPreview,
        creatorBlockPreview,
        glyphList,
        relationGlyphList,
        formulaKeyboardShown,
        standardScale,
        lockedOpacity,
        cameraRoute,
        cameraVeil,
        zenMode,
        zenStrip,
      }),
    );
  },
}));

/** One event of the wheel with Shift held, in a view that sizes the reach with it: the preference
 * is written when the reach changes, and `kept` — the view's own, a ref — holds what the event
 * left for the next (`symbolReachAfterWheel`). */
export function turnSymbolReach(kept: { current: number | null }, delta: number): void {
  const { symbolRadius, set } = usePreferences.getState();
  const turn = symbolReachAfterWheel(symbolRadius, kept.current, delta);
  kept.current = turn.kept;
  if (turn.radius !== symbolRadius) set({ symbolRadius: turn.radius });
}

/** Intro and outro for a clip created now (e.g. a formula dropped on the timeline): the intro
 * its formula chose (`own`, `Formula.intro`), else the preference's. With a `clipLength`, both
 * durations shrink proportionally when they would not fit in the clip. */
export function newClipAnimations(
  clipLength = Infinity,
  own: IntroSpec | null = null,
): { intro: IntroSpec; outro: OutroSpec } {
  const { autoIntro, autoOutro, intro, outro } = usePreferences.getState();
  const chosen = own ?? (autoIntro ? intro : null);
  const next = {
    intro: chosen ? { ...chosen, shift: [...chosen.shift] as Vec2 } : defaultIntro('none'),
    outro: autoOutro ? { ...outro, shift: [...outro.shift] as Vec2 } : defaultOutro('none'),
  };
  const total = next.intro.duration + next.outro.duration;
  if (total > clipLength) {
    const k = clipLength / total;
    next.intro.duration *= k;
    next.outro.duration *= k;
  }
  return next;
}
