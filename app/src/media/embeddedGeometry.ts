/* The text geometry a `.mfe.json` carries (docs/FORMAT.md, "Text geometry in the project file"):
 * a file holds each geometry as a JSON value under its content hash, and the browser holds it as
 * the bytes of that hash, like any payload. This is the passage between the two. */
import {
  FORMAT_ID,
  serializeProject,
  TEXT_GEOMETRY_MIME_TYPE,
  type EmbeddedTextGeometry,
  type Project,
  type TextGeometryArtifact,
  type TextGeometryRef,
} from '../model';
import { projectPayloads, textGeometryReferences, type ProjectPayload } from './dependencies';
import { checkMediaAbort, MediaStorageError } from './errors';
import type { MediaReadOptions } from './hash';
import {
  discardImportedMedia,
  mediaLease,
  mediaOwnerId,
  pinAvailableProjectMedia,
  type MediaLease,
} from './ownership';
import type { OriginalMediaRepository } from './repository';
import { mediaRepository } from './sessionRepository';
import { readTextGeometryBlob, readTextGeometryPayload } from './textGeometry';

/** How much geometry a `.mfe.json` carries at most, all its texts together: the file is read and
 * written as one string. A project beyond it is saved as a `.mfe` package, where each geometry
 * is a payload of its own. */
export const MAX_EMBEDDED_GEOMETRY_BYTES = 64 * 1024 * 1024;
/** A file larger than this is not looked into for geometry: no `.mfe.json` comes near it. */
export const MAX_PROJECT_FILE_BYTES = 4 * MAX_EMBEDDED_GEOMETRY_BYTES;

type RepositoryOptions = MediaReadOptions & { repository?: OriginalMediaRepository };

/** Whether the geometry of the texts of `project` fits in a `.mfe.json`, going by the sizes its
 * references state. A project beyond that is one for a package. */
export function fitsProjectFile(project: Project): boolean {
  let bytes = 0;
  for (const [reference] of textGeometryReferences(project).values()) {
    bytes += reference!.byteLength;
  }
  return bytes <= MAX_EMBEDDED_GEOMETRY_BYTES;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A text whose geometry in the file was left out, and why. */
export interface RefusedTextGeometry {
  /** The text, by its name in the project. */
  name: string;
  reason: string;
}

export interface ImportedTextGeometry {
  /** Owns what was stored. Release it once the open document's owner covers the project, or
   * discard it (`discardImportedMedia`, with `imported`) when the project is not opened. */
  lease: MediaLease;
  /** The content hashes that are stored now. */
  imported: string[];
  /** The texts that go without the geometry the file holds for them. */
  refused: RefusedTextGeometry[];
}

function cancelled(error: unknown): boolean {
  return error instanceof MediaStorageError && error.code === 'cancelled';
}

/** What went wrong with a geometry, in words: the check that failed, beside its wrapper. */
function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error instanceof MediaStorageError ? error.cause : undefined;
  if (!(cause instanceof Error) || cause instanceof MediaStorageError) return error.message;
  // A schema failure lists every issue: the first one, with its path, tells where to look.
  const [issue] = (cause as { issues?: { path: PropertyKey[]; message: string }[] }).issues ?? [];
  const detail = issue ? `${issue.path.join('.') || 'geometry'}: ${issue.message}` : cause.message;
  return `${error.message} (${detail})`;
}

/** The bytes a member of the section stands for: the compact JSON of its value. */
function payloadOf(value: unknown): Blob {
  const text = JSON.stringify(value) as string | undefined;
  if (text === undefined) throw new MediaStorageError('corrupt', 'The text geometry is empty.');
  return new Blob([text], { type: TEXT_GEOMETRY_MIME_TYPE });
}

/** The geometry a member of the section holds for `reference`, checked as a payload is, and
 * stored nowhere: for a file that is only looked at (the list of projects), whose geometry
 * nobody owns. */
export function readEmbeddedTextGeometry(
  value: unknown,
  reference: TextGeometryRef,
  options: MediaReadOptions = {},
): Promise<TextGeometryArtifact> {
  return readTextGeometryBlob(payloadOf(value), reference, options);
}

/** Bring into the repository the geometry that a project file carries, before the project is
 * shown: its texts then draw as they were saved, with no companion and whatever fonts this
 * machine has. Each member is checked as a payload is (`readTextGeometryBlob`: size, schema,
 * limits, the identity each reference states and the hash), and a member that fails is left out
 * with its reason: the text stays in the project and is as one whose geometry is missing. Only a
 * cancellation rejects, after letting go of what was stored. `onProgress` hears the bytes of the
 * members that are through, out of those the references state. */
export async function importEmbeddedTextGeometry(
  project: Project,
  embedded: EmbeddedTextGeometry,
  options: RepositoryOptions = {},
): Promise<ImportedTextGeometry> {
  checkMediaAbort(options.signal);
  const repository = options.repository ?? mediaRepository;
  const ownerId = mediaOwnerId('text-geometry');
  const carried = [...textGeometryReferences(project)].filter(([hash]) =>
    Object.hasOwn(embedded, hash),
  );
  const lease = carried.length
    ? mediaLease(ownerId, repository)
    : { ownerId, release: async () => undefined };
  const imported: string[] = [];
  const refused: RefusedTextGeometry[] = [];
  const total = carried.reduce((bytes, [, references]) => bytes + references[0]!.byteLength, 0);
  let done = 0;
  const namesOf = (hash: string) =>
    project.formulas
      .filter((formula) => formula.kind === 'text' && formula.geometry?.contentHash === hash)
      .map((formula) => formula.name);
  try {
    for (const [hash, references] of carried) {
      checkMediaAbort(options.signal);
      try {
        const blob = payloadOf(embedded[hash]);
        for (const reference of references)
          await readTextGeometryBlob(blob, reference, { signal: options.signal });
        await repository.storeOriginal(blob, {
          ownerId,
          expectedHash: hash,
          signal: options.signal,
          derived: true,
        });
        imported.push(hash);
      } catch (error) {
        if (cancelled(error)) throw error;
        const reason = reasonOf(error);
        for (const name of namesOf(hash)) refused.push({ name, reason });
      }
      done += references[0]!.byteLength;
      options.onProgress?.(done, total);
    }
    checkMediaAbort(options.signal);
    return { lease, imported, refused };
  } catch (error) {
    await discardImportedMedia(lease, imported, repository);
    throw error;
  }
}

export interface PreparedProjectFile extends MediaLease {
  /** The whole `.mfe.json`: the project and, in its section, the geometry of its texts. */
  readonly text: string;
  /** The declared geometry the file goes without: the browser does not hold it, or what it holds
   * is not what the reference names. */
  readonly missing: readonly ProjectPayload[];
}

/** The `.mfe.json` of a project, with the geometry of its texts inside. What it carries stays
 * pinned until the caller releases it: the file is written from this text, but the save is the
 * one that knows when its bytes are safe. A geometry that cannot be carried does not fail the
 * file: it is written without it, and `missing` tells the caller which, for the user to decide
 * (a package fails on a stored geometry that is damaged; a text file has no reason to hold the
 * project back for data that can be derived again). Recordings are not this file's to carry. */
export async function prepareProjectFile(
  project: Project,
  options: RepositoryOptions = {},
): Promise<PreparedProjectFile> {
  checkMediaAbort(options.signal);
  const repository = options.repository ?? mediaRepository;
  const ownerId = mediaOwnerId('save');
  const references = textGeometryReferences(project);
  if (references.size === 0) {
    return { ownerId, text: serializeProject(project), missing: [], release: async () => {} };
  }
  const lease = await pinAvailableProjectMedia(project, ownerId, repository);
  try {
    const lacking = new Set(lease.missing);
    // Before anything is read: the sizes the references state are the sizes of what is stored.
    const bytes = [...references]
      .filter(([hash]) => !lacking.has(hash))
      .reduce((total, [, refs]) => total + refs[0]!.byteLength, 0);
    if (bytes > MAX_EMBEDDED_GEOMETRY_BYTES) {
      const megabytes = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;
      throw new MediaStorageError(
        'too-large',
        `The appearance of its texts takes ${megabytes(bytes)}, and a .mfe.json file carries ` +
          `up to ${megabytes(MAX_EMBEDDED_GEOMETRY_BYTES)}. It needs a .mfe package.`,
      );
    }
    const embedded: Record<string, unknown> = {};
    for (const [hash, refs] of references) {
      checkMediaAbort(options.signal);
      if (lacking.has(hash)) continue;
      try {
        const blob = await repository.requireOriginal(hash);
        let value: unknown;
        for (const reference of refs) {
          ({ value } = await readTextGeometryPayload(blob, reference, { signal: options.signal }));
        }
        embedded[hash] = value;
      } catch (error) {
        const code = error instanceof MediaStorageError ? error.code : null;
        if (code !== 'corrupt' && code !== 'missing') throw error;
        lacking.add(hash);
      }
    }
    checkMediaAbort(options.signal);
    return {
      ownerId,
      text: serializeProject(project, embedded),
      missing: projectPayloads(project).filter(
        (payload) => payload.role === 'text-geometry' && lacking.has(payload.contentHash),
      ),
      release: () => lease.release(),
    };
  } catch (error) {
    await lease.release().catch(() => undefined);
    throw error;
  }
}

/** Bring back the geometry among `wanted` that a `.mfe.json` on disk carries: the file a save is
 * about to replace may be the only place left that holds what the browser lost. The lease owns
 * what was stored (`recovered`, by hash); the caller hands it over or releases it. `unreadable`
 * are the ones the file has a member for that could not be brought back: the member does not
 * pass its checks (changed by hand or by a program that wrote the file again, of a later format,
 * or not the render the text names), or the store refused it (no room). The file is then still
 * their only copy, where a person can reach it. A file that is not a project carries nothing.
 * A file that cannot be read, and a project file that is not valid JSON any more (cut short),
 * reject: nobody knows what they hold. */
export async function recoverEmbeddedTextGeometry(
  file: Blob,
  wanted: readonly ProjectPayload[],
  options: RepositoryOptions = {},
): Promise<{ lease: MediaLease; recovered: string[]; unreadable: string[] }> {
  checkMediaAbort(options.signal);
  const repository = options.repository ?? mediaRepository;
  const ownerId = mediaOwnerId('text-geometry');
  const nothing = { lease: { ownerId, release: async () => {} }, recovered: [], unreadable: [] };
  const geometry = wanted.filter((payload) => payload.geometry);
  if (geometry.length === 0 || file.size > MAX_PROJECT_FILE_BYTES) return nothing;
  const text = await file.text();
  checkMediaAbort(options.signal);
  let section: unknown;
  try {
    const raw: unknown = JSON.parse(text);
    section = record(raw) && raw.format === FORMAT_ID ? raw.textGeometry : undefined;
  } catch {
    // A new file, or some other program's, holds nothing. What reads like a project of this
    // app with its geometry section, and is not JSON, is a damaged one.
    if (text.includes(`"${FORMAT_ID}"`) && text.includes('"textGeometry"')) {
      throw new MediaStorageError('corrupt', 'The project file is damaged: it is not valid JSON.');
    }
    return nothing;
  }
  if (!record(section)) return nothing;
  const lease = mediaLease(ownerId, repository);
  const recovered: string[] = [];
  const unreadable: string[] = [];
  // Several texts can name one geometry: it comes back if it is what any of them names.
  const references = new Map<string, TextGeometryRef[]>();
  for (const payload of geometry) {
    references.set(payload.contentHash, [
      ...(references.get(payload.contentHash) ?? []),
      payload.geometry!,
    ]);
  }
  try {
    for (const [hash, named] of references) {
      checkMediaAbort(options.signal);
      if (!Object.hasOwn(section, hash)) continue;
      try {
        const blob = payloadOf(section[hash]);
        let failure: unknown;
        let valid = false;
        for (const reference of named) {
          try {
            await readTextGeometryBlob(blob, reference, { signal: options.signal });
            valid = true;
            break;
          } catch (error) {
            failure = error;
          }
        }
        if (!valid) throw failure;
        await repository.storeOriginal(blob, {
          ownerId,
          expectedHash: hash,
          signal: options.signal,
          derived: true,
        });
        recovered.push(hash);
      } catch (error) {
        checkMediaAbort(options.signal);
        if (cancelled(error)) throw error;
        unreadable.push(hash);
      }
    }
    return { lease, recovered, unreadable };
  } catch (error) {
    await discardImportedMedia(lease, recovered, repository);
    throw error;
  }
}
