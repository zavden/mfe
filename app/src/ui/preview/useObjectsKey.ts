/* F held, in the Preview's world view: the pointer takes the objects of the scene while the key is
 * down, as it does in the camera view, and the camera's rectangles again once it is let go
 * (`pointerReach.ts`). The owner asked for the world view to leave the objects alone (D192), and
 * then for a key to reach them there: a formula is sometimes put where the camera will be, and
 * the camera's rectangles are in the world.
 *
 * The key is taken outside fields, menus and dialogs, without Ctrl, ⌘ or Alt — Shift may be down:
 * the transform handles are asked for with it. While it is held its repeats type nothing and are
 * nobody's shortcut, whatever is pressed meanwhile: Ctrl held for a drag without snapping would
 * turn them into Ctrl+F, the search of formulas. The window losing the focus ends it, as the key's
 * release would — and so does ⌘ let go, on a Mac, where a letter released while ⌘ is down is never
 * heard.
 *
 * The key has work in the world view only (`on`): anywhere else the objects answer already, and F
 * is nobody's. A drag of an object goes on to its end after the key is let go
 * (`usePreviewGestures.ts`). */
import { useEffect } from 'react';
import { create } from 'zustand';
import { inOpenMenu } from '../focus';
import { letterOf } from '../platform';
import { isModalOpen } from '../project/modalStack';
import { isTextEntryTarget } from '../project/shortcuts';

/** The key, as the app writes it. */
export const OBJECTS_KEY = 'F';

/** Whether a key event is the press that starts it: F, alone or with Shift. */
export function isObjectsKey(event: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  return letterOf(event) === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** Whether the key is held, for whoever is not the Preview. */
export const useObjectsHeld = create<{ held: boolean }>(() => ({ held: false }));

/** Whether F is held while it has work (`on`: the Preview shows the world view). */
export function useObjectsKey(on: boolean): boolean {
  const held = useObjectsHeld((state) => state.held);

  useEffect(() => {
    if (!on) return;
    let down = false;
    const show = (next: boolean) => {
      if (next === down) return;
      down = next;
      useObjectsHeld.setState({ held: next });
    };
    const stop = () => show(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (letterOf(event) !== 'f') return;
      if (down) {
        // Its repeats, with whatever is held by now: they reach no one.
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!isObjectsKey(event)) return;
      if (event.defaultPrevented || event.repeat || isModalOpen()) return;
      if (inOpenMenu(event.target) || isTextEntryTarget(event.target)) return;
      event.preventDefault();
      show(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (letterOf(event) === 'f' || event.key === 'Meta') stop();
    };
    // Before the shortcuts hear the key (they listen as it bubbles).
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', stop);
      // Nobody hears the key's release any more.
      stop();
    };
  }, [on]);

  return on && held;
}
