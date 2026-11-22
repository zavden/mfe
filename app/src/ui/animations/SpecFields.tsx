/* The fields that describe how an animation runs, shared by the intro / outro editor and the
 * animation blocks: duration, easing, lag ratio and, for the fades, shift and scale. The caller
 * stores the values; ids are `<prefix>-duration`, `-easing`, `-lag-mode`, `-lag`, `-shift-x`,
 * `-shift-y` and `-scale`. */
import type { ReactNode } from 'react';
import type { Easing, Vec2 } from '../../model';
import { EASING_CHOICES, type Choice } from './catalogue';
import { NumberField, SelectField } from './fields';

interface SpecFieldsProps {
  prefix: string;
  duration: number;
  /** Bounds of what the duration field accepts (the caller may clamp further). */
  minDuration?: number;
  maxDuration?: number;
  easing: Easing;
  /** The easings offered (every one unless told otherwise); none hides the field, for an
   * animation that runs at each library's own tempo. */
  easingChoices?: readonly Choice<Easing>[] | null;
  /** null = Manim's default. */
  lagRatio: number | null;
  /** What Manim's default lag ratio is for this animation; undefined while unknown. */
  manimLag: number | undefined;
  shift: Vec2;
  scale: number;
  /** FadeIn / FadeOut: show shift and scale. */
  fade: boolean;
  /** A fade without a scale (a line: it has none of its own). */
  unscaled?: boolean;
  /** Show the lag ratio (every animation but a part transform; default true). */
  lag?: boolean;
  disabled?: boolean;
  /** Fields before the duration, in its row (the start of a block). */
  leading?: ReactNode;
  onDuration(value: number): void;
  onEasing(easing: Easing): void;
  onLagRatio(value: number | null): void;
  onShift(value: Vec2): void;
  onScale(value: number): void;
}

export function SpecFields({
  prefix,
  duration,
  minDuration = 0,
  maxDuration,
  easing,
  easingChoices = EASING_CHOICES,
  lagRatio,
  manimLag,
  shift,
  scale,
  fade,
  unscaled = false,
  lag = true,
  disabled,
  leading,
  onDuration,
  onEasing,
  onLagRatio,
  onShift,
  onScale,
}: SpecFieldsProps) {
  return (
    <>
      <div className="an-row">
        {leading}
        <NumberField
          label="Duration"
          testId={`${prefix}-duration`}
          value={duration}
          min={minDuration}
          max={maxDuration}
          step={0.1}
          suffix="s"
          disabled={disabled}
          onCommit={onDuration}
        />
        {easingChoices && (
          <SelectField
            label="Easing"
            testId={`${prefix}-easing`}
            value={easing}
            options={easingChoices}
            disabled={disabled}
            onChange={onEasing}
          />
        )}
      </div>
      {lag && (
        <div className="an-row">
          <SelectField
            label="Lag ratio"
            testId={`${prefix}-lag-mode`}
            value={lagRatio === null ? 'auto' : 'custom'}
            options={[
              {
                value: 'auto',
                label: manimLag === undefined ? 'Default' : `Default (${+manimLag.toFixed(3)})`,
              },
              { value: 'custom', label: 'Custom' },
            ]}
            disabled={disabled}
            onChange={(mode) => onLagRatio(mode === 'auto' ? null : (manimLag ?? 0))}
          />
          <NumberField
            label="Value"
            testId={`${prefix}-lag`}
            value={lagRatio ?? manimLag ?? 0}
            min={0}
            step={0.05}
            disabled={disabled || lagRatio === null}
            onCommit={onLagRatio}
          />
        </div>
      )}
      {fade && (
        <div className="an-row">
          <NumberField
            label="Shift X"
            testId={`${prefix}-shift-x`}
            value={shift[0]}
            step={0.1}
            disabled={disabled}
            onCommit={(v) => onShift([v, shift[1]])}
          />
          <NumberField
            label="Shift Y"
            testId={`${prefix}-shift-y`}
            value={shift[1]}
            step={0.1}
            disabled={disabled}
            onCommit={(v) => onShift([shift[0], v])}
          />
          {!unscaled && (
            <NumberField
              label="Scale"
              testId={`${prefix}-scale`}
              value={scale}
              min={0}
              step={0.1}
              disabled={disabled}
              onCommit={onScale}
            />
          )}
        </div>
      )}
    </>
  );
}
