/* The placement and appearance fields of a clip state (its initial state). */
import { DEFAULT_COLOR, type ClipState } from '../../model';
import { CheckField, ColorField, NumberField, SliderField } from './fields';

const DERIVED = 'Derived from the attachment: detach the clip to set it by hand.';

/** A change to a state: its new fields, or what works them out from the state as it is when the
 * change is applied. X and Y are the second kind: each keeps the other coordinate, and the one
 * drawn here is what a drag still held in the preview shows, which the edit gives up. */
export type StatePatch = Partial<ClipState> | ((current: ClipState) => Partial<ClipState>);

/** Placement and appearance fields of a state; `patch` applies a change to it. An `attached`
 * clip's position is the attachment's (and a fitted object's rotation too): shown, not edited; a
 * `fitted` object (a brace, a shape) has no scale or flips of its own. */
export function StateFields({
  state,
  patch,
  idPrefix,
  attached = false,
  fitted = false,
  unturned = false,
}: {
  state: ClipState;
  patch(change: StatePatch): void;
  idPrefix: string;
  attached?: boolean;
  fitted?: boolean;
  /** A line: it has no turn of its own either — its two ends say where it is. */
  unturned?: boolean;
}) {
  const derived = attached ? { disabled: true, title: DERIVED } : {};
  return (
    <>
      <div className="an-row">
        <NumberField
          label="X"
          testId={`${idPrefix}-x`}
          value={state.position[0]}
          onCommit={(v) => patch((now) => ({ position: [v, now.position[1]] }))}
          {...derived}
        />
        <NumberField
          label="Y"
          testId={`${idPrefix}-y`}
          value={state.position[1]}
          onCommit={(v) => patch((now) => ({ position: [now.position[0], v] }))}
          {...derived}
        />
        {!fitted && (
          <NumberField
            label="Scale"
            testId={`${idPrefix}-scale`}
            value={state.scale}
            step={0.1}
            onCommit={(v) => patch({ scale: v })}
          />
        )}
        {!unturned && (
          <NumberField
            label="Rotation"
            testId={`${idPrefix}-rotation`}
            value={state.rotation}
            step={5}
            suffix="°"
            onCommit={(v) => patch({ rotation: v })}
            {...(fitted ? derived : {})}
          />
        )}
      </div>
      {!fitted && (
        <div className="an-row">
          <CheckField
            label="Flip X"
            testId={`${idPrefix}-flip-x`}
            checked={state.flipX}
            onChange={(v) => patch({ flipX: v })}
          />
          <CheckField
            label="Flip Y"
            testId={`${idPrefix}-flip-y`}
            checked={state.flipY}
            onChange={(v) => patch({ flipY: v })}
          />
        </div>
      )}
      <div className="an-row">
        <SliderField
          label="Opacity"
          testId={`${idPrefix}-opacity-slider`}
          value={state.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => patch({ opacity: v })}
        />
        <NumberField
          label=" "
          ariaLabel="Opacity value"
          compact
          testId={`${idPrefix}-opacity`}
          value={state.opacity}
          min={0}
          max={1}
          step={0.05}
          onCommit={(v) => patch({ opacity: v })}
        />
      </div>
      <div className="an-row">
        <CheckField
          label="Colour override"
          testId={`${idPrefix}-color-on`}
          checked={state.color !== null}
          onChange={(on) => patch({ color: on ? DEFAULT_COLOR : null })}
        />
        <ColorField
          label=" "
          ariaLabel="Colour override value"
          testId={`${idPrefix}-color`}
          value={state.color ?? DEFAULT_COLOR}
          disabled={state.color === null}
          onCommit={(v) => patch({ color: v })}
        />
      </div>
    </>
  );
}
