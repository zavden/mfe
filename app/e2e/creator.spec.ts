import { expect, test, type Page } from './test';
import {
  addFormulaViaUi,
  canvasStats,
  closeEditor,
  showGlyphList,
  startApp,
  waitForDrawables,
} from './creatorHelpers';
import { getProject, holdToConfirm, undo, type MfeWindow } from './helpers';

test.describe('Creator', () => {
  test('creates a formula, shows its glyphs and renders it in the preview', async ({ page }) => {
    await startApp(page);
    await expect(page.getByTestId('creator-empty')).toBeVisible();
    const editor = await addFormulaViaUi(page, 'a+b=c');

    await showGlyphList(editor);
    const chips = editor.getByTestId('glyph-chips').getByRole('listitem');
    await expect(chips).toHaveCount(5);
    await expect(chips.locator('.glyph-chip-label')).toHaveText(['a', '+', 'b', '=', 'c']);
    await expect(editor.getByTestId('editor-source-badge')).toHaveText('MathJax');
    await closeEditor(page);

    const row = page.getByTestId('formula-item');
    await expect(row).toHaveAttribute('data-name', 'f1');
    await expect(row.getByTestId('formula-status')).toHaveText('MathJax');
    await expect(row.getByTestId('formula-thumb').locator('path')).toHaveCount(5);

    // A formula that is not on the timeline yet is not in the preview; its clip would be.
    const project = await getProject(page);
    expect(project.formulas).toHaveLength(1);
    expect(project.formulas[0]!.source).toBe('a+b=c');
  });

  test('the glyphs are listed under the drawing only while the key beside «Glyphs» is pressed', async ({
    page,
  }) => {
    await startApp(page);
    await page.getByTestId('creator-new').click();
    const editor = page.getByTestId('formula-editor');
    const key = editor.getByTestId('glyph-list-toggle');
    const list = editor.getByTestId('glyph-chips');
    // Nothing applied, nothing to list: the key waits.
    await expect(key).toBeDisabled();
    await editor.getByTestId('raw-latex').fill('a+b=c');
    await editor.getByTestId('editor-apply').click();

    // The drawing has the glyphs; their list is left out, and the key is beside the title.
    await expect(editor.getByTestId('glyph-4')).toBeVisible();
    await expect(key).toBeEnabled();
    await expect(key).toHaveAttribute('aria-pressed', 'false');
    await expect(list).toHaveCount(0);
    const title = (await editor.getByRole('heading', { name: 'Glyphs' }).boundingBox())!;
    const beside = (await key.boundingBox())!;
    const drawing = (await editor.locator('.glyph-svg').boundingBox())!;
    expect(beside.x).toBeGreaterThan(title.x + title.width);
    expect(beside.x - (title.x + title.width)).toBeLessThan(16);
    expect(beside.y + beside.height).toBeLessThanOrEqual(drawing.y);

    // Pressed from the keyboard, the list is the way to pick glyphs without a pointer.
    await key.focus();
    await page.keyboard.press('Enter');
    await expect(key).toHaveAttribute('aria-pressed', 'true');
    await expect(list.getByRole('listitem')).toHaveCount(5);
    const listed = (await list.boundingBox())!;
    expect(listed.y).toBeGreaterThanOrEqual(drawing.y);
    await page.keyboard.press('Tab');
    await expect(editor.getByTestId('glyph-chip-0')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(editor.getByTestId('glyph-selection')).toHaveText('1 selected: 0');

    // The editor's choice, not the formula's: the browser keeps it, and the next formula has it.
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('mfe.preferences') ?? '{}').glyphList,
      ),
    ).toBe(true);
    await closeEditor(page);
    const second = await addFormulaViaUi(page, 'x+y');
    await expect(second.getByTestId('glyph-chips').getByRole('listitem')).toHaveCount(3);

    // Pressed again, the list goes and what was picked stays.
    await second.getByTestId('glyph-1').click();
    await second.getByTestId('glyph-list-toggle').click();
    await expect(second.getByTestId('glyph-chips')).toHaveCount(0);
    await expect(second.getByTestId('glyph-selection')).toHaveText('1 selected: 1');
    await expect(second.getByTestId('glyph-1')).toHaveAttribute('data-selected', 'true');
  });

  test('+ New ▸ enables font text and retains Formula as the default', async ({ page }) => {
    await startApp(page);
    await page.getByTestId('creator-new-menu').click();
    const menu = page.getByTestId('creator-new-kinds');
    await expect(menu.getByRole('menuitem')).toHaveText(['Formula', 'Text (LaTeX)', 'Text (font)']);
    await expect(menu.getByTestId('creator-new-tex')).toBeEnabled();
    await expect(menu.getByTestId('creator-new-text')).toBeEnabled();
    // The first entry takes the focus: Enter makes a formula and opens its editor.
    await expect(menu.getByTestId('creator-new-math')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    const editor = page.getByTestId('formula-editor');
    await expect(editor.getByTestId('editor-name')).toHaveValue('f1');
    await closeEditor(page);
    const row = page.getByTestId('formula-item');
    await expect(row.getByTestId('formula-kind')).toHaveText('∑');
    await expect(row.getByTestId('formula-kind')).toHaveAttribute('title', 'Formula');
    await expect(row).toHaveAccessibleName('Formula f1');

    // Escape closes the menu and gives the focus back to the arrow.
    await page.getByTestId('creator-new-menu').click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByTestId('creator-new-menu')).toBeFocused();
    expect((await getProject(page)).formulas).toHaveLength(1);
  });

  test('a LaTeX text: composed in its workspace, rows and width in the glyphs, Tex / TexText in the Python', async ({
    page,
  }) => {
    await startApp(page);
    await page.getByTestId('creator-new-menu').click();
    await page.getByTestId('creator-new-tex').click();
    const editor = page.getByTestId('text-composition');
    await expect(editor).toContainText('LaTeX text composition · t1');
    await expect(page.getByTestId('formula-editor')).toHaveCount(0);
    // The new text's field takes the focus: the menu does not take it back as it closes.
    await expect(editor.getByTestId('tex-source')).toBeFocused();
    await expect(editor.locator('math-field')).toHaveCount(0);
    await editor.getByTestId('tex-source').fill('Hello world \\\\ bye');
    await expect(editor.getByTestId('text-render-status')).toHaveText('13 glyphs · MathJax');
    await expect(editor.getByTestId('text-render-warnings')).toBeHidden();
    await editor.getByTestId('text-view-glyphs').click();
    await showGlyphList(editor);
    const chips = editor.getByTestId('glyph-chips').getByRole('listitem');
    await expect(chips).toHaveCount(13);
    // A width: part of the draft, applied with the text; free mode breaks the lines itself and
    // says the breaks are approximate.
    await editor.getByTestId('tex-width').fill('1');
    await editor.getByTestId('tex-width').press('Enter');
    await editor.getByTestId('tex-align-left').click();
    await expect(editor.getByTestId('text-render-warnings')).toContainText('approximate');
    await expect(chips).toHaveCount(13);
    // Nothing exists until Apply.
    expect((await getProject(page)).formulas).toHaveLength(0);
    await editor.getByTestId('text-apply').click();
    await expect(editor).toHaveCount(0);
    const row = page.getByTestId('formula-item');
    await expect(row.getByTestId('formula-kind')).toHaveText('T');
    expect((await getProject(page)).formulas[0]).toMatchObject({
      kind: 'tex',
      name: 't1',
      layout: { width: 1, align: 'left', lineSpacing: 1 },
    });

    // On the timeline it exports as Tex (CE) / TexText (GL) with the \parbox the width needs.
    await row.click({ button: 'right' });
    await page.getByTestId('formula-menu-add-to-timeline').click();
    await page.getByTestId('export-button').click();
    const code = page.getByTestId('export-python-code');
    await expect(code).toContainText(
      't1 = Tex(r"\\parbox{20.075pt}{\\raggedright Hello world \\\\ bye\\par}")',
    );
    await page.getByTestId('export-python-close').click();
    await page.getByTestId('export-button-menu').click();
    await page.getByTestId('export-button-export-gl').click();
    // Exported for ManimGL at a converted size, the box keeps its one scene unit.
    await expect(code).toContainText(
      /t1 = TexText\(r"\\parbox\{20\.075\d*pt\}\{\\raggedright Hello world \\\\ bye\\par\}", font_size=49\.4944\)/,
    );
    await page.getByTestId('export-python-close').click();
  });

  test('«+ New» and «Export…» are one button each: the main part, then its arrow', async ({
    page,
  }) => {
    await startApp(page);
    const radii = (testId: string) =>
      page.getByTestId(testId).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          left: [style.borderTopLeftRadius, style.borderBottomLeftRadius].map(parseFloat),
          right: [style.borderTopRightRadius, style.borderBottomRightRadius].map(parseFloat),
        };
      });
    for (const id of ['creator-new', 'export-button']) {
      const arrow = page.getByTestId(`${id}-menu`);
      const main = (await page.getByTestId(id).boundingBox())!;
      const side = (await arrow.boundingBox())!;
      // The two parts touch, on one line and of one height.
      expect(Math.abs(main.x + main.width - side.x)).toBeLessThan(0.5);
      expect(Math.abs(main.y - side.y)).toBeLessThan(0.5);
      expect(Math.abs(main.height - side.height)).toBeLessThan(0.5);
      // Round at the two ends — a control's corners, not a pill's — and square where they meet.
      const [mainRadii, arrowRadii] = [await radii(id), await radii(`${id}-menu`)];
      const [corner] = mainRadii.left;
      expect(corner).toBeGreaterThanOrEqual(6);
      expect(corner).toBeLessThan(main.height / 2);
      expect(mainRadii.left).toEqual([corner, corner]);
      expect(mainRadii.right).toEqual([0, 0]);
      expect(arrowRadii.left).toEqual([0, 0]);
      expect(arrowRadii.right).toEqual([corner, corner]);
      // The arrow is drawn, and still named for who cannot see it.
      await expect(arrow.locator('svg')).toHaveCount(1);
      await expect(arrow).toHaveText('');
      await expect(arrow).toHaveAccessibleName(/.+/);
    }
  });

  test('Ctrl+Enter applies the source being typed, like the Apply button', async ({ page }) => {
    await startApp(page);
    await page.getByTestId('creator-new').click();
    const editor = page.getByTestId('formula-editor');
    await editor.getByTestId('raw-latex').fill('a+b');
    await expect(editor.getByTestId('editor-apply')).toBeEnabled();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect
      .poll(async () => (await getProject(page)).formulas.map((formula) => formula.source))
      .toEqual(['a+b']);
    await expect(editor.getByTestId('editor-apply')).toBeDisabled();
    await expect(editor).toBeVisible();
  });

  test('the visual editor and the raw field stay in sync', async ({ page }) => {
    await startApp(page);
    await page.getByTestId('creator-new').click();
    const editor = page.getByTestId('formula-editor');
    const field = editor.locator('math-field');
    await expect(field).toBeVisible();

    // Raw → visual.
    await editor.getByTestId('raw-latex').fill('\\frac{a}{b}');
    await expect
      .poll(() =>
        field.evaluate((el) =>
          (el as unknown as { getValue(f: string): string }).getValue('latex'),
        ),
      )
      .toBe('\\frac{a}{b}');

    // Visual → raw.
    await field.evaluate((el) => {
      const mf = el as unknown as {
        setValue(v: string): void;
        insert(v: string): void;
        focus(): void;
      };
      mf.setValue('x^2');
      mf.focus();
      mf.insert('+y');
    });
    await expect(editor.getByTestId('raw-latex')).toHaveValue('x^2+y');

    // Typing into the visual editor reaches the draft too.
    await field.click();
    await page.keyboard.type('z');
    await expect(editor.getByTestId('raw-latex')).toHaveValue(/z/);
    await editor.getByTestId('editor-apply').click();
    expect((await getProject(page)).formulas[0]!.source).toMatch(/z/);
  });

  test('MathLive works: fonts load and macros of a package are previewed', async ({ page }) => {
    await startApp(page);
    await page.getByTestId('creator-new').click();
    const editor = page.getByTestId('formula-editor');
    await editor.getByTestId('package-quick-physics').click();
    await expect(editor.getByTestId('package-chip-physics')).toBeVisible();
    const raw = editor.getByTestId('raw-latex');
    const drawing = editor.locator('math-field').locator('[part="content"]');
    /** What MathLive draws, read as text: without spaces nor the marks that have no width, and
     * with the bar it draws a delimiter with (∣, U+2223) as the bar that is typed. */
    const drawn = () =>
      drawing.evaluate((node) =>
        (node.textContent ?? '')
          .replace(/[\s\u200B-\u200F\u2060\uFEFF]/gu, '')
          .replace(/\u2223/gu, '|'),
      );
    // The two bars as TeX writes them: what the macro of the package has to draw.
    await raw.fill('\\left|x\\right|');
    await expect.poll(drawn).toBe('|x|');
    // They leave the screen before the macro is asked: a drawing that stayed would pass for it.
    await raw.fill('q');
    await expect.poll(drawn).toBe('q');
    // Without the physics macro MathLive would draw \abs as an error; with it, the same bars.
    await raw.fill('\\abs{x}');
    await expect.poll(drawn).toBe('|x|');
    await expect(drawing.locator('.ML__error')).toHaveCount(0);
    await raw.fill('\\abs{x} + \\mathbb{R}');
    const html = await editor.locator('math-field').evaluate((el) => el.shadowRoot!.innerHTML);
    expect(html).not.toContain('ML__error');
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    });
    expect(fonts).toContain('KaTeX_Main');
  });

  test('a formula with rows is shown in aligned rows; the raw LaTeX keeps them bare', async ({
    page,
  }) => {
    await startApp(page);
    await page.getByTestId('creator-new').click();
    const editor = page.getByTestId('formula-editor');
    const field = editor.locator('math-field');
    await expect(field).toBeVisible();
    const fieldLatex = () =>
      field.evaluate((el) => (el as unknown as { getValue(f: string): string }).getValue('latex'));

    // Manim's align* reads `&` and `\\` as rows; MathLive on its own would draw them as errors.
    const raw = 'A &= x_1 \\\\\n  &= x_2 \\\\\n  &= x_3';
    await editor.getByTestId('raw-latex').fill(raw);
    await expect.poll(fieldLatex).toMatch(/^\\begin\{aligned\}[\s\S]*\\end\{aligned\}$/);
    // The field has its value some tens of milliseconds before it has drawn it: the drawing is
    // waited for. Read at once, it was still empty on a machine with nothing else to do.
    const drawn = () => field.evaluate((el) => el.shadowRoot!.innerHTML);
    await expect.poll(drawn).toContain('ML__mtable');
    expect(await drawn()).not.toContain('ML__error');
    await expect(editor.getByTestId('raw-latex')).toHaveValue(raw);
    await editor.getByTestId('editor-apply').click();
    await showGlyphList(editor);
    await expect(editor.getByTestId('glyph-chips').getByRole('listitem')).toHaveCount(10);
    expect((await getProject(page)).formulas[0]!.source).toBe(raw);

    // Editing in the visual field keeps the wrapper out of the raw LaTeX.
    await field.evaluate((el) => {
      const mf = el as unknown as {
        focus(): void;
        executeCommand(command: string): void;
        insert(latex: string): void;
      };
      mf.focus();
      mf.executeCommand('moveToMathfieldEnd');
      mf.insert('+1');
    });
    await expect(editor.getByTestId('raw-latex')).toHaveValue(/\+1$/);
    const edited = await editor.getByTestId('raw-latex').inputValue();
    expect(edited).not.toContain('aligned');
    expect(edited).toContain('\\\\');
    await editor.getByTestId('editor-apply').click();
    await showGlyphList(editor);
    await expect(editor.getByTestId('glyph-chips').getByRole('listitem')).toHaveCount(12);

    // An environment the user wrote is shown as it is.
    await editor.getByTestId('raw-latex').fill('\\begin{cases} a & b \\\\ c & d \\end{cases}');
    await expect.poll(fieldLatex).toMatch(/^\\begin\{cases\}/);
  });

  test('colours glyphs with click, Shift+click and Ctrl+click and shows them in the preview', async ({
    page,
  }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'a+b=c');
    await showGlyphList(editor);
    const chip = (i: number) => editor.getByTestId(`glyph-chip-${i}`);
    await chip(0).click();
    await chip(2).click({ modifiers: ['Shift'] });
    await expect(editor.getByTestId('glyph-selection')).toContainText('3 selected: 0, 1, 2');
    await editor.getByTestId('palette-RED').click();
    await chip(1).click();
    await chip(4).click({ modifiers: ['ControlOrMeta'] });
    await chip(2).click({ modifiers: ['ControlOrMeta'] });
    await chip(2).click({ modifiers: ['ControlOrMeta'] }); // toggled on, then off again
    await expect(editor.getByTestId('glyph-selection')).toContainText('2 selected: 1, 4');
    await editor.getByTestId('palette-GREEN').click();

    expect((await getProject(page)).formulas[0]!.glyphColors).toEqual({
      '0': '#FC6255',
      '1': '#83C167',
      '2': '#FC6255',
      '4': '#83C167',
    });
    // The colours show in the glyph view and in the list thumbnail.
    await expect(editor.getByTestId('glyph-1')).toHaveAttribute('data-color', '#83C167');
    await expect(editor.getByTestId('glyph-3')).toHaveAttribute('data-color', '#FFFFFF');
    await closeEditor(page);
    const fills = await page
      .getByTestId('formula-thumb')
      .locator('path')
      .evaluateAll((paths) => paths.map((p) => p.getAttribute('fill')));
    expect(fills).toEqual(['#FC6255', '#83C167', '#FC6255', '#FFFFFF', '#83C167']);

    // Undo steps back through the colouring, one palette click at a time.
    await page.keyboard.press('ControlOrMeta+z');
    expect((await getProject(page)).formulas[0]!.glyphColors).toEqual({
      '0': '#FC6255',
      '1': '#FC6255',
      '2': '#FC6255',
    });
  });

  test('editing the LaTeX keeps glyph colours on the same glyphs', async ({ page }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'a+b');
    await showGlyphList(editor);
    await editor.getByTestId('glyph-chip-2').click();
    await editor.getByTestId('palette-YELLOW').click();
    await editor.getByTestId('raw-latex').fill('x+a+b');
    await editor.getByTestId('editor-apply').click();
    await expect(editor.getByTestId('glyph-chips').getByRole('listitem')).toHaveCount(5);
    // "b" moved from glyph 2 to glyph 4, and its colour went with it, as one amended step.
    await expect
      .poll(async () => (await getProject(page)).formulas[0]!.glyphColors)
      .toEqual({
        '4': '#FFFF00',
      });
    await expect(editor.getByTestId('editor-sync-warning')).toHaveCount(0);

    await closeEditor(page);
    await page.getByTestId('menu-edit').click();
    await page.getByRole('menuitem', { name: 'Undo' }).click();
    await expect.poll(async () => (await getProject(page)).formulas[0]!.source).toBe('a+b');
    expect((await getProject(page)).formulas[0]!.glyphColors).toEqual({ '2': '#FFFF00' });
  });

  test('the name field says what a name may start with: "_" is taken, a digit is not', async ({
    page,
  }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'x^2');
    const name = editor.getByTestId('editor-name');
    await name.fill('1x');
    await expect(editor.getByTestId('editor-name-error')).toHaveText(
      'Use letters, digits and "_", not starting with a digit: the name becomes a Python variable.',
    );
    await name.fill('_x');
    await expect(editor.getByTestId('editor-name-error')).toHaveCount(0);
    await name.press('Enter');
    await expect.poll(async () => (await getProject(page)).formulas[0]!.name).toBe('_x');
  });

  test('renames, duplicates and deletes formulas; deleting a used one asks first', async ({
    page,
  }) => {
    await startApp(page);
    await addFormulaViaUi(page, 'x^2');
    await closeEditor(page);
    await addFormulaViaUi(page, 'y^2');
    await closeEditor(page);
    const items = page.getByTestId('formula-item');
    await expect(items).toHaveCount(2);

    // Rename (inline), with validation.
    await items.first().getByTestId('formula-name').dblclick();
    const input = page.getByTestId('formula-rename-input');
    await input.fill('f2');
    await expect(page.getByTestId('formula-rename-error')).toContainText('already');
    await input.fill('energy');
    await input.press('Enter');
    await expect(items.first()).toHaveAttribute('data-name', 'energy');

    // Duplicate.
    await items.first().getByTestId('formula-duplicate').click();
    await expect(items).toHaveCount(3);
    await expect(items.nth(1)).toHaveAttribute('data-name', 'energy2');
    expect((await getProject(page)).formulas.map((f) => f.source)).toEqual(['x^2', 'x^2', 'y^2']);

    // Delete an unused formula: it asks too, and the button must be held down.
    await items.nth(1).getByTestId('formula-delete').click();
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('Delete "energy2"');
    await expect(dialog).toContainText('not on the timeline');
    await page.getByTestId('dialog-confirm').click(); // a plain click does nothing
    await expect(items).toHaveCount(3);
    await holdToConfirm(page);
    await expect(items).toHaveCount(2);

    // Put the first formula on the timeline: deleting it now asks, and lists its clip.
    await page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      mfe.useProjectStore.getState().update((draft) => {
        const d = draft as unknown as {
          formulas: { id: string }[];
          tracks: { id: string }[];
          clips: unknown[];
        };
        d.clips.push({
          id: 'c_test',
          formulaId: d.formulas[0]!.id,
          trackId: d.tracks[0]!.id,
          start: 0,
          end: 3,
          initial: {
            position: [0, 0],
            scale: 1,
            rotation: 0,
            flipX: false,
            flipY: false,
            opacity: 1,
            color: null,
            glyphColors: {},
          },
          intro: {
            kind: 'none',
            duration: 0,
            easing: 'linear',
            lagRatio: null,
            shift: [0, 0],
            scale: 1,
          },
          outro: {
            kind: 'none',
            duration: 0,
            easing: 'linear',
            lagRatio: null,
            shift: [0, 0],
            scale: 1,
          },
          actions: [],
        });
      });
    });
    await items.first().getByTestId('formula-delete').click();
    await expect(dialog).toContainText('Delete "energy"');
    await expect(dialog.getByTestId('dialog-details')).toContainText(
      'Clip energy (0 s–3 s) on Track 2',
    );
    await dialog.getByTestId('dialog-cancel').click();
    await expect(items).toHaveCount(2);
    await items.first().getByTestId('formula-delete').click();
    await holdToConfirm(page);
    await expect(items).toHaveCount(1);
    const project = await getProject(page);
    expect(project.clips).toEqual([]);
    expect(project.formulas.map((f) => f.name)).toEqual(['f2']);
  });

  test('the right-click menu deletes the selected formulas at once, as one undo step', async ({
    page,
  }) => {
    await startApp(page);
    for (const latex of ['x^2', 'y^2', 'z^2']) {
      await addFormulaViaUi(page, latex);
      await closeEditor(page);
    }
    const items = page.getByTestId('formula-item');
    await expect(items).toHaveCount(3);
    // The first one goes on the timeline, through its own menu.
    await items.first().click({ button: 'right' });
    await page.getByTestId('formula-menu-add-to-timeline').click();
    await expect.poll(async () => (await getProject(page)).clips.length).toBe(1);

    // Select the first two and open their menu.
    await items.first().click();
    await items.nth(1).click({ modifiers: ['ControlOrMeta'] });
    await items.nth(1).click({ button: 'right' });
    await expect(page.getByTestId('formula-menu-header')).toHaveText('2 formulas');
    const item = page.getByTestId('formula-menu-delete');
    await expect(item).toHaveText('Delete 2 formulas…');
    await item.click();
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('Delete 2 formulas?');
    await expect(dialog).toContainText('One of them is used on the timeline');
    await expect(dialog.getByTestId('dialog-details')).toContainText('Clip f1 (');
    await expect(page.getByTestId('dialog-confirm')).toContainText('Hold to delete 2 formulas');
    await dialog.getByTestId('dialog-cancel').click();
    await expect(items).toHaveCount(3);

    // The selection is kept: the menu deletes both after a held confirmation.
    await items.nth(1).click({ button: 'right' });
    await page.getByTestId('formula-menu-delete').click();
    await holdToConfirm(page);
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveAttribute('data-name', 'f3');
    expect((await getProject(page)).clips).toEqual([]);

    // One undo brings both back, with the clip.
    await undo(page);
    await expect(items).toHaveCount(3);
    expect((await getProject(page)).clips).toHaveLength(1);
  });

  test('selecting several formulas moves nothing: their menu has the actions', async ({ page }) => {
    await startApp(page);
    for (const latex of ['x^2', 'y^2', 'z^2']) {
      await addFormulaViaUi(page, latex);
      await closeEditor(page);
    }
    const items = page.getByTestId('formula-item');
    const tops = () =>
      items.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().top));
    await items.first().click();
    const before = await tops();
    await items.nth(1).click({ modifiers: ['ControlOrMeta'] });
    await expect(items.nth(1)).toHaveAttribute('data-selected', 'true');
    // No bar comes in over the list (the one of D62 pushed the rows down): the rows stay put.
    expect(await tops()).toEqual(before);
    await expect(page.getByRole('toolbar', { name: 'Selected formulas' })).toHaveCount(0);
    // Their menu: Delete 2 formulas…, the same held confirmation; cancelled here.
    await items.nth(1).click({ button: 'right' });
    await expect(page.getByTestId('formula-menu-header')).toHaveText('2 formulas');
    await page.getByTestId('formula-menu-delete').click();
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('Delete 2 formulas?');
    await dialog.getByTestId('dialog-cancel').click();
    await expect(items).toHaveCount(3);
    // Edit together…: the multi editor on the selection.
    await items.nth(1).click({ button: 'right' });
    await page.getByTestId('formula-menu-edit-together').click();
    await expect(page.getByTestId('multi-editor')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('multi-editor')).toHaveCount(0);
    // Add to the timeline: two clips at the playhead, which become the selection.
    await items.nth(1).click({ button: 'right' });
    await page.getByTestId('formula-menu-add-to-timeline').click();
    await expect.poll(async () => (await getProject(page)).clips.length).toBe(2);
    expect(await tops()).toEqual(before);
  });

  test('"Appears with" gives the new clips of a formula their intro', async ({ page }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'x^2');
    const select = editor.getByTestId('editor-intro');
    await expect(select).toHaveValue('');
    await expect(select.locator('option').first()).toHaveText('Default (none)');
    await select.selectOption('write');
    expect((await getProject(page)).formulas[0]!.intro).toMatchObject({ kind: 'write' });
    await closeEditor(page);
    await addFormulaViaUi(page, 'y^2'); // stays at Default
    await closeEditor(page);
    const items = page.getByTestId('formula-item');
    await items.first().click();
    await items.nth(1).click({ modifiers: ['ControlOrMeta'] });
    await items.nth(1).click({ button: 'right' });
    await page.getByTestId('formula-menu-add-to-timeline').click();
    await expect.poll(async () => (await getProject(page)).clips.length).toBe(2);
    const clips = (await getProject(page)).clips;
    expect(clips.map((c) => c.intro.kind)).toEqual(['write', 'none']);

    // Changed later, with a duration: the clip that still had the old intro follows.
    await items.nth(1).dblclick();
    await expect(editor).toBeVisible();
    await select.selectOption('fade_in');
    const duration = editor.getByTestId('editor-intro-duration');
    await expect(duration).toHaveValue('1');
    await duration.fill('2');
    await duration.press('Enter');
    await expect
      .poll(async () => (await getProject(page)).clips[1]!.intro)
      .toMatchObject({ kind: 'fade_in', duration: 2 });
    expect((await getProject(page)).clips[0]!.intro.kind).toBe('write');
  });

  test('the magnifier opens the search; the items of the list are draggable onto the timeline', async ({
    page,
  }) => {
    await startApp(page);
    await addFormulaViaUi(page, '\\frac{a}{b}');
    await closeEditor(page);
    await addFormulaViaUi(page, 'x^2');
    await closeEditor(page);
    // The search is a panel in the Preview's place (formulaSearch.spec.ts): the magnifier shows
    // it and takes it away, and the list itself is not filtered.
    const magnifier = page.getByTestId('creator-search-open');
    await expect(magnifier).toHaveAttribute('aria-pressed', 'false');
    await magnifier.click();
    await expect(magnifier).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('formula-search-input').fill('frac');
    await expect(page.getByTestId('formula-search-result')).toHaveCount(1);
    await expect(page.getByTestId('formula-search-result')).toHaveAttribute('data-name', 'f1');
    await expect(page.getByTestId('formula-item')).toHaveCount(2);
    await magnifier.click();
    await expect(page.getByTestId('formula-search')).toHaveCount(0);
    await expect(magnifier).toHaveAttribute('aria-pressed', 'false');

    // A real drag: the item offers its id under the Timeline's MIME type, as a copy.
    const item = page.getByTestId('formula-item').first();
    await expect(item).toHaveAttribute('draggable', 'true');
    const formulaId = (await getProject(page)).formulas[0]!.id;
    await page.evaluate(() => {
      document.addEventListener('dragstart', (event) => {
        (window as unknown as { __drag: unknown }).__drag = {
          effect: event.dataTransfer?.effectAllowed,
          id: event.dataTransfer?.getData('application/x-mfe-formula'),
        };
      });
    });
    await item.dragTo(page.getByTestId('panel-timeline'));
    const drag = await page.evaluate(() => (window as unknown as { __drag: unknown }).__drag);
    expect(drag).toEqual({ effect: 'copy', id: formulaId });
  });

  test('the glyph column says why there are no glyphs: an error, or none drawn', async ({
    page,
  }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, '\\frac{a');
    // It never rendered: no last good render to fall back on.
    await expect(editor.getByTestId('glyph-view-empty')).toHaveText(
      'f1 does not render: Missing close brace',
    );
    await editor.getByTestId('raw-latex').fill('\\quad');
    await editor.getByTestId('editor-apply').click();
    await expect(editor.getByTestId('glyph-view-empty')).toHaveText('f1 draws no glyphs.');
  });

  test('LaTeX errors say what is wrong in the formula, not in the align* wrapper', async ({
    page,
  }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'x^');
    await expect(editor.getByTestId('editor-error')).toContainText(
      '^ at the end needs an argument, as in x^{2}.',
    );
    await expect(editor.getByTestId('editor-error')).not.toContainText('align');
    await editor.getByTestId('raw-latex').fill('\\cancel{x}');
    await editor.getByTestId('editor-apply').click();
    await expect(page.getByTestId('formula-error')).toHaveText(
      'Undefined control sequence \\cancel. It comes from the "cancel" package: add it under Packages.',
    );
  });

  test('shows LaTeX errors with their message and keeps the last good render', async ({ page }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'a+b');
    await editor.getByTestId('raw-latex').fill('\\nosuchmacro{x}');
    await expect(editor.getByTestId('editor-error')).toContainText('nosuchmacro');
    await editor.getByTestId('editor-apply').click();
    await expect(page.getByTestId('formula-error')).toContainText('nosuchmacro');
    await closeEditor(page);
    await expect(page.getByTestId('formula-status')).toHaveAttribute('data-status', 'error');
    // The thumbnail still shows the previous, valid render.
    await expect(page.getByTestId('formula-thumb').locator('path')).toHaveCount(3);
  });

  test('a formula on the timeline is drawn in the preview with its glyph colours', async ({
    page,
  }) => {
    // A frame big enough for the strokes of the plus sign to be more than a few pixels.
    await page.setViewportSize({ width: 1440, height: 900 });
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'a+b=c');
    await showGlyphList(editor);
    await editor.getByTestId('glyph-chip-1').click();
    await editor.getByTestId('palette-YELLOW').click();
    await closeEditor(page);
    await addClipOfFirstFormula(page);
    await waitForDrawables(page, 5);
    const stats = await canvasStats(page);
    expect(stats.white).toBeGreaterThan(40);
    expect(stats.yellow).toBeGreaterThan(10);
  });

  test('the glyph view shows a glyph index only on hover, under its lower left', async ({
    page,
  }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'a+b=c');
    const badge = editor.getByTestId('glyph-index');
    await expect(badge).toHaveCount(0);
    const glyph = editor.getByTestId('glyph-2');
    await glyph.hover();
    await expect(badge).toHaveText('2');
    // Under the glyph's frame: its box (a letter's is not grown), drawn with the badge's stroke.
    const g = (await editor.getByTestId('glyph-2-frame').boundingBox())!;
    const b = (await badge.boundingBox())!;
    expect(b.x).toBeCloseTo(g.x, 0); // left edges aligned
    expect(b.y).toBeGreaterThanOrEqual(g.y + g.height - 1); // just below the glyph
    await page.mouse.move(5, 5);
    await expect(badge).toHaveCount(0);
    await showGlyphList(editor);
    // Hovering a chip of the list points at its glyph too, badge and frame.
    await editor.getByTestId('glyph-chip-4').hover();
    await expect(badge).toHaveAttribute('data-index', '4');
    await expect(editor.getByTestId('glyph-4-frame')).toHaveClass(/gv-hovered/);
    await page.mouse.move(5, 5);
    await expect(badge).toHaveCount(0);
    await expect(editor.getByTestId('glyph-4-frame')).not.toHaveClass(/gv-hovered/);
  });

  test('a thin glyph shows its selection in a frame of a few pixels, with a glow; a click around it picks it, never over a neighbour', async ({
    page,
  }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, '\\frac{a+b}{c} - d = e');
    const label = editor.getByTestId('glyph-selection');
    /** A glyph's own box, or a frame, on screen: its geometry, without the stroke around it. */
    const rect = (testId: string, own = false) => {
      const glyph = editor.getByTestId(testId);
      return (own ? glyph.locator('.gv-box') : glyph).evaluate((el) => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return { x, y, width, height };
      });
    };
    const style = (testId: string, property: string) =>
      editor
        .getByTestId(testId)
        .evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
    const click = async (x: number, y: number, add = false) => {
      if (add) await page.keyboard.down('ControlOrMeta');
      await page.mouse.click(x, y);
      if (add) await page.keyboard.up('ControlOrMeta');
    };
    // The bar of the fraction and the minus sign: slivers a few pixels thick.
    await expect(editor.getByTestId('glyph-4').locator('title')).toHaveText('4: —');
    await expect(editor.getByTestId('glyph-5').locator('title')).toHaveText('5: −');
    const bar = await rect('glyph-4', true);
    const minus = await rect('glyph-5', true);
    expect(bar.height).toBeLessThan(5);
    expect(minus.height).toBeLessThan(5);
    // A click on their ink picks them.
    await click(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await click(minus.x + minus.width / 2, minus.y + minus.height / 2, true);
    await expect(label).toHaveText('2 selected: 4, 5');
    await page.mouse.move(5, 5);
    // Their frames are at least 10 CSS px each way (their stroke aside), grown around the
    // glyph's centre, and glow.
    for (const [own, frame] of [
      [bar, await rect('glyph-4-frame')],
      [minus, await rect('glyph-5-frame')],
    ] as const) {
      expect(frame.width).toBeGreaterThanOrEqual(9.5);
      expect(frame.height).toBeGreaterThanOrEqual(9.5);
      expect(frame.height).toBeLessThan(10.5);
      expect(frame.width).toBeCloseTo(own.width, 0);
      expect(frame.x + frame.width / 2).toBeCloseTo(own.x + own.width / 2, 0);
      expect(frame.y + frame.height / 2).toBeCloseTo(own.y + own.height / 2, 0);
    }
    expect(await style('glyph-4-frame', 'filter')).toContain('drop-shadow');
    // A letter's frame is its box, as before, and glows only once selected.
    const a = await rect('glyph-0', true);
    const aFrame = await rect('glyph-0-frame');
    expect(a.height).toBeGreaterThan(15);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(aFrame[key]).toBeCloseTo(a[key], 0);
    }
    expect(await style('glyph-0-frame', 'filter')).toBe('none');

    // Under forced colours there is no glow: a thick ring of the system's selection colour around
    // half of its text colour, one of which stands out from the scene's background.
    await page.emulateMedia({ forcedColors: 'active' });
    const system = (color: string) =>
      page.evaluate((value) => {
        const probe = document.createElement('div');
        probe.style.cssText = `forced-color-adjust: none; color: ${value}`;
        document.body.append(probe);
        const computed = getComputedStyle(probe).color;
        probe.remove();
        return computed;
      }, color);
    expect(await style('glyph-4-frame', 'filter')).toBe('none');
    expect(await style('glyph-4-frame', 'stroke')).toBe(await system('Highlight'));
    expect(await style('glyph-4-frame', 'stroke-width')).toBe('3px');
    expect(await style('glyph-4-frame', 'fill')).toBe(await system('HighlightText'));
    expect(await style('glyph-4-frame', 'fill-opacity')).toBe('0.5');
    await page.emulateMedia({ forcedColors: 'none' });
    expect(await style('glyph-4-frame', 'filter')).toContain('drop-shadow');

    // A click inside a thin glyph's frame, off its ink, picks it: above the bar, below the minus.
    const barFrame = await rect('glyph-4-frame');
    expect(barFrame.y + 1.5).toBeLessThan(bar.y);
    await click(bar.x + bar.width / 2, barFrame.y + 1.5);
    await expect(label).toHaveText('1 selected: 4');
    const minusFrame = await rect('glyph-5-frame');
    expect(minusFrame.y + minusFrame.height - 1.5).toBeGreaterThan(minus.y + minus.height);
    await click(minus.x + minus.width / 2, minusFrame.y + minusFrame.height - 1.5, true);
    await expect(label).toHaveText('2 selected: 4, 5');
    // The numerator is still the numerator's.
    await editor.getByTestId('glyph-0').click();
    await expect(label).toHaveText('1 selected: 0');

    // Small on screen (a long formula), the bar's frame reaches into the box of the numerator
    // above it: there, the numerator's ink still picks the numerator.
    await editor.getByTestId('raw-latex').fill('\\tfrac{y}{x}+a+b+c+d+e+f+g+h+i+j');
    await editor.getByTestId('editor-apply').click();
    await expect(editor.getByTestId('glyph-2').locator('title')).toHaveText('2: —');
    await expect(editor.getByTestId('glyph-0').locator('title')).toHaveText('0: y');
    const y = await rect('glyph-0', true);
    const thinBar = await rect('glyph-2', true);
    const thinFrame = await rect('glyph-2-frame');
    expect(thinFrame.height).toBeGreaterThanOrEqual(9.5);
    expect(thinFrame.y).toBeLessThan(y.y + y.height - 1);
    // A point of the descender of «y» inside the bar's frame.
    const ink = await page.evaluate(
      ([x0, x1, top, bottom]) => {
        for (let py = bottom - 0.5; py > top; py -= 0.5) {
          for (let px = x0; px < x1; px += 0.5) {
            const hit = document.elementFromPoint(px, py);
            if (hit?.tagName === 'path' && hit.closest('[data-testid="glyph-0"]')) {
              return { x: px, y: py };
            }
          }
        }
        return null;
      },
      [y.x, y.x + y.width, thinFrame.y, y.y + y.height] as const,
    );
    expect(ink).not.toBeNull();
    await click(ink!.x, ink!.y);
    await expect(label).toHaveText('1 selected: 0');
    await click(thinBar.x + thinBar.width / 2, thinBar.y + thinBar.height / 2);
    await expect(label).toHaveText('1 selected: 2');
  });

  test("Ctrl+Z and Ctrl+Shift+Z undo and redo the editor's edits while it is open", async ({
    page,
  }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'a+b=c');
    const formula = async () => (await getProject(page)).formulas[0]!;
    // Colour two glyphs from the palette, then hide one from the right-click menu.
    await editor.getByTestId('glyph-0').click();
    await editor.getByTestId('glyph-1').click({ modifiers: ['ControlOrMeta'] });
    await editor.getByTestId('palette-YELLOW').click();
    await editor.getByTestId('glyph-4').click({ button: 'right' });
    await page.getByTestId('glyph-menu-hide').click();
    expect((await formula()).hiddenGlyphs).toEqual([4]);

    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await formula()).hiddenGlyphs).toEqual([]);
    await expect(editor.getByTestId('glyph-4')).toHaveAttribute('data-hidden', 'false');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await formula()).glyphColors).toEqual({});
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect
      .poll(async () => (await formula()).glyphColors)
      .toEqual({ '0': '#FFFF00', '1': '#FFFF00' });
    await expect(editor).toBeVisible();

    // In a text field Ctrl+Z is the field's own undo: the project is left alone.
    const name = editor.getByTestId('editor-name');
    await name.fill('sum');
    await name.press('ControlOrMeta+z');
    expect((await formula()).name).toBe('f1');
    expect((await formula()).glyphColors).toEqual({ '0': '#FFFF00', '1': '#FFFF00' });
    await name.fill('sum');
    await name.press('Enter');
    expect((await formula()).name).toBe('sum');
    // From the glyph view it undoes the rename.
    await editor.getByTestId('glyph-2').click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await formula()).name).toBe('f1');
    await expect(editor.getByTestId('editor-name')).toHaveValue('f1');
  });

  test('hides glyphs at the start: grey in the glyph view and left out of the preview', async ({
    page,
  }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'a+b=c');
    await expect(editor.getByTestId('glyph-hide')).toBeDisabled();
    await expect(editor.getByTestId('glyph-show-all')).toBeDisabled();
    await showGlyphList(editor);
    await editor.getByTestId('glyph-chip-2').click();
    await editor.getByTestId('glyph-chip-4').click({ modifiers: ['Shift'] });
    await editor.getByTestId('glyph-hide').click();
    const hidden = async () => (await getProject(page)).formulas[0]!.hiddenGlyphs;
    expect(await hidden()).toEqual([2, 3, 4]);
    await expect(editor.getByTestId('glyph-3')).toHaveAttribute('data-hidden', 'true');
    await expect(editor.getByTestId('glyph-3').locator('path')).toHaveAttribute('fill', '#8A8A99');
    await expect(editor.getByTestId('glyph-1')).toHaveAttribute('data-hidden', 'false');
    await expect(editor.getByTestId('glyph-chip-4')).toHaveAttribute('data-hidden', 'true');
    await expect(editor.getByTestId('glyph-hidden-hint')).toContainText('3 glyphs are hidden');
    await expect(editor.getByTestId('glyph-hide')).toBeDisabled(); // all of the selection is
    // Show one again.
    await editor.getByTestId('glyph-chip-2').click();
    await editor.getByTestId('glyph-show').click();
    expect(await hidden()).toEqual([3, 4]);
    await expect(editor.getByTestId('glyph-show')).toBeDisabled();
    await closeEditor(page);

    // On the timeline the preview draws "a+b" only ("=c" is hidden and no relation brings it in).
    await addClipOfFirstFormula(page);
    const frame = page.getByTestId('preview-frame');
    await expect(frame).toHaveAttribute('data-drawable-count', '3');
    await page.getByTestId('formula-item').dblclick();
    await page.getByTestId('glyph-show-all').click();
    expect(await hidden()).toEqual([]);
    await expect(frame).toHaveAttribute('data-drawable-count', '5');
  });

  test('the bar between the columns widens the glyph view, never hiding the source column', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'a+b=c');
    await page.getByTestId('formula-editor-maximize').click();
    const bar = page.getByTestId('editor-splitter');
    const source = editor.locator('.editor-main');
    const glyphs = editor.locator('.editor-glyphs');
    const view = editor.locator('.glyph-svg');
    const width = async (l: typeof source) => (await l.boundingBox())!.width;
    const glyphs0 = await width(glyphs);
    const drag = async (x: number) => {
      const box = (await bar.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(x, box.y + 100, { steps: 6 });
      await page.mouse.up();
    };
    // All the way left: the source column stops at its minimum, the glyph view takes the rest.
    await drag(0);
    expect(await width(source)).toBeCloseTo(470, 0);
    expect(await width(glyphs)).toBeGreaterThan(glyphs0 + 200);
    expect((await view.boundingBox())!.width).toBeGreaterThan(glyphs0 + 200);
    // All the way right: the glyph view keeps its minimum.
    await drag(page.viewportSize()!.width);
    expect(await width(glyphs)).toBeCloseTo(320, 0);
    // Keyboard, then a double-click restores the default split.
    await bar.focus();
    const before = Number(await bar.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowLeft');
    expect(Number(await bar.getAttribute('aria-valuenow'))).toBe(before - 2);
    await bar.dblclick();
    await expect(bar).toHaveAttribute('aria-valuenow', '53');
    await drag(0);
    // Kept when the editor opens again.
    const kept = await bar.getAttribute('aria-valuenow');
    await closeEditor(page);
    await page.getByTestId('formula-item').dblclick();
    await expect(bar).toHaveAttribute('aria-valuenow', kept!);
  });

  test('Escape in a field with an edit takes the edit back; the next Escape closes', async ({
    page,
  }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'a+b=c');
    const name = editor.getByTestId('editor-name');
    await name.fill('sum');
    await name.press('Escape');
    await expect(editor).toBeVisible();
    await expect(name).toHaveValue('f1');
    const search = editor.getByTestId('package-search');
    await search.fill('phys');
    await search.press('Escape');
    await expect(editor).toBeVisible();
    await expect(search).toHaveValue('');
    const hex = editor.getByTestId('editor-color-hex');
    await hex.fill('#123');
    await hex.press('Escape');
    await expect(editor).toBeVisible();
    await expect(hex).toHaveValue('#FFFFFF');
    // Nothing to take back: Escape closes the editor, and the project kept its name.
    await hex.press('Escape');
    await expect(editor).toBeHidden();
    expect((await getProject(page)).formulas[0]!.name).toBe('f1');
  });

  test('the editor can be maximized and resized; a press outside closes it only without an unapplied draft', async ({
    page,
  }) => {
    await startApp(page);
    const editor = await addFormulaViaUi(page, 'a+b=c');
    const view = editor.locator('.glyph-svg');
    const view0 = (await view.boundingBox())!;
    await page.getByTestId('formula-editor-maximize').click();
    const max = (await editor.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(max.width).toBeCloseTo(viewport.width - 16, 0);
    expect(max.height).toBeCloseTo(viewport.height - 16, 0);
    // The glyph view takes the free height.
    expect((await view.boundingBox())!.height).toBeGreaterThan(view0.height + 100);
    await page.getByTestId('formula-editor-maximize').click();
    const grip = (await page.getByTestId('formula-editor-resize').boundingBox())!;
    const before = (await editor.boundingBox())!;
    await page.mouse.move(grip.x + 8, grip.y + 8);
    await page.mouse.down();
    await page.mouse.move(grip.x - 92, grip.y + 8, { steps: 5 });
    await page.mouse.up();
    expect((await editor.boundingBox())!.width).toBeCloseTo(before.width - 200, -1);

    const outside = () => page.mouse.click(8, 8);
    // Unapplied LaTeX: a press outside does nothing.
    await editor.getByTestId('raw-latex').fill('a+b=d');
    await outside();
    await expect(editor).toBeVisible();
    await editor.getByTestId('editor-revert').click();
    // A name being typed is committed as on any blur, then the editor closes.
    await editor.getByTestId('editor-name').fill('sum');
    await outside();
    await expect(editor).toBeHidden();
    expect((await getProject(page)).formulas[0]!.name).toBe('sum');
  });
});

/** A clip of the first formula on the first track over [0, 3), without intro or outro. */
async function addClipOfFirstFormula(page: Page): Promise<void> {
  await page.evaluate(() => {
    const mfe = (window as MfeWindow).__mfe!;
    mfe.useProjectStore.getState().update((draft) => {
      const d = draft as unknown as {
        formulas: { id: string }[];
        tracks: { id: string }[];
        clips: unknown[];
      };
      d.clips.push({
        id: 'c1',
        formulaId: d.formulas[0]!.id,
        trackId: d.tracks[0]!.id,
        start: 0,
        end: 3,
        initial: {
          position: [0, 0],
          scale: 1,
          rotation: 0,
          flipX: false,
          flipY: false,
          opacity: 1,
          color: null,
          glyphColors: {},
        },
        intro: {
          kind: 'none',
          duration: 0,
          easing: 'linear',
          lagRatio: null,
          shift: [0, 0],
          scale: 1,
        },
        outro: {
          kind: 'none',
          duration: 0,
          easing: 'linear',
          lagRatio: null,
          shift: [0, 0],
          scale: 1,
        },
        actions: [],
      });
    });
  });
}

test('a formula goes on the timeline without dragging: its menu, or the Animations panel', async ({
  page,
}) => {
  await startApp(page);
  await addFormulaViaUi(page, 'a+b');
  await closeEditor(page);
  await addFormulaViaUi(page, 'c');
  await closeEditor(page);
  const cards = page.getByTestId('formula-item');

  // The formula's menu, at the playhead (2 s).
  await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(2));
  await cards.first().click({ button: 'right' });
  await page.getByTestId('formula-menu-add-to-timeline').click();
  let project = await getProject(page);
  expect(project.clips).toHaveLength(1);
  expect(project.clips[0]).toMatchObject({ trackId: project.tracks[0]!.id, start: 2, end: 5 });
  const selection = await page.evaluate(
    () => (window as MfeWindow).__mfe!.useUiStore.getState().selection,
  );
  expect(selection).toEqual({ kind: 'clips', ids: [project.clips[0]!.id] });

  // The Animations panel of a formula not on the timeline, from the keyboard.
  await cards.nth(1).click();
  const add = page.getByTestId('formula-add-to-timeline');
  await add.focus();
  await page.keyboard.press('Enter');
  project = await getProject(page);
  expect(project.clips).toHaveLength(2);
  // The first track is taken from 2 s to 5 s: the nearest free time is 5 s.
  expect(project.clips[1]).toMatchObject({ trackId: project.tracks[0]!.id, start: 5, end: 8 });
});

test('the hold-to-delete confirmation takes a screen reader click, but not a mouse click', async ({
  page,
}) => {
  await startApp(page);
  await addFormulaViaUi(page, 'x');
  await closeEditor(page);
  const card = page.getByTestId('formula-item');
  await card.getByTestId('formula-delete').click();
  const confirm = page.getByTestId('dialog-confirm');
  await expect(confirm).toHaveAccessibleDescription(/Press and hold for/);
  await confirm.click(); // a mouse click: nothing
  await expect(page.getByTestId('dialog')).toBeVisible();
  await confirm.evaluate((el) => (el as HTMLButtonElement).click()); // no press: assistive
  await expect(page.getByTestId('dialog')).toHaveCount(0);
  await expect(card).toHaveCount(0);
});

test('duplicating a formula numbered beyond 2^53 still finds the next free name', async ({
  page,
}) => {
  await startApp(page);
  await addFormulaViaUi(page, 'x^2');
  await closeEditor(page);
  const items = page.getByTestId('formula-item');
  await items.first().getByTestId('formula-name').dblclick();
  const input = page.getByTestId('formula-rename-input');
  await input.fill('f9007199254740992');
  await input.press('Enter');
  await expect(items.first()).toHaveAttribute('data-name', 'f9007199254740992');
  await items.first().getByTestId('formula-duplicate').click();
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toHaveAttribute('data-name', 'f9007199254740993');
});
