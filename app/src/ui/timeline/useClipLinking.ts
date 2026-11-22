/* Relating two clips straight from the timeline, without the Animations panel. While Shift is
 * held every clip of an unlocked track shows a link port. From the port of clip A:
 *
 *  - click (press and release without moving): the link is armed and a line follows the
 *    pointer; clicking clip B completes it. Escape, a click on empty space or on A cancels;
 *  - drag: release over clip B.
 *
 * Escape is the link's first while the button is down: the link holds the pointer. Armed, it only
 * waits, and what was opened over it meanwhile with the keyboard — a dialog, a menu — or a field
 * being typed in takes its own Escape (`escapeIsElsewhere`); the link stays armed under it, and
 * the next Escape, with nothing over it, cancels it.
 *
 * Completing A → B opens the relation editor on a new relation A → B or, when the two clips are
 * related already, the menu that asks which of their relations to edit, or to add another
 * (`relateClips`), where the pointer is. While linking, the clips that can be targets are marked
 * and the others say why not. */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Clip, ClipId } from '../../model';
import { useProjectStore } from '../../store';
import { inOpenMenu } from '../focus';
import { isModalOpen } from '../project/modalStack';
import { notify } from '../project/noticeStore';
import { isDrag, isMainClick, screenPoint, type ScreenPoint } from '../pointer';
import { isTextEntryTarget } from '../project/shortcuts';
import { relateClips } from '../relations/relationChoiceStore';
import { relateBlocker } from '../relations/relationOps';
import { across, along, boxOf } from './axis';

type Point = [number, number];

export interface LinkState {
  from: ClipId;
  /** 'press': the button is down and has not moved yet; 'drag': it moved; 'armed': released
   * without moving, waiting for the click on the target. */
  mode: 'press' | 'drag' | 'armed';
  /** Centre of the source port and the pointer, in the coordinates of the tracks element. */
  origin: Point;
  pointer: Point;
}

/** The clip element under a client point (clips carry `data-clip-id`). */
function clipAt(x: number, y: number): ClipId | null {
  const el = document.elementFromPoint(x, y);
  return el?.closest<HTMLElement>('[data-clip-id]')?.dataset.clipId ?? null;
}

/** Whether an Escape pressed while a link waits armed is somebody else's first: a dialog is open,
 * a menu is, or the key was pressed in a field that is being typed in. */
function escapeIsElsewhere(event: KeyboardEvent): boolean {
  return isModalOpen() || inOpenMenu(event.target) || isTextEntryTarget(event.target);
}

export function useClipLinking(tracks: RefObject<HTMLDivElement | null>) {
  const [shift, setShift] = useState(false);
  const [link, setLink] = useState<LinkState | null>(null);
  const linkRef = useRef<LinkState | null>(null);
  /** Where the port was pressed, on the screen: what tells the click from the drag. */
  const press = useRef<ScreenPoint>({ clientX: 0, clientY: 0 });

  const update = useCallback((next: LinkState | null) => {
    linkRef.current = next;
    setLink(next);
  }, []);

  const local = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = tracks.current ? boxOf(tracks.current) : null;
      return rect ? [clientX - rect.left, clientY - rect.top] : [clientX, clientY];
    },
    [tracks],
  );

  /** Finish the link on `targetId`, with the pointer at `at` (client pixels). Returns false when
   * that clip cannot be the target. Two clips that are related already can be linked again
   * whenever their relations can be edited: the menu says why another cannot be added. */
  const complete = useCallback(
    (targetId: ClipId, at: { x: number; y: number }): boolean => {
      const current = linkRef.current;
      if (!current) return false;
      const { project } = useProjectStore.getState();
      const from = project.clips.find((c) => c.id === current.from);
      const to = project.clips.find((c) => c.id === targetId);
      if (!from || !to) return false;
      const reason = relateBlocker(project, from, to);
      if (reason) {
        notify({ kind: 'warning', title: 'These clips cannot be related', message: reason });
        return false;
      }
      update(null);
      setShift(false);
      relateClips(project, from.id, to.id, at);
      return true;
    },
    [update],
  );

  // Shift shows the ports (not while typing or while a dialog is open), like the preview's
  // handles: a focused checkbox or button does not take text, so it does not stop them.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && event.type === 'keydown' && linkRef.current) {
        if (linkRef.current.mode === 'armed' && escapeIsElsewhere(event)) return;
        event.preventDefault();
        event.stopPropagation();
        update(null);
        return;
      }
      if (event.key !== 'Shift') return;
      if (event.type === 'keyup') setShift(false);
      else if (!isModalOpen() && !isTextEntryTarget(event.target)) setShift(true);
    };
    const onBlur = () => setShift(false);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [update]);

  // Pointer tracking while a link is in progress.
  const active = link !== null;
  useEffect(() => {
    if (!active) return;
    const onMove = (event: PointerEvent) => {
      const current = linkRef.current;
      if (!current) return;
      update({
        ...current,
        mode: current.mode === 'press' && isDrag(event, press.current) ? 'drag' : current.mode,
        pointer: local(along(event), across(event)),
      });
    };
    const onUp = (event: PointerEvent) => {
      const current = linkRef.current;
      if (!current || current.mode === 'armed') return;
      if (current.mode === 'press') {
        update({ ...current, mode: 'armed' });
        return;
      }
      const target = clipAt(event.clientX, event.clientY);
      const at = { x: event.clientX, y: event.clientY };
      if (!target || target === current.from || !complete(target, at)) update(null);
    };
    // Armed: the next press on the tracks completes or cancels the link, and goes no further
    // (it must not select or move the clip under it). Presses elsewhere just cancel.
    const onDown = (event: PointerEvent) => {
      const current = linkRef.current;
      if (!current || current.mode !== 'armed') return;
      const inside = tracks.current?.contains(event.target as Node) ?? false;
      if (!inside) {
        update(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const target = clipAt(event.clientX, event.clientY);
      if (!target || target === current.from) update(null);
      else complete(target, { x: event.clientX, y: event.clientY });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [active, complete, local, tracks, update]);

  /** Pointer down on the link port of `clip`. */
  const startLink = useCallback(
    (event: ReactPointerEvent<HTMLElement>, clip: Clip) => {
      if (!isMainClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = boxOf(event.currentTarget);
      press.current = screenPoint(event);
      update({
        from: clip.id,
        mode: 'press',
        origin: local(rect.left + rect.width / 2, rect.top + rect.height / 2),
        pointer: local(along(event), across(event)),
      });
    },
    [local, update],
  );

  /** Keep Shift in step with the pointer in case a key event was missed (focus elsewhere). */
  const syncShift = useCallback((event: { shiftKey: boolean }) => {
    setShift((held) => (held === event.shiftKey ? held : event.shiftKey));
  }, []);

  return { shift, link, startLink, syncShift };
}
