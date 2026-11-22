/* Real audio codec downloads and the original-document publication boundary. ffprobe/ffmpeg
 * provide a decoder independent of the browser/muxer, as in videoPublication.spec.ts. */
import { expect, test, type Page } from './test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { addAudioInterval, importMp3, loseOriginal, startAudioApp } from './audioHelpers';
import {
  manimCePython,
  routeToCompanion,
  startCompanion,
  type RunningCompanion,
} from './companionHelpers';
import { readExample, type MfeWindow } from './helpers';
import { clipJson, openTimeline } from './timelineHelpers';

const sentinel = 'Existing audio destination';
type AudioHarnessWindow = MfeWindow & {
  __audioDestination: {
    writes: number;
    closes: number;
    aborts: number;
    entered: boolean;
    release(): void;
    bytes(): Promise<number[]>;
  };
};

async function source(page: Page) {
  await startAudioApp(page);
  const asset = await importMp3(page);
  await addAudioInterval(page, asset.id, 0, 2);
}

async function openAudioExport(page: Page, format: 'wav' | 'm4a' | 'webm' = 'wav') {
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-audio').click();
  await expect(page.getByTestId('audio-export')).toBeVisible();
  await page.getByTestId('audio-export-format').selectOption(format);
  await page.getByTestId('audio-export-from').fill('0.25');
  // Deliberately one frame beyond a whole second: a container must trim codec-frame padding.
  await page.getByTestId('audio-export-to').fill(String(0.25 + 48001 / 48000));
}

// A project written by another tool: its last clip ends at 4.4 + 2.2 = 6.6000000000000005.
test('the range starts at the whole scene, its end as the Video dialog says it', async ({
  page,
}) => {
  await openTimeline(page, [clipJson('a', 'fa', 't1', 4.4, 4.4 + 2.2)]);
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-audio').click();
  await expect(page.getByTestId('audio-export')).toBeVisible();
  await expect(page.getByTestId('audio-export-from')).toHaveValue('0');
  await expect(page.getByTestId('audio-export-to')).toHaveValue('6.6');
  await expect(page.getByTestId('audio-export-start')).toBeEnabled();
  await page.getByTestId('audio-export-dismiss').click();
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-video').click();
  await expect(page.getByTestId('video-range-whole').locator('xpath=..')).toContainText(
    'Whole scene (6.6 s)',
  );
});

async function holdDestination(page: Page, pause: 'write' | 'close') {
  await page.evaluate(
    async ({ sentinel, pause }) => {
      const w = window as unknown as AudioHarnessWindow;
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle('audio-destination.wav', { create: true });
      const initial = await handle.createWritable();
      await initial.write(sentinel);
      await initial.close();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      w.__audioDestination = {
        writes: 0,
        closes: 0,
        aborts: 0,
        entered: false,
        release,
        bytes: async () => [...new Uint8Array(await (await handle.getFile()).arrayBuffer())],
      };
      // The shared capability gate requires both pickers. Startup removed both to exercise
      // download paths; this harness deliberately restores writable-file behavior instead.
      Object.defineProperty(window, 'showOpenFilePicker', {
        configurable: true,
        value: async () => [],
      });
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          name: handle.name,
          createWritable: async () => {
            const stream = await handle.createWritable();
            let aborted = false;
            return {
              async write(data: FileSystemWriteChunkType) {
                w.__audioDestination.writes++;
                if (pause === 'write' && w.__audioDestination.writes === 1) {
                  w.__audioDestination.entered = true;
                  await gate;
                }
                if (aborted) throw new DOMException('Cancelled', 'AbortError');
                await stream.write(data);
              },
              async close() {
                w.__audioDestination.closes++;
                if (pause === 'close') {
                  w.__audioDestination.entered = true;
                  await gate;
                }
                await stream.close();
              },
              async abort() {
                w.__audioDestination.aborts++;
                aborted = true;
                release();
                await stream.abort();
              },
            };
          },
        }),
      });
    },
    { sentinel, pause },
  );
}

/** Whether this browser encodes AAC. The app carries no AAC encoder of its own, so what it offers
 * and writes follows the browser: Chrome has one on Windows and macOS and none on Linux. Both
 * answers are checked below, each on the machines that give it. */
async function browserEncodesAac(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (typeof AudioEncoder === 'undefined') return false;
    const answer = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 192000,
    });
    return answer.supported === true;
  });
}

interface Probe {
  streams: {
    codec_type: string;
    codec_name: string;
    sample_rate?: string;
    channels?: number;
    duration?: string;
    start_time?: string;
    nb_read_packets?: string;
  }[];
  format: { duration: string };
}

function probe(path: string): Probe {
  const entries =
    'stream=codec_type,codec_name,sample_rate,channels,duration,start_time,nb_read_packets' +
    ':format=duration';
  return JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-count_packets', '-show_entries', entries, '-of', 'json', path],
      { encoding: 'utf8' },
    ),
  ) as Probe;
}

/** The sound as FFmpeg decodes it, a decoder independent of the browser: how many stereo frames,
 * how loud, and the frame at which each pulse of the fixture begins. */
function decodedSound(path: string) {
  const pcm = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-threads',
      '1',
      '-i',
      path,
      '-vn',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-f',
      'f32le',
      'pipe:1',
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const frames = pcm.byteLength / (2 * 4);
  const left = (frame: number) => Math.abs(pcm.readFloatLE(frame * 8));
  let peak = 0;
  for (let frame = 0; frame < frames; frame++) peak = Math.max(peak, left(frame));
  const onsets: number[] = [];
  let loud = -Infinity;
  for (let frame = 0; frame < frames; frame++) {
    if (left(frame) <= peak / 2) continue;
    if (frame - loud > 4800) onsets.push(frame);
    loud = frame;
  }
  return { frames, peak, onsets };
}

/** What the browser itself presents of the file, with the container's presentation window. */
async function presentedSound(page: Page, path: string) {
  return page.evaluate(
    async (bytes) => {
      const context = new OfflineAudioContext(2, 1, 48000);
      const audio = await context.decodeAudioData(Uint8Array.from(bytes).buffer);
      return { frames: audio.length, rate: audio.sampleRate, channels: audio.numberOfChannels };
    },
    [...readFileSync(path)],
  );
}

async function exportsAudio(page: Page, format: 'wav' | 'm4a' | 'webm', codec: string) {
  await openAudioExport(page, format);
  const download = page.waitForEvent('download');
  await page.getByTestId('audio-export-start').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
  await expect(page.getByTestId('audio-export-done')).toBeVisible();
  const path = (await file.path())!;
  const found = probe(path);
  expect(found.streams).toEqual([
    expect.objectContaining({ codec_name: codec, sample_rate: '48000', channels: 2 }),
  ]);
  // ffprobe may truncate its six-decimal timestamp; PCM frame counts below remain exact.
  expect(Math.abs(Number(found.format.duration) - 48001 / 48000)).toBeLessThan(1e-6);
  const decoded = decodedSound(path);
  if (format === 'm4a') {
    // FFmpeg's raw AAC decoder emits the final complete codec frame. Chrome applies the
    // MP4 presentation window; verify its actual presented frame count independently here.
    expect(await presentedSound(page, path)).toEqual({ frames: 48001, rate: 48000, channels: 2 });
    expect(decoded.frames).toBeGreaterThanOrEqual(48001);
    expect(decoded.frames).toBeLessThan(48001 + 1024);
  } else expect(decoded.frames).toBe(48001);
  expect(decoded.peak).toBeGreaterThan(0.02);
  if (format === 'wav') {
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    expect(bytes.byteLength).toBe(44 + 48001 * 4);
  }
}

for (const [format, codec] of [
  ['wav', 'pcm_s16le'],
  ['webm', 'opus'],
] as const) {
  test(`${format} audio export downloads a decodable exact-length stereo mix without visuals`, async ({
    page,
  }) => {
    await source(page);
    await exportsAudio(page, format, codec);
  });
}

test('an export that lacks a recording says which one and what brings it back', async ({
  page,
}) => {
  await startAudioApp(page);
  const asset = await importMp3(page);
  const clip = await addAudioInterval(page, asset.id, 0, 2);
  await loseOriginal(page, asset.contentHash);
  await openAudioExport(page);
  await page.getByTestId('audio-export-start').click();
  // The words of the export, not those of Save ("…before saving").
  await expect(page.getByTestId('audio-export-error')).toHaveText(
    'The recording “audio-pulses” (audio-pulses.mp3) is missing: the browser no longer holds ' +
      'its original audio. Import the same file again in the Audio tab, or mute its track, and ' +
      'export again.',
  );
  // The page learns of the loss there and then: the clip gets its mark.
  await expect(page.getByTestId(`audio-missing-${clip.id}`)).toBeVisible();
  // Muted, the recording is not part of the mix: the export goes through.
  await page.getByTestId('audio-export-dismiss').click();
  await page.getByTestId(`track-mute-${clip.trackId}`).click();
  await openAudioExport(page);
  const download = page.waitForEvent('download');
  await page.getByTestId('audio-export-start').click();
  expect((await download).suggestedFilename()).toMatch(/\.wav$/);
  await expect(page.getByTestId('audio-export-done')).toBeVisible();
});

test('M4A is offered exactly where the browser encodes AAC', async ({ page }) => {
  await source(page);
  if (await browserEncodesAac(page)) {
    await exportsAudio(page, 'm4a', 'aac');
    return;
  }
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-audio').click();
  await expect(page.getByTestId('audio-export-format').locator('option')).toHaveText([
    'WAV · PCM 16-bit',
    'WebM · Opus',
  ]);
  await expect(page.getByTestId('audio-export-no-aac')).toHaveText(
    'M4A is not offered: it needs an AAC encoder, and this browser has none.',
  );
});

test('the sound of an MP4 is AAC where the browser encodes it, and Opus elsewhere', async ({
  page,
}) => {
  await source(page);
  const aac = await browserEncodesAac(page);
  // The reference: the same two seconds as PCM.
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-audio').click();
  const wavDownload = page.waitForEvent('download');
  await page.getByTestId('audio-export-start').click();
  const reference = decodedSound((await (await wavDownload).path())!);
  expect(reference.frames).toBe(96000);
  expect(reference.onsets.length).toBeGreaterThanOrEqual(2);
  await page.getByTestId('audio-export-dismiss').click();

  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-video').click();
  await page.getByTestId('video-size-preset').selectOption('custom');
  await page.getByTestId('video-width').fill('320');
  await page.getByTestId('video-height').fill('180');
  await page.getByTestId('video-fps').selectOption('custom');
  await page.getByTestId('video-custom-fps').fill('10');
  await expect(page.getByTestId('video-format')).toHaveValue('avc-mp4');
  await expect(page.getByTestId('video-include-audio')).toBeChecked();
  // The dialog says it beforehand, and only where it applies.
  await expect(page.getByTestId('video-audio-opus')).toHaveCount(aac ? 0 : 1);
  await page.getByTestId('video-format').selectOption('vp9-webm');
  await expect(page.getByTestId('video-audio-opus')).toHaveCount(0);
  await page.getByTestId('video-format').selectOption('avc-mp4');
  await expect(page.getByTestId('video-summary')).toContainText('20 frames');

  const download = page.waitForEvent('download');
  await page.getByTestId('video-start').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.mp4$/);
  const path = (await file.path())!;

  // Both tracks last what the video lasts, whatever the codec frames of the sound add.
  const found = probe(path);
  expect(found.streams).toEqual([
    expect.objectContaining({
      codec_type: 'audio',
      codec_name: aac ? 'aac' : 'opus',
      sample_rate: '48000',
      channels: 2,
    }),
    expect.objectContaining({ codec_type: 'video', codec_name: 'h264' }),
  ]);
  for (const stream of found.streams) expect(Number(stream.duration)).toBeCloseTo(2, 3);
  expect(Number(found.format.duration)).toBeCloseTo(2, 3);
  // And the sound is where it was: each pulse begins on the frame it begins on in the PCM
  // (the encoder's lead-in is removed, by the edit list of the track). A decoder may give the
  // rest of the last codec frame after the end; it gives nothing less.
  const decoded = decodedSound(path);
  expect(decoded.onsets.length).toBe(reference.onsets.length);
  decoded.onsets.forEach((onset, index) =>
    expect(Math.abs(onset - reference.onsets[index]!)).toBeLessThanOrEqual(2),
  );
  expect(decoded.frames).toBeGreaterThanOrEqual(96000);
  expect(decoded.frames).toBeLessThan(96000 + 1024);
  expect((await presentedSound(page, path)).frames).toBeGreaterThanOrEqual(96000);
});

test('the browser’s WebM has the video and the sound as Opus, each pulse in its place', async ({
  page,
}) => {
  await source(page);
  const reference = await referenceSound(page);
  await openSmallVideoExport(page);
  await page.getByTestId('video-format').selectOption('vp9-webm');
  await expect(page.getByTestId('video-include-audio')).toBeChecked();
  await expect(page.getByTestId('video-audio-opus')).toHaveCount(0); // Opus is what a WebM carries
  await expect(page.getByTestId('video-summary')).toContainText('20 frames');

  const download = page.waitForEvent('download');
  await page.getByTestId('video-start').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.webm$/);
  const path = (await file.path())!;

  const found = probe(path);
  const stream = (kind: string) => found.streams.find((s) => s.codec_type === kind)!;
  expect(found.streams).toHaveLength(2);
  expect(stream('video')).toMatchObject({ codec_name: 'vp9', nb_read_packets: '20' });
  expect(stream('audio')).toMatchObject({ codec_name: 'opus', sample_rate: '48000', channels: 2 });
  for (const kind of ['video', 'audio'])
    expect(Math.abs(Number(stream(kind).start_time))).toBeLessThan(0.1);
  // The app writes this container itself: the file lasts what the video lasts, to the millisecond
  // WebM counts in, and the decoder is told what to drop at both ends of the sound.
  expect(Number(found.format.duration)).toBeCloseTo(2, 3);
  const decoded = decodedSound(path);
  expect(decoded.frames).toBe(96000);
  expect(decoded.onsets.length).toBe(reference.onsets.length);
  decoded.onsets.forEach((onset, index) =>
    expect(Math.abs(onset - reference.onsets[index]!)).toBeLessThanOrEqual(2),
  );
});

/** The two seconds of the scene as PCM: where every pulse begins, to the sample. */
async function referenceSound(page: Page) {
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-audio').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('audio-export-start').click();
  const reference = decodedSound((await (await download).path())!);
  expect(reference.frames).toBe(96000);
  expect(reference.onsets.length).toBeGreaterThanOrEqual(2);
  await page.getByTestId('audio-export-dismiss').click();
  return reference;
}

/** Export → Video… at 320 × 180 and 10 fps: the two seconds are 20 frames. */
async function openSmallVideoExport(page: Page) {
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-video').click();
  await page.getByTestId('video-size-preset').selectOption('custom');
  await page.getByTestId('video-width').fill('320');
  await page.getByTestId('video-height').fill('180');
  await page.getByTestId('video-fps').selectOption('custom');
  await page.getByTestId('video-custom-fps').fill('10');
}

test.describe('the companion adds the sound to its video', () => {
  let companion: RunningCompanion;

  test.beforeAll(async () => {
    companion = await startCompanion();
  });

  test.afterAll(() => companion.stop());

  for (const [format, video, audio, name] of [
    ['mp4', 'h264', 'aac', 'AAC'],
    ['webm', 'vp9', 'opus', 'Opus'],
  ] as const) {
    test(`ffmpeg ${format}: the file has the video and the sound as ${name}, each pulse in its place`, async ({
      page,
    }) => {
      await routeToCompanion(page, companion);
      await source(page);
      const reference = await referenceSound(page);

      await openSmallVideoExport(page);
      await expect(page.getByTestId('video-encoder-ffmpeg')).toBeEnabled();
      await page.getByTestId('video-encoder-ffmpeg').check();
      await page.getByTestId('video-format').selectOption(format);
      await expect(page.getByTestId('video-include-audio')).toBeChecked();
      await expect(page.getByTestId('video-audio-note')).toHaveText(
        `ffmpeg encodes the sound as ${name}.`,
      );
      await expect(page.getByTestId('video-summary')).toContainText('20 frames');

      const download = page.waitForEvent('download');
      await page.getByTestId('video-start').click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
      await expect(page.getByTestId('video-done')).toBeVisible();
      const path = (await file.path())!;

      const found = probe(path);
      const stream = (kind: string) => found.streams.find((s) => s.codec_type === kind)!;
      expect(found.streams).toHaveLength(2);
      expect(stream('video')).toMatchObject({ codec_name: video, nb_read_packets: '20' });
      expect(stream('audio')).toMatchObject({
        codec_name: audio,
        sample_rate: '48000',
        channels: 2,
      });
      // Both tracks start with the file. It lasts what the video lasts; ffmpeg's WebM header adds
      // the 6.5 ms that Opus starts early, in whole milliseconds, and the streams do not.
      for (const kind of ['video', 'audio'])
        expect(Math.abs(Number(stream(kind).start_time))).toBeLessThan(0.1);
      const duration = Number(found.format.duration);
      expect(duration).toBeGreaterThanOrEqual(2 - 0.0005);
      expect(duration).toBeLessThanOrEqual(format === 'webm' ? 2.009 : 2.0005);
      // And the sound is where it was: far inside one frame of the video (4800 samples).
      const decoded = decodedSound(path);
      expect(decoded.onsets.length).toBe(reference.onsets.length);
      decoded.onsets.forEach((onset, index) =>
        expect(Math.abs(onset - reference.onsets[index]!)).toBeLessThanOrEqual(2),
      );
      expect(decoded.frames).toBeGreaterThanOrEqual(96000);
      expect(decoded.frames).toBeLessThan(96000 + 1024);
    });
  }

  test('where the browser has no AAC, one click goes to the companion’s ffmpeg, whose MP4 has it', async ({
    page,
  }) => {
    await routeToCompanion(page, companion);
    await source(page);
    const aac = await browserEncodesAac(page);
    await openSmallVideoExport(page);
    await expect(page.getByTestId('video-format')).toHaveValue('avc-mp4');
    await expect(page.getByTestId('video-encoder-ffmpeg')).toBeEnabled();
    if (aac) {
      // nothing to work around: the browser's MP4 already has AAC
      await expect(page.getByTestId('video-audio-use-ffmpeg')).toHaveCount(0);
      return;
    }
    await expect(page.getByTestId('video-audio-opus')).toBeVisible();
    await expect(page.getByTestId('video-audio-use-ffmpeg')).toHaveText(
      'Use Companion · ffmpeg for AAC (MP4 · H.264)',
    );
    await page.getByTestId('video-audio-use-ffmpeg').click();
    await expect(page.getByTestId('video-encoder-ffmpeg')).toBeChecked();
    await expect(page.getByTestId('video-format')).toHaveValue('mp4');
    await expect(page.getByTestId('video-include-audio')).toBeChecked();
    await expect(page.getByTestId('video-audio-note')).toHaveText(
      'ffmpeg encodes the sound as AAC.',
    );
    await expect(page.getByTestId('video-audio-opus')).toHaveCount(0);
    await expect(page.getByTestId('video-start')).toBeInViewport();
    const download = page.waitForEvent('download');
    await page.getByTestId('video-start').click();
    const found = probe((await (await download).path())!);
    expect(found.streams.find((s) => s.codec_type === 'audio')).toMatchObject({
      codec_name: 'aac',
    });
    expect(found.streams.find((s) => s.codec_type === 'video')).toMatchObject({
      codec_name: 'h264',
    });
  });

  test('a GIF has no sound, and the dialog says so before the export', async ({ page }) => {
    await routeToCompanion(page, companion);
    await source(page);
    await openSmallVideoExport(page);
    await page.getByTestId('video-encoder-ffmpeg').check();
    await page.getByTestId('video-format').selectOption('gif');
    await expect(page.getByTestId('video-include-audio')).toBeDisabled();
    await expect(page.getByTestId('video-include-audio')).not.toBeChecked();
    await expect(page.getByTestId('video-audio-note')).toHaveText('A GIF has no sound.');
    const download = page.waitForEvent('download');
    await page.getByTestId('video-start').click();
    const found = probe((await (await download).path())!);
    expect(found.streams.map((s) => s.codec_type)).toEqual(['video']);
  });
});

test.describe('Render with Manim takes the sound', () => {
  const python = manimCePython();
  let companion: RunningCompanion;

  test.skip(!python, 'needs the ManimCE virtualenv (MFE_CE_PYTHON)');

  test.beforeAll(async () => {
    companion = await startCompanion(['--allow-manim-render', '--ce-python', python!]);
  });

  test.afterAll(() => companion?.stop());

  test('the video Manim renders has the sound, cut where the pictures end', async ({ page }) => {
    test.setTimeout(120_000);
    await routeToCompanion(page, companion);
    // Five seconds of formulas, and four of sound from the second 2: one second too long.
    await startAudioApp(page);
    await page.evaluate((text) => {
      const mfe = (window as MfeWindow).__mfe!;
      const parsed = mfe.parseProject(text);
      if (!parsed.ok) throw new Error(parsed.error);
      mfe.loadProject(parsed.project);
    }, readExample('hello.mfe.json'));
    const asset = await importMp3(page);
    await addAudioInterval(page, asset.id, 0, 4, 2);

    // The reference: the five seconds of the pictures as PCM.
    await page.getByTestId('export-button-menu').click();
    await page.getByTestId('export-button-export-audio').click();
    await page.getByTestId('audio-export-from').fill('0');
    await page.getByTestId('audio-export-to').fill('5');
    const wav = page.waitForEvent('download');
    await page.getByTestId('audio-export-start').click();
    const reference = decodedSound((await (await wav).path())!);
    expect(reference.frames).toBe(5 * 48000);
    expect(reference.onsets.length).toBeGreaterThanOrEqual(2);
    await page.getByTestId('audio-export-dismiss').click();

    await openSmallVideoExport(page);
    await expect(page.getByTestId('video-summary')).toContainText('60 frames · 6 s');
    await expect(page.getByTestId('video-encoder-manim')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('video-encoder-manim').check();
    await expect(page.getByTestId('video-summary')).toContainText('50 frames · 5 s');
    await expect(page.getByTestId('video-include-audio')).toBeChecked();
    await expect(page.getByTestId('video-audio-note')).toHaveText(
      'The companion’s ffmpeg adds the sound to the video Manim renders, as AAC.',
    );
    await expect(page.getByTestId('video-audio-cut')).toHaveText(
      'The sound goes on for 1 s after the last animation: Render with Manim ends there, and the sound is cut with it.',
    );

    const download = page.waitForEvent('download', { timeout: 100_000 });
    await page.getByTestId('video-start').click();
    const file = await download;
    await expect(page.getByTestId('video-done')).toBeVisible();
    const path = (await file.path())!;
    const found = probe(path);
    const stream = (kind: string) => found.streams.find((s) => s.codec_type === kind)!;
    expect(found.streams).toHaveLength(2);
    expect(stream('video')).toMatchObject({ codec_name: 'h264', nb_read_packets: '50' });
    expect(stream('audio')).toMatchObject({ codec_name: 'aac', sample_rate: '48000', channels: 2 });
    expect(Number(found.format.duration)).toBeCloseTo(5, 3);
    const decoded = decodedSound(path);
    expect(decoded.onsets.length).toBe(reference.onsets.length);
    decoded.onsets.forEach((onset, index) =>
      expect(Math.abs(onset - reference.onsets[index]!)).toBeLessThanOrEqual(2),
    );
    expect(decoded.frames).toBeGreaterThanOrEqual(5 * 48000);
    expect(decoded.frames).toBeLessThan(5 * 48000 + 1024);
  });
});

for (const command of ['Cancel', 'Replace document'] as const) {
  test(`${command} during audio output discards writes and retains the original destination`, async ({
    page,
  }) => {
    await source(page);
    await holdDestination(page, 'write');
    await openAudioExport(page);
    await page.getByTestId('audio-export-start').click();
    await page.waitForFunction(
      () => (window as unknown as AudioHarnessWindow).__audioDestination.entered,
    );
    if (command === 'Cancel') await page.getByTestId('audio-export-cancel').click();
    else
      await page.evaluate(() => {
        const mfe = (window as unknown as AudioHarnessWindow).__mfe!;
        const old = mfe.useProjectStore.getState().project;
        const next = {
          ...old,
          meta: { ...old.meta, name: 'Replacement' },
          audioClips: [],
          audioAssets: [],
        };
        const document = mfe.useDocumentStore.getState() as unknown as {
          beginDocument(project: unknown, info: { fileName: null; handle: null }): void;
        };
        document.beginDocument(next, { fileName: null, handle: null });
        mfe.loadProject(next);
      });
    await expect
      .poll(async () =>
        page.evaluate(() => (window as unknown as AudioHarnessWindow).__audioDestination.aborts),
      )
      .toBe(1);
    const state = await page.evaluate(async () => {
      const h = (window as unknown as AudioHarnessWindow).__audioDestination;
      return { writes: h.writes, closes: h.closes, aborts: h.aborts, bytes: await h.bytes() };
    });
    expect(state).toEqual({ writes: 1, closes: 0, aborts: 1, bytes: [...Buffer.from(sentinel)] });
  });
}

test('audio publication completes once close begins even if the dialog closes', async ({
  page,
}) => {
  await source(page);
  await holdDestination(page, 'close');
  await openAudioExport(page);
  await page.getByTestId('audio-export-start').click();
  await page.waitForFunction(
    () => (window as unknown as AudioHarnessWindow).__audioDestination.entered,
  );
  await expect(page.getByTestId('audio-export-cancel')).toBeDisabled();
  await expect(page.getByTestId('audio-export-dismiss')).toHaveText('Close');
  await page.getByTestId('audio-export-dismiss').click();
  await page.evaluate(() => (window as unknown as AudioHarnessWindow).__audioDestination.release());
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const bytes = await (window as unknown as AudioHarnessWindow).__audioDestination.bytes();
        return bytes.length;
      }),
    )
    .toBe(44 + 48001 * 4);
  expect(
    await page.evaluate(() => (window as unknown as AudioHarnessWindow).__audioDestination.aborts),
  ).toBe(0);
});

test('the audio option preserves the video export label and value columns', async ({ page }) => {
  await source(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-video').click();
  await expect(page.getByTestId('video-include-audio')).toBeChecked();
  const option = await page.locator('.video-audio-option').boundingBox();
  const choices = await page.getByRole('radiogroup', { name: 'Encoder' }).boundingBox();
  expect(option).not.toBeNull();
  expect(choices).not.toBeNull();
  expect(option!.width).toBeGreaterThan(500);
  expect(choices!.width).toBeGreaterThan(300);
  expect(choices!.x).toBeGreaterThan(option!.x + 100);
  await expect(page.getByTestId('video-fps')).toBeInViewport();
  await expect(page.getByTestId('video-start')).toBeInViewport();
});
