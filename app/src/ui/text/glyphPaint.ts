/* The glyph colours and the glyphs hidden at the start of a text being composed. A draft has no
 * canonical glyphs yet: what the author paints counts by the glyphs of the render of the draft,
 * and follows them from one render to the next with the correspondence the render sync uses
 * (`engine/correspondence.ts`). Beside the paint goes where each canonical glyph of the object
 * as it was (its snapshot) is now: on Apply that map carries the other references of the project
 * (pairs, blocks, attachments) in the same step. Pure: the workspace keeps the state. */
import { toSnapshot, type GlyphMatch } from '../../engine';
import type { RenderBasis } from '../../engine/correspondence';
import type { Formula, FormulaSnapshot } from '../../model';

/** Colours and hidden glyphs, counted by the glyphs of one render. */
export interface GlyphPaint {
  /** Glyph index of the render (a decimal string) → its own colour. */
  colors: Record<string, string>;
  /** Glyph indices of the render, ascending, without repeats. */
  hidden: number[];
}

export const NO_PAINT: GlyphPaint = { colors: {}, hidden: [] };

export interface PaintState {
  /** The render the paint counts by, with the request that gave it. */
  basis: RenderBasis;
  paint: GlyphPaint;
  /** The key of the snapshot `origin` counts from; null when the object had none. */
  snapshotKey: string | null;
  /** Canonical glyph of that snapshot → glyph of `basis.render`, null where it has none. */
  origin: (number | null)[];
  /** How sure the steps that brought `origin` here were: the least of them, 0…1. */
  confidence: number;
  /** The author changed a colour or a hidden glyph in this session. */
  edited: boolean;
}

type Painted = Pick<Formula, 'glyphColors' | 'hiddenGlyphs'>;

const ascending = (indices: Iterable<number>): number[] =>
  [...new Set(indices)].sort((a, b) => a - b);

/** `painted` carried over `map` (glyph before → glyph after, null where it is gone): what an
 * object's canonical data is on the render that resolves it, and a paint on the next render. */
function carried(painted: Painted, map: readonly (number | null)[]): GlyphPaint {
  const colors: Record<string, string> = {};
  for (const [key, color] of Object.entries(painted.glyphColors)) {
    const to = map[Number(key)] ?? null;
    if (to !== null) colors[String(to)] = color;
  }
  const hidden = painted.hiddenGlyphs
    .map((index) => map[index] ?? null)
    .filter((index): index is number => index !== null);
  return { colors, hidden: ascending(hidden) };
}

/** The state a session starts with: the paint of `formula` on the render that resolves its
 * snapshot through `origin` (the applied object's, `ResolvedFormula.canonToRender`). An object
 * without a snapshot starts unpainted on the first render of its draft (`origin` empty). */
export function seedPaint(
  formula: Painted & Pick<Formula, 'snapshot'>,
  basis: RenderBasis,
  origin: readonly (number | null)[],
  confidence = 1,
): PaintState {
  const known = formula.snapshot !== null;
  return {
    basis,
    paint: known ? carried(formula, origin) : NO_PAINT,
    snapshotKey: formula.snapshot?.key ?? null,
    origin: known ? [...origin] : [],
    confidence,
    edited: false,
  };
}

/** The state after the draft was rendered anew: the paint and the origin follow `match` (the
 * glyphs of the previous render → the glyphs of `basis.render`). */
export function carryPaint(state: PaintState, basis: RenderBasis, match: GlyphMatch): PaintState {
  return {
    ...state,
    basis,
    paint: carried(
      { glyphColors: state.paint.colors, hiddenGlyphs: state.paint.hidden },
      match.map,
    ),
    origin: state.origin.map((index) => (index === null ? null : (match.map[index] ?? null))),
    confidence: Math.min(state.confidence, match.confidence),
  };
}

/** `paint` with the glyphs `indices` in `color`; null removes their own colour. */
export function colorGlyphs(
  paint: GlyphPaint,
  indices: readonly number[],
  color: string | null,
): GlyphPaint {
  const colors = { ...paint.colors };
  for (const index of indices) {
    if (color === null) delete colors[String(index)];
    else colors[String(index)] = color;
  }
  return { ...paint, colors };
}

/** `paint` with the glyphs `indices` hidden at the start, or shown again. */
export function hideGlyphs(
  paint: GlyphPaint,
  indices: readonly number[],
  hidden: boolean,
): GlyphPaint {
  const set = new Set(paint.hidden);
  for (const index of indices) {
    if (hidden) set.add(index);
    else set.delete(index);
  }
  return { ...paint, hidden: ascending(set) };
}

/** What Apply writes for the paint. `canonical`: the object keeps its snapshot, and its colours
 * and hidden glyphs are these, by its canonical indices. `snapshot`: the render of the draft
 * becomes its snapshot; the references of the project follow `map` first (null: it had no
 * snapshot, nothing refers to its glyphs), then the colours and hidden glyphs are the paint's. */
export type PaintCommit =
  | { kind: 'canonical'; glyphColors: Record<string, string>; hiddenGlyphs: number[] }
  | {
      kind: 'snapshot';
      snapshot: FormulaSnapshot;
      map: (number | null)[] | null;
      transition: { from: string; to: string; map: (number | null)[] } | null;
      confidence: number;
      glyphColors: Record<string, string>;
      hiddenGlyphs: number[];
    };

/** The paint by the canonical glyphs `origin` counts from: a canonical glyph the render has takes
 * what its glyph has there; one it lacks keeps what it had (`kept`). */
function canonicalPaint(
  paint: GlyphPaint,
  origin: readonly (number | null)[],
  kept: Painted,
): Pick<PaintCommit, 'glyphColors' | 'hiddenGlyphs'> {
  const glyphColors: Record<string, string> = {};
  const hiddenGlyphs: number[] = [];
  const hidden = new Set(paint.hidden);
  const keptHidden = new Set(kept.hiddenGlyphs);
  origin.forEach((to, canonical) => {
    const color = to === null ? kept.glyphColors[String(canonical)] : paint.colors[String(to)];
    if (color !== undefined) glyphColors[String(canonical)] = color;
    if (to === null ? keptHidden.has(canonical) : hidden.has(to)) hiddenGlyphs.push(canonical);
  });
  return { glyphColors, hiddenGlyphs };
}

/** How the paint of a session reaches `formula` (the object as the project has it, the draft's
 * fields already on it), or a sentence saying why it cannot. The rules are the render sync's:
 * the render of the draft takes the place of the snapshot when the source changed, and also when
 * it is no lesser render than the snapshot's (MathJax never replaces LaTeX's for a new layout or
 * size alone: the snapshot stays, and the paint is told by its canonical glyphs). */
export function planPaintCommit(
  state: PaintState,
  formula: Painted & Pick<Formula, 'snapshot'>,
  contentChanged: boolean,
): PaintCommit | string {
  const { render } = state.basis;
  const { snapshot } = formula;
  const { colors, hidden } = state.paint;
  if (snapshot?.key === render.key) {
    // The snapshot is this very render: glyph k is canonical glyph k.
    const identity = render.glyphs.map((_, index) => index);
    return { kind: 'canonical', ...canonicalPaint(state.paint, identity, formula) };
  }
  const taken = {
    snapshot: toSnapshot(render),
    glyphColors: { ...colors },
    hiddenGlyphs: [...hidden],
  };
  if (!snapshot) return { kind: 'snapshot', ...taken, map: null, transition: null, confidence: 1 };
  if (snapshot.key !== state.snapshotKey)
    return 'The glyphs of this text were rendered again while it was open. Cancel and open it again to change its glyph colours.';
  if (render.backend === 'mathjax' && snapshot.backend === 'latex' && !contentChanged)
    return { kind: 'canonical', ...canonicalPaint(state.paint, state.origin, formula) };
  return {
    kind: 'snapshot',
    ...taken,
    map: [...state.origin],
    transition: { from: snapshot.key, to: render.key, map: [...state.origin] },
    confidence: state.confidence,
  };
}
