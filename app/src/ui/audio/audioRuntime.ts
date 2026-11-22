/* Shared browser audio resources. Original files remain owned by media/, decoded pages and
 * waveform summaries are bounded disposable caches outside the project store. */
import { create } from 'zustand';
import { createAudioEngine } from '../../audio';
import { createWaveform, waveformCache, type AudioWaveform } from '../../audio';
import { mediaRepository } from '../../media';
import type { AudioAsset } from '../../model';

export const useAudioMediaRevision = create<{ revision: number }>(() => ({ revision: 0 }));
export const refreshAudioMedia = () =>
  useAudioMediaRevision.setState((state) => ({ revision: state.revision + 1 }));

export const editorAudioEngine = createAudioEngine((asset) =>
  mediaRepository.getOriginal(asset.contentHash),
);

interface WaveformJob {
  controller: AbortController;
  users: number;
  result: Promise<AudioWaveform>;
}
const jobs = new Map<string, WaveformJob>();
let queue: Promise<unknown> = Promise.resolve();

/** Only one background waveform scans at a time. Several clip instances subscribe to the
 * same work; unused pending jobs cancel and completed promises do not retain evicted summaries. */
export function acquireWaveform(asset: AudioAsset): {
  result: Promise<AudioWaveform>;
  release(): void;
} {
  const cached = waveformCache.get(asset.contentHash);
  if (cached) return { result: Promise.resolve(cached), release() {} };
  let job = jobs.get(asset.contentHash);
  if (!job || job.controller.signal.aborted) {
    const controller = new AbortController();
    const created: WaveformJob = { controller, users: 0, result: Promise.resolve(null as never) };
    created.result = queue
      .catch(() => undefined)
      .then(() => {
        controller.signal.throwIfAborted();
        return createWaveform(asset, editorAudioEngine, { signal: controller.signal });
      })
      .finally(() => {
        if (jobs.get(asset.contentHash) === created) jobs.delete(asset.contentHash);
      });
    // Keep the scheduling tail fulfilled even if all consumers cancel a job.
    queue = created.result.then(
      () => undefined,
      () => undefined,
    );
    jobs.set(asset.contentHash, created);
    job = created;
  }
  job.users++;
  const owned = job;
  let released = false;
  return {
    result: owned.result,
    release() {
      if (released) return;
      released = true;
      if (--owned.users === 0) owned.controller.abort();
    },
  };
}
