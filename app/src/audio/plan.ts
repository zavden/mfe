import { audioGainAt, audioSourceEnd, sceneDuration, TIME_EPSILON } from '../model';
import type { AudioAsset, AudioVolumePoint, Project } from '../model/types';
import { resampleRadius, resampleStereo } from './resample';
import { AUDIO_BLOCK_FRAMES, AUDIO_MIX_RATE, type AudioMixBlock, type AudioReader } from './types';

export interface PlannedAudioClip {
  id: string;
  asset: AudioAsset;
  startFrame: number;
  endFrame: number;
  /** Native sample position at output frame zero. Absolute coordinates prevent block drift. */
  sourceBaseFrame: number;
  volume: readonly AudioVolumePoint[];
}

/** The longest range an export mixes into a file: one hour (the companion takes no longer
 * soundtrack, and that much WAV is 659 MiB). Playback has no such bound: it mixes the scene block
 * by block, whatever its length. */
export const AUDIO_EXPORT_SECONDS = 60 * 60;

export interface AudioPlan {
  start: number;
  duration: number;
  sampleRate: number;
  frameCount: number;
  clips: readonly PlannedAudioClip[];
}

/** Capture the same audible semantics for preview, browser video, and standalone audio. The
 * range may have any length: what bounds a file is the exporter's to check (see
 * `AUDIO_EXPORT_SECONDS`), and playback goes on for as long as the scene does.
 * `unavailable` names the originals (by content hash) that are known to be missing: their
 * clips are left out, so that the rest of the scene plays, and the range stays as it was. An
 * export does not pass it: there a missing original is an error, not silence. */
export function createAudioPlan(
  project: Project,
  options: {
    start?: number;
    end?: number;
    duration?: number;
    unavailable?: ReadonlySet<string>;
  } = {},
): AudioPlan {
  const start = options.start ?? 0;
  const duration = options.duration ?? (options.end ?? sceneDuration(project)) - start;
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 0)
    throw new Error('An audio range needs a start and a length that are finite and not negative.');
  const sampleRate = AUDIO_MIX_RATE;
  const frameCount = Math.round(duration * sampleRate);
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  const assets = new Map(project.audioAssets.map((asset) => [asset.id, asset]));
  const clips: PlannedAudioClip[] = [];
  for (const clip of project.audioClips) {
    const startFrame = Math.max(0, Math.round((clip.start - start) * sampleRate));
    const endFrame = Math.min(frameCount, Math.round((clip.end - start) * sampleRate));
    if (startFrame >= endFrame) continue;
    const track = tracks.get(clip.trackId);
    if (!track || track.kind !== 'audio')
      throw new Error(`Audio clip ${clip.id} needs an existing audio track.`);
    if (track.muted) continue;
    const asset = assets.get(clip.assetId);
    if (!asset) throw new Error(`The audio asset for clip ${clip.id} is missing.`);
    if (options.unavailable?.has(asset.contentHash)) continue;
    const sourceEnd = audioSourceEnd(clip);
    if (
      !Number.isFinite(clip.sourceStart) ||
      clip.sourceStart < 0 ||
      !Number.isFinite(sourceEnd) ||
      sourceEnd > asset.duration + TIME_EPSILON
    )
      throw new Error(
        `The source window for audio clip ${clip.id} is invalid for ${asset.name}. ` +
          'Trim the clip to its original source.',
      );
    clips.push({
      id: clip.id,
      asset,
      startFrame,
      endFrame,
      sourceBaseFrame: (clip.sourceStart + start - clip.start) * asset.sampleRate,
      volume: clip.volume.map((point) => ({ ...point })),
    });
  }
  return { start, duration: frameCount / sampleRate, sampleRate, frameCount, clips };
}

/** Mixer-owned memory is bounded by one output block, one source window and its filter halo. */
export async function mixAudioBlock(
  plan: AudioPlan,
  reader: AudioReader,
  startFrame: number,
  count = AUDIO_BLOCK_FRAMES,
  options: { signal?: AbortSignal } = {},
): Promise<AudioMixBlock> {
  const { signal } = options;
  signal?.throwIfAborted();
  if (
    !Number.isSafeInteger(startFrame) ||
    startFrame < 0 ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > 16384
  )
    throw new Error('Invalid bounded audio mix block.');
  const end = Math.min(plan.frameCount, startFrame + count);
  const length = Math.max(0, end - startFrame);
  const channels = [new Float32Array(length), new Float32Array(length)] as const;
  for (const clip of plan.clips) {
    const from = Math.max(startFrame, clip.startFrame);
    const to = Math.min(end, clip.endFrame);
    if (from >= to) continue;
    signal?.throwIfAborted();
    const rate = clip.asset.sampleRate;
    const step = rate / plan.sampleRate;
    const sourceStart = clip.sourceBaseFrame + from * step;
    const sourceEnd = clip.sourceBaseFrame + (to - 1) * step;
    const halo = resampleRadius(rate, plan.sampleRate);
    const readStart = Math.max(0, Math.floor(sourceStart) - halo);
    const readEnd = Math.min(
      Math.round(clip.asset.duration * rate),
      Math.ceil(sourceEnd) + halo + 1,
    );
    const pcm = await reader.read(clip.asset, readStart, Math.max(0, readEnd - readStart), signal);
    const samples = resampleStereo(pcm, sourceStart, step, to - from, plan.sampleRate);
    for (let i = 0; i < to - from; i++) {
      const gain = audioGainAt(clip.volume, (clip.sourceBaseFrame + (from + i) * step) / rate);
      channels[0][from - startFrame + i]! += samples[0][i]! * gain;
      channels[1][from - startFrame + i]! += samples[1][i]! * gain;
    }
  }
  let peak = 0;
  let clippedSamples = 0;
  for (const channel of channels)
    for (const value of channel) {
      peak = Math.max(peak, Math.abs(value));
      if (Math.abs(value) > 1) clippedSamples++;
    }
  signal?.throwIfAborted();
  return { startFrame, sampleRate: plan.sampleRate, channels, peak, clippedSamples };
}

export async function* mixAudio(
  plan: AudioPlan,
  reader: AudioReader,
  options: { signal?: AbortSignal; startFrame?: number; endFrame?: number } = {},
): AsyncGenerator<AudioMixBlock> {
  const end = Math.min(plan.frameCount, options.endFrame ?? plan.frameCount);
  for (let frame = options.startFrame ?? 0; frame < end; frame += AUDIO_BLOCK_FRAMES) {
    yield await mixAudioBlock(
      plan,
      reader,
      frame,
      Math.min(AUDIO_BLOCK_FRAMES, end - frame),
      options,
    );
  }
}
