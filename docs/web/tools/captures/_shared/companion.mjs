/* Shared by the capture files: a companion that answers the app's health check.
 *
 *   import { companionOnline } from '../_shared/companion.mjs';
 *   setup: async (page, kit) => { await companionOnline(page, kit); },
 *
 * The tools never start the companion (port 7799). Where a figure needs the app to see one — the
 * Export ▸ Video… dialog with its Manim choices, the renderer badge online —, the item answers
 * the app's `GET /health` itself, as a companion would (docs/COMPANION.md; the type is
 * `CompanionHealth` of app/src/engine/types.ts), and refuses every other request, so that nothing
 * reaches a companion that may be running on the machine. The formulas stay drawn by MathJax:
 * the answer says `latex: false`, as a companion without LaTeX would. */

/** Where the app looks for the companion. */
export const COMPANION_URL = 'http://127.0.0.1:7799';

/** The answer of a companion 1.7 with ffmpeg, a ManimCE and a ManimGL, started with
 * `--allow-manim-render`, without LaTeX and without font text. */
export const HEALTH = {
  name: 'mfe-companion',
  version: '1.7.0',
  protocol: 1,
  capabilities: {
    latex: false,
    dvisvgm: false,
    ffmpeg: true,
    videoAudio: ['mp4', 'mov', 'webm'],
    manimCE: { python: '/home/you/manim-ce/venv/bin/python', version: '0.22.1' },
    manimGL: { python: '/home/you/manim-gl/venv/bin/python', version: '1.7.2' },
    manimProbing: false,
    manimRender: true,
    manimSandbox: true,
    textMode: false,
  },
  limits: { videoBytes: 4 * 1024 ** 3 },
};

/** `HEALTH` with some capabilities changed: `healthWith({ manimGL: null, manimRender: false })`. */
export function healthWith(capabilities) {
  return { ...HEALTH, capabilities: { ...HEALTH.capabilities, ...capabilities } };
}

/** Makes the app see a companion online: its next health check gets `health` (`HEALTH` by
 * default), and it is asked at once (the app asks again when its window gains the focus). Waits
 * until the renderer badge of the menu bar says so. */
export async function companionOnline(page, kit, { health = HEALTH } = {}) {
  await page.route(`${COMPANION_URL}/**`, (route) => {
    if (new URL(route.request().url()).pathname !== '/health') return route.abort();
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(health),
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await kit.waitFor('engine-status', { has: { 'data-companion': 'online' }, timeout: 15_000 });
  await kit.settle({ renders: false });
}
