import type { AudioAsset } from '../model/types';
import { ByteBudgetCache } from './cache';
import { AUDIO_PAGE_FRAMES } from './engine';
import type { AudioReader } from './types';

export interface WaveformLevel {
  framesPerBin: number;
  min: Float32Array;
  max: Float32Array;
}

export interface AudioWaveform {
  contentHash: string;
  sampleRate: number;
  frameCount: number;
  levels: readonly WaveformLevel[];
}

export const waveformCache = new ByteBudgetCache<AudioWaveform>(16 * 1024 * 1024);

/** At most 65,536 base bins per recording; higher levels halve that count. The full pyramid
 * costs less than one MiB even for long recordings. It is derived data outside project history. */
export async function createWaveform(
  asset: AudioAsset,
  reader: AudioReader,
  options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<AudioWaveform> {
  reader = reader.backgroundReader ?? reader;
  const cached = waveformCache.get(asset.contentHash);
  if (cached) return cached;
  const frames = Math.round(asset.duration * asset.sampleRate);
  const framesPerBin = Math.max(256, 2 ** Math.ceil(Math.log2(Math.max(1, frames / 65536))));
  const bins = Math.ceil(frames / framesPerBin);
  const min = new Float32Array(bins);
  const max = new Float32Array(bins);
  for (let start = 0; start < frames; start += AUDIO_PAGE_FRAMES) {
    options.signal?.throwIfAborted();
    const pcm = await reader.read(
      asset,
      start,
      Math.min(AUDIO_PAGE_FRAMES, frames - start),
      options.signal,
    );
    for (let i = 0; i < pcm.channels[0].length; i++) {
      const bin = Math.floor((start + i) / framesPerBin);
      min[bin] = Math.min(min[bin]!, pcm.channels[0][i]!, pcm.channels[1][i]!);
      max[bin] = Math.max(max[bin]!, pcm.channels[0][i]!, pcm.channels[1][i]!);
    }
    options.onProgress?.(Math.min(1, (start + AUDIO_PAGE_FRAMES) / frames));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const levels: WaveformLevel[] = [{ framesPerBin, min, max }];
  while (levels.at(-1)!.min.length > 1) {
    const previous = levels.at(-1)!;
    const min = new Float32Array(Math.ceil(previous.min.length / 2));
    const max = new Float32Array(min.length);
    for (let i = 0; i < min.length; i++) {
      min[i] = Math.min(previous.min[2 * i]!, previous.min[2 * i + 1] ?? previous.min[2 * i]!);
      max[i] = Math.max(previous.max[2 * i]!, previous.max[2 * i + 1] ?? previous.max[2 * i]!);
    }
    levels.push({ framesPerBin: previous.framesPerBin * 2, min, max });
  }
  const waveform = {
    contentHash: asset.contentHash,
    sampleRate: asset.sampleRate,
    frameCount: frames,
    levels,
  };
  waveformCache.set(
    asset.contentHash,
    waveform,
    levels.reduce((sum, level) => sum + level.min.byteLength + level.max.byteLength, 0),
  );
  return waveform;
}

/** Returns only the visible source band at a resolution bounded by the viewport width. */
export function waveformBand(
  waveform: AudioWaveform,
  start: number,
  end: number,
  pixels: number,
): { min: Float32Array; max: Float32Array } {
  const width = Math.max(0, Math.min(8192, Math.ceil(pixels)));
  const min = new Float32Array(width);
  const max = new Float32Array(width);
  const startFrame = Math.max(0, start * waveform.sampleRate);
  const endFrame = Math.min(waveform.frameCount, end * waveform.sampleRate);
  if (!width || endFrame <= startFrame) return { min, max };
  const framesPerPixel = (endFrame - startFrame) / width;
  let level = waveform.levels[0]!;
  for (const candidate of waveform.levels)
    if (candidate.framesPerBin <= framesPerPixel) level = candidate;
  for (let x = 0; x < width; x++) {
    const from = Math.floor((startFrame + x * framesPerPixel) / level.framesPerBin);
    const to = Math.min(
      level.min.length,
      Math.ceil((startFrame + (x + 1) * framesPerPixel) / level.framesPerBin),
    );
    for (let bin = from; bin < to; bin++) {
      min[x] = Math.min(min[x]!, level.min[bin]!);
      max[x] = Math.max(max[x]!, level.max[bin]!);
    }
  }
  return { min, max };
}
