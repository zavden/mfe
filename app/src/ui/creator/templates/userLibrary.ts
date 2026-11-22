/* The user's own templates and the favourites among all templates (D121): what the library
 * holds, the file it is kept in and how two libraries meet. Pure: `userLibraryStore.ts` keeps it
 * in the browser, `templatesFolder.ts` in the synced folder.
 *
 * The file — the same in the browser's storage, in the synced folder and in an export — is
 * `{ "format": "mfe-templates", "version": 1, "templates": [...], "favorites": [ids] }`. A
 * template of the user has no level; it carries when it was last changed, so that of two
 * libraries with the same template the newer one stays. */
import { z } from 'zod';
import { placeholderSchema, type TemplateSource } from './library';
import { placeholderIssues, placeholderRows } from './placeholders';

export const TEMPLATES_FORMAT = 'mfe-templates';
export const TEMPLATES_VERSION = 1;
/** How many templates a library holds: the browser's storage is small. */
export const USER_TEMPLATE_LIMIT = 500;

const LIMITS = { id: 200, name: 120, category: 80, description: 600, latex: 4000 } as const;
export const TEMPLATE_FIELD_LIMITS: Readonly<typeof LIMITS> = LIMITS;

const userTemplateSchema = z.object({
  id: z.string().min(1).max(LIMITS.id),
  name: z.string().trim().min(1).max(LIMITS.name),
  category: z.string().trim().max(LIMITS.category),
  description: z.string().max(LIMITS.description),
  latex: z.string().min(1).max(LIMITS.latex),
  placeholders: z.array(placeholderSchema),
  packages: z.array(z.string().min(1)),
  modified: z.number().finite(),
});

/** A template the user made (or copied from the ones that come with the editor). */
export type UserTemplate = z.infer<typeof userTemplateSchema>;

export interface UserLibrary {
  /** In the order they were made. */
  templates: UserTemplate[];
  /** The ids of the favourites, the user's templates and the editor's alike, oldest first. */
  favorites: string[];
}

export const emptyUserLibrary = (): UserLibrary => ({ templates: [], favorites: [] });

/** What the user fills in for a template. */
export type TemplateFields = Pick<
  UserTemplate,
  'name' | 'category' | 'description' | 'latex' | 'placeholders' | 'packages'
>;

/** A template as it is kept: the fields trimmed, and of the placeholders the ones its LaTeX
 * uses, by number. Throws with the reason when it cannot be kept. */
export function userTemplate(id: string, fields: TemplateFields, modified: number): UserTemplate {
  const [error] = placeholderIssues(fields.latex, fields.placeholders).filter(
    (issue) => issue.severity === 'error',
  );
  if (error) throw new Error(error.message);
  const parsed = userTemplateSchema.safeParse({
    id,
    name: fields.name.trim(),
    category: fields.category.trim(),
    description: fields.description.trim(),
    latex: fields.latex.trim(),
    placeholders: placeholderRows(fields.latex, fields.placeholders).map((p) => ({
      n: p.n,
      value: p.value,
      ...(p.label?.trim() ? { label: p.label.trim() } : {}),
    })),
    packages: fields.packages.map((p) => p.trim()).filter(Boolean),
    modified,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Template ${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'not valid'}.`);
  }
  return parsed.data;
}

/** The same template in two libraries, whatever the moment each was written. */
function sameTemplate(a: UserTemplate, b: UserTemplate): boolean {
  return JSON.stringify({ ...a, modified: 0 }) === JSON.stringify({ ...b, modified: 0 });
}

const unique = (ids: readonly string[]) => [...new Set(ids)];

// --- Changes ------------------------------------------------------------------------------

/** `library` with `template` added, or in the place of the one with its id. */
export function saveTemplate(library: UserLibrary, template: UserTemplate): UserLibrary {
  const at = library.templates.findIndex((t) => t.id === template.id);
  if (at < 0 && library.templates.length >= USER_TEMPLATE_LIMIT) {
    throw new Error(`The library is full: it holds ${USER_TEMPLATE_LIMIT} templates.`);
  }
  const templates =
    at < 0
      ? [...library.templates, template]
      : library.templates.map((t, i) => (i === at ? template : t));
  return { ...library, templates };
}

/** `library` without the templates `ids`, which stop being favourites too. */
export function removeTemplates(library: UserLibrary, ids: readonly string[]): UserLibrary {
  const gone = new Set(ids);
  return {
    templates: library.templates.filter((t) => !gone.has(t.id)),
    favorites: library.favorites.filter((id) => !gone.has(id)),
  };
}

/** `library` with the template `id` — one of the user's or one of the editor's — a favourite or
 * not. */
export function setFavorite(library: UserLibrary, id: string, favorite: boolean): UserLibrary {
  const has = library.favorites.includes(id);
  if (has === favorite) return library;
  return {
    ...library,
    favorites: favorite ? [...library.favorites, id] : library.favorites.filter((f) => f !== id),
  };
}

/** A name for a copy that no template of the library has: "Chain rule copy", "… copy 2". */
export function copyName(name: string, library: UserLibrary): string {
  const used = new Set(library.templates.map((t) => t.name));
  const stem = `${name.replace(/ copy( \d+)?$/, '')} copy`.slice(0, LIMITS.name - 6);
  if (!used.has(stem)) return stem;
  for (let n = 2; ; n++) if (!used.has(`${stem} ${n}`)) return `${stem} ${n}`;
}

/** What a template of the editor, or one of the user's, gives a copy of it. */
export function fieldsOf(
  template: TemplateSource & { name: string; category: string; description: string },
): TemplateFields {
  return {
    name: template.name,
    category: template.category,
    description: template.description,
    latex: template.latex,
    placeholders: template.placeholders.map((p) => ({ ...p })),
    packages: [...template.packages],
  };
}

// --- Two libraries meeting ------------------------------------------------------------------

/** `ours` and `theirs` together: every template of either, and of a template both have the one
 * changed last (ours when neither is newer); every favourite of either. Nothing says a template
 * was deleted, so one deleted here and still there comes back. Every one, also when together they
 * are more than a library holds: the merge drops nothing, and whoever keeps its result asks
 * `overLimit` first — a library is read back up to `USER_TEMPLATE_LIMIT`, and the rest would go
 * without a word. */
export function mergeLibraries(ours: UserLibrary, theirs: UserLibrary): UserLibrary {
  const merged = new Map(ours.templates.map((t) => [t.id, t]));
  for (const template of theirs.templates) {
    const own = merged.get(template.id);
    if (!own || template.modified > own.modified) merged.set(template.id, template);
  }
  return {
    templates: [...merged.values()],
    favorites: unique([...ours.favorites, ...theirs.favorites]),
  };
}

/** How many templates `library` has past what a library holds (`USER_TEMPLATE_LIMIT`). */
export function overLimit(library: UserLibrary): number {
  return Math.max(0, library.templates.length - USER_TEMPLATE_LIMIT);
}

export function sameLibrary(a: UserLibrary, b: UserLibrary): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** What importing `incoming` into `library` would do. */
export interface ImportPlan {
  /** Templates the library does not have. */
  fresh: UserTemplate[];
  /** Templates it has under the same id with other content: replace, or keep both? */
  clashes: UserTemplate[];
  /** Templates it has already, the same. */
  same: number;
  /** Favourites of the file. */
  favorites: string[];
}

export function planImport(library: UserLibrary, incoming: UserLibrary): ImportPlan {
  const own = new Map(library.templates.map((t) => [t.id, t]));
  const plan: ImportPlan = { fresh: [], clashes: [], same: 0, favorites: incoming.favorites };
  for (const template of incoming.templates) {
    const mine = own.get(template.id);
    if (!mine) plan.fresh.push(template);
    else if (sameTemplate(mine, template)) plan.same += 1;
    else plan.clashes.push(template);
  }
  return plan;
}

/** `library` after the import `plan`: the new templates added and, of the ones that clash,
 * `replace` puts the file's in the place of the library's, `copy` adds them as copies (`newId`
 * names each) and `skip` leaves the library's. The file's favourites are added: of a clashing
 * template kept as a copy, the copy. */
export function applyImport(
  library: UserLibrary,
  plan: ImportPlan,
  clashes: 'replace' | 'copy' | 'skip',
  newId: () => string,
): UserLibrary {
  let next = library;
  const renamed = new Map<string, string>();
  const skipped = new Set<string>();
  for (const template of plan.fresh) next = saveTemplate(next, template);
  for (const template of plan.clashes) {
    if (clashes === 'replace') next = saveTemplate(next, template);
    else if (clashes === 'copy') {
      const id = newId();
      renamed.set(template.id, id);
      next = saveTemplate(next, { ...template, id, name: copyName(template.name, next) });
    } else skipped.add(template.id);
  }
  const favorites = plan.favorites
    .filter((id) => !skipped.has(id) || library.favorites.includes(id))
    .map((id) => renamed.get(id) ?? id);
  return { ...next, favorites: unique([...next.favorites, ...favorites]) };
}

/** The part of `library` an export of the templates `ids` takes: those templates, and of the
 * favourites the ones among them. */
export function libraryOf(library: UserLibrary, ids: readonly string[]): UserLibrary {
  const wanted = new Set(ids);
  return {
    templates: library.templates.filter((t) => wanted.has(t.id)),
    favorites: library.favorites.filter((id) => wanted.has(id)),
  };
}

// --- The file -------------------------------------------------------------------------------

export function serializeLibrary(library: UserLibrary): string {
  const file = {
    format: TEMPLATES_FORMAT,
    version: TEMPLATES_VERSION,
    templates: library.templates,
    favorites: library.favorites,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export type ReadLibrary =
  | {
      ok: true;
      library: UserLibrary;
      /** Entries of the file that are not templates, left out. */
      skipped: number;
    }
  | {
      ok: false;
      /** `newer`: a file of a later version of the editor, to be left alone; `damaged`: not a
       * templates file at all. */
      reason: 'newer' | 'damaged';
      message: string;
    };

/** The library a templates file holds. An entry that is not a template (a broken one, a second
 * one with the same id, a placeholder without its value) is left out and counted; the rest of
 * the file is read. */
export function readLibrary(text: string): ReadLibrary {
  const damaged = (message: string): ReadLibrary => ({ ok: false, reason: 'damaged', message });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return damaged('The file is not JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return damaged('The file is not a templates file.');
  }
  const file = data as Record<string, unknown>;
  if (file.format !== TEMPLATES_FORMAT) return damaged('The file is not a templates file.');
  if (typeof file.version !== 'number') return damaged('The templates file has no version.');
  if (file.version > TEMPLATES_VERSION) {
    return {
      ok: false,
      reason: 'newer',
      message: 'The templates file was written by a newer version of the editor.',
    };
  }
  if (!Array.isArray(file.templates)) return damaged('The templates file lists no templates.');
  const library = emptyUserLibrary();
  const ids = new Set<string>();
  let skipped = 0;
  for (const raw of file.templates) {
    const parsed = userTemplateSchema.safeParse(raw);
    const usable =
      parsed.success &&
      !ids.has(parsed.data.id) &&
      library.templates.length < USER_TEMPLATE_LIMIT &&
      placeholderIssues(parsed.data.latex, parsed.data.placeholders).every(
        (issue) => issue.severity !== 'error',
      );
    if (!usable) {
      skipped += 1;
      continue;
    }
    ids.add(parsed.data.id);
    library.templates.push(parsed.data);
  }
  if (Array.isArray(file.favorites)) {
    library.favorites = unique(
      file.favorites.filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
  }
  return { ok: true, library, skipped };
}
