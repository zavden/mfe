/* The glyph selection of the multi-formula editor: per formula a glyph selection (with its own
 * Shift anchor). A plain click selects one glyph of one formula; Ctrl/⌘+click toggles and Shift+
 * click extends within that formula, keeping the others; a marquee selects what it touches (with
 * Ctrl/⌘ or Shift: adds it), in any formula. Pure, so it can be tested without a DOM. */
import type { FormulaId } from '../../model';
import type { FormulaGlyphs } from './formulaActions';
import {
  clampSelection,
  clickGlyph,
  marqueeSelection,
  NO_SELECTION,
  type GlyphSelection,
} from './glyphSelection';

export type MultiSelection = ReadonlyMap<FormulaId, GlyphSelection>;

export const NO_MULTI: MultiSelection = new Map();

/** Without the formulas that select nothing. */
function prune(selection: Map<FormulaId, GlyphSelection>): MultiSelection {
  for (const [id, s] of selection) if (s.selected.size === 0) selection.delete(id);
  return selection;
}

export function clickMulti(
  current: MultiSelection,
  formula: FormulaId,
  glyph: number,
  modifiers: { shift: boolean; toggle: boolean },
): MultiSelection {
  if (!modifiers.shift && !modifiers.toggle) {
    return new Map([[formula, clickGlyph(NO_SELECTION, glyph, modifiers)]]);
  }
  const next = new Map(current);
  next.set(formula, clickGlyph(current.get(formula) ?? NO_SELECTION, glyph, modifiers));
  return prune(next);
}

/** A marquee touching `touched` (glyphs per formula), from the selection the drag started at. */
export function marqueeMulti(
  base: MultiSelection,
  touched: ReadonlyMap<FormulaId, readonly number[]>,
  additive: boolean,
): MultiSelection {
  const next = new Map(additive ? base : []);
  for (const [id, glyphs] of touched) {
    next.set(id, marqueeSelection(base.get(id) ?? NO_SELECTION, glyphs, additive));
  }
  return prune(next);
}

/** Every glyph of each formula (`counts`: glyphs per formula). */
export function selectAllMulti(counts: ReadonlyMap<FormulaId, number>): MultiSelection {
  const next = new Map<FormulaId, GlyphSelection>();
  for (const [id, n] of counts) {
    next.set(id, { selected: new Set(Array.from({ length: n }, (_, i) => i)), anchor: 0 });
  }
  return prune(next);
}

/** Drop formulas that are gone and glyphs beyond each formula's count. */
export function clampMulti(
  current: MultiSelection,
  counts: ReadonlyMap<FormulaId, number>,
): MultiSelection {
  let changed = false;
  const next = new Map<FormulaId, GlyphSelection>();
  for (const [id, s] of current) {
    const n = counts.get(id);
    if (n === undefined) {
      changed = true;
      continue;
    }
    const clamped = clampSelection(s, n);
    if (clamped !== s) changed = true;
    next.set(id, clamped);
  }
  return changed ? prune(next) : current;
}

/** The selected glyphs per formula (ascending), in the order of `order`. */
export function targetsOf(selection: MultiSelection, order: readonly FormulaId[]): FormulaGlyphs[] {
  return order
    .filter((id) => (selection.get(id)?.selected.size ?? 0) > 0)
    .map((id) => ({ id, glyphs: [...selection.get(id)!.selected].sort((a, b) => a - b) }));
}
