import { AudioSampleSink, type AudioSample, type Input, type InputAudioTrack } from 'mediabunny';
import type { AudioAsset } from '../model/types';
import { ByteBudgetCache } from './cache';
import { stereoChannelWeights } from './channels';
import { audioInput, requireAudioTrack, SOURCE_CACHE_BYTES } from './inspect';
import {
  MissingOriginalError,
  type AudioPcm,
  type AudioReader,
  type AudioSourceResolver,
} from './types';

export const AUDIO_PCM_BUDGET_BYTES = 32 * 1024 * 1024;
export const AUDIO_PAGE_FRAMES = 32768;
export const AUDIO_MAX_READ_FRAMES = 262144;
export const AUDIO_MAX_READERS = 4;
const MAX_DECODED_SAMPLE_BYTES = 2 * 1024 * 1024;

interface Reader {
  key: string;
  contentHash: string;
  input: Input;
  track: InputAudioTrack;
  origin: number;
  nextFrame: number;
  decodedThrough: number;
  iterator: AsyncIterator<AudioSample> | null;
  sample: AudioSample | null;
}

export interface AudioEngine extends AudioReader {
  readonly stats: {
    cacheBytes: number;
    peakCacheBytes: number;
    readerCount: number;
    sourceCacheBudgetBytes: number;
    readerOpens: number;
    decoderSeeks: number;
    continuousPages: number;
  };
  clearCache(): void;
  dispose(): Promise<void>;
}

/** One globally budgeted cache and at most four incremental decoders. Reads serialize, so
 * simultaneous clips cannot each allocate an unbounded decoder/cache. A seek restarts only
 * that source reader, with the demuxer's codec-specific preroll. Adjacent pages reuse it. */
export function createAudioEngine(
  resolve: AudioSourceResolver,
  options: { pcmBudgetBytes?: number } = {},
): AudioEngine {
  const cache = new ByteBudgetCache<AudioPcm>(options.pcmBudgetBytes ?? AUDIO_PCM_BUDGET_BYTES);
  const readers = new Map<string, Reader>();
  let busy = false;
  const waiting: { priority: number; grant: (release: () => void) => void }[] = [];
  const idle: (() => void)[] = [];
  let pending = 0;
  let disposed = false;
  let readerOpens = 0;
  let decoderSeeks = 0;
  let continuousPages = 0;
  const releaseSlot = () => {
    if (!waiting.length) {
      busy = false;
      for (const resolve of idle.splice(0)) resolve();
      return;
    }
    const urgent = waiting.findIndex((item) => item.priority === 0);
    waiting.splice(urgent < 0 ? 0 : urgent, 1)[0]!.grant(releaseSlot);
  };
  const acquire = (priority: number) =>
    new Promise<() => void>((grant) => {
      if (!busy) {
        busy = true;
        grant(releaseSlot);
      } else waiting.push({ priority, grant });
    });

  const release = async (reader: Reader) => {
    reader.sample?.close();
    reader.sample = null;
    await reader.iterator?.return?.();
    reader.iterator = null;
    reader.input.dispose();
  };

  const readerFor = async (
    asset: AudioAsset,
    nextFrame: number,
    signal?: AbortSignal,
  ): Promise<Reader> => {
    const sameSource = [...readers.values()].filter(
      (reader) => reader.contentHash === asset.contentHash,
    );
    const nearest = sameSource.reduce<Reader | undefined>(
      (best, reader) =>
        !best || Math.abs(reader.nextFrame - nextFrame) < Math.abs(best.nextFrame - nextFrame)
          ? reader
          : best,
      undefined,
    );
    const oldest = readers.values().next().value;
    const found =
      sameSource.find((reader) => reader.nextFrame === nextFrame) ??
      (readers.size >= AUDIO_MAX_READERS
        ? nearest && Math.abs(nearest.nextFrame - nextFrame) <= AUDIO_PAGE_FRAMES * 2
          ? nearest
          : oldest?.contentHash === asset.contentHash
            ? oldest
            : undefined
        : undefined);
    if (found) {
      readers.delete(found.key);
      readers.set(found.key, found);
      return found;
    }
    signal?.throwIfAborted();
    const blob = await resolve(asset, signal);
    signal?.throwIfAborted();
    if (!blob) throw new MissingOriginalError(asset);
    while (readers.size >= AUDIO_MAX_READERS) {
      const [key, old] = readers.entries().next().value!;
      readers.delete(key);
      await release(old);
    }
    const input = audioInput(blob);
    const abort = () => input.dispose();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const track = await requireAudioTrack(input);
      const rate = await track.getSampleRate();
      if (rate !== asset.sampleRate)
        throw new Error(`The stored sample rate does not match ${asset.name}.`);
      if ((await track.getNumberOfChannels()) !== asset.channels)
        throw new Error(`The stored channel count does not match ${asset.name}.`);
      const reader: Reader = {
        key: `${asset.contentHash}:${readerOpens++}`,
        contentHash: asset.contentHash,
        input,
        track,
        origin: Math.max(0, await track.getFirstTimestamp()),
        nextFrame: -1,
        decodedThrough: -1,
        iterator: null,
        sample: null,
      };
      signal?.throwIfAborted();
      readers.set(reader.key, reader);
      return reader;
    } catch (error) {
      input.dispose();
      signal?.throwIfAborted();
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  };

  const page = async (
    asset: AudioAsset,
    pageIndex: number,
    signal?: AbortSignal,
  ): Promise<AudioPcm> => {
    const key = `${asset.contentHash}:${pageIndex}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const start = pageIndex * AUDIO_PAGE_FRAMES;
    const end = Math.min(Math.round(asset.duration * asset.sampleRate), start + AUDIO_PAGE_FRAMES);
    const channels = [
      new Float32Array(Math.max(0, end - start)),
      new Float32Array(Math.max(0, end - start)),
    ] as const;
    if (start < end) {
      const reader = await readerFor(asset, start, signal);
      const abort = () => reader.input.dispose();
      signal?.addEventListener('abort', abort, { once: true });
      try {
        if (!reader.iterator || reader.nextFrame !== start) {
          decoderSeeks++;
          reader.sample?.close();
          reader.sample = null;
          reader.decodedThrough = start;
          await reader.iterator?.return?.();
          reader.iterator = new AudioSampleSink(reader.track).samples(
            reader.origin + start / asset.sampleRate,
          );
        } else continuousPages++;
        while (true) {
          signal?.throwIfAborted();
          if (disposed) throw new DOMException('Audio engine disposed.', 'AbortError');
          if (!reader.sample) {
            const next = await reader.iterator.next();
            if (next.done) {
              if (reader.decodedThrough + 1 < end)
                throw new Error(
                  `The audio source ended before its declared duration: ${asset.name}. Reimport the original file.`,
                );
              break;
            }
            reader.sample = next.value;
          }
          const sample = reader.sample;
          if (sample.sampleRate !== asset.sampleRate)
            throw new Error('Changing sample rates within an audio file are unsupported.');
          if (sample.numberOfFrames * sample.numberOfChannels * 4 > MAX_DECODED_SAMPLE_BYTES)
            throw new Error('An audio packet exceeds the bounded decoder budget.');
          const sampleStart = Math.round((sample.timestamp - reader.origin) * asset.sampleRate);
          reader.decodedThrough = Math.max(
            reader.decodedThrough,
            sampleStart + sample.numberOfFrames,
          );
          if (sampleStart >= end) break;
          const from = Math.max(start, sampleStart);
          const to = Math.min(end, sampleStart + sample.numberOfFrames);
          if (to > from) {
            const scratch = new Float32Array(to - from);
            for (let channel = 0; channel < sample.numberOfChannels; channel++) {
              sample.copyTo(scratch, {
                format: 'f32-planar',
                planeIndex: channel,
                frameOffset: from - sampleStart,
                frameCount: to - from,
              });
              const [l, r] = stereoChannelWeights(sample.numberOfChannels, channel);
              for (let i = 0; i < scratch.length; i++) {
                channels[0][from - start + i]! += scratch[i]! * l;
                channels[1][from - start + i]! += scratch[i]! * r;
              }
            }
          }
          if (sampleStart + sample.numberOfFrames > end) break;
          sample.close();
          reader.sample = null;
        }
        reader.nextFrame = end;
      } catch (error) {
        readers.delete(reader.key);
        await release(reader).catch(() => undefined);
        signal?.throwIfAborted();
        throw error;
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    }
    const result: AudioPcm = { startFrame: start, sampleRate: asset.sampleRate, channels };
    cache.set(key, result, channels[0].byteLength + channels[1].byteLength);
    return result;
  };

  const read = async (
    asset: AudioAsset,
    startFrame: number,
    frameCount: number,
    signal?: AbortSignal,
    priority = 0,
  ): Promise<AudioPcm> => {
    if (
      !Number.isSafeInteger(startFrame) ||
      !Number.isSafeInteger(frameCount) ||
      frameCount < 0 ||
      frameCount > AUDIO_MAX_READ_FRAMES
    )
      throw new Error('Audio read exceeds the bounded window size.');
    if (disposed) throw new DOMException('Audio engine disposed.', 'AbortError');
    signal?.throwIfAborted();
    if (pending >= 32) throw new Error('Too many pending audio reads.');
    pending++;
    const unlock = await acquire(priority);
    try {
      signal?.throwIfAborted();
      if (disposed) throw new DOMException('Audio engine disposed.', 'AbortError');
      const start = Math.max(0, startFrame);
      const end = Math.max(
        start,
        Math.min(Math.round(asset.duration * asset.sampleRate), startFrame + frameCount),
      );
      const channels = [new Float32Array(end - start), new Float32Array(end - start)] as const;
      for (let position = start; position < end;) {
        const data = await page(asset, Math.floor(position / AUDIO_PAGE_FRAMES), signal);
        const offset = position - data.startFrame;
        const count = Math.min(data.channels[0].length - offset, end - position);
        if (count <= 0) throw new Error(`The audio source ended unexpectedly: ${asset.name}.`);
        channels[0].set(data.channels[0].subarray(offset, offset + count), position - start);
        channels[1].set(data.channels[1].subarray(offset, offset + count), position - start);
        position += count;
      }
      return { startFrame: start, sampleRate: asset.sampleRate, channels };
    } finally {
      pending--;
      unlock();
    }
  };
  return {
    get stats() {
      return {
        cacheBytes: cache.bytes,
        peakCacheBytes: cache.peakBytes,
        readerCount: readers.size,
        sourceCacheBudgetBytes: readers.size * SOURCE_CACHE_BYTES,
        readerOpens,
        decoderSeeks,
        continuousPages,
      };
    },
    read,
    backgroundReader: {
      read: (asset, startFrame, frameCount, signal) =>
        read(asset, startFrame, frameCount, signal, 1),
    },
    clearCache() {
      cache.clear();
    },
    async dispose() {
      disposed = true;
      for (const reader of readers.values()) reader.input.dispose();
      if (busy) await new Promise<void>((resolve) => idle.push(resolve));
      await Promise.all([...readers.values()].map(release));
      readers.clear();
      cache.clear();
    },
  };
}
