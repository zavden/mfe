// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  audioFrameAt,
  audioGainAt,
  audioSourceEnd,
  audioSourceTime,
  createAudioClip,
  createAudioTrack,
  defaultAudioFadeDuration,
  deleteAudioVolumePoint,
  duplicateAudioClip,
  insertAudioVolumePoint,
  MAX_AUDIO_GAIN,
  moveAudioClip,
  sceneDuration,
  soundTail,
  setAudioClipGain,
  setAudioFade,
  shiftAudioVolumeSegment,
  splitAudioClip,
  temporalClips,
  trimAudioClip,
  updateAudioVolumePoint,
  visualProject,
} from '../index';
import { audioProject } from './audioFixtures';
import { smallProject } from './fixtures';

describe('audio source windows', () => {
  it('moves timeline time while preserving source and volume coordinates', () => {
    const { clip } = audioProject();
    const moved = moveAudioClip(clip, 72, 'other');
    expect(moved).toMatchObject({ start: 72, end: 82, trackId: 'other', sourceStart: 30 });
    expect(moved.volume).toBe(clip.volume);
    expect(audioSourceTime(moved, 77)).toBe(35);
    expect(audioSourceEnd(moved)).toBe(40);
  });

  it('trims and restores both edges without losing offscreen curve points', () => {
    const { clip, asset } = audioProject();
    const left = trimAudioClip(clip, 'start', 12, asset.duration);
    expect(left).toMatchObject({ start: 12, end: 20, sourceStart: 32 });
    expect(audioSourceEnd(left)).toBe(40);
    const right = trimAudioClip(left, 'end', 17, asset.duration);
    expect(right).toMatchObject({ start: 12, end: 17, sourceStart: 32 });
    expect(right.volume).toBe(clip.volume);
    const restoredLeft = trimAudioClip(right, 'start', 10, asset.duration);
    const restored = trimAudioClip(restoredLeft, 'end', 20, asset.duration);
    expect(restored).toEqual(clip);
    expect(audioGainAt(restored.volume, 35)).toBe(0.5);
  });

  it('limits extension to original media, the timeline origin and neighbours', () => {
    const { clip, asset } = audioProject();
    expect(trimAudioClip(clip, 'start', -100, asset.duration).start).toBe(0);
    const nearSourceStart = { ...clip, sourceStart: 2 };
    expect(trimAudioClip(nearSourceStart, 'start', 0, asset.duration)).toMatchObject({
      start: 8,
      sourceStart: 0,
    });
    expect(trimAudioClip(clip, 'start', 0, asset.duration, { minStart: 8 }).start).toBe(8);
    expect(trimAudioClip(clip, 'end', 200, asset.duration).end).toBe(80);
    expect(trimAudioClip(clip, 'end', 200, asset.duration, { maxEnd: 25 }).end).toBe(25);
    expect(
      trimAudioClip(clip, 'start', 200, asset.duration, { minDuration: 0.1 }).start,
    ).toBeCloseTo(19.9);
  });

  it('keeps repeated trim/untrim on the native sample grid without accumulating drift', () => {
    const { clip, asset } = audioProject();
    let edited = clip;
    const options = { sampleRate: 44100 };
    for (let i = 0; i < 1000; i++) {
      edited = trimAudioClip(edited, 'start', 10 + 137 / 44100, asset.duration, options);
      expect(audioFrameAt(edited.sourceStart, 44100)).toBe(30 * 44100 + 137);
      edited = trimAudioClip(edited, 'start', 10, asset.duration, options);
    }
    expect(edited.start).toBeCloseTo(clip.start, 11);
    expect(edited.sourceStart).toBe(clip.sourceStart);
    expect(edited.end).toBe(clip.end);
    expect(edited.volume).toBe(clip.volume);
  });

  it.each([14.5, 15])('splits inside a ramp or at a point (%s) without changing sound', (cut) => {
    const { clip } = audioProject();
    clip.volume = insertAudioVolumePoint(clip.volume, 35, 0.7);
    const [left, right] = splitAudioClip(clip, cut, 48000)!;
    expect(left.end).toBe(right.start);
    expect(audioSourceEnd(left)).toBe(right.sourceStart);
    expect(audioSourceEnd(right)).toBe(audioSourceEnd(clip));
    expect(left.id).toBe(clip.id);
    expect(right.id).not.toBe(clip.id);
    const leftEndFrame = audioFrameAt(audioSourceEnd(left), 48000);
    const rightStartFrame = audioFrameAt(right.sourceStart, 48000);
    expect(leftEndFrame).toBe(rightStartFrame);
    for (let frame = leftEndFrame - 16; frame <= leftEndFrame + 16; frame++) {
      const part = frame < leftEndFrame ? left : right;
      const time = frame / 48000;
      expect(audioGainAt(part.volume, time)).toBe(audioGainAt(clip.volume, time));
    }
    right.volume[1]!.gain = 3;
    expect(left.volume[1]!.gain).toBe(0);
    expect(clip.volume[1]!.gain).toBe(0);
    expect(new Set([...left.volume, ...right.volume].map((point) => point.id)).size).toBe(
      left.volume.length + right.volume.length,
    );
  });

  it('rounds a split once, preserving the total half-open frame count', () => {
    const clip = createAudioClip('source', 'track', 0, 48001 / 48000);
    const [left, right] = splitAudioClip(clip, 0.333333333, 48000)!;
    const count = (piece: typeof clip) =>
      audioFrameAt(audioSourceEnd(piece), 48000) - audioFrameAt(piece.sourceStart, 48000);
    expect(count(left) + count(right)).toBe(48001);
    expect(splitAudioClip(clip, 0)).toBeNull();
    expect(splitAudioClip(clip, clip.end)).toBeNull();
  });

  it('duplicates editable state and IDs while sharing the original asset', () => {
    const { clip } = audioProject();
    const copy = duplicateAudioClip(clip, 25, 'music');
    expect(copy).toMatchObject({ assetId: clip.assetId, sourceStart: 30, start: 25, end: 35 });
    expect(copy.id).not.toBe(clip.id);
    copy.volume[0]!.gain = 3;
    expect(clip.volume[0]!.gain).toBe(0.5);
    expect(copy.volume.every((point, i) => point.id !== clip.volume[i]!.id)).toBe(true);
  });
});

describe('audio volume edits', () => {
  it.each([0.2, 0.8])('uses triangular default fades on a %s second clip', (duration) => {
    const clip = createAudioClip('asset', 'track', 2, 2 + duration, { sourceStart: 12 });
    const length = clip.end - clip.start;
    expect(defaultAudioFadeDuration(clip)).toBeCloseTo(duration / 2, 14);
    const fadeIn = setAudioFade(clip, 'in', defaultAudioFadeDuration(clip));
    const both = setAudioFade(fadeIn, 'out', defaultAudioFadeDuration(fadeIn));
    expect(both.volume).toHaveLength(3);
    expect(audioGainAt(both.volume, clip.sourceStart)).toBe(0);
    expect(audioGainAt(both.volume, clip.sourceStart + length / 4)).toBeCloseTo(0.5, 12);
    expect(audioGainAt(both.volume, clip.sourceStart + length / 2)).toBeCloseTo(1, 12);
    expect(audioGainAt(both.volume, clip.sourceStart + (length * 3) / 4)).toBeCloseTo(0.5, 12);
    expect(audioGainAt(both.volume, audioSourceEnd(clip))).toBe(0);
    expect(both).not.toHaveProperty('fadeIn');
    expect(both).not.toHaveProperty('fadeOut');
  });

  it('caps default fades at half a second while preserving explicit overlapping commands', () => {
    expect(defaultAudioFadeDuration(createAudioClip('asset', 'track', 0, 4))).toBe(0.5);
    const clip = createAudioClip('asset', 'track', 0, 0.2);
    const fadeIn = setAudioFade(clip, 'in', 0.2);
    const both = setAudioFade(fadeIn, 'out', 0.2);
    expect(both.volume.map(({ time, gain }) => ({ time, gain }))).toEqual([
      { time: 0, gain: 0 },
      { time: 0.2, gain: 0 },
    ]);
  });

  it.each([0, 1])('shifts both endpoints of a segment with gain difference %s', (difference) => {
    const { clip } = audioProject();
    clip.volume[1]!.gain = 0.5;
    clip.volume[2]!.gain = 0.5 + difference;
    const shifted = shiftAudioVolumeSegment(clip, 35, 0.25);
    expect(shifted.volume[1]!.gain).toBe(0.75);
    expect(shifted.volume[2]!.gain).toBe(0.75 + difference);
    expect(shifted.volume[2]!.gain - shifted.volume[1]!.gain).toBe(difference);
    expect(shifted.volume[0]).toBe(clip.volume[0]);
    expect(shifted.volume[3]).toBe(clip.volume[3]);
    expect(shifted.volume.map(({ id, time }) => ({ id, time }))).toEqual(
      clip.volume.map(({ id, time }) => ({ id, time })),
    );
    expect(clip.volume[1]!.gain).toBe(0.5);
    expect(clip.volume[2]!.gain).toBe(0.5 + difference);
  });

  it.each([
    { delta: 2, gains: [1, 4] },
    { delta: -2, gains: [0, 3] },
  ])(
    'clamps one shared segment delta at $delta without flattening its slope',
    ({ delta, gains }) => {
      const { clip } = audioProject();
      clip.volume[1]!.gain = 0.5;
      clip.volume[2]!.gain = 3.5;
      const shifted = shiftAudioVolumeSegment(clip, 35, delta);
      expect(shifted.volume.slice(1, 3).map((point) => point.gain)).toEqual(gains);
      expect(shifted.volume[2]!.gain - shifted.volume[1]!.gain).toBe(3);
      expect(shiftAudioVolumeSegment(shifted, 35, delta)).toBe(shifted);
    },
  );

  it('shifts only the nearest point for constant extensions outside the authored curve', () => {
    const { clip } = audioProject();
    const before = shiftAudioVolumeSegment(clip, 10, 0.5);
    expect(before.volume[0]).toEqual({ ...clip.volume[0]!, gain: 1 });
    expect(before.volume.slice(1)).toEqual(clip.volume.slice(1));
    const after = shiftAudioVolumeSegment(clip, 60, 0.25);
    expect(after.volume.at(-1)).toEqual({ ...clip.volume.at(-1)!, gain: 0.5 });
    expect(after.volume.slice(0, -1)).toEqual(clip.volume.slice(0, -1));
  });

  it('changes empty and single-point curves as constants while preserving an authored point', () => {
    const empty = createAudioClip('asset', 'track', 0, 10);
    const shifted = shiftAudioVolumeSegment(empty, 5, -0.25);
    expect(shifted.volume).toMatchObject([{ time: 0, gain: 0.75 }]);
    expect(audioGainAt(shifted.volume, 0)).toBe(0.75);
    expect(audioGainAt(shifted.volume, 10)).toBe(0.75);
    expect(empty.volume).toEqual([]);
    const single = { ...empty, volume: [{ id: 'constant', time: 7, gain: 0.5 }] };
    expect(shiftAudioVolumeSegment(single, 5, 0.25).volume).toEqual([
      { id: 'constant', time: 7, gain: 0.75 },
    ]);
    expect(shiftAudioVolumeSegment(single, 5, 99).volume[0]!.gain).toBe(MAX_AUDIO_GAIN);
    expect(shiftAudioVolumeSegment(empty, 5, 0)).toBe(empty);
    expect(shiftAudioVolumeSegment(single, Number.NaN, 1)).toBe(single);
    expect(shiftAudioVolumeSegment(single, 5, Number.POSITIVE_INFINITY)).toBe(single);
  });

  it('shifts the authored bounding points hidden beyond both trimmed edges', () => {
    const { clip, asset } = audioProject();
    const trimmed = trimAudioClip(
      trimAudioClip(clip, 'start', 12, asset.duration),
      'end',
      18,
      asset.duration,
    );
    const shifted = shiftAudioVolumeSegment(trimmed, 35, 0.25);
    expect(shifted).toMatchObject({ start: 12, end: 18, sourceStart: 32 });
    expect(shifted.volume[1]).toEqual({ ...clip.volume[1]!, gain: 0.25 });
    expect(shifted.volume[2]).toEqual({ ...clip.volume[2]!, gain: 1.25 });
    expect(shifted.volume[0]).toBe(clip.volume[0]);
    expect(shifted.volume[3]).toBe(clip.volume[3]);
    expect(audioGainAt(shifted.volume, 35)).toBe(0.75);
    const restored = trimAudioClip(
      trimAudioClip(shifted, 'start', 10, asset.duration),
      'end',
      20,
      asset.duration,
    );
    expect(restored.volume).toBe(shifted.volume);
    expect(restored.volume.map(({ id, time }) => ({ id, time }))).toEqual(
      clip.volume.map(({ id, time }) => ({ id, time })),
    );
  });

  it('holds endpoints and interpolates amplitude linearly', () => {
    const points = [
      { id: 'a', time: 3, gain: 0.5 },
      { id: 'b', time: 5, gain: 1.5 },
    ];
    expect(audioGainAt([], 100)).toBe(1);
    expect(audioGainAt(points, 0)).toBe(0.5);
    expect(audioGainAt(points, 4)).toBe(1);
    expect(audioGainAt(points, 9)).toBe(1.5);
  });

  it('inserts the interpolated gain without changing a ramp', () => {
    const { clip } = audioProject();
    const points = insertAudioVolumePoint(clip.volume, 33);
    expect(points.find((point) => point.time === 33)?.gain).toBeCloseTo(0.3);
    for (let time = 20; time <= 50; time += 0.25)
      expect(audioGainAt(points, time)).toBeCloseTo(audioGainAt(clip.volume, time), 14);
    const sameTime = insertAudioVolumePoint(points, 33, 2);
    expect(sameTime).toHaveLength(points.length);
    expect(sameTime.find((point) => point.time === 33)?.id).toBe(
      points.find((point) => point.time === 33)?.id,
    );
  });

  it('bounds numeric point moves and gain, and leaves the original intact', () => {
    const { clip } = audioProject();
    const points = updateAudioVolumePoint(clip.volume, 'volume_start', { time: 80, gain: 7 }, 100);
    expect(points[1]!.time).toBeLessThan(40);
    expect(points[1]!.gain).toBe(MAX_AUDIO_GAIN);
    expect(clip.volume[1]).toMatchObject({ time: 30, gain: 0 });
    const last = updateAudioVolumePoint(points, 'volume_after', { time: 120 }, 100);
    expect(last.at(-1)!.time).toBe(100);
    expect(deleteAudioVolumePoint(points, 'volume_start').map((point) => point.id)).not.toContain(
      'volume_start',
    );
  });

  it('edits fades as ordinary points and fits commands inside short clips', () => {
    const clip = createAudioClip('asset', 'track', 2, 2.05, { sourceStart: 12 });
    const fade = setAudioFade(clip, 'in', 1);
    expect(fade.volume.map(({ time, gain }) => ({ time, gain }))).toEqual([
      { time: 12, gain: 0 },
      { time: 12.05, gain: 1 },
    ]);
    expect(audioGainAt(fade.volume, 12.025)).toBeCloseTo(0.5);
    expect(fade).not.toHaveProperty('fadeIn');
    expect(setAudioClipGain(fade, 0.25).volume).toMatchObject([{ time: 0, gain: 0.25 }]);
  });

  it('retains outside records and applies overlapping fade commands sequentially', () => {
    const { clip } = audioProject();
    const first = setAudioFade(clip, 'in', 8);
    expect(first.volume.find((point) => point.id === 'volume_before')).toBe(clip.volume[0]);
    expect(first.volume.find((point) => point.id === 'volume_after')).toBe(clip.volume[3]);
    const second = setAudioFade(first, 'out', 4);
    expect(second.volume.some((point) => point.time === 38)).toBe(false);
    expect(second.volume.find((point) => point.time === 36)?.gain).toBeCloseTo(0.6);
    expect(second.volume.find((point) => point.time === 40)?.gain).toBe(0);
    expect(first.volume.find((point) => point.time === 38)?.gain).toBeCloseTo(0.8);
    expect(second.volume.filter((point) => point.time < 36)).toEqual(
      first.volume.filter((point) => point.time < 36),
    );
  });
});

describe('shared audio/visual timeline views', () => {
  it('includes muted/locked audio in automatic duration while retaining visual scope', () => {
    const project = smallProject();
    const track = createAudioTrack('Audio');
    track.muted = true;
    track.locked = true;
    project.tracks.unshift(track);
    project.audioClips.push(createAudioClip('asset', track.id, 4, 25));
    expect(sceneDuration(project)).toBe(25);
    expect(sceneDuration(project, 'visual')).toBe(6);
    // what a Manim render, which ends with the pictures, does not have
    expect(soundTail(project)).toBe(19);
    expect(soundTail(visualProject(project))).toBe(0);
    expect(soundTail({ ...project, meta: { ...project.meta, duration: 10 } })).toBe(0);
    const shorter = { ...project, audioClips: project.audioClips.map((c) => ({ ...c, end: 4 })) };
    expect(soundTail(shorter)).toBe(0);
    expect(temporalClips(project)).toEqual([
      ...project.clips.map(({ id, trackId, start, end }) => ({
        kind: 'visual',
        id,
        trackId,
        start,
        end,
      })),
      ...project.audioClips.map(({ id, trackId, start, end }) => ({
        kind: 'audio',
        id,
        trackId,
        start,
        end,
      })),
    ]);
    const visual = visualProject(project);
    expect(sceneDuration(visual)).toBe(6);
    expect(visual.clips).toBe(project.clips);
    expect(visual.formulas).toBe(project.formulas);
    expect(visual.relations).toBe(project.relations);
    expect(visual.audioClips).toEqual([]);
    expect(visual.audioAssets).toEqual([]);
    expect(visual.tracks.every((row) => row.kind === 'visual')).toBe(true);
    project.meta.duration = 3;
    expect(sceneDuration(project)).toBe(3);
    expect(sceneDuration(visualProject(project))).toBe(3);
  });

  it('preserves the identity of an already visual-only project', () => {
    const project = smallProject();
    expect(visualProject(project)).toBe(project);
  });
});
