/* Helpers for the relation specs: a project with two formulas on two tracks, and clicking the
 * glyphs of the relation editor by their label. */
import { expect, type Locator, type Page } from '@playwright/test';
import { clipJson, project, type ClipJson } from './timelineHelpers';
import { openWithProject, projectFile, type MfeWindow } from './helpers';

const NONE = {
  kind: 'none',
  duration: 0,
  easing: 'linear',
  lagRatio: null,
  shift: [0, 0],
  scale: 1,
};

/** A clip without intro and outro animation (the formula simply appears). */
export function plain(
  id: string,
  formulaId: string,
  trackId: string,
  start: number,
  end: number,
  fields: Partial<ClipJson> = {},
): ClipJson {
  return clipJson(id, formulaId, trackId, start, end, {
    intro: NONE as ClipJson['intro'],
    outro: NONE as ClipJson['outro'],
    ...fields,
  });
}

/** Shows a tab of the relation editor's side column: its pairs, or how it is animated (the
 * timing, the style, and what the unpaired glyphs do). */
export async function relationTab(page: Page, tab: 'pairs' | 'animation'): Promise<void> {
  await page.getByTestId(`rel-side-tab-${tab}`).click();
  await expect(page.getByTestId(`rel-side-panel-${tab}`)).toBeVisible();
}

export interface RelFormula {
  id: string;
  name: string;
  source: string;
  color?: string;
}

/** Formulas `fa` (a+b=c) and `fb` (a=3+1) unless told otherwise; tracks t1…t3. */
export function relationProject(
  clips: ClipJson[],
  formulas: RelFormula[] = [
    { id: 'fa', name: 'f1', source: 'a+b=c', color: '#83C167' },
    { id: 'fb', name: 'f2', source: 'a=3+1', color: '#58C4DD' },
  ],
  extra: Record<string, unknown> = {},
): string {
  return projectFile(
    'relations',
    formulas.map((f) => ({ ...f, color: f.color ?? '#58C4DD' })),
    clips,
    extra,
  );
}

export async function openRelationScene(
  page: Page,
  clips: ClipJson[],
  extra: Record<string, unknown> = {},
  formulas?: RelFormula[],
): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openWithProject(page, relationProject(clips, formulas, extra));
  await expect(page.getByTestId('timeline-view')).toBeVisible();
  // Wait until every formula has a render (the snapshot appears once it has).
  await expect
    .poll(async () =>
      (await project(page)).formulas.every((f) => (f as { snapshot?: unknown }).snapshot),
    )
    .toBeTruthy();
}

/** The glyph of one side of the relation editor with the given label (the `nth` such glyph). */
export function glyph(page: Page, side: 'from' | 'to', label: string, nth = 0): Locator {
  return page.locator(`[data-testid^="rel-${side}-glyph-"][data-label="${label}"]`).nth(nth);
}

export interface StoredPair {
  from: number[];
  to: number[];
  style: string | null;
  /** Several sources, one target: how those beyond the first arrive (absent = separate). */
  extras?: 'separate' | 'merge' | 'copies';
}

export interface StoredRelation {
  id: string;
  fromClipId: string;
  toClipId: string;
  offset: number;
  duration: number;
  easing: string;
  style: string;
  pathArc: number;
  pairs: StoredPair[];
}

export async function relations(page: Page): Promise<StoredRelation[]> {
  return (await project(page)).relations as unknown as StoredRelation[];
}

export async function selectRelation(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (id) => (window as MfeWindow).__mfe!.useUiStore.getState().select({ kind: 'relation', id }),
    id,
  );
  await expect(page.getByTestId('relation-properties')).toBeVisible();
}

export async function selectClip(page: Page, id: string): Promise<void> {
  await page.getByTestId(`clip-${id}`).click({ position: { x: 30, y: 8 } });
  await expect(page.getByTestId('clip-properties')).toBeVisible();
}

export interface Centroid {
  count: number;
  x: number;
  y: number;
}

/** Centroid (canvas pixels) of the pixels of one colour on the preview canvas; `match` receives
 * r, g, b in 0…255. */
export async function colorCentroid(
  page: Page,
  match: 'yellow' | 'white' | 'any',
): Promise<Centroid> {
  return page.getByTestId('preview-canvas').evaluate((element, which) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        const ok =
          which === 'yellow'
            ? r > 120 && g > 120 && b < 0.5 * Math.min(r, g)
            : which === 'white'
              ? r > 200 && g > 200 && b > 200
              : r + g + b > 60;
        if (!ok) continue;
        count++;
        sx += x;
        sy += y;
      }
    }
    return { count, x: count ? sx / count : NaN, y: count ? sy / count : NaN };
  }, match);
}

/** A hash of the canvas pixels (equal canvases, equal hash). */
export async function canvasHash(page: Page): Promise<string> {
  return page.getByTestId('preview-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return canvas.toDataURL('image/png');
  });
}
