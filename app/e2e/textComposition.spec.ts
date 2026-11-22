import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import {
  createClip,
  createEmptyProject,
  createTextFormula,
  defaultIntro,
  defaultOutro,
  serializeProject,
  type TextRequestBasis,
} from '../src/model';
import { toSnapshot } from '../src/engine/key';
import { textArtifactRender } from '../src/engine/pango';
import { textGeometry, textResponse } from '../src/test/textGeometry';
import { forceFallbackFilePaths } from './creatorHelpers';
import { getProject, openWithProject, type MfeWindow } from './helpers';

/* Deterministic transport fixtures exercise the real editor/engine/store boundary. Actual
 * native contour fidelity belongs to the separate Pango native acceptance tests. */
async function companion(page: Page) {
  await page.route('http://127.0.0.1:7799/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (path === '/health') {
      await route.fulfill({
        json: {
          name: 'mfe-companion',
          protocol: 1,
          version: '1.5',
          capabilities: {
            latex: false,
            dvisvgm: false,
            ffmpeg: false,
            manimCE: null,
            manimGL: null,
            pango: {
              ce: {
                state: 'ready',
                adapterVersion: 'test-adapter',
                environmentKey: 'test-environment',
              },
            },
          },
        },
        headers,
      });
    } else if (path === '/fonts') {
      await route.fulfill({
        json: {
          ok: true,
          target: 'ce',
          adapterVersion: 'test-adapter',
          environmentKey: 'test-environment',
          fonts: [
            {
              family: 'Noto Sans',
              faces: [{ name: 'Regular', weight: 'normal', slant: 'normal', synthetic: false }],
            },
          ],
        },
        headers,
      });
    } else if (path === '/text') {
      const request = route.request().postDataJSON() as TextRequestBasis;
      const artifact = textGeometry(request.source, undefined, request.target);
      artifact.key += `-${request.fontSize}-${request.font.weight}-${request.font.slant}`;
      await route.fulfill({ json: textResponse(artifact), headers });
    } else
      await route.fulfill({ status: 404, json: { error: 'Unknown fixture endpoint' }, headers });
  });
}

const ready = (page: Page) =>
  expect(page.getByTestId('text-render-status')).toHaveText('Current Pango geometry');

test('portrait Fit keeps the complete scene frame visible and preserves its aspect ratio', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await companion(page);
  const project = createEmptyProject();
  project.meta.width = 1080;
  project.meta.height = 1920;
  project.formulas = [createTextFormula({ source: 'ABC', name: 'portrait' })];
  await openWithProject(page, serializeProject(project));
  await page.getByTestId('formula-item').dblclick();
  await ready(page);
  const canvas = (await page.getByTestId('text-stage-canvas').boundingBox())!;
  const body = (await page.getByTestId('text-composition').locator('.modal-body').boundingBox())!;
  expect(canvas.width / canvas.height).toBeCloseTo(1080 / 1920, 3);
  expect(canvas.y).toBeGreaterThanOrEqual(body.y);
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(body.y + body.height);
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(800);
  await page.getByTestId('text-cancel').click();
});

test('Creator drafts stay library-only; native text undo and the field survive responsive resize', async ({
  page,
}) => {
  await companion(page);
  await openWithProject(page, serializeProject(createEmptyProject()));
  await page.getByTestId('creator-new-menu').click();
  await page.getByTestId('creator-new-text').click();
  const field = page.getByTestId('text-source');
  await field.fill('Título: café é\nabc אבג سلام');
  await ready(page);
  expect((await getProject(page)).formulas).toHaveLength(0);
  const node = await field.elementHandle();
  await page.keyboard.type('XYZ');
  await page.setViewportSize({ width: 740, height: 850 });
  expect(await field.evaluate((element, previous) => element === previous, node)).toBe(true);
  const beforeUndo = await field.inputValue();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => field.inputValue()).not.toBe(beforeUndo);
  expect(beforeUndo.startsWith(await field.inputValue())).toBe(true);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(field).toHaveValue('Título: café é\nabc אבג سلامXYZ');
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.getByTestId('text-position-x').fill('3');
  await page.getByTestId('text-apply').click();
  await expect(page.getByTestId('text-composition')).toBeHidden();
  const saved = await getProject(page);
  expect(saved.formulas).toHaveLength(1);
  expect(saved.clips).toHaveLength(0);
  // Where it was put on the stage is where its new clips will start (D124).
  expect(saved.formulas[0]).toMatchObject({ startPosition: [3, 0] });
  await page.evaluate(() => (window as MfeWindow).__mfe!.history.undo());
  expect((await getProject(page)).formulas).toHaveLength(0);
});

test('composition drags use scene coordinates; source and selected placement apply in one operation', async ({
  page,
}) => {
  await companion(page);
  const p = createEmptyProject();
  const formula = createTextFormula({ source: 'AB', name: 'title' });
  const options = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  const first = createClip(formula.id, p.tracks[0]!.id, 0, 8, options);
  const second = createClip(formula.id, p.tracks[1]!.id, 0, 8, options);
  second.initial.position = [4, 0];
  p.formulas = [formula];
  p.clips = [first, second];
  await openWithProject(page, serializeProject(p));
  await page.getByTestId(`clip-${first.id}`).dblclick({ position: { x: 40, y: 29 } });
  await ready(page);
  await page.getByTestId('text-grid').uncheck();
  await page.getByTestId('text-snap').uncheck();
  const canvas = page.getByTestId('text-stage-canvas');
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + (rect.width * 2) / ((8 * p.meta.width) / p.meta.height),
    rect.y + rect.height / 2 - rect.height / 8,
    { steps: 8 },
  );
  await page.mouse.up();
  // CSS rectangles can be fractional while the backing store is rounded to device pixels.
  expect(Number(await page.getByTestId('text-position-x').inputValue())).toBeCloseTo(2, 2);
  expect(Number(await page.getByTestId('text-position-y').inputValue())).toBeCloseTo(1, 2);
  await page.getByTestId('text-position-x').fill('2');
  await page.getByTestId('text-position-y').fill('1');
  await page.getByTestId('text-source').fill('AC');
  await page.getByTestId('text-bold').check();
  await ready(page);
  await expect(page.getByTestId('text-font-styles')).toContainText(
    'Requested style may be synthesized',
  );
  expect((await getProject(page)).formulas[0]!.source).toBe('AB');
  await page.getByTestId('text-apply').click();
  await expect(page.getByTestId('text-composition')).toBeHidden();
  const saved = await page.evaluate(
    () => (window as MfeWindow).__mfe!.useProjectStore.getState().project,
  );
  expect(saved.formulas[0]!.source).toBe('AC');
  expect(saved.clips[0]).toMatchObject({ initial: { position: [2, 1] } });
  expect(saved.clips[1]).toMatchObject({ initial: { position: [4, 0] } });
  await page.evaluate(() => (window as MfeWindow).__mfe!.history.undo());
  const undone = await getProject(page);
  expect(undone.formulas[0]!.source).toBe('AB');
  expect(undone.clips[0]).toMatchObject({ initial: { position: [0, 0] } });
});

test('source composition keeps IME Escape and Cancel leaves the project unchanged', async ({
  page,
}) => {
  await companion(page);
  const p = createEmptyProject();
  const formula = createTextFormula({ source: 'Before', name: 'title' });
  p.formulas = [formula];
  await openWithProject(page, serializeProject(p));
  await page.getByTestId('formula-item').dblclick();
  const field = page.getByTestId('text-source');
  await field.focus();
  await field.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })),
  );
  await field.fill('に');
  await expect(page.getByTestId('text-apply')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('text-composition')).toBeVisible();
  await field.evaluate((element) =>
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'に' })),
  );
  await page.getByTestId('text-cancel').click();
  expect((await getProject(page)).formulas[0]!.source).toBe('Before');
});

test('Export → Python keeps Copy and Download for a font text nobody can verify now', async ({
  page,
}) => {
  await companion(page);
  const project = createEmptyProject();
  const formula = createTextFormula({ source: 'AB', name: 'title' });
  project.formulas = [formula];
  project.clips = [createClip(formula.id, project.tracks[0]!.id, 0, 4)];
  await openWithProject(page, serializeProject(project));
  // The companion shapes the text, and the project keeps that shape.
  await page.waitForFunction(() => {
    const { project: current } = (window as MfeWindow).__mfe!.useProjectStore.getState();
    const text = current.formulas[0] as { geometry?: unknown } | undefined;
    return !!text?.geometry;
  });
  const openExport = async (target: 'ce' | 'gl') => {
    await page.getByTestId('export-button-menu').click();
    await page.getByTestId(`export-button-export-${target}`).click();
    await expect(page.getByTestId('export-python')).toBeVisible();
  };
  const issues = page.getByTestId('export-python-issues');
  const code = page.getByTestId('export-python-code');

  // With the companion that shaped it there is nothing to add.
  await openExport('ce');
  await expect(code).toContainText('_mfe_verify_text(title, r"title", "ce"');
  await expect(issues).toContainText('The scene reproduces the preview');
  await page.getByTestId('export-python-close').click();

  // The companion goes away: the export says what it could not compare, and stays available.
  await page.unroute('http://127.0.0.1:7799/**');
  await page.route('http://127.0.0.1:7799/**', (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await openExport('ce');
  await expect(issues).toContainText(
    'Font text "title": not compared with the fonts of this machine',
  );
  await expect(page.getByTestId('export-python-copy')).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-python-download').click();
  const text = readFileSync((await (await download).path())!, 'utf8');
  expect(text).toContain('title = Text(r"AB"');
  expect(text).toContain('_mfe_verify_text(title, r"title", "ce"');
  expect(text).not.toContain('raise RuntimeError');
  await page.getByTestId('export-python-close').click();

  // For the library that did not shape it: the same text at a converted size, on trust.
  await openExport('gl');
  await expect(issues).toContainText('Font text "title" was shaped by ManimCE.');
  await expect(code).toContainText('font_size=70.4544');
  await expect(code).toContainText('_mfe_verify_text(title, r"title", "gl", 2)\n');
  await expect(page.getByTestId('export-python-download')).toBeEnabled();
});

/** What the page draws of its first formula: "ok: pango 2" for a font text of two glyphs drawn
 * from its geometry, "ok: boxes 2" for one drawn as placeholder boxes. */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    const [formula] = mfe.useProjectStore.getState().project.formulas;
    const entry = (formula && mfe.useRenderStore.getState().entries[formula.id]) as
      | {
          status: string;
          resolved?: { render: { backend: string; exact: boolean; glyphs: unknown[] } };
        }
      | undefined;
    const render = entry?.resolved?.render;
    const by = render && !render.exact ? 'boxes' : render?.backend;
    return `${entry?.status}: ${by} ${render?.glyphs.length}`;
  });

/** File → Open… → "Other file…", through the file input. */
async function openFile(page: Page, name: string, text: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Open…' }).click();
  await page.getByTestId('projects-other').click();
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

/** File → Save, through the download: the file's name and its text. */
async function saveFile(page: Page): Promise<{ name: string; text: string }> {
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  const file = await download;
  return { name: file.suggestedFilename(), text: readFileSync(await file.path(), 'utf8') };
}

test('a font text is saved inside the .mfe.json, and that file alone draws it again', async ({
  page,
  browser,
}) => {
  // With the companion, a text is written and shaped, and the project saved.
  await forceFallbackFilePaths(page);
  await companion(page);
  await openWithProject(page, serializeProject(createEmptyProject('Titles')));
  await page.getByTestId('creator-new-menu').click();
  await page.getByTestId('creator-new-text').click();
  await page.getByTestId('text-source').fill('AB');
  await ready(page);
  await page.getByTestId('text-apply').click();
  await expect(page.getByTestId('text-composition')).toBeHidden();
  await page.waitForFunction(() => {
    const { project } = (window as MfeWindow).__mfe!.useProjectStore.getState();
    return !!(project.formulas[0] as { geometry?: unknown } | undefined)?.geometry;
  });
  const saved = await saveFile(page);
  expect(saved.name).toBe('titles.mfe.json');
  await expect(page.getByTestId('doc-status')).toHaveText('Saved');
  const file = JSON.parse(saved.text) as {
    formulas: { geometry: { contentHash: string; byteLength: number } }[];
    textGeometry: Record<string, { format: string; basis: { source: string } }>;
  };
  const { contentHash, byteLength } = file.formulas[0]!.geometry;
  expect(Object.keys(file.textGeometry)).toEqual([contentHash]);
  expect(file.textGeometry[contentHash]).toMatchObject({
    format: 'mfe-text-geometry',
    basis: { source: 'AB' },
  });
  // The member's bytes are the ones the reference counts.
  expect(Buffer.byteLength(JSON.stringify(file.textGeometry[contentHash]))).toBe(byteLength);

  // Another browser: nothing stored, no companion. The file is all there is.
  const elsewhere = await browser.newContext();
  const other = await elsewhere.newPage();
  await forceFallbackFilePaths(other);
  await other.route('http://127.0.0.1:7799/**', (route) => route.abort());
  await other.goto('/');
  await other.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await openFile(other, saved.name, saved.text);
  await expect(other.getByTestId('doc-file')).toHaveText('titles.mfe.json');
  await expect.poll(() => drawn(other)).toBe('ok: pango 2');
  await expect(other.getByTestId('notice')).toHaveCount(0);
  await expect(other.getByTestId('doc-status')).toHaveText('Saved');
  await elsewhere.close();

  // A browser without a database (its storage is blocked): the page's memory does.
  const blocked = await browser.newContext();
  const closed = await blocked.newPage();
  await forceFallbackFilePaths(closed);
  await closed.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      value: {
        open() {
          throw new DOMException('The Indexed Database API is denied here.', 'SecurityError');
        },
      },
    });
  });
  await closed.route('http://127.0.0.1:7799/**', (route) => route.abort());
  await closed.goto('/');
  await closed.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await openFile(closed, saved.name, saved.text);
  await expect.poll(() => drawn(closed)).toBe('ok: pango 2');
  await expect(closed.getByTestId('notice')).toHaveCount(0);
  // Edited and saved there, the file still carries the geometry, byte for byte.
  await closed.getByTestId('project-rename').click();
  await closed.getByTestId('project-rename-input').fill('Titles again');
  await closed.keyboard.press('Enter');
  const again = await saveFile(closed);
  expect(again.name).toBe('titles-again.mfe.json');
  const member = (text: string) => text.slice(text.indexOf('  "textGeometry": {'));
  expect(member(again.text)).toBe(member(saved.text));
  await expect(closed.getByTestId('dialog')).toHaveCount(0);
  await blocked.close();
});

test('without a database, a text whose geometry its file lacks is a missing text, and the project saves', async ({
  page,
}) => {
  await forceFallbackFilePaths(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      value: {
        open() {
          throw new DOMException('The Indexed Database API is denied here.', 'SecurityError');
        },
      },
    });
  });
  await page.route('http://127.0.0.1:7799/**', (route) => route.abort());
  // A file saved without the geometry of its text (the browser that wrote it had lost it): it
  // keeps the reference, and the snapshot that says where each glyph was.
  const artifact = textGeometry('AB');
  const project = createEmptyProject('Titles');
  project.formulas = [
    createTextFormula({
      source: 'AB',
      name: 'title',
      geometry: {
        contentHash: 'a'.repeat(64),
        byteLength: 1000,
        key: artifact.key,
        basisKey: artifact.basisKey,
      },
      snapshot: toSnapshot(textArtifactRender(artifact)),
    }),
  ];
  await page.goto('/');
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await openFile(page, 'titles.mfe.json', serializeProject(project));
  await expect(page.getByTestId('doc-file')).toHaveText('titles.mfe.json');
  // Drawn as boxes where its glyphs were; the badge says why and what brings them back.
  await expect.poll(() => drawn(page)).toBe('ok: boxes 2');
  const badge = page.getByTestId('formula-status');
  await expect(badge).toHaveText('needs the companion');
  await expect(badge).toHaveAttribute(
    'title',
    /The saved appearance of this text is not in the browser’s storage\. .* It is drawn as placeholder boxes meanwhile\./,
  );
  // That is all the news: nothing about a storage this browser does not have.
  await expect(page.getByTestId('notice')).toHaveCount(0);

  // Edited, it saves: the question is the one about the missing appearance.
  await page.getByTestId('project-rename').click();
  await page.getByTestId('project-rename-input').fill('Titles again');
  await page.keyboard.press('Enter');
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByTestId('dialog')).toContainText('Save without the missing media?');
  await expect(page.getByTestId('dialog')).toContainText('title (text appearance)');
  await page.getByTestId('dialog-confirm').click();
  const saved = JSON.parse(readFileSync(await (await download).path(), 'utf8')) as {
    meta: { name: string };
    textGeometry?: unknown;
  };
  expect(saved.meta.name).toBe('Titles again');
  expect(saved.textGeometry).toBeUndefined();
  await expect(page.getByTestId('doc-status')).toHaveText('Saved');
  await expect(page.getByTestId('notice')).toHaveCount(0);
});

test('without a companion a text is drawn as boxes; what is made on them goes to its glyphs when one shapes it', async ({
  page,
}) => {
  await page.route('http://127.0.0.1:7799/**', (route) => route.abort());
  const project = createEmptyProject();
  const formula = createTextFormula({ source: 'One two', name: 'title' });
  project.formulas = [formula];
  project.clips = [createClip(formula.id, project.tracks[0]!.id, 0, 4)];
  await openWithProject(page, serializeProject(project));

  // Six letters, six boxes, measured by this browser's canvas; nothing is an error.
  await expect.poll(() => drawn(page)).toBe('ok: boxes 6');
  const badge = page.getByTestId('formula-status');
  await expect(badge).toHaveText('needs the companion');
  await expect(badge).toHaveAttribute('data-needs-companion', 'true');
  await expect(badge).toHaveAttribute('title', /Placeholder boxes, one per character/);
  await expect(page.getByTestId('notice')).toHaveCount(0);
  const boxes = await page.evaluate(() => {
    interface Box {
      minX: number;
      maxX: number;
    }
    const mfe = (window as MfeWindow).__mfe!;
    const text = mfe.useProjectStore.getState().project.formulas[0] as unknown as {
      id: string;
      snapshot: { glyphs: { label: string }[] };
      geometry: unknown;
    };
    const entry = mfe.useRenderStore.getState().entries[text.id] as unknown as {
      resolved: { render: { glyphs: { bbox: Box }[] } };
    };
    const glyphs = entry.resolved.render.glyphs;
    return {
      snapshot: text.snapshot.glyphs.map((glyph) => glyph.label).join(''),
      geometry: text.geometry,
      widths: glyphs.map((glyph) => glyph.bbox.maxX - glyph.bbox.minX),
      left: glyphs.map((glyph) => glyph.bbox.minX),
    };
  });
  expect(boxes.snapshot).toBe('Onetwo');
  expect(boxes.geometry).toBeNull();
  // Real metrics: the letters are not all as wide, and they follow one another.
  expect(new Set(boxes.widths.map((width) => width.toFixed(3))).size).toBeGreaterThan(1);
  expect([...boxes.left].sort((a, b) => a - b)).toEqual(boxes.left);

  // The author colours the w and hides the last o, on the boxes.
  await page.evaluate(() => {
    (window as MfeWindow).__mfe!.useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.glyphColors = { 4: '#FF0000' };
      draft.formulas[0]!.hiddenGlyphs = [5];
    });
  });

  // The text editor says the same, and still applies an edit.
  await page.getByTestId('formula-item').dblclick();
  await expect(page.getByTestId('text-render-status')).toContainText('Placeholder boxes');
  await expect(page.getByTestId('text-needs-companion')).toHaveText('needs the companion');
  // The command names the Python of the system the browser runs on.
  await expect(page.getByTestId('text-needs-companion-hint')).toContainText(
    `${process.platform === 'win32' ? 'python' : 'python3'} companion/mfe_companion.py serve`,
  );
  await page.getByTestId('text-source').fill('One, two');
  await expect(page.getByTestId('text-stage-canvas')).toHaveAttribute('data-glyph-count', '7');
  await page.getByTestId('text-apply').click();
  await expect(page.getByTestId('text-composition')).toHaveCount(0);
  await expect.poll(() => drawn(page)).toBe('ok: boxes 7');
  // The comma came in before them: the colour and the hidden glyph moved along.
  expect((await getProject(page)).formulas[0]).toMatchObject({
    glyphColors: { 5: '#FF0000' },
    hiddenGlyphs: [6],
  });

  // Export → Python writes it all the same, its glyphs counted by its boxes, and says so.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText('title = Text(r"One, two"');
  await expect(page.getByTestId('export-python-code')).toContainText(
    '_mfe_verify_text(title, r"title", "ce", 7)',
  );
  await expect(page.getByTestId('export-python-issues')).toContainText(
    'Font text "title": nothing has shaped it as it stands (no companion drew it).',
  );
  await expect(page.getByTestId('export-python-copy')).toBeEnabled();
  await expect(page.getByTestId('export-python-download')).toBeEnabled();
  await page.getByTestId('export-python-close').click();

  // A companion starts. The text is shaped, saved, and keeps what was made on its boxes.
  await page.unroute('http://127.0.0.1:7799/**');
  await companion(page);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => drawn(page)).toBe('ok: pango 7');
  await expect(badge).toHaveText('exact');
  await expect(badge).not.toHaveAttribute('data-needs-companion');
  const shaped = (await getProject(page)).formulas[0] as unknown as {
    geometry: { key: string } | null;
    snapshot: { key: string } | null;
    glyphColors: Record<string, string>;
    hiddenGlyphs: number[];
  };
  expect(shaped.geometry).not.toBeNull();
  expect(shaped.snapshot!.key).toBe(shaped.geometry!.key);
  expect(shaped.glyphColors).toEqual({ 5: '#FF0000' });
  expect(shaped.hiddenGlyphs).toEqual([6]);
  await expect(page.getByTestId('formula-warning')).toHaveCount(0);
});
