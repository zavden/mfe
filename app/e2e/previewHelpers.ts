/* Helpers for the preview specs: a small project with two clips apart on screen, and scene
 * coordinates as page coordinates (the whole 16:9 frame shown, Fit). */
import type { Page } from '@playwright/test';
import { waitForDrawables } from './creatorHelpers';
import { openWithProject, setTime } from './helpers';
import { clipJson, projectJson } from './timelineHelpers';
import { canvasBoxOf, type Point } from './uxHelpers';

export type { Point } from './uxHelpers';

/** Two clips apart on screen: alpha at x = −3 until 4 s, beta at x = 3 until 3 s; playhead 2 s. */
export async function openTwoApart(page: Page): Promise<void> {
  const ca = clipJson('ca', 'fa', 't1', 0, 4);
  ca.initial.position = [-3, 0];
  const cb = clipJson('cb', 'fb', 't2', 0, 3);
  cb.initial.position = [3, 0];
  await openWithProject(page, projectJson([ca, cb]));
  await setTime(page, 2);
  await waitForDrawables(page, 9); // alpha (5 glyphs) and beta (4), both written by then
}

/** Page coordinates of a scene point, with the whole 16:9 frame shown (Fit). */
export async function scenePoint(page: Page, [x, y]: Point): Promise<{ x: number; y: number }> {
  const box = await canvasBoxOf(page);
  const frameWidth = (8 * 16) / 9;
  return {
    x: box.x + box.width / 2 + (x * box.width) / frameWidth,
    y: box.y + box.height / 2 - (y * box.height) / 8,
  };
}

export type Modifier = 'ControlOrMeta' | 'Shift' | 'Alt';

export async function clickScene(page: Page, point: Point, modifier?: Modifier): Promise<void> {
  const { x, y } = await scenePoint(page, point);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.click(x, y);
  if (modifier) await page.keyboard.up(modifier);
}

/** Press at `from` and move to `to` in steps, without releasing (the caller ends the drag and
 * lifts the modifier). */
export async function pressAndMove(
  page: Page,
  from: Point,
  to: Point,
  modifier?: Modifier,
): Promise<void> {
  const a = await scenePoint(page, from);
  const b = await scenePoint(page, to);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
}

/** The colour of the preview's pixel at a scene point, as [r, g, b]. */
export async function pixelAt(page: Page, point: [number, number]): Promise<number[]> {
  const at = await scenePoint(page, point);
  const canvas = await canvasBoxOf(page);
  return page.evaluate(
    ([x, y, left, top, width]) => {
      const el = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
      const k = el.width / width; // bitmap pixels per CSS pixel
      const px = Math.round((x - left) * k);
      const py = Math.round((y - top) * k);
      return [...el.getContext('2d')!.getImageData(px, py, 1, 1).data].slice(0, 3);
    },
    [at.x, at.y, canvas.x, canvas.y, canvas.width] as const,
  );
}
