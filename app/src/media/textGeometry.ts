import {
  MAX_TEXT_ARTIFACT_BYTES,
  TEXT_GEOMETRY_MIME_TYPE,
  TextGeometryRefSchema,
  validateTextGeometryArtifact,
  type TextGeometryArtifact,
  type TextGeometryRef,
} from '../model';
import { checkMediaAbort, MediaStorageError } from './errors';
import { hashBlob, type MediaReadOptions } from './hash';
import { discardImportedMedia, mediaLease, mediaOwnerId, type MediaLease } from './ownership';
import type { OriginalMediaRepository } from './repository';
import { mediaRepository } from './sessionRepository';

export interface TextGeometryOptions extends MediaReadOptions {
  repository?: OriginalMediaRepository;
}

export interface StoredTextGeometry {
  reference: TextGeometryRef;
  artifact: TextGeometryArtifact;
  /** Release only after a committed document/history owner covers the reference. */
  lease: MediaLease;
}

function damaged(cause: unknown): never {
  if (cause instanceof MediaStorageError) throw cause;
  throw new MediaStorageError(
    'corrupt',
    'The saved text geometry is damaged or unsupported.',
    cause,
  );
}

/** Validate a bounded payload before it enters a project or package import. */
export async function readTextGeometryBlob(
  blob: Blob,
  reference: TextGeometryRef,
  options: MediaReadOptions = {},
): Promise<TextGeometryArtifact> {
  return (await readTextGeometryPayload(blob, reference, options)).artifact;
}

/** As `readTextGeometryBlob`, with the value the payload holds beside the geometry it was
 * checked as: the value is what a `.mfe.json` carries, every field of it, known here or not. */
export async function readTextGeometryPayload(
  blob: Blob,
  reference: TextGeometryRef,
  options: MediaReadOptions = {},
): Promise<{ artifact: TextGeometryArtifact; value: unknown }> {
  checkMediaAbort(options.signal);
  try {
    TextGeometryRefSchema.parse(reference);
    if (blob.size !== reference.byteLength || blob.size > MAX_TEXT_ARTIFACT_BYTES) {
      throw new Error('Unexpected text geometry byte length.');
    }
    const bytes = await blob.arrayBuffer();
    checkMediaAbort(options.signal);
    // A byte order mark stays in the text, where it is not JSON.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const value: unknown = JSON.parse(text);
    // A payload is the compact JSON of its value (docs/FORMAT.md): the same geometry then has
    // the same hash as a payload of a package and as an entry of a `.mfe.json`, which holds the
    // value and not these bytes.
    if (JSON.stringify(value) !== text) {
      throw new Error('Text geometry is not the compact JSON of its value.');
    }
    const artifact = validateTextGeometryArtifact(value);
    if (artifact.key !== reference.key || artifact.basisKey !== reference.basisKey) {
      throw new Error('Text geometry does not match its declared render identity.');
    }
    if ((await hashBlob(blob, { signal: options.signal })) !== reference.contentHash) {
      throw new Error('Text geometry has a conflicting content hash.');
    }
    checkMediaAbort(options.signal);
    return { artifact, value };
  } catch (error) {
    damaged(error);
  }
}

/** Committed results alone become owned bytes. Draft renders must remain transient. */
export async function storeTextGeometry(
  value: TextGeometryArtifact,
  options: TextGeometryOptions = {},
): Promise<StoredTextGeometry> {
  checkMediaAbort(options.signal);
  let artifact: TextGeometryArtifact;
  try {
    artifact = validateTextGeometryArtifact(value);
  } catch (error) {
    damaged(error);
  }
  // Serialize before the first await: later caller changes cannot change the stored payload.
  const blob = new Blob([JSON.stringify(artifact)], { type: TEXT_GEOMETRY_MIME_TYPE });
  if (blob.size > MAX_TEXT_ARTIFACT_BYTES) {
    throw new MediaStorageError('corrupt', 'Text geometry exceeds its portable payload limit.');
  }
  const repository = options.repository ?? mediaRepository;
  const ownerId = mediaOwnerId('text-geometry');
  const lease = mediaLease(ownerId, repository);
  let hash: string | undefined;
  try {
    const stored = await repository.storeOriginal(blob, { ...options, ownerId, derived: true });
    hash = stored.contentHash;
    checkMediaAbort(options.signal);
    return {
      reference: { ...stored, key: artifact.key, basisKey: artifact.basisKey },
      artifact,
      lease,
    };
  } catch (error) {
    await discardImportedMedia(lease, hash ? [hash] : [], repository);
    throw error;
  }
}

/** What a text whose saved geometry is not at hand is told: why, and what brings it back. */
export function lostTextGeometryNote(why: 'missing' | 'corrupt'): string {
  return (
    `The saved appearance of this text is ${why === 'missing' ? 'not in' : 'damaged in'} the ` +
    'browser’s storage. Open the project file that carries it, or use Refresh appearance in ' +
    'its editor, which needs the companion.'
  );
}

/** Reopening uses owned bytes, independent of companion availability or installed fonts. */
export async function loadTextGeometry(
  reference: TextGeometryRef,
  options: TextGeometryOptions = {},
): Promise<TextGeometryArtifact> {
  checkMediaAbort(options.signal);
  const repository = options.repository ?? mediaRepository;
  // Where the browser has no database, a geometry that is not in the page's memory is as
  // missing as any other: that is the news about this text.
  const blob = await repository.getOriginal(reference.contentHash).catch((error: unknown) => {
    if (error instanceof MediaStorageError && error.code === 'unavailable') return null;
    throw error;
  });
  if (!blob) throw new MediaStorageError('missing', lostTextGeometryNote('missing'));
  const artifact = await readTextGeometryBlob(blob, reference, options);
  checkMediaAbort(options.signal);
  return artifact;
}

/** Superseded completions release only their own temporary lease and touched hash. */
export async function discardTextGeometry(
  stored: StoredTextGeometry,
  repository: OriginalMediaRepository = mediaRepository,
): Promise<void> {
  await discardImportedMedia(stored.lease, [stored.reference.contentHash], repository);
}
