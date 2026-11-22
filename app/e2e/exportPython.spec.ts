/* Export → Python: open the dialog from the menu, read the generated scene, download it. */
import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import { forceFallbackFilePaths } from './creatorHelpers';
import { openWithProject, readExample, type MfeWindow } from './helpers';

test('exports hello.mfe.json to ManimCE and ManimGL', async ({ page }) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  // The export waits for the formula renders (MathJax without a companion).
  await page.waitForFunction(
    () => (window as MfeWindow).__mfe!.useRenderStore.getState().resolved.size === 2,
  );

  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  const dialog = page.getByTestId('export-python');
  await expect(dialog).toBeVisible();
  const code = page.getByTestId('export-python-code');
  await expect(code).toContainText('from manim import *');
  await expect(code).toContainText('MathTex(r"mx+y=0")');
  await expect(page.getByTestId('export-python-scene-name')).toHaveValue('HelloOneToOne');

  const download = page.waitForEvent('download');
  await page.getByTestId('export-python-download').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('HelloOneToOne.py');
  const text = readFileSync((await file.path())!, 'utf8');
  expect(text).toContain('class HelloOneToOne(Scene):');
  expect(text).toContain('self.play(Write(a1), run_time=1)');

  await page.getByTestId('export-python-close').click();
  await expect(dialog).toBeHidden();

  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-gl').click();
  await expect(page.getByTestId('export-python-code')).toContainText(
    'a1 = Tex(r"mx+y=0", font_size=',
  );
  await expect(page.getByTestId('export-python-code')).toContainText('from manimlib import *');
  await expect(page.getByTestId('export-python-issues')).toContainText('ManimGL');
});

test('with the positional helper ticked, the notes do not promise exact glyph indices', async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  await page.waitForFunction(
    () => (window as MfeWindow).__mfe!.useRenderStore.getState().resolved.size === 2,
  );
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  const issues = page.getByTestId('export-python-issues');
  // The file keeps the exact glyphs of a LaTeX render: the scene names them by index.
  await expect(issues).toHaveText(
    'The scene reproduces the preview: exact glyph indices, whole frames.',
  );
  await expect(page.getByTestId('export-python-code')).not.toContainText('_glyphs(');
  // Ticked, every formula is matched by position when the scene runs: the line says so.
  await page.getByTestId('export-python-indexing').check();
  await expect(page.getByTestId('export-python-code')).toContainText('a1_g = _glyphs(a1, [');
  await expect(issues).toHaveText(
    'The scene reproduces the preview: glyphs matched by position when it runs, whole frames.',
  );
});

test('exports appear, disappear and part transform blocks', async ({ page }) => {
  const project = JSON.parse(readExample('hello.mfe.json')) as {
    clips: { id: string; actions: unknown[] }[];
  };
  // a1's "0" (glyph 5) fades out early instead of with the outro.
  project.clips[0]!.actions.push({
    id: 'a_block',
    kind: 'disappear',
    start: 1.2,
    duration: 0.3,
    easing: 'smooth',
    anim: 'fade_out',
    glyphs: [5],
    lagRatio: null,
    shift: [0, 0],
    scale: 1,
  });
  await openWithProject(page, JSON.stringify(project));
  await page.waitForFunction(
    () => (window as MfeWindow).__mfe!.useRenderStore.getState().resolved.size === 2,
  );
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText(
    'self.play(FadeOut(a1[0][5]), run_time=0.3)',
  );
  await expect(page.getByTestId('export-python-issues')).not.toContainText('not exported');
  await page.getByTestId('export-python-close').click();

  // A part transform (a1's "m" rises) becomes an .animate call on that glyph.
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      (draft as unknown as { clips: { actions: unknown[] }[] }).clips[0]!.actions.push({
        id: 'a_part',
        kind: 'transform',
        start: 1,
        duration: 0.2,
        easing: 'smooth',
        glyphs: [0],
        shift: [0, 1],
        scale: 1,
        rotation: 0,
        color: null,
        opacity: null,
      });
    });
  });
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText(
    'self.play(a1[0][0].animate.shift(UP), run_time=0.2)',
  );
  await expect(page.getByTestId('export-python-issues')).not.toContainText('not exported');
});

test('an empty formula on the timeline is left out instead of waited for', async ({ page }) => {
  const project = JSON.parse(readExample('hello.mfe.json')) as {
    formulas: { source: string }[];
  };
  project.formulas[0]!.source = '';
  await openWithProject(page, JSON.stringify(project));
  await page.waitForFunction(
    () => (window as MfeWindow).__mfe!.useRenderStore.getState().resolved.size === 1,
  );
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-waiting')).toHaveCount(0);
  await expect(page.getByTestId('export-python-issues')).toContainText(
    'Formula "a1" is empty; its clips are left out.',
  );
  await expect(page.getByTestId('export-python-code')).not.toContainText('MathTex(r"")');
  await expect(page.getByTestId('export-python-download')).toBeEnabled();
});

test('the Export… button opens the last Python target used; its arrow has every export', async ({
  page,
}) => {
  await openWithProject(page, readExample('hello.mfe.json'));
  const button = page.getByTestId('export-button');
  await expect(button).toHaveAttribute('title', /ManimCE/);
  await button.click();
  const dialog = page.getByTestId('export-python');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Export Python — ManimCE');
  await page.getByTestId('export-python-close').click();
  await expect(dialog).toBeHidden();
  // The arrow lists every export; ManimGL from there becomes the button's target.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-gl').click();
  await expect(dialog).toContainText('Export Python — ManimGL');
  await page.getByTestId('export-python-close').click();
  await expect(button).toHaveAttribute('title', /ManimGL/);
  await button.click();
  await expect(dialog).toContainText('Export Python — ManimGL');
  await page.getByTestId('export-python-close').click();
  // HTML… from the arrow, with the keyboard: ↓ opens the first entry, End reaches the last.
  await page.getByTestId('export-button-menu').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('export-button-export-ce')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByTestId('export-button-export-html')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('export-html')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-html')).toBeHidden();
  // Audio… precedes HTML.
  await page.getByTestId('export-button-menu').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('export-button-export-audio')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('audio-export')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('audio-export')).toBeHidden();
  // Image… precedes Audio.
  await page.getByTestId('export-button-menu').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('export-button-export-image')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('export-image')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-image')).toBeHidden();
  // Video… precedes Image; keep the existing keyboard-open and Escape-close coverage.
  await page.getByTestId('export-button-menu').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('export-button-export-video')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('export-video')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-video')).toBeHidden();
  // A reload keeps the last target.
  await page.reload();
  await expect(page.getByTestId('export-button')).toHaveAttribute('title', /ManimGL/);
});

for (const theme of ['dark', 'light'] as const) {
  test(`reserved Python symbols have an actionable class-name correction (${theme})`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript((value) => localStorage.setItem('mfe.theme', value), theme);
    await openWithProject(page, readExample('hello.mfe.json'));
    await page.waitForFunction(
      () => (window as MfeWindow).__mfe!.useRenderStore.getState().resolved.size === 2,
    );
    await page.getByTestId('export-button-menu').click();
    await page.getByTestId('export-button-export-ce').click();
    const name = page.getByTestId('export-python-scene-name');
    await name.fill('Circle');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(/not reserved by the generated code/)).toContainText('CircleScene');
    await expect(page.getByTestId('export-python-copy')).toBeDisabled();
    await expect(page.getByTestId('export-python-download')).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`reserved-class-${theme}.png`) });
    await name.fill('CircleScene');
    await expect(page.getByTestId('export-python-download')).toBeEnabled();
    const downloading = page.waitForEvent('download');
    await page.getByTestId('export-python-download').click();
    const file = await downloading;
    expect(readFileSync((await file.path())!, 'utf8')).toContain('class CircleScene(Scene):');
  });
}

/* With a camera that acts, the scene uses a few names more (`Restore` is one), and a class called
 * as one of them gets `Scene` after it. The dialog downloaded `Restore.py`, whose header said to
 * run `RestoreScene.py`, and a render with Manim asked the companion for `Restore` (B-10 of the
 * final audit). The field, the file, the header's command, the class and the request are one
 * name: the class's. */

/** An empty scene called as the camera's `Restore`, its camera off Manim's own frame. */
const RESTORE = {
  format: 'manim-formula-editor',
  version: 36,
  meta: {
    name: 'Restore',
    target: 'ce',
    width: 320,
    height: 180,
    fps: 12,
    background: '#000000',
    preamble: '',
    duration: 2,
  },
  formulas: [],
  tracks: [],
  clips: [],
  audioAssets: [],
  audioClips: [],
  relations: [],
  colorMatches: [],
  camera: { initial: { center: [1, 0], height: 8 }, targets: [], moves: [] },
};

/** A companion that renders with Manim, as far as its health says: the request for a render is
 * what the test reads, and it is refused. No Manim runs. */
async function observeRender(page: Page) {
  const host = 'http://127.0.0.1:7799';
  await page.route(`${host}/**`, async (route) => {
    const headers = { 'access-control-allow-origin': '*' };
    if (new URL(route.request().url()).pathname === '/health') {
      return route.fulfill({
        headers,
        json: {
          name: 'mfe-companion',
          version: '1.7.0',
          protocol: 1,
          capabilities: {
            latex: false,
            dvisvgm: false,
            ffmpeg: true,
            manimRender: true,
            manimCE: { python: '/ce', version: '0.20.1' },
            manimGL: { python: '/gl', version: '1.7.2' },
          },
        },
      });
    }
    return route.fulfill({ headers, status: 400, json: { error: 'Stopped after the request' } });
  });
  return () =>
    page.waitForRequest(
      (request) => request.url() === `${host}/manim-render` && request.method() === 'POST',
    );
}

const classOf = (code: string) => /^class (\w+)\((?:Scene|MovingCameraScene)\):$/m.exec(code)?.[1];

for (const target of ['ce', 'gl'] as const) {
  for (const [variant, name] of [
    ['with a camera, a project called as one of its names', 'RestoreScene'],
    ['without the camera', 'Restore'],
    ['with a camera and another name', 'Lesson'],
  ] as const) {
    test(`${target}, ${variant}: the field, the file, its header, the class and the render request are ${name}`, async ({
      page,
    }) => {
      const project: Omit<typeof RESTORE, 'camera'> & { camera?: unknown } =
        structuredClone(RESTORE);
      project.meta.target = target;
      if (variant === 'without the camera') delete project.camera;
      if (name === 'Lesson') project.meta.name = 'Lesson';
      const rendering = await observeRender(page);
      await forceFallbackFilePaths(page);
      await openWithProject(page, JSON.stringify(project));

      await page.getByTestId('export-button-menu').click();
      await page.getByTestId(`export-button-export-${target}`).click();
      await expect(page.getByTestId('export-python-scene-name')).toHaveValue(name);
      await expect(page.getByTestId('export-python-scene-renamed')).toHaveCount(
        name === 'RestoreScene' ? 1 : 0,
      );
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTestId('export-python-download').click(),
      ]);
      expect(download.suggestedFilename()).toBe(`${name}.py`);
      const code = readFileSync((await download.path())!, 'utf8');
      // The command of the header: `manim … Name.py Name`, `manimgl Name.py Name …`.
      const command = /^# +((?:manim|manimgl) .+)$/m.exec(code)?.[1] ?? '';
      expect(command).toContain(`${name}.py ${name}`);
      expect(classOf(code)).toBe(name);

      await page.getByTestId('export-python-cancel').click();
      await page.getByTestId('export-button-menu').click();
      await page.getByTestId('export-button-export-video').click();
      await page.getByTestId('video-encoder-manim').check();
      await page.getByTestId('video-manim-target').selectOption(target);
      const [request] = await Promise.all([rendering(), page.getByTestId('video-start').click()]);
      const body = request.postDataJSON() as { code: string; scene: string; target: string };
      expect(body.target).toBe(target);
      expect(body.scene).toBe(name);
      expect(classOf(body.code)).toBe(name);
    });
  }
}
