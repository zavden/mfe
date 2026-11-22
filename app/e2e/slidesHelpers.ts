/* Helpers for the specs of the Slides mode (D200): marks for a project file, and the marks the
 * app holds. */
import type { Page } from '@playwright/test';
import type { MfeWindow } from './helpers';

export interface SlideMarkJson {
  id: string;
  time: number;
  kind: 'pause' | 'comment';
  text?: string;
  skipWait?: boolean;
}

/** The Slides mode of the project the app holds; null while it is off. */
export async function slidesOf(page: Page): Promise<{ marks: SlideMarkJson[] } | null> {
  return page.evaluate(() => {
    const { project } = (window as MfeWindow).__mfe!.useProjectStore.getState();
    const slides = (project as unknown as { slides?: unknown }).slides;
    return slides === undefined ? null : (JSON.parse(JSON.stringify(slides)) as unknown);
  }) as Promise<{ marks: SlideMarkJson[] } | null>;
}

/** The marks of the project the app holds, as stored (none while the mode is off). */
export async function marksOf(page: Page): Promise<SlideMarkJson[]> {
  return (await slidesOf(page))?.marks ?? [];
}
