import { expect, test, type Page } from './test';
import { createRelation } from '../src/model';
import { disappearJson, openBlockScene } from './blockHelpers';
import { openWithProject, readExample } from './helpers';
import { selectClip } from './relationsHelpers';

/* A warning is a notice, not a problem (D177): the issues of what is selected are listed under
 * «Warnings», in the warning colour, when they are all warnings, and under «Problems», in the
 * danger red, as soon as one is an error; the timeline draws a relation's bands and arrow in the
 * same colour, and the relation editor its pairs. Red is for errors, which need an edit. In both
 * themes. */

/** Clip a (f1, a+b=c, 0–10 s) takes glyph 0 off screen at 1 s. */
const GONE = disappearJson('gone', 1, 0.5, 'fade_out', [0]);

/** a → b (f2, 2–8 s) at [3, 4]: it moves glyph 0, which is off screen by then — it appears out
 * of nowhere, a warning and nothing else. */
const WARNED = {
  id: 'r1',
  fromClipId: 'a',
  toClipId: 'b',
  offset: 1,
  duration: 1,
  easing: 'smooth',
  style: 'transform',
  pathArc: 0,
  pairs: [{ from: [0], to: [0], style: null }],
};

/** a → b at [5, 6] from glyph 99, which f1 does not have: an error. */
const BROKEN = { ...WARNED, id: 'r2', offset: 3, pairs: [{ from: [99], to: [1], style: null }] };

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

/** What is drawn of a section and of a relation on the timeline, as the browser paints it. */
const painted = (page: Page, section: string, relation: string) =>
  page.evaluate(
    ({ section, relation }) => {
      const at = (testId: string) => document.querySelector(`[data-testid="${testId}"]`)!;
      const style = (element: Element) => getComputedStyle(element);
      const card = at(section);
      return {
        title: style(card.querySelector('h3')!).color,
        stripe: style(card).borderLeftColor,
        band: style(at(`relation-window-${relation}`)).borderTopColor,
        sourceBand: style(at(`relation-source-window-${relation}`)).borderTopColor,
        arrow: style(at(`timeline-relation-${relation}`).querySelector('.tl-rel-arrow')!).stroke,
      };
    },
    { section, relation },
  );

/** The severity of each row of a list of issues, in order. */
const rowSeverities = (page: Page, list: string) =>
  page
    .getByTestId(list)
    .getByRole('listitem')
    .evaluateAll((rows) =>
      rows.map((row) => (row.classList.contains('is-error') ? 'error' : 'warning')),
    );

async function eachTheme(page: Page, check: (theme: string) => Promise<void>): Promise<void> {
  for (const theme of ['dark', 'light']) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await tokenColour(page, '--warning')).not.toBe(await tokenColour(page, '--danger'));
    await check(theme);
    if (theme === 'dark') await page.getByTestId('theme-toggle').click();
  }
}

test('a relation with only a warning is listed under Warnings and drawn in the warning colour', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openBlockScene(page, [GONE], { extra: { relations: [WARNED] } });
  await page.getByTestId('relation-window-r1').click();
  await expect(page.getByTestId('relation-properties')).toBeVisible();
  const section = page.getByTestId('relation-issues-section');
  await expect(page.getByTestId('relation-issues')).toContainText(
    'Source glyph 0 of "f1" is not on screen when the relation starts, so it appears out of nowhere.',
  );
  expect(await rowSeverities(page, 'relation-issues')).toEqual(['warning']);
  await eachTheme(page, async (theme) => {
    await expect(section).toHaveAttribute('data-tone', 'warnings');
    await expect(section.locator('h3')).toHaveText('Warnings');
    const warning = await tokenColour(page, '--warning');
    expect(await painted(page, 'relation-issues-section', 'r1'), theme).toEqual({
      title: warning,
      stripe: warning,
      band: warning,
      sourceBand: warning,
      arrow: warning,
    });
  });

  // The clip it leaves from says the same: its issues are the relation's warning.
  await selectClip(page, 'a');
  await expect(page.getByTestId('issues-section')).toHaveAttribute('data-tone', 'warnings');
  await expect(page.getByTestId('issues-section').locator('h3')).toHaveText('Warnings');
  expect(await rowSeverities(page, 'clip-issues')).toEqual(['warning']);
  expect(errors).toEqual([]);
});

test('a relation with an error stays under Problems and red; the clip lists its errors first', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openBlockScene(page, [GONE], { extra: { relations: [WARNED, BROKEN] } });
  await page.getByTestId('relation-window-r2').click();
  await expect(page.getByTestId('relation-properties')).toBeVisible();
  const section = page.getByTestId('relation-issues-section');
  await expect(page.getByTestId('relation-issues')).toContainText(
    'Glyph 99 does not exist in "f1"',
  );
  await eachTheme(page, async (theme) => {
    await expect(section).toHaveAttribute('data-tone', 'problems');
    await expect(section.locator('h3')).toHaveText('Problems');
    const danger = await tokenColour(page, '--danger');
    expect(await painted(page, 'relation-issues-section', 'r2'), theme).toEqual({
      title: danger,
      stripe: danger,
      band: danger,
      sourceBand: danger,
      arrow: danger,
    });
    // The warned relation beside it keeps the warning colour.
    const warning = await tokenColour(page, '--warning');
    const r1 = await painted(page, 'relation-issues-section', 'r1');
    expect([r1.band, r1.sourceBand, r1.arrow], theme).toEqual([warning, warning, warning]);
  });

  // Clip a takes part in both: Problems, the errors first, and its warning keeps its look.
  await selectClip(page, 'a');
  const clipSection = page.getByTestId('issues-section');
  await expect(clipSection).toHaveAttribute('data-tone', 'problems');
  await expect(clipSection.locator('h3')).toHaveText('Problems');
  const severities = await rowSeverities(page, 'clip-issues');
  expect(severities[0]).toBe('error');
  expect(severities.at(-1)).toBe('warning');
  expect(severities).toEqual([...severities].sort());
  const warningRow = page.getByTestId('clip-issues').locator('.an-issue.is-warning').last();
  await expect(warningRow).toContainText('appears out of nowhere');
  expect(await warningRow.locator('strong').evaluate((el) => getComputedStyle(el).color)).toBe(
    await tokenColour(page, '--warning'),
  );
  expect(errors).toEqual([]);
});

test('the relation editor marks a pair with only a warning in the warning colour, one with an error in red', async ({
  page,
}) => {
  await openBlockScene(page, [GONE], { extra: { relations: [WARNED, BROKEN] } });
  const open = async (relation: string) => {
    await page.getByTestId(`relation-window-${relation}`).dblclick();
    await expect(page.getByTestId('relation-editor')).toBeVisible();
  };
  const borderOf = (testId: string) =>
    page.getByTestId(testId).evaluate((el) => getComputedStyle(el).borderTopColor);

  await open('r1');
  await expect(page.getByTestId('rel-problems')).toContainText('appears out of nowhere');
  expect(await rowSeverities(page, 'rel-problems')).toEqual(['warning']);
  const pair = page.getByTestId('rel-pair-0');
  await expect(pair).toHaveClass(/\bis-warned\b/);
  await expect(pair).not.toHaveClass(/\bis-bad\b/);
  await expect(page.getByTestId('rel-from-glyph-0')).toHaveClass(/\bis-warned\b/);
  await expect(page.getByTestId('rel-to-glyph-0')).toHaveClass(/\bis-warned\b/);
  await expect.poll(() => borderOf('rel-pair-0')).toBe(await tokenColour(page, '--warning'));
  await page.getByTestId('rel-cancel').click();
  await expect(page.getByTestId('relation-editor')).toBeHidden();

  await open('r2');
  await expect(page.getByTestId('rel-problems')).toContainText('Glyph 99 does not exist');
  await expect(page.getByTestId('rel-pair-0')).toHaveClass(/\bis-bad\b/);
  await expect(page.getByTestId('rel-pair-0')).not.toHaveClass(/\bis-warned\b/);
  await expect.poll(() => borderOf('rel-pair-0')).toBe(await tokenColour(page, '--danger'));
});

test('a relation a file holds with a brace on a side is a warning that says how to remove it', async ({
  page,
}) => {
  // The brace under 1+2+3 (clip c_first) lends a copy of itself to the "+" of "6+15=21"
  // (c_total): a relation the editor no longer makes, which an older file may hold.
  const project = JSON.parse(readExample('braces.mfe.json')) as { relations: unknown[] };
  project.relations.push({
    ...createRelation('c_first', 'c_total', {
      style: 'copy',
      pairs: [{ from: [0], to: [1], style: null }],
    }),
    id: 'piece',
  });
  await openWithProject(page, JSON.stringify(project));
  await page.getByTestId('relation-window-piece').click();
  await expect(page.getByTestId('relation-properties')).toBeVisible();
  const issues = page.getByTestId('relation-issues');
  await expect(issues).toContainText(
    '"first" is a brace, one piece: a relation is between formulas and texts. This one still plays and exports, but it cannot be edited; delete it with Delete relation in the menu of its band on the timeline.',
  );
  expect(await rowSeverities(page, 'relation-issues')).toEqual(['warning']);
  await expect(page.getByTestId('relation-issues-section')).toHaveAttribute(
    'data-tone',
    'warnings',
  );
  const warning = await tokenColour(page, '--warning');
  expect((await painted(page, 'relation-issues-section', 'piece')).band).toBe(warning);
  // What it says to do: the band's menu deletes it.
  await page.getByTestId('relation-window-piece').click({ button: 'right' });
  await page.getByTestId('relation-menu-delete').click();
  await expect(page.getByTestId('relation-window-piece')).toHaveCount(0);
});
