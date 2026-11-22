/* The compass: nine directions (Manim's UL … DR and the centre) in a 3×3 grid next to what was
 * clicked. Arrow keys move between the cells, Enter or a click picks one, Escape or a press
 * outside cancels. Kept inside the preview frame. The align-by-symbol mode asks it which side a
 * symbol goes on; the end of a line (D140), where on its glyphs it is — with one more choice
 * under the grid, «Auto» (`auto`), and the anchor the end has now marked (`current`). */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { captureFocus } from '../focus';
import { DIRECTION_ARROWS, DIRECTION_LABELS, DIRECTIONS, type Direction } from './glyphAlign';

interface SymbolCompassProps {
  /** Where it opens, CSS px from the frame's corner. */
  x: number;
  y: number;
  /** The frame's size, to stay inside it. */
  width: number;
  height: number;
  /** The symbols, for the title of align by symbol. */
  reference?: string;
  target?: string;
  /** Another title, and what the dialog is called. */
  title?: ReactNode;
  label?: string;
  testId?: string;
  /** A choice besides the nine, under the grid. */
  auto?: { label: string; title: string; onPick(): void };
  /** The choice in effect: marked, and focused when the compass opens. */
  current?: Direction | 'auto' | null;
  onPick(direction: Direction): void;
  onCancel(): void;
}

const MARGIN = 6;

export function SymbolCompass({
  x,
  y,
  width,
  height,
  reference,
  target,
  title,
  label = 'Align to which side',
  testId = 'symbol-compass',
  auto,
  current = null,
  onPick,
  onCancel,
}: SymbolCompassProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setPlace({
      left: Math.max(MARGIN, Math.min(x + 12, width - box.width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y + 12, height - box.height - MARGIN)),
    });
  }, [x, y, width, height]);

  useEffect(() => {
    const restore = captureFocus();
    // After the click that opened it has run its course (its mouse events would blur it).
    // The choice in effect; else the one besides the grid, when there is one; else the centre.
    const first = current ?? (auto ? 'auto' : 'CENTER');
    const focus = window.setTimeout(() => {
      ref.current?.querySelector<HTMLButtonElement>(`[data-direction="${first}"]`)?.focus();
    }, 0);
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onCancel();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.clearTimeout(focus);
      window.removeEventListener('pointerdown', onDown, true);
      restore();
    };
    // What is focused first is read when the compass opens, not when it is drawn again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const focused = (event.target as HTMLElement).getAttribute('data-direction') as
      Direction | 'auto' | null;
    const to = (next: Direction | 'auto') =>
      ref.current?.querySelector<HTMLButtonElement>(`[data-direction="${next}"]`)?.focus();
    // The choice under the grid: down from the last row reaches it, up from it goes back.
    if (focused === 'auto') {
      if (step[1] < 0) to('DOWN');
      return;
    }
    const index = focused ? DIRECTIONS.indexOf(focused) : 4;
    if (auto && step[1] > 0 && index >= 6) {
      to('auto');
      return;
    }
    const column = Math.max(0, Math.min(2, (index % 3) + step[0]));
    const row = Math.max(0, Math.min(2, Math.floor(index / 3) + step[1]));
    to(DIRECTIONS[row * 3 + column]!);
  };

  return (
    <div
      ref={ref}
      className="symbol-compass"
      role="dialog"
      aria-label={label}
      data-testid={testId}
      style={{ left: place?.left ?? x, top: place?.top ?? y, opacity: place ? 1 : 0 }}
      onKeyDown={onKeyDown}
    >
      <div className="symbol-compass-title">
        {title ?? `Put “${target}” on the … of “${reference}”`}
      </div>
      {DIRECTIONS.map((direction) => (
        <button
          key={direction}
          type="button"
          className="symbol-compass-cell"
          data-direction={direction}
          data-testid={`compass-${direction}`}
          aria-label={DIRECTION_LABELS[direction]}
          aria-pressed={current === null ? undefined : current === direction}
          title={DIRECTION_LABELS[direction]}
          onClick={() => onPick(direction)}
        >
          {DIRECTION_ARROWS[direction]}
        </button>
      ))}
      {auto && (
        <button
          type="button"
          className="symbol-compass-auto"
          data-direction="auto"
          data-testid="compass-auto"
          aria-pressed={current === null ? undefined : current === 'auto'}
          title={auto.title}
          onClick={auto.onPick}
        >
          {auto.label}
        </button>
      )}
    </div>
  );
}
