/* Rectangle (marquee) selection on an SVG, or on an HTML element holding several SVGs: press,
 * drag over items and release. A press that hardly moves stays an ordinary click; a drag
 * swallows the click that follows it, so no background or item click handler sees it. Items are
 * the elements under the container with a `data-marquee` key; the marquee touches an item when
 * their boxes on screen intersect.
 * Ctrl/⌘ or Shift at the press makes the drag add to the selection. The caller keeps the
 * selection: it is told when a drag starts and, on every move, which keys the marquee touches. */
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { onProjectLoaded } from '../store';
import { isDrag, isMainClick, screenPoint, trackPointer } from './pointer';

/** The marquee, for drawing it: in the SVG's user units, or for an HTML container in CSS pixels
 * from its content's top-left corner (scrolling included: position the drawing absolutely in a
 * positioned container). */
export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MarqueeOptions {
  /** The element the drag happens on (the marquee stays inside it). */
  containerRef: RefObject<SVGSVGElement | HTMLElement | null>;
  /** A drag became a marquee: remember the selection it may add to. */
  onStart(cancel: () => void): void;
  /** The keys the marquee touches now (in document order), and whether they add to the
   * selection the drag started from. */
  onChange(keys: string[], additive: boolean): void;
  onEnd?(cancelled: boolean): void;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const touches = (a: Box, b: Box) =>
  a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

/** Stop the click that a finished drag produces, and only that one (the region of the search of
 * formulas uses it too). */
export function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}

export function useMarquee({ containerRef, onStart, onChange, onEnd }: MarqueeOptions) {
  const [rect, setRect] = useState<MarqueeRect | null>(null);
  const callbacks = useRef({ onStart, onChange, onEnd });
  const dispose = useRef<(() => void) | null>(null);
  useEffect(() => {
    callbacks.current = { onStart, onChange, onEnd };
  });
  useEffect(() => {
    const cancel = () => {
      dispose.current?.();
      dispose.current = null;
    };
    const offLoad = onProjectLoaded(cancel);
    return () => {
      offLoad();
      cancel();
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<Element>) => {
    const container = containerRef.current;
    if (!isMainClick(event) || !container) return;
    dispose.current?.();
    const pointerId = event.pointerId;
    const press = screenPoint(event);
    const start = { x: event.clientX, y: event.clientY };
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    let active = false;
    let cancel = () => {};

    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (!active) {
        if (!isDrag(e, press)) return;
        active = true;
        container.setPointerCapture?.(pointerId);
        callbacks.current.onStart(() => cancel());
      }
      // The marquee, on screen and kept inside the container.
      const bounds = container.getBoundingClientRect();
      const clampX = (x: number) => Math.min(Math.max(x, bounds.left), bounds.right);
      const clampY = (y: number) => Math.min(Math.max(y, bounds.top), bounds.bottom);
      const box: Box = {
        left: clampX(Math.min(start.x, e.clientX)),
        right: clampX(Math.max(start.x, e.clientX)),
        top: clampY(Math.min(start.y, e.clientY)),
        bottom: clampY(Math.max(start.y, e.clientY)),
      };
      if (container instanceof SVGSVGElement) {
        const toUser = container.getScreenCTM()?.inverse();
        if (toUser) {
          const a = new DOMPoint(box.left, box.top).matrixTransform(toUser);
          const b = new DOMPoint(box.right, box.bottom).matrixTransform(toUser);
          setRect({
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(b.x - a.x),
            height: Math.abs(b.y - a.y),
          });
        }
      } else {
        const x0 = bounds.left + container.clientLeft - container.scrollLeft;
        const y0 = bounds.top + container.clientTop - container.scrollTop;
        setRect({
          x: box.left - x0,
          y: box.top - y0,
          width: box.right - box.left,
          height: box.bottom - box.top,
        });
      }
      const keys = [...container.querySelectorAll<Element>('[data-marquee]')]
        .filter((el) => touches(el.getBoundingClientRect(), box))
        .map((el) => el.getAttribute('data-marquee')!);
      callbacks.current.onChange(keys, additive);
    };
    const end = (e: PointerEvent | null, cancelled: boolean) => {
      dispose.current = null;
      if (!active) return;
      setRect(null);
      callbacks.current.onEnd?.(cancelled);
      if (e?.type === 'pointerup') swallowNextClick();
    };
    cancel = trackPointer(pointerId, { move, end }, { target: container });
    dispose.current = cancel;
  };

  return { onPointerDown, rect };
}
