/* The recordings an export mixes, held in the media store for as long as it runs: an original
 * that nothing else needs any more must not be collected under the encoder. Only what the mix
 * reads is held (a muted track's recordings are not part of it), and one the browser no longer
 * holds stops the export before anything is encoded, in words about the export. */
import type { AudioPlan } from '../../audio';
import {
  mediaLease,
  mediaOwnerId,
  mediaRepository,
  type MediaLease,
  type OriginalMediaRepository,
} from '../../media';
import type { AudioAsset } from '../../model';

type Recording = Pick<AudioAsset, 'name' | 'originalName'>;

/** A recording by its name and, when they differ, the file it came from: the one to import. */
const called = ({ name, originalName }: Recording) =>
  originalName && originalName !== name ? `“${name}” (${originalName})` : `“${name}”`;

/** The mix needs recordings the browser no longer holds (its storage was cleared or evicted, or
 * the project was saved without them). */
export class MissingRecordingsError extends Error {
  constructor(missing: readonly Recording[]) {
    const names = missing.slice(0, 3).map(called);
    if (missing.length > 3) names.push(`${missing.length - 3} more`);
    const listed =
      names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    super(
      missing.length === 1
        ? `The recording ${listed} is missing: the browser no longer holds its original audio. ` +
            'Import the same file again in the Audio tab, or mute its track, and export again.'
        : `${missing.length} recordings are missing: ${listed}. The browser no longer holds ` +
            'their original audio. Import the same files again in the Audio tab, or mute their ' +
            'tracks, and export again.',
    );
    this.name = 'MissingRecordingsError';
  }
}

/** Hold the recordings `plan` reads until the lease is released. */
export async function holdRecordings(
  plan: AudioPlan,
  repository: Pick<OriginalMediaRepository, 'pinAvailable' | 'releaseOwner'> = mediaRepository,
): Promise<MediaLease> {
  const ownerId = mediaOwnerId('export');
  const recordings = new Map(plan.clips.map((clip) => [clip.asset.contentHash, clip.asset]));
  // A silent mix reads nothing: the store is not asked.
  if (!recordings.size) return { ownerId, release: async () => undefined };
  const absent = new Set(await repository.pinAvailable(ownerId, [...recordings.keys()]));
  const lease = mediaLease(ownerId, repository);
  if (!absent.size) return lease;
  await lease.release().catch(() => undefined);
  throw new MissingRecordingsError(
    [...recordings.values()].filter((asset) => absent.has(asset.contentHash)),
  );
}
