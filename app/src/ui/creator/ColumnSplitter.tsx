/* A vertical bar between the two columns of a grid that moves the boundary between them: drag
 * it, or focus it and use the arrow keys (Shift: bigger steps); a double-click restores the
 * default. The value is the left column's share of the width the columns divide (0…1), kept
 * so that neither column gets narrower than its minimum. */
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { isMainClick, trackPointer } from '../pointer';

interface ColumnSplitterProps {
  /** The grid whose columns the bar divides. */
  containerRef: RefObject<HTMLElement | null>;
  value: number;
  defaultValue: number;
  onChange(value: number): void;
  /** Narrowest left and right column, px. */
  minLeft: number;
  minRight: number;
  /** Width of the bar's own grid column, px. */
  width: number;
  label: string;
  testId?: string;
}

const STEP = 0.02;
const BIG_STEP = 0.1;

export function ColumnSplitter({
  containerRef,
  value,
  defaultValue,
  onChange,
  minLeft,
  minRight,
  width,
  label,
  testId,
}: ColumnSplitterProps) {
  /** The share `left / available`, clamped to the minimums of both columns. */
  const clampShare = (share: number) => {
    const available = (containerRef.current?.getBoundingClientRect().width ?? 0) - width;
    if (available <= minLeft + minRight) return value;
    return Math.min(Math.max(share, minLeft / available), 1 - minRight / available);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMainClick(event) || !containerRef.current) return;
    event.preventDefault();
    const bar = event.currentTarget;
    bar.focus();
    bar.setPointerCapture?.(event.pointerId);
    bar.classList.add('is-dragging');
    trackPointer(
      event.pointerId,
      {
        move: (e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          onChange(clampShare((e.clientX - rect.left - width / 2) / (rect.width - width)));
        },
        end: () => bar.classList.remove('is-dragging'),
      },
      { escape: false },
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    if (event.key === 'ArrowLeft') onChange(clampShare(value - step));
    else if (event.key === 'ArrowRight') onChange(clampShare(value + step));
    else if (event.key === 'Home') onChange(clampShare(0));
    else if (event.key === 'End') onChange(clampShare(1));
    else return;
    event.preventDefault();
  };

  return (
    <div
      className="column-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      title={`${label} (double-click: default)`}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(clampShare(defaultValue))}
    />
  );
}
