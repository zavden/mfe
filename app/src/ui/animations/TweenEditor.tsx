/* One tween of a clip (a keyframe): its timing and easing, and the target fields it sets — on a
 * shape also its paint (D123): the width and the opacity of its stroke and, for a box or a
 * circle, the opacity and the colour of its fill. A line's tween that carries its ends (D144)
 * says where each end goes — the glyphs it is on and where on them, or its point —, the gap, an
 * arc's degrees and the stroke width, in place of a position. */
import {
  attachTargets,
  DEFAULT_COLOR,
  hasInside,
  isGlyphEnd,
  LINE_ANCHORS,
  LINE_ARC_LIMIT,
  shapePaint,
  type Clip,
  type ClipState,
  type LineAnchor,
  type ShapePaint,
  type TweenAction,
} from '../../model';
import { lineCurveBefore } from '../../scene';
import { useProjectStore } from '../../store';
import {
  anchorLabel,
  editTweenEnds,
  endName,
  freeLineEnd,
  setLineAnchor,
} from '../preview/lineDraw';
import { startRetarget } from '../preview/shapeRetarget';
import { describeTargets } from './attachNames';
import { confirmDeleteBlock } from './blockActions';
import { EASING_CHOICES } from './catalogue';
import { editActionTiming, stateBefore } from './clipEdit';
import { CheckField, ColorField, NumberField, SelectField } from './fields';
import { useClipEdit } from './useClipEdit';
import { keysText } from '../platform';

type ToField =
  | 'position'
  | 'scale'
  | 'rotation'
  | 'flipX'
  | 'flipY'
  | 'opacity'
  | 'color'
  | 'strokeWidth'
  | 'strokeOpacity'
  | 'fillOpacity'
  | 'fillColor';

export function TweenEditor({
  clip,
  action,
  index,
}: {
  clip: Clip;
  action: TweenAction;
  index: number;
}) {
  const update = useProjectStore((s) => s.update);
  const formula = useProjectStore((s) => s.project.formulas.find((f) => f.id === clip.formulaId));
  const edit = useClipEdit(clip.id);
  const prefix = `tween-${action.id}`;
  const shape = formula?.kind === 'shape' ? formula : null;
  // A line has no scale, turn or flip of its own: a Transform moves it and repaints it.
  const line = formula?.kind === 'line';
  const inside = shape !== null && hasInside(shape.shape);
  // A tween that carries its shape to other glyphs (`TweenFit`): its place, size and turn are the
  // target's to give, so those fields are not offered; what it goes to is.
  const { fit } = action;
  const target = useProjectStore((s) =>
    fit ? describeTargets(s.project, attachTargets(fit)) : null,
  );
  // A tween that carries the ends of its line (`TweenEnds`): the ends place the line.
  const ends = formula?.kind === 'line' ? (action.ends ?? null) : null;
  const project = useProjectStore((s) => s.project);
  const scope = { tween: action.id };
  // The arc the line is when this starts, when it is one that can take other degrees.
  const arc =
    ends && formula?.kind === 'line' && formula.line !== 'dashed'
      ? lineCurveBefore(formula, clip, action.id)
      : null;
  const arcDegrees = arc?.shape === 'arc' ? (ends?.degrees ?? arc.degrees) : null;
  const onGlyphs = ends !== null && (isGlyphEnd(ends.start) || isGlyphEnd(ends.end));

  const editAction = (recipe: (a: TweenAction, c: Clip) => void) =>
    edit((c) => {
      const a = c.actions.find((x) => x.id === action.id);
      if (a?.kind === 'tween') recipe(a, c);
    });
  const setField = <K extends ToField>(field: K, value: Partial<ClipState>[K]) =>
    editAction((a) => {
      a.to[field] = value;
    });
  /** Tick or untick a field of the target. Ticked, it starts from what the clip has where the
   * tween starts (`from` gets that state and, for a shape, its paint there), read when the edit is
   * applied: what is drawn here may be what a drag still held in the preview shows, and the edit
   * gives that drag up. */
  const tick = <K extends ToField>(
    field: K,
    on: boolean,
    from: (before: ClipState, paint: ShapePaint | null) => Partial<ClipState>[K],
  ) =>
    editAction((a, c) => {
      if (!on) {
        delete a.to[field];
        return;
      }
      const before = stateBefore(c, a.id);
      a.to[field] = from(before, shape ? shapePaint(shape, before) : null);
    });
  /** Set one coordinate of the target's position, keeping the other as the tween has it then. */
  const setAxis = (axis: 0 | 1, value: number) =>
    editAction((a, c) => {
      const [x, y] = a.to.position ?? stateBefore(c, a.id).position;
      a.to.position = axis === 0 ? [value, y] : [x, value];
    });
  const has = (field: ToField) => action.to[field] !== undefined;
  const absStart = clip.start + action.start;

  return (
    <details className="an-tween" open data-testid={prefix}>
      <summary>
        <span>
          Tween {index + 1}{' '}
          <span className="an-tween-times">
            · {absStart.toFixed(2)} s → {(absStart + action.duration).toFixed(2)} s
          </span>
        </span>
        <button
          type="button"
          className="an-small-button"
          data-testid={`${prefix}-delete`}
          title="Delete this tween (hold the button to confirm)"
          onClick={(e) => {
            e.preventDefault();
            void confirmDeleteBlock(clip.id, action.id);
          }}
        >
          Delete…
        </button>
      </summary>
      <div className="an-row">
        <NumberField
          label="Start"
          title="Seconds after the start of the clip"
          testId={`${prefix}-start`}
          value={action.start}
          min={0}
          suffix="s"
          onCommit={(v) =>
            update((draft) => {
              const c = draft.clips.find((x) => x.id === clip.id);
              if (c) editActionTiming(draft, c, action.id, { start: v });
            })
          }
        />
        <NumberField
          label="Duration"
          testId={`${prefix}-duration`}
          value={action.duration}
          min={0.05}
          suffix="s"
          onCommit={(v) =>
            update((draft) => {
              const c = draft.clips.find((x) => x.id === clip.id);
              if (c) editActionTiming(draft, c, action.id, { duration: v });
            })
          }
        />
        <SelectField
          label="Easing"
          testId={`${prefix}-easing`}
          value={action.easing}
          options={EASING_CHOICES}
          onChange={(easing) =>
            editAction((a) => {
              a.easing = easing;
            })
          }
        />
      </div>
      {fit && (
        <div className="an-fit" data-testid={`${prefix}-fit`}>
          <div className="an-to-row">
            <span className="an-label">Goes to</span>
            <span className="an-fit-target" data-testid={`${prefix}-fit-target`}>
              {target}
            </span>
            <button
              type="button"
              className="an-small-button"
              data-testid={`${prefix}-retarget`}
              title="Choose another formula or other glyphs in the preview"
              onClick={() => startRetarget(clip.id, action.id)}
            >
              Pick again…
            </button>
          </div>
          <p className="an-hint">
            The shape is fitted to them as they are when this starts, at its own gap: its place, its
            size and its turn are theirs to give.
          </p>
        </div>
      )}
      {ends && (
        <div className="an-fit" data-testid={`${prefix}-ends`}>
          {(['start', 'end'] as const).map((side) => {
            const end = ends[side];
            const name = (
              <span className="an-label">
                <span className="line-end-dot" data-side={side} aria-hidden="true" />
                {side === 'start' ? 'Start' : 'End'}
              </span>
            );
            if (!isGlyphEnd(end)) {
              return (
                <div className="an-to-row" key={side}>
                  {name}
                  <NumberField
                    label="X"
                    compact
                    testId={`${prefix}-ends-${side}-x`}
                    value={end.point[0]}
                    onCommit={(v) =>
                      editTweenEnds(clip.id, action.id, { point: { side, at: [v, end.point[1]] } })
                    }
                  />
                  <NumberField
                    label="Y"
                    compact
                    testId={`${prefix}-ends-${side}-y`}
                    value={end.point[1]}
                    onCommit={(v) =>
                      editTweenEnds(clip.id, action.id, { point: { side, at: [end.point[0], v] } })
                    }
                  />
                </div>
              );
            }
            return (
              <div className="an-row" key={side}>
                <div className="an-field">
                  {name}
                  <span className="an-static" data-testid={`${prefix}-ends-${side}-on`}>
                    on {endName(project, end)}
                    {end.glyphs === 'all' ? '' : ` (${end.glyphs.join(', ')})`}
                  </span>
                </div>
                <SelectField<LineAnchor>
                  label="Point"
                  testId={`${prefix}-ends-${side}-anchor`}
                  title="Where on those glyphs this end goes"
                  value={end.anchor}
                  options={LINE_ANCHORS.map((anchor) => ({
                    value: anchor,
                    label: anchorLabel(anchor),
                  }))}
                  onChange={(anchor) => setLineAnchor(clip.id, side, anchor, scope)}
                />
                <button
                  type="button"
                  className="btn btn-small"
                  data-testid={`${prefix}-ends-${side}-free`}
                  title="Leave this end where this Transform draws it, free"
                  onClick={() => freeLineEnd(clip.id, side, scope)}
                >
                  Detach
                </button>
              </div>
            );
          })}
          {(onGlyphs || arcDegrees !== null) && (
            <div className="an-row">
              {onGlyphs && (
                <NumberField
                  label="Gap"
                  title="The gap left at each end while one is on glyphs (Manim's buff)"
                  testId={`${prefix}-ends-gap`}
                  value={ends.buff}
                  step={0.05}
                  onCommit={(buff) => editTweenEnds(clip.id, action.id, { buff })}
                />
              )}
              {arcDegrees !== null && (
                <NumberField
                  label="Arc"
                  suffix="°"
                  title="The degrees of the arc once this Transform has ended (Manim's path_arc)"
                  testId={`${prefix}-ends-arc`}
                  value={arcDegrees}
                  min={-LINE_ARC_LIMIT}
                  max={LINE_ARC_LIMIT}
                  step={5}
                  onCommit={(degrees) => editTweenEnds(clip.id, action.id, { degrees })}
                />
              )}
            </div>
          )}
          <p className="an-hint">
            Where the two ends of the line are once this ends. With the playhead on this Transform,
            or after it, drag the handles at its ends in the preview: an end is left free where you
            drop it; {keysText('hold Alt to put it on a symbol, Alt+Shift on a whole formula.')}
          </p>
        </div>
      )}
      <div className="an-to">
        {!fit && !ends && (
          <>
            <div className="an-to-row">
              <CheckField
                label="Position"
                testId={`${prefix}-position-on`}
                checked={has('position')}
                onChange={(on) => tick('position', on, (before) => [...before.position])}
              />
              {action.to.position && (
                <>
                  <NumberField
                    label="X"
                    compact
                    testId={`${prefix}-position-x`}
                    value={action.to.position[0]}
                    onCommit={(v) => setAxis(0, v)}
                  />
                  <NumberField
                    label="Y"
                    compact
                    testId={`${prefix}-position-y`}
                    value={action.to.position[1]}
                    onCommit={(v) => setAxis(1, v)}
                  />
                </>
              )}
            </div>
            {!line && (
              <>
                <div className="an-to-row">
                  <CheckField
                    label="Scale"
                    testId={`${prefix}-scale-on`}
                    checked={has('scale')}
                    onChange={(on) => tick('scale', on, (before) => before.scale)}
                  />
                  {action.to.scale !== undefined && (
                    <NumberField
                      label="×"
                      ariaLabel="Scale factor"
                      compact
                      testId={`${prefix}-scale`}
                      value={action.to.scale}
                      step={0.1}
                      onCommit={(v) => setField('scale', v)}
                    />
                  )}
                </div>
                <div className="an-to-row">
                  <CheckField
                    label="Rotation"
                    testId={`${prefix}-rotation-on`}
                    checked={has('rotation')}
                    onChange={(on) => tick('rotation', on, (before) => before.rotation)}
                  />
                  {action.to.rotation !== undefined && (
                    <NumberField
                      label="°"
                      ariaLabel="Rotation in degrees"
                      compact
                      testId={`${prefix}-rotation`}
                      value={action.to.rotation}
                      step={5}
                      onCommit={(v) => setField('rotation', v)}
                    />
                  )}
                </div>
                <div className="an-to-row">
                  <CheckField
                    label="Flip X"
                    testId={`${prefix}-flip-x-on`}
                    checked={has('flipX')}
                    onChange={(on) => tick('flipX', on, (before) => !before.flipX)}
                  />
                  {action.to.flipX !== undefined && (
                    <CheckField
                      label="flipped"
                      testId={`${prefix}-flip-x`}
                      checked={action.to.flipX}
                      onChange={(v) => setField('flipX', v)}
                    />
                  )}
                </div>
                <div className="an-to-row">
                  <CheckField
                    label="Flip Y"
                    testId={`${prefix}-flip-y-on`}
                    checked={has('flipY')}
                    onChange={(on) => tick('flipY', on, (before) => !before.flipY)}
                  />
                  {action.to.flipY !== undefined && (
                    <CheckField
                      label="flipped"
                      testId={`${prefix}-flip-y`}
                      checked={action.to.flipY}
                      onChange={(v) => setField('flipY', v)}
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}
        <div className="an-to-row">
          <CheckField
            label="Opacity"
            testId={`${prefix}-opacity-on`}
            checked={has('opacity')}
            onChange={(on) => tick('opacity', on, (before) => before.opacity)}
          />
          {action.to.opacity !== undefined && (
            <NumberField
              label="α"
              ariaLabel="Opacity value"
              compact
              testId={`${prefix}-opacity`}
              value={action.to.opacity}
              min={0}
              max={1}
              step={0.05}
              onCommit={(v) => setField('opacity', v)}
            />
          )}
        </div>
        <div className="an-to-row">
          <CheckField
            label="Colour"
            testId={`${prefix}-color-on`}
            checked={has('color')}
            onChange={(on) =>
              tick('color', on, (before) => before.color ?? formula?.color ?? DEFAULT_COLOR)
            }
          />
          {action.to.color !== undefined && (
            <ColorField
              label=" "
              ariaLabel="Colour value"
              testId={`${prefix}-color`}
              value={action.to.color ?? DEFAULT_COLOR}
              onCommit={(v) => setField('color', v)}
            />
          )}
        </div>
        {ends && formula?.kind === 'line' && (
          <div className="an-to-row">
            <CheckField
              label="Stroke width"
              testId={`${prefix}-stroke-width-on`}
              checked={has('strokeWidth')}
              onChange={(on) =>
                tick('strokeWidth', on, (before) => before.strokeWidth ?? formula.strokeWidth)
              }
            />
            {action.to.strokeWidth !== undefined && (
              <NumberField
                label="w"
                ariaLabel="Stroke width value"
                title="The stroke width the line arrives with (an arrow caps it by its length)"
                compact
                testId={`${prefix}-stroke-width`}
                value={action.to.strokeWidth}
                min={0}
                step={0.5}
                onCommit={(v) => setField('strokeWidth', v)}
              />
            )}
          </div>
        )}
        {shape && (
          <>
            <div className="an-to-row">
              <CheckField
                label="Stroke width"
                testId={`${prefix}-stroke-width-on`}
                checked={has('strokeWidth')}
                onChange={(on) => tick('strokeWidth', on, (_, paint) => paint?.strokeWidth)}
              />
              {action.to.strokeWidth !== undefined && (
                <NumberField
                  label="w"
                  ariaLabel="Stroke width value"
                  title="Manim's stroke width (4 is its default)"
                  compact
                  testId={`${prefix}-stroke-width`}
                  value={action.to.strokeWidth}
                  min={0}
                  step={0.5}
                  onCommit={(v) => setField('strokeWidth', v)}
                />
              )}
            </div>
            <div className="an-to-row">
              <CheckField
                label="Stroke opacity"
                testId={`${prefix}-stroke-opacity-on`}
                checked={has('strokeOpacity')}
                onChange={(on) => tick('strokeOpacity', on, (_, paint) => paint?.strokeOpacity)}
              />
              {action.to.strokeOpacity !== undefined && (
                <NumberField
                  label="α"
                  ariaLabel="Stroke opacity value"
                  compact
                  testId={`${prefix}-stroke-opacity`}
                  value={action.to.strokeOpacity}
                  min={0}
                  max={1}
                  step={0.05}
                  onCommit={(v) => setField('strokeOpacity', v)}
                />
              )}
            </div>
            {inside && (
              <>
                <div className="an-to-row">
                  <CheckField
                    label="Fill opacity"
                    testId={`${prefix}-fill-opacity-on`}
                    checked={has('fillOpacity')}
                    onChange={(on) => tick('fillOpacity', on, (_, paint) => paint?.fillOpacity)}
                  />
                  {action.to.fillOpacity !== undefined && (
                    <NumberField
                      label="α"
                      ariaLabel="Fill opacity value"
                      compact
                      testId={`${prefix}-fill-opacity`}
                      value={action.to.fillOpacity}
                      min={0}
                      max={1}
                      step={0.05}
                      onCommit={(v) => setField('fillOpacity', v)}
                    />
                  )}
                </div>
                <div className="an-to-row">
                  <CheckField
                    label="Fill colour"
                    testId={`${prefix}-fill-color-on`}
                    checked={has('fillColor')}
                    onChange={(on) =>
                      // From the colour the fill has: its own, else the stroke's.
                      tick(
                        'fillColor',
                        on,
                        (before, paint) => paint?.fillColor ?? before.color ?? shape.color,
                      )
                    }
                  />
                  {action.to.fillColor !== undefined && (
                    <ColorField
                      label=" "
                      ariaLabel="Fill colour value"
                      testId={`${prefix}-fill-color`}
                      value={action.to.fillColor}
                      onCommit={(v) => setField('fillColor', v)}
                    />
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </details>
  );
}
