/* The originals in the browser's storage follow the pages that need them: what a closed tab
 * leaves behind is freed by a later one, and never what a recovery record still names. The
 * rules, with every kind of page that goes away, are in `mediaCollection.test.ts`. */
import { expect, test, type Page } from './test';
import { readFileSync } from 'node:fs';
import {
  addAudioInterval,
  AUDIO_MP3_PATH,
  autosaveRecord,
  importMp3,
  mediaOwners,
  openAudioPackage,
  pcmWave,
  startAudioApp,
  storedOriginalBytes,
} from './audioHelpers';
import { getProject, type MfeWindow } from './helpers';

const TEN_MINUTES = 10 * 60_000;

test('a later tab frees a deleted recording and keeps the one its work still uses', async ({
  page,
  context,
}) => {
  await startAudioApp(page);
  const narration = await importMp3(page);
  const clip = await addAudioInterval(page, narration.id);
  await page
    .getByTestId('audio-file-input')
    .setInputFiles({ name: 'effect.wav', mimeType: 'audio/wav', buffer: pcmWave() });
  await expect.poll(async () => (await getProject(page)).audioAssets.length).toBe(2);
  const effect = (await getProject(page)).audioAssets[1]!;
  await expect(page.getByTestId(`audio-add-${effect.id}`)).toBeEnabled();
  // The autosave has seen the effect: its recovery owner holds it from now on.
  await autosaveRecord(page, effect.contentHash);
  await page.getByTestId(`audio-delete-${effect.id}`).click();
  await expect.poll(async () => (await getProject(page)).audioAssets.length).toBe(1);
  await page.getByTestId('project-rename').click();
  await page.getByTestId('project-rename-input').fill('Narrated');
  await page.getByTestId('project-rename-input').press('Enter');
  const first = await autosaveRecord(page, 'Narrated');
  // Undo would bring the effect back: its page keeps it, however long ago it was imported.
  expect(
    await page.evaluate(
      (now) => (window as MfeWindow).__mfe!.collectMedia(now),
      Date.now() + 2 * TEN_MINUTES,
    ),
  ).toEqual({ released: [], removed: 0, bytes: 0 });
  expect(await storedOriginalBytes(page, effect.contentHash)).toBe(effect.byteLength);

  // The tab is closed. Its history owner goes with it; its autosave record stays.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect
    .poll(async () => (await mediaOwners(page)).map((owner) => owner.id))
    .toEqual([first.mediaOwner]);
  await page.close();

  // A new tab picks the work up, with its recording.
  const later = await context.newPage();
  await startAudioApp(later);
  await expect.poll(async () => (await getProject(later)).audioClips.length).toBe(1);
  await expect(later.getByTestId(`audio-add-${narration.id}`)).toBeEnabled();
  await later.getByTestId('project-rename').click();
  await later.getByTestId('project-rename-input').fill('Narrated, continued');
  await later.getByTestId('project-rename-input').press('Enter');
  const second = await autosaveRecord(later, 'Narrated, continued');
  expect(second.mediaOwner).not.toBe(first.mediaOwner);

  // Within the grace nothing is touched; after it, the effect and the closed tab's owner go.
  expect(await later.evaluate(() => (window as MfeWindow).__mfe!.collectMedia())).toEqual({
    released: [],
    removed: 0,
    bytes: 0,
  });
  const collected = await later.evaluate(
    (now) => (window as MfeWindow).__mfe!.collectMedia(now),
    Date.now() + TEN_MINUTES + 60_000,
  );
  expect(collected).toEqual({
    released: [first.mediaOwner],
    removed: 1,
    bytes: effect.byteLength,
  });
  expect(await storedOriginalBytes(later, effect.contentHash)).toBeNull();
  expect(await storedOriginalBytes(later, narration.contentHash)).toBe(narration.byteLength);
  const owners = await mediaOwners(later);
  expect(owners.map((owner) => owner.id.split(':')[0]).sort()).toEqual(['history', 'recovery']);
  for (const owner of owners) expect(owner.hashes).toEqual([narration.contentHash]);
  await expect(later.getByTestId(`audio-clip-${clip.id}`)).toBeVisible();
});

test('the first import asks the browser, once, to keep what the app stores', async ({ page }) => {
  type Counted = Window & { __persistRequests: number };
  await page.addInitScript(() => {
    (window as unknown as Counted).__persistRequests = 0;
    navigator.storage.persisted = async () => false;
    navigator.storage.persist = async () => {
      (window as unknown as Counted).__persistRequests++;
      return true;
    };
  });
  const requests = () => page.evaluate(() => (window as unknown as Counted).__persistRequests);
  await startAudioApp(page);
  expect(await requests()).toBe(0);
  await importMp3(page);
  await expect.poll(requests).toBe(1);
  await page
    .getByTestId('audio-file-input')
    .setInputFiles({ name: 'effect.wav', mimeType: 'audio/wav', buffer: pcmWave() });
  await expect.poll(async () => (await getProject(page)).audioAssets.length).toBe(2);
  expect(await requests()).toBe(1);
});

/** The browser's media store goes, with the page open: cleared by the user, or evicted. */
async function loseOriginals(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('mfe-original-media');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  );
}

async function save(page: Page): Promise<void> {
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Save', exact: true }).click();
}

for (const theme of ['dark', 'light'] as const) {
  test(`Save asks before writing a project without a recording the browser lost (${theme})`, async ({
    page,
    browser,
  }, testInfo) => {
    await page.addInitScript((theme) => localStorage.setItem('mfe.theme', theme), theme);
    await startAudioApp(page);
    const narration = await importMp3(page);
    const clip = await addAudioInterval(page, narration.id);
    await loseOriginals(page);
    expect(await storedOriginalBytes(page, narration.contentHash)).toBeNull();

    // The question names the recording and the file to import again. Cancel writes nothing.
    await save(page);
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('Save without the missing media?');
    await expect(dialog).toContainText('no longer holds one original');
    await expect(page.getByTestId('dialog-details')).toHaveText('audio-pulses (audio-pulses.mp3)');
    await page.screenshot({ path: testInfo.outputPath(`save-without-media-${theme}.png`) });
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.getByTestId('dialog-cancel').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('doc-status')).toHaveText('Unsaved changes');
    expect(downloads).toBe(0);
    // The page had not noticed that its storage was gone: now its clip says so.
    await expect(page.getByTestId(`audio-missing-${clip.id}`)).toHaveText('missing media');

    // Agreed: the file is written, and the project is saved.
    const download = page.waitForEvent('download');
    await save(page);
    await page.getByTestId('dialog-confirm').click();
    const file = await download;
    const bytes = readFileSync((await file.path())!);
    expect(bytes.subarray(0, 8).toString()).toBe('MFEPACK\n');
    await expect(page.getByTestId('doc-status')).toHaveText('Saved');
    const manifest = JSON.parse(
      bytes.subarray(16, 16 + bytes.readUInt32LE(12)).toString('utf8'),
    ) as { media: unknown[]; missing?: string[] };
    expect(manifest.media).toEqual([]);
    expect(manifest.missing).toEqual([narration.contentHash]);

    // Another browser opens it: the whole project, the clip in its place, no original.
    const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const other = await otherContext.newPage();
      await other.addInitScript((theme) => localStorage.setItem('mfe.theme', theme), theme);
      await startAudioApp(other);
      await openAudioPackage(other, { name: file.suggestedFilename(), bytes });
      await expect.poll(async () => (await getProject(other)).audioClips.length).toBe(1);
      expect((await getProject(other)).audioAssets).toEqual([narration]);
      expect((await getProject(other)).audioClips[0]).toEqual(clip);
      expect(await storedOriginalBytes(other, narration.contentHash)).toBeNull();
      await expect(other.getByTestId(`audio-clip-${clip.id}`)).toBeVisible();
      await expect(other.getByTestId('notice-host')).not.toContainText('Could not');

      // The clip is marked, and a notice names the file to import again.
      const mark = other.getByTestId(`audio-missing-${clip.id}`);
      await expect(mark).toHaveText('missing media');
      await expect(other.getByTestId(`audio-clip-${clip.id}`)).toHaveAccessibleName(
        /, missing media$/,
      );
      await expect(
        other.getByTestId('notice').filter({ hasText: 'A recording is missing' }),
      ).toContainText('audio-pulses.mp3');
      await other.getByTestId(`audio-clip-${clip.id}`).locator('.tl-audio-caption span').click();
      await expect(other.getByTestId('audio-properties')).toContainText('Missing media');
      await other.screenshot({ path: testInfo.outputPath(`missing-media-clip-${theme}.png`) });

      // Playback goes on without it, and says so, instead of stopping with an error.
      await other.getByTestId('transport-play').click();
      await expect
        .poll(() => other.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().time))
        .toBeGreaterThan(0.05);
      await other.getByTestId('transport-play').click();
      await expect(
        other.getByTestId('notice').filter({ hasText: 'An audio clip is skipped' }),
      ).toBeVisible();
      await expect(other.getByTestId('notice-host')).not.toContainText('Could not play audio');
      await expect(other.getByTestId('notice-host')).not.toContainText('Audio playback stopped');

      // The same file, imported again, repairs the clip: no second recording, no mark.
      await other.getByTestId('creator-tab-audio').click();
      await other.getByTestId('audio-file-input').setInputFiles(AUDIO_MP3_PATH);
      await expect(mark).toHaveCount(0);
      expect(await storedOriginalBytes(other, narration.contentHash)).toBe(narration.byteLength);
      expect((await getProject(other)).audioAssets).toEqual([narration]);
      await expect(other.getByTestId('audio-properties')).not.toContainText('Missing media');

      // The file it was opened from lacks the recording, so there is something to save again:
      // this time the file is complete, and nothing is asked.
      await expect(other.getByTestId('doc-status')).toHaveText('Unsaved changes');
      const complete = other.waitForEvent('download');
      await save(other);
      const completeBytes = readFileSync((await (await complete).path())!);
      const completeManifest = JSON.parse(
        completeBytes.subarray(16, 16 + completeBytes.readUInt32LE(12)).toString('utf8'),
      ) as { media: { contentHash: string }[]; missing?: string[] };
      expect(completeManifest.media.map((entry) => entry.contentHash)).toEqual([
        narration.contentHash,
      ]);
      expect(completeManifest.missing).toBeUndefined();
      await expect(other.getByTestId('dialog')).toHaveCount(0);
      await expect(other.getByTestId('doc-status')).toHaveText('Saved');
    } finally {
      await otherContext.close();
    }
  });
}

test('Save brings a lost recording back from the file it is about to replace', async ({ page }) => {
  // A real file handle (in the origin's private file system), so that Save writes in place.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const handle = await dir.getFileHandle('talk.mfe', { create: true });
    (window as unknown as { showSaveFilePicker(): Promise<unknown> }).showSaveFilePicker =
      async () => handle;
  });
  const fileManifest = () =>
    page.evaluate(async () => {
      const dir = await navigator.storage.getDirectory();
      const file = await (await dir.getFileHandle('talk.mfe')).getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const length = new DataView(bytes.buffer).getUint32(12, true);
      return JSON.parse(new TextDecoder().decode(bytes.subarray(16, 16 + length))) as {
        project: { meta: { name: string } };
        media: { contentHash: string }[];
        missing?: string[];
      };
    });
  const narration = await importMp3(page);
  const clip = await addAudioInterval(page, narration.id);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByTestId('doc-status')).toHaveText('Saved');
  await expect(page.getByTestId('doc-file')).toHaveText('talk.mfe');
  expect((await fileManifest()).media).toEqual([
    expect.objectContaining({ contentHash: narration.contentHash }),
  ]);

  // The browser loses its storage while the project is open, and the user goes on working.
  await loseOriginals(page);
  await page.getByTestId('project-rename').click();
  await page.getByTestId('project-rename-input').fill('Edited after the loss');
  await page.getByTestId('project-rename-input').press('Enter');
  await expect(page.getByTestId('doc-status')).toHaveText('Unsaved changes');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByTestId('doc-status')).toHaveText('Saved');

  // No question: the file being replaced still had the recording, and the new one has it too.
  await expect(page.getByTestId('dialog')).toHaveCount(0);
  await expect(
    page.getByTestId('notice').filter({ hasText: 'Missing media restored' }),
  ).toContainText('talk.mfe still held originals');
  const manifest = await fileManifest();
  expect(manifest.project.meta.name).toBe('Edited after the loss');
  expect(manifest.media.map((entry) => entry.contentHash)).toEqual([narration.contentHash]);
  expect(manifest.missing).toBeUndefined();
  // And it is back in the browser, for this project: the clip plays and is not marked.
  expect(await storedOriginalBytes(page, narration.contentHash)).toBe(narration.byteLength);
  await expect(page.getByTestId(`audio-missing-${clip.id}`)).toHaveCount(0);
  await expect
    .poll(async () => (await mediaOwners(page)).map((owner) => owner.id.split(':')[0]).sort())
    .toEqual(['history', 'recovery']);
});
