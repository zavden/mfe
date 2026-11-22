import { newId, type AudioAsset } from '../model';
import { checkMediaAbort, MediaStorageError } from './errors';
import { type MediaReadOptions } from './hash';
import { discardImportedMedia, mediaLease, mediaOwnerId, type MediaLease } from './ownership';
import { requestPersistentStorage } from './persistence';
import type { OriginalMediaRepository } from './repository';
import { mediaRepository } from './sessionRepository';

export interface AudioSourceInfo {
  duration: number;
  sampleRate: number;
  channels: number;
}

/** Decoding belongs to audio/. Keeping this callback injectable avoids a dependency cycle. */
export async function importAudioOriginal(
  file: Blob & { name?: string },
  inspect: (blob: Blob, signal?: AbortSignal) => Promise<AudioSourceInfo>,
  options: MediaReadOptions & {
    repository?: OriginalMediaRepository;
    /** Asks the browser to keep what was stored (`persistence.ts`). */
    persist?: () => unknown;
  } = {},
): Promise<{ asset: AudioAsset; lease: MediaLease }> {
  checkMediaAbort(options.signal);
  const info = await inspect(file, options.signal);
  checkMediaAbort(options.signal);
  if (
    !Number.isFinite(info.duration) ||
    info.duration <= 0 ||
    !Number.isSafeInteger(info.sampleRate) ||
    info.sampleRate <= 0 ||
    !Number.isSafeInteger(info.channels) ||
    info.channels <= 0
  ) {
    throw new MediaStorageError(
      'corrupt',
      'The audio source does not have a readable duration or sample format.',
    );
  }
  const repository = options.repository ?? mediaRepository;
  const ownerId = mediaOwnerId('import');
  const lease = mediaLease(ownerId, repository);
  let storedHash: string | undefined;
  try {
    const original = await repository.storeOriginal(file, { ...options, ownerId });
    storedHash = original.contentHash;
    void (options.persist ?? requestPersistentStorage)();
    checkMediaAbort(options.signal);
    const originalName = file.name || 'Audio';
    return {
      asset: {
        id: newId('s'),
        name: originalName.replace(/\.[^.]+$/, '') || originalName,
        originalName,
        mimeType: file.type || 'application/octet-stream',
        ...original,
        duration: info.duration,
        sampleRate: info.sampleRate,
        channels: info.channels,
      },
      lease,
    };
  } catch (error) {
    await discardImportedMedia(lease, storedHash ? [storedHash] : [], repository);
    throw error;
  }
}
