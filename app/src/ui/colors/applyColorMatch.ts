/* Apply a match colour list (Edit → Match colors, D55) to formulas: every glyph of every
 * occurrence of each pattern takes the pattern's colour, and the formula's per-glyph colours
 * become exactly those — one undo step for all the formulas, and a notice that says what
 * happened. Which glyphs an occurrence covers comes from a labelled render of the formula
 * (`engine/labelled.ts`), so a formula without a render yet is left alone and said so, as is one
 * whose glyphs changed while the renders ran, or on which the patterns cannot be rendered (a
 * pattern that cuts a macro's arguments).
 *
 * The patterns are LaTeX, found in a LaTeX source: an object of another kind selected with the
 * formulas takes nothing and keeps what it has (`takesMatchColors`). */
import {
  getEngine,
  labelGlyphs,
  renderRequestFor,
  type FormulaEngine,
  type ResolvedFormula,
} from '../../engine';
import {
  kindOf,
  matchPatterns,
  type ColorMatch,
  type ColorMatchId,
  type Formula,
  type FormulaId,
  type Project,
  type ProjectMeta,
  type RenderBackend,
} from '../../model';
import { onProjectLoaded, useProjectStore, useRenderStore } from '../../store';
import { useDocumentStore } from '../project/documentStore';
import { notify } from '../project/noticeStore';

/** The colours a list gives one formula's glyphs (canonical index → colour), or why it cannot
 * (the patterns cannot be rendered on it). `invalid` and `overlapping` as in `matchPatterns`. */
export type MatchColors =
  | {
      ok: true;
      colors: Record<string, string>;
      /** How many glyphs took a colour. */
      glyphs: number;
      invalid: number[];
      overlapping: number[];
    }
  | { ok: false; reason: string; invalid: number[]; overlapping: number[] };

/** Compute the colours `match` gives `formula`, rendered as `resolved`, through a labelled
 * render by `engine`. Reads nothing from the stores: the dialog's preview uses it too. */
export async function computeMatchColors(
  formula: Formula,
  resolved: ResolvedFormula,
  match: Pick<ColorMatch, 'entries'>,
  meta: Pick<ProjectMeta, 'preamble' | 'target'>,
  prefer: 'auto' | RenderBackend,
  engine: Pick<FormulaEngine, 'render'>,
): Promise<MatchColors> {
  const found = matchPatterns(
    formula.source,
    match.entries.map((e) => e.pattern),
  );
  const { invalid, overlapping } = found;
  const request = renderRequestFor(formula, meta, prefer);
  const out = await labelGlyphs(engine, request, resolved.render, found.labelled);
  if (!out.ok) {
    return {
      ok: false,
      reason: `the patterns cannot be rendered on it (${out.error.message})`,
      invalid,
      overlapping,
    };
  }
  const colors: Record<string, string> = {};
  (formula.snapshot?.glyphs ?? []).forEach((_, canonical) => {
    const r = resolved.canonToRender[canonical];
    const label = r === null || r === undefined ? null : out.labels[r];
    if (label !== null && label !== undefined) {
      colors[String(canonical)] = match.entries[label]!.color;
    }
  });
  return { ok: true, colors, glyphs: Object.keys(colors).length, invalid, overlapping };
}

/** Whether a list can colour `formula`: its glyphs take colours one by one, and its source is
 * LaTeX, where the patterns are found (a formula, a LaTeX text). */
export function takesMatchColors(formula: Formula): boolean {
  const kind = kindOf(formula);
  return kind.glyphColors && kind.latex;
}

/** Why a list cannot be applied to all of `formulas` — the first of them it cannot colour, by
 * name —, or null when it can colour every one: Apply match colors is offered on a selection
 * whose objects all take match colours (the menu of the selected formulas, «Edit together»). */
export function matchColorsBlocker(formulas: readonly Formula[]): string | null {
  const first = formulas.find((formula) => !takesMatchColors(formula));
  if (!first) return null;
  const kind = kindOf(first);
  return kind.glyphColors
    ? `${first.name} is a ${kind.label}: it has no LaTeX to find the patterns in`
    : `${first.name} is a ${kind.label}: its glyphs take no colours of their own`;
}

export interface MatchReport {
  match: ColorMatch;
  /** Formulas recoloured, with how many glyphs took a colour (0: no occurrence in it). */
  applied: { name: string; glyphs: number }[];
  /** Formulas left alone, and why. */
  skipped: { name: string; reason: string }[];
  /** Patterns of the list that cannot be matched (`patternIssue`), by index. */
  invalid: number[];
}

interface Computed {
  id: FormulaId;
  name: string;
  /** The snapshot the colours were computed for. */
  key: string;
  colors: Record<string, string>;
  glyphs: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Commands own only their selected formulas. A later command supersedes an earlier command
 * on the same formula, while unrelated selections remain independent. */
let nextCommand = 0;
const pendingCommands = new Map<FormulaId, number>();

function captureCommand(project: Project, match: ColorMatch, ids: readonly FormulaId[]) {
  const command = ++nextCommand;
  const session = useDocumentStore.getState().session;
  const inputs = new Map(project.formulas.filter((f) => ids.includes(f.id)).map((f) => [f.id, f]));
  for (const id of inputs.keys()) pendingCommands.set(id, command);
  let replaced = false;
  let contextChanged = false;
  const changed = new Set<FormulaId>();
  const offLoad = onProjectLoaded(() => {
    replaced = true;
  });
  // Invalidation is sticky: editing and then undoing must not revive a pending command.
  const offChange = useProjectStore.subscribe(({ project: current }, previous) => {
    if (current === previous.project) return;
    if (
      current.colorMatches.find((m) => m.id === match.id) !== match ||
      current.meta.preamble !== project.meta.preamble ||
      current.meta.target !== project.meta.target
    )
      contextChanged = true;
    const currentFormulas = new Map(current.formulas.map((f) => [f.id, f]));
    for (const [id, formula] of inputs) {
      if (currentFormulas.get(id) !== formula) changed.add(id);
    }
  });
  return {
    reason(id: FormulaId): string | null {
      if (replaced || useDocumentStore.getState().session !== session) {
        return 'the document was replaced while the colours were computed';
      }
      if (contextChanged) return 'the match list or rendering settings changed';
      if (pendingCommands.get(id) !== command) return 'a newer colour command superseded this one';
      if (changed.has(id)) return 'the formula was edited while the colours were computed';
      return null;
    },
    dispose() {
      offLoad();
      offChange();
      for (const id of inputs.keys()) {
        if (pendingCommands.get(id) === command) pendingCommands.delete(id);
      }
    },
  };
}

/** Apply the list `matchId` to the formulas `ids`. Resolves once the project is updated and the
 * notice shown; null when the list no longer exists. */
export async function applyColorMatch(
  ids: readonly FormulaId[],
  matchId: ColorMatchId,
  engine: Pick<FormulaEngine, 'render'> = getEngine(),
): Promise<MatchReport | null> {
  const { project } = useProjectStore.getState();
  const match = project.colorMatches.find((m) => m.id === matchId);
  if (!match) {
    notify({ kind: 'warning', title: 'This match colour list no longer exists.' });
    return null;
  }
  const { prefer, entries } = useRenderStore.getState();
  const report: MatchReport = { match, applied: [], skipped: [], invalid: [] };
  const invalid = new Set<number>();
  // What the list can colour, of what was selected. A font text has colours glyph by glyph and no
  // LaTeX: it keeps them — a list that found nothing in it would leave it with none — and the
  // notice says so. A brace or a shape has neither: the list was not asked about it.
  const targets = ids.filter((id) => {
    const formula = project.formulas.find((f) => f.id === id);
    if (!formula || takesMatchColors(formula)) return true;
    const kind = kindOf(formula);
    if (kind.glyphColors) {
      report.skipped.push({
        name: formula.name,
        reason: `a ${kind.label} has no LaTeX to find the patterns in`,
      });
    }
    return false;
  });
  const command = captureCommand(project, match, targets);
  try {
    const computed = await Promise.all(
      targets.map(async (id): Promise<Computed | null> => {
        const formula = project.formulas.find((f) => f.id === id);
        if (!formula) return null;
        const resolved = entries[id]?.resolved;
        if (!resolved || !formula.snapshot) {
          report.skipped.push({ name: formula.name, reason: 'not rendered yet' });
          return null;
        }
        const result = await computeMatchColors(
          formula,
          resolved,
          match,
          project.meta,
          prefer,
          engine,
        );
        for (const i of result.invalid) invalid.add(i);
        if (!result.ok) {
          report.skipped.push({ name: formula.name, reason: result.reason });
          return null;
        }
        return {
          id,
          name: formula.name,
          key: formula.snapshot.key,
          colors: result.colors,
          glyphs: result.glyphs,
        };
      }),
    );
    report.invalid = [...invalid].sort((a, b) => a - b);

    // The formulas as they are now: one whose glyphs were renumbered meanwhile is left alone.
    const current = useProjectStore.getState().project;
    const ready: Computed[] = [];
    for (const c of computed) {
      if (!c) continue;
      const formula = current.formulas.find((f) => f.id === c.id);
      const staleReason = command.reason(c.id);
      if (formula && formula.snapshot?.key !== c.key) {
        report.skipped.push({
          name: c.name,
          reason: 'its glyphs changed while the colours were computed',
        });
        continue;
      }
      if (!formula || staleReason) {
        report.skipped.push({
          name: c.name,
          reason: staleReason ?? 'the formula no longer exists',
        });
        continue;
      }
      ready.push(c);
    }
    if (ready.length > 0) {
      useProjectStore.getState().update((draft) => {
        for (const c of ready) {
          const formula = draft.formulas.find((f) => f.id === c.id);
          if (formula) formula.glyphColors = c.colors;
        }
      });
      report.applied = ready.map((c) => ({ name: c.name, glyphs: c.glyphs }));
    }
    notifyReport(report);
    return report;
  } finally {
    command.dispose();
  }
}

function notifyReport(report: MatchReport): void {
  const { match, applied, skipped, invalid } = report;
  const glyphs = applied.reduce((n, a) => n + a.glyphs, 0);
  const unmatched = applied.filter((a) => a.glyphs === 0).map((a) => a.name);
  const details = [
    ...skipped.map((s) => `${s.name}: ${s.reason}.`),
    ...invalid.map(
      (i) =>
        `Pattern ${i + 1} (“${match.entries[i]!.pattern}”) is not valid for a match and was ignored.`,
    ),
  ];
  if (applied.length === 0) {
    notify({
      kind: 'warning',
      title: `“${match.name}” coloured nothing`,
      message: 'No formula could take the colours.',
      details,
    });
    return;
  }
  const parts = [`${plural(glyphs, 'glyph')} coloured.`];
  if (unmatched.length > 0) parts.push(`No match in ${unmatched.join(', ')}.`);
  notify({
    kind: 'info',
    title: `“${match.name}” applied to ${plural(applied.length, 'formula')}`,
    message: parts.join(' '),
    details,
  });
}
