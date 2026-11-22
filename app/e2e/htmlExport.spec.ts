/* Export ▸ HTML…: the dialog says what the page will carry, and gives it as one file, as a zip of
 * the folder, or as the folder itself where the browser lets one be chosen. */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { addAudioInterval, importMp3 } from './audioHelpers';
import { deckAddress, onDeck, watchPage } from './deckHelpers';
import { clipJson, openTimeline } from './timelineHelpers';

/** `alpha` on [0, 3] and `beta` on [2, 6]: the scene rests over [1, 2] and [4, 5]. A pause and a
 * comment where it rests, and a pause under the first intro. */
const clips = [clipJson('c1', 'fa', 't1', 0, 3), clipJson('c2', 'fb', 't2', 2, 6)];
const marks = [
  { id: 'p1', time: 1.5, kind: 'pause' },
  { id: 'p2', time: 4.5, kind: 'comment', text: 'A flash over the beta' },
  { id: 'p3', time: 0.5, kind: 'pause' },
];

async function openDialog(page: Page): Promise<void> {
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-html').click();
  await expect(page.getByTestId('export-html')).toBeVisible();
  // Its buttons wait for the formulas to be rendered.
  await expect(page.getByTestId('export-html-waiting')).toHaveCount(0);
}

/** The names of the files of a zip, from its directory. */
function zipNames(bytes: Buffer): string[] {
  const end = bytes.length - 22;
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
  const names: string[] = [];
  let at = bytes.readUInt32LE(end + 16);
  for (let k = 0; k < bytes.readUInt16LE(end + 10); k++) {
    expect(bytes.readUInt32LE(at)).toBe(0x02014b50);
    const length = bytes.readUInt16LE(at + 28);
    names.push(bytes.subarray(at + 46, at + 46 + length).toString('utf8'));
    at += 46 + length;
  }
  return names;
}

test('the dialog says what the page carries of the Slides mode, and what it leaves out', async ({
  page,
}) => {
  await openTimeline(page, clips, { slides: { marks } });
  await openDialog(page);
  await expect(page.getByTestId('export-html-marks')).toContainText(
    '1 pause: the page stops at it until its reader goes on.',
  );
  await expect(page.getByTestId('export-html-marks')).toContainText('1 comment');
  await expect(page.getByTestId('export-html-left-out').locator('li')).toHaveText([
    'The pause at 0.5 s is left out: it is where the intro of "alpha" runs.',
  ]);
  // No sound in this scene: nothing is asked of it.
  await expect(page.getByTestId('export-html-sound')).toHaveCount(0);
  await page.getByTestId('export-html-cancel').click();
  await expect(page.getByTestId('export-html')).toBeHidden();
});

test('the dialog says how many of the pauses skip the wait after them', async ({ page }) => {
  await openTimeline(page, clips, {
    slides: {
      marks: [
        { id: 'p1', time: 1.5, kind: 'pause', skipWait: true },
        { id: 'p4', time: 4.5, kind: 'pause' },
      ],
    },
  });
  await openDialog(page);
  await expect(page.getByTestId('export-html-marks')).toContainText(
    '2 pauses: the page stops at each until its reader goes on; 1 of them skips the wait after it.',
  );
  await page.getByTestId('export-html-cancel').click();
  // Every pause skips its wait now.
  await page.getByTestId('menu-view').click();
  await page.getByTestId('menu-item-view-slides-skip-every').click();
  await openDialog(page);
  await expect(page.getByTestId('export-html-marks')).toContainText(
    '2 pauses: the page stops at each until its reader goes on, then skips the wait after each.',
  );
});

test('one file: downloaded, it opens from disk and plays to its pause', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  await openDialog(page);
  await page.getByTestId('export-html-form-single').check();
  const downloading = page.waitForEvent('download');
  await page.getByTestId('export-html-single').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('e2e.html');
  const file = testInfo.outputPath('e2e.html');
  await download.saveAs(file);
  await expect(page.getByTestId('export-html')).toBeHidden();

  // Nothing beside it is asked for; its guide, in a comment, shows the tags that embed a scene.
  const html = readFileSync(file, 'utf8');
  expect(html).toContain('THE GUIDE OF THE SCENE');
  expect(html.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/<script[^>]*\ssrc=/);
  const said = watchPage(page);
  await page.goto(deckAddress(testInfo.outputDir, 'e2e.html'));
  await expect(page.locator('.mfe-deck[data-mfe-mounted]')).toHaveCount(1);
  expect(await onDeck(page, (deck) => [deck.problems.length, deck.pauses.length])).toEqual([0, 1]);
  await onDeck(page, (deck) => deck.play());
  await expect.poll(() => onDeck(page, (deck) => deck.playing), { timeout: 10_000 }).toBe(false);
  expect(await onDeck(page, (deck) => deck.time)).toBe(1.5);
  expect(said).toEqual([]);
});

test('the folder as a zip: every file of it, under the scene’s name', async ({
  page,
}, testInfo) => {
  await openTimeline(page, clips, { slides: { marks } });
  await openDialog(page);
  const downloading = page.waitForEvent('download');
  await page.getByTestId('export-html-zip').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('e2e.zip');
  const file = testInfo.outputPath('e2e.zip');
  await download.saveAs(file);
  const names = zipNames(readFileSync(file));
  for (const name of ['index.html', 'scene.js', 'glyphs.js', 'custom.js', 'player.css']) {
    expect(names).toContain(`e2e/${name}`);
  }
  expect(names).toContain('e2e/mfe-runtime.js');
  expect(names.every((name) => name.startsWith('e2e/'))).toBe(true);
});

test('the folder, where one can be chosen: written, and written again without losing custom.js', async ({
  page,
}) => {
  // The folder the reader would choose: one of the browser's own, which a test can read back.
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle('Talks', { create: true });
    };
  });
  await openTimeline(page, clips, { slides: { marks } });
  const read = (name: string) =>
    page.evaluate(async (file) => {
      const root = await navigator.storage.getDirectory();
      const talks = await root.getDirectoryHandle('Talks');
      const scene = await talks.getDirectoryHandle('e2e');
      return (await (await scene.getFileHandle(file)).getFile()).text();
    }, name);

  await openDialog(page);
  await page.getByTestId('export-html-folder').click();
  await expect(page.getByTestId('export-html')).toBeHidden();
  await expect(page.getByTestId('notice-host')).toContainText('Exported to “e2e” in “Talks”');
  expect(await read('scene.js')).toContain('MFE.scene("e2e", {');
  expect(await read('index.html')).toContain('data-scene="e2e"');

  // Its owner works on it, the scene changes in the editor, and it is exported again.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const scene = await (await root.getDirectoryHandle('Talks')).getDirectoryHandle('e2e');
    const writable = await (await scene.getFileHandle('custom.js')).createWritable();
    await writable.write('/* my animation */');
    await writable.close();
  });
  await openDialog(page);
  await page.getByTestId('export-html-folder').click();
  await expect(page.getByTestId('notice-host')).toContainText(
    'index.html, custom.js and player.css were there already and were left as they were',
  );
  expect(await read('custom.js')).toBe('/* my animation */');
});

test('the folder, exported again without its sound: the sound it wrote goes, another one stays', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle('Talks', { create: true });
    };
  });
  await openTimeline(page, clips, { slides: { marks } });
  const asset = await importMp3(page);
  await addAudioInterval(page, asset.id, 0.5, 2);
  /** The folder as the browser holds it: the names of its sound files, and a file's text. */
  const sounds = () =>
    page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const scene = await (await root.getDirectoryHandle('Talks')).getDirectoryHandle('e2e');
      const names: string[] = [];
      for (const name of ['audio.m4a', 'audio.wav']) {
        const there = await scene.getFileHandle(name).then(
          () => true,
          () => false,
        );
        if (there) names.push(name);
      }
      return names;
    });
  const read = (name: string) =>
    page.evaluate(async (file) => {
      const root = await navigator.storage.getDirectory();
      const scene = await (await root.getDirectoryHandle('Talks')).getDirectoryHandle('e2e');
      return (await (await scene.getFileHandle(file)).getFile()).text();
    }, name);
  /** Exports the folder, with the scene's sound or without it; gives the notice it ends with. */
  const exportFolder = async (withSound: boolean) => {
    for (const notice of await page.getByTestId('notice-dismiss').all()) await notice.click();
    await openDialog(page);
    await page.getByTestId('export-html-sound').setChecked(withSound);
    await expect(page.getByTestId('export-html-folder')).toBeEnabled();
    await page.getByTestId('export-html-folder').click();
    await expect(page.getByTestId('export-html')).toBeHidden({ timeout: 30_000 });
    const notice = page.getByTestId('notice').filter({ hasText: 'Exported to “e2e” in “Talks”' });
    await expect(notice).toHaveCount(1);
    return notice;
  };

  // With its sound, in the kind this browser encodes: the scene names the file and records it.
  await exportFolder(true);
  const [sound, ...more] = await sounds();
  expect(more).toEqual([]);
  expect(await read('scene.js')).toMatch(
    new RegExp(`\\n\\}, \\{ "audio": "${sound}", "sha256": "[0-9a-f]{64}" \\}\\);\\n$`),
  );

  // Without it: the folder no longer carries the recording, and the notice says so.
  const removed = await exportFolder(false);
  await expect(removed).toContainText(
    `${sound}, the sound an earlier export wrote there, was removed: this page does not play it.`,
  );
  await expect(removed).toHaveAttribute('data-kind', 'info');
  expect(await sounds()).toEqual([]);
  expect(await read('scene.js')).toMatch(/\n\}\);\n$/);

  // A recording its owner puts there is not the app's: it stays, and the notice warns of it.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const scene = await (await root.getDirectoryHandle('Talks')).getDirectoryHandle('e2e');
    const writable = await (
      await scene.getFileHandle('audio.wav', { create: true })
    ).createWritable();
    await writable.write('my own recording');
    await writable.close();
  });
  const left = await exportFolder(false);
  await expect(left).toContainText(
    'audio.wav is still in the folder, though this page does not play it',
  );
  await expect(left).toHaveAttribute('data-kind', 'warning');
  expect(await read('audio.wav')).toBe('my own recording');
});
