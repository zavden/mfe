/* The projects starred in the Projects dialog (D153). They are kept in the browser, apart from the
 * project files and from the folder, in which nothing is written: the names of the starred files
 * by the name of the synced folder, which is all a browser tells of a folder. So a file that is
 * renamed loses its star, and two folders of one name share theirs. Not undoable. */
import { create } from 'zustand';
import { safeStorage } from '../storage';

export const PROJECT_FAVORITES_KEY = 'mfe.projectFavorites.v1';

/** The names of the starred files of each folder, by the folder's name. */
export type ProjectFavorites = Readonly<Record<string, readonly string[]>>;

const NONE: readonly string[] = [];

/** The starred files of the folder named `folder` (a folder's name may be any word, `constructor`
 * too: only what the record holds itself counts). */
const namesOf = (favorites: ProjectFavorites, folder: string): readonly string[] =>
  Object.hasOwn(favorites, folder) ? favorites[folder]! : NONE;

/** What the stored `text` holds. Anything that is not names of files by folder is left out: a
 * value the app did not write, or one of a later version, costs the stars and nothing else. */
export function parseProjectFavorites(text: string | null): ProjectFavorites {
  if (text === null) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const folders: [string, string[]][] = [];
  for (const [folder, names] of Object.entries(value)) {
    if (!Array.isArray(names)) continue;
    const kept = [...new Set(names.filter((name) => typeof name === 'string' && name !== ''))];
    if (kept.length > 0) folders.push([folder, kept as string[]]);
  }
  return Object.fromEntries(folders);
}

/** `favorites` with the file `fileName` of `folder` starred (`on`) or not: itself when it already
 * is so. A folder without stars is not kept. */
export function withProjectFavorite(
  favorites: ProjectFavorites,
  folder: string,
  fileName: string,
  on: boolean,
): ProjectFavorites {
  const names = namesOf(favorites, folder);
  if (names.includes(fileName) === on) return favorites;
  const next = on ? [...names, fileName] : names.filter((name) => name !== fileName);
  const others = Object.entries(favorites).filter(([name]) => name !== folder);
  return Object.fromEntries(next.length > 0 ? [...others, [folder, next]] : others);
}

/** The starred files of the folder named `folder`; none without a folder. */
export function projectFavoritesOf(
  favorites: ProjectFavorites,
  folder: string | null | undefined,
): ReadonlySet<string> {
  return new Set(folder == null ? NONE : namesOf(favorites, folder));
}

const stored = (): ProjectFavorites =>
  parseProjectFavorites(safeStorage.getItem(PROJECT_FAVORITES_KEY));

export const useProjectFavorites = create<{ favorites: ProjectFavorites }>()(() => ({
  favorites: stored(),
}));

/** Take the stars the browser holds now (tests; what another tab starred). */
export function loadProjectFavorites(): void {
  useProjectFavorites.setState({ favorites: stored() });
}

/** Star the file `fileName` of the folder named `folder`, or take its star away. The change is
 * made over what the browser holds at that moment, so that the stars of another tab are kept;
 * where the browser stores nothing, the star lasts as long as the tab. */
export function setProjectFavorite(folder: string, fileName: string, on: boolean): void {
  const read = safeStorage.readItem(PROJECT_FAVORITES_KEY);
  const held = read.ok
    ? parseProjectFavorites(read.value)
    : useProjectFavorites.getState().favorites;
  const favorites = withProjectFavorite(held, folder, fileName, on);
  safeStorage.setItem(PROJECT_FAVORITES_KEY, JSON.stringify(favorites));
  useProjectFavorites.setState({ favorites });
}
