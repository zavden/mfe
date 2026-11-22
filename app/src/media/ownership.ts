import type { Project } from '../model';
import type { OriginalMediaRepository } from './repository';
import { mediaRepository } from './sessionRepository';
import { derivedMediaHashes, projectPayloads } from './dependencies';

let nextLease = 0;
const ownName = `p_${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let pageName = (): string => ownName;

/** Owners carry the name of the page that holds them. The app names its pages by their autosave
 * session (`ui/project/autosave.ts`), whose alive mark tells the other pages whether this one is
 * still there; left alone, a page has a name of its own that nobody can ask about. */
export function setMediaPage(name: () => string): void {
  pageName = name;
}

/** Different pages and concurrent saves/imports never replace each other's ownership. */
export function mediaOwnerId(kind: string): string {
  return `${kind}:${pageName()}:${++nextLease}`;
}

/** The kind and the page of an owner named as above (`kind:page:number`); null for any other
 * id. A recovery owner (`recovery:<record key>:<document>`) reads the same way. */
export function ownerPage(ownerId: string): { kind: string; page: string } | null {
  const match = /^([a-z-]+):(.+):\d+$/.exec(ownerId);
  return match ? { kind: match[1]!, page: match[2]! } : null;
}

export function projectMediaHashes(project: Project): string[] {
  return [...new Set(projectPayloads(project).map((asset) => asset.contentHash))].sort();
}

export interface MediaLease {
  readonly ownerId: string;
  release(): Promise<void>;
}

/** The caller releases only after another durable owner covers every required original. */
export function mediaLease(
  ownerId: string,
  repository: Pick<OriginalMediaRepository, 'releaseOwner'> = mediaRepository,
): MediaLease {
  let released: Promise<void> | undefined;
  return {
    ownerId,
    release: () => {
      released ??= repository.releaseOwner(ownerId).catch((error: unknown) => {
        released = undefined;
        throw error;
      });
      return released;
    },
  };
}

export async function pinProjectMedia(
  project: Project,
  ownerId = mediaOwnerId('pending'),
  repository: OriginalMediaRepository = mediaRepository,
): Promise<MediaLease> {
  await repository.pinOwner(ownerId, projectMediaHashes(project));
  return mediaLease(ownerId, repository);
}

/** As `pinProjectMedia`, for a project that may lack originals: the lease holds the ones that are
 * stored, and `missing` names the others. */
export async function pinAvailableProjectMedia(
  project: Project,
  ownerId = mediaOwnerId('pending'),
  repository: OriginalMediaRepository = mediaRepository,
): Promise<MediaLease & { missing: string[] }> {
  const missing = await repository.pinAvailable(
    ownerId,
    projectMediaHashes(project),
    derivedMediaHashes(project),
  );
  return { ...mediaLease(ownerId, repository), missing };
}

/** Abandoned imports may reclaim only their touched, now-unowned hashes. Cleanup failure keeps
 * the bytes and must not mask the original import/cancellation error. Other owners always win. */
export async function discardImportedMedia(
  lease: MediaLease,
  hashes: readonly string[],
  repository: OriginalMediaRepository = mediaRepository,
): Promise<void> {
  try {
    await lease.release();
    await repository.collectUnowned?.(hashes);
  } catch {
    // A failed release retains its owner; a failed collection retains unowned data for retry.
  }
}
