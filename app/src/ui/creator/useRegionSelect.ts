/* A region (regionSelect.ts) on a scrolling list of cards: the results of the search of formulas,
 * the rows and blocks of the Creator's list. A press on the list's empty space that travels past
 * the drag threshold draws a rectangle — the look of the app's other rectangles, `.marquee-box` —
 * and, while it is held, the selection is what `regionSelection` makes of the cards it touches.
 * Where the list allows it (`altOnItems`), a press with Alt held on an item draws one too: the
 * item's own drag (onto the timeline, into a group) does not start, and its click comes only when
 * the press does not travel. The list may scroll under it (the wheel): the rectangle is kept in
 * the content's coordinates and measured again on each scroll. A press that does not travel is the
 * click it was; a release swallows the click it would make; Escape (`trackPointer`) gives back the
 * selection the press found, and so does a drag cut short (the panel closed under it). */
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { FormulaId } from '../../model';
import { onProjectLoaded, useUiStore, type Selection } from '../../store';
import { onScrollbar } from '../background';
import { isDrag, isMainClick, screenPoint, trackPointer } from '../pointer';
import { formulaSelection, selectedFormulaIds } from '../selection';
import { swallowNextClick } from '../useMarquee';
import {
  contentBox,
  contentPoint,
  regionBox,
  regionMode,
  regionSelection,
  startsRegion,
  type Box,
  type Point,
  type ScrollView,
} from './regionSelect';

/** What a list says of its own elements. */
export interface RegionOptions {
  /** The cards a region selects, each by the formula in its `data-formula-id`. */
  cards: string;
  /** The elements whose press is their own (their click, their drag), not a region's: the cards,
   * and whatever else the list holds — the Creator's, the rows of its groups. */
  items: string;
  /** Alt held at the press lets a region start on an item too (the Creator's list, whose rows fill
   * its width). */
  altOnItems?: boolean;
}

/** A text field (a name being renamed) keeps its press, Alt or not. */
const FIELD = 'input, textarea, select, [contenteditable="true"]';

function viewOf(area: HTMLElement): ScrollView {
  const rect = area.getBoundingClientRect();
  return {
    left: rect.left + area.clientLeft,
    top: rect.top + area.clientTop,
    width: area.clientWidth,
    height: area.clientHeight,
    scrollLeft: area.scrollLeft,
    scrollTop: area.scrollTop,
  };
}

/** Calls `fn` once, when the pointer `pointerId` is let go (or the browser takes it); the result
 * forgets it before that. */
function onRelease(pointerId: number, fn: () => void): () => void {
  const listener = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    off();
    fn();
  };
  const off = () => {
    window.removeEventListener('pointerup', listener, true);
    window.removeEventListener('pointercancel', listener, true);
  };
  window.addEventListener('pointerup', listener, true);
  window.addEventListener('pointercancel', listener, true);
  return off;
}

/** `areaRef`: the scrolling element of the list, positioned (the rectangle is drawn in it);
 * `order`: the Creator list's, the order of a selection; `options`: what its cards and its items
 * are. Returns the handler of a press on the area and the rectangle being drawn, in the area's
 * content coordinates. */
export function useRegionSelect(
  areaRef: RefObject<HTMLElement | null>,
  order: readonly FormulaId[],
  options: RegionOptions,
): { onPointerDown(event: ReactPointerEvent<HTMLElement>): void; box: Box | null } {
  const [box, setBox] = useState<Box | null>(null);
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  });
  /** Ends the drag being held: giving the selection back, or leaving it (a new document has
   * a selection of its own). */
  const stop = useRef<((restore: boolean) => void) | null>(null);
  /** Undoes what a press on an item set up until its release (the item's drag held back). */
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    const off = onProjectLoaded(() => stop.current?.(false));
    return () => {
      off();
      stop.current?.(true);
      release.current?.();
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const area = areaRef.current;
    if (!isMainClick(event) || !area) return;
    const target = event.target as Element;
    const item = target.closest(options.items);
    const onItem = item !== null && area.contains(item);
    const press = { onItem, inField: target.closest(FIELD) !== null, alt: event.altKey };
    // An item keeps its click, its double-click and its drag; with Alt, where the list allows it,
    // the press is the region's.
    if (!startsRegion(press, options.altOnItems ?? false) || onScrollbar(event, area)) return;
    stop.current?.(true);
    release.current?.();
    const { pointerId } = event;
    const mode = regionMode({ shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey });
    const before: Selection = useUiStore.getState().selection;
    const initial = selectedFormulaIds(before);
    const origin = screenPoint(event);
    const pressed: Point = { x: event.clientX, y: event.clientY };
    const start = contentPoint(pressed, viewOf(area));
    let pointer = pressed;
    let active = false;
    let restore = true;
    /** The ids last selected: a move that changes nothing writes nothing. */
    let last: string | null = null;

    if (onItem) {
      // Until the button is let go, the item's own drag (HTML drag and drop: onto the timeline,
      // into a group) does not start, the region drawn or not: Escape gives the drag up, not the
      // press.
      const noDrag = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
      };
      area.addEventListener('dragstart', noDrag, true);
      let forget = () => {};
      const done = () => {
        forget();
        area.removeEventListener('dragstart', noDrag, true);
        if (release.current === done) release.current = null;
      };
      forget = onRelease(pointerId, done);
      release.current = done;
    }

    const update = () => {
      const view = viewOf(area);
      const region = regionBox(start, contentPoint(pointer, view));
      const cards = [...area.querySelectorAll<HTMLElement>(options.cards)].map((card) => ({
        id: card.dataset.formulaId!,
        box: contentBox(card.getBoundingClientRect(), view),
      }));
      const ids = regionSelection(initial, cards, region, mode);
      setBox(region);
      const key = ids.join('\n');
      if (key === last) return;
      last = key;
      useUiStore.getState().select(formulaSelection(ids, orderRef.current));
    };
    const onScroll = () => update();

    const cancel = trackPointer(
      pointerId,
      {
        move: (e) => {
          pointer = { x: e.clientX, y: e.clientY };
          if (!active) {
            if (!isDrag(e, origin)) return;
            active = true;
            area.setPointerCapture?.(pointerId);
            area.addEventListener('scroll', onScroll);
          }
          update();
        },
        end: (e, cancelled) => {
          stop.current = null;
          if (!active) return;
          area.removeEventListener('scroll', onScroll);
          setBox(null);
          if (cancelled) {
            if (restore) useUiStore.getState().select(before);
            // Pressed on an item, the release would click it: the region was drawn, so it does
            // not, whichever way the region ended.
            if (onItem && e?.type !== 'pointercancel') onRelease(pointerId, swallowNextClick);
          } else if (e?.type === 'pointerup') swallowNextClick();
        },
      },
      { target: area },
    );
    stop.current = (giveBack) => {
      restore = giveBack;
      cancel();
    };
  };

  return { onPointerDown, box };
}
