import { beforeEach, describe, expect, it } from 'vitest';
import { createClip, createEmptyProject, createFormula } from '../../../model';
import { loadProject, useUiStore } from '../../../store';
import { useAnnouncer } from '../../announcer';
import { markRegionEdge, removeRegion } from '../regionActions';
import { useTimelineStore } from '../timelineStore';

/** A scene that ends at 10 s (one clip over 2–10 s), at 60 fps. */
function open(): void {
  const project = createEmptyProject();
  const formula = createFormula({ name: 'f' });
  project.formulas.push(formula);
  project.clips.push(createClip(formula.id, project.tracks[0]!.id, 2, 10));
  loadProject(project);
}

const region = () => useTimelineStore.getState().region;
const said = () => useAnnouncer.getState().text;

beforeEach(() => {
  open();
  useTimelineStore.setState({ region: null });
});

describe('the keys of the region (D180)', () => {
  it('I marks from the playhead to the end of the scene, O from its start to the playhead', () => {
    useUiStore.getState().setTime(4);
    expect(markRegionEdge('start')).toBe(true);
    expect(region()).toEqual({ start: 4, end: 10 });
    expect(said()).toBe('Region 4.00–10.00 s');
    useTimelineStore.setState({ region: null });
    expect(markRegionEdge('end')).toBe(true);
    expect(region()).toEqual({ start: 0, end: 4 });
  });

  it('I then O mark a region between two places of the playhead', () => {
    useUiStore.getState().setTime(3);
    markRegionEdge('start');
    useUiStore.getState().setTime(5.5);
    markRegionEdge('end');
    expect(region()).toEqual({ start: 3, end: 5.5 });
    expect(said()).toBe('Region 3.00–5.50 s');
    // Each end moves alone while the other is on its side of the playhead.
    useUiStore.getState().setTime(4);
    markRegionEdge('start');
    expect(region()).toEqual({ start: 4, end: 5.5 });
    useUiStore.getState().setTime(5);
    markRegionEdge('end');
    expect(region()).toEqual({ start: 4, end: 5 });
  });

  it('O at the start of the scene marks nothing, and says so', () => {
    useTimelineStore.getState().setRegion({ start: 3, end: 5 });
    useUiStore.getState().setTime(0);
    expect(markRegionEdge('end')).toBe(false);
    expect(region()).toEqual({ start: 3, end: 5 });
    expect(said()).toBe('No region ends at the start of the scene');
  });

  it('removes the region, once', () => {
    useTimelineStore.getState().setRegion({ start: 3, end: 5 });
    expect(removeRegion()).toBe(true);
    expect(region()).toBeNull();
    expect(said()).toBe('Region removed');
    expect(removeRegion()).toBe(false);
  });
});
