/* Pointer gestures of the timeline: scrubbing the playhead, moving clips (also between tracks),
 * trimming their edges. Each drag is one undo step (`history.beginGesture` … `endGesture`,
 * `cancelGesture` on Escape). Handlers read stores through `getState()` at event time, so they
 * never act on stale render state. */
import {
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  cameraMoveEdges,
  sceneDuration,
  type AudioClip,
  type Clip,
  type Project,
} from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { lockedWindowTimes, restoreLockedWindows } from '../relations/lockedRelations';
import { fitRelationWindows, restoreWindows } from '../relations/relationOps';
import { round6, snapToFrame } from '../time';
import { mainPlayback } from '../transport/mainPlayback';
import { constrainMove, snapEdges, snapOffset, type Move } from './clipOps';
import { applyTrim, trimMembers, trimRange } from './groupTrim';
import { DRAG_THRESHOLD, isDrag, isMainClick, screenPoint, trackPointer } from '../pointer';
import { trackProjectPointer } from '../project/trackProjectPointer';
import { mergeMarquee } from '../preview/marquee';
import { clipsInRect, timeRect, type TimeRect } from './marquee';
import { SNAP_DISTANCE } from './layout';
import { nearestTick } from './ruler';
import { timelineDt, useTimelineStore } from './timelineStore';
import { tracksLayout, type TracksLayout } from './trackLayout';
import { timelineClips, timelineClip, isAudioClip, type TimelineClip } from './timelineClips';
import { across, along, boxOf } from './axis';

interface Refs {
  /** Element whose left edge is time 0 (the ruler lane). */
  ruler: RefObject<HTMLElement | null>;
  /** Element holding the track rows, top = first track. */
  tracks: RefObject<HTMLElement | null>;
}

export function selectedClipIds(): string[] {
  const selection = useUiStore.getState().selection;
  return selection.kind === 'clips' ? selection.ids : [];
}

/** Snap targets for edges: playhead, scene start, edges of clips that are not being edited, and
 * the edges of the camera's moves. */
export function snapPoints(project: Project, skip: ReadonlySet<string>): number[] {
  const points = [0, useUiStore.getState().time, ...cameraMoveEdges(project)];
  if (project.meta.duration !== null) points.push(project.meta.duration);
  for (const clip of timelineClips(project)) {
    if (skip.has(clip.id)) continue;
    points.push(clip.start, clip.end);
  }
  return points;
}

export function snapOptions(project: Project, skip: ReadonlySet<string>) {
  return snapOptionsAt(snapPoints(project, skip), project.meta.fps);
}

/** How edges snap at the current zoom: onto `points` or the ruler grid — dt apart, the zoom's or
 * one's own (D181) —, within SNAP_DISTANCE px. */
export function snapOptionsAt(points: number[], fps: number) {
  const { pxPerSecond } = useTimelineStore.getState();
  return {
    points,
    grid: timelineDt(fps),
    threshold: SNAP_DISTANCE / pxPerSecond,
  };
}

export function useTimelineGestures({ ruler, tracks }: Refs) {
  const timeAt = useCallback(
    (clientX: number): number => {
      const left = ruler.current ? boxOf(ruler.current).left : 0;
      return (clientX - left) / useTimelineStore.getState().pxPerSecond;
    },
    [ruler],
  );

  /** The track row under a client y, by `layout` (default: the project as it is now). */
  const trackIndexAt = useCallback(
    (
      clientY: number,
      layout: TracksLayout = tracksLayout(
        useProjectStore.getState().project,
        useTimelineStore.getState().topBlock,
        useTimelineStore.getState().unfolded,
        useTimelineStore.getState().rowSizes,
      ),
    ): number => {
      const top = tracks.current ? boxOf(tracks.current).top : 0;
      return layout.indexAt(clientY - top);
    },
    [tracks],
  );

  /** The playhead to the time under `clientX`, on a frame; `byTick` (D174): on the small ticks of
   * the ruler alone — dt apart, the zoom's or one's own (D181) —, whatever the Snap key says. */
  const scrubTo = useCallback(
    (clientX: number, byTick = false) => {
      const { project } = useProjectStore.getState();
      const { fps } = project.meta;
      const limit = sceneDuration(project);
      let t = Math.min(Math.max(timeAt(clientX), 0), limit);
      if (byTick) t = nearestTick(t, timelineDt(fps), limit);
      mainPlayback.seek(snapToFrame(t, fps));
    },
    [timeAt],
  );

  /** Press on the ruler: jump the playhead there and follow the pointer. With Ctrl/⌘ held the
   * playhead goes tick by tick (D174); the key is read all along the drag, and pressed or let go
   * under a still pointer it moves the playhead at once. */
  const startScrub = useCallback(
    (e: ReactPointerEvent) => {
      if (!isMainClick(e)) return;
      e.preventDefault();
      let x = along(e);
      let byTick = e.ctrlKey || e.metaKey;
      scrubTo(x, byTick);
      const onKey = (ev: KeyboardEvent) => {
        const held = ev.ctrlKey || ev.metaKey;
        if (held === byTick) return;
        byTick = held;
        scrubTo(x, byTick);
      };
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);
      trackPointer(e.pointerId, {
        move: (ev) => {
          x = along(ev);
          byTick = ev.ctrlKey || ev.metaKey;
          scrubTo(x, byTick);
        },
        end: () => {
          window.removeEventListener('keydown', onKey);
          window.removeEventListener('keyup', onKey);
        },
      });
    },
    [scrubTo],
  );

  /** Press on a clip: select, and (past a small threshold) move the selection. */
  const startMove = useCallback(
    (e: ReactPointerEvent, clip: TimelineClip) => {
      if (!isMainClick(e)) return;
      e.stopPropagation();
      const ui = useUiStore.getState();
      const { project } = useProjectStore.getState();
      const locked = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      let ids = selectedClipIds();
      let collapseTo: string | null = null;
      if (additive) {
        ids = ids.includes(clip.id) ? ids.filter((id) => id !== clip.id) : [...ids, clip.id];
        ui.select(ids.length ? { kind: 'clips', ids } : { kind: 'none' });
        if (!ids.includes(clip.id)) return;
      } else if (!ids.includes(clip.id)) {
        ids = [clip.id];
        ui.select({ kind: 'clips', ids });
      } else if (ids.length > 1) {
        collapseTo = clip.id; // a plain click inside a multi-selection narrows it on release
      }
      if (locked.has(clip.trackId)) return;

      const startProject = project;
      const movingIds = ids.filter((id) => {
        const c = timelineClip(startProject, id);
        return c && !locked.has(c.trackId);
      });
      const trackIds = startProject.tracks.map((t) => t.id);
      const originals = new Map(
        timelineClips(startProject)
          .filter((c) => movingIds.includes(c.id))
          .map((c) => [c.id, c]),
      );
      const press = screenPoint(e);
      const startX = along(e);
      // Rows grow and shrink as clips with many block lanes change track: the pointer is mapped
      // on the layout the drag started with, or a clip could jump over rows that moved under it.
      const layout = tracksLayout(
        startProject,
        useTimelineStore.getState().topBlock,
        useTimelineStore.getState().unfolded,
        useTimelineStore.getState().rowSizes,
      );
      const anchorTrack = trackIndexAt(across(e), layout);
      // The relations with clips on locked tracks play where they do whatever moves.
      const lockedTimes = lockedWindowTimes(startProject);
      let started = false;

      trackProjectPointer(
        e,
        {
          move: (ev, begin) => {
            if (!started) {
              if (!isDrag(ev, press)) return;
              started = true;
              begin();
            }
            const { pxPerSecond, snap } = useTimelineStore.getState();
            let dt = (along(ev) - startX) / pxPerSecond;

            // Tracks: shift every moved clip by the same number of rows, none onto a locked row.
            let dTrack = trackIndexAt(across(ev), layout) - anchorTrack;
            const targetOf = (c: TimelineClip, d: number) =>
              trackIds[trackIds.indexOf(c.trackId) + d];
            const valid = (d: number) =>
              [...originals.values()].every((c) => {
                const target = targetOf(c, d);
                return (
                  target !== undefined &&
                  !locked.has(target) &&
                  startProject.tracks.find((t) => t.id === target)?.kind ===
                    (isAudioClip(c) ? 'audio' : 'visual')
                );
              });
            while (dTrack !== 0 && !valid(dTrack)) dTrack -= Math.sign(dTrack);

            const moves: Move[] = [...originals.values()].map((c) => ({
              clip: c,
              trackId: targetOf(c, dTrack) ?? c.trackId,
            }));

            if (snap && !ev.shiftKey) {
              // The lead clip's edges first (so the grid applies to it), then the others'.
              const edges = [
                clip,
                ...[...originals.values()].filter((c) => c.id !== clip.id),
              ].flatMap((c) => [c.start + dt, c.end + dt]);
              dt += snapEdges(edges, snapOptions(startProject, new Set(movingIds)));
            }

            const shift = constrainMove(startProject, moves, dt);
            if (shift === null) return;
            begin().update((draft) => {
              for (const move of moves) {
                const target = timelineClip(draft, move.clip.id);
                if (!target) continue;
                target.start = round6(move.clip.start + shift);
                target.end = round6(move.clip.end + shift);
                target.trackId = move.trackId;
              }
              // A window moves with its target clip; one the source no longer covers is fitted.
              // One a locked track holds stays where it plays (the move stops before it would
              // leave the clip: `constrainMove`).
              restoreWindows(draft, startProject);
              restoreLockedWindows(draft, lockedTimes);
              fitRelationWindows(draft, movingIds);
            });
          },
          end: (_ev, cancelled) => {
            if (!started && !cancelled && collapseTo) {
              useUiStore.getState().select({ kind: 'clips', ids: [collapseTo] });
            }
          },
        },
        tracks.current,
      );
    },
    [trackIndexAt, tracks],
  );

  /** Press on a clip edge — of the scene or of a sound —: trim it. With the clip among several
   * selected ones, the same edge of every selected clip moves with it, by the same time and as
   * far as all of them allow (`groupTrim.ts`, D168); the edge that is held is the one that
   * snaps. Otherwise the clip is selected and trimmed alone. `threshold`: the travel, in px,
   * that makes the press a drag. */
  const startTrim = useCallback(
    (
      e: ReactPointerEvent,
      clip: Clip | AudioClip,
      edge: 'start' | 'end',
      threshold = DRAG_THRESHOLD,
    ) => {
      if (!isMainClick(e)) return;
      e.stopPropagation();
      e.preventDefault();
      const { project: startProject } = useProjectStore.getState();
      const selection = selectedClipIds();
      const together = selection.length > 1 && selection.includes(clip.id);
      const members = trimMembers(startProject, selection, clip.id);
      const held = members.find((m) => m.clip.id === clip.id);
      if (!together) useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
      if (!held) return;
      const [lo, hi] = trimRange(startProject, members, edge);
      const moving = new Set(members.map((m) => m.clip.id));
      const base = held.clip[edge];
      const startX = along(e);
      let started = false;

      trackProjectPointer(e, {
        move: (ev, begin) => {
          if (!started) {
            if (Math.abs(along(ev) - startX) < threshold) return;
            started = true;
            begin();
          }
          const { pxPerSecond, snap } = useTimelineStore.getState();
          let value = base + (along(ev) - startX) / pxPerSecond;
          if (snap && !ev.shiftKey) value += snapOffset(value, snapOptions(startProject, moving));
          const dt = Math.min(Math.max(value - base, lo), hi);
          begin().update((draft) => applyTrim(draft, startProject, members, edge, dt));
        },
      });
    },
    [],
  );

  /** The selection rectangle being drawn over the lanes (seconds × px), or null. */
  const [marquee, setMarquee] = useState<TimeRect | null>(null);

  /** Press on empty lane space: past the drag threshold, a rectangle that selects the clips it
   * touches — with Shift/Ctrl/⌘ held, added to the selection, which the panel would clear
   * otherwise (clearSelectionOnBackground). Escape cancels it and brings the selection back. */
  const startMarquee = useCallback(
    (e: ReactPointerEvent) => {
      if (!isMainClick(e) || e.altKey) return;
      if ((e.target as Element).closest('.tl-clip')) return;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (additive) e.stopPropagation();
      const initial = additive ? selectedClipIds() : [];
      const top = tracks.current ? boxOf(tracks.current).top : 0;
      const press = screenPoint(e);
      const start: [number, number] = [timeAt(along(e)), across(e) - top];
      let started = false;
      let last = initial.join(',');
      const restore = () =>
        useUiStore
          .getState()
          .select(initial.length ? { kind: 'clips', ids: initial } : { kind: 'none' });
      trackPointer(e.pointerId, {
        move: (ev) => {
          if (!started) {
            if (!isDrag(ev, press)) return;
            started = true;
          }
          const { project } = useProjectStore.getState();
          const layout = tracksLayout(
            project,
            useTimelineStore.getState().topBlock,
            useTimelineStore.getState().unfolded,
            useTimelineStore.getState().rowSizes,
          );
          const rect = timeRect(start, [timeAt(along(ev)), across(ev) - top]);
          setMarquee(rect);
          const ids = mergeMarquee(initial, clipsInRect(project, layout, rect), additive);
          const key = ids.join(',');
          if (key === last) return;
          last = key;
          useUiStore.getState().select(ids.length ? { kind: 'clips', ids } : { kind: 'none' });
        },
        end: (_ev, cancelled) => {
          if (!started) return;
          setMarquee(null);
          if (cancelled) restore();
        },
      });
    },
    [timeAt, tracks],
  );

  return {
    timeAt,
    trackIndexAt,
    scrubTo,
    startScrub,
    startMove,
    startTrim,
    startMarquee,
    marquee,
  };
}
