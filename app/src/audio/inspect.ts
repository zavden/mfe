import { ALL_FORMATS, BlobSource, Input, type InputAudioTrack } from 'mediabunny';
import type { AudioMetadata } from './types';
import { mp3PresentationFrames } from './mp3';

export const SOURCE_CACHE_BYTES = 1024 * 1024;

/** Encoded packet tails may include codec padding. A gapless tag may shorten that tail, but
 * must never invent samples beyond the file's actual packet timeline. */
export function audioPresentationDuration(
  end: number,
  first: number,
  sampleRate: number,
  gaplessFrames: number | null,
): number {
  const readableDuration = end - Math.max(0, first);
  if (gaplessFrames !== null && gaplessFrames > Math.round(readableDuration * sampleRate) + 1) {
    throw new Error(
      'The audio file is incomplete: its duration metadata exceeds its available samples.',
    );
  }
  return gaplessFrames !== null ? gaplessFrames / sampleRate : readableDuration;
}

export function audioInput(blob: Blob): Input {
  return new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob, { maxCacheSize: SOURCE_CACHE_BYTES }),
  });
}

export async function requireAudioTrack(input: Input): Promise<InputAudioTrack> {
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error('This file does not contain an audio track.');
  if (!(await track.canDecode()))
    throw new Error('This browser cannot decode the audio in this file.');
  return track;
}

/** Reads metadata and checks the actual decoder, without decoding the complete recording. */
export async function inspectAudio(
  blob: Blob,
  options: { signal?: AbortSignal } = {},
): Promise<AudioMetadata> {
  const { signal } = options;
  signal?.throwIfAborted();
  const input = audioInput(blob);
  const abort = () => input.dispose();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const track = await requireAudioTrack(input);
    const [end, first, sampleRate, channels, codec] = await Promise.all([
      track.computeDuration(),
      track.getFirstTimestamp(),
      track.getSampleRate(),
      track.getNumberOfChannels(),
      track.getCodec(),
    ]);
    signal?.throwIfAborted();
    const gaplessFrames = codec === 'mp3' ? await mp3PresentationFrames(blob) : null;
    const duration = audioPresentationDuration(end, first, sampleRate, gaplessFrames);
    if (!(duration > 0) || !Number.isFinite(duration))
      throw new Error('This audio file has no finite playable duration.');
    if (sampleRate < 8000 || sampleRate > 192_000 || channels < 1 || channels > 8) {
      throw new Error('Audio must use 8–192 kHz and one to eight channels.');
    }
    return { duration, sampleRate, channels, codec: codec ?? 'unknown' };
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    input.dispose();
  }
}
