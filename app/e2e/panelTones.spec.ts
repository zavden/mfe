import { expect, test, type Page } from './test';
import { appearJson, blockLocator, openBlockScene } from './blockHelpers';
import { openAnimationsTab } from './helpers';

/* The sections of the Animations panel wear a colour (R5, D75): a stripe on the left and the
 * title. Intro and Outro take the Appear and Disappear colours of the timeline's blocks, a
 * block's own Animation section its category; Timing the time colour, Initial state a tone of
 * its own, Animations the block colour. In both themes. */

/** The computed colour of a section's stripe or title. */
const colourOf = (page: Page, testId: string, part: 'stripe' | 'title') =>
  page
    .getByTestId(testId)
    .evaluate(
      (el, part) =>
        part === 'stripe'
          ? getComputedStyle(el).borderLeftColor
          : getComputedStyle(el.querySelector('h3')!).color,
      part,
    );

/** The computed value of a colour token of the current theme. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate((token) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);

const SECTIONS: [string, string, string][] = [
  ['timing-section', 'timing', '--time'],
  ['intro-section', 'intro', '--block-appear'],
  ['initial-section', 'initial', '--section-initial'],
  ['blocks-section', 'animations', '--block-transform'],
  ['outro-section', 'outro', '--block-disappear'],
];

async function expectTones(page: Page): Promise<void> {
  for (const [testId, tone, token] of SECTIONS) {
    await expect(page.getByTestId(testId)).toHaveAttribute('data-tone', tone);
    const colour = await tokenColour(page, token);
    expect(await colourOf(page, testId, 'stripe'), `${testId} stripe`).toBe(colour);
    expect(await colourOf(page, testId, 'title'), `${testId} title`).toBe(colour);
  }
}

test('each section of the clip panel wears its colour, in both themes', async ({ page }) => {
  await openBlockScene(page, [appearJson('w', 1, 3, 'write', 'all')]);
  await page.getByTestId('clip-a').click({ position: { x: 30, y: 8 } });
  await openAnimationsTab(page, 'timing');
  await expect(page.getByTestId('intro-section')).toBeVisible();
  await expectTones(page);
  const dark = await tokenColour(page, '--block-appear');
  // The Intro title and the Appear blocks of the timeline share the colour; it differs from
  // the neutral title colour.
  expect(await colourOf(page, 'intro-section', 'title')).not.toBe(
    await tokenColour(page, '--text-dim'),
  );
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await tokenColour(page, '--block-appear')).not.toBe(dark);
  await expectTones(page);
});

test('the actions that make something wear the accent, filled on hover, in both themes', async ({
  page,
}) => {
  await openBlockScene(page, [appearJson('w', 1, 3, 'write', 'all')]);
  await page.getByTestId('clip-a').click({ position: { x: 30, y: 8 } });
  await openAnimationsTab(page, 'timing');
  const borderOf = (testId: string) =>
    page.getByTestId(testId).evaluate((el) => getComputedStyle(el).borderColor);
  const textOf = (testId: string) =>
    page.getByTestId(testId).evaluate((el) => getComputedStyle(el).color);
  for (const theme of ['dark', 'light']) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const accent = await tokenColour(page, '--accent');
    for (const button of ['add-animation', 'add-keyframe']) {
      await expect(page.getByTestId(button)).toHaveClass(/an-accent-button/);
      expect(await borderOf(button), `${button} border, ${theme}`).toBe(accent);
      expect(await textOf(button), `${button} text, ${theme}`).toBe(accent);
    }
    // A plain small button keeps the neutral style.
    expect(await textOf('clip-delete')).not.toBe(accent);
    await page.getByTestId('add-keyframe').hover();
    expect(await textOf('add-keyframe')).toBe(await tokenColour(page, '--accent-text'));
    await page.mouse.move(5, 5);
    if (theme === 'dark') await page.getByTestId('theme-toggle').click();
  }
});

test("a block's Animation section wears its category; Timing the time colour", async ({ page }) => {
  await openBlockScene(page, [appearJson('w', 1, 3, 'write', 'all')]);
  await blockLocator(page, 'w').click();
  await expect(page.getByTestId('block-animation-section')).toHaveAttribute('data-tone', 'appear');
  expect(await colourOf(page, 'block-animation-section', 'stripe')).toBe(
    await tokenColour(page, '--block-appear'),
  );
  await expect(page.getByTestId('block-timing-section')).toHaveAttribute('data-tone', 'timing');
  expect(await colourOf(page, 'block-timing-section', 'title')).toBe(
    await tokenColour(page, '--time'),
  );
});
