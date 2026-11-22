/* A button that acts only after it has been held down for `holdMs` (pointer, or Space / Enter
 * from the keyboard), for actions that are easy to trigger by accident. A fill shows the
 * progress; releasing early (or leaving the button) cancels. A plain mouse click does nothing,
 * but a click with no press before it acts at once: that is how screen readers and voice control
 * press a button, and they cannot hold (the dialog around it already asked). */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { isMainClick } from './pointer';

export interface HoldButtonProps {
  holdMs: number;
  onActivate(): void;
  children: ReactNode;
  className?: string;
  testId?: string;
  disabled?: boolean;
}

export function HoldButton({
  holdMs,
  onActivate,
  children,
  className,
  testId,
  disabled,
}: HoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const descriptionId = useId();
  /** A pointer or key press started on the button: the click that follows is not an
   * assistive one. */
  const pressed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activate = useRef(onActivate);
  useEffect(() => {
    activate.current = onActivate;
  });

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => stop, []);

  const start = () => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      activate.current();
    }, holdMs);
  };

  const seconds = `${+(holdMs / 1000).toFixed(2)} s`;
  return (
    <>
      <button
        type="button"
        className={`hold-button${holding ? ' is-holding' : ''}${className ? ` ${className}` : ''}`}
        style={{ ['--hold-ms' as string]: `${holdMs}ms` }}
        data-testid={testId}
        data-holding={holding}
        disabled={disabled}
        title={`Press and hold for ${seconds}`}
        aria-describedby={descriptionId}
        onPointerDown={(event) => {
          pressed.current = true;
          if (!isMainClick(event)) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onKeyDown={(event) => {
          if (event.key !== ' ' && event.key !== 'Enter') return;
          pressed.current = true;
          event.preventDefault();
          if (!event.repeat) start();
        }}
        onKeyUp={(event) => {
          if (event.key === ' ' || event.key === 'Enter') stop();
        }}
        onBlur={() => {
          pressed.current = false;
          stop();
        }}
        onClick={(event) => {
          event.preventDefault();
          const assistive = event.detail === 0 && !pressed.current;
          pressed.current = false;
          if (assistive && !disabled) activate.current();
        }}
      >
        <span className="hold-button-fill" aria-hidden="true" />
        <span className="hold-button-label">{children}</span>
      </button>
      <span id={descriptionId} hidden>
        Press and hold for {seconds} to confirm.
      </span>
    </>
  );
}
