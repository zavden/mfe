import type { AudioAsset } from '../model/types';

export const AUDIO_MIX_RATE = 48_000;
export const AUDIO_BLOCK_FRAMES = 4096;

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  channels: number;
  codec: string;
}

/** The original of a recording is not in the media store: there is nothing to decode. */
export class MissingOriginalError extends Error {
  readonly contentHash: string;

  constructor(asset: Pick<AudioAsset, 'name' | 'contentHash'>) {
    super(`Original audio is missing: ${asset.name}. Reimport the original file.`);
    this.name = 'MissingOriginalError';
    this.contentHash = asset.contentHash;
  }
}

export type AudioSourceResolver = (asset: AudioAsset, signal?: AbortSignal) => Promise<Blob | null>;

/** Native-rate, planar stereo samples. Coordinates always refer to the original source. */
export interface AudioPcm {
  startFrame: number;
  sampleRate: number;
  channels: readonly [Float32Array, Float32Array];
}

export interface AudioReader {
  read(
    asset: AudioAsset,
    startFrame: number,
    frameCount: number,
    signal?: AbortSignal,
  ): Promise<AudioPcm>;
  /** Background analysis yields its next read to every queued preview/export request. */
  readonly backgroundReader?: AudioReader;
}

export interface AudioMixBlock extends AudioPcm {
  peak: number;
  clippedSamples: number;
}
