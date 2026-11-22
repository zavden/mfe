/* Entity ids: a one-letter kind prefix plus 8 random base-36 characters, e.g. "f_k3j9x0aa".
 * The prefix only helps humans reading a project file; code never parses it. */
import type { Project } from './types';

// Formula, track, visual/audio clip, relation, action, match colours, audio source, volume point;
// and a group of actions, whose name its members share and means nothing outside their clip (it
// is no entity of the project's id namespace below); a group of formulas of the Creator ('b', a
// bundle: 'g' was taken); of the scene's camera, a target camera ('k': 'c' and 't' were taken) and
// a camera move ('n'); and a mark of the Slides mode ('p', a pause or a comment: 'm' and 's' were
// taken).
export type IdKind = 'f' | 't' | 'c' | 'r' | 'a' | 'm' | 's' | 'v' | 'g' | 'b' | 'k' | 'n' | 'p';

export interface ProjectIdEntry {
  id: string;
  kind: IdKind;
  path: (string | number)[];
}

/** The global ID namespace, shared by semantic validation and import repair. */
export function projectIdEntries(project: Project): ProjectIdEntry[] {
  const entries: ProjectIdEntry[] = [];
  const add = (id: string, kind: IdKind, path: ProjectIdEntry['path']) =>
    entries.push({ id, kind, path });
  project.formulas.forEach((f, i) => add(f.id, 'f', ['formulas', i, 'id']));
  project.tracks.forEach((t, i) => add(t.id, 't', ['tracks', i, 'id']));
  project.clips.forEach((c, i) => {
    add(c.id, 'c', ['clips', i, 'id']);
    c.actions.forEach((a, j) => add(a.id, 'a', ['clips', i, 'actions', j, 'id']));
  });
  project.audioAssets.forEach((asset, i) => add(asset.id, 's', ['audioAssets', i, 'id']));
  project.audioClips.forEach((clip, i) => {
    add(clip.id, 'c', ['audioClips', i, 'id']);
    clip.volume.forEach((point, j) => add(point.id, 'v', ['audioClips', i, 'volume', j, 'id']));
  });
  project.relations.forEach((r, i) => add(r.id, 'r', ['relations', i, 'id']));
  project.colorMatches.forEach((m, i) => add(m.id, 'm', ['colorMatches', i, 'id']));
  project.formulaGroups?.forEach((g, i) => add(g.id, 'b', ['formulaGroups', i, 'id']));
  project.camera?.targets.forEach((c, i) => add(c.id, 'k', ['camera', 'targets', i, 'id']));
  project.camera?.moves.forEach((m, i) => add(m.id, 'n', ['camera', 'moves', i, 'id']));
  project.slides?.marks.forEach((m, i) => add(m.id, 'p', ['slides', 'marks', i, 'id']));
  return entries;
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomSuffix(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

let generator: (kind: IdKind) => string = (kind) => `${kind}_${randomSuffix()}`;

export function newId(kind: IdKind): string {
  return generator(kind);
}

/** Replace the generator (tests use a counter for deterministic ids: `sequentialIds`,
 * `src/test/sequentialIds.ts`). Returns a restore fn. */
export function setIdGenerator(next: (kind: IdKind) => string): () => void {
  const previous = generator;
  generator = next;
  return () => {
    generator = previous;
  };
}
