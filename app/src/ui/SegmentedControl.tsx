/* A segmented switch: two or more mutually exclusive options side by side, the chosen one
 * marked by a sliding thumb. Radio-group semantics: one tab stop, arrow keys / Home / End move
 * the choice. */
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { rovingIndex } from './focus';

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Full text for the tooltip and assistive technology when `label` is not plain text. */
  title?: string;
}

export interface SegmentedControlProps<V extends string> {
  label: string;
  value: V;
  options: readonly SegmentOption<V>[];
  onChange(value: V): void;
  /** Test ids: `<testId>` on the group and `<testId>-<value>` on each option. */
  testId: string;
}

export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: SegmentedControlProps<V>) {
  const labelId = useId();
  const buttons = useRef(new Map<V, HTMLButtonElement>());
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const next = rovingIndex(event.key, index, options.length);
    if (next === null) return;
    event.preventDefault();
    const option = options[next]!;
    onChange(option.value);
    buttons.current.get(option.value)?.focus();
  };

  return (
    <div className="an-field">
      <span className="an-label" id={labelId}>
        {label}
      </span>
      <div
        className="segmented"
        role="radiogroup"
        aria-labelledby={labelId}
        data-testid={testId}
        data-value={value}
        style={{ ['--segments' as string]: options.length, ['--index' as string]: index }}
        onKeyDown={onKeyDown}
      >
        <span className="segmented-thumb" aria-hidden="true" />
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                if (el) buttons.current.set(option.value, el);
                else buttons.current.delete(option.value);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.title}
              title={option.title}
              tabIndex={checked ? 0 : -1}
              className={checked ? 'segmented-option is-checked' : 'segmented-option'}
              data-testid={`${testId}-${option.value}`}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
