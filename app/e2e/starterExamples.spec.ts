/* The examples the app carries: "Try an example" in the empty Creator, and Help ▸ Examples. An
 * example opens as a file does, into a project of one's own that has no file yet. */
import { expect, test, type Page } from './test';
import { COMPANION_URL } from './companionHelpers';
import { forceFallbackFilePaths } from './creatorHelpers';
import { canUndo, expectAppShown, getProject, readExample, setTime } from './helpers';
import type { MfeWindow } from './helpers';

interface ExampleFile {
  meta: { name: string };
  formulas: { name: string; source: string }[];
  clips: { formulaId: string; start: number; end: number }[];
  camera?: unknown;
}
const fileOf = (id: string) => JSON.parse(readExample(`${id}.mfe.json`)) as ExampleFile;

/** The app as it starts, with nothing in it; saving is a download (no file picker to automate). */
async function startEmpty(page: Page): Promise<void> {
  await page.route(`${COMPANION_URL}/**`, (route) => route.abort('connectionrefused'));
  await forceFallbackFilePaths(page);
  await page.goto('/');
  await expectAppShown(page);
  await expect(page.getByTestId('creator-empty')).toContainText('No formulas yet');
}

/** The project is the one of the example's file: its formulas and its clips, as they are there. */
async function expectExample(page: Page, id: string): Promise<void> {
  const file = fileOf(id);
  await expect
    .poll(async () => (await getProject(page)).formulas.map((formula) => formula.name))
    .toEqual(file.formulas.map((formula) => formula.name));
  const project = await getProject(page);
  expect(project.meta.name).toBe(file.meta.name);
  expect(project.formulas.map((formula) => formula.source)).toEqual(
    file.formulas.map((formula) => formula.source),
  );
  expect(project.clips.map((clip) => [clip.formulaId, clip.start, clip.end])).toEqual(
    file.clips.map((clip) => [clip.formulaId, clip.start, clip.end]),
  );
  await expect(page.getByTestId('project-name')).toContainText(file.meta.name);
}

/** How many pixels of the Preview's frame are not as its top-left corner is. */
function drawnPixels(page: Page): Promise<number> {
  return page.getByTestId('preview-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    // The middle of the canvas is inside the frame, whatever is around it.
    const at = 4 * (Math.floor(canvas.height / 2) * canvas.width + 8);
    let drawn = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== data[at] || data[i + 1] !== data[at + 1] || data[i + 2] !== data[at + 2])
        drawn++;
    }
    return drawn;
  });
}

test('the empty Creator offers an example, which opens as a project of one’s own', async ({
  page,
}) => {
  await startEmpty(page);
  await expect(page.getByTestId('creator-example')).toHaveText('Try an example');
  await page.getByTestId('creator-example').click();
  // Nothing to ask: the project had nothing in it.
  await expect(page.getByTestId('dialog')).toHaveCount(0);
  await expectExample(page, 'completing-the-square');
  // With formulas in the Creator, its empty state and its button are gone.
  await expect(page.getByTestId('creator-empty')).toHaveCount(0);
  await expect(page.getByTestId('creator-example')).toHaveCount(0);
  await expect(page.getByTestId('formula-item')).toHaveCount(
    fileOf('completing-the-square').formulas.length,
  );
  // Opened as a file is: nothing to undo, nothing unsaved, nothing told.
  expect(await canUndo(page)).toBe(false);
  await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
  await expect(page.getByTestId('notice')).toHaveCount(0);

  // The Preview draws it: the title is being written at 1 s.
  await page.waitForFunction(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const { formulas } = mfe.useProjectStore.getState().project;
    const { entries } = mfe.useRenderStore.getState();
    return formulas.every((formula) => entries[formula.id]?.status === 'ok');
  });
  await setTime(page, 1);
  await expect.poll(() => drawnPixels(page)).toBeGreaterThan(200);

  // It has no file: Save asks where it goes (here, a download named after the project).
  await expect(page.getByTestId('doc-status')).toHaveText('Not saved yet');
  await expect(page.getByTestId('doc-file')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  expect((await download).suggestedFilename()).toBe('completing-the-square.mfe.json');
});

test('an example asks about unsaved work before it replaces the project', async ({ page }) => {
  await startEmpty(page);
  // A project with a change of its own, and still no formula: the button is there.
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      draft.meta.name = 'My work';
    });
  });
  await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'true');

  await page.getByTestId('creator-example').click();
  const dialog = page.getByTestId('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('dialog-cancel').click();
  await expect(dialog).toHaveCount(0);
  // Cancel opens nothing: the project is as it was.
  expect((await getProject(page)).meta.name).toBe('My work');
  expect((await getProject(page)).formulas).toHaveLength(0);
  await expect(page.getByTestId('creator-empty')).toBeVisible();

  await page.getByTestId('creator-example').click();
  await dialog.getByTestId('dialog-discard').click();
  await expectExample(page, 'completing-the-square');
  await expect(page.getByTestId('project-name')).toHaveAttribute('data-dirty', 'false');
});

test('Help ▸ Examples opens each example the app carries', async ({ page }) => {
  await startEmpty(page);
  await page.getByTestId('menu-help').click();
  await page.getByTestId('menu-item-help-examples').hover();
  const examples = page.getByRole('menu', { name: 'Examples', exact: true });
  await expect(examples).toBeVisible();
  expect(
    await examples.locator('[role="menuitem"]').evaluateAll((entries) =>
      entries.map((entry) => ({
        id: (entry as HTMLElement).dataset.testid,
        text: entry.textContent?.trim(),
      })),
    ),
  ).toEqual([
    { id: 'menu-item-help-examples-completing-the-square', text: 'Completing the square' },
    { id: 'menu-item-help-examples-hello', text: 'Hello: one-to-one' },
    { id: 'menu-item-help-examples-camera', text: 'Camera' },
    { id: 'menu-item-help-examples-braces', text: 'Braces' },
  ]);
  await page.getByTestId('menu-item-help-examples-camera').click();
  await expectExample(page, 'camera');
  // The whole file: the scene's camera came with it.
  expect(
    await page.evaluate(
      () =>
        (
          (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
            camera?: { moves: unknown[] };
          }
        ).camera?.moves.length,
    ),
  ).toBe((fileOf('camera').camera as { moves: unknown[] }).moves.length);

  // One example over another that was not touched: nothing to ask.
  for (const id of ['hello', 'braces', 'completing-the-square']) {
    await page.getByTestId('menu-help').click();
    await page.getByTestId('menu-item-help-examples').hover();
    await page.getByTestId(`menu-item-help-examples-${id}`).click();
    await expect(page.getByTestId('dialog')).toHaveCount(0);
    await expectExample(page, id);
    await expect(page.getByTestId('notice')).toHaveCount(0);
  }
});
