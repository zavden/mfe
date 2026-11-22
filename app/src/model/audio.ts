/* Pure audio time mapping and nondestructive clip/volume edits. No buffers, clocks or stores. */
import { newId } from './ids';
import { TIME_EPSILON } from './time';
import type { AudioClip, AudioVolumePoint, Project, TemporalClip, VisualTrack } from './types';

export const MAX_AUDIO_GAIN = 4;
/** The first audio workflow supports one hour; legacy visual projects keep their durations. */
export const AUDIO_PROJECT_DURATION_LIMIT = 60 * 60;

/** Map both ends of every half-open sample window through this same rule. A shared split
 * boundary therefore owns exactly one frame, without rounding each part's duration separately. */
export function audioFrameAt(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

export function audioSourceEnd(clip: Pick<AudioClip, 'sourceStart' | 'start' | 'end'>): number {
  return clip.sourceStart + (clip.end - clip.start);
}

export function audioSourceTime(
  clip: Pick<AudioClip, 'sourceStart' | 'start'>,
  timelineTime: number,
): number {
  return clip.sourceStart + (timelineTime - clip.start);
}

export function audioTimelineTime(
  clip: Pick<AudioClip, 'sourceStart' | 'start'>,
  sourceTime: number,
): number {
  return clip.start + (sourceTime - clip.sourceStart);
}

/** Linear amplitude interpolation; an empty curve is the default constant 100% line. */
export function audioGainAt(volume: readonly AudioVolumePoint[], sourceTime: number): number {
  if (volume.length === 0) return 1;
  const first = volume[0]!;
  if (sourceTime <= first.time) return first.gain;
  const last = volume[volume.length - 1]!;
  if (sourceTime >= last.time) return last.gain;
  let lo = 0;
  let hi = volume.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (volume[mid]!.time <= sourceTime) lo = mid;
    else hi = mid;
  }
  const a = volume[lo]!;
  const b = volume[hi]!;
  return a.gain + ((sourceTime - a.time) / (b.time - a.time)) * (b.gain - a.gain);
}

function gainInRange(gain: number): number {
  return Math.max(0, Math.min(MAX_AUDIO_GAIN, gain));
}

/** Inserting on the existing line changes no sound. An exact existing time edits that point. */
export function insertAudioVolumePoint(
  volume: readonly AudioVolumePoint[],
  sourceTime: number,
  gain = audioGainAt(volume, sourceTime),
): AudioVolumePoint[] {
  if (!Number.isFinite(sourceTime) || sourceTime < 0 || !Number.isFinite(gain)) return [...volume];
  const existing = volume.find((point) => point.time === sourceTime);
  const point = { id: existing?.id ?? newId('v'), time: sourceTime, gain: gainInRange(gain) };
  return [...volume.filter((item) => item !== existing), point].sort((a, b) => a.time - b.time);
}

/** Move a point without crossing its neighbours. Numeric controls and pointer gestures share
 * this edit; sourceDuration bounds offscreen points as well as the visible window. */
export function updateAudioVolumePoint(
  volume: readonly AudioVolumePoint[],
  id: string,
  fields: Partial<Pick<AudioVolumePoint, 'time' | 'gain'>>,
  sourceDuration = Infinity,
): AudioVolumePoint[] {
  const index = volume.findIndex((point) => point.id === id);
  if (index < 0) return [...volume];
  const point = volume[index]!;
  const previous = volume[index - 1];
  const next = volume[index + 1];
  const lo = previous ? previous.time + TIME_EPSILON : 0;
  const hi = next ? Math.min(sourceDuration, next.time - TIME_EPSILON) : sourceDuration;
  const time =
    fields.time !== undefined && Number.isFinite(fields.time) && hi >= lo
      ? Math.max(lo, Math.min(hi, fields.time))
      : point.time;
  const gain =
    fields.gain !== undefined && Number.isFinite(fields.gain)
      ? gainInRange(fields.gain)
      : point.gain;
  return volume.map((item, i) => (i === index ? { ...point, time, gain } : item));
}

export function deleteAudioVolumePoint(
  volume: readonly AudioVolumePoint[],
  id: string,
): AudioVolumePoint[] {
  return volume.filter((point) => point.id !== id);
}

/** Replace automation with one constant line. Changing a curve this way is an explicit edit. */
export function setAudioClipGain(clip: AudioClip, gain: number): AudioClip {
  if (!Number.isFinite(gain)) return clip;
  return {
    ...clip,
    volume: [{ id: clip.volume[0]?.id ?? newId('v'), time: 0, gain: gainInRange(gain) }],
  };
}

/** Translate an authored segment vertically by one shared delta, retaining its slope and all
 * point IDs/times. Exact interior points select the outgoing segment; constant extensions
 * move only their nearest endpoint. Hidden bounding points remain editable after a trim. */
export function shiftAudioVolumeSegment(
  clip: AudioClip,
  sourceTime: number,
  deltaGain: number,
): AudioClip {
  if (!Number.isFinite(sourceTime) || !Number.isFinite(deltaGain) || deltaGain === 0) return clip;
  const { volume } = clip;
  if (volume.length === 0) return setAudioClipGain(clip, 1 + deltaGain);
  let left = 0;
  let right = 0;
  if (sourceTime >= volume.at(-1)!.time) left = right = volume.length - 1;
  else if (sourceTime >= volume[0]!.time) {
    right = volume.findIndex((point) => point.time > sourceTime);
    left = right - 1;
  }
  const minimum = Math.min(volume[left]!.gain, volume[right]!.gain);
  const maximum = Math.max(volume[left]!.gain, volume[right]!.gain);
  const delta = Math.max(-minimum, Math.min(MAX_AUDIO_GAIN - maximum, deltaGain));
  if (delta === 0) return clip;
  return {
    ...clip,
    volume: volume.map((point, index) =>
      index === left || index === right ? { ...point, gain: point.gain + delta } : point,
    ),
  };
}

export interface AudioTrimLimits {
  /** Neighbour/scene limits on absolute timeline time. */
  minStart?: number;
  maxEnd?: number;
  minDuration?: number;
  /** Snap source boundaries to native frames; use the asset's sample rate for authored edits. */
  sampleRate?: number;
}

/** Trim or extend one edge, retaining the original source and every hidden volume point.
 * Apply pointer edits to the gesture's baseline clip, then publish the returned clip. */
export function trimAudioClip(
  clip: AudioClip,
  edge: 'start' | 'end',
  timelineTime: number,
  assetDuration: number,
  limits: AudioTrimLimits = {},
): AudioClip {
  if (!Number.isFinite(timelineTime) || !Number.isFinite(assetDuration)) return clip;
  const rate = limits.sampleRate && limits.sampleRate > 0 ? limits.sampleRate : null;
  const minDuration = Math.max(limits.minDuration ?? 0, rate ? 1 / rate : TIME_EPSILON);
  const sourceEnd = audioSourceEnd(clip);
  const lo =
    edge === 'start'
      ? Math.max(0, audioSourceTime(clip, Math.max(0, limits.minStart ?? 0)))
      : clip.sourceStart + minDuration;
  const hi =
    edge === 'start'
      ? sourceEnd - minDuration
      : Math.min(assetDuration, audioSourceTime(clip, limits.maxEnd ?? Infinity));
  if (hi < lo) return clip;
  let sourceTime = Math.max(lo, Math.min(hi, audioSourceTime(clip, timelineTime)));
  if (rate) {
    const firstFrame = Math.ceil(lo * rate - TIME_EPSILON);
    const lastFrame = Math.floor(hi * rate + TIME_EPSILON);
    if (lastFrame < firstFrame) return clip;
    sourceTime = Math.max(firstFrame, Math.min(lastFrame, audioFrameAt(sourceTime, rate))) / rate;
  }
  const time = audioTimelineTime(clip, sourceTime);
  return edge === 'start'
    ? { ...clip, start: time, sourceStart: sourceTime }
    : { ...clip, end: time };
}

export function moveAudioClip(clip: AudioClip, start: number, trackId = clip.trackId): AudioClip {
  if (!Number.isFinite(start) || start < 0) return clip;
  return { ...clip, start, end: start + (clip.end - clip.start), trackId };
}

/** The left half retains its clip/point IDs. The new right half owns copied points with fresh
 * IDs. Full curves are retained on both halves; no point/fade is invented at the cut. */
export function splitAudioClip(
  clip: AudioClip,
  timelineTime: number,
  sampleRate?: number,
): [AudioClip, AudioClip] | null {
  if (!Number.isFinite(timelineTime)) return null;
  let sourceTime = audioSourceTime(clip, timelineTime);
  if (sampleRate !== undefined && sampleRate > 0)
    sourceTime = audioFrameAt(sourceTime, sampleRate) / sampleRate;
  const time = audioTimelineTime(clip, sourceTime);
  if (time <= clip.start + TIME_EPSILON || time >= clip.end - TIME_EPSILON) return null;
  return [
    { ...clip, end: time, volume: clip.volume.map((point) => ({ ...point })) },
    {
      ...clip,
      id: newId('c'),
      start: time,
      sourceStart: sourceTime,
      volume: clip.volume.map((point) => ({ ...point, id: newId('v') })),
    },
  ];
}

export function duplicateAudioClip(
  clip: AudioClip,
  start = clip.start,
  trackId = clip.trackId,
): AudioClip {
  return {
    ...moveAudioClip(clip, start, trackId),
    id: newId('c'),
    volume: clip.volume.map((point) => ({ ...point, id: newId('v') })),
  };
}

/** Default edge fades meet at the midpoint of short clips instead of replacing each other. */
export function defaultAudioFadeDuration(clip: Pick<AudioClip, 'start' | 'end'>): number {
  return Math.min(0.5, (clip.end - clip.start) / 2);
}

/** Fade commands replace only the chosen interval's point records. Other points are retained;
 * changing an endpoint may change interpolation beyond it. Reapplying is sequential replacement,
 * never a separate multiplier or an attempt to identify an older fade elsewhere. */
export function setAudioFade(
  clip: AudioClip,
  direction: 'in' | 'out',
  duration: number,
): AudioClip {
  if (!Number.isFinite(duration) || duration <= 0) return clip;
  const length = Math.min(duration, clip.end - clip.start);
  if (length <= 0) return clip;
  const start = direction === 'in' ? clip.sourceStart : audioSourceEnd(clip) - length;
  const end = start + length;
  const fromGain = direction === 'in' ? 0 : audioGainAt(clip.volume, start);
  const toGain = direction === 'out' ? 0 : audioGainAt(clip.volume, end);
  const outside = clip.volume.filter((point) => point.time < start || point.time > end);
  const pointAt = (time: number, gain: number): AudioVolumePoint => ({
    id: clip.volume.find((point) => point.time === time)?.id ?? newId('v'),
    time,
    gain,
  });
  return {
    ...clip,
    volume: [...outside, pointAt(start, fromGain), pointAt(end, toGain)].sort(
      (a, b) => a.time - b.time,
    ),
  };
}

export function temporalClips(project: Pick<Project, 'clips' | 'audioClips'>): TemporalClip[] {
  return [
    ...project.clips.map(({ id, trackId, start, end }) => ({
      kind: 'visual' as const,
      id,
      trackId,
      start,
      end,
    })),
    ...project.audioClips.map(({ id, trackId, start, end }) => ({
      kind: 'audio' as const,
      id,
      trackId,
      start,
      end,
    })),
  ];
}

export function visualTracks(project: Pick<Project, 'tracks'>): VisualTrack[] {
  return project.tracks.filter((track): track is VisualTrack => track.kind === 'visual');
}

/** One projection for every Manim path: duration, validation, frame totals and companion
 * requests all see the same visual document. Explicit duration is kept. Visual-only projects
 * retain their identity, as do visual arrays/metadata in a projected project. */
export function visualProject(project: Project): Project {
  if (
    project.audioAssets.length === 0 &&
    project.audioClips.length === 0 &&
    project.tracks.every((track) => track.kind === 'visual')
  )
    return project;
  return { ...project, tracks: visualTracks(project), audioAssets: [], audioClips: [] };
}
