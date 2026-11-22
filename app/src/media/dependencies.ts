import { TEXT_GEOMETRY_MIME_TYPE, type Project, type TextGeometryRef } from '../model';

/** Roles are declared by the project: audioAssets and text formulas' geometry references.
 * Container-v1 payload framing stays byte-for-byte compatible with audio-only packages. */
export interface ProjectPayload {
  role: 'audio-source' | 'text-geometry';
  contentHash: string;
  byteLength: number;
  mimeType: string;
  name: string;
  geometry?: TextGeometryRef;
}

export function projectPayloads(project: Project): ProjectPayload[] {
  return [
    ...project.audioAssets.map((asset): ProjectPayload => ({
      role: 'audio-source',
      contentHash: asset.contentHash,
      byteLength: asset.byteLength,
      mimeType: asset.mimeType,
      name: asset.name,
    })),
    ...project.formulas.flatMap((formula): ProjectPayload[] =>
      formula.kind === 'text' && formula.geometry
        ? [
            {
              role: 'text-geometry',
              contentHash: formula.geometry.contentHash,
              byteLength: formula.geometry.byteLength,
              mimeType: TEXT_GEOMETRY_MIME_TYPE,
              name: formula.name,
              geometry: formula.geometry,
            },
          ]
        : [],
    ),
  ];
}

/** The content hashes of these projects that are derived data and nothing else: the geometry
 * of their font texts, which the project file carries and the companion can make again. A hash
 * that a recording has too, in any of them, is not one. Where the browser has no database, a
 * derived payload that the page does not hold is known to be missing; of any other, nobody can
 * tell (`sessionRepository.ts`). */
export function derivedMediaHashes(...projects: readonly Project[]): Set<string> {
  const payloads = projects.flatMap(projectPayloads);
  const originals = new Set(
    payloads.filter((payload) => payload.role !== 'text-geometry').map((p) => p.contentHash),
  );
  return new Set(
    payloads
      .filter((payload) => payload.role === 'text-geometry' && !originals.has(payload.contentHash))
      .map((payload) => payload.contentHash),
  );
}

/** The distinct references to each text geometry of `project`, by content hash: several texts
 * can share one geometry, and each reference must agree with what the payload says of itself.
 * Distinct in everything a reference states, its byte length too: a second text that names the
 * same geometry with another size is a reference of its own, to be checked like the first. */
export function textGeometryReferences(project: Project): Map<string, TextGeometryRef[]> {
  const references = new Map<string, TextGeometryRef[]>();
  for (const { geometry } of projectPayloads(project)) {
    if (!geometry) continue;
    const refs = references.get(geometry.contentHash) ?? [];
    const known = refs.some(
      (ref) =>
        ref.key === geometry.key &&
        ref.basisKey === geometry.basisKey &&
        ref.byteLength === geometry.byteLength,
    );
    if (!known) refs.push(geometry);
    references.set(geometry.contentHash, refs);
  }
  return references;
}

/** Derived text geometry is saved content. Unlike a snapshot rebase, its arrival can introduce
 * payload bytes that the previously written document did not contain. */
export function textGeometryIdentity(project: Project): string {
  return JSON.stringify(
    project.formulas.flatMap((formula) =>
      formula.kind === 'text' && formula.geometry
        ? [
            [
              formula.id,
              formula.geometry.contentHash,
              formula.geometry.byteLength,
              formula.geometry.key,
              formula.geometry.basisKey,
            ],
          ]
        : [],
    ),
  );
}
