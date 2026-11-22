/* Explicit palette application changes base object colours and, optionally, the global
 * background. The plan is pure; authored overrides and all other project fields stay intact. */
import { sameColor } from '../../geom/color';
import { KINDS, type FormulaId, type Project } from '../../model';
import { paletteRoleForKind, type PaletteColors, type PaletteRole } from './palette';

export interface PaletteFormulaChange {
  id: FormulaId;
  name: string;
  role: PaletteRole;
  from: string;
  to: string;
}

export type PaletteSkipReason = 'locked-track' | 'glyph-colors';

export interface ApplyPalettePlan {
  changes: PaletteFormulaChange[];
  skipped: { id: FormulaId; name: string; reasons: PaletteSkipReason[] }[];
  /** Eligible objects whose base colour already matches the palette. */
  unchanged: number;
  background: { selected: boolean; from: string; to: string; changed: boolean };
  hasChanges: boolean;
}

/** Every object is considered once, including objects without clips. A single use on a locked
 * track protects the whole object; hidden tracks do not grant that protection. An object of a
 * kind whose glyphs are coloured one by one (`KINDS[kind].glyphColors`: a formula, a LaTeX text,
 * a Pango text) is skipped when it has such colours: its base colour is part of that design. The
 * part colours of a brace or a shape do not protect it. */
export function planApplyPalette(
  project: Project,
  colors: PaletteColors,
  { includeBackground = true }: { includeBackground?: boolean } = {},
): ApplyPalettePlan {
  const lockedTracks = new Set(project.tracks.filter((track) => track.locked).map((t) => t.id));
  const lockedObjects = new Set(
    project.clips.filter((clip) => lockedTracks.has(clip.trackId)).map((clip) => clip.formulaId),
  );
  const seen = new Set<FormulaId>();
  const changes: PaletteFormulaChange[] = [];
  const skipped: ApplyPalettePlan['skipped'] = [];
  let unchanged = 0;
  for (const formula of project.formulas) {
    if (seen.has(formula.id)) continue;
    seen.add(formula.id);
    const reasons: PaletteSkipReason[] = [];
    if (lockedObjects.has(formula.id)) reasons.push('locked-track');
    if (KINDS[formula.kind].glyphColors && Object.keys(formula.glyphColors).length > 0) {
      reasons.push('glyph-colors');
    }
    if (reasons.length > 0) {
      skipped.push({ id: formula.id, name: formula.name, reasons });
      continue;
    }
    const role = paletteRoleForKind(
      formula.kind,
      formula.kind === 'shape' ? formula.shape : undefined,
    );
    const color = colors[role];
    if (sameColor(formula.color, color)) unchanged++;
    else changes.push({ id: formula.id, name: formula.name, role, from: formula.color, to: color });
  }
  const background = {
    selected: includeBackground,
    from: project.meta.background,
    to: colors.background,
    changed: includeBackground && !sameColor(project.meta.background, colors.background),
  };
  return {
    changes,
    skipped,
    unchanged,
    background,
    hasChanges: changes.length > 0 || background.changed,
  };
}

/** Write a plan to the same project it was computed against. The action owns that check and
 * runs this inside its single project transaction, after gesture cancellation. */
export function applyPalettePlan(project: Project, plan: ApplyPalettePlan): void {
  const colors = new Map(plan.changes.map((change) => [change.id, change.to]));
  for (const formula of project.formulas) {
    const color = colors.get(formula.id);
    if (color !== undefined && !sameColor(formula.color, color)) formula.color = color;
  }
  if (plan.background.changed) project.meta.background = plan.background.to;
}

export const PALETTE_SKIP_REASONS: Readonly<Record<PaletteSkipReason, string>> = {
  'locked-track': 'used on a locked track',
  'glyph-colors': 'has glyph colours of its own',
};
