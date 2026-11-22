/* Captures of sound/video: the Export ▸ Video… dialog, with no companion running, with one
 * answering, and for a project with sound. Nothing is exported but one tiny file (the last
 * item), so no capture takes long.
 *
 * The tools never start the companion. Where a figure needs a companion, the item makes the app
 * see one (`companionOnline` of `_shared/companion.mjs`: it answers the app's health check as a
 * companion 1.7 with ffmpeg, both Manims and Render with Manim would, and nothing else): the
 * dialog then shows what it shows with a real companion beside it. The formulas are drawn by
 * MathJax, as they are when LaTeX is not where the companion runs.
 *
 * A figure that is about one part of the dialog shows the dialog from its top down to that part:
 * the pictures stay small and the reader sees what the text is about. */
import { fileURLToPath } from 'node:url';
import { companionOnline } from '../_shared/companion.mjs';

const NARRATION = fileURLToPath(new URL('../../../examples/audio-narration.mp3', import.meta.url));

/** Export ▸ Video… */
async function openVideoDialog(page, kit) {
  await kit.choose('Export ▸ Video…');
  await kit.waitFor('export-video');
  // The browser's own encoders are probed for the size: its estimate is there when it has.
  await kit.waitFor('video-estimate', { timeout: 15_000 });
  await kit.pause(400);
  await kit.settle({ renders: false });
}

/** The recording imported into the Audio tab and placed at 0 s (as in sound/audio). */
async function withSound(page, kit) {
  await kit.click('creator-tab-audio');
  await page.getByTestId('audio-file-input').setInputFiles(NARRATION);
  await kit.until((mfe) => mfe.useProjectStore.getState().project.audioAssets.length === 1, null, {
    timeout: 30_000,
  });
  const id = await kit.mfe((mfe) => mfe.useProjectStore.getState().project.audioAssets[0].id);
  await kit.until(
    (mfe, id) => {
      const button = document.querySelector(`[data-testid="audio-add-${id}"]`);
      return Boolean(button) && !button.disabled;
    },
    id,
    { timeout: 30_000 },
  );
  await kit.click(`audio-add-${id}`);
  await kit.until((mfe) => mfe.useProjectStore.getState().project.audioClips.length === 1);
  await kit.click('creator-tab-formulas');
  await kit.settle({ renders: false });
}

/** The area of the dialog from its top down to the bottom of `last`. */
const downTo = (last) => async (page, kit) => {
  const dialog = await kit.box('export-video');
  const end = await kit.box(last);
  return { x: dialog.x, y: dialog.y, width: dialog.width, height: end.y + end.height - dialog.y + 6 };
};

/** The area of the dialog from the top of `first` down to its bottom edge. */
const downFrom = (first) => async (page, kit) => {
  const dialog = await kit.box('export-video');
  const start = await kit.box(first);
  return { x: dialog.x, y: start.y - 4, width: dialog.width, height: dialog.y + dialog.height - start.y + 4 };
};

/** Types a custom size, frame rate and range into the dialog. */
async function customFields(page, kit, { width, height, fps, start, end }) {
  await page.getByTestId('video-size-preset').selectOption('custom');
  await page.getByTestId('video-width').fill(String(width));
  await page.getByTestId('video-height').fill(String(height));
  await page.getByTestId('video-fps').selectOption('custom');
  await page.getByTestId('video-custom-fps').fill(String(fps));
  await page.getByTestId('video-range-custom').check();
  await page.getByTestId('video-range-start').fill(String(start));
  await page.getByTestId('video-range-end').fill(String(end));
  await kit.settle({ renders: false });
}

const whole = { target: 'export-video', padding: 10 };
const pad = { top: 10, right: 10, bottom: 0, left: 10 };

export default {
  page: 'sound/video',
  project: 'docs/web/examples/hero.mfe.json',
  viewport: { width: 1440, height: 900 },
  items: [
    {
      // The dialog as it opens, with no companion: Browser is the encoder that works, the others
      // say why they do not.
      kind: 'shot',
      name: 'dialog-browser',
      setup: openVideoDialog,
      ...whole,
      highlight: [
        { target: '.encoder-options', label: 1, markerAt: 'top-right' },
        { target: 'video-format', label: 2, markerAt: 'left' },
        { target: 'video-size-preset', label: 3, markerAt: 'left' },
        { target: 'video-fps', label: 4, markerAt: 'left' },
        {
          target: { css: '[data-testid="export-video"] .field-stack:has([data-testid="video-range-whole"])' },
          label: 5,
          markerAt: 'right',
        },
        { target: 'video-start', label: 6, markerAt: 'top-right' },
      ],
    },
    {
      // A companion answers: Companion · ffmpeg is on offer, with its format, its quality and the
      // limit of a video that companion writes.
      kind: 'shot',
      name: 'dialog-ffmpeg',
      setup: [
        companionOnline,
        openVideoDialog,
        async (page, kit) => {
          await kit.click('video-encoder-ffmpeg');
          await kit.settle({ renders: false });
        },
      ],
      target: downTo('video-size-limit'),
      padding: pad,
      highlight: [
        {
          target: { css: '.encoder-option:has([data-testid="video-encoder-ffmpeg"])' },
          label: 1,
          markerAt: 'top-right',
        },
        { target: 'video-format', label: 2, markerAt: 'left' },
        { target: 'video-quality', label: 3, markerAt: 'left' },
        { target: 'video-size-limit', label: 4, markerAt: 'bottom-right' },
      ],
    },
    {
      // Render with Manim: which Manim, and the whole scene only.
      kind: 'shot',
      name: 'dialog-manim',
      setup: [
        companionOnline,
        openVideoDialog,
        async (page, kit) => {
          await kit.click('video-encoder-manim');
          await kit.settle({ renders: false });
        },
      ],
      target: downTo('video-range-hint'),
      padding: pad,
      highlight: [
        {
          target: { css: '.encoder-option:has([data-testid="video-encoder-manim"])' },
          label: 1,
          markerAt: 'top-right',
        },
        { target: 'video-manim-target', label: 2, markerAt: 'left' },
        { target: 'video-range-hint', label: 3, markerAt: 'right', pad: { top: -4 } },
      ],
    },
    {
      // A project with sound, with a companion answering: the option to include it, what Chrome
      // on Linux does with it in an MP4 (there is no AAC encoder: the sound is Opus), and the
      // button that goes to the companion's ffmpeg in one click.
      kind: 'shot',
      name: 'dialog-sound',
      setup: [withSound, companionOnline, openVideoDialog],
      target: downTo('video-audio-use-ffmpeg'),
      padding: pad,
      highlight: [
        { target: { css: '.video-audio-option' }, label: 1, markerAt: 'top-right' },
        { target: 'video-audio-opus', label: 2, markerAt: 'right' },
        { target: 'video-audio-use-ffmpeg', label: 3, markerAt: 'right' },
      ],
    },
    {
      // Custom size, custom frame rate and custom range: the summary, and the warning for a
      // picture that is not the project's shape.
      kind: 'shot',
      name: 'dialog-custom',
      setup: [
        openVideoDialog,
        (page, kit) =>
          customFields(page, kit, { width: 1000, height: 1000, fps: 30, start: 2.5, end: 7.5 }),
      ],
      target: downFrom('video-size-preset'),
      padding: { ...pad, top: 0 },
      highlight: [
        { target: 'video-aspect-warning', label: 1, markerAt: 'right' },
        { target: 'video-summary', label: 2, markerAt: 'right' },
      ],
    },
    {
      // A very small export through the browser, to show how one ends: the estimate it made, the
      // file named after the project and what the dialog says it saved. Without the file picker
      // of Chrome and Edge the file is assembled in memory and downloaded, which is what other
      // browsers do. The custom fields are the ones of the page's Try it.
      kind: 'shot',
      name: 'dialog-done',
      setup: [
        async (page) => {
          await page.evaluate(() => {
            delete window.showSaveFilePicker;
            delete window.showOpenFilePicker;
            delete window.showDirectoryPicker;
          });
        },
        openVideoDialog,
        async (page, kit) => {
          await customFields(page, kit, { width: 320, height: 180, fps: 10, start: 0, end: 1.5 });
          await kit.click('video-start');
          await kit.waitFor('video-done', { timeout: 60_000 });
          await kit.settle({ renders: false });
        },
      ],
      target: downFrom('video-estimate'),
      padding: { ...pad, top: 0 },
      highlight: [
        { target: 'video-estimate', label: 1, markerAt: 'right' },
        { target: 'video-done', label: 2, markerAt: 'right' },
      ],
    },
  ],
};
