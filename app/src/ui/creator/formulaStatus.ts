/* What the Creator says of a formula's render: the status badge of a row and of a block, and
 * the block's tooltip. A font text nothing has shaped for the project's library says "needs the
 * companion" (D82). Pure. */
import {
  pangoState,
  TEXT_BOXES_WARNING,
  textDrawing,
  type CompanionState,
  type TextDrawing,
} from '../../engine';
import { isBlank, TARGET_NAMES, type Formula, type Target } from '../../model';
import type { FormulaRenderEntry } from '../../store';
import { describeRenderError } from './renderErrors';

export type FormulaStatusId = 'idle' | 'loading' | 'error' | 'ok';

export interface FormulaStatus {
  status: FormulaStatusId;
  /** Rendered, and the glyphs are the ones Manim builds: LaTeX's from the companion, or the
   * shape Pango gave a font text for the project's library. Else MathJax, or a font text drawn
   * without its real glyphs. */
  exact: boolean;
  /** A font text nothing has shaped for the project's library: it is drawn as placeholder
   * boxes, or with the shape the other library gave it. */
  needsCompanion: boolean;
  /** The badge's text: "empty", "…", "rendering…", "error", "exact", "MathJax" or "needs the
   * companion". */
  label: string;
  /** The badge's tooltip: what the status means, or the render error. */
  title: string | undefined;
}

/** What the badge of a font text drawn without its real glyphs says. */
export const NEEDS_COMPANION = 'needs the companion';

/** The tooltip of that badge: how the text is drawn, and what would draw it right. `note`: what
 * the render says of itself (boxes where saved glyphs were say why and what to do). */
export function needsCompanionTitle(drawing: TextDrawing, target: Target, note?: string): string {
  const library = TARGET_NAMES[target];
  const other = TARGET_NAMES[target === 'ce' ? 'gl' : 'ce'];
  switch (drawing) {
    case 'borrowed':
      return `Drawn with the shape ${other} gave it: the same glyphs, at ${other}'s size. A companion that shapes text for ${library} draws it as ${library} will.`;
    case 'saved-boxes':
      return (
        note ??
        'Placeholder boxes where its glyphs were: the saved appearance of this text is not at hand.'
      );
    default:
      // Boxes that say something else of themselves (the geometry of an earlier source of the
      // text is not at hand) say it here too.
      return note && note !== TEXT_BOXES_WARNING
        ? note
        : 'Placeholder boxes, one per character: nothing has shaped this text. It can be placed, coloured and animated; the companion draws its real glyphs.';
  }
}

/** Why no companion shapes text for `target` now, in a sentence, or null when one does (or
 * may: its text worker is ready, or was not asked for yet). */
export function companionTextNote(companion: CompanionState, target: Target): string | null {
  const library = TARGET_NAMES[target];
  if (companion.status !== 'online') return null;
  const capabilities = companion.health.capabilities;
  switch (pangoState(companion, target)) {
    case 'preparing':
      return 'The companion is starting its text worker: the text is shaped as soon as it is ready.';
    case 'failed': {
      const text = capabilities.pango?.[target];
      const why = text?.state === 'failed' && text.message ? ` (${text.message})` : '';
      return `The companion could not start its text worker for ${library}${why}.`;
    }
    case 'none':
      // Still looking for its interpreters (the first seconds): nothing to say yet.
      if (capabilities.manimProbing) return null;
      return (target === 'ce' ? capabilities.manimCE : capabilities.manimGL)
        ? `The companion that is running shapes no text for ${library} (font text needs companion 1.6 or later).`
        : `The companion that is running shapes no text for ${library}: it has no ${library} interpreter (start it with --${target}-python).`;
    default:
      return null;
  }
}

/** `target`: the project's library (a font text is exact for one library). */
export function formulaStatus(
  entry: FormulaRenderEntry | undefined,
  formula: Formula,
  target: Target = 'ce',
): FormulaStatus {
  const plain = { exact: false, needsCompanion: false };
  if (!entry || entry.status === 'idle') {
    return { ...plain, status: 'idle', label: isBlank(formula) ? 'empty' : '…', title: undefined };
  }
  if (entry.status === 'loading') {
    return { ...plain, status: 'loading', label: 'rendering…', title: undefined };
  }
  if (entry.status === 'error') {
    return {
      ...plain,
      status: 'error',
      label: 'error',
      title: entry.error ? describeRenderError(entry.error, formula) : undefined,
    };
  }
  const render = entry.resolved?.render;
  if (formula.kind === 'text' && render) {
    const drawing = textDrawing(formula, render, { preamble: '', target });
    if (drawing === 'exact') {
      return {
        status: 'ok',
        exact: true,
        needsCompanion: false,
        label: 'exact',
        title: 'Exact: glyphs and order come from Pango, as in Manim',
      };
    }
    return {
      status: 'ok',
      exact: false,
      needsCompanion: true,
      label: NEEDS_COMPANION,
      title: needsCompanionTitle(drawing, target, render.warnings[0]),
    };
  }
  const exact = render?.exact ?? false;
  return {
    status: 'ok',
    exact,
    needsCompanion: false,
    label: exact ? 'exact' : 'MathJax',
    title: exact
      ? 'Exact: glyphs and order come from LaTeX, as in Manim'
      : 'MathJax: glyph order can differ from Manim in some formulas',
  };
}
