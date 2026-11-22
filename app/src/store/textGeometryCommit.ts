/* One authored text transaction can also publish a verified replacement appearance. The UI
 * owns the durable lease and transaction; these pure helpers own canonical correspondence. */
import { toSnapshot } from '../engine/key';
import { textArtifactRender } from '../engine/pango';
import { matchTextLayouts, textGeometryLayout, textLayoutOf } from '../engine/textMatch';
import type { FormulaRender, GlyphMatch } from '../engine/types';
import {
  emptyRemapReport,
  remapGlyphRefs,
  sameTextBasis,
  textRequestBasis,
  type FormulaSnapshot,
  type FreedEndPoint,
  type Project,
  type RemapReport,
  type TextFormula,
  type TextGeometryArtifact,
  type TextGeometryRef,
  type TextRequestBasis,
} from '../model';

export interface TextGeometryCommitPlan {
  fromKey: string | null;
  fromCount: number;
  basis: TextRequestBasis;
  basisKey: string;
  snapshot: FormulaSnapshot;
  /** Null only when the formula had no canonical snapshot yet. */
  match: GlyphMatch | null;
  transition: { from: string; to: string; map: (number | null)[] } | null;
}

/** A changed native appearance uses the source clusters of the render the canonical snapshot
 * counts (the old artifact's, or the boxes the text was drawn as before anything shaped it).
 * Missing provenance requires repair, never positional guesses. */
export function planTextGeometryCommit(
  formula: TextFormula,
  previousRender: FormulaRender | null,
  artifact: TextGeometryArtifact,
): TextGeometryCommitPlan {
  const previous = formula.snapshot;
  const snapshot = toSnapshot(textArtifactRender(artifact));
  let match: GlyphMatch | null = null;
  if (previous) {
    if (previous.key === snapshot.key && previous.glyphs.length === snapshot.glyphs.length) {
      match = { map: previous.glyphs.map((_, index) => index), confidence: 1 };
    } else if (
      previousRender &&
      previousRender.key === previous.key &&
      (!previousRender.text || previousRender.text.key === previous.key) &&
      previousRender.glyphs.length === previous.glyphs.length &&
      textLayoutOf(previousRender)
    ) {
      match = matchTextLayouts(textLayoutOf(previousRender)!, textGeometryLayout(artifact));
    } else {
      match = { map: previous.glyphs.map(() => null), confidence: 0 };
    }
  }
  return {
    fromKey: previous?.key ?? null,
    fromCount: previous?.glyphs.length ?? 0,
    basis: { ...artifact.basis, font: { ...artifact.basis.font } },
    basisKey: artifact.basisKey,
    snapshot,
    match,
    transition:
      previous && previous.key !== snapshot.key && match
        ? { from: previous.key, to: snapshot.key, map: [...match.map] }
        : null,
  };
}

/** Mutate only inside the caller's atomic project update, after assigning its authored draft.
 * The caller can publish `plan.transition` as the recipe's last operation, before the project
 * notifies subscribers. A thrown conflict aborts the update and leaves the old appearance.
 * `freed`: where an end a Transform carried a line to is left once its glyphs are gone
 * (`remapGlyphRefs`). */
export function applyTextGeometryCommit(
  project: Project,
  formulaId: string,
  reference: TextGeometryRef,
  plan: TextGeometryCommitPlan,
  freed?: FreedEndPoint,
): RemapReport {
  const formula = project.formulas.find((item) => item.id === formulaId);
  if (formula?.kind !== 'text') throw new Error('The text object no longer exists.');
  if (
    (formula.snapshot?.key ?? null) !== plan.fromKey ||
    (formula.snapshot?.glyphs.length ?? 0) !== plan.fromCount
  )
    throw new Error('The canonical text appearance changed. Reopen the composition editor.');
  if (reference.key !== plan.snapshot.key || reference.basisKey !== plan.basisKey) {
    throw new Error('The prepared text geometry does not match its render identity.');
  }
  if (!sameTextBasis(textRequestBasis(formula, project.meta.target), plan.basis)) {
    throw new Error('The source, typography or target changed while preparing text geometry.');
  }
  const report = plan.match
    ? remapGlyphRefs(project, formulaId, plan.match.map, freed)
    : emptyRemapReport();
  formula.snapshot = plan.snapshot;
  formula.geometry = reference;
  return report;
}
