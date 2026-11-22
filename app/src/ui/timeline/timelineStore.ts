/* Timeline view state: zoom (along the time, and the height of the tracks), snapping, loop, the
 * region marked on the ruler and what is being dragged. Not part of the project, not undoable.
 * (Scroll position lives in the DOM scroll container.) What names blocks of the document — the
 * unfolded groups, the block on top — ends with it, and so does the region, which names its times
 * (`startTimelineViewTracking`). */
import { create } from 'zustand';
import type { ActionId, CameraMoveId, ClipId, RelationId } from '../../model';
import { onDocumentReplaced } from '../project/documentStore';
import { regionWithin, type TimeRegion } from './region';
import { STANDARD_SIZES, VERTICAL_SIZES, type RowSizes } from './rowSizes';
import { clampZoom, DEFAULT_ZOOM, MIN_ZOOM, rulerScale } from './ruler';
import { setTimelineVertical } from './axis';

export interface TimelineState {
  /** Horizontal zoom, pixels per second. */
  pxPerSecond: number;
  /** A dt of one's own (D181), set with the toolbar's − and +: the time between two small ticks
   * of the ruler, the grid things snap to and the step of the playhead dragged on the ruler with
   * Ctrl/⌘ held (`timelineDt`). Null: the zoom's own (`rulerScale`). A zoom the user makes
   * (`setZoom`) puts it back to null; the zoom a new minimum moves (`setMinimumZoom`) does not. */
  ownDt: number | null;
  setOwnDt(dt: number | null): void;
  minimumZoom: number;
  setMinimumZoom(minimum: number): void;
  /** Snap drags to the playhead, clip edges and the time grid (Shift suspends it). */
  snap: boolean;
  /** Playback wraps around at the end of the scene. */
  loop: boolean;
  /** Playback stops at each pause of the Slides mode, as the exported page does: its rehearsal. */
  stopAtPauses: boolean;
  /** The region shown on the ruler (`region.ts`, D180): what is created next takes it — a new
   * animation block, a new relation's window, the clip of a formula brought to the timeline. It is
   * the region marked (`markedRegion`) within the seconds the timeline lays out (`regionLimit`):
   * cut, or none, while a shorter scene ends the timeline before it. Null when none is marked. */
  region: TimeRegion | null;
  /** The region as it was marked, which a shorter timeline does not change: when the timeline
   * grows again — the edit that shortened the scene given up with Escape, undone, or any other —
   * the region comes back whole by itself (A6-01). It goes when it is removed, when another one is
   * marked, and with its document. */
  markedRegion: TimeRegion | null;
  /** Mark `region` (null: remove it); shown within the timeline as it is laid out now. */
  setRegion(region: TimeRegion | null): void;
  /** The seconds the timeline lays out and the frames of the scene, which the region shown is
   * cut to (`regionWithin`); null until the timeline says (the region is shown as marked). */
  regionLimit: RegionLimit | null;
  /** The timeline lays out other seconds, or the scene has other frames: the region shown is the
   * marked one within them. */
  setRegionLimit(limit: RegionLimit): void;
  /** The relation whose window band is being dragged: its band shows a readout meanwhile. */
  windowDrag: RelationId | null;
  /** The animation block being dragged (its body or an edge), and why the planner stops it where
   * it is — null while it goes where the pointer asks. A readout over the block shows both
   * (`BlockDragReadout`), and a stopped block is marked. */
  blockDrag: BlockDrag | null;
  /** The camera move being dragged (its body or an edge, `cameraMoveGestures.ts`), and why it
   * stops where it is — null while it goes where the pointer asks. A readout under the move shows
   * both (`CameraRow`), and a stopped move is marked. */
  cameraDrag: CameraDrag | null;
  /** The intro or the outro whose inner edge is being dragged (`phaseGestures.ts`): a readout
   * beside the edge says how long it lasts meanwhile (`PhaseDragReadout`). */
  phaseDrag: PhaseDrag | null;
  /** The block dragged last: it keeps the top lane of its clip (`trackLayout`), so that the block
   * one moves over another lies above it, and stays there once dropped. */
  topBlock: ActionId | null;
  /** The groups of blocks drawn with a lane per member (`groupKey`s, `blockGroups.ts`); every
   * other group is folded into one block. A new set whenever it changes. */
  unfolded: ReadonlySet<string>;
  /** Fold a group into one block, or unfold it. */
  setGroupFolded(key: string, folded: boolean): void;
  /** How tall the tracks are drawn (`rowSizes.ts`): the vertical zoom, and the tracks resized by
   * hand. A new object whenever it changes (the layout is cached by it). */
  rowSizes: RowSizes;
  setRowSizes(sizes: RowSizes): void;
  setZoom(pxPerSecond: number): void;
  setWindowDrag(relationId: RelationId | null): void;
  setBlockDrag(drag: BlockDrag | null): void;
  setCameraDrag(drag: CameraDrag | null): void;
  setPhaseDrag(drag: PhaseDrag | null): void;
  setTopBlock(actionId: ActionId | null): void;
  setSnap(snap: boolean): void;
  setLoop(loop: boolean): void;
  setStopAtPauses(stopAtPauses: boolean): void;
  /** The timeline is drawn vertical — time down the screen, the tracks side by side (Zen mode,
   * D182) — instead of horizontal. The layout says so; the gestures read the screen through
   * `axis.ts`, which is told here. */
  vertical: boolean;
  setVertical(vertical: boolean): void;
  /** The sizes of the tracks the other way: each way keeps its own (`setVertical` trades them).
   * A column is read across, so the vertical timeline starts with wider tracks. */
  otherRowSizes: RowSizes;
}

export interface BlockDrag {
  actionId: ActionId;
  /** The planner's sentence for where the pointer asked the block to be, when it had to stop
   * short of it; null while it follows the pointer. */
  stop: string | null;
}

export interface CameraDrag {
  moveId: CameraMoveId;
  /** Why the move is held short of where the pointer asked it to be (`moveStopReason`); null while
   * it follows the pointer. */
  stop: string | null;
}

export interface PhaseDrag {
  clipId: ClipId;
  phase: 'intro' | 'outro';
}

/** What the region shown is cut to: the last second the timeline lays out, and the frames. */
export interface RegionLimit {
  seconds: number;
  fps: number;
}

/** `marked` as the timeline shows it within `limit` (none: as marked). */
const shownRegion = (marked: TimeRegion | null, limit: RegionLimit | null): TimeRegion | null =>
  marked && limit ? regionWithin(marked, limit.seconds, limit.fps) : marked;

/** The zoom at `pxPerSecond`, as the user asked: a dt of one's own goes back to the zoom's own when
 * the zoom changes (D181), and stays when it does not. */
function zoomTo(state: TimelineState, pxPerSecond: number) {
  return pxPerSecond === state.pxPerSecond ? { pxPerSecond } : { pxPerSecond, ownDt: null };
}

export const useTimelineStore = create<TimelineState>()((set, get) => ({
  pxPerSecond: DEFAULT_ZOOM,
  ownDt: null,
  setOwnDt: (ownDt) => set({ ownDt }),
  minimumZoom: MIN_ZOOM,
  // A wider window or a shorter scene may raise the minimum past the zoom, which follows it: no
  // zoom of the user's, so a dt of one's own stays (S7-N2).
  setMinimumZoom: (minimumZoom) =>
    set((state) => ({ minimumZoom, pxPerSecond: clampZoom(state.pxPerSecond, minimumZoom) })),
  snap: true,
  loop: false,
  stopAtPauses: false,
  region: null,
  markedRegion: null,
  setRegion: (markedRegion) =>
    set((state) => ({ markedRegion, region: shownRegion(markedRegion, state.regionLimit) })),
  regionLimit: null,
  setRegionLimit: (regionLimit) =>
    set((state) => {
      const was = state.regionLimit;
      if (was && was.seconds === regionLimit.seconds && was.fps === regionLimit.fps) return state;
      const region = shownRegion(state.markedRegion, regionLimit);
      // The region shown is the same object while it is the same stretch: its readers stay.
      const same =
        region === state.region ||
        (region !== null &&
          state.region !== null &&
          region.start === state.region.start &&
          region.end === state.region.end);
      return same ? { regionLimit } : { regionLimit, region };
    }),
  windowDrag: null,
  blockDrag: null,
  cameraDrag: null,
  phaseDrag: null,
  topBlock: null,
  unfolded: new Set<string>(),
  setGroupFolded: (key, folded) =>
    set((state) => {
      if (state.unfolded.has(key) !== folded) return state;
      const unfolded = new Set(state.unfolded);
      if (folded) unfolded.delete(key);
      else unfolded.add(key);
      return { unfolded };
    }),
  rowSizes: STANDARD_SIZES,
  setRowSizes: (rowSizes) => set({ rowSizes }),
  setZoom: (pxPerSecond) =>
    set((state) => zoomTo(state, clampZoom(pxPerSecond, state.minimumZoom))),
  setWindowDrag: (windowDrag) => set({ windowDrag }),
  setBlockDrag: (blockDrag) => set({ blockDrag }),
  setCameraDrag: (cameraDrag) => set({ cameraDrag }),
  setPhaseDrag: (phaseDrag) => set({ phaseDrag }),
  setTopBlock: (topBlock) => set({ topBlock }),
  setSnap: (snap) => set({ snap }),
  setLoop: (loop) => set({ loop }),
  setStopAtPauses: (stopAtPauses) => set({ stopAtPauses }),
  vertical: false,
  otherRowSizes: VERTICAL_SIZES,
  setVertical: (vertical) => {
    const state = get();
    if (state.vertical === vertical) return;
    setTimelineVertical(vertical);
    set({ vertical, rowSizes: state.otherRowSizes, otherRowSizes: state.rowSizes });
  },
}));

/** The time between two small ticks of the ruler, which is also the grid things snap to and the
 * step of the playhead dragged on the ruler with Ctrl/⌘ held: the dt of one's own (D181), else
 * the zoom's. For code that reads the store when it acts; a component selects `ownDt` and
 * `pxPerSecond`. */
export function timelineDt(fps: number): number {
  const { ownDt, pxPerSecond } = useTimelineStore.getState();
  return ownDt ?? rulerScale(pxPerSecond, fps).minor;
}

/** Fold every group, forget the block on top and remove the region with their document: the next
 * one may reuse the ids — the same file opened again does —, opens with its groups folded, and
 * has other times to mark (one of the app's services, `sessionTracking.ts`). Returns the function
 * that stops it. */
export function startTimelineViewTracking(): () => void {
  return onDocumentReplaced(() =>
    useTimelineStore.setState({
      unfolded: new Set(),
      topBlock: null,
      region: null,
      markedRegion: null,
    }),
  );
}
