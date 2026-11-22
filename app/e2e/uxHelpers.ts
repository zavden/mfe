/* Helpers for the UX-batch specs: the preview's transform handles (read from the data attributes
 * the preview exposes, since the canvas itself cannot be inspected) and small project setups. */
import { expect, type Page } from '@playwright/test';
import { openWithProject, readExample, selectionOf, setTime, type MfeWindow } from './helpers';

export { canUndo, selectionOf, setTime, undo } from './helpers';

export type Point = [number, number];

export async function canvasBoxOf(page: Page) {
  const box = await page.getByTestId('preview-canvas').boundingBox();
  if (!box) throw new Error('no preview canvas');
  return box;
}

/** Handle positions in CSS px from the canvas's top-left corner. */
export interface HandlePoints {
  nw: Point;
  ne: Point;
  se: Point;
  sw: Point;
  rotate: Point;
  center: Point;
}

export async function handlePoints(page: Page): Promise<HandlePoints | null> {
  const raw = await page.getByTestId('preview-frame').getAttribute('data-transform-handles');
  return raw ? (JSON.parse(raw) as HandlePoints) : null;
}

/** A canvas-relative point as page coordinates (for `page.mouse`). */
export async function pagePoint(page: Page, point: Point): Promise<{ x: number; y: number }> {
  const box = await canvasBoxOf(page);
  return { x: box.x + point[0], y: box.y + point[1] };
}

export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Direction of `to` seen from `from` in scene terms: degrees counter-clockwise, y up on screen. */
export const screenAngle = (from: Point, to: Point) =>
  (Math.atan2(-(to[1] - from[1]), to[0] - from[0]) * 180) / Math.PI;

/** Load the hello example and select its first clip by clicking it (shown fully at 1.5 s). */
export async function openHelloSelected(page: Page): Promise<void> {
  await openWithProject(page, readExample('hello.mfe.json'));
  await setTime(page, 1.5);
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="preview-frame"]')
          ?.getAttribute('data-drawable-count'),
      ) >= 6,
  );
  const box = await canvasBoxOf(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await selectionOf(page)).ids).toEqual(['c_a1']);
}

export interface ClipPlacement {
  position: [number, number];
  scale: number;
  rotation: number;
}

/** The hello clip's initial keyframe. */
export async function helloInitial(page: Page): Promise<ClipPlacement> {
  return page.evaluate(() => {
    const clip = (window as MfeWindow)
      .__mfe!.useProjectStore.getState()
      .project.clips.find((c) => c.id === 'c_a1') as unknown as { initial: ClipPlacement };
    return JSON.parse(JSON.stringify(clip.initial)) as ClipPlacement;
  });
}

/** Select clips through the dev handle (its typed surface only lists what the specs use). */
export async function selectClips(page: Page, ids: string[]): Promise<void> {
  await page.evaluate((clipIds) => {
    const ui = (window as MfeWindow).__mfe!.useUiStore.getState() as unknown as {
      select(selection: { kind: 'clips'; ids: string[] }): void;
    };
    ui.select({ kind: 'clips', ids: clipIds });
  }, ids);
}
