/* The source panel of a shape (`shape`): it has no source to write — it is Manim's box, circle,
 * underline or cross, or a cross line, fitted to the glyphs its clip hangs on — only which shape
 * it is, its style (the stroke's width and opacity, a box's or circle's fill and, when it is not
 * the stroke's, that fill's colour), a box's corner radius, a cross line's diagonal and, once
 * detached, its size. The target and the gap belong to its clip (the Animations panel). */
import {
  DEFAULT_COLOR,
  DEFAULT_SHAPE_DIAGONAL,
  diagonalOf,
  hasInside,
  type GlyphStyle,
  type ShapeDiagonal,
  type ShapeFormula,
  type ShapeKind,
} from '../../../model';
import { HexColorField } from '../../project/HexColorField';
import { SegmentedControl } from '../../SegmentedControl';
import { CommitInput } from '../CommitInput';
import type { SourcePanel, SourcePanelProps } from './types';

/** The shapes in the order the menus offer them, and what they are called. */
export const SHAPE_KINDS: readonly ShapeKind[] = [
  'box',
  'circle',
  'underline',
  'cross',
  'cross_line',
];
export const SHAPE_LABELS: Readonly<Record<ShapeKind, string>> = {
  box: 'Box',
  circle: 'Circle',
  underline: 'Underline',
  cross: 'Cross',
  cross_line: 'Cross line',
};

/** The two diagonals of a cross line, the default first, named by their corners: where the line
 * starts and where it ends (lower left to upper right, upper left to lower right). */
export const SHAPE_DIAGONALS: readonly ShapeDiagonal[] = ['dl_ur', 'ul_dr'];
export const DIAGONAL_LABELS: Readonly<Record<ShapeDiagonal, string>> = {
  dl_ur: 'DL-UR',
  ul_dr: 'UL-DR',
};

/** What an object keeps of a cross line's diagonal: nothing for the default one, and nothing for
 * a shape that is not a cross line. */
export const storedDiagonal = (
  shape: ShapeKind,
  diagonal: ShapeDiagonal,
): ShapeDiagonal | undefined =>
  shape === 'cross_line' && diagonal !== DEFAULT_SHAPE_DIAGONAL ? diagonal : undefined;

const nonNegative = (text: string, what: string) =>
  Number.isFinite(Number(text)) && Number(text) >= 0 ? null : `A number of ${what}, 0 or more.`;
const opacity = (text: string) =>
  Number.isFinite(Number(text)) && Number(text) >= 0 && Number(text) <= 1
    ? null
    : 'An opacity between 0 and 1.';

export function ShapeSourcePanel({ draft, color, onChange }: SourcePanelProps<ShapeFormula>) {
  const setStyle = (patch: Partial<GlyphStyle>) =>
    onChange({ style: { ...draft.style, ...patch } });
  const filled = hasInside(draft.shape);
  return (
    <>
      <h3>Shape</h3>
      <p className="field-hint" data-testid="shape-source-hint">
        A shape has no source: it is fitted to the glyphs its clip hangs on. The target and the gap
        are set on the clip, in the Animations panel.
      </p>
      <SegmentedControl<ShapeKind>
        label="Shape"
        testId="shape-kind"
        value={draft.shape}
        options={SHAPE_KINDS.map((s) => ({ value: s, label: SHAPE_LABELS[s] }))}
        // A diagonal is a cross line's: another shape keeps none.
        onChange={(shape) =>
          onChange({ shape, diagonal: storedDiagonal(shape, diagonalOf(draft)) })
        }
      />
      {draft.shape === 'cross_line' && (
        <SegmentedControl<ShapeDiagonal>
          label="Diagonal"
          testId="shape-diagonal"
          value={diagonalOf(draft)}
          options={SHAPE_DIAGONALS.map((d) => ({ value: d, label: DIAGONAL_LABELS[d] }))}
          onChange={(diagonal) => onChange({ diagonal: storedDiagonal(draft.shape, diagonal) })}
        />
      )}
      <div className="editor-fields">
        <span className="form-label">Stroke</span>
        <span className="inline-fields">
          <CommitInput
            value={String(draft.style.strokeWidth)}
            label="Stroke width"
            testId="shape-stroke-width"
            width="56px"
            validate={(text) => nonNegative(text, 'Manim stroke width units')}
            onCommit={(text) => setStyle({ strokeWidth: Number(text) })}
          />
          <span className="field-hint">width (Manim&apos;s units; 4 is its default)</span>
          <CommitInput
            value={String(draft.style.strokeOpacity)}
            label="Stroke opacity"
            testId="shape-stroke-opacity"
            width="56px"
            validate={opacity}
            onCommit={(text) => setStyle({ strokeOpacity: Number(text) })}
          />
          <span className="field-hint">opacity</span>
        </span>
        {filled && (
          <>
            <span className="form-label">Fill</span>
            <span className="inline-fields">
              <CommitInput
                value={String(draft.style.fillOpacity)}
                label="Fill opacity"
                testId="shape-fill-opacity"
                width="56px"
                validate={opacity}
                onCommit={(text) => setStyle({ fillOpacity: Number(text) })}
              />
              <span className="field-hint">
                opacity (0: no fill; a highlight is a box filled with no stroke)
              </span>
            </span>
            <span className="form-label">Fill colour</span>
            <span className="inline-fields">
              <label className="check-field">
                <input
                  type="checkbox"
                  data-testid="shape-fill-color-on"
                  checked={draft.fillColor !== undefined}
                  onChange={(e) =>
                    onChange({ fillColor: e.target.checked ? (color ?? DEFAULT_COLOR) : undefined })
                  }
                />
                <span>its own</span>
              </label>
              {draft.fillColor !== undefined ? (
                <HexColorField
                  value={draft.fillColor}
                  label="Fill colour"
                  testId="shape-fill-color"
                  onCommit={(fillColor) => onChange({ fillColor })}
                />
              ) : (
                <span className="field-hint">the stroke’s colour (the Colour above)</span>
              )}
            </span>
          </>
        )}
        {draft.shape === 'box' && (
          <>
            <span className="form-label">Corners</span>
            <span className="inline-fields">
              <CommitInput
                value={String(draft.cornerRadius)}
                label="Corner radius"
                testId="shape-corner"
                width="56px"
                validate={(text) => nonNegative(text, 'scene units')}
                onCommit={(text) => onChange({ cornerRadius: Number(text) })}
              />
              <span className="field-hint">radius, scene units (0: square)</span>
            </span>
          </>
        )}
        <span className="form-label">Size</span>
        <span className="inline-fields">
          <CommitInput
            value={String(+draft.width.toFixed(4))}
            label="Shape width"
            testId="shape-width"
            width="64px"
            validate={(text) => nonNegative(text, 'scene units')}
            onCommit={(text) => onChange({ width: Number(text) })}
          />
          <span className="field-hint">×</span>
          <CommitInput
            value={String(+draft.height.toFixed(4))}
            label="Shape height"
            testId="shape-height"
            width="64px"
            validate={(text) => nonNegative(text, 'scene units')}
            onCommit={(text) => onChange({ height: Number(text) })}
          />
          <span className="field-hint">
            scene units; set by the target while the shape is attached
          </span>
        </span>
      </div>
    </>
  );
}

export const shapeSource: SourcePanel<ShapeFormula> = {
  draftOf: (formula) => ({
    source: formula.source,
    shape: formula.shape,
    style: { ...formula.style },
    fillColor: formula.fillColor,
    diagonal: formula.diagonal,
    cornerRadius: formula.cornerRadius,
    width: formula.width,
    height: formula.height,
  }),
  Panel: ShapeSourcePanel,
};
