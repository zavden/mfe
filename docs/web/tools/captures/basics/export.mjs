/* Captures of basics/export: the Export… button and its arrow, and four of the dialogs
 * they open — Python, Video, Image and Audio — over the finished scene of the example
 * `first-transform` (the sixth, HTML, is basics/slides').
 * The tools never start the companion, so the Video dialog is shown twice: as the app shows it
 * without a companion (Companion · ffmpeg and Render with Manim greyed out, with what is missing),
 * and with one online, which the item makes the app see by answering its health check
 * (`_shared/companion.mjs`). */
import { companionOnline } from '../_shared/companion.mjs';

const PROJECT = 'docs/web/examples/first-transform.mfe.json';

export default {
  page: 'basics/export',
  project: PROJECT,
  items: [
    {
      // The Export… button beside the menus: its own press (1), and its arrow (2), which lists the
      // six exports.
      kind: 'shot',
      name: 'button',
      setup: async (page, kit) => {
        await kit.clearSelection();
        await kit.click('export-button-menu');
        await page.locator('.menu-popup').last().waitFor({ state: 'visible' });
      },
      target: { x: 440, y: 0, width: 420, height: 246 },
      highlight: [
        { target: 'export-button', label: 1, markerAt: 'top-left' },
        { target: 'export-button-menu', label: 2, markerAt: 'top-right' },
      ],
    },
    {
      // Export ▸ Python — ManimCE…: the options, what the scene cannot guarantee, the code.
      kind: 'shot',
      name: 'python',
      setup: async (page, kit) => {
        await kit.clearSelection();
        await kit.choose('Export ▸ Python — ManimCE…');
        await page.getByTestId('export-python-code').waitFor();
      },
      target: 'export-python',
      padding: 8,
      scale: 1.5,
      highlight: [
        { target: 'export-python-scene-name', label: 1, markerAt: 'top-right' },
        { target: 'export-python-indexing', label: 2, markerAt: 'left', pad: { left: 4, right: 4, top: 2, bottom: 2 } },
        { target: 'export-python-comments', label: 3, markerAt: 'left', pad: { left: 4, right: 4, top: 2, bottom: 2 } },
        { target: 'export-python-issues', label: 4, markerAt: 'top-right' },
        { target: 'export-python-copy', label: 5, markerAt: 'top' },
        { target: 'export-python-download', label: 6, markerAt: 'top-right' },
      ],
    },
    {
      // Export ▸ Video…: the three encoders, the format, size, frame rate and range.
      kind: 'shot',
      name: 'video',
      setup: async (page, kit) => {
        await kit.clearSelection();
        await kit.choose('Export ▸ Video…');
        await page.getByTestId('video-summary').waitFor();
      },
      target: 'export-video',
      padding: 8,
      scale: 1.5,
      highlight: [
        { target: { css: '.encoder-options' }, label: 1, markerAt: 'top-right' },
        { target: 'video-format', label: 2, markerAt: 'top-right' },
        { target: { union: ['video-size-preset', 'video-fps', 'video-range-whole'] }, label: 3, markerAt: 'bottom-right' },
        { target: 'video-start', label: 4, markerAt: 'top-right' },
      ],
    },
    {
      // Export ▸ Video… with a companion online: the three encoders on, Render with Manim chosen,
      // and the Manim field it brings.
      kind: 'shot',
      name: 'video-companion',
      setup: async (page, kit) => {
        await companionOnline(page, kit);
        await kit.clearSelection();
        await kit.choose('Export ▸ Video…');
        await kit.waitFor('video-summary');
        await kit.click('video-encoder-manim');
        await kit.waitFor('video-manim-target');
      },
      target: 'export-video',
      padding: 8,
      scale: 1.5,
      highlight: [
        { target: { css: '.encoder-options' }, label: 1, markerAt: 'top-right' },
        { target: 'video-manim-target', label: 2, markerAt: 'top-right' },
      ],
    },
    {
      // Export ▸ Image…: the frame at the playhead as a PNG. The playhead at 1.5 s, where the
      // first formula rests on screen: the instant (1), the size (2), the background (3) and the
      // button (4).
      kind: 'shot',
      name: 'image',
      setup: async (page, kit) => {
        await kit.clearSelection();
        await kit.seek(1.5);
        await kit.choose('Export ▸ Image…');
        await kit.waitFor('image-instant');
      },
      target: 'export-image',
      padding: 8,
      highlight: [
        { target: 'image-instant', label: 1, markerAt: 'right', pad: { left: 4, right: 4, top: 2, bottom: 2 } },
        { target: { role: 'radiogroup', name: 'Size' }, label: 2, markerAt: 'right', pad: { left: 4, right: 4, top: 2, bottom: 2 } },
        {
          target: { css: 'label:has([data-testid="image-transparent"])' },
          label: 3,
          markerAt: 'right',
          pad: { left: 4, right: 4, top: 2, bottom: 2 },
        },
        { target: 'image-start', label: 4, markerAt: 'top-right' },
      ],
    },
    {
      // Export ▸ Audio…: the sound of the project alone. A scene of 5 s, whose end the field shows
      // as 5: the seed example's 6.6000000000000005 s (4.4 + 2.2, as a tool wrote it) shows as it is.
      kind: 'shot',
      name: 'audio',
      project: 'docs/web/examples/first-animation-4-transformed.mfe.json',
      setup: async (page, kit) => {
        await kit.clearSelection();
        await kit.choose('Export ▸ Audio…');
        await page.getByTestId('audio-export').waitFor();
      },
      target: 'audio-export',
      padding: 8,
      highlight: [
        { target: 'audio-export-format', label: 1, markerAt: 'top-right' },
        { target: { union: ['audio-export-from', 'audio-export-to'] }, label: 2, markerAt: 'top-right' },
        { target: 'audio-export-start', label: 3, markerAt: 'top-right' },
      ],
    },
  ],
};
