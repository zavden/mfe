import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../../model';
import { loadProject } from '../../../store';
import { groupKey } from '../blockGroups';
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, rulerScale } from '../ruler';
import { startTimelineViewTracking, timelineDt, useTimelineStore } from '../timelineStore';

beforeEach(() =>
  useTimelineStore.setState({
    unfolded: new Set(),
    topBlock: null,
    pxPerSecond: DEFAULT_ZOOM,
    minimumZoom: MIN_ZOOM,
    ownDt: null,
    region: null,
    markedRegion: null,
    regionLimit: null,
  }),
);
const timeline = () => useTimelineStore.getState();

describe('a dt of one’s own (D181)', () => {
  it('is the dt until the zoom changes; a zoom to the value it has keeps it', () => {
    expect(timelineDt(60)).toBe(0.5); // the zoom's own at 80 px/s
    timeline().setOwnDt(0.3);
    expect(timelineDt(60)).toBe(0.3);
    expect(timeline().pxPerSecond).toBe(DEFAULT_ZOOM);
    timeline().setZoom(DEFAULT_ZOOM);
    expect(timeline()).toMatchObject({ pxPerSecond: DEFAULT_ZOOM, ownDt: 0.3 });
    // A real change of the zoom puts the zoom's own back.
    timeline().setZoom(120);
    expect(timeline()).toMatchObject({ pxPerSecond: 120, ownDt: null });
    expect(timelineDt(60)).toBe(rulerScale(120, 60).minor);
    // At the closest zoom, a zoom closer still is clamped to where it was: no change.
    timeline().setZoom(MAX_ZOOM);
    timeline().setOwnDt(1.2);
    timeline().setZoom(MAX_ZOOM * 2);
    expect(timeline()).toMatchObject({ pxPerSecond: MAX_ZOOM, ownDt: 1.2 });
    expect(timelineDt(60)).toBe(1.2);
    timeline().setOwnDt(null);
    expect(timelineDt(60)).toBe(rulerScale(MAX_ZOOM, 60).minor);
  });

  it('stays when a new minimum moves the zoom: only a zoom of the user gives the zoom’s own back (S7-N2)', () => {
    timeline().setOwnDt(0.3);
    timeline().setMinimumZoom(4);
    timeline().setMinimumZoom(DEFAULT_ZOOM);
    expect(timeline()).toMatchObject({ pxPerSecond: DEFAULT_ZOOM, ownDt: 0.3 });
    // A wider window or a shorter scene raises the minimum past the zoom, which follows it: the
    // user zoomed nothing.
    timeline().setMinimumZoom(100);
    expect(timeline()).toMatchObject({ minimumZoom: 100, pxPerSecond: 100, ownDt: 0.3 });
    expect(timelineDt(60)).toBe(0.3);
    // A zoom of the user does.
    timeline().setZoom(120);
    expect(timeline()).toMatchObject({ pxPerSecond: 120, ownDt: null });
  });

  it('reads the zoom’s own dt from the project’s frames', () => {
    timeline().setZoom(600);
    expect(timelineDt(60)).toBeCloseTo(1 / 60, 12);
    expect(timelineDt(30)).toBeCloseTo(1 / 30, 12);
  });
});

describe('what the timeline remembers about the blocks of a document', () => {
  it('forgets the unfolded groups and the block on top with the document, while its service runs', () => {
    const key = groupKey('clip-1', 'group-1');
    const view = () => {
      useTimelineStore.getState().setGroupFolded(key, false);
      useTimelineStore.getState().setTopBlock('block-1');
    };
    view();
    loadProject(createEmptyProject());
    // Not started: it listens to nothing.
    expect(useTimelineStore.getState().unfolded.has(key)).toBe(true);
    const stop = startTimelineViewTracking();
    // The same file opened again reuses the ids: its groups open folded all the same.
    loadProject(createEmptyProject());
    expect(useTimelineStore.getState().unfolded.size).toBe(0);
    expect(useTimelineStore.getState().topBlock).toBeNull();
    // What the view is beside the blocks stays: the zoom, a dt of one's own, snapping.
    useTimelineStore.getState().setSnap(false);
    useTimelineStore.getState().setOwnDt(0.3);
    view();
    loadProject(createEmptyProject());
    expect(useTimelineStore.getState()).toMatchObject({ snap: false, ownDt: 0.3, topBlock: null });
    stop();
    useTimelineStore.getState().setSnap(true);
    view();
    loadProject(createEmptyProject());
    expect(useTimelineStore.getState().unfolded.has(key)).toBe(true);
  });
});

describe('the region marked on the ruler (D180)', () => {
  it('is view state: set, moved and removed without the project', () => {
    const { setRegion } = useTimelineStore.getState();
    expect(useTimelineStore.getState().region).toBeNull();
    setRegion({ start: 1, end: 3 });
    expect(useTimelineStore.getState().region).toEqual({ start: 1, end: 3 });
    setRegion(null);
    expect(useTimelineStore.getState().region).toBeNull();
  });

  it('goes with its document, while the service runs: the next one has other times', () => {
    useTimelineStore.getState().setRegion({ start: 1, end: 3 });
    loadProject(createEmptyProject());
    // Not started: it listens to nothing.
    expect(useTimelineStore.getState().region).toEqual({ start: 1, end: 3 });
    const stop = startTimelineViewTracking();
    useTimelineStore.getState().setRegionLimit({ seconds: 2, fps: 60 });
    loadProject(createEmptyProject());
    // What was marked goes too: a longer timeline does not bring it back.
    expect(useTimelineStore.getState()).toMatchObject({ region: null, markedRegion: null });
    useTimelineStore.getState().setRegionLimit({ seconds: 20, fps: 60 });
    expect(useTimelineStore.getState().region).toBeNull();
    stop();
  });

  it('is shown within the timeline as it is laid out, and comes back whole when it grows (A6-01)', () => {
    const { setRegion, setRegionLimit } = useTimelineStore.getState();
    setRegionLimit({ seconds: 16, fps: 60 });
    setRegion({ start: 13, end: 15 });
    const marked = useTimelineStore.getState().region;
    expect(marked).toEqual({ start: 13, end: 15 });
    // A shorter scene — a trim being dragged, say — cuts the region shown, not the one marked.
    setRegionLimit({ seconds: 14, fps: 60 });
    expect(useTimelineStore.getState()).toMatchObject({
      region: { start: 13, end: 14 },
      markedRegion: { start: 13, end: 15 },
    });
    // Shorter still, none of it is left to show.
    setRegionLimit({ seconds: 12, fps: 60 });
    expect(useTimelineStore.getState().region).toBeNull();
    // The trim given up, or undone: the timeline is as long as it was, and so is the region.
    setRegionLimit({ seconds: 16, fps: 60 });
    expect(useTimelineStore.getState().region).toBe(marked);
    // The same stretch keeps the same object: nothing that reads it changes.
    setRegionLimit({ seconds: 18, fps: 60 });
    expect(useTimelineStore.getState().region).toBe(marked);
  });

  it('marked while the timeline is shorter, is cut at once; removed, nothing comes back', () => {
    const { setRegion, setRegionLimit } = useTimelineStore.getState();
    setRegionLimit({ seconds: 14, fps: 60 });
    setRegion({ start: 13, end: 15 });
    expect(useTimelineStore.getState().region).toEqual({ start: 13, end: 14 });
    setRegion(null);
    setRegionLimit({ seconds: 16, fps: 60 });
    expect(useTimelineStore.getState()).toMatchObject({ region: null, markedRegion: null });
  });
});
