/* The «Line» section of a line's clip (D137, D140): which line it is, its colour and what Manim
 * draws it with — the width of its stroke, the length of an arrow's tip and the shape of each
 * (D146), of a dashed line's dashes —, its curve (D145: bend it into an arc or a spline, an arc's
 * degrees, the mode that shapes a spline), the gap it leaves at the glyphs its ends are on, and
 * what each end is on — marked
 * with the colour of its handle in the preview —, with where on those glyphs it is and a button
 * to free it where it is. The ends themselves are moved in the preview, by their handles. */
import {
  hasTips,
  isGlyphEnd,
  LINE_ANCHORS,
  LINE_ARC_LIMIT,
  LINE_TIPS,
  MIN_DASH_LENGTH,
  type Clip,
  type LineAnchor,
  type LineFormula,
  type LineKind,
  type LineTip,
} from '../../model';
import { useProjectStore } from '../../store';
import { patchFormula } from '../creator/formulaActions';
import { LINE_KINDS, LINE_LABELS } from '../creator/sources';
import { DIRECTION_ARROWS } from '../preview/glyphAlign';
import {
  bendLine,
  editLineCurve,
  reverseLine,
  setLineArc,
  setLineTips,
} from '../preview/lineCurve';
import {
  anchorLabel,
  AUTO_ANCHOR_HINT,
  directionOf,
  editLine,
  endName,
  freeLineEnd,
  setLineAnchor,
  setLineKind,
} from '../preview/lineDraw';
import { setAttachBuff } from './braceActions';
import { ColorField, NumberField, SelectField } from './fields';
import { Section } from './Section';
import { keysText } from '../platform';

/** An anchor in the field's list: its name, and the arrow the compass shows for it at the end. */
function anchorChoice(anchor: LineAnchor): string {
  const direction = directionOf(anchor);
  return direction
    ? `${anchorLabel(anchor)}\u2003${DIRECTION_ARROWS[direction]}`
    : anchorLabel(anchor);
}

/** The shapes of a tip, as the fields name them. */
const TIP_LABELS: Readonly<Record<LineTip, string>> = {
  triangle: 'Triangle',
  stealth: 'Stealth',
  dot: 'Dot',
};

export function LineSection({ clip, formula }: { clip: Clip; formula: LineFormula }) {
  const project = useProjectStore((s) => s.project);
  const { curve } = formula;
  const attach = clip.attach?.rule === 'ends' ? clip.attach : null;
  const end = (side: 'start' | 'end') => {
    const on = attach ? attach[side] : null;
    const held = on !== null && isGlyphEnd(on);
    return (
      <div className="an-row" key={side}>
        <div className="an-field">
          <span className="an-label">
            <span className="line-end-dot" data-side={side} aria-hidden="true" />
            {side === 'start' ? 'Start' : 'End'}
          </span>
          <span className="an-static" data-testid={`line-${side}-on`}>
            {held
              ? `on ${endName(project, on)}${on.glyphs === 'all' ? '' : ` (${on.glyphs.join(', ')})`}`
              : 'free'}
          </span>
        </div>
        {held && (
          <SelectField<LineAnchor>
            label="Point"
            testId={`line-${side}-anchor`}
            title={`Where on those glyphs this end is: a corner or an edge of their box, its centre, or ${AUTO_ANCHOR_HINT}`}
            value={on.anchor}
            options={LINE_ANCHORS.map((anchor) => ({ value: anchor, label: anchorChoice(anchor) }))}
            onChange={(anchor) => setLineAnchor(clip.id, side, anchor, 'clip')}
          />
        )}
        {held && (
          <button
            type="button"
            className="btn btn-small"
            data-testid={`line-${side}-free`}
            title="Leave this end where it is, free: it no longer follows those glyphs"
            onClick={() => freeLineEnd(clip.id, side, 'clip')}
          >
            Detach
          </button>
        )}
      </div>
    );
  };
  return (
    <Section title="Line" testId="line-section">
      <p className="an-hint" data-testid="line-hint">
        {keysText(
          attach
            ? 'An end on glyphs follows them: it is measured when this clip starts. Drag the handles at its ends, in the preview, to move them: an end is left free where you drop it; hold Alt to put it on a symbol, Alt+Shift on a whole formula.'
            : 'A free line, between two points. Drag the handles at its ends, in the preview, to move them; hold Alt to put an end on a symbol, Alt+Shift on a whole formula.',
        )}
      </p>
      <div className="an-row">
        <SelectField<LineKind>
          label="Kind"
          testId="line-kind-field"
          value={formula.line}
          options={LINE_KINDS.map((line) => ({ value: line, label: LINE_LABELS[line] }))}
          onChange={(line) => setLineKind(formula.id, line)}
        />
        <ColorField
          label="Colour"
          testId="line-color"
          value={formula.color}
          onCommit={(color) => patchFormula(formula.id, { color })}
        />
        <button
          type="button"
          className="btn btn-small"
          data-testid="line-reverse"
          title="Its start and its end change places: an arrow points the other way, and what draws the line starts from its other end"
          onClick={() => reverseLine(formula.id)}
        >
          Reverse points
        </button>
      </div>
      <div className="an-row">
        <NumberField
          label="Stroke"
          testId="line-stroke"
          value={formula.strokeWidth}
          min={0}
          step={1}
          onCommit={(strokeWidth) => editLine(formula.id, { strokeWidth })}
        />
        {hasTips(formula.line) && (
          <NumberField
            label="Tip"
            testId="line-tip"
            value={formula.tipLength}
            min={0.01}
            step={0.05}
            onCommit={(tipLength) => editLine(formula.id, { tipLength })}
          />
        )}
        {formula.line === 'dashed' && (
          <NumberField
            label="Dash"
            testId="line-dash"
            value={formula.dashLength}
            min={MIN_DASH_LENGTH}
            step={0.05}
            onCommit={(dashLength) => editLine(formula.id, { dashLength })}
          />
        )}
        {attach && (
          <NumberField
            label="Gap"
            testId="line-gap"
            value={attach.buff}
            step={0.05}
            onCommit={(buff) => setAttachBuff(clip.id, buff)}
          />
        )}
      </div>
      {hasTips(formula.line) && (
        <div className="an-row">
          <SelectField<LineTip>
            label="Tip shape"
            testId="line-tip-shape"
            title="The tip at the end of the arrow: Manim’s triangle, a notched arrowhead (ManimCE’s StealthTip) or a dot"
            value={formula.tip}
            options={LINE_TIPS.map((tip) => ({ value: tip, label: TIP_LABELS[tip] }))}
            onChange={(tip) => setLineTips(formula.id, { tip })}
          />
          {formula.line === 'double_arrow' && (
            <SelectField<LineTip>
              label="Start tip shape"
              testId="line-start-tip-shape"
              title="The tip at the start of the double arrow"
              value={formula.startTip}
              options={LINE_TIPS.map((tip) => ({ value: tip, label: TIP_LABELS[tip] }))}
              onChange={(startTip) => setLineTips(formula.id, { startTip })}
            />
          )}
        </div>
      )}
      <div className="an-row" data-testid="line-curve-row">
        <div className="an-field">
          <span className="an-label">Curve</span>
          <span className="an-static" data-testid="line-curve">
            {curve === null
              ? 'straight'
              : curve.shape === 'arc'
                ? 'arc'
                : `spline · ${curve.nodes.length} points`}
          </span>
        </div>
        {curve?.shape === 'arc' && (
          <NumberField
            label="Arc"
            testId="line-arc"
            value={curve.degrees}
            min={-LINE_ARC_LIMIT}
            max={LINE_ARC_LIMIT}
            step={5}
            digits={2}
            onCommit={(degrees) => setLineArc(formula.id, degrees)}
          />
        )}
        {curve === null && (
          <button
            type="button"
            className="btn btn-small"
            data-testid="line-bend-arc"
            title="Bend this line into an arc of 30° (Manim’s path_arc): its degrees are then a field here and a handle in the preview. The way back is Undo."
            onClick={() => bendLine(formula.id, 'arc')}
          >
            Arc
          </button>
        )}
        <button
          type="button"
          className="btn btn-small"
          data-testid="line-bend-spline"
          title={
            curve?.shape === 'spline'
              ? 'Shape the curve in the preview: its points and their handles'
              : 'Bend this line into a spline, a curve through points you place in the preview. The way back is Undo.'
          }
          onClick={() => editLineCurve(clip.id)}
        >
          {curve?.shape === 'spline' ? 'Edit curve' : 'Spline'}
        </button>
      </div>
      {end('start')}
      {end('end')}
    </Section>
  );
}
