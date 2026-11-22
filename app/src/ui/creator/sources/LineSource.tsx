/* The source panel of a line (`line`): it has no source to write — a line, a dashed line, an
 * arrow or a double arrow between two ends —, only which of them it is and what Manim draws it
 * with: the width of its stroke, the length of an arrow's tip, the length of a dashed line's
 * dashes. Its ends, and the gap it leaves at what it runs between, belong to its clip (the
 * preview and the Animations panel). */
import { hasTips, MIN_DASH_LENGTH, type LineFormula, type LineKind } from '../../../model';
import { CommitInput } from '../CommitInput';
import type { SourcePanel, SourcePanelProps } from './types';

/** The lines, in the order the menus list them, and what the UI calls each. */
export const LINE_KINDS: readonly LineKind[] = ['line', 'dashed', 'arrow', 'double_arrow'];
export const LINE_LABELS: Readonly<Record<LineKind, string>> = {
  line: 'Line',
  dashed: 'Dashed line',
  arrow: 'Arrow',
  double_arrow: 'Double arrow',
};

const positive = (text: string) =>
  Number.isFinite(Number(text)) && Number(text) > 0 ? null : 'A positive number.';
/** A dash is no shorter here than in the Animations panel («Dash»): a line is a mobject per dash. */
const dashLong = (text: string) =>
  Number.isFinite(Number(text)) && Number(text) >= MIN_DASH_LENGTH
    ? null
    : `A number, ${MIN_DASH_LENGTH} or more.`;
const notNegative = (text: string) =>
  text.trim() !== '' && Number.isFinite(Number(text)) && Number(text) >= 0
    ? null
    : 'A number, 0 or more.';

export function LineSourcePanel({ draft, onChange }: SourcePanelProps<LineFormula>) {
  return (
    <>
      <h3>Line</h3>
      <p className="field-hint" data-testid="line-source-hint">
        A line has no source: it runs between its two ends, which are moved in the preview. The gap
        it leaves at the glyphs an end is on is set on its clip, in the Animations panel.
      </p>
      <div className="editor-fields">
        <label className="form-label" htmlFor="line-kind">
          Kind
        </label>
        <select
          id="line-kind"
          data-testid="line-kind"
          value={draft.line}
          onChange={(event) => onChange({ line: event.target.value as LineKind })}
        >
          {LINE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {LINE_LABELS[kind]}
            </option>
          ))}
        </select>
        <span className="form-label">Stroke width</span>
        <span className="inline-fields">
          <CommitInput
            value={String(draft.strokeWidth)}
            label="Line stroke width"
            testId="line-stroke-width"
            width="56px"
            validate={notNegative}
            onCommit={(text) => onChange({ strokeWidth: Number(text) })}
          />
          <span className="field-hint">
            Manim&apos;s units (4 is a line&apos;s, 6 an arrow&apos;s); a short arrow is drawn
            thinner, as Manim draws it
          </span>
        </span>
        {hasTips(draft.line) && (
          <>
            <span className="form-label">Tip length</span>
            <span className="inline-fields">
              <CommitInput
                value={String(draft.tipLength)}
                label="Arrow tip length"
                testId="line-tip-length"
                width="56px"
                validate={positive}
                onCommit={(text) => onChange({ tipLength: Number(text) })}
              />
              <span className="field-hint">
                scene units (0.35 is Manim&apos;s); at most a quarter of the arrow
              </span>
            </span>
          </>
        )}
        {draft.line === 'dashed' && (
          <>
            <span className="form-label">Dash length</span>
            <span className="inline-fields">
              <CommitInput
                value={String(draft.dashLength)}
                label="Dash length"
                testId="line-dash-length"
                width="56px"
                validate={dashLong}
                onCommit={(text) => onChange({ dashLength: Number(text) })}
              />
              <span className="field-hint">scene units (0.05 is Manim&apos;s)</span>
            </span>
          </>
        )}
      </div>
    </>
  );
}

export const lineSource: SourcePanel<LineFormula> = {
  draftOf: (formula) => ({
    source: formula.source,
    line: formula.line,
    vector: [formula.vector[0], formula.vector[1]],
    strokeWidth: formula.strokeWidth,
    tipLength: formula.tipLength,
    dashLength: formula.dashLength,
    curve: formula.curve,
    tip: formula.tip,
    startTip: formula.startTip,
  }),
  Panel: LineSourcePanel,
};
