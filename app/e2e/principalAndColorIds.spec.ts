import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { FORMAT_VERSION, type Project } from '../src/model';
import { forceFallbackFilePaths, pinMathJax, startApp } from './creatorHelpers';
import { getProject, readExample, type MfeWindow } from './helpers';
import { openRelationScene, plain, selectRelation } from './relationsHelpers';

async function openFile(page: Page, text: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Open…' }).click();
  await page.getByTestId('projects-other').click();
  await (
    await chooser
  ).setFiles({
    name: 'repaired.mfe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

for (const [theme, width] of [
  ['dark', 1280],
  ['light', 1920],
] as const) {
  test(`a preserved principal is visible, undoable and saved (${theme})`, async ({
    page,
  }, testInfo) => {
    await forceFallbackFilePaths(page);
    await openRelationScene(
      page,
      [plain('a', 'fa', 't1', 0, 6), plain('b', 'fb', 't2', 2, 6)],
      {},
      [
        { id: 'fa', name: 'source', source: 'b+a' },
        { id: 'fb', name: 'target', source: 'x' },
      ],
    );
    await pinMathJax(page);
    await page.setViewportSize({ width, height: 900 });
    if (theme === 'light') await page.getByTestId('theme-toggle').click();
    await page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      mfe.useProjectStore.getState().update((draft) => {
        (draft as unknown as Project).relations.push({
          id: 'preserved',
          fromClipId: 'a',
          toClipId: 'b',
          offset: 0,
          duration: 1,
          easing: 'linear',
          style: 'transform',
          pathArc: 0,
          pairs: [{ from: [2, 0], to: [0], style: null, extras: 'copies', principal: 2 }],
        });
      });
      mfe.history.clear();
    });
    await selectRelation(page, 'preserved');
    await page.getByTestId('relation-edit-pairs').click();
    await expect(page.getByTestId('rel-pair-0-principal')).toHaveText('Principal: a (2)');
    await page.screenshot({ path: testInfo.outputPath(`principal-${theme}-${width}.png`) });
    await page.getByTestId('rel-pair-0-style').selectOption('fade');
    await page.getByTestId('rel-save').click();
    // Nothing while a file is still being opened: the poll asks again.
    const pair = async () =>
      ((await getProject(page)) as unknown as Project).relations[0]?.pairs[0] ?? null;
    await expect.poll(pair).toMatchObject({ principal: 2, style: 'fade' });
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(pair).toMatchObject({ principal: 2, style: null });
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(pair).toMatchObject({ principal: 2, style: 'fade' });
    const download = page.waitForEvent('download');
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'Save', exact: true }).click();
    const text = readFileSync(await (await download).path(), 'utf8');
    expect(JSON.parse(text)).toMatchObject({ version: FORMAT_VERSION });
    await page.getByTestId('menu-file').click();
    await page.getByRole('menuitem', { name: 'New', exact: true }).click();
    await openFile(page, text);
    await expect.poll(pair).toMatchObject({ principal: 2, style: 'fade' });
  });
}

test('a lost principal stays invalid until the pair is deliberately repaired', async ({
  page,
}, testInfo) => {
  await openRelationScene(page, [plain('a', 'fa', 't1', 0, 6), plain('b', 'fb', 't2', 2, 6)], {}, [
    { id: 'fa', name: 'source', source: 'b+a' },
    { id: 'fb', name: 'target', source: 'x' },
  ]);
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      (draft as unknown as Project).relations.push({
        id: 'missing',
        fromClipId: 'a',
        toClipId: 'b',
        offset: 0,
        duration: 1,
        easing: 'linear',
        style: 'transform',
        pathArc: 0,
        pairs: [{ from: [0], to: [0], style: null, extras: 'copies', principal: null }],
      });
    });
  });
  await selectRelation(page, 'missing');
  await page.getByTestId('relation-edit-pairs').click();
  await expect(page.getByTestId('rel-pair-0-principal')).toContainText('Principal missing');
  await expect(page.getByTestId('rel-save')).toBeDisabled();
  await page.getByTestId('rel-pair-0-style').selectOption('copy');
  await expect(page.getByTestId('rel-save')).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('principal-missing.png') });
  await page.getByTestId('rel-pair-0-extras').selectOption('separate');
  await expect(page.getByTestId('rel-save')).toBeEnabled();
  await page.getByTestId('rel-save').click();
  const stored = ((await getProject(page)) as unknown as Project).relations[0]!.pairs[0]!;
  expect(stored).toMatchObject({ extras: 'separate', principal: null, style: 'copy' });
});

test('import repairs duplicate color IDs without losing either list or its entries', async ({
  page,
}) => {
  await startApp(page);
  const raw = JSON.parse(readExample('hello.mfe.json'));
  raw.colorMatches = [
    { id: 'duplicate', name: 'First', entries: [{ pattern: 'x', color: '#FF0000' }] },
    { id: 'duplicate', name: 'Second', entries: [{ pattern: 'y', color: '#00FF00' }] },
  ];
  await openFile(page, JSON.stringify(raw));
  await expect(
    page.getByTestId('notice').filter({ hasText: 'Opened with 2 issues' }),
  ).toContainText('all its entries were kept');
  const lists = (await getProject(page)).colorMatches;
  expect(lists).toHaveLength(2);
  expect(new Set(lists.map((list) => list.id)).size).toBe(2);
  expect(lists.map((list) => list.entries)).toEqual(
    raw.colorMatches.map((list: { entries: unknown }) => list.entries),
  );
  await page.getByTestId('menu-edit').click();
  await page.getByTestId('menu-item-edit-match-colors').click();
  await page.getByRole('menuitem', { name: 'Second…', exact: true }).click();
  await page.getByTestId('match-colors-name').fill('Second renamed');
  await page.getByTestId('match-colors-name').press('Enter');
  await expect
    .poll(async () => (await getProject(page)).colorMatches.map((list) => list.name))
    .toEqual(['First', 'Second renamed']);
  await page.getByTestId('match-colors-delete').hover();
  await page.mouse.down();
  await page.waitForTimeout(850);
  await page.mouse.up();
  await expect.poll(async () => (await getProject(page)).colorMatches).toEqual([lists[0]]);
});
