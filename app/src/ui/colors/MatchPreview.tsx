/* The Match colors dialog's preview: one formula of the project drawn with the colours the shown
 * list would give it, without applying anything (`computeMatchColors`, a labelled render), so
 * that what a pattern matches can be seen before it is applied. Recomputed a moment after the
 * list or the formula changes; says when a pattern cannot be rendered on the formula and when
 * patterns overlap in it (the lower entry wins there). */
import { getEngine, type FormulaEngine } from '../../engine';
import type { ColorMatch, Formula, FormulaId } from '../../model';
import { useProjectStore, useRenderStore } from '../../store';
import { FormulaThumb } from '../creator/FormulaThumb';
import { glyphsUnavailable } from '../creator/glyphsUnavailable';
import { overlapNote, useMatchPreview } from './useMatchPreview';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface MatchPreviewProps {
  match: ColorMatch;
  /** The formula shown; null when the project has none. */
  formulaId: FormulaId | null;
  onPick(id: FormulaId): void;
  engine?: Pick<FormulaEngine, 'render'>;
}

export function MatchPreview({
  match,
  formulaId,
  onPick,
  engine = getEngine(),
}: MatchPreviewProps) {
  const formulas = useProjectStore((s) => s.project.formulas);
  const background = useProjectStore((s) => s.project.meta.background);
  const formula = formulas.find((f) => f.id === formulaId) ?? null;
  const entry = useRenderStore((s) => (formulaId ? s.entries[formulaId] : undefined));
  const resolved = entry?.resolved ?? null;
  const state = useMatchPreview(match, formula, resolved, engine);
  const done = state.status === 'done' ? state.result : null;
  const shown: Formula | null =
    formula && done?.ok ? { ...formula, glyphColors: done.colors } : formula;
  return (
    <section className="cm-preview" data-testid="match-colors-preview">
      <div className="cm-preview-head">
        <h3 className="cm-heading">Preview</h3>
        <select
          aria-label="Formula to preview"
          value={formulaId ?? ''}
          disabled={formulas.length === 0}
          data-testid="match-colors-preview-formula"
          onChange={(event) => onPick(event.target.value)}
        >
          {formulas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      {shown && (
        <div className="cm-preview-thumb" data-status={state.status}>
          <FormulaThumb formula={shown} resolved={resolved} background={background} />
        </div>
      )}
      <p className="field-hint" data-testid="match-colors-preview-note">
        {!formula
          ? 'No formula to preview.'
          : !resolved
            ? glyphsUnavailable(formula, entry)
            : state.status !== 'done'
              ? 'Rendering…'
              : done && !done.ok
                ? `${formula.name}: ${done.reason}.`
                : done && done.glyphs === 0
                  ? `No pattern occurs in ${formula.name}.`
                  : done
                    ? `${plural(done.glyphs, 'glyph')} of ${formula.name} ${done.glyphs === 1 ? 'takes' : 'take'} a colour.`
                    : ''}
      </p>
      {done && done.overlapping.length > 0 && (
        <p className="field-hint cm-preview-overlap" data-testid="match-colors-preview-overlap">
          {overlapNote(
            match.entries.map((e) => e.pattern),
            done.overlapping,
          )}
        </p>
      )}
    </section>
  );
}
