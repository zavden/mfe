/* The colours a match colour list would give one formula, for the dialog's preview
 * (`MatchPreview.tsx`): recomputed a moment after the list or the formula changes, through
 * `computeMatchColors` (a labelled render); and what the preview says of patterns that overlap. */
import { useEffect, useState } from 'react';
import type { FormulaEngine, ResolvedFormula } from '../../engine';
import type { ColorMatch, Formula } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { computeMatchColors, type MatchColors } from './applyColorMatch';

/** What the preview says of the patterns (`indices` into `patterns`) whose occurrence partly
 * overlaps one of a lower entry, which wins there: one pattern in the singular. */
export function overlapNote(patterns: readonly string[], indices: readonly number[]): string {
  const named = indices.map((i) => `${i + 1} (“${patterns[i]}”)`).join(', ');
  return indices.length === 1
    ? `Pattern ${named} overlaps a lower one here: the lower entry wins.`
    : `Patterns ${named} overlap a lower one here: the lower entry wins.`;
}

/** How long the preview waits after a change before it renders. */
export const PREVIEW_DELAY_MS = 250;

export type PreviewState = { status: 'idle' | 'working' } | { status: 'done'; result: MatchColors };

/** The colours `match` gives `formula` (rendered as `resolved`), a moment after they change:
 * 'working' until the result for the current inputs is in. */
export function useMatchPreview(
  match: Pick<ColorMatch, 'entries'>,
  formula: Formula | null,
  resolved: ResolvedFormula | null,
  engine: Pick<FormulaEngine, 'render'>,
): PreviewState {
  const meta = useProjectStore((s) => s.project.meta);
  const prefer = useRenderStore((s) => s.prefer);
  // What the result depends on, by value: the list object changes on every project update.
  const entries = JSON.stringify(match.entries);
  const key = JSON.stringify([entries, formula?.id, formula?.source, resolved?.render.key, prefer]);
  const [done, setDone] = useState<{ key: string; result: MatchColors } | null>(null);
  useEffect(() => {
    if (!formula || !resolved) return;
    const list = { entries: JSON.parse(entries) as ColorMatch['entries'] };
    const timer = setTimeout(() => {
      void computeMatchColors(formula, resolved, list, meta, prefer, engine).then((result) =>
        setDone({ key, result }),
      );
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, entries, formula, resolved, meta, prefer, engine]);
  if (!formula || !resolved) return { status: 'idle' };
  return done && done.key === key ? { status: 'done', result: done.result } : { status: 'working' };
}
