/* The scene and the entry of «To another formula or glyphs…» (D123) for the specs that turn the
 * mode on: `shapeRetarget.spec.ts`, and the keys and the exclusion of the Preview's modes. */
import { expect, type Page } from './test';
import { openSubmenu, setTime, type MfeWindow } from './helpers';
import { openRelationScene, plain } from './relationsHelpers';
import { box, timeToX } from './timelineHelpers';

export interface Fit {
  clipId: string;
  glyphs: number[] | 'all';
  also?: { clipId: string; glyphs: number[] | 'all' }[];
  fitted: { center: [number, number]; width: number; height: number } | null;
}
export interface Tween {
  id: string;
  kind: string;
  start: number;
  duration: number;
  to: Record<string, unknown>;
  fit?: Fit;
}

/** The shape's clip, its object and its tweens, from the store. */
export async function shapeOf(page: Page) {
  return page.evaluate(() => {
    const p = (window as MfeWindow).__mfe!.useProjectStore.getState().project as unknown as {
      formulas: { id: string; kind: string; name: string; width: number; height: number }[];
      clips: {
        id: string;
        formulaId: string;
        start: number;
        initial: { position: [number, number] };
        actions: unknown[];
      }[];
    };
    const object = p.formulas.find((f) => f.kind === 'shape')!;
    const clip = p.clips.find((c) => c.formulaId === object.id)!;
    return { clip, object, tweens: clip.actions as unknown as Tween[] };
  });
}

/** f1 (a+b=c) up on the left and f2 (a=3+1) down on the right, both over [0, 8); a box around
 * the first from 1 s; the playhead at 3 s. */
export async function openScene(page: Page): Promise<void> {
  const a = plain('a', 'fa', 't1', 0, 8);
  a.initial.position = [-3, 1.5];
  const b = plain('b', 'fb', 't2', 0, 8);
  b.initial.position = [3, -1.5];
  await openRelationScene(page, [a, b]);
  await setTime(page, 1);
  const clip = await box(page.getByTestId('clip-a'));
  await page.mouse.click(await timeToX(page, 1), clip.y + clip.height - 6, { button: 'right' });
  await openSubmenu(page, 'add-shape');
  await page.getByTestId('add-shape-box').click();
  await setTime(page, 3);
}

/** Right-click the shape's clip on the timeline and start the mode from its Transform entry. */
export async function startFromClip(page: Page): Promise<void> {
  const { clip } = await shapeOf(page);
  const b = await box(page.getByTestId(`clip-${clip.id}`));
  await page.mouse.click(await timeToX(page, 3), b.y + b.height - 6, { button: 'right' });
  await openSubmenu(page, 'add-animation-group-transform');
  await page.getByTestId('add-animation-retarget').click();
  await expect(page.getByTestId('retarget-hint')).toBeVisible();
}

export const F1: [number, number] = [-3, 1.5];
export const F2: [number, number] = [3, -1.5];
