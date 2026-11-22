/* The shortcuts on a keyboard layout of another script (Russian here): there Chrome gives the
 * layout's letter in `key` — Ctrl+Z is "я" — and the place of the key in `code` ("KeyZ"). The
 * letters of the app's shortcuts and of the timeline's keys are read at the places of a Latin
 * keyboard then (`letterOf`, ui/platform.ts), so they work as on a Latin layout. Playwright types
 * through a US layout, so the presses are dispatched as that layout makes them, on the element
 * that has the focus. Audit B5-03. */
import type { Page } from './test';
import { expect, test } from './test';
import { MAC } from './helpers';
import { clipJson, openTimeline, project, setTime } from './timelineHelpers';

const A = clipJson('a', 'fa', 't1', 0, 8);
const body = { position: { x: 30, y: 8 } };

/** A key press of a Russian layout on the focused element: `key` what it types, `code` where it
 * is; `command` holds Ctrl, or ⌘ on a Mac. */
async function pressRussian(
  page: Page,
  key: string,
  code: string,
  mods: { command?: boolean; shift?: boolean } = {},
): Promise<void> {
  await page.evaluate(
    ({ key, code, command, shift, mac }) => {
      const target = document.activeElement ?? document.body;
      for (const type of ['keydown', 'keyup']) {
        target.dispatchEvent(
          new KeyboardEvent(type, {
            key,
            code,
            ctrlKey: command && !mac,
            metaKey: command && mac,
            shiftKey: shift,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    { key, code, command: mods.command ?? false, shift: mods.shift ?? false, mac: MAC },
  );
}

test('Ctrl/⌘+Z, S, Ctrl/⌘+D and Shift+C work on a Russian layout', async ({ page }) => {
  await openTimeline(page, [A]);
  await page.getByTestId('clip-a').click(body);
  // One step to undo: the clip a frame later. Ctrl/⌘+Z is Ctrl/⌘+«я» there.
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await project(page)).clips[0]!.start).toBeGreaterThan(0);
  await pressRussian(page, 'я', 'KeyZ', { command: true });
  await expect.poll(async () => (await project(page)).clips[0]!.start).toBe(0);

  // S is «ы»: it splits the selected clip under the playhead.
  await setTime(page, 4);
  await pressRussian(page, 'ы', 'KeyS');
  await expect.poll(async () => (await project(page)).clips.length).toBe(2);

  // Ctrl/⌘+D is Ctrl/⌘+«в»: the two halves, selected after the split, are duplicated.
  await pressRussian(page, 'в', 'KeyD', { command: true });
  await expect.poll(async () => (await project(page)).clips.length).toBe(4);

  // Shift+C is Shift+«С»: colours in order start.
  await pressRussian(page, 'С', 'KeyC', { shift: true });
  await expect(page.getByTestId('preview-frame')).toHaveAttribute('data-colour-order', 'copy');
});
