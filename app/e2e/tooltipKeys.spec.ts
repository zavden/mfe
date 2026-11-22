/* The tooltips that name a key or a gesture write it as the system the browser runs on does
 * (`keyHint`, ui/platform.ts), as the menus do: Ctrl and Alt on Windows and Linux, ⌘ and ⌥ on a
 * Mac, a gesture after its keys ("Ctrl + wheel", "⌘ + wheel"); and so do the texts written once
 * for every system (`keysText`). The browser is dressed as each system, as previewAlign.spec.ts
 * does for the action bar. Audit B5-11. */
import { expect, test } from './test';
import { clipJson, openTimeline } from './timelineHelpers';

/** `text` to be found as it is in a regular expression. */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const [platform, mod, alt, apply] of [
  ['Win32', 'Ctrl+', 'Alt+', 'Ctrl+Enter'],
  ['MacIntel', '⌘', '⌥', '⌘↩'],
] as const) {
  // The modifier alone, and before a gesture.
  const modKey = mod.replace('+', '');
  const altKey = alt.replace('+', '');

  test(`the tooltips write the keys as the system does (${platform})`, async ({ page }) => {
    await page.addInitScript((name) => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => name });
    }, platform);
    await openTimeline(page, [clipJson('a', 'fa', 't1', 0, 4)]);
    const title = (testId: string) => page.getByTestId(testId);

    // The preview: its zoom, and the pan of Fit.
    await expect(title('preview-zoom-out')).toHaveAttribute(
      'title',
      `Zoom out (${modKey} + wheel)`,
    );
    await expect(title('preview-zoom-in')).toHaveAttribute('title', `Zoom in (${modKey} + wheel)`);
    // A Mac's trackpad has no middle button: a scroll moves the view there, and is named first.
    await expect(title('preview-fit')).toHaveAttribute(
      'title',
      platform === 'MacIntel'
        ? `Show the whole frame (pan with a scroll, the middle button or ${altKey} + drag)`
        : `Show the whole frame (pan with middle button or ${altKey} + drag)`,
    );
    const symbol = await title('preview-align-symbol').getAttribute('title');
    expect(symbol).toMatch(new RegExp(`^Align by symbol \\(${escape(alt)}G\\): `));
    expect(symbol).toContain(`${platform === 'MacIntel' ? '⌥⇧G' : 'Shift+Alt+G'} takes`);
    // The grid's keys under the preview.
    await expect(title('transport-grid')).toHaveAttribute(
      'title',
      `Show the grid (${mod}'): a dragged formula snaps to it (${modKey} held frees it)`,
    );
    await expect(title('transport-grid-sparser')).toHaveAttribute(
      'title',
      `Sparser grid (${alt}↓)`,
    );
    await expect(title('transport-grid-denser')).toHaveAttribute('title', `Denser grid (${alt}↑)`);
    // The timeline's zoom: ⌘ is its key on a Mac too.
    await expect(title('timeline-zoom-out')).toHaveAttribute(
      'title',
      `Zoom out (${modKey} + wheel)`,
    );
    await expect(title('timeline-zoom-in')).toHaveAttribute('title', `Zoom in (${modKey} + wheel)`);
    // The texts that are written once for every system (`keysText`): the keys they name are the
    // system's too, alone ("hold ⌘", "⇧: 1 s") as in a menu.
    const [command, shift] = platform === 'MacIntel' ? ['⌘', '⇧'] : ['Ctrl/⌘', 'Shift'];
    await expect(title('preview-snap')).toHaveAttribute(
      'title',
      `Snap a dragged formula to the edges and centres of the others and of the frame (hold ${command} to suspend)`,
    );
    await expect(title('transport-step-back')).toHaveAttribute(
      'title',
      `Previous frame (←, ${shift}: 1 s)`,
    );
    await expect(title('timeline-snap')).toHaveAttribute(
      'title',
      `Snap to the playhead, clip edges and the time grid (hold ${shift} to suspend)`,
    );
    // The Creator's search, and Apply in the formula editor.
    await expect(title('creator-search-open')).toHaveAttribute(
      'title',
      `Search formulas, by name or LaTeX (${mod}F)`,
    );
    await page.getByTestId('creator-new').click();
    await expect(page.getByTestId('formula-editor').getByTestId('editor-apply')).toHaveAttribute(
      'title',
      apply,
    );
  });
}
