import { checkMediaAbort, MediaStorageError, storageError } from './errors';
import { CONTENT_HASH_PATTERN, hashBlob, type MediaReadOptions } from './hash';

const DB_NAME = 'mfe-original-media';
const ORIGINALS = 'originals';
const OWNERS = 'owners';

interface OriginalRecord {
  contentHash: string;
  blob: Blob;
  createdAt: number;
}

export interface MediaOwner {
  id: string;
  hashes: string[];
  updatedAt: number;
}

export interface StoredOriginal {
  contentHash: string;
  byteLength: number;
}

export interface StoreOriginalOptions extends MediaReadOptions {
  /** A durable owner must exist before metadata becomes visible to the document. */
  ownerId: string;
  /** Package imports verify the declared identity before storing anything under it. */
  expectedHash?: string;
  /** Derived data that the project file carries (the geometry of a font text): where the
   * browser has no database, the page keeps it in memory instead of failing
   * (`sessionRepository.ts`). */
  derived?: boolean;
}

/** Small injectable contract used by packages, importers and ownership services. */
export interface OriginalMediaRepository {
  getOriginal(contentHash: string): Promise<Blob | null>;
  requireOriginal(contentHash: string): Promise<Blob>;
  storeOriginal(blob: Blob, options: StoreOriginalOptions): Promise<StoredOriginal>;
  pinOwner(ownerId: string, hashes: readonly string[]): Promise<void>;
  /** As `pinOwner`, for a project that may lack originals: the owner holds the ones that are
   * stored, and the hashes of the others are returned. `derived`: the hashes among them that are
   * derived data (`derivedMediaHashes`); only a store that can keep such data without the
   * database reads it (`sessionRepository.ts`). */
  pinAvailable(
    ownerId: string,
    hashes: readonly string[],
    derived?: ReadonlySet<string>,
  ): Promise<string[]>;
  releaseOwner(ownerId: string): Promise<void>;
  collectUnowned?(hashes?: readonly string[]): Promise<{ removed: number; bytes: number }>;
}

function checkHash(hash: string): void {
  if (!CONTENT_HASH_PATTERN.test(hash)) {
    throw new MediaStorageError('corrupt', 'The project payload has an invalid content identity.');
  }
}

function checkOwner(ownerId: string): void {
  if (!ownerId || ownerId.length > 1024) {
    throw new MediaStorageError('corrupt', 'The project payload has an invalid owner.');
  }
}

function succeeded<T>(
  request: IDBRequest<T>,
  run: (value: T) => void,
  fail: (error: unknown) => void,
): void {
  request.onsuccess = () => {
    try {
      run(request.result);
    } catch (error) {
      fail(error);
    }
  };
}

/** Every resolve follows transaction completion, including writes that fail at commit time. */
export class IndexedDbMediaRepository implements OriginalMediaRepository {
  private readonly dbName: string;
  private readonly factory: () => IDBFactory | undefined;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(options: { dbName?: string; indexedDB?: () => IDBFactory | undefined } = {}) {
    this.dbName = options.dbName ?? DB_NAME;
    this.factory = options.indexedDB ?? (() => globalThis.indexedDB);
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        const factory = this.factory();
        if (!factory) {
          throw new MediaStorageError(
            'unavailable',
            'This browser cannot keep project source data because local database storage is unavailable.',
          );
        }
        request = factory.open(this.dbName, 1);
      } catch (error) {
        reject(storageError(error));
        return;
      }
      let failed = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore(ORIGINALS, { keyPath: 'contentHash' });
        request.result.createObjectStore(OWNERS, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        if (failed) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(storageError(request.error));
      request.onblocked = () => {
        failed = true;
        reject(
          new MediaStorageError(
            'unavailable',
            'Another editor tab is blocking the project-source database. Close it and try again.',
          ),
        );
      };
    });
  }

  private transaction<T>(
    stores: string[],
    mode: IDBTransactionMode,
    run: (
      transaction: IDBTransaction,
      result: (value: T) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<T> {
    const execute = () => this.runTransaction(stores, mode, run);
    if (mode === 'readonly') return execute();
    // Reserve write order before opening a connection: an immediate document replacement must
    // not unpin its originals ahead of an earlier Save that is still opening its database.
    const result = this.mutationQueue.then(execute);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async runTransaction<T>(
    stores: string[],
    mode: IDBTransactionMode,
    run: (
      transaction: IDBTransaction,
      result: (value: T) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        // strict requests a durable commit where the browser implements the durability hint.
        transaction = db.transaction(stores, mode, { durability: 'strict' });
      } catch (error) {
        db.close();
        reject(storageError(error));
        return;
      }
      let value: T;
      let failure: unknown;
      const fail = (error: unknown) => {
        failure = error;
        try {
          transaction.abort();
        } catch {
          // Its abort/error event already owns the rejection.
        }
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(value);
      };
      transaction.onerror = (event) => {
        failure ??= (event.target as IDBRequest | null)?.error ?? transaction.error;
      };
      transaction.onabort = () => {
        db.close();
        reject(storageError(failure ?? transaction.error));
      };
      try {
        run(transaction, (next) => (value = next), fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  async getOriginal(contentHash: string): Promise<Blob | null> {
    checkHash(contentHash);
    return this.transaction([ORIGINALS], 'readonly', (transaction, result, fail) => {
      const request = transaction.objectStore(ORIGINALS).get(contentHash);
      request.onsuccess = () => {
        const record = request.result as OriginalRecord | undefined;
        if (record && (!record.blob || !Number.isSafeInteger(record.blob.size))) {
          fail(new MediaStorageError('corrupt', 'The stored project payload is damaged.'));
          return;
        }
        result(record?.blob ?? null);
      };
    });
  }

  async requireOriginal(contentHash: string): Promise<Blob> {
    const blob = await this.getOriginal(contentHash);
    if (!blob) {
      throw new MediaStorageError(
        'missing',
        'Project source data is missing from browser storage. Reimport the source or reopen its complete .mfe project.',
      );
    }
    return blob;
  }

  async storeOriginal(blob: Blob, options: StoreOriginalOptions): Promise<StoredOriginal> {
    checkOwner(options.ownerId);
    if (options.expectedHash !== undefined) checkHash(options.expectedHash);
    if (!Number.isSafeInteger(blob.size) || blob.size <= 0) {
      throw new MediaStorageError('corrupt', 'The project payload is empty or too large.');
    }
    const contentHash = await hashBlob(blob, options);
    if (options.expectedHash !== undefined && options.expectedHash !== contentHash) {
      throw new MediaStorageError(
        'corrupt',
        'A project payload failed its content-integrity check.',
      );
    }
    checkMediaAbort(options.signal);
    await this.transaction<void>([ORIGINALS, OWNERS], 'readwrite', (transaction, result, fail) => {
      const originals = transaction.objectStore(ORIGINALS);
      const owners = transaction.objectStore(OWNERS);
      const original = originals.get(contentHash);
      succeeded(
        original,
        () => {
          if (options.signal?.aborted) {
            fail(new MediaStorageError('cancelled', 'The source import was cancelled.'));
            return;
          }
          const existing = original.result as OriginalRecord | undefined;
          if (existing && existing.blob.size !== blob.size) {
            fail(
              new MediaStorageError(
                'corrupt',
                'The stored original has a conflicting byte length.',
              ),
            );
            return;
          }
          if (!existing) {
            originals.add({ contentHash, blob, createdAt: Date.now() } satisfies OriginalRecord);
          }
          const owner = owners.get(options.ownerId);
          succeeded(
            owner,
            () => {
              const previous = owner.result as MediaOwner | undefined;
              owners.put({
                id: options.ownerId,
                hashes: [...new Set([...(previous?.hashes ?? []), contentHash])].sort(),
                updatedAt: Date.now(),
              } satisfies MediaOwner);
              result(undefined);
            },
            fail,
          );
        },
        fail,
      );
    });
    return { contentHash, byteLength: blob.size };
  }

  /** Replacing an owner and verifying its entire set share one cross-tab transaction with GC. */
  async pinOwner(ownerId: string, hashes: readonly string[]): Promise<void> {
    await this.pin(ownerId, hashes, true);
  }

  /** A project's metadata outlives its originals (storage evicted, a file saved without them):
   * what is left still needs its owner, and what comes back needs another pin. */
  pinAvailable(ownerId: string, hashes: readonly string[]): Promise<string[]> {
    return this.pin(ownerId, hashes, false);
  }

  /** Resolves to the requested hashes without an original: none when `complete`, which fails
   * instead and leaves the owner as it was. */
  private pin(ownerId: string, hashes: readonly string[], complete: boolean): Promise<string[]> {
    checkOwner(ownerId);
    const unique = [...new Set(hashes)].sort();
    unique.forEach(checkHash);
    return this.transaction([ORIGINALS, OWNERS], 'readwrite', (transaction, result, fail) => {
      const missing = new Set<string>();
      const write = () => {
        transaction.objectStore(OWNERS).put({
          id: ownerId,
          hashes: unique.filter((hash) => !missing.has(hash)),
          updatedAt: Date.now(),
        } satisfies MediaOwner);
        result([...missing]);
      };
      if (unique.length === 0) {
        write();
        return;
      }
      let remaining = unique.length;
      for (const hash of unique) {
        const request = transaction.objectStore(ORIGINALS).getKey(hash);
        succeeded(
          request,
          () => {
            if (request.result === undefined) {
              if (complete) {
                fail(
                  new MediaStorageError(
                    'missing',
                    'Project source data is missing. Reimport it or reopen a complete .mfe project before saving.',
                  ),
                );
                return;
              }
              missing.add(hash);
            }
            if (--remaining === 0) write();
          },
          fail,
        );
      }
    });
  }

  /** The hashes among these without a stored original. Only a look: it owns nothing. */
  async missingOriginals(hashes: readonly string[]): Promise<string[]> {
    const unique = [...new Set(hashes)].sort();
    unique.forEach(checkHash);
    if (unique.length === 0) return [];
    return this.transaction([ORIGINALS], 'readonly', (transaction, result, fail) => {
      const missing: string[] = [];
      let remaining = unique.length;
      for (const hash of unique) {
        const request = transaction.objectStore(ORIGINALS).getKey(hash);
        succeeded(
          request,
          () => {
            if (request.result === undefined) missing.push(hash);
            if (--remaining === 0) result(missing);
          },
          fail,
        );
      }
    });
  }

  async releaseOwner(ownerId: string): Promise<void> {
    checkOwner(ownerId);
    await this.transaction<void>([OWNERS], 'readwrite', (transaction, result) => {
      transaction.objectStore(OWNERS).delete(ownerId);
      result(undefined);
    });
  }

  /** Release the owners that are still as they were listed, and return their ids. One that was
   * written again since then belongs to a page that is there after all, and stays. */
  async releaseUnchanged(listed: readonly MediaOwner[]): Promise<string[]> {
    listed.forEach((owner) => checkOwner(owner.id));
    if (listed.length === 0) return [];
    return this.transaction([OWNERS], 'readwrite', (transaction, result, fail) => {
      const owners = transaction.objectStore(OWNERS);
      const released: string[] = [];
      let remaining = listed.length;
      for (const owner of listed) {
        const request = owners.get(owner.id);
        succeeded(
          request,
          () => {
            const current = request.result as MediaOwner | undefined;
            if (current && current.updatedAt === owner.updatedAt) {
              owners.delete(owner.id);
              released.push(owner.id);
            }
            if (--remaining === 0) result(released);
          },
          fail,
        );
      }
    });
  }

  async listOwners(): Promise<MediaOwner[]> {
    return this.transaction([OWNERS], 'readonly', (transaction, result) => {
      const request = transaction.objectStore(OWNERS).getAll();
      request.onsuccess = () => result(request.result as MediaOwner[]);
    });
  }

  /** Originals have no age: only an owner, or the lack of every owner, decides (see
   * `collection.ts` for who releases the owners of pages that are gone). */
  async collectUnowned(hashes?: readonly string[]): Promise<{ removed: number; bytes: number }> {
    const candidates = hashes === undefined ? null : new Set(hashes);
    candidates?.forEach(checkHash);
    if (candidates?.size === 0) return { removed: 0, bytes: 0 };
    return this.transaction([OWNERS, ORIGINALS], 'readwrite', (transaction, result) => {
      const request = transaction.objectStore(OWNERS).getAll();
      request.onsuccess = () => {
        const retained = new Set((request.result as MediaOwner[]).flatMap((owner) => owner.hashes));
        const cursor = transaction.objectStore(ORIGINALS).openCursor();
        let removed = 0;
        let bytes = 0;
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) {
            result({ removed, bytes });
            return;
          }
          const original = entry.value as OriginalRecord;
          if (
            (!candidates || candidates.has(original.contentHash)) &&
            !retained.has(original.contentHash)
          ) {
            entry.delete();
            removed++;
            bytes += original.blob.size;
          }
          entry.continue();
        };
      };
    });
  }
}
