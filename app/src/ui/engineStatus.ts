/* The renderer the project really uses, for the top bar (D28). A running companion does not mean
 * every formula is exact: MathJax can be forced (View → Glyph source) and a formula rendered
 * before the companion came up stays on MathJax until it renders again. So the label counts the
 * formulas' own renders. Pure. */
import { canRenderLatex, type CompanionState } from '../engine';
import type { FormulaId, RenderBackend } from '../model';
import type { FormulaRenderEntry } from '../store';

export interface RendererSummary {
  /** What the bar says: one backend for every formula, or "mixed". */
  label: 'LaTeX' | 'MathJax' | 'Pango' | 'mixed';
  /** Formulas drawn from an exact LaTeX render. */
  exact: number;
  /** Font text with verified native contours (included in exact). */
  pango?: number;
  /** Formulas drawn with MathJax (glyph order approximated). */
  mathjax: number;
  /** Font texts drawn as placeholder boxes: nothing shaped them. */
  boxes?: number;
  /** Rendering now, or failed (they still count above if an earlier render is kept). */
  loading: number;
  failed: number;
}

export function rendererSummary(
  formulaIds: readonly FormulaId[],
  entries: Readonly<Record<FormulaId, FormulaRenderEntry>>,
  prefer: 'auto' | RenderBackend,
  companion: CompanionState,
): RendererSummary {
  const summary: RendererSummary = {
    label: 'MathJax',
    exact: 0,
    mathjax: 0,
    loading: 0,
    failed: 0,
  };
  for (const id of formulaIds) {
    const entry = entries[id];
    if (!entry) continue;
    if (entry.status === 'loading') summary.loading++;
    if (entry.status === 'error') summary.failed++;
    const render = entry.resolved?.render;
    const source = render?.backend;
    if (source === 'latex') summary.exact++;
    else if (source === 'pango' && !render!.exact) summary.boxes = (summary.boxes ?? 0) + 1;
    else if (source === 'pango') {
      summary.exact++;
      summary.pango = (summary.pango ?? 0) + 1;
    } else if (source === 'mathjax') summary.mathjax++;
  }
  // Boxes are no renderer: they make the label "mixed" beside one, and leave it alone otherwise.
  if (summary.boxes && summary.exact + summary.mathjax > 0) summary.label = 'mixed';
  else if (summary.exact > 0 && summary.mathjax > 0) summary.label = 'mixed';
  else if (summary.pango) summary.label = summary.pango === summary.exact ? 'Pango' : 'mixed';
  else if (summary.exact > 0) summary.label = 'LaTeX';
  else if (summary.mathjax === 0) {
    // Nothing rendered yet: what a new formula would get.
    const latex = prefer === 'latex' || (prefer === 'auto' && canRenderLatex(companion));
    summary.label = latex ? 'LaTeX' : 'MathJax';
  }
  return summary;
}

const formulas = (n: number) => `${n} formula${n === 1 ? '' : 's'}`;

const PREFER_LABEL: Readonly<Record<'auto' | RenderBackend, string>> = {
  auto: 'Auto (LaTeX when the companion is online)',
  latex: 'LaTeX only',
  mathjax: 'MathJax only',
  pango: 'Pango (font text)',
};

/** The first lines of the status tooltip: the counts and the glyph source preference. */
export function rendererTooltip(summary: RendererSummary, prefer: 'auto' | RenderBackend): string {
  const parts: string[] = [];
  const latex = summary.exact - (summary.pango ?? 0);
  if (latex > 0) parts.push(`${formulas(latex)} exact (LaTeX)`);
  if (summary.pango) parts.push(`${formulas(summary.pango)} exact (Pango)`);
  if (summary.mathjax > 0) parts.push(`${formulas(summary.mathjax)} with MathJax`);
  if (summary.boxes) {
    parts.push(
      `${summary.boxes} font text${summary.boxes === 1 ? '' : 's'} as placeholder boxes (needs the companion)`,
    );
  }
  if (summary.loading > 0) parts.push(`${formulas(summary.loading)} rendering`);
  if (summary.failed > 0) parts.push(`${formulas(summary.failed)} failed`);
  const counts =
    parts.length > 0 ? parts.join(', ') : `No formula rendered yet: new ones use ${summary.label}.`;
  return `${counts}\nGlyph source: ${PREFER_LABEL[prefer]} (View menu)`;
}

/** One line about the companion for Help → About: its version when it is online. */
export function companionSummary(state: CompanionState): string {
  switch (state.status) {
    case 'online':
      return `${state.health.version}, online`;
    case 'checking':
      return 'Looking for it…';
    case 'offline':
      return 'Not running (optional: exact LaTeX, ffmpeg, Manim)';
    case 'unsupported':
      return 'Not available here';
  }
}
