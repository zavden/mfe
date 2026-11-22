import { expect, test, type Locator, type Page } from './test';
import { startApp } from './creatorHelpers';
import { canUndo, getProject, undo } from './helpers';

/* The on-screen keyboard of the formula editor: the editor's own keypad. One key shows it,
 * Keyboard, beside the title of the LaTeX section: four tabs of keys that write in the visual
 * field and a key that applies, in the dialog, under the field. MathLive's own keyboard, which
 * the field could show at the bottom of the window, is never shown. */

/** MathLive's keyboard, as the page holds it. */
interface KeyboardWindow {
  mathVirtualKeyboard: { visible: boolean };
}

/** A new formula, open in its editor: its visual field has taken the focus (MathLive takes it a
 * moment after it is asked to, and gives it up to a press made meanwhile). */
async function newFormula(page: Page): Promise<Locator> {
  await startApp(page);
  await page.getByTestId('creator-new').click();
  const editor = page.getByTestId('formula-editor');
  await expect(editor.locator('math-field')).toBeFocused();
  return editor;
}

const mathliveShown = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as KeyboardWindow).mathVirtualKeyboard.visible);

/** A key of the tab that is shown. */
const key = (page: Page, id: string): Locator => page.getByTestId(`keypad-key-${id}`);

/** Changes the tab, by its name on the keypad. */
async function showTab(page: Page, tab: string): Promise<void> {
  await page.getByTestId(`keypad-tab-${tab}`).click();
  await expect(page.getByTestId(`keypad-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
}

/** Presses the keys of the shown tab, one after the other. */
async function press(page: Page, ...ids: string[]): Promise<void> {
  for (const id of ids) await key(page, id).click();
}

/** Shows the keypad with the editor's key; the field has the focus when it returns. */
async function showKeyboard(page: Page, editor: Locator): Promise<void> {
  await editor.getByTestId('toggle-keyboard').click();
  await expect(key(page, 'apply')).toBeVisible();
  await expect(editor.locator('math-field')).toBeFocused();
}

const sourceOf = async (page: Page): Promise<string> =>
  (await getProject(page)).formulas[0]!.source;

/** Where an element is on the page: its top and its bottom. */
async function span(locator: Locator): Promise<{ top: number; bottom: number }> {
  const box = (await locator.boundingBox())!;
  return { top: box.y, bottom: box.y + box.height };
}

test.describe('the formula keyboard', () => {
  test('one key shows it: the visual field has none of its own', async ({ page }) => {
    const editor = await newFormula(page);
    // MathLive draws a key for its keyboard inside the field: it is there, and not shown.
    const own = editor.locator('math-field').locator('[part="virtual-keyboard-toggle"]');
    await expect(own).toHaveCount(1);
    await expect(own).toBeHidden();
    // The field's menu stays.
    await expect(editor.locator('math-field').locator('[part="menu-toggle"]')).toBeVisible();
    // The editor's key is beside the title of the section, over the field.
    const toggle = editor.getByTestId('toggle-keyboard');
    await expect(toggle).toBeVisible();
    expect((await span(toggle)).bottom).toBeLessThanOrEqual(
      (await span(editor.getByTestId('math-field-host'))).top,
    );
  });

  test('a key that leaves holes writes LaTeX that renders: a hole is no error', async ({
    page,
  }) => {
    const editor = await newFormula(page);
    const raw = editor.getByTestId('raw-latex');
    await showKeyboard(page, editor);
    // The field shows the two holes of the fraction. The raw LaTeX has what LaTeX reads,
    // two empty groups, and not the mark MathLive keeps for a hole, which nothing typesets.
    await press(page, 'frac');
    await expect(raw).toHaveValue('\\frac{}{}');
    await expect(editor.getByTestId('editor-status')).toHaveText(/1 glyphs/);
    await expect(editor.getByTestId('editor-error')).toHaveCount(0);
    // The holes are still holes in the field: what is pressed next fills the first.
    await press(page, 'd1');
    await expect(raw).toHaveValue(/^\\frac\{?1\}?\{\}$/);
    await press(page, 'right', 'd2');
    await expect(raw).toHaveValue(/^\\frac\{?1\}?\{?2\}?$/);
    await expect(editor.getByTestId('editor-status')).toHaveText(/3 glyphs/);
  });

  test('its keys write in the formula, and its Apply key applies it', async ({ page }) => {
    const editor = await newFormula(page);
    const raw = editor.getByTestId('raw-latex');
    await showKeyboard(page, editor);
    await expect(editor.getByTestId('toggle-keyboard')).toHaveAttribute('aria-pressed', 'true');

    // A fraction: its numerator first, the arrow goes on to the denominator.
    await press(page, 'frac', 'd1', 'right', 'd2');
    await expect(raw).toHaveValue(/^\\frac\{?1\}?\{?2\}?$/);
    // A key takes neither the dialog nor the focus away: what is typed goes on in the
    // formula.
    await expect(editor).toBeVisible();
    await expect(editor.locator('math-field')).toBeFocused();
    await press(page, 'right', 'plus');
    await page.keyboard.type('x');
    await expect(raw).toHaveValue(/^\\frac\{?1\}?\{?2\}?\+x$/);
    // Delete backward takes the last thing written.
    await press(page, 'd5');
    await expect(raw).toHaveValue(/\+x5$/);
    await press(page, 'backspace');
    await expect(raw).toHaveValue(/\+x$/);
    await press(page, 'square');
    await expect(raw).toHaveValue(/\+x\^\{?2\}?$/);

    // Nothing reached the project yet: the keys write the draft.
    expect(await sourceOf(page)).toBe('');
    await press(page, 'apply');
    await expect.poll(() => sourceOf(page)).toBe(await raw.inputValue());
    await expect(editor.getByTestId('editor-apply')).toBeDisabled();
    // The editor and the keyboard stay, for what comes next.
    await expect(editor).toBeVisible();
    await expect(key(page, 'apply')).toBeVisible();

    // AC takes all of it.
    await press(page, 'clear');
    await expect(raw).toHaveValue('');
  });

  test('its Apply key applies what the key before it wrote, at once', async ({ page }) => {
    const editor = await newFormula(page);
    await showKeyboard(page, editor);
    // MathLive tells a change a moment after it is made. Written and applied in one go, as
    // two keys pressed with no time between them: what is applied has what was written.
    await editor.locator('math-field').evaluate((field) => {
      (field as unknown as { insert(latex: string): void }).insert('7');
      document.querySelector<HTMLElement>('[data-testid="keypad-key-apply"]')!.click();
    });
    await expect.poll(() => sourceOf(page)).toBe('7');
  });

  test('its Apply key adds no row to a formula that has rows', async ({ page }) => {
    const editor = await newFormula(page);
    const raw = editor.getByTestId('raw-latex');
    await raw.fill('a &= b \\\\ c &= d');
    await editor.getByTestId('editor-apply').click();
    await editor.locator('math-field').click();
    await showKeyboard(page, editor);
    // Written in a row, then applied: two rows, as before.
    await press(page, 'plus', 'd1');
    await expect(raw).toHaveValue(/\+1/);
    await press(page, 'apply');
    await expect.poll(() => sourceOf(page)).toMatch(/\+1/);
    const source = await sourceOf(page);
    expect(source).toBe(await raw.inputValue());
    expect(source.split('\\\\')).toHaveLength(2);
  });

  // The textarea holds the source: what the visual field holds of a text typed there is
  // MathLive's own writing of it, with no comment, on one line, `\frac{1}{2}` for `\frac12`.
  test('its Apply key applies a source typed by hand as it was typed', async ({ page }) => {
    const editor = await newFormula(page);
    const raw = editor.getByTestId('raw-latex');
    await showKeyboard(page, editor);
    const typed = '\\frac12 x^2 % squared';
    await raw.fill(typed);
    await press(page, 'apply');
    await expect.poll(() => sourceOf(page)).toBe(typed);
    await expect(raw).toHaveValue(typed);
    await expect(editor.getByTestId('editor-apply')).toBeDisabled();

    // Rows on two lines, applied with the editor's own button. Then the keypad's Apply, with no
    // edit made: the editor's button is off, and the key applies nothing either.
    const rows = 'a + 1 &= b \\\\\n&= c';
    await raw.fill(rows);
    await editor.getByTestId('editor-apply').click();
    await expect.poll(() => sourceOf(page)).toBe(rows);
    await expect(editor.getByTestId('editor-apply')).toBeDisabled();
    await press(page, 'apply');
    await expect(raw).toHaveValue(rows);
    expect(await sourceOf(page)).toBe(rows);
    // One step back is the source before the rows: the key added no step of its own.
    await undo(page);
    expect(await sourceOf(page)).toBe(typed);
  });

  test('its tabs change the keys; the capitals hold for one letter', async ({ page }) => {
    const editor = await newFormula(page);
    const raw = editor.getByTestId('raw-latex');
    await showKeyboard(page, editor);
    await expect(key(page, 'frac')).toBeVisible();
    await expect(key(page, 'sin')).toHaveCount(0);

    await showTab(page, 'trigonometry');
    await press(page, 'sin', 'theta');
    await expect(raw).toHaveValue(/^\\sin\s*\\theta$/);
    await press(page, 'clear');

    await showTab(page, 'calculus');
    await press(page, 'infinity');
    await expect(raw).toHaveValue('\\infty');
    await press(page, 'clear');

    await showTab(page, 'alphabet');
    await press(page, 'shift', 'a', 'b', 'alpha');
    await expect(raw).toHaveValue(/^Ab\s*\\alpha$/);
    // The dialog is still there, and the field still has the focus.
    await expect(editor).toBeVisible();
    await expect(editor.locator('math-field')).toBeFocused();
  });

  test('left shown, it is shown when the editor opens again; hidden, it stays hidden', async ({
    page,
  }) => {
    const editor = await newFormula(page);
    const raw = editor.getByTestId('raw-latex');
    const toggle = editor.getByTestId('toggle-keyboard');
    await showKeyboard(page, editor);
    await press(page, 'x');
    await press(page, 'apply');
    await expect.poll(() => sourceOf(page)).toBe('x');
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(key(page, 'apply')).toHaveCount(0);

    // The formula that exists, opened again: the keyboard is there, and its keys write.
    await page.getByTestId('formula-item').dblclick();
    await expect(key(page, 'apply')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await press(page, 'plus', 'd1');
    await expect(raw).toHaveValue('x+1');
    await press(page, 'apply');
    await expect.poll(() => sourceOf(page)).toBe('x+1');

    // Hidden with its key, it is not shown the next time.
    await toggle.click();
    await expect(key(page, 'apply')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await page.getByTestId('formula-item').dblclick();
    await expect(editor.locator('math-field')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(key(page, 'apply')).toHaveCount(0);
  });

  test('it is the one keyboard: MathLive’s is never shown, whatever a browser kept', async ({
    page,
  }) => {
    // A browser that chose MathLive's keyboard while there were two, and left it shown.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'mfe.preferences',
        JSON.stringify({ formulaKeyboard: 'mathlive', formulaKeyboardShown: true }),
      );
    });
    const editor = await newFormula(page);
    // Left shown: the keypad is there with the editor, and nothing at the bottom of the window.
    await expect(editor.getByTestId('formula-keypad')).toBeVisible();
    await expect(editor.getByTestId('toggle-keyboard')).toHaveAttribute('aria-pressed', 'true');
    expect(await mathliveShown(page)).toBe(false);
    await expect(page.locator('.ML__keyboard')).toHaveCount(0);
    await press(page, 'x', 'plus', 'd1');
    await expect(editor.getByTestId('raw-latex')).toHaveValue('x+1');
    expect(await mathliveShown(page)).toBe(false);
    await press(page, 'apply');
    await expect.poll(() => sourceOf(page)).toBe('x+1');
    // The Preferences menu has no keyboard to choose.
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await page.getByTestId('menu-preferences').click();
    await expect(page.getByTestId('menu-item-preferences-split-suffix')).toBeVisible();
    await expect(page.getByTestId('menu-item-preferences-formula-keyboard')).toHaveCount(0);
  });
});

test.describe('the keypad in the dialog', () => {
  test('the key shows it under the visual field, over the raw LaTeX, and hides it', async ({
    page,
  }) => {
    const editor = await newFormula(page);
    const toggle = editor.getByTestId('toggle-keyboard');
    const keypad = editor.getByTestId('formula-keypad');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(keypad).toHaveCount(0);

    await toggle.click();
    await expect(keypad).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // The key did not take the focus: what is typed goes on in the formula.
    await expect(editor.locator('math-field')).toBeFocused();
    const field = await span(editor.getByTestId('math-field-host'));
    const raw = await span(editor.getByTestId('raw-latex'));
    const pad = await span(keypad);
    expect(pad.top).toBeGreaterThanOrEqual(field.bottom);
    expect(pad.bottom).toBeLessThanOrEqual(raw.top);
    // It is in the dialog: nothing is shown at the bottom of the window.
    expect(await mathliveShown(page)).toBe(false);

    await toggle.click();
    await expect(keypad).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(editor.locator('math-field')).toBeFocused();
  });

  for (const size of [
    { width: 1280, height: 800 },
    { width: 1280, height: 720 },
  ]) {
    test(`shown, it is in sight whole with the field it writes in (${size.width}×${size.height})`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      const editor = await newFormula(page);
      await showKeyboard(page, editor);
      await expect(editor.getByTestId('toggle-keyboard')).toBeInViewport({ ratio: 1 });
      await expect(editor.getByTestId('math-field-host')).toBeInViewport({ ratio: 1 });
      await expect(editor.getByTestId('formula-keypad')).toBeInViewport({ ratio: 1 });
      // Every tab is as tall: nothing under the keypad moves from one to another.
      const tall = await span(editor.getByTestId('formula-keypad'));
      for (const tab of ['trigonometry', 'calculus', 'alphabet']) {
        await showTab(page, tab);
        expect(await span(editor.getByTestId('formula-keypad'))).toEqual(tall);
      }
      // No key is squeezed, in the tab that has most of them in a row: six rows of ten, and
      // the five keys of the last row.
      const keys = editor.locator('.keypad-key');
      expect(await keys.count()).toBe(65);
      for (const box of await keys.evaluateAll((all) =>
        all.map((el) => {
          const rect = el.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      )) {
        expect(box.width).toBeGreaterThanOrEqual(40);
        expect(box.height).toBeGreaterThanOrEqual(30);
      }
    });
  }

  test('from the physical keyboard it is one stop of Tab; undo there is the formula’s', async ({
    page,
  }) => {
    const editor = await newFormula(page);
    const raw = editor.getByTestId('raw-latex');
    await raw.fill('x');
    await editor.getByTestId('editor-apply').click();
    expect(await sourceOf(page)).toBe('x');
    await editor.locator('math-field').click();
    await showKeyboard(page, editor);
    await press(page, 'plus', 'd1');
    await expect(raw).toHaveValue('x+1');

    // Tab from the field: the tabs of the keypad, then its keys, as one stop.
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('keypad-tab-algebra')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(key(page, 'frac')).toBeFocused();
    // The arrows move among the keys; Enter presses one, and the key keeps the focus.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(key(page, 'd7')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(raw).toHaveValue('x+17');
    await expect(key(page, 'd7')).toBeFocused();

    // Undo, on a key: the last thing the keys wrote, not the last step of the project.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(raw).toHaveValue('x+1');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(raw).toHaveValue('x+');
    expect(await sourceOf(page)).toBe('x');
    expect((await getProject(page)).formulas).toHaveLength(1);
    expect(await canUndo(page)).toBe(true);
    // Redo, the same.
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(raw).toHaveValue('x+1');
    // One more Tab leaves the keypad: the raw LaTeX is next.
    await page.keyboard.press('Tab');
    await expect(raw).toBeFocused();
  });
});
