/* The whole flow of phase 6's acceptance, through the UI only (the dev handle is used to read
 * state, never to change it): create two formulas, put them on the timeline, give one an intro,
 * relate them, then export the Python scene, a video and the project file. */
import { expect, test, type Page } from './test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { addFormulaViaUi, closeEditor, startApp, waitForDrawables } from './creatorHelpers';
import type { MfeWindow } from './helpers';
import { canvasHash } from './relationsHelpers';
import { laneY, project as getProject, timeToX } from './timelineHelpers';

/** Drag the formula card named `name` from the Creator onto `trackId` at time `t`. */
async function dragFormulaToTimeline(page: Page, name: string, trackId: string, t: number) {
  const card = page.locator(`[data-testid="formula-item"][data-name="${name}"]`);
  const lane = page.getByTestId(`track-lane-${trackId}`);
  const box = (await lane.boundingBox())!;
  await card.dragTo(lane, {
    targetPosition: {
      x: (await timeToX(page, t)) - box.x,
      y: (await laneY(page, trackId)) - box.y,
    },
  });
}

/** Frames of a video file (ffprobe). */
function frameCount(path: string): number {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=nb_read_frames',
    '-of',
    'csv=p=0',
    path,
  ]);
  return Number(out.toString().trim());
}

test('create → animate → relate → export, from the UI', async ({ page }) => {
  test.slow(); // two renders, a video encode and three downloads
  // The app never finds a companion (a developer may have one running on :7799).
  await page.route('http://127.0.0.1:7799/**', (route) => route.abort('connectionrefused'));
  await startApp(page);

  // Create: two formulas in the Creator.
  await addFormulaViaUi(page, 'a+b=c');
  await closeEditor(page);
  await addFormulaViaUi(page, 'c=b+a');
  await closeEditor(page);
  await expect(page.getByTestId('formula-item')).toHaveCount(2);

  // Put them on the timeline: f1 at 0 s on the top track, f2 at 1 s on the one below, so that
  // they overlap.
  const tracks = (await getProject(page)).tracks.map((t) => t.id);
  await dragFormulaToTimeline(page, 'f1', tracks[0]!, 0);
  await dragFormulaToTimeline(page, 'f2', tracks[1]!, 1);
  let project = await getProject(page);
  expect(project.clips).toHaveLength(2);
  const [c1, c2] = project.clips;
  expect([c1!.trackId, c2!.trackId]).toEqual(tracks);
  expect(c1!.start).toBeCloseTo(0, 1);
  expect(c2!.start).toBeCloseTo(1, 1);

  // Animate: the first clip writes itself in.
  await page.getByTestId(`clip-${c1!.id}`).click({ position: { x: 30, y: 8 } });
  await page.getByTestId('animations-tab-timing').click();
  await page.getByTestId('intro-kind').selectOption('write');
  project = await getProject(page);
  expect(project.clips[0]!.intro.kind).toBe('write');

  // Relate: Shift shows the link ports; click the first clip's, then the second clip.
  await page.keyboard.down('Shift');
  await page.getByTestId(`clip-${c1!.id}-link`).click();
  await page.keyboard.up('Shift');
  await page.getByTestId(`clip-${c2!.id}`).click({ position: { x: 40, y: 8 } });
  const editor = page.getByTestId('relation-editor');
  await expect(editor).toContainText('Relation: f1 → f2');
  await page.getByTestId('rel-auto-link').click();
  await page.getByTestId('rel-suggestion-accept').click();
  await expect(page.getByTestId('rel-side-tab-pairs')).toHaveText('Pairs (5)');
  await page.getByTestId('rel-save').click();
  await expect(editor).toHaveCount(0);
  project = await getProject(page);
  expect(project.relations).toHaveLength(1);

  // Play it back: inside the relation's window the glyphs move from one formula to the other.
  const relation = project.relations[0] as unknown as { offset: number; duration: number };
  const windowStart = project.clips.find((c) => c.id === c2!.id)!.start + relation.offset;
  const ruler = (await page.getByTestId('timeline-ruler').boundingBox())!;
  const seek = async (t: number) => page.mouse.click(await timeToX(page, t), ruler.y + 10);
  await seek(windowStart);
  await waitForDrawables(page, 5);
  const atStart = await canvasHash(page);
  await seek(windowStart + relation.duration / 2);
  await expect.poll(() => canvasHash(page)).not.toBe(atStart);

  // Export the Python scene (ManimCE).
  await page.waitForFunction(
    () => (window as MfeWindow).__mfe!.useRenderStore.getState().resolved.size === 2,
  );
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  const code = page.getByTestId('export-python-code');
  await expect(code).toContainText('from manim import *');
  const pyDownload = page.waitForEvent('download');
  await page.getByTestId('export-python-download').click();
  const py = readFileSync((await (await pyDownload).path())!, 'utf8');
  expect(py).toMatch(/^class \w+\(Scene\):$/m);
  expect(py).toContain('self.play(Write(');
  expect(py).toContain('Transform');
  await page.getByTestId('export-python-close').click();

  // Export a small video in the browser.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-video').click();
  await page.getByTestId('video-size-preset').selectOption('custom');
  await page.getByTestId('video-width').fill('320');
  await page.getByTestId('video-height').fill('180');
  await page.getByTestId('video-fps').selectOption('custom');
  await page.getByTestId('video-custom-fps').fill('10');
  const summary = (await page.getByTestId('video-summary').textContent()) ?? '';
  const frames = Number(/^(\d+) frames/.exec(summary)![1]);
  const videoDownload = page.waitForEvent('download');
  await page.getByTestId('video-start').click();
  const video = await videoDownload;
  await expect(page.getByTestId('video-done')).toBeVisible();
  expect(frameCount((await video.path())!)).toBe(frames);
  await page.keyboard.press('Escape');

  // Save the project and read the file back.
  const saved = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  const file = JSON.parse(readFileSync((await (await saved).path())!, 'utf8')) as {
    formulas: unknown[];
    clips: unknown[];
    relations: { pairs: unknown[] }[];
  };
  expect(file.formulas).toHaveLength(2);
  expect(file.clips).toHaveLength(2);
  expect(file.relations[0]!.pairs).toHaveLength(5);
  await expect(page.getByTestId('doc-status')).toHaveText('Saved');
});
