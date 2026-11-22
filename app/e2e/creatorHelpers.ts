/* Helpers shared by the Phase 2 specs (Creator, files, preview). */
import { expect, type Locator, type Page } from '@playwright/test';
import type { MfeWindow } from './helpers';

/** Chrome's File System Access pickers cannot be automated: remove them so the app takes its
 * download / file-input fallback path. Call before `page.goto`. The app tells a browser without
 * them what it cannot do, in a notice that stays (`ui/project/fileAccess.ts`): the session is
 * marked as told, so that the notice does not sit over what a spec presses
 * (`fileAccess.spec.ts` is where it is read). */
export async function forceFallbackFilePaths(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
    delete w.showDirectoryPicker;
    try {
      window.sessionStorage.setItem('mfe.fileAccess.told', '1');
    } catch {
      // No session storage: the notice shows, as it would for a user.
    }
  });
}

/** Pin the glyph source to MathJax so a companion running on this machine cannot change glyph
 * order or badges under the tests. */
export async function pinMathJax(page: Page): Promise<void> {
  await page.getByTestId('menu-view').click();
  await page.getByRole('menuitemradio', { name: 'Glyph source: MathJax' }).click();
}

export async function startApp(page: Page): Promise<void> {
  await forceFallbackFilePaths(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await pinMathJax(page);
}

/** Press "+ New", type the LaTeX in the raw field and apply it. Leaves the editor open. */
export async function addFormulaViaUi(page: Page, latex: string): Promise<Locator> {
  await page.getByTestId('creator-new').click();
  const editor = page.getByTestId('formula-editor');
  await editor.getByTestId('raw-latex').fill(latex);
  await editor.getByTestId('editor-apply').click();
  return editor;
}

/** Asks a glyph view (the formula editor's, the text workspace's) for the list of its glyphs,
 * a key per glyph under the drawing: it is left out unless its key is pressed. The choice is a
 * preference: pressed once, it holds for the rest of the test. The key waits for the glyphs. */
export async function showGlyphList(scope: Page | Locator): Promise<void> {
  const key = scope.getByTestId('glyph-list-toggle');
  if ((await key.getAttribute('aria-pressed')) !== 'true') await key.click();
}

/** Press the key of the Creator's toolbar that switches its list to the other view (D179), and
 * wait for the list to show `view`, the one the press is meant to bring. */
export async function switchCreatorView(page: Page, view: 'list' | 'grid'): Promise<void> {
  await page.getByTestId('creator-view-toggle').click();
  await expect(page.getByTestId('formula-list')).toHaveAttribute('data-view', view);
}

export async function closeEditor(page: Page): Promise<void> {
  await page.getByTestId('editor-close').click();
  await page.getByTestId('formula-editor').waitFor({ state: 'detached' });
}

export interface CanvasStats {
  width: number;
  height: number;
  /** Pixels that are not the background colour. */
  ink: number;
  white: number;
  /** Yellow by its hue, dim or full: over the black background a thin stroke is anti-aliased
   * into dimmer pixels of the same hue, and how many of them stay fully yellow depends on where
   * it falls and on who draws it. */
  yellow: number;
  /** Bounding box of the ink in canvas pixels, or null when the canvas is blank. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

/** Count pixels on the preview canvas by colour (the background is assumed to be black). */
export async function canvasStats(page: Page): Promise<CanvasStats> {
  return page.getByTestId('preview-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    let white = 0;
    let yellow = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        if (r + g + b < 60) continue;
        ink++;
        if (r > 200 && g > 200 && b > 200) white++;
        // Red and green alike, little blue: an orange (#FF862F) or a gold is not it.
        if (r > 120 && Math.abs(r - g) <= 0.1 * r && b < 0.5 * Math.min(r, g)) yellow++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return {
      width,
      height,
      ink,
      white,
      yellow,
      bounds: ink > 0 ? { minX, minY, maxX, maxY } : null,
    };
  });
}

/** Wait until the preview has drawn at least `count` drawables (renders are asynchronous). */
export async function waitForDrawables(page: Page, count = 1): Promise<void> {
  await page.waitForFunction(
    (n) =>
      Number(
        document
          .querySelector('[data-testid="preview-frame"]')
          ?.getAttribute('data-drawable-count'),
      ) >= n,
    count,
  );
}
