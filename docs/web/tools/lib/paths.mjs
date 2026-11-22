/* Where things are, from this file: the repository, the app and the web documentation. Every tool
 * of the documentation finds its folders through here, so it runs from any working directory and
 * from any checkout of the repository (a worktree included). */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

/** The repository's root folder. */
export const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
/** The web app (`app/`), whose dev server and node_modules the tools use. */
export const APP_DIR = join(REPO, 'app');
/** The web documentation (`docs/web/`). */
export const WEB_DIR = join(REPO, 'docs', 'web');

/** The port of the app's dev server that the documentation's tools start in the first slot of the
 * machine (the next slots take the next ports: 5192, 5193…). Never 5173: that one belongs to
 * whoever develops the app, and the tools never touch it. */
export const DOCS_APP_PORT = 5191;

/** Imports a package from the app's node_modules (the tools add no dependencies of their own). */
export async function importFromApp(entry) {
  return import(pathToFileURL(join(APP_DIR, 'node_modules', entry)).href);
}
