/* Browser audio fixtures and UI helpers. The MP3 is a synthetic four-second 44.1 kHz pulse
 * recording generated with ffmpeg; it contains no user media or third-party sound. */
import { expect, type Page } from '@playwright/test';
import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startApp } from './creatorHelpers';
import { getProject, setTime, type E2eProject, type MfeWindow } from './helpers';

export const AUDIO_MP3_PATH = fileURLToPath(
  new URL('./fixtures/audio-pulses.mp3', import.meta.url),
);

export async function startAudioApp(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await startApp(page);
  await page.getByTestId('creator-tab-audio').click();
  await expect(page.getByTestId('creator-audio')).toBeVisible();
}

export async function importMp3(page: Page): Promise<E2eProject['audioAssets'][number]> {
  await page.getByTestId('creator-tab-audio').click();
  await page.getByTestId('audio-file-input').setInputFiles(AUDIO_MP3_PATH);
  await expect.poll(async () => (await getProject(page)).audioAssets.length).toBe(1);
  const asset = (await getProject(page)).audioAssets[0]!;
  await expect(page.getByTestId(`audio-add-${asset.id}`)).toBeEnabled();
  return asset;
}

/** A recording as a drag from the desktop carries it. */
export interface DraggedAudio {
  name: string;
  type: string;
  bytes: Buffer;
}

const dragged = (files: DraggedAudio[]) =>
  files.map((file) => ({
    name: file.name,
    type: file.type,
    base64: file.bytes.toString('base64'),
  }));

/** Drop each of `drags` on the Creator's Audio tab, one right after the other: a later one lands
 * while the files of the first are still being read. The events are a script's, for that timing;
 * a drag as the browser delivers it is `desktopDrag` (helpers.ts). */
export async function dropAudio(page: Page, ...drags: DraggedAudio[][]): Promise<void> {
  await page.getByTestId('creator-audio').evaluate((tab, drags) => {
    for (const files of drags) {
      const transfer = new DataTransfer();
      for (const file of files) {
        const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
        transfer.items.add(new File([bytes], file.name, { type: file.type }));
      }
      tab.dispatchEvent(
        new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
      );
    }
  }, drags.map(dragged));
}

export async function addAudioInterval(
  page: Page,
  assetId: string,
  sourceStart = 0.5,
  sourceEnd = 3.5,
  timelineStart = 0,
): Promise<E2eProject['audioClips'][number]> {
  const before = (await getProject(page)).audioClips.length;
  await setTime(page, timelineStart);
  await page.getByTestId(`audio-add-from-${assetId}`).fill(String(sourceStart));
  await page.getByTestId(`audio-add-to-${assetId}`).fill(String(sourceEnd));
  await page.getByTestId(`audio-add-${assetId}`).click();
  await expect.poll(async () => (await getProject(page)).audioClips.length).toBe(before + 1);
  return (await getProject(page)).audioClips.at(-1)!;
}

export async function audioClip(page: Page, id: string) {
  const clip = (await getProject(page)).audioClips.find((item) => item.id === id);
  if (!clip) throw new Error(`Missing audio clip ${id}`);
  return clip;
}

export async function clearAudioHistory(page: Page) {
  await page.evaluate(() => (window as MfeWindow).__mfe!.history.clear());
}

/** Make a clip's volume line editable on the clip (the button beside "Volume…"): until then the
 * line is a drawing and the whole clip moves it. */
export async function editVolumeLine(page: Page, id: string): Promise<void> {
  const toggle = page.getByTestId(`audio-line-${id}`);
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

export async function selectAudio(page: Page, id: string) {
  // The caption always moves and selects; the graph does too until its line is being edited.
  await page.getByTestId(`audio-clip-${id}`).locator('.tl-audio-caption span').click();
}

/** Small real WAV fixtures complement MP3 import; sample data is generated, never embedded in JSON. */
export function pcmWave(seconds = 0.25, sampleRate = 8000): Buffer {
  const frames = Math.round(seconds * sampleRate);
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame++)
    bytes.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 330 * frame) / sampleRate) * 4096),
      44 + frame * 2,
    );
  return bytes;
}

/** Write a `.mfe` package to `path`: the project and one payload, which the project declares as
 * the recording `asset` (container v1: signature, version, manifest length, manifest, payloads). */
export function writePackage(
  path: string,
  project: E2eProject,
  asset: E2eProject['audioAssets'][number],
  payload: Buffer,
): void {
  const manifest = Buffer.from(
    JSON.stringify({
      format: 'manim-formula-editor-package',
      version: 1,
      project: { ...project, audioAssets: [...project.audioAssets, asset] },
      media: [
        {
          contentHash: asset.contentHash,
          byteLength: payload.byteLength,
          offset: 0,
          mimeType: asset.mimeType,
        },
      ],
    }),
  );
  const header = Buffer.alloc(16);
  header.write('MFEPACK\n', 0, 'latin1');
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(manifest.byteLength, 12);
  const file = openSync(path, 'w');
  try {
    for (const part of [header, manifest, payload]) writeSync(file, part);
  } finally {
    closeSync(file);
  }
}

export async function saveAudioPackage(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Save', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.mfe$/);
  const bytes = readFileSync((await file.path())!);
  expect(bytes.subarray(0, 8).toString()).toBe('MFEPACK\n');
  return { name: file.suggestedFilename(), bytes };
}

export async function openAudioPackage(page: Page, file: { name: string; bytes: Buffer }) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('menu-file').click();
  await page.getByRole('menuitem', { name: 'Open…', exact: true }).click();
  await page.getByTestId('projects-other').click();
  await (
    await chooser
  ).setFiles({
    name: file.name,
    mimeType: 'application/vnd.manim-formula-editor',
    buffer: file.bytes,
  });
}

export async function storedOriginalBytes(page: Page, hash: string): Promise<number | null> {
  return page.evaluate(async (contentHash) => {
    if (!(await indexedDB.databases()).some((database) => database.name === 'mfe-original-media'))
      return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mfe-original-media');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number | null>((resolve, reject) => {
        if (!db.objectStoreNames.contains('originals')) {
          resolve(null);
          return;
        }
        const request = db
          .transaction('originals', 'readonly')
          .objectStore('originals')
          .get(contentHash);
        request.onsuccess = () =>
          resolve((request.result as { blob?: Blob } | undefined)?.blob?.size ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, hash);
}

/** Take an original out of the media database, as a browser does when it evicts its storage:
 * the page is not told. */
export async function loseOriginal(page: Page, hash: string): Promise<void> {
  await page.evaluate(async (contentHash) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mfe-original-media');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('originals', 'readwrite');
        transaction.objectStore('originals').delete(contentHash);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }, hash);
}

/** The owners in the media database: who still needs which originals. */
export async function mediaOwners(page: Page): Promise<{ id: string; hashes: string[] }[]> {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((database) => database.name === 'mfe-original-media'))
      return [];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mfe-original-media');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!db.objectStoreNames.contains('owners')) return [];
      return await new Promise<{ id: string; hashes: string[] }[]>((resolve, reject) => {
        const request = db.transaction('owners', 'readonly').objectStore('owners').getAll();
        request.onsuccess = () =>
          resolve(
            (request.result as { id: string; hashes: string[] }[]).map((owner) => ({
              id: owner.id,
              hashes: owner.hashes,
            })),
          );
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

/** What the autosave record of this tab holds, once it holds `text`. */
export async function autosaveRecord(
  page: Page,
  text: string,
): Promise<{ mediaOwner?: string; name: string }> {
  const handle = await page.waitForFunction((text) => {
    const saved = localStorage.getItem(`mfe.autosave.${sessionStorage.getItem('mfe.session')}`);
    return saved?.includes(text)
      ? (JSON.parse(saved) as { mediaOwner?: string; name: string })
      : null;
  }, text);
  return (await handle.jsonValue())!;
}
