/* Tie a formula's canonical glyph indices to a concrete render; and, for the tools that work on
 * a project value, render the local kinds afresh. */
import type { Formula, Project } from '../model';
import { expectedRenderKey } from './engine';
import { glyphLikes, toSnapshot } from './key';
import { matchGlyphs } from './match';
import { producerOf, renderRequestFor } from './producers';
import type { FormulaRender, ResolvedFormula, ResolvedFormulas } from './types';

export function resolveFormula(formula: Formula, render: FormulaRender): ResolvedFormula {
  const snapshot = formula.snapshot;
  if (!snapshot || snapshot.key === render.key) {
    return { formula, render, canonToRender: render.glyphs.map((g) => g.index), confidence: 1 };
  }
  if (formula.kind === 'text') {
    return { formula, render, canonToRender: snapshot.glyphs.map(() => null), confidence: 0 };
  }
  const match = matchGlyphs(snapshot.glyphs, glyphLikes(render), 'position');
  return { formula, render, canonToRender: match.map, confidence: match.confidence };
}

/** Keep a retained render tied to an authoritative canonical transition published before its
 * snapshot amendment. This preserves occurrence identity even when positions are ambiguous.
 * Undo can use the same step in reverse. An unknown step falls back to geometric resolution. */
export function resolveFormulaTransition(
  formula: Formula,
  previous: ResolvedFormula,
  transition?: { from: string; to: string; map: readonly (number | null)[] },
): ResolvedFormula {
  const snapshot = formula.snapshot;
  const old = previous.formula.snapshot;
  if (snapshot?.key === old?.key) return { ...previous, formula };
  if (!snapshot || !old || snapshot.key === previous.render.key || !transition) {
    return resolveFormula(formula, previous.render);
  }
  const forward = transition.from === old.key && transition.to === snapshot.key;
  const reverse = transition.from === snapshot.key && transition.to === old.key;
  if (!forward && !reverse) return resolveFormula(formula, previous.render);
  const fromCount = forward ? old.glyphs.length : snapshot.glyphs.length;
  const toCount = forward ? snapshot.glyphs.length : old.glyphs.length;
  const targets = transition.map.filter((index): index is number => index !== null);
  if (
    transition.map.length !== fromCount ||
    new Set(targets).size !== targets.length ||
    targets.some((index) => !Number.isInteger(index) || index < 0 || index >= toCount)
  ) {
    return resolveFormula(formula, previous.render);
  }
  const map: (number | null)[] = snapshot.glyphs.map(() => null);
  if (forward) {
    transition.map.forEach((next, index) => {
      if (next !== null) map[next] = previous.canonToRender[index] ?? null;
    });
  } else {
    transition.map.forEach((next, index) => {
      if (next !== null) map[index] = previous.canonToRender[next] ?? null;
    });
  }
  const coverage = map.length ? map.filter((index) => index !== null).length / map.length : 1;
  return {
    formula,
    render: previous.render,
    canonToRender: map,
    confidence: Math.min(previous.confidence, coverage),
  };
}

/** `project` and `formulas` with every object of a local kind (a brace) rendered afresh where
 * its render is not the one it asks for now — its width, derived by a settle — and its snapshot
 * taken from that render: what the render sync does in the app, for the tools that settle a
 * project value (`scene/attach.ts`, `settleScene`: the pins, the export check). Pure: the same
 * values when nothing was stale. */
export function refreshLocalRenders(
  project: Project,
  formulas: ResolvedFormulas,
): { project: Project; formulas: ResolvedFormulas } {
  let outFormulas: Map<string, ResolvedFormula> | null = null;
  let outProject: Project | null = null;
  project.formulas.forEach((formula, index) => {
    if (!producerOf(formula.kind).local) return;
    const key = expectedRenderKey(formula, project.meta, 'latex');
    const current = formulas.get(formula.id);
    if (current?.render.key === key && formula.snapshot?.key === key) return;
    const result = producerOf(formula.kind).free(
      renderRequestFor(formula, project.meta, 'latex'),
      key,
    );
    if (!result.ok) return;
    const fresh: Formula = { ...formula, snapshot: toSnapshot(result.render) };
    outProject ??= { ...project, formulas: [...project.formulas] };
    outProject.formulas[index] = fresh;
    outFormulas ??= new Map(formulas);
    outFormulas.set(formula.id, resolveFormula(fresh, result.render));
  });
  return { project: outProject ?? project, formulas: outFormulas ?? formulas };
}
