/* The sound of a video the companion makes (docs/COMPANION.md, "send the soundtrack"): the mix
 * of the audio plan as one WAV file — 16-bit PCM, stereo, 48 kHz, exactly as long as the video —
 * sent in order, in pieces, while it is mixed. The companion's ffmpeg encodes it next to the
 * video in a second pass (AAC in MP4 and MOV, Opus in WebM). */
import { mixAudio, type AudioPlan } from '../../audio/plan';
import { AUDIO_MIX_RATE, type AudioReader } from '../../audio/types';
import type { CompanionClient, CompanionJobKind } from '../../engine';
import { pcm16Bytes, wavHeader } from '../audio/wav';

/** What to mix, and what reads the recordings. */
export interface Soundtrack {
  plan: AudioPlan;
  reader: AudioReader;
}

export interface SoundProgress {
  /** Sample frames mixed so far, of `totalFrames`. */
  frame: number;
  totalFrames: number;
  /** Samples of the mix over full scale so far (they are clamped in the file). */
  clippedSamples: number;
}

/** Bytes per request: about 22 s of sound. Big enough to keep the connection busy, small enough
 * that cancelling is quick. The companion's own limit is respected as well. */
export const SOUND_REQUEST_BYTES = 4 * 1024 * 1024;

/** Sample frames of the soundtrack of a video of `frames` frames: what the companion expects. */
export function soundFrames(frames: number, fps: number): number {
  return Math.round((frames / fps) * AUDIO_MIX_RATE);
}

/** The plan must cover the video's frames exactly: the companion refuses any other length. */
export function assertCoversVideo(plan: AudioPlan, start: number, frames: number, fps: number) {
  if (
    plan.sampleRate !== AUDIO_MIX_RATE ||
    plan.frameCount !== soundFrames(frames, fps) ||
    Math.abs(plan.start - start) > 1e-8
  )
    throw new Error('Audio and video must use the same frame-quantized output range.');
}

export async function sendSoundtrack(
  client: CompanionClient,
  kind: CompanionJobKind,
  id: string,
  { plan, reader }: Soundtrack,
  onProgress: (progress: SoundProgress) => void,
  signal: AbortSignal,
  maxRequestBytes = SOUND_REQUEST_BYTES,
): Promise<void> {
  const limit = Math.max(1024, Math.min(SOUND_REQUEST_BYTES, maxRequestBytes));
  // The first request starts with the header: the companion checks it before it stores anything.
  let pending: Uint8Array<ArrayBuffer>[] = [wavHeader(plan.frameCount, plan.sampleRate)];
  let pendingBytes = pending[0]!.length;
  let offset = 0;
  const flush = async () => {
    const body = new Blob(pending, { type: 'application/octet-stream' });
    pending = [];
    pendingBytes = 0;
    await client.sendJobAudio(kind, id, offset, body, signal);
    offset += body.size;
  };
  let clippedSamples = 0;
  for await (const block of mixAudio(plan, reader, { signal })) {
    let bytes = pcm16Bytes(block);
    clippedSamples += block.clippedSamples;
    while (pendingBytes + bytes.length > limit) {
      const fits = limit - pendingBytes;
      pending.push(bytes.subarray(0, fits));
      bytes = bytes.subarray(fits);
      await flush();
    }
    pending.push(bytes);
    pendingBytes += bytes.length;
    onProgress({
      frame: block.startFrame + block.channels[0].length,
      totalFrames: plan.frameCount,
      clippedSamples,
    });
  }
  signal.throwIfAborted();
  if (pendingBytes > 0) await flush();
}
