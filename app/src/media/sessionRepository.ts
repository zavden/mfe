/* The media store of the page: the browser's database, and beside it what a page can keep in
 * memory where there is no database (storage blocked by a setting or a policy, a sandboxed
 * frame, some private windows).
 *
 * Only derived data goes to memory: the geometry of font texts, which the project file carries
 * and the companion can make again. A project with text then opens, draws and saves in any
 * browser. Recordings never do: until a package is saved their bytes exist nowhere else, so a
 * page that cannot store them says so instead of pretending. */
import { MediaStorageError } from './errors';
import { hashBlob } from './hash';
import {
  IndexedDbMediaRepository,
  type MediaOwner,
  type OriginalMediaRepository,
  type StoreOriginalOptions,
  type StoredOriginal,
} from './repository';

function unavailable(error: unknown): boolean {
  return error instanceof MediaStorageError && error.code === 'unavailable';
}

/** Originals a page keeps in memory, with the owners that hold them: the rules of the database,
 * for one page and for as long as it lives. */
class SessionOriginals {
  private readonly blobs = new Map<string, Blob>();
  private readonly owners = new Map<string, Set<string>>();

  has(contentHash: string): boolean {
    return this.blobs.has(contentHash);
  }

  get(contentHash: string): Blob | null {
    return this.blobs.get(contentHash) ?? null;
  }

  async store(blob: Blob, options: StoreOriginalOptions): Promise<StoredOriginal> {
    const contentHash = await hashBlob(blob, options);
    if (options.expectedHash !== undefined && options.expectedHash !== contentHash) {
      throw new MediaStorageError(
        'corrupt',
        'A project payload failed its content-integrity check.',
      );
    }
    if (!this.blobs.has(contentHash)) this.blobs.set(contentHash, blob);
    const held = this.owners.get(options.ownerId) ?? new Set<string>();
    held.add(contentHash);
    this.owners.set(options.ownerId, held);
    return { contentHash, byteLength: blob.size };
  }

  /** `ownerId` holds these and nothing else here (nothing: it is no owner here any more). */
  pin(ownerId: string, hashes: readonly string[]): void {
    if (hashes.length) this.owners.set(ownerId, new Set(hashes));
    else this.owners.delete(ownerId);
  }

  release(ownerId: string): void {
    this.owners.delete(ownerId);
  }

  collect(hashes?: readonly string[]): { removed: number; bytes: number } {
    const retained = new Set([...this.owners.values()].flatMap((held) => [...held]));
    let removed = 0;
    let bytes = 0;
    for (const hash of hashes ?? [...this.blobs.keys()]) {
      const blob = this.blobs.get(hash);
      if (!blob || retained.has(hash)) continue;
      this.blobs.delete(hash);
      removed++;
      bytes += blob.size;
    }
    return { removed, bytes };
  }
}

/** The database, with the page's memory for the derived data it cannot take. An original is
 * looked for in memory first: it is there only because the database refused it, and by its hash
 * it is the same bytes wherever it is. Owners are kept on both sides, each for what it holds. */
export class SessionFallbackRepository implements OriginalMediaRepository {
  private readonly durable: IndexedDbMediaRepository;
  private readonly session = new SessionOriginals();
  /** The last pin or release asked for each owner: a pin that waited for the database writes
   * memory only if nothing newer was asked for its owner meanwhile. */
  private readonly asked = new Map<string, number>();
  private turns = 0;

  private ask(ownerId: string): number {
    const turn = ++this.turns;
    this.asked.set(ownerId, turn);
    return turn;
  }

  constructor(durable: IndexedDbMediaRepository = new IndexedDbMediaRepository()) {
    this.durable = durable;
  }

  async getOriginal(contentHash: string): Promise<Blob | null> {
    return this.session.get(contentHash) ?? this.durable.getOriginal(contentHash);
  }

  async requireOriginal(contentHash: string): Promise<Blob> {
    return this.session.get(contentHash) ?? this.durable.requireOriginal(contentHash);
  }

  async storeOriginal(blob: Blob, options: StoreOriginalOptions): Promise<StoredOriginal> {
    try {
      return await this.durable.storeOriginal(blob, options);
    } catch (error) {
      if (!options.derived || !unavailable(error)) throw error;
      return this.session.store(blob, options);
    }
  }

  async pinOwner(ownerId: string, hashes: readonly string[]): Promise<void> {
    await this.pin(ownerId, hashes, true);
  }

  pinAvailable(
    ownerId: string,
    hashes: readonly string[],
    derived?: ReadonlySet<string>,
  ): Promise<string[]> {
    return this.pin(ownerId, hashes, false, derived);
  }

  private async pin(
    ownerId: string,
    hashes: readonly string[],
    complete: boolean,
    derived?: ReadonlySet<string>,
  ) {
    const turn = this.ask(ownerId);
    const here = hashes.filter((hash) => this.session.has(hash));
    const rest = hashes.filter((hash) => !this.session.has(hash));
    let missing: string[] = [];
    try {
      if (complete) await this.durable.pinOwner(ownerId, rest);
      else missing = await this.durable.pinAvailable(ownerId, rest);
    } catch (error) {
      if (!unavailable(error)) throw error;
      // No database. A complete pin fails on anything memory does not hold. Otherwise, what
      // memory does not hold of derived data is missing, and saying so loses nothing: it is in
      // no other place this page could reach. Of anything else (a recording) nobody can tell
      // whether it is stored, and the caller hears that.
      if (rest.some((hash) => complete || !derived?.has(hash))) throw error;
      missing = rest;
    }
    // A later pin of this owner, or its release, has the last word.
    if (this.asked.get(ownerId) === turn) this.session.pin(ownerId, here);
    return missing;
  }

  /** The hashes among these without an original. Only a look: it owns nothing. */
  async missingOriginals(hashes: readonly string[]): Promise<string[]> {
    const rest = hashes.filter((hash) => !this.session.has(hash));
    return rest.length ? this.durable.missingOriginals(rest) : [];
  }

  async releaseOwner(ownerId: string): Promise<void> {
    const turn = this.ask(ownerId);
    this.session.release(ownerId);
    try {
      await this.durable.releaseOwner(ownerId);
    } catch (error) {
      // No database: the owner held nothing there.
      if (!unavailable(error)) throw error;
    } finally {
      // An owner that is gone is forgotten; a pin still on its way finds no turn to match.
      if (this.asked.get(ownerId) === turn) this.asked.delete(ownerId);
    }
  }

  /** The owners of the database, which other pages share; memory has this page's alone. None
   * where there is no database: the collection pass then goes on to what memory holds. */
  async listOwners(): Promise<MediaOwner[]> {
    try {
      return await this.durable.listOwners();
    } catch (error) {
      if (!unavailable(error)) throw error;
      return [];
    }
  }

  releaseUnchanged(listed: readonly MediaOwner[]): Promise<string[]> {
    return this.durable.releaseUnchanged(listed);
  }

  async collectUnowned(hashes?: readonly string[]): Promise<{ removed: number; bytes: number }> {
    const here = this.session.collect(hashes);
    try {
      const there = await this.durable.collectUnowned(hashes);
      return { removed: here.removed + there.removed, bytes: here.bytes + there.bytes };
    } catch (error) {
      if (!unavailable(error)) throw error;
      return here;
    }
  }
}

export const mediaRepository = new SessionFallbackRepository();
