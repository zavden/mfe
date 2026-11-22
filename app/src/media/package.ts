import { parseProject, serializeProject, type ParseResult, type Project } from '../model';
import { checkMediaAbort, MediaStorageError, UnopenedProjectError } from './errors';
import { CONTENT_HASH_PATTERN, MEDIA_CHUNK_BYTES, type MediaReadOptions } from './hash';
import {
  discardImportedMedia,
  mediaLease,
  mediaOwnerId,
  pinAvailableProjectMedia,
  pinProjectMedia,
  type MediaLease,
} from './ownership';
import { requestPersistentStorage } from './persistence';
import type { OriginalMediaRepository } from './repository';
import { mediaRepository } from './sessionRepository';
import { projectPayloads, textGeometryReferences, type ProjectPayload } from './dependencies';
import { readTextGeometryBlob } from './textGeometry';

export const PACKAGE_EXTENSION = '.mfe';
export const PACKAGE_MIME_TYPE = 'application/vnd.manim-formula-editor';
export const PACKAGE_VERSION = 1;
export const PACKAGE_HEADER_BYTES = 16;
export const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
/** How many payloads a package may declare, carried or missing. Every payload costs an import
 * its own durable transaction, and a manifest of the size above could declare tens of thousands
 * of one-byte ones; no project comes near this many recordings. */
export const MAX_PACKAGE_PAYLOADS = 4096;
const MAGIC = new TextEncoder().encode('MFEPACK\n');
const PACKAGE_FORMAT = 'manim-formula-editor-package';
const MAX_MIME_TYPE_LENGTH = 256;

export interface PackageMediaEntry {
  contentHash: string;
  byteLength: number;
  /** Offset relative to the first payload byte, after the UTF-8 manifest. */
  offset: number;
  mimeType: string;
}

interface PackageManifest {
  format: typeof PACKAGE_FORMAT;
  version: typeof PACKAGE_VERSION;
  project: unknown;
  media: PackageMediaEntry[];
  /** The declared payloads this package was written without, by hash (see `preparePackage`).
   * Absent from a complete package. */
  missing?: string[];
}

export type ParsedProject = Extract<ParseResult, { ok: true }>;

export interface ReadPackageManifest {
  parsed: ParsedProject;
  media: PackageMediaEntry[];
  /** Hashes of the declared payloads the package says it does not carry. */
  missing: string[];
  payloadOffset: number;
}

function invalid(message: string): never {
  throw new MediaStorageError('corrupt', `The .mfe project is damaged or unsupported: ${message}`);
}

function checkedAdd(a: number, b: number): number {
  const total = a + b;
  if (!Number.isSafeInteger(total) || total < 0) invalid('its byte ranges are too large.');
  return total;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Listings read at most the header and bounded manifest, never any original payload. */
export async function readPackageManifest(blob: Blob): Promise<ReadPackageManifest> {
  if (blob.size < PACKAGE_HEADER_BYTES) invalid('the header is incomplete.');
  const header = new Uint8Array(await blob.slice(0, PACKAGE_HEADER_BYTES).arrayBuffer());
  if (!MAGIC.every((byte, index) => header[index] === byte))
    invalid('its signature is not recognized.');
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (view.getUint32(8, true) !== PACKAGE_VERSION)
    invalid('its container version is not supported.');
  const manifestLength = view.getUint32(12, true);
  if (manifestLength === 0 || manifestLength > MAX_MANIFEST_BYTES)
    invalid('its manifest is too large.');
  const payloadOffset = PACKAGE_HEADER_BYTES + manifestLength;
  if (payloadOffset > blob.size) invalid('its manifest is incomplete.');
  let raw: unknown;
  try {
    const bytes = await blob.slice(PACKAGE_HEADER_BYTES, payloadOffset).arrayBuffer();
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    invalid('its manifest is not valid UTF-8 JSON.');
  }
  if (!record(raw) || raw.format !== PACKAGE_FORMAT || raw.version !== PACKAGE_VERSION) {
    invalid('its manifest format is not recognized.');
  }
  if (!Array.isArray(raw.media)) invalid('its media index is missing.');
  const declared = raw.media.length + (Array.isArray(raw.missing) ? raw.missing.length : 0);
  if (declared > MAX_PACKAGE_PAYLOADS)
    invalid(`it declares more than ${MAX_PACKAGE_PAYLOADS} payloads.`);
  const parsed = parseProject(JSON.stringify(raw.project));
  if (!parsed.ok) {
    // The container is whole. A project in it that this app does not open says why itself, as a
    // `.mfe.json` does; what is no project at all is a package that is not one.
    if (parsed.isProject) throw new UnopenedProjectError(parsed.error, parsed.details);
    invalid(parsed.error);
  }
  const media: PackageMediaEntry[] = [];
  let nextOffset = 0;
  let previousHash = '';
  for (const entry of raw.media) {
    if (
      !record(entry) ||
      typeof entry.contentHash !== 'string' ||
      !CONTENT_HASH_PATTERN.test(entry.contentHash) ||
      entry.contentHash <= previousHash ||
      typeof entry.byteLength !== 'number' ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength <= 0 ||
      entry.offset !== nextOffset ||
      typeof entry.mimeType !== 'string' ||
      entry.mimeType.length > MAX_MIME_TYPE_LENGTH
    ) {
      invalid('its payload index is invalid, duplicated or overlapping.');
    }
    media.push({
      contentHash: entry.contentHash,
      byteLength: entry.byteLength,
      offset: nextOffset,
      mimeType: entry.mimeType,
    });
    previousHash = entry.contentHash;
    nextOffset = checkedAdd(nextOffset, entry.byteLength);
  }
  if (checkedAdd(payloadOffset, nextOffset) !== blob.size)
    invalid('its payload length does not match.');
  // A package may say which declared payloads it was written without. Nothing else may be
  // absent: a payload that is neither carried nor listed means a damaged file.
  const missing = new Set<string>();
  if (raw.missing !== undefined) {
    if (!Array.isArray(raw.missing)) invalid('its list of missing payloads is invalid.');
    let previous = '';
    for (const hash of raw.missing as unknown[]) {
      if (typeof hash !== 'string' || !CONTENT_HASH_PATTERN.test(hash) || hash <= previous)
        invalid('its list of missing payloads is invalid or duplicated.');
      missing.add(hash);
      previous = hash;
    }
  }
  const byHash = new Map(media.map((entry) => [entry.contentHash, entry]));
  const required = new Set<string>();
  const absent = new Set<string>();
  for (const asset of projectPayloads(parsed.project)) {
    const entry = byHash.get(asset.contentHash);
    if (!entry && missing.has(asset.contentHash)) {
      absent.add(asset.contentHash);
      continue;
    }
    if (!entry || entry.byteLength !== asset.byteLength) {
      invalid(
        `the ${asset.role === 'text-geometry' ? 'geometry' : 'original'} for “${asset.name}” is absent or has a conflicting size.`,
      );
    }
    required.add(asset.contentHash);
  }
  if (required.size !== media.length) invalid('its index contains undeclared payloads.');
  if (absent.size !== missing.size)
    invalid('its list of missing payloads names one it carries or one the project does not use.');
  return { parsed, media, missing: [...missing], payloadOffset };
}

/** Sniff the signature; callers can keep opening ordinary legacy JSON files. */
export async function isProjectPackage(blob: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await blob.slice(0, MAGIC.length).arrayBuffer());
  return bytes.length === MAGIC.length && MAGIC.every((byte, index) => bytes[index] === byte);
}

export interface PackageWriter {
  write(bytes: Uint8Array): Promise<void>;
}

export interface PreparedPackage extends MediaLease {
  readonly byteLength: number;
  /** The declared payloads the package goes without (`allowMissing`); none otherwise. */
  readonly missing: readonly ProjectPayload[];
  /** Backpressure is one bounded write at a time. The save owner closes/aborts the real sink. */
  writeTo(writer: PackageWriter, options?: MediaReadOptions): Promise<void>;
  /** Blob composition retains original Blob references; it never reads all source bytes into JS. */
  toBlob(): Blob;
}

/** Pin every declared payload, including unused/muted audio and saved stale text geometry.
 * A payload that is not stored fails the package, unless the caller allows it (`allowMissing`,
 * the user's decision): then the package is written without it, its manifest lists it under
 * `missing`, and `missing` here tells the caller what that was. */
export async function preparePackage(
  project: Project,
  options: MediaReadOptions & {
    repository?: OriginalMediaRepository;
    allowMissing?: boolean;
  } = {},
): Promise<PreparedPackage> {
  checkMediaAbort(options.signal);
  const repository = options.repository ?? mediaRepository;
  const ownerId = mediaOwnerId('save');
  const payloads = projectPayloads(project);
  // The reader's bound, before anything is pinned: a save never writes what cannot be opened.
  if (new Set(payloads.map((payload) => payload.contentHash)).size > MAX_PACKAGE_PAYLOADS)
    invalid(`it would hold more than ${MAX_PACKAGE_PAYLOADS} payloads.`);
  const geometry = textGeometryReferences(project);
  const lacking = new Set<string>();
  let lease: MediaLease = { ownerId, release: async () => undefined };
  if (payloads.length && options.allowMissing) {
    const pinned = await pinAvailableProjectMedia(project, ownerId, repository);
    for (const hash of pinned.missing) lacking.add(hash);
    lease = pinned;
  } else if (payloads.length) {
    lease = await pinProjectMedia(project, ownerId, repository);
  }
  try {
    const assets = new Map(payloads.map((asset) => [asset.contentHash, asset]));
    const media: PackageMediaEntry[] = [];
    const originals: Blob[] = [];
    let offset = 0;
    for (const hash of [...assets.keys()].sort()) {
      checkMediaAbort(options.signal);
      if (lacking.has(hash)) continue;
      const asset = assets.get(hash)!;
      if (asset.mimeType.length > MAX_MIME_TYPE_LENGTH) {
        invalid(`the media type for “${asset.name}” exceeds ${MAX_MIME_TYPE_LENGTH} characters.`);
      }
      const blob = await repository.requireOriginal(hash);
      if (blob.size !== asset.byteLength) {
        throw new MediaStorageError(
          'corrupt',
          `The original for “${asset.name}” has the wrong size.`,
        );
      }
      // Validate every reference even when several formulas share one immutable artifact.
      for (const reference of geometry.get(hash) ?? [])
        await readTextGeometryBlob(blob, reference, options);
      media.push({ contentHash: hash, byteLength: blob.size, offset, mimeType: asset.mimeType });
      originals.push(blob);
      offset = checkedAdd(offset, blob.size);
    }
    // Same bytes shared by different asset records must describe the same immutable original.
    if (payloads.some((asset) => assets.get(asset.contentHash)!.byteLength !== asset.byteLength)) {
      invalid('shared originals have conflicting sizes.');
    }
    const manifest: PackageManifest = {
      format: PACKAGE_FORMAT,
      version: PACKAGE_VERSION,
      project: JSON.parse(serializeProject(project)) as unknown,
      media,
      ...(lacking.size ? { missing: [...lacking].sort() } : {}),
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    if (manifestBytes.length > MAX_MANIFEST_BYTES) invalid('its manifest exceeds 32 MiB.');
    const header = new Uint8Array(PACKAGE_HEADER_BYTES);
    header.set(MAGIC);
    const view = new DataView(header.buffer);
    view.setUint32(8, PACKAGE_VERSION, true);
    view.setUint32(12, manifestBytes.length, true);
    const byteLength = checkedAdd(PACKAGE_HEADER_BYTES + manifestBytes.length, offset);
    checkMediaAbort(options.signal);
    let released = false;
    const assertActive = () => {
      if (released) throw new Error('The package has already released its original-media lease.');
    };
    return {
      ownerId,
      byteLength,
      missing: payloads.filter((payload) => lacking.has(payload.contentHash)),
      async release() {
        await lease.release();
        released = true;
      },
      toBlob() {
        assertActive();
        return new Blob([header, manifestBytes, ...originals], { type: PACKAGE_MIME_TYPE });
      },
      async writeTo(writer, writeOptions = {}) {
        assertActive();
        const signal = writeOptions.signal ?? options.signal;
        const progress = writeOptions.onProgress ?? options.onProgress;
        let written = 0;
        const write = async (bytes: Uint8Array) => {
          checkMediaAbort(signal);
          await writer.write(bytes);
          written += bytes.byteLength;
          progress?.(written, byteLength);
        };
        await write(header);
        for (let start = 0; start < manifestBytes.length; start += MEDIA_CHUNK_BYTES) {
          await write(manifestBytes.subarray(start, start + MEDIA_CHUNK_BYTES));
        }
        for (const blob of originals) {
          for (let start = 0; start < blob.size; start += MEDIA_CHUNK_BYTES) {
            checkMediaAbort(signal);
            await write(
              new Uint8Array(await blob.slice(start, start + MEDIA_CHUNK_BYTES).arrayBuffer()),
            );
          }
        }
        checkMediaAbort(signal);
      },
    };
  } catch (error) {
    await lease.release().catch(() => undefined);
    throw error;
  }
}

/** Imported bytes are durable before the caller publishes any project metadata. */
export async function importPackage(
  blob: Blob,
  options: MediaReadOptions & {
    repository?: OriginalMediaRepository;
    /** Asks the browser to keep what was stored (`persistence.ts`). */
    persist?: () => unknown;
  } = {},
): Promise<{ parsed: ParsedProject; lease: MediaLease }> {
  checkMediaAbort(options.signal);
  const { parsed, media, payloadOffset } = await readPackageManifest(blob);
  const repository = options.repository ?? mediaRepository;
  const ownerId = mediaOwnerId('package-import');
  const lease = media.length
    ? mediaLease(ownerId, repository)
    : { ownerId, release: async () => undefined };
  let imported = payloadOffset;
  const importedHashes: string[] = [];
  const geometry = textGeometryReferences(parsed.project);
  try {
    for (const entry of media) {
      checkMediaAbort(options.signal);
      const start = payloadOffset + entry.offset;
      const original = blob.slice(start, start + entry.byteLength, entry.mimeType);
      const references = geometry.get(entry.contentHash) ?? [];
      for (const reference of references) await readTextGeometryBlob(original, reference, options);
      await repository.storeOriginal(original, {
        ownerId,
        expectedHash: entry.contentHash,
        signal: options.signal,
        onProgress: (bytes) => options.onProgress?.(imported + bytes, blob.size),
        // Checked just above to be the geometry of a text: derived data.
        derived: references.length > 0,
      });
      importedHashes.push(entry.contentHash);
      imported += entry.byteLength;
    }
    if (media.length) void (options.persist ?? requestPersistentStorage)();
    checkMediaAbort(options.signal);
    return { parsed, lease };
  } catch (error) {
    await discardImportedMedia(lease, importedHashes, repository);
    throw error;
  }
}

/** Bring back the originals among `wanted` that a package carries: the file a save is about to
 * replace may be the only place left that holds what the browser lost. The lease owns what was
 * stored (`recovered`, by hash); the caller hands it over or releases it. `unreadable` are the
 * ones the package carries, by its index, that could not be brought back: their bytes do not
 * match their hash, or the store refused them (no room). The file is then still their only copy. */
export async function recoverOriginals(
  blob: Blob,
  wanted: readonly ProjectPayload[],
  options: MediaReadOptions & { repository?: OriginalMediaRepository } = {},
): Promise<{ lease: MediaLease; recovered: string[]; unreadable: string[] }> {
  checkMediaAbort(options.signal);
  const { media, payloadOffset } = await readPackageManifest(blob);
  const repository = options.repository ?? mediaRepository;
  const ownerId = mediaOwnerId('package-import');
  const lease = mediaLease(ownerId, repository);
  const carried = new Map(media.map((entry) => [entry.contentHash, entry]));
  const recovered: string[] = [];
  const unreadable = new Set<string>();
  try {
    for (const payload of wanted) {
      checkMediaAbort(options.signal);
      const entry = carried.get(payload.contentHash);
      if (!entry || entry.byteLength !== payload.byteLength) continue;
      if (recovered.includes(entry.contentHash) || unreadable.has(entry.contentHash)) continue;
      const start = payloadOffset + entry.offset;
      const original = blob.slice(start, start + entry.byteLength, entry.mimeType);
      try {
        if (payload.geometry) await readTextGeometryBlob(original, payload.geometry, options);
        await repository.storeOriginal(original, {
          ownerId,
          expectedHash: entry.contentHash,
          signal: options.signal,
          derived: payload.geometry !== undefined,
        });
        recovered.push(entry.contentHash);
      } catch (error) {
        checkMediaAbort(options.signal);
        if (error instanceof MediaStorageError && error.code === 'cancelled') throw error;
        unreadable.add(entry.contentHash);
      }
    }
    return { lease, recovered, unreadable: [...unreadable] };
  } catch (error) {
    await discardImportedMedia(lease, recovered, repository);
    throw error;
  }
}
