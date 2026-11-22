/* The timeline's keyboard: its clips and blocks form a grid with one Tab stop (keyboardNav.ts).
 * Tab reaches the Tab-stop item; the arrows, Home and End move the focus — and the selection
 * with it — between items (Shift+←/→ extend a clip selection along the track); Enter selects
 * and opens a clip's formula, or a block's menu; the Menu key or Shift+F10 opens a clip's "add
 * animation" menu at the playhead (or the clip's start), or a block's menu; Alt+←/→ move the
 * focused clip a frame (Shift: five) and Alt+↑/↓ to the track above or below, each a step of
 * undo, told to assistive technology (the blocks' own Alt+←/→ nudge is in useTimelineKeys).
 * The focus follows a clip that changes track and a block whose group is folded or unfolded, and
 * goes to the Tab stop when the focused item is deleted. */
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { multicameraOn, type ActionId, type Clip, type Project } from '../../model';
import { useProjectStore, useUiStore, type Selection } from '../../store';
import { clipMenuTime } from '../animations/blockOps';
import { announce } from '../announcer';
import { notify } from '../project/noticeStore';
import { nudgeClip } from './clipActions';
import { isNavKey, moveItem, revealScroll, tabStop, type TimelineItem } from './keyboardNav';
import { timelineClip, timelineClipName, isAudioClip, type TimelineClip } from './timelineClips';
import { fixedRowsHeight } from './layout';
import { useTimelineStore } from './timelineStore';
import type { TracksLayout } from './trackLayout';
import { headerWidth } from './headerWidth';
import { arrowOf } from './axis';

export interface TimelineKeyboardOptions {
  /** The element that holds the rows (items are found inside it). */
  tracksRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  project: Project;
  layout: TracksLayout;
  selection: Selection;
  pxPerSecond: number;
  onOpenClip(clip: TimelineClip): void;
  /** The "add animation" menu of a clip at screen point (x, y), as if clicked at time `clicked`
   * (it adds at the playhead when the playhead is inside the clip: `clipMenuTime`). */
  onClipMenu(clip: TimelineClip, x: number, y: number, clicked: number): void;
  onBlockMenu(clip: Clip, actionId: ActionId, x: number, y: number): void;
}

export interface TimelineKeyboard {
  /** Give the focus to an item, showing it; one not drawn yet (a clip that changed track) gets it
   * once it is. */
  focusItem(item: TimelineItem): void;
  /** Give the focus to an item once the timeline is drawn again: for what is about to replace the
   * element that draws it — a group folded, unfolded or undone. Given at once, the focus would be
   * on the block that goes, and from there the timeline sends it to its Tab stop, showing it:
   * with nothing selected, the first clip of the project. */
  focusItemWhenDrawn(item: TimelineItem): void;
  /** The item with tabIndex 0; every other item has −1. */
  tabItem: TimelineItem | null;
  onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  onFocus(event: FocusEvent<HTMLDivElement>): void;
  onBlur(event: FocusEvent<HTMLDivElement>): void;
}

const ITEM = '.tl-clip[data-clip-id], .tl-block[data-action-id]';

/** The item an element is, or null for anything else (a track header's button, the padlock). */
function itemOf(target: EventTarget | null): TimelineItem | null {
  if (!(target instanceof Element) || !target.matches(ITEM)) return null;
  const clipId = target.closest<HTMLElement>('[data-clip-id]')?.dataset.clipId;
  if (!clipId) return null;
  const actionId = target.getAttribute('data-action-id');
  return actionId ? { kind: 'block', clipId, actionId } : { kind: 'clip', clipId };
}

/** The element that draws an item: a block's own, or the one of the folded group it is in
 * (`GroupBlock`, which names its members). */
function elementOf(root: HTMLElement, item: TimelineItem): HTMLElement | null {
  return root.querySelector<HTMLElement>(
    item.kind === 'clip'
      ? `.tl-clip[data-clip-id="${item.clipId}"]`
      : `.tl-block[data-action-id="${item.actionId}"], .tl-block[data-members~="${item.actionId}"]`,
  );
}

/** The selection an item stands for. */
const selectionOf = (item: TimelineItem): Selection =>
  item.kind === 'clip'
    ? { kind: 'clips', ids: [item.clipId] }
    : { kind: 'action', clipId: item.clipId, actionId: item.actionId };

export function useTimelineKeyboard({
  tracksRef,
  scrollRef,
  project,
  layout,
  selection,
  pxPerSecond: px,
  onOpenClip,
  onClipMenu,
  onBlockMenu,
}: TimelineKeyboardOptions): TimelineKeyboard {
  const tabItem = tabStop(selection, project);
  const tabKey = tabItem
    ? `${tabItem.kind}:${tabItem.clipId}:${tabItem.kind === 'block' ? tabItem.actionId : ''}`
    : '';
  /** The item that has the focus, while one has it: when it leaves the document with the focus
   * still on it (deleted, undone away), the browser drops the focus on the body without a blur,
   * and the effect below brings it to the Tab stop. A blur (the focus went elsewhere, or out of
   * the window) forgets it: the user left the timeline. */
  const focused = useRef<Element | null>(null);
  /** An item to focus once the project has re-rendered (a clip that changed track remounts). */
  const pending = useRef<TimelineItem | null>(null);
  /** The requests to focus an item once the timeline is drawn again: each one draws it, so that
   * the effect below runs whether or not what was asked with it changed anything. */
  const [redrawn, redraw] = useReducer((count: number) => count + 1, 0);
  const focusItemWhenDrawn = useCallback((item: TimelineItem) => {
    pending.current = item;
    redraw();
  }, []);

  const focusItem = useCallback(
    (item: TimelineItem) => {
      const root = tracksRef.current;
      const element = root && elementOf(root, item);
      if (!element) pending.current = item;
      const scroll = scrollRef.current;
      const clip = timelineClip(project, item.clipId);
      if (scroll && clip) {
        // Show the item next to the sticky headers and the ruler, moving the view as little
        // as possible.
        const action =
          item.kind === 'block' && !isAudioClip(clip)
            ? clip.actions.find((a) => a.id === item.actionId)
            : undefined;
        const start = action ? clip.start + action.start : clip.start;
        const length = action ? action.duration : clip.end - clip.start;
        scroll.scrollLeft = revealScroll(
          scroll.scrollLeft,
          scroll.clientWidth,
          headerWidth(),
          start * px,
          length * px,
        );
        const row = layout.rowOf(clip.trackId);
        if (row) {
          // The ruler holds to the start of the view, with the Camera row beside it.
          scroll.scrollTop = revealScroll(
            scroll.scrollTop,
            scroll.clientHeight,
            fixedRowsHeight(multicameraOn(project)),
            row.top,
            row.height,
          );
        }
      }
      element?.focus({ preventScroll: true });
    },
    [tracksRef, scrollRef, project, layout, px],
  );

  useEffect(() => {
    if (pending.current) {
      const item = pending.current;
      pending.current = null;
      focusItem(item);
      return;
    }
    // The focused item is gone (deleted, undone away): keep the user in the timeline, on its
    // Tab stop.
    const lost = focused.current;
    if (lost && !lost.isConnected) {
      focused.current = null;
      if (tabItem) focusItem(tabItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tabKey` stands for `tabItem`
  }, [project, selection, tabKey, focusItem, redrawn]);

  const formulaName = (clip: TimelineClip) => timelineClipName(project, clip);

  /** Alt + arrows: move the clip, constrained like a drag, in one undo step. */
  const nudge = (clip: TimelineClip, item: TimelineItem, dt: number, dTrack: -1 | 0 | 1) => {
    const result = nudgeClip(clip.id, dt, dTrack);
    if (!result) return;
    if (!result.ok) {
      notify({ kind: 'info', title: result.reason, message: result.message });
      return;
    }
    const { tracks } = useProjectStore.getState().project;
    const track = tracks.find((t) => t.id === result.trackId);
    announce(
      dTrack !== 0
        ? `${formulaName(clip)} moved to ${track?.name ?? 'another track'}`
        : `${formulaName(clip)} moved to ${result.start.toFixed(2)} s`,
    );
    pending.current = item;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const item = itemOf(event.target);
    const clip = item && timelineClip(project, item.clipId);
    if (!item || !clip) return;
    const { altKey, ctrlKey, metaKey, shiftKey } = event;
    // The arrows follow the screen: in a vertical timeline up and down go along time (axis.ts).
    const key = arrowOf(event.key);
    const arrow = key.startsWith('Arrow');
    if (altKey && !ctrlKey && !metaKey && arrow && item.kind === 'clip') {
      event.preventDefault();
      const frames = (shiftKey ? 5 : 1) / project.meta.fps;
      const dt = key === 'ArrowLeft' ? -frames : key === 'ArrowRight' ? frames : 0;
      const dTrack = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      nudge(clip, item, dt, dTrack);
      return;
    }
    // Alt+←/→ on a block nudges it (useTimelineKeys); Ctrl/⌘ shortcuts are global.
    if (altKey || ctrlKey || metaKey) return;
    if (isNavKey(key)) {
      event.preventDefault();
      const next = moveItem(key, item, project, layout);
      if (!next) return;
      const ui = useUiStore.getState();
      // Shift+←/→ along a track: the next clip joins the selection.
      const extend =
        shiftKey &&
        item.kind === 'clip' &&
        next.kind === 'clip' &&
        (key === 'ArrowLeft' || key === 'ArrowRight');
      if (extend && ui.selection.kind === 'clips') {
        const ids = ui.selection.ids.includes(next.clipId)
          ? ui.selection.ids
          : [...ui.selection.ids, next.clipId];
        ui.select({ kind: 'clips', ids });
      } else {
        ui.select(selectionOf(next));
      }
      focusItem(next);
      return;
    }
    const rect = (event.target as Element).getBoundingClientRect();
    if (key === 'Enter') {
      event.preventDefault();
      useUiStore.getState().select(selectionOf(item));
      if (item.kind === 'clip') onOpenClip(clip);
      else if (!isAudioClip(clip)) onBlockMenu(clip, item.actionId, rect.left + 8, rect.bottom);
      return;
    }
    if (key === 'ContextMenu' || (shiftKey && key === 'F10')) {
      event.preventDefault();
      if (item.kind === 'block' && !isAudioClip(clip)) {
        onBlockMenu(clip, item.actionId, rect.left + 8, rect.bottom);
        return;
      }
      // Under the playhead when the menu adds there, else under the clip's start (what the
      // keyboard "clicks"): clipMenuTime, as the pointer's menu — under the start of the region
      // when one is marked, as far as the clip reaches.
      const { time } = useUiStore.getState();
      const { region } = useTimelineStore.getState();
      const where = clipMenuTime(clip, time, clip.start, project.meta.fps, region).time;
      const at = Math.min(Math.max(where, clip.start), clip.end);
      onClipMenu(clip, rect.left + (at - clip.start) * px, rect.bottom, clip.start);
    }
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (itemOf(event.target)) focused.current = event.target;
  };
  const onBlur = () => {
    focused.current = null;
  };

  return { tabItem, onKeyDown, onFocus, onBlur, focusItem, focusItemWhenDrawn };
}
