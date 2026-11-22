/* Numbers that a file can bring and the fields would not take. A project made by hand, or by
 * another program, opens, says what is wrong with it, and the app goes on answering: nothing in
 * a file is a count of things to build without a limit. */
import { expect, test } from './test';
import { expectAppShown, openWithProject, readExample, type MfeWindow } from './helpers';
import type { Page } from '@playwright/test';

/** A project file as a program that edits it by hand sees it. */
interface RawProject {
  meta: { duration: number | null };
  formulas: { id: string; dashLength?: number }[];
  clips: { id: string; start: number; end: number }[];
  relations: { id: string; toClipId: string; offset: number; pathArc: number }[];
}

/** `name` of examples/, changed by `change` as a file edited by hand would be. */
function example(name: string, change: (raw: RawProject) => void): string {
  const raw = JSON.parse(readExample(name)) as RawProject;
  change(raw);
  return JSON.stringify(raw);
}

interface ReadIssue {
  severity: string;
  code: string;
  path: (string | number)[];
}

/** The errors the app finds in the file as it reads it: `code path`. */
const errorsOf = (page: Page, json: string): Promise<string[]> =>
  page.evaluate((text) => {
    const parsed = (window as MfeWindow).__mfe!.parseProject(text) as
      { ok: true; issues: ReadIssue[] } | { ok: false; error: string };
    if (!parsed.ok) return [`refused: ${parsed.error}`];
    return parsed.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${issue.code} ${issue.path.join('.')}`);
  }, json);

/** The app is on screen and answers: a press of → steps the playhead. */
async function expectAnswers(page: Page): Promise<void> {
  await expectAppShown(page);
  const time = () =>
    page.evaluate(
      () =>
        ((window as MfeWindow).__mfe!.useUiStore.getState() as unknown as { time: number }).time,
    );
  await page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(0));
  await page.getByTestId('preview-frame').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(time).toBeGreaterThan(0);
}

test('a dashed line whose dash is 1e-12 long opens, is drawn and says so', async ({ page }) => {
  const json = example('lines.mfe.json', (raw) => {
    raw.formulas.find((formula) => formula.id === 'f_kind_line1')!.dashLength = 1e-12;
  });
  await openWithProject(page, json);
  await expectAnswers(page);
  const errors = await errorsOf(page, json);
  expect(errors.filter((line) => line.startsWith('line-dash'))).toHaveLength(1);
  // The line is drawn, with the most dashes a line has.
  const dashes = () =>
    page.evaluate(() => {
      const mfe = (window as MfeWindow).__mfe!;
      const resolved = mfe.useRenderStore.getState().resolved.get('f_kind_line1') as
        { render: { glyphs: unknown[] } } | undefined;
      return resolved?.render.glyphs.length ?? -1;
    });
  await expect.poll(dashes).toBe(10_000);
});

test('a relation whose arc is 1e300 degrees opens and says so; its panel is drawn', async ({
  page,
}) => {
  const json = example('custom-paths.mfe.json', (raw) => {
    raw.relations.find((relation) => relation.id === 'r_sum_swap')!.pathArc = 1e300;
  });
  await openWithProject(page, json);
  const errors = await errorsOf(page, json);
  expect(errors.filter((line) => line.startsWith('path-arc'))).toEqual([
    'path-arc relations.0.pathArc',
  ]);
  // Its pairs have paths of their own: each row's mark compares its path with the arc.
  await page.evaluate(() =>
    (window as MfeWindow)
      .__mfe!.useUiStore.getState()
      .select({ kind: 'relation', id: 'r_sum_swap' }),
  );
  await expect(page.getByTestId('relation-pairs')).toBeVisible();
  await expectAnswers(page);
});

for (const [what, change, error] of [
  [
    'a scene 1e300 s long',
    (raw: RawProject) => {
      raw.meta.duration = 1e300;
    },
    'scene-length meta.duration',
  ],
  [
    'a scene 10,000 hours long',
    (raw: RawProject) => {
      raw.meta.duration = 36_000_000;
    },
    'scene-length meta.duration',
  ],
  [
    'a clip that ends at 1e15 s',
    (raw: RawProject) => {
      raw.clips[0]!.end = 1e15;
    },
    'scene-length clips.0.end',
  ],
] as const) {
  test(`${what} opens and says so; the timeline is drawn`, async ({ page }) => {
    const json = example('hello.mfe.json', change);
    await openWithProject(page, json);
    const errors = await errorsOf(page, json);
    expect(errors.filter((line) => line.startsWith('scene-length'))).toEqual([error]);
    await expectAnswers(page);
    // The ruler labels what a view holds, not the scene: a count a page can carry.
    const labels = await page.getByTestId('panel-timeline').locator('.tl-tick').count();
    expect(labels).toBeGreaterThan(0);
    expect(labels).toBeLessThanOrEqual(2001);
  });
}

test('Export → Python opens on a relation window that starts before the scene does', async ({
  page,
}) => {
  // What the timeline could leave before: a window out of place, 0.067 s before 0 s.
  const json = example('custom-paths.mfe.json', (raw) => {
    const relation = raw.relations.find((r) => r.id === 'r_sum_swap')!;
    const target = raw.clips.find((clip) => clip.id === relation.toClipId)!;
    relation.offset = -target.start - 0.066667;
  });
  await openWithProject(page, json);
  expect((await errorsOf(page, json)).some((line) => line.startsWith('relation-window'))).toBe(
    true,
  );
  await page.getByTestId('export-button-menu').click();
  await page.getByTestId('export-button-export-ce').click();
  await expect(page.getByTestId('export-python-code')).toContainText('from manim import *');
  await expect(page.getByTestId('export-python-failure')).toHaveCount(0);
  await expect(page.getByTestId('crash')).toHaveCount(0);
});
