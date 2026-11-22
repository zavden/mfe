import { expect, test, type Page } from './test';
import type { MfeWindow } from './helpers';
import { canUndo, clipJson, dropFormula, openTimeline, project } from './timelineHelpers';

const A = clipJson('a', 'fa', 't1', 1, 4.3);

/** Ids of the clips on the timeline other than the fixture clip `a`. */
async function droppedClips(page: Page) {
  return (await project(page)).clips.filter((c) => c.id !== 'a');
}

async function clickEdit(page: Page, name: string | RegExp): Promise<void> {
  await page.getByTestId('menu-edit').click();
  await page.getByRole('menuitemcheckbox', { name }).click();
}

test.describe('Edit menu: default intro and outro', () => {
  test('both off by default: a dropped clip appears and disappears at its start and end', async ({
    page,
  }) => {
    await openTimeline(page, [A]);
    await page.getByTestId('menu-edit').click();
    await expect(page.getByRole('menuitemcheckbox', { name: /Always add intro/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(page.getByRole('menuitemcheckbox', { name: /Always add outro/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.keyboard.press('Escape');
    expect(await dropFormula(page, 'fb', 't2', 0)).toBe(true);
    const [clip] = await droppedClips(page);
    expect(clip!.intro).toMatchObject({ kind: 'none', duration: 0 });
    expect(clip!.outro).toMatchObject({ kind: 'none', duration: 0 });
  });

  test('the toggles change what the next drop creates, and only that', async ({ page }) => {
    await openTimeline(page, [A]);
    await dropFormula(page, 'fb', 't2', 0); // before any toggle

    await clickEdit(page, 'Always add intro (Write)');
    await dropFormula(page, 'fb', 't2', 4);
    await clickEdit(page, 'Always add outro (FadeOut)');
    await dropFormula(page, 'fb', 't2', 8);
    await clickEdit(page, /Always add intro/); // off again, outro still on
    await dropFormula(page, 'fb', 't2', 12);
    await clickEdit(page, /Always add outro/); // both off
    await dropFormula(page, 'fb', 't2', 16);

    const clips = (await droppedClips(page)).sort((x, y) => x.start - y.start);
    const kinds = clips.map((c) => [c.intro.kind, c.outro.kind]);
    expect(kinds).toEqual([
      ['none', 'none'],
      ['write', 'none'],
      ['write', 'fade_out'],
      ['none', 'fade_out'],
      ['none', 'none'],
    ]);
    // The animations are the defaults of those kinds, and earlier clips were not touched.
    expect(clips[1]!.intro).toMatchObject({ duration: 1, easing: 'linear', lagRatio: null });
    expect(clips[2]!.outro).toMatchObject({ duration: 1, easing: 'smooth' });
    expect(clips[0]!.intro.kind).toBe('none');
    expect((await project(page)).clips.find((c) => c.id === 'a')!.intro.kind).toBe('write'); // fixture
    // Editor preferences, not project edits: nothing to undo.
    expect(await canUndo(page)).toBe(true); // only the drops
    await page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      while (mfe.history.canUndo()) mfe.history.undo();
    });
    expect(
      await page.evaluate(() => (window as MfeWindow).__mfe!.usePreferences.getState()),
    ).toMatchObject({
      autoIntro: false,
      autoOutro: false,
    });
  });

  test('toggling is not a project edit: no undo step, the project is untouched', async ({
    page,
  }) => {
    await openTimeline(page, [A]);
    const before = JSON.stringify(await project(page));
    await clickEdit(page, /Always add intro/);
    await clickEdit(page, /Always add outro/);
    expect(await canUndo(page)).toBe(false);
    expect(JSON.stringify(await project(page))).toBe(before);
  });

  test('the dialog picks the animations; the menu names them; drops use them', async ({ page }) => {
    await openTimeline(page, [A]);
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-default-animations').click();
    const dialog = page.getByTestId('default-animations-dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByTestId('default-intro-kind').selectOption('fade_in');
    await dialog.getByTestId('default-intro-duration').fill('0.5');
    await dialog.getByTestId('default-intro-easing').selectOption('rush_into');
    await dialog.getByTestId('default-intro-lag-mode').selectOption('custom');
    await dialog.getByTestId('default-intro-lag').fill('0.2');
    await dialog.getByTestId('default-intro-shift-y').fill('-0.5');
    await dialog.getByTestId('default-intro-scale').fill('0.9');
    await dialog.getByTestId('default-outro-kind').selectOption('shrink_to_center');
    await dialog.getByTestId('default-outro-duration').fill('0.75');
    await dialog.getByTestId('default-animations-save').click();
    await expect(dialog).toHaveCount(0);

    await page.getByTestId('menu-edit').click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Always add intro (FadeIn)' }),
    ).toHaveAttribute('aria-checked', 'false'); // choosing the animation does not switch it on
    await page.keyboard.press('Escape');

    await clickEdit(page, 'Always add intro (FadeIn)');
    await clickEdit(page, 'Always add outro (ShrinkToCenter)');
    await dropFormula(page, 'fb', 't2', 0);
    const [clip] = await droppedClips(page);
    expect(clip!.intro).toEqual({
      kind: 'fade_in',
      duration: 0.5,
      easing: 'rush_into',
      lagRatio: 0.2,
      shift: [0, -0.5],
      scale: 0.9,
    });
    expect(clip!.outro).toMatchObject({ kind: 'shrink_to_center', duration: 0.75 });
    // The fixture clip keeps its own animations.
    expect((await project(page)).clips.find((c) => c.id === 'a')!.intro.kind).toBe('write');
  });

  test('the dialog validates like the clip properties and Escape cancels', async ({ page }) => {
    await openTimeline(page, [A]);
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-default-animations').click();
    const dialog = page.getByTestId('default-animations-dialog');
    const save = dialog.getByTestId('default-animations-save');

    await dialog.getByTestId('default-intro-duration').fill('0');
    await expect(dialog.getByTestId('default-intro-duration-error')).toBeVisible();
    await expect(save).toBeDisabled();
    await dialog.getByTestId('default-intro-duration').fill('-2');
    await expect(save).toBeDisabled();
    await dialog.getByTestId('default-intro-duration').fill('2.5'); // + 1 s outro > the 3 s clip
    await expect(dialog.getByTestId('default-animations-total-error')).toBeVisible();
    await expect(save).toBeDisabled();
    await dialog.getByTestId('default-intro-duration').fill('1');
    await dialog.getByTestId('default-outro-lag-mode').selectOption('custom');
    await dialog.getByTestId('default-outro-lag').fill('-1');
    await expect(dialog.getByTestId('default-outro-lag-error')).toBeVisible();
    await expect(save).toBeDisabled();
    await dialog.getByTestId('default-outro-lag').fill('0.5');
    await expect(save).toBeEnabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    const prefs = await page.evaluate(() =>
      JSON.stringify((window as MfeWindow).__mfe!.usePreferences.getState()),
    );
    expect(JSON.parse(prefs)).toMatchObject({
      outro: { kind: 'fade_out', duration: 1, lagRatio: null },
    });
  });

  test('the choices are remembered after a reload', async ({ page }) => {
    await openTimeline(page, [A]);
    await clickEdit(page, /Always add outro/);
    await page.getByTestId('menu-edit').click();
    await page.getByTestId('menu-item-edit-default-animations').click();
    await page.getByTestId('default-outro-kind').selectOption('uncreate');
    await page.getByTestId('default-animations-save').click();

    await page.reload();
    await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
    await page.getByTestId('menu-edit').click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Always add outro (Uncreate)' }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('menuitemcheckbox', { name: /Always add intro/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
