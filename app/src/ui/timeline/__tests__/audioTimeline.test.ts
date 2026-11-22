// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createClip, createFormula, createTrack } from '../../../model';
import { audioProject } from '../../../model/__tests__/audioFixtures';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { pruneSelection } from '../../selection';
import { duplicateAudioClips, placeAudio } from '../audioCommands';
import { splitAtPlayhead } from '../splitActions';
import { constrainMove, deleteTrack } from '../clipOps';
import { moveItem, nudgedClip, tabStop } from '../keyboardNav';
import { clipsInRect } from '../marquee';
import { lowestZoom, wholeZoom } from '../ruler';
import { tracksLayout } from '../trackLayout';

beforeEach(() => {
  history.clear();
  useUiStore.setState({ selection: { kind: 'none' }, time: 0, playing: false });
});

describe('typed timeline integration', () => {
  it('places selected source intervals at the playhead on compatible unlocked rows', () => {
    const { project, asset, track } = audioProject();
    const added = placeAudio(project, asset.id, 25, 60, 65)!;
    expect(added).toMatchObject({ start: 25, end: 30, sourceStart: 60, trackId: track.id });
    const layered = placeAudio(project, asset.id, 26, 0, 5)!;
    expect(layered.trackId).not.toBe(track.id);
    expect(project.tracks.find((row) => row.id === layered.trackId)?.kind).toBe('audio');
    expect(placeAudio(project, asset.id, 3599, 0, 5)).toBeNull();
    expect(placeAudio(project, asset.id, 0, 0, 101)).toBeNull();
    expect(placeAudio(project, asset.id, 0, 0, 5, project.tracks[0]!.id)).toBeNull();
  });

  it('moves mixed selections by one constrained offset and refuses incompatible destinations', () => {
    const { project, clip, track } = audioProject();
    const formula = createFormula();
    const visual = createClip(formula.id, project.tracks[0]!.id, 10, 20);
    project.formulas.push(formula);
    project.clips.push(visual);
    const moves = [visual, clip].map((item) => ({ clip: item, trackId: item.trackId }));
    expect(constrainMove(project, moves, -12)).toBe(-10);
    expect(constrainMove(project, moves, 4000)).toBe(3580);
    expect(constrainMove(project, [{ clip: visual, trackId: track.id }], 1)).toBeNull();
    expect(nudgedClip(project, clip, 0, -1)).toMatchObject({ ok: false });
  });

  it('navigates, selects and deletes audio rows without changing the Creator original', () => {
    const { project, clip, asset, track } = audioProject();
    const formula = createFormula();
    const visual = createClip(formula.id, project.tracks[0]!.id, 0, 5);
    project.formulas.push(formula);
    project.clips.push(visual);
    const layout = tracksLayout(project);
    const selection = { kind: 'clips' as const, ids: [clip.id] };
    expect(pruneSelection(selection, project)).toBe(selection);
    expect(tabStop(selection, project)).toEqual({ kind: 'clip', clipId: clip.id });
    expect(moveItem('ArrowDown', { kind: 'clip', clipId: visual.id }, project, layout)).toEqual({
      kind: 'clip',
      clipId: clip.id,
    });
    expect(clipsInRect(project, layout, { t0: 11, t1: 12, y0: 46, y1: 150 })).toContain(clip.id);
    deleteTrack(project, track.id);
    expect(project.audioClips).toEqual([]);
    expect(project.audioAssets).toEqual([asset]);
    expect(project.clips).toEqual([visual]);
  });

  it('splits a ramp as one undo operation and shares only the immutable source', () => {
    const { project, clip } = audioProject();
    loadProject(project);
    useUiStore.setState({ time: 15, selection: { kind: 'clips', ids: [clip.id] } });
    splitAtPlayhead();
    const current = useProjectStore.getState().project;
    expect(current.audioClips.map((item) => [item.start, item.end, item.sourceStart])).toEqual([
      [10, 15, 30],
      [15, 20, 35],
    ]);
    expect(current.audioAssets).toBe(project.audioAssets);
    history.undo();
    expect(useProjectStore.getState().project).toBe(project);
  });

  it('duplicates editable audio while preserving the source curve and skipping locked rows', () => {
    const { project, clip, track } = audioProject();
    const copies = duplicateAudioClips(project, new Set([clip.id]));
    expect(copies[0]).toMatchObject({ start: 20, end: 30, sourceStart: 30, assetId: clip.assetId });
    expect(copies[0]!.volume.map((point) => point.gain)).toEqual(
      clip.volume.map((point) => point.gain),
    );
    track.locked = true;
    expect(duplicateAudioClips(project, new Set([clip.id]))).toEqual([]);
  });

  it('deletes a locked audio row as it does a locked visual one: the lock is for its clips', () => {
    const { project, asset, track } = audioProject();
    const visual = project.tracks.find((row) => row.kind === 'visual')!;
    visual.locked = true;
    deleteTrack(project, visual.id);
    expect(project.tracks).not.toContain(visual);
    expect(project.tracks).toContain(track);
    track.locked = true;
    deleteTrack(project, track.id);
    expect(project.tracks).not.toContain(track);
    expect(project.audioClips).toEqual([]);
    // The recording stays in the project: only its place on the timeline went.
    expect(project.audioAssets).toEqual([asset]);
  });

  it('fits a 60-minute timeline without changing short scene zoom limits', () => {
    expect(wholeZoom(3600, 900) * 3600).toBeCloseTo(899.5, 6);
    expect(lowestZoom(3600, 900)).toBe(wholeZoom(3600, 900));
    expect(lowestZoom(15, 900)).toBe(8);
    const { project } = audioProject();
    project.tracks.push(createTrack('More visuals'));
    expect(tracksLayout(project).rows.map((row) => row.height)).toEqual([46, 46, 112, 46]);
  });
});
