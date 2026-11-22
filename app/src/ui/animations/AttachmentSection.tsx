/* The attachment of a clip in the Animations panel (R4, D66): what it hangs on and how — the
 * side and gap of a `next_to` object; the direction (degrees from below, or a side), gap,
 * sharpness, colour and fitted width of a brace, and its labels (D69); the gap of a label at a
 * brace's tip, its own or Manim's; the shape, gap, corner radius, style, colour and fitted size
 * of a shape (D71) — and Detach, which frees it where it is. A brace keeps its sharpness, colour
 * and labels here once detached, a shape its shape, corners, style and colour; the target and the
 * gap are gone with the attachment. */
import { useState } from 'react';
import {
  BRACE_LABEL_BUFF,
  BRACE_SIDE_DEGREES,
  diagonalOf,
  hasInside,
  labelBuff,
  overCorners,
  type Clip,
  type ClipId,
  type Formula,
  type ShapeDiagonal,
  type ShapeKind,
} from '../../model';
import { useProjectStore } from '../../store';
import { ContextMenu } from '../ContextMenu';
import { patchFormula } from '../creator/formulaActions';
import { DIAGONAL_LABELS, SHAPE_DIAGONALS, SHAPE_KINDS, SHAPE_LABELS } from '../creator/sources';
import { LabelMenuItems } from './BlockMenus';
import {
  addBraceLabel,
  BRACE_SIDES,
  describeAttachment,
  detachClip,
  labelsOf,
  setAttachBuff,
  setAttachSide,
  setBraceDirection,
  setBraceSharpness,
  setLabelBuff,
  SIDE_LABELS,
} from './braceActions';
import { CheckField, ColorField, NumberField, SelectField } from './fields';
import { Section } from './Section';
import {
  setShapeCornerRadius,
  setShapeDiagonal,
  setShapeFillColor,
  setShapeKind,
  setShapeStyle,
} from './shapeActions';

/** "Add label": the menu of the kinds a label at the brace's tip can be (D69). */
function AddLabelButton({ braceClipId }: { braceClipId: ClipId }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className="an-small-button an-accent-button"
        data-testid="attachment-add-label"
        aria-haspopup="menu"
        title="A formula or a LaTeX text at the tip of the brace, placed as Manim's put_at_tip"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setAt({ x: box.left, y: box.bottom + 2 });
        }}
      >
        Add label
      </button>
      {at && (
        <ContextMenu
          x={at.x}
          y={at.y}
          label="Add label"
          testId="add-label-menu"
          onClose={() => setAt(null)}
        >
          <LabelMenuItems
            testIdPrefix="attachment-label"
            flat
            onChoose={(kind) => {
              setAt(null);
              addBraceLabel(braceClipId, kind);
            }}
          />
        </ContextMenu>
      )}
    </>
  );
}

export function AttachmentSection({ clip, formula }: { clip: Clip; formula: Formula }) {
  const project = useProjectStore((s) => s.project);
  const attach = clip.attach;
  const brace = formula.kind === 'brace' ? formula : null;
  const shape = formula.kind === 'shape' ? formula : null;
  if (!attach && !brace && !shape) return null;
  const sideOptions = BRACE_SIDES.map((side) => ({ value: side, label: SIDE_LABELS[side] }));
  const tip = attach?.rule === 'tip' ? attach : null;
  const labels = brace
    ? labelsOf(project, clip.id).map(
        (c) => project.formulas.find((f) => f.id === c.formulaId)?.name ?? '?',
      )
    : [];
  return (
    <Section
      title={brace ? 'Brace' : shape ? 'Shape' : tip ? 'Label' : 'Attachment'}
      testId="attachment-section"
    >
      <p className="an-hint" data-testid="attachment-target">
        {attach
          ? `${describeAttachment(project, clip)}. Its place follows ${tip ? 'the brace' : 'those glyphs'}: detach it to move it by hand.`
          : 'Detached: placed like any clip.'}
      </p>
      {shape && (
        <>
          <div className="an-row">
            <SelectField<ShapeKind>
              label="Shape"
              testId="attachment-shape"
              value={shape.shape}
              options={SHAPE_KINDS.map((s) => ({ value: s, label: SHAPE_LABELS[s] }))}
              onChange={(s) => setShapeKind(shape.id, s)}
            />
            <ColorField
              label="Colour"
              testId="attachment-color"
              value={shape.color}
              onCommit={(color) => patchFormula(shape.id, { color })}
            />
            {/* A line of its own: beside the other two it broke in two and ran over the row
                below. */}
            <div className="an-field is-line">
              <span className="an-label">Size</span>
              <span className="an-static" data-testid="attachment-size">
                {shape.width.toFixed(3)} × {shape.height.toFixed(3)}
              </span>
            </div>
          </div>
          <div className="an-row">
            {shape.shape === 'cross_line' && (
              <SelectField<ShapeDiagonal>
                label="Diagonal"
                testId="attachment-diagonal"
                value={diagonalOf(shape)}
                options={SHAPE_DIAGONALS.map((d) => ({ value: d, label: DIAGONAL_LABELS[d] }))}
                onChange={(d) => setShapeDiagonal(shape.id, d)}
              />
            )}
            {attach?.rule === 'shape' && !overCorners(shape.shape) && (
              <NumberField
                label="Gap"
                testId="attachment-buff"
                value={attach.buff}
                step={0.05}
                title="The gap between the glyphs and the shape (Manim's buff; 0.1 is its default)"
                onCommit={(v) => setAttachBuff(clip.id, v)}
              />
            )}
            {shape.shape === 'box' && (
              <NumberField
                label="Corners"
                testId="attachment-corner"
                value={shape.cornerRadius}
                min={0}
                step={0.05}
                title="Corner radius, scene units (0: square corners)"
                onCommit={(v) => setShapeCornerRadius(shape.id, v)}
              />
            )}
            <NumberField
              label="Stroke"
              testId="attachment-stroke-width"
              value={shape.style.strokeWidth}
              min={0}
              step={0.5}
              title="Stroke width, Manim's units (4 is its default; a cross's 6)"
              onCommit={(v) => setShapeStyle(shape.id, { strokeWidth: v })}
            />
            <NumberField
              label="Opacity"
              testId="attachment-stroke-opacity"
              value={shape.style.strokeOpacity}
              min={0}
              max={1}
              step={0.05}
              title="The stroke's opacity"
              onCommit={(v) => setShapeStyle(shape.id, { strokeOpacity: v })}
            />
            {hasInside(shape.shape) && (
              <NumberField
                label="Fill"
                testId="attachment-fill-opacity"
                value={shape.style.fillOpacity}
                min={0}
                max={1}
                step={0.05}
                title="The fill's opacity (0: no fill; a highlight is a box filled with no stroke)"
                onCommit={(v) => setShapeStyle(shape.id, { fillOpacity: v })}
              />
            )}
          </div>
          {hasInside(shape.shape) && (
            // The fill is the stroke's colour unless it is given one of its own (Manim's
            // `fill_color`).
            <div className="an-to-row" data-testid="attachment-fill-color-row">
              <CheckField
                label="Fill colour"
                testId="attachment-fill-color-on"
                checked={shape.fillColor !== undefined}
                onChange={(on) => setShapeFillColor(shape.id, on ? shape.color : null)}
              />
              {shape.fillColor !== undefined ? (
                <ColorField
                  label=" "
                  ariaLabel="Fill colour value"
                  testId="attachment-fill-color"
                  value={shape.fillColor}
                  onCommit={(color) => setShapeFillColor(shape.id, color)}
                />
              ) : (
                <span className="an-hint">the stroke’s colour</span>
              )}
            </div>
          )}
        </>
      )}
      {tip && (
        <div className="an-row">
          <NumberField
            label="Gap"
            testId="attachment-buff"
            value={labelBuff(tip, project.meta.target)}
            step={0.05}
            title="The gap between the brace's tip and the label"
            onCommit={(v) => setLabelBuff(clip.id, v)}
          />
          <button
            type="button"
            className={`an-small-button${tip.buff === null ? ' is-on' : ''}`}
            aria-pressed={tip.buff === null}
            data-testid="attachment-buff-default"
            title={`The gap Manim's Brace.get_tex leaves: ${BRACE_LABEL_BUFF.ce} in ManimCE, ${BRACE_LABEL_BUFF.gl} in ManimGL`}
            onClick={() => setLabelBuff(clip.id, null)}
          >
            Manim's gap
          </button>
        </div>
      )}
      {attach?.rule === 'next_to' && (
        <div className="an-row">
          <SelectField
            label="Side"
            testId="attachment-side"
            value={attach.side}
            options={sideOptions}
            onChange={(side) => setAttachSide(clip.id, side)}
          />
          <NumberField
            label="Gap"
            testId="attachment-buff"
            value={attach.buff}
            step={0.05}
            onCommit={(v) => setAttachBuff(clip.id, v)}
          />
        </div>
      )}
      {attach?.rule === 'brace' && (
        <>
          <div className="an-row">
            <NumberField
              label="Direction"
              testId="attachment-direction"
              value={attach.direction}
              step={5}
              suffix="°"
              title="Degrees counter-clockwise from below: 0 below the glyphs, 180 above, −90 on their left, 90 on their right"
              onCommit={(v) => setBraceDirection(clip.id, v)}
            />
            <NumberField
              label="Gap"
              testId="attachment-buff"
              value={attach.buff}
              step={0.05}
              onCommit={(v) => setAttachBuff(clip.id, v)}
            />
          </div>
          <div className="an-quick" role="group" aria-label="Brace side">
            {BRACE_SIDES.map((side) => {
              const on = Math.abs(attach.direction - BRACE_SIDE_DEGREES[side]) < 1e-9;
              return (
                <button
                  key={side}
                  type="button"
                  className={`an-small-button${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  data-testid={`attachment-side-${side}`}
                  onClick={() => setBraceDirection(clip.id, BRACE_SIDE_DEGREES[side])}
                >
                  {SIDE_LABELS[side]}
                </button>
              );
            })}
          </div>
        </>
      )}
      {brace && (
        <div className="an-row">
          <NumberField
            label="Sharpness"
            testId="attachment-sharpness"
            value={brace.sharpness}
            step={0.1}
            min={0.1}
            title="ManimCE's sharpness (2 is Manim's): how long the straight runs are. ManimGL draws its brace from a font and ignores it."
            onCommit={(v) => setBraceSharpness(brace.id, v)}
          />
          <ColorField
            label="Colour"
            testId="attachment-color"
            value={brace.color}
            onCommit={(color) => patchFormula(brace.id, { color })}
          />
          <div className="an-field">
            <span className="an-label">Width</span>
            <span className="an-static" data-testid="attachment-width">
              {brace.width.toFixed(3)}
            </span>
          </div>
        </div>
      )}
      {brace && (
        <div className="an-row">
          <div className="an-field">
            <span className="an-label">Labels</span>
            <span className="an-static" data-testid="attachment-labels">
              {labels.length > 0 ? labels.join(', ') : 'None'}
            </span>
          </div>
          <AddLabelButton braceClipId={clip.id} />
        </div>
      )}
      {attach && (
        <button
          type="button"
          className="an-small-button"
          data-testid="attachment-detach"
          onClick={() => detachClip(clip.id)}
        >
          Detach
        </button>
      )}
    </Section>
  );
}
