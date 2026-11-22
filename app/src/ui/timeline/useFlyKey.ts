/* T held (D188): while the key is down, moving the mouse moves the timeline's view along time,
 * wherever the pointer is — as far as dragging a scrollbar as long as the view would. The owner
 * asked for the key to put the pointer on the timeline's slider; a page cannot move the pointer,
 * so the slider comes to the pointer instead. Along the screen's axis time runs on: sideways in
 * the usual layout, up and down in the vertical timeline (`axis.ts`). Released, the view stays.
 *
 * Shift+T held (D189): the playhead follows the pointer instead — it goes at once to the time
 * the pointer is at along that axis, on a frame, and on with every move, wherever the pointer is.
 * Released, the playhead stays. The owner asked for Ctrl+T; a browser keeps that key for itself
 * (it opens a tab) and a page never hears it. Shift can be pressed and let go while T is held:
 * the mouse then moves the one or the other.
 *
 * The key is taken outside fields, menus and dialogs, without Ctrl, ⌘ or Alt; held, its repeats
 * type nothing and reach no one else. The window losing the focus ends it, as the key's release
 * would.
 *
 * While it is held the mouse is the timeline's: what it moves is kept where others read it
 * (`useFlying`) — the Preview, whose scene then leaves the pointer alone (`pointerReach.ts`,
 * D192). */
import { useEffect, type RefObject } from 'react';
import { create } from 'zustand';
import { inOpenMenu } from '../focus';
import { letterOf } from '../platform';
import { isModalOpen } from '../project/modalStack';
import { isTextEntryTarget } from '../project/shortcuts';
import { along, timelineVertical } from './axis';
import { scrollForThumbMove } from './scrollbar';

/** What the mouse moves while T is held: the timeline's view, or the playhead. */
export type FlyMode = 'view' | 'playhead';

/** Whether a key event is the fly key: T, alone or with Shift. */
export function isFlyKey(event: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  return letterOf(event) === 't' && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** What the mouse moves while T is held: the playhead with Shift, the view without. */
export function flyMode(shift: boolean): FlyMode {
  return shift ? 'playhead' : 'view';
}

/** What the mouse is moving while the fly key is held, null while it is not: for whoever is not
 * the timeline, which has it from `useFlyKey`. */
export const useFlying = create<{ mode: FlyMode | null }>(() => ({ mode: null }));

/** What the mouse is moving while T is held, null while it is not. `scrubTo` takes the playhead
 * to the time at a place along the screen's axis of time (useTimelineGestures). */
export function useFlyKey(
  scrollRef: RefObject<HTMLDivElement | null>,
  scrubTo: (at: number) => void,
): FlyMode | null {
  const mode = useFlying((state) => state.mode);

  useEffect(() => {
    /** Where the pointer was along time at its last move; null until it moves. */
    let last: number | null = null;
    let current: FlyMode | null = null;
    const show = (next: FlyMode | null) => {
      if (next === current) return;
      current = next;
      useFlying.setState({ mode: next });
      // The playhead goes to the pointer at once, before it moves.
      if (next === 'playhead' && last !== null) scrubTo(last);
    };
    const stop = () => show(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        if (current !== null) show('playhead');
        return;
      }
      if (!isFlyKey(event)) {
        // Any other key ends it: T with Ctrl or Alt pressed meanwhile is another command.
        stop();
        return;
      }
      if (current !== null) {
        event.preventDefault();
        return;
      }
      if (event.defaultPrevented || event.repeat || isModalOpen()) return;
      if (inOpenMenu(event.target) || isTextEntryTarget(event.target)) return;
      event.preventDefault();
      show(flyMode(event.shiftKey));
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        if (current !== null) show('view');
        return;
      }
      if (letterOf(event) === 't') stop();
    };
    const onPointerMove = (event: PointerEvent) => {
      const at = along(event);
      const before = last;
      last = at;
      if (current === null) return;
      // The event knows whether Shift is down, should its press or its release have gone unheard.
      show(flyMode(event.shiftKey));
      if (current === 'playhead') {
        scrubTo(at);
        return;
      }
      const scroll = scrollRef.current;
      if (!scroll || before === null) return;
      scroll.scrollLeft = scrollForThumbMove(
        scroll.scrollLeft,
        at - before,
        scroll.clientWidth,
        scroll.scrollWidth,
        scroll.clientWidth,
      );
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', stop);
      // Nobody hears the key's release any more.
      stop();
    };
  }, [scrollRef, scrubTo]);

  // The pointer says so everywhere while the key is held: what it moves, and along which axis
  // of the screen the playhead goes.
  useEffect(() => {
    if (mode === null) return;
    document.documentElement.dataset.timelineFlying =
      mode === 'view' ? 'view' : timelineVertical() ? 'playhead-down' : 'playhead-across';
    return () => {
      delete document.documentElement.dataset.timelineFlying;
    };
  }, [mode]);

  return mode;
}
