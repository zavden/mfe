import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { startApp, waitForDrawables } from './creatorHelpers';
import { getProject, selectionOf, setTime, undo } from './helpers';
import { clickScene } from './previewHelpers';
import { dropFormula, project } from './timelineHelpers';

/* Where a text is put in the composition workspace opened from the Creator is where its new clips
 * start (D124): «New clips start here», ticked when the workspace opens, makes Apply keep the
 * position of the stage in the object; a clip dropped on a track or added from a menu starts
 * there. Unticked, the position is not saved. Opened from a clip, the stage places that clip, as
 * before. */

interface Placed {
  id: string;
  kind: string;
  startPosition?: [number, number];
}

const workspace = (page: Page) => page.getByTestId('text-composition');
const keep = (page: Page) => page.getByTestId('text-keep-position');
const hint = (page: Page) => page.getByTestId('text-placement-hint');

/** The objects of the project with the place each keeps for its new clips. */
const objects = async (page: Page) => (await getProject(page)).formulas as unknown as Placed[];
/** Where each clip of the project starts, in the order they were made. */
const starts = async (page: Page) => (await project(page)).clips.map((c) => c.initial.position);

/** Creator → New → the text of `kind`, with `source` typed and settled on the stage. */
async function newText(page: Page, kind: 'tex' | 'text', source: string): Promise<void> {
  await page.getByTestId('creator-new-menu').click();
  await page.getByTestId(`creator-new-${kind}`).click();
  await expect(workspace(page)).toBeVisible();
  await page.getByTestId(kind === 'tex' ? 'tex-source' : 'text-source').fill(source);
  await expect(page.getByTestId('text-stage-canvas')).toHaveAttribute(
    'data-glyph-count',
    String(source.length),
  );
}

async function place(page: Page, x: string, y: string): Promise<void> {
  await page.getByTestId('text-position-x').fill(x);
  await page.getByTestId('text-position-y').fill(y);
  await expect(page.getByTestId('text-stage-canvas')).toHaveAttribute(
    'data-position',
    `${Number(x)},${Number(y)}`,
  );
}

async function apply(page: Page): Promise<void> {
  await page.getByTestId('text-apply').click();
  await expect(workspace(page)).toHaveCount(0);
}

/** «Add to the timeline» of the first object's menu, at the playhead. */
async function addFromMenu(page: Page): Promise<void> {
  await page.getByTestId('formula-item').first().click({ button: 'right' });
  await page.getByTestId('formula-menu-add-to-timeline').click();
}

async function openFile(page: Page, text: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Open…' }).click();
  await page.getByTestId('projects-other').click();
  await (
    await chooser
  ).setFiles({
    name: 'placed.mfe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

test('a new LaTeX text put at (−5, 3) starts its clips there: dropped, added from its menu, and after the file is opened again', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startApp(page);
  await newText(page, 'tex', 'Title');
  // The box is ticked as the workspace opens, and the line under the stage says what it places.
  await expect(keep(page)).toBeChecked();
  await expect(hint(page)).toHaveText(
    'Library object: new clips start at this position. Clips already on the timeline keep theirs.',
  );
  await place(page, '-5', '3');
  await apply(page);

  // The object keeps the place; Apply made no clip.
  const [title] = await objects(page);
  expect(title).toMatchObject({ kind: 'tex', startPosition: [-5, 3] });
  expect(await starts(page)).toEqual([]);

  // Dropped on a track, its clip starts there, and is drawn there: a click on that place of the
  // preview takes it, a click on the centre of the frame takes nothing.
  const [top, bottom] = (await getProject(page)).tracks;
  expect(await dropFormula(page, title!.id, bottom!.id, 0)).toBe(true);
  expect(await starts(page)).toEqual([[-5, 3]]);
  await setTime(page, 1);
  await waitForDrawables(page, 5);
  const [dropped] = (await getProject(page)).clips;
  await clickScene(page, [0, 0]);
  expect(await selectionOf(page)).toMatchObject({ kind: 'none' });
  await clickScene(page, [-5, 3]);
  expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: [dropped!.id] });

  // «Add to the timeline» starts the next one there too; one undo step takes it back.
  await addFromMenu(page);
  expect(await starts(page)).toEqual([
    [-5, 3],
    [-5, 3],
  ]);
  expect((await getProject(page)).clips[1]!.trackId).toBe(top!.id);
  await undo(page);
  expect(await starts(page)).toEqual([[-5, 3]]);

  // The file keeps it: saved, and opened in a new project, the text still starts its clips there.
  const download = page.waitForEvent('download');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Save', exact: true }).click();
  const text = readFileSync(await (await download).path(), 'utf8');
  expect(JSON.parse(text).formulas[0]).toMatchObject({ startPosition: [-5, 3] });
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'New', exact: true }).click();
  await expect.poll(async () => (await objects(page)).length).toBe(0);
  await openFile(page, text);
  await expect.poll(async () => (await objects(page))[0]?.startPosition).toEqual([-5, 3]);
  await addFromMenu(page);
  expect(await starts(page)).toEqual([
    [-5, 3],
    [-5, 3],
  ]);
});

test('unticked, the place on the stage is not saved; changed later, only the clips made afterwards follow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startApp(page);
  await newText(page, 'tex', 'Title');
  await place(page, '-5', '3');
  await keep(page).uncheck();
  await expect(hint(page)).toHaveText(
    'Library object: stage placement is provisional and is not saved.',
  );
  await apply(page);
  expect((await objects(page))[0]).not.toHaveProperty('startPosition');
  await addFromMenu(page);
  expect(await starts(page)).toEqual([[0, 0]]);

  // Opened again from the Creator: at the centre, the box ticked again — it is not remembered.
  await page.getByTestId('formula-item').first().dblclick();
  await expect(workspace(page)).toBeVisible();
  await expect(page.getByTestId('text-stage-canvas')).toHaveAttribute('data-position', '0,0');
  await expect(keep(page)).toBeChecked();
  await place(page, '2', '-1.5');
  await apply(page);
  expect((await objects(page))[0]!.startPosition).toEqual([2, -1.5]);
  // The clip it had stays where it was; the next one starts at the new place.
  await setTime(page, 4);
  await addFromMenu(page);
  expect(await starts(page)).toEqual([
    [0, 0],
    [2, -1.5],
  ]);

  // Opened once more, the stage shows the text where it keeps its clips; unticked, a move there
  // changes nothing.
  await page.getByTestId('formula-item').first().dblclick();
  await expect(page.getByTestId('text-stage-canvas')).toHaveAttribute('data-position', '2,-1.5');
  await place(page, '6', '0');
  await keep(page).uncheck();
  await apply(page);
  expect((await objects(page))[0]!.startPosition).toEqual([2, -1.5]);

  // From a clip the stage places that clip: no box, and the object's place is left alone.
  const first = (await getProject(page)).clips[0]!;
  await page.getByTestId(`clip-${first.id}`).dblclick({ position: { x: 60, y: 10 } });
  await expect(workspace(page)).toBeVisible();
  await expect(keep(page)).toHaveCount(0);
  await expect(hint(page)).toContainText('clip initial state');
  await place(page, '-3', '1');
  await apply(page);
  expect(await starts(page)).toEqual([
    [-3, 1],
    [2, -1.5],
  ]);
  expect((await objects(page))[0]!.startPosition).toEqual([2, -1.5]);
});

test('a font text keeps its place the same way, drawn as boxes without a companion', async ({
  page,
}) => {
  await page.route('http://127.0.0.1:7799/**', (route) => route.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await startApp(page);
  await newText(page, 'text', 'Words');
  await expect(page.getByTestId('text-render-status')).toContainText('Placeholder boxes');
  await expect(keep(page)).toBeChecked();
  await place(page, '2.5', '-1.25');
  await apply(page);
  expect((await objects(page))[0]).toMatchObject({ kind: 'text', startPosition: [2.5, -1.25] });

  await addFromMenu(page);
  expect(await starts(page)).toEqual([[2.5, -1.25]]);
  await setTime(page, 1);
  await waitForDrawables(page, 5);
  const [clip] = (await getProject(page)).clips;
  await clickScene(page, [0, 0]);
  expect(await selectionOf(page)).toMatchObject({ kind: 'none' });
  await clickScene(page, [2.5, -1.25]);
  expect(await selectionOf(page)).toMatchObject({ kind: 'clips', ids: [clip!.id] });
});
