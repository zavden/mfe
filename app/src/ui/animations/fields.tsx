/* Small form controls for the properties panel. Text-like fields commit once (on Enter or when
 * focus leaves) so that each edit is one undo step; sliders wrap their drag in a history gesture,
 * and so does a number box the turns of the wheel made with the mouse button held on it. */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { history, type ProjectGesture } from '../../store';
import { isMainClick, trackPointer } from '../pointer';
import { ownEscape } from '../project/modalStack';
import { PaletteRoleButton } from '../colors/PaletteRoleChoices';
import { scrubbedValue, scrubFactor, wheelSteps, wheelTravel } from './wheelScrub';

function formatNumber(value: number, digits: number): string {
  return String(+value.toFixed(digits));
}

interface NumberFieldProps {
  label: string;
  /** The field's accessible name when the visible label is blank or a symbol ("×", "°"). */
  ariaLabel?: string;
  value: number;
  onCommit(value: number): void;
  testId: string;
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  suffix?: string;
  disabled?: boolean;
  /** Shown instead of the label above the field (compact rows). */
  compact?: boolean;
  title?: string;
}

/** A number box: type and press Enter / leave the field to commit, ↑ / ↓ nudge by `step`
 * (Shift: ×10, committed at once), Escape restores the value. With the mouse button held on the
 * number, the wheel nudges it too (D141, `wheelScrub.ts`): a step for each notch, up for more,
 * ten with Shift and a tenth with Alt, written as it turns — the preview follows — and all of it
 * one undo step when the button is let go; Escape takes it back. */
export function NumberField({
  label,
  ariaLabel,
  value,
  onCommit,
  testId,
  step = 0.1,
  min = -Infinity,
  max = Infinity,
  digits = 3,
  suffix,
  disabled,
  compact,
  title,
}: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? formatNumber(value, digits);
  /** The wheel is nudging the value: the button is held, and a notch has been turned. */
  const [scrubbing, setScrubbing] = useState(false);
  /** What the field is now, for the wheel's listener, which outlives a render. */
  const latest = useRef({ value, draft, step, min, max, digits, onCommit });
  useLayoutEffect(() => {
    latest.current = { value, draft, step, min, max, digits, onCommit };
  });
  /** Ends the hold of the button, when there is one: its turns stay, or are taken back. */
  const release = useRef<((takeBack: boolean) => void) | null>(null);
  // A field that goes while its button is held keeps what the wheel did.
  useEffect(() => () => release.current?.(false), []);

  /** The button goes down on the number: until it is let go, the wheel nudges the value. */
  const holdForWheel = (event: ReactPointerEvent<HTMLInputElement>) => {
    if (!isMainClick(event) || disabled) return;
    release.current?.(false);
    const input = event.currentTarget;
    const pointerId = event.pointerId;
    let gesture: ProjectGesture | null = null;
    let carry = 0;
    const stop = () => {
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onLeave);
      input.removeEventListener('lostpointercapture', onLeave);
      release.current = null;
      setScrubbing(false);
    };
    const finish = (takeBack: boolean) => {
      const owned = gesture;
      gesture = null;
      stop();
      if (takeBack) owned?.cancel();
      else owned?.end();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === pointerId) finish(e.type === 'pointercancel');
    };
    const onLeave = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      // Before a notch is turned there is nothing to take back: the key is the field's.
      if (e.key !== 'Escape' || !gesture) return;
      e.preventDefault();
      e.stopPropagation();
      finish(true);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // the browser's zoom
      e.preventDefault();
      const turned = wheelSteps(wheelTravel(e), carry);
      carry = turned.carry;
      if (turned.steps === 0) return;
      const now = latest.current;
      // What is typed and not yet committed is where the nudge starts, as for the arrow keys.
      const typed = now.draft === null ? NaN : Number(now.draft.replace(',', '.'));
      const base = Number.isFinite(typed) ? typed : now.value;
      const next = scrubbedValue(base, turned.steps, now, scrubFactor(e));
      // Written at once, so that the next notch starts from what this one left.
      flushSync(() => {
        setDraft(null);
        if (next === now.value) return;
        setScrubbing(true);
        gesture ??= history.beginGesture(() => {
          // Another command took the step over: the hold is over, and nothing is ours to end.
          gesture = null;
          stop();
        });
        gesture.run(() => now.onCommit(next));
      });
    };
    // The button let go outside the window still ends the hold.
    try {
      input.setPointerCapture(pointerId);
    } catch {
      // A pointer that is already gone: the listeners below end the hold all the same.
    }
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onLeave);
    input.addEventListener('lostpointercapture', onLeave);
    release.current = finish;
  };

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  /** Set while Escape is closing the field, so that the blur it causes does not commit. */
  const cancelled = useRef(false);
  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number(raw.replace(',', '.'));
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    const next = clamp(parsed);
    if (next !== value) onCommit(next);
  };

  return (
    <label className={`an-field${compact ? ' is-compact' : ''}`} htmlFor={id} title={title}>
      <span className="an-label">{label}</span>
      <span className="an-input-wrap">
        <input
          id={id}
          className={scrubbing ? 'an-input is-scrubbing' : 'an-input'}
          data-testid={testId}
          aria-label={ariaLabel}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={text}
          {...ownEscape(draft !== null)}
          onPointerDown={holdForWheel}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            if (cancelled.current) cancelled.current = false;
            else if (draft !== null) commit(e.target.value);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.currentTarget.blur(); // the blur handler commits, once
            } else if (e.key === 'Escape') {
              cancelled.current = true;
              setDraft(null);
              e.currentTarget.blur();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const base = Number(text.replace(',', '.'));
              const amount = (e.shiftKey ? 10 : 1) * step * (e.key === 'ArrowUp' ? 1 : -1);
              const next = clamp(+((Number.isFinite(base) ? base : value) + amount).toFixed(6));
              setDraft(null);
              if (next !== value) onCommit(next);
            }
          }}
        />
        {suffix && <span className="an-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
  testId: string;
  disabled?: boolean;
  /** What the field is, for a tooltip. */
  title?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
  disabled,
  title,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <label className="an-field" htmlFor={id} title={title}>
      <span className="an-label">{label}</span>
      <select
        id={id}
        className="an-input"
        data-testid={testId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface GroupedSelectFieldProps {
  label: string;
  value: string;
  groups: readonly { label: string; options: readonly { value: string; label: string }[] }[];
  onChange(value: string): void;
  testId: string;
  disabled?: boolean;
}

/** A select whose options are grouped (`<optgroup>`). */
export function GroupedSelectField({
  label,
  value,
  groups,
  onChange,
  testId,
  disabled,
}: GroupedSelectFieldProps) {
  const id = useId();
  return (
    <label className="an-field" htmlFor={id}>
      <span className="an-label">{label}</span>
      <select
        id={id}
        className="an-input"
        data-testid={testId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

interface CheckFieldProps {
  label: ReactNode;
  checked: boolean;
  onChange(checked: boolean): void;
  testId: string;
  disabled?: boolean;
}

export function CheckField({ label, checked, onChange, testId, disabled }: CheckFieldProps) {
  return (
    <label className="an-check">
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

interface SliderFieldProps {
  label: string;
  /** The accessible name when the visible label is blank. */
  ariaLabel?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  testId: string;
}

/** A range input whose drag is one undo step. */
export function SliderField({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  onChange,
  testId,
}: SliderFieldProps) {
  const id = useId();
  const owner = useRef<ProjectGesture | null>(null);
  const dispose = useRef<(() => void) | null>(null);
  const cancelled = useRef(false);

  useEffect(
    () => () => {
      dispose.current?.();
      owner.current?.cancel();
    },
    [],
  );

  return (
    <label className="an-field" htmlFor={id}>
      <span className="an-label">{label}</span>
      <input
        id={id}
        className="an-slider"
        data-testid={testId}
        aria-label={ariaLabel}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={(event) => {
          dispose.current?.();
          cancelled.current = false;
          const current = history.beginGesture(() => {
            cancelled.current = true;
            dispose.current?.();
          });
          owner.current = current;
          dispose.current = trackPointer(
            event.pointerId,
            {
              move: () => {},
              end: (_event, wasCancelled) => {
                dispose.current = null;
                cancelled.current = wasCancelled;
                if (wasCancelled) current.cancel();
                else current.end();
                owner.current = null;
              },
            },
            { target: event.currentTarget },
          );
        }}
        onChange={(e) => {
          if (cancelled.current) return;
          const value = Number(e.target.value);
          if (owner.current) owner.current.run(() => onChange(value));
          else onChange(value);
        }}
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey) return;
          cancelled.current = false;
          e.stopPropagation();
        }}
      />
    </label>
  );
}

interface ColorFieldProps {
  label: string;
  /** The accessible name when the visible label is blank. */
  ariaLabel?: string;
  value: string;
  onCommit(value: string): void;
  testId: string;
  disabled?: boolean;
}

/** A colour input committed when the picker closes (native `change`), not on every drag. */
export function ColorField({
  label,
  ariaLabel,
  value,
  onCommit,
  testId,
  disabled,
}: ColorFieldProps) {
  const id = useId();
  const latest = useRef({ value, onCommit });
  useLayoutEffect(() => {
    latest.current = { value, onCommit };
  });

  // `key={value}` replaces the native picker after a commit or an external edit. Its listener
  // belongs to that DOM node, including cleanup when React replaces it or closes the editor.
  const ref = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    const onChange = () => {
      const next = el.value.toUpperCase();
      if (next !== latest.current.value.toUpperCase()) latest.current.onCommit(next);
    };
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);

  return (
    <label className="an-field" htmlFor={id}>
      <span className="an-label">{label}</span>
      <input
        id={id}
        ref={ref}
        className="an-color"
        data-testid={testId}
        aria-label={ariaLabel}
        type="color"
        disabled={disabled}
        defaultValue={value.toLowerCase()}
        key={value}
      />
      <PaletteRoleButton
        testIdPrefix={testId}
        disabled={disabled}
        onPick={(hex) => {
          if (hex.toUpperCase() !== latest.current.value.toUpperCase())
            latest.current.onCommit(hex);
        }}
      />
    </label>
  );
}
