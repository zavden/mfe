/* Captures of reference/files: what the app says when it opens a project file, made by giving its
 * own `openProjectText` the text of a file — the way File ▸ Open… does once a file is chosen.
 *
 *   upgraded       a file of format 1 (`_format-1-project.mfe.json`, beside this file: the first
 *                  two formulas of the quadratic formula example as it was first saved): the app
 *                  upgrades it and says so
 *   newer          a file of a later format than the app reads: it is refused with a message
 *   not-a-project  a JSON text that is not a project of this editor
 *
 * `MFE_DATA['reference/files/format']`: the constants of the formats, read from the app:
 *   id, version        the `format` and the current `version` of a project file
 *   extension, packageExtension, packageMime, packageVersion   the files the app writes
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A project of format 1, kept for this capture: every example of the repository is of the
 * current format. It has two formulas, so that it draws within the seconds a notice about it
 * stays on screen. */
function oldProject() {
  return JSON.stringify(
    JSON.parse(readFileSync(join(import.meta.dirname, '_format-1-project.mfe.json'), 'utf8')),
  );
}

/** Opens `text` as File ▸ Open… would, in the app's own function, and shows the notices. */
const openText = (text, fileName) => async (page, kit) => {
  await kit.app(
    '/src/ui/project/actions.ts',
    (m, arg) => m.openProjectText(arg.text, { fileName: arg.fileName, handle: null }),
    { text, fileName },
  );
  await page.getByTestId('notice').first().waitFor({ state: 'visible' });
};

export default {
  page: 'reference/files',
  items: [
    {
      kind: 'data',
      name: 'format',
      extract: (page, kit) =>
        kit.evaluate(async () => {
          const model = await import('/src/model/index.ts');
          const files = await import('/src/ui/project/files.ts');
          const pack = await import('/src/media/package.ts');
          return {
            source: 'app/src/model/defaults.ts, app/src/media/package.ts, app/src/ui/project/files.ts',
            id: model.FORMAT_ID,
            version: model.FORMAT_VERSION,
            extension: files.FILE_EXTENSION,
            packageExtension: pack.PACKAGE_EXTENSION,
            packageMime: pack.PACKAGE_MIME_TYPE,
            packageVersion: pack.PACKAGE_VERSION,
          };
        }),
    },
    {
      kind: 'shot',
      name: 'upgraded',
      setup: openText(oldProject(), 'quadratic-formula.mfe.json'),
      target: 'notice-host',
      padding: 8,
    },
    {
      kind: 'shot',
      name: 'newer',
      setup: openText(
        JSON.stringify({ format: 'manim-formula-editor', version: 99 }),
        'from-the-future.mfe.json',
      ),
      target: 'notice-host',
      padding: 8,
    },
    {
      kind: 'shot',
      name: 'not-a-project',
      setup: openText(JSON.stringify({ hello: 'world' }), 'notes.json'),
      target: 'notice-host',
      padding: 8,
    },
  ],
};
