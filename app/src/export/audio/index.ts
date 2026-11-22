import { mixAudio, type AudioPlan } from '../../audio/plan';
import type { AudioReader } from '../../audio/types';
import type { VideoSink } from '../types';
import { createAudioEncoder } from './encoding';

export {
  canEncodeAac,
  soundBytesPerSecond,
  videoAudioEncoding,
  type AudioEncoding,
} from './encoding';
import { pcm16Bytes, wavHeader } from './wav';

export type AudioExportFormat = 'wav' | 'webm' | 'm4a';

export interface AudioExportOptions {
  format: AudioExportFormat;
  sink?: VideoSink | null;
  signal?: AbortSignal;
  onProgress?: (progress: {
    frame: number;
    totalFrames: number;
    peak: number;
    clippedSamples: number;
  }) => void;
}

/** The owner closes/aborts the real destination after checking document ownership. No visual
 * evaluator, canvas size, or video frame rate is involved in standalone audio export. */
export async function exportAudio(
  plan: AudioPlan,
  reader: AudioReader,
  options: AudioExportOptions,
): Promise<Blob | null> {
  const { signal, sink, format } = options;
  signal?.throwIfAborted();
  if (!plan.frameCount) throw new Error('Choose a nonempty audio export range.');
  const encoder =
    format === 'wav'
      ? null
      : await createAudioEncoder(format === 'm4a' ? 'mp4-aac' : 'webm-opus', { sink, signal });
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let position = 0;
  let peak = 0;
  let clippedSamples = 0;
  const write = async (bytes: Uint8Array<ArrayBuffer>) => {
    signal?.throwIfAborted();
    if (sink) await sink.write(bytes, position);
    else parts.push(bytes);
    position += bytes.length;
  };
  try {
    if (format === 'wav') await write(wavHeader(plan.frameCount, plan.sampleRate));
    for await (const block of mixAudio(plan, reader, { signal })) {
      if (encoder) await encoder.add(block);
      else await write(pcm16Bytes(block));
      peak = Math.max(peak, block.peak);
      clippedSamples += block.clippedSamples;
      options.onProgress?.({
        frame: block.startFrame + block.channels[0].length,
        totalFrames: plan.frameCount,
        peak,
        clippedSamples,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    const result = encoder
      ? await encoder.finalize()
      : sink
        ? null
        : new Blob(parts, { type: 'audio/wav' });
    signal?.throwIfAborted();
    return result;
  } catch (error) {
    await encoder?.cancel(error);
    throw error;
  }
}
