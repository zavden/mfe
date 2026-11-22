import { expect, test } from './test';
import { getProject, openWithProject, projectFile, readExample, type MfeWindow } from './helpers';
import { plain, relationProject } from './relationsHelpers';

test('dev server exposes window.__mfe to load a project', async ({ page }) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  const project = await getProject(page);
  expect(project.formulas.map((f) => f.source)).toEqual(['mx+y=0', 'mx=-y']);
});

test('the fixture the specs share is a file of the current format, read as it is written', async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  // What a migration from an older format would write over: the colour lists of the project,
  // and what a clip hangs on.
  const list = { id: 'm1', name: 'Mine', entries: [{ pattern: 'x', color: '#FF0000' }] };
  const attach = { clipId: 'a', glyphs: [0], rule: 'next_to', side: 'down', buff: 0.25 };
  const files = [
    projectFile('lists', [], [], { colorMatches: [list] }),
    relationProject([plain('a', 'fa', 't1', 0, 6), plain('b', 'fb', 't2', 1, 6, { attach })]),
  ];
  const read = await page.evaluate((texts) => {
    const mfe = (window as MfeWindow).__mfe!;
    return texts.map((text) => {
      const parsed = mfe.parseProject(text) as
        | {
            ok: true;
            migratedFrom: number | null;
            project: { colorMatches: unknown[]; clips: { attach: unknown }[] };
          }
        | { ok: false; error: string };
      if (!parsed.ok) return { error: parsed.error };
      return {
        migratedFrom: parsed.migratedFrom,
        colorMatches: parsed.project.colorMatches,
        attached: parsed.project.clips.map((clip) => clip.attach),
      };
    });
  }, files);
  expect(read[0]).toEqual({ migratedFrom: null, colorMatches: [list], attached: [] });
  expect(read[1]).toEqual({ migratedFrom: null, colorMatches: [], attached: [null, attach] });
});
